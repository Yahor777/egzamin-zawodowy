#!/usr/bin/env python3
"""Parse official CKE written exam sheets (E.12, E.13, EE.08) + answer keys
into a JSON question bank with cropped figures.

Usage: python3 -I tools/parse_sheets.py <dir-with-E.12,E.13,EE.08> <out-dir>
Output: <out-dir>/questions.raw.json, <out-dir>/img/*.webp, report on stderr.
"""
import hashlib
import io
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import pymupdf
from PIL import Image

# Old (2013-2016) sheets use a font whose glyphs are mis-mapped; fix them.
MOJIBAKE = str.maketrans({
    "á": "ł", "Ċ": "ę", "Ī": "ż", "ü": "ć", "Ğ": "ś", "Ĩ": "ź", "Ĕ": "ń",
    "ĉ": "Ę", "ĝ": "Ś", "û": "Ć", "ų": "ł", "à": "Ł", "ħ": "ę",
})
MOJIBAKE_MARKERS = ("Ċ", "Ī", "Ğ")

GENERIC = str.maketrans({"": "–", "": "•", "Ω": "Ω"})

Q_RE = re.compile(r"^Zadanie\s+(\d{1,2})\.?\s*(.*)$")
ANS_RE = re.compile(r"^([A-D])\.\s*(.*)$")
ANS_SPLIT_RE = re.compile(r"\s{2,}(?=[B-D]\.\s)")
FOOTER_RE = re.compile(r"^(Strona \d+ z \d+|Więcej arkuszy znajdziesz.*|Układ graficzny.*|© CKE.*)$")

RENDER_ZOOM = 2.0
PAGE_TOP, PAGE_BOTTOM = 28, 815
LABELS_RE = re.compile(r"^(\s*[A-D]\.\s*)+$")


def sheet_id(path: Path) -> str:
    name = path.stem
    name = re.sub(r"_(kolor|k)$", "", name, flags=re.I)
    return name.lower()


def find_pairs(root: Path):
    sheets, keys = {}, {}
    for f in sorted(root.glob("*/*.pdf")):
        if "nie_ma" in f.name:
            continue
        sid = sheet_id(f)
        if re.search(r"_k\.pdf$", f.name, re.I):
            keys[sid] = f
        else:
            # prefer the colour version if both exist
            if sid not in sheets or "kolor" in f.name:
                sheets[sid] = f
    return sheets, keys


def parse_key(path: Path):
    """Answer key -> {n: 'A'..'D' or '*'} ('*' = annulled, point for everyone)."""
    text = subprocess.run(["pdftotext", "-layout", str(path), "-"],
                          capture_output=True, text=True, check=True).stdout
    ans = {}
    for m in re.finditer(r"(?<![\d.])(\d{1,2})\s+([A-D]|1\*)(?![\w])", text):
        n = int(m.group(1))
        if 1 <= n <= 40:
            ans.setdefault(n, "*" if m.group(2) == "1*" else m.group(2))
    return ans


def poppler_lines(path: Path):
    """Per-page raw lines from poppler (PyMuPDF silently drops some text)."""
    xml = subprocess.run(["pdftotext", "-bbox-layout", str(path), "-"],
                         capture_output=True, text=True, check=True).stdout
    xml = re.sub(r'xmlns="[^"]+"', "", xml, count=1)
    xml = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]", "", xml)
    xml = re.sub(r"<head>.*?</head>", "", xml, flags=re.S)
    root = ET.fromstring(xml)
    pages = []
    for pg in root.iter("page"):
        lines = []
        for ln in pg.iter("line"):
            words = [(float(w.get("xMin")), float(w.get("xMax")), w.text or "") for w in ln.iter("word")]
            if not words:
                continue
            txt, prev = "", None
            for x0, x1, t in words:
                if prev is not None:
                    txt += "    " if x0 - prev > 15 else " "
                txt += t
                prev = x1
            lines.append((float(ln.get("yMin")), float(ln.get("xMin")),
                          float(ln.get("yMax")), float(ln.get("xMax")), txt))
        pages.append(lines)
    return pages


def page_lines(raw, fix):
    """Return text lines [(y0, x0, y1, x1, text)] sorted in reading order."""
    out = []
    for x0_y0 in raw:
        y0, x0, y1, x1, t = x0_y0
        t = t.translate(GENERIC)
        if fix:
            t = t.translate(MOJIBAKE)
        t = t.strip()
        if not t:
            continue
        if y0 < PAGE_TOP or y1 > PAGE_BOTTOM or FOOTER_RE.match(t):
            continue
        out.append([y0, x0, y1, x1, t])
    # merge fragments on the same visual line (pdf may split "A." from its text)
    out.sort(key=lambda r: ((r[0] + r[2]) / 2, r[1]))
    rows = []
    for r in out:
        yc = (r[0] + r[2]) / 2
        if rows and abs(rows[-1][0] - yc) < 3.5:
            rows[-1][1].append(r)
        else:
            rows.append([yc, [r]])
    merged = []
    for _, rs in rows:
        rs.sort(key=lambda r: r[1])
        cur = list(rs[0])
        for r in rs[1:]:
            gap = r[1] - cur[3]
            cur[4] += ("    " if gap > 15 else " ") + r[4]
            cur[3] = max(cur[3], r[3])
            cur[0] = min(cur[0], r[0])
            cur[2] = max(cur[2], r[2])
        merged.append(cur)
    return merged


def page_media(page):
    """Rects of raster images and non-trivial vector drawings."""
    rects = []
    page_area = page.rect.width * page.rect.height
    for info in page.get_image_info():
        r = pymupdf.Rect(info["bbox"])
        # skip full-page scans (OCR'd sheets): the text layer carries the content
        if r.width > 4 and r.height > 4 and r.width * r.height < 0.4 * page_area:
            rects.append(r)
    for d in page.get_drawings():
        r = pymupdf.Rect(d["rect"])
        if r.width < 0.5 and r.height < 0.5:
            continue
        rects.append(r)
    return [r for r in rects if r.y1 > PAGE_TOP and r.y0 < PAGE_BOTTOM]


def cluster(rects, pad=6):
    """Union overlapping/nearby rects into clusters."""
    rects = [pymupdf.Rect(r) for r in rects]
    changed = True
    while changed:
        changed = False
        out = []
        while rects:
            r = rects.pop()
            grown = pymupdf.Rect(r.x0 - pad, r.y0 - pad, r.x1 + pad, r.y1 + pad)
            i = 0
            while i < len(rects):
                if grown.intersects(rects[i]):
                    r |= rects.pop(i)
                    grown = pymupdf.Rect(r.x0 - pad, r.y0 - pad, r.x1 + pad, r.y1 + pad)
                    changed = True
                else:
                    i += 1
            out.append(r)
        rects = out
    return rects


def render(page, rect, out_path: Path):
    clip = pymupdf.Rect(max(rect.x0 - 4, 0), max(rect.y0 - 4, 0),
                        min(rect.x1 + 4, page.rect.x1), min(rect.y1 + 4, page.rect.y1))
    pix = page.get_pixmap(matrix=pymupdf.Matrix(RENDER_ZOOM, RENDER_ZOOM), clip=clip)
    img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
    img.save(out_path, "WEBP", quality=82, method=6)
    return img.size


def parse_sheet(path: Path, img_dir: Path, sid: str):
    doc = pymupdf.open(path)
    full = "".join(p.get_text() for p in doc)
    fix = any(m in full for m in MOJIBAKE_MARKERS)

    # gather lines with page index
    items = []
    for pi, raw in enumerate(poppler_lines(path)):
        for y0, x0, y1, x1, t in page_lines(raw, fix):
            items.append((pi, y0, x0, y1, x1, t))

    # locate question headings
    heads = []
    for idx, (pi, y0, x0, y1, x1, t) in enumerate(items):
        m = Q_RE.match(t)
        if m and x0 < 120:
            n = int(m.group(1))
            if 1 <= n <= 40 and (not heads or heads[-1][1] < n <= heads[-1][1] + 3):
                heads.append((idx, n))
    questions = []
    for hi, (idx, n) in enumerate(heads):
        end = heads[hi + 1][0] if hi + 1 < len(heads) else len(items)
        seg = items[idx:end]
        first_rest = Q_RE.match(seg[0][5]).group(2)
        start_pi, start_y = seg[0][0], seg[0][1]
        if hi + 1 < len(heads):
            nxt = items[heads[hi + 1][0]]
            end_pi, end_y = nxt[0], nxt[1]
        else:
            end_pi, end_y = len(doc) - 1, PAGE_BOTTOM

        # regions on each page covered by this question
        regions = []
        for pi in range(start_pi, end_pi + 1):
            top = start_y if pi == start_pi else PAGE_TOP
            bot = end_y - 2 if pi == end_pi else PAGE_BOTTOM
            if bot - top > 4:
                regions.append((pi, pymupdf.Rect(0, top, doc[pi].rect.x1, bot)))

        # figures
        figs = []
        for pi, reg in regions:
            rs = [r for r in page_media(doc[pi]) if reg.intersects(r)]
            rs = [r & reg for r in rs]
            for c in cluster(rs):
                if c.width < 25 or c.height < 10:
                    continue
                figs.append((pi, c))
        figs.sort(key=lambda f: (f[0], f[1].y0, f[1].x0))
        if OCR_MODE and not figs:
            figs = ocr_figures(seg, regions)

        def in_fig(pi, y0, x0, y1, x1):
            for fpi, c in figs:
                if fpi == pi and c.contains(pymupdf.Rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1)):
                    return True
            return False

        stem, answers, cur = [], {}, None
        if first_rest:
            stem.append(first_rest)
        first_ans_pos = None
        for pi, y0, x0, y1, x1, t in seg[1:]:
            parts = ANS_SPLIT_RE.split(t)
            m0 = ANS_RE.match(parts[0])
            if m0 and (cur is None and m0.group(1) == "A" or cur is not None and ord(m0.group(1)) == ord(cur) + 1 or m0.group(1) in answers):
                for p in parts:
                    m = ANS_RE.match(p.strip())
                    if not m:
                        if cur:
                            answers[cur] += " " + p.strip()
                        continue
                    cur = m.group(1)
                    answers[cur] = m.group(2).strip()
                    if first_ans_pos is None:
                        first_ans_pos = (pi, y0)
                continue
            if in_fig(pi, y0, x0, y1, x1):
                continue
            if cur is None:
                stem.append(t)
            elif cur == "D" or len(answers) == 4:
                # trailing text after D: probably continuation of D (multi-line)
                if y0 - 20 < (first_ans_pos[1] if first_ans_pos else 0) + 200:
                    answers[cur] += " " + t
            else:
                answers[cur] += " " + t

        label_lines = [(pi, y0, x0, y1, x1) for pi, y0, x0, y1, x1, t in seg[1:] if LABELS_RE.match(t)]
        image_answers = bool(bool(figs) and (len(answers) < 4 or any(not v.strip() or LABELS_RE.match(v) for v in answers.values())) and (label_lines or len(answers) < 4))
        if image_answers:
            # answers are pictures labelled A-D: render the whole answer area as one figure per page
            stem_bottom = None
            for pi, y0, x0, y1, x1, t in seg:
                if Q_RE.match(t) or (t in stem or any(t in s_ for s_ in stem)):
                    stem_bottom = (pi, y1)
            boxes = {}
            for pi, c in figs:
                boxes.setdefault(pi, []).append(c)
            for pi, y0, x0, y1, x1 in label_lines:
                boxes.setdefault(pi, []).append(pymupdf.Rect(x0, y0, x1, y1))
            for pi, y0, x0, y1, x1, t in seg[1:]:
                if ANS_RE.match(t):
                    boxes.setdefault(pi, []).append(pymupdf.Rect(x0, y0, x1, y1))
            figs = []
            for pi, rs in sorted(boxes.items()):
                u = pymupdf.Rect(rs[0])
                for r in rs[1:]:
                    u |= r
                if stem_bottom and stem_bottom[0] == pi:
                    u.y0 = max(u.y0, stem_bottom[1] + 1) if u.y1 > stem_bottom[1] + 10 else u.y0
                u.x0 = min(u.x0, 36)
                figs.append((pi, u))
            answers = {k: "" for k in "ABCD"}
            first_ans_pos = None

        fig_entries = []
        for k, (pi, c) in enumerate(figs):
            where = "stem"
            if image_answers:
                where = "answers"
            elif first_ans_pos and (pi, c.y0) >= first_ans_pos:
                where = "answers"
            name = f"{sid}_{n:02d}_{k}.webp"
            w, h = render(doc[pi], c, img_dir / name)
            fig_entries.append({"src": f"img/{name}", "w": w, "h": h, "where": where})

        clean = lambda s: re.sub(r"\s+", " ", s).strip()
        stem_text = clean(" ".join(stem))
        questions.append({
            "n": n,
            "stem": stem_text,
            "answers": {k: clean(v) for k, v in sorted(answers.items())},
            "figures": fig_entries,
            "image_answers": image_answers,
        })
    return questions


PIC_RE = re.compile(r"rysun|zdjęci|przedstawion|ilustrac|schemat|tabel|zrzut|fotografi|na obrazie", re.I)


def ocr_figures(seg, regions):
    """Scanned sheets have no separate image objects: when the question refers to a
    picture/table/screenshot, crop the whole question area (stem + answers) per page."""
    stem_text = " ".join(t for *_, t in seg if not ANS_RE.match(t))
    if not PIC_RE.search(stem_text):
        return []
    out = []
    for pi, reg in regions:
        ys = [(y0, y1) for p2, y0, x0, y1, x1, t in seg if p2 == pi]
        if not ys:
            continue
        top = min(y for y, _ in ys) - 4
        bottom = min(reg.y1 - 2, max(y1 for _, y1 in ys) + 8)
        out.append((pi, pymupdf.Rect(28, top, reg.x1 - 28, bottom)))
    return out


OCR_MODE = False


def main():
    global OCR_MODE
    if "--ocr" in sys.argv:
        OCR_MODE = True
        sys.argv.remove("--ocr")
    root, out = Path(sys.argv[1]), Path(sys.argv[2])
    img_dir = out / "img"
    img_dir.mkdir(parents=True, exist_ok=True)
    sheets, keys = find_pairs(root)
    bank, report = [], []
    for sid, path in sorted(sheets.items()):
        if sid not in keys:
            report.append(f"{sid}: NO KEY, skipped")
            continue
        key = parse_key(keys[sid])
        qs = parse_sheet(path, img_dir, sid)
        m = re.match(r"(ee?)_(\d+)_(\d{4})_(\d{2})", sid)
        qual = {"e_12": "E.12", "e_13": "E.13", "ee_08": "EE.08"}[f"{m.group(1)}_{m.group(2)}"]
        session = f"{m.group(3)}-{m.group(4)}"
        bad = 0
        qs = [q for q in qs if key.get(q["n"]) != "*"]  # annulled by CKE
        for q in qs:
            q["correct"] = key.get(q["n"])
            q["source"] = {"qual": qual, "session": session, "sheet": sid, "n": q["n"]}
            ok = q["correct"] and len(q["answers"]) == 4 and q["stem"] or (q["figures"] and q["correct"])
            q["needs_review"] = not (q["correct"] and len(q["answers"]) == 4 and (q["stem"] or q["figures"])
                                     and (q["image_answers"] or all(q["answers"].values())))
            bad += q["needs_review"]
            bank.append(q)
        report.append(f"{sid}: {len(qs)} questions, key {len(key)}, needs_review {bad}")
    (out / "questions.raw.json").write_text(json.dumps(bank, ensure_ascii=False, indent=1))
    print("\n".join(report), file=sys.stderr)
    print(f"TOTAL {len(bank)} needs_review {sum(q['needs_review'] for q in bank)}", file=sys.stderr)


if __name__ == "__main__":
    main()

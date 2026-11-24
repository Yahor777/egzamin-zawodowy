#!/usr/bin/env python3
"""Merge agent-written overlays (translations, explanations, OCR fixes) into the bank.

Usage: python3 -I tools/merge_content.py <overlay-dir> app/public/data/questions.json
Each overlay file is {id: {ru, expl, stemFix?, answersFix?, topic?, doubt?, outdated?}}.
"""
import glob
import json
import sys
from pathlib import Path

TOPICS = {"hardware", "peripherals", "printers", "windows", "linux", "winserver", "addressing",
          "protocols", "netdevices", "cabling", "security", "basics", "law_bhp", "english", "other"}


def main():
    overlay_dir, bank_path = Path(sys.argv[1]), Path(sys.argv[2])
    bank = json.loads(bank_path.read_text())
    drop_file = Path(__file__).with_name("drop_ids.json")
    drop = set(json.loads(drop_file.read_text())) if drop_file.exists() else set()
    bank = [q for q in bank if q["id"] not in drop]  # broken by extraction, not recoverable
    by_id = {q["id"]: q for q in bank}
    applied = fixes = topics = 0
    for f in sorted(glob.glob(str(overlay_dir / "*.json"))):
        data = json.loads(Path(f).read_text())
        for qid, o in data.items():
            q = by_id.get(qid)
            if not q:
                continue
            applied += 1
            if o.get("stemFix"):
                q["stem"] = o["stemFix"].strip()
                fixes += 1
            af = o.get("answersFix")
            if isinstance(af, list) and len(af) == 4 and all(isinstance(a, str) for a in af) and not q.get("imageAnswers"):
                q["answers"] = [a.strip() for a in af]
                fixes += 1
            ru = o.get("ru")
            if isinstance(ru, dict) and ru.get("stem"):
                ans = ru.get("answers") if isinstance(ru.get("answers"), list) and len(ru["answers"]) == 4 else ["", "", "", ""]
                q["ru"] = {"stem": ru["stem"].strip(), "answers": [str(a).strip() for a in ans]}
            ex = o.get("expl")
            if isinstance(ex, dict) and (ex.get("pl") or ex.get("ru")):
                q["expl"] = {k: ex[k].strip() for k in ("pl", "ru") if ex.get(k)}
            t = o.get("topic")
            if t in TOPICS and (not q["topics"] or q["topics"][0] != t):
                q["topics"] = [t] + [x for x in q["topics"] if x != t][:2]
                topics += 1
            if o.get("doubt"):
                q["doubt"] = str(o["doubt"])[:300]
            if o.get("outdated"):
                q["outdated"] = True
    bank_path.write_text(json.dumps(bank, ensure_ascii=False, separators=(",", ":")))
    have = sum(1 for q in bank if q.get("expl"))
    print(f"applied {applied}, text fixes {fixes}, topic changes {topics}; with explanation {have}/{len(bank)}", file=sys.stderr)


if __name__ == "__main__":
    main()

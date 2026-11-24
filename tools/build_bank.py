#!/usr/bin/env python3
"""Deduplicate parsed questions, tag topics, emit the app's question bank.

Usage: python3 -I tools/build_bank.py <parse-out-dir> <app-public-dir>
"""
import hashlib
import json
import re
import shutil
import sys
import unicodedata
from pathlib import Path

from PIL import Image

# topic id -> keyword regexes (checked against lowercase stem + answers)
TOPICS = [
    ("addressing", r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|/\d{2}\b|masc|podsie|ipv6|ipv4|adres(ów|y|u)? (ip|rozgłosz|sieci|mac)|broadcast|cidr|klas[aey] [abc]\b|apipa|nat\b|vlsm"),
    ("cabling", r"skrętk|utp|ftp\b|stp\b|światłowod|kabel|kabl|okablowan|patch|rj-?45|8p8c|keystone|t568|gniazd.{0,20}sieciow|krosow|punkt.{0,10}abonenck|reflektometr|szaf.{0,5}(rack|dystrybuc)"),
    ("netdevices", r"topologi|100base|1000base|ramk|sniffer|wireshark|karta sieciow|przełącznik|ruter|router|switch|vlan|access point|punkt dostępow|most\b|koncentrator|hub\b|wzmacniak|stp\b|spanning|trunk|port mirroring|ssid|wpa|wep|802\.11|wi-?fi|bezprzewod|qos|ruting|routing|rip\b|ospf|bgp"),
    ("protocols", r"protok|tcp|udp|osi\b|iso/osi|warstw|dns\b|dhcp|http|ftp\b|smtp|pop3|imap|snmp|ssh\b|telnet|icmp|arp\b|ntp\b|ldap|port(y|u|em)? \d|rdp|smb\b|nfs\b|tftp|ipsec|vpn"),
    ("winserver", r"windows server|active directory|domen|kontroler|gpo|zasad(y|ach) grup|jednostk\w* organizacyjn|\bad\b|ds\b|iis\b|hyper-v|wds\b|rola\b|roli\b|lsa|kerberos|dfs\b|wsus|serwer(a|ze)? (dns|dhcp|plików|wydruku)|profil(e|u)? mobiln|udział|uprawnie.{0,15}ntfs|ntfs.{0,20}uprawn"),
    ("linux", r"linux|ubuntu|debian|bash|chmod|chown|sudo|\bls\b|grep|/etc/|/dev/|/home|apt(-get)?\b|mount|fstab|ifconfig|samba|grub|ext[234]|useradd|usermod|passwd|ps\b|kill|top\b|cron|tar\b|shell|powłok"),
    ("windows", r"windows|rejestr|regedit|hkey|hklm|hkcu|panel sterowania|menedżer|msconfig|cmd\b|powershell|ipconfig|netsh|diskpart|chkdsk|sfc\b|gpedit|ntfs|fat32|exfat|bitlocker|punkt przywracania|defragment|\.msc|konto (użytkownika|administrator)|uac\b|tracert|nslookup|net (user|use|share)"),
    ("printers", r"drukar|toner|tusz|atrament|głowic|bęben|fuser|grzałk|skaner|ploter|termotransfer|igłow|sublimac|druk\b|wydruk|dpi\b|ppm\b"),
    ("peripherals", r"monitor|matryc|lcd|led\b|projektor|klawiatur|mysz|touchpad|kamer|głośnik|słuchawk|usb\b|hdmi|displayport|dvi|vga|thunderbolt|bluetooth|firewire|ieee 1394|ups\b|zasilacz awaryjn|ps/2|lpt|com\b|rs-?232"),
    ("hardware", r"kondensator|narzędzi|lutown|multimetr|watomierz|schemac|laptop|procesor|cpu|rdzen|rdzeń|płyt\w* główn|chipset|gniazd|socket|lga|am[345]\b|bios|uefi|post\b|pami(ęć|ęci) (ram|cache|rom)|ram\b|ddr|dimm|so-dimm|dysk|hdd|ssd|nvme|m\.2|sata|ide\b|scsi|raid|partycj|mbr|gpt|karta graficzn|gpu|pci|zasilacz|atx|wentylator|chłodz|pasta termo|obudow|napęd|dvd|blu-ray|smart\b|mtbf"),
    ("security", r"wirus|malware|ransomware|trojan|robak|spyware|phishing|atak|ddos|dos\b|firewall|zapor|antywirus|szyfrow|hasł|uwierzytel|certyfikat|kopi\w* zapasow|backup|bezpieczeństw|exploit|keylogger|rootkit|spoofing|sniffing|ids\b|ips\b"),
    ("basics", r"binarn|ósemkow|szesnastkow|dwójkow|system(ie)? (dwójkow|binarn|szesnastkow|ósemkow|dziesiętn|heksadecym)|\(\w+\)(2|8|16)\b|bit\b|bajt|kib|mib|gib|u2\b|zmiennoprzecink|bramk|logiczn|ohm|wolt|amper|farad|rezystanc|napięci|prąd|moc\b|ascii|unicode|kod(owanie)? (znaków|bcd)"),
    ("law_bhp", r"licencj|gpl|freeware|shareware|oem|box\b|prawo|autorsk|bhp|ergonom|rozporządzen|ochrona danych|rodo|przepis|weee|ce\b|recykling|utylizac|pierwsz\w* pomoc|porażen|antystatyczn|esd\b|gaśnic"),
    ("english", r"\b(the|which|what|is|are|of|to)\b.*\b(the|of|and)\b"),
]
TOPIC_RE = [(t, re.compile(p)) for t, p in TOPICS]


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s).lower()
    s = re.sub(r"[^\w]+", " ", s)
    return s.strip()


def ahash(path: Path) -> str:
    im = Image.open(path).convert("L").resize((16, 16))
    px = list(im.tobytes())
    avg = sum(px) / len(px)
    return "".join("1" if p > avg else "0" for p in px)


def topics_for(q) -> list:
    text = (q["stem"] + " " + " ".join(q["answers"].values())).lower()
    found = [t for t, rx in TOPIC_RE if rx.search(text)]
    # english questions: stem mostly English words
    if "english" in found and not re.search(r"[ąćęłńóśźż]", q["stem"].lower()):
        found = ["english"]
    else:
        found = [t for t in found if t != "english"]
    return found[:3] or ["other"]


def main():
    src, pub = Path(sys.argv[1]), Path(sys.argv[2])
    raw = json.loads((src / "questions.raw.json").read_text())
    # newest first so the newest wording wins
    raw.sort(key=lambda q: q["source"]["session"], reverse=True)

    groups = {}
    for q in raw:
        correct_text = q["answers"].get(q["correct"], "")
        if q["image_answers"] or (q["figures"] and not q["stem"]):
            fig_h = "|".join(ahash(src / f["src"])[:128] for f in q["figures"][:1])
            key = norm(q["stem"]) + "#" + fig_h + "#" + q["correct"]
        else:
            key = norm(q["stem"]) + "#" + "|".join(sorted(norm(a) for a in q["answers"].values())) + "#" + norm(correct_text)
            if q["figures"]:
                key += "#" + ahash(src / q["figures"][0]["src"])[:64]
        groups.setdefault(key, []).append(q)

    out_img = pub / "img"
    if out_img.exists():
        shutil.rmtree(out_img)
    out_img.mkdir(parents=True)
    bank = []
    for key, qs in groups.items():
        q = qs[0]
        qid = hashlib.sha1(key.encode()).hexdigest()[:8]
        figs = []
        for f in q["figures"]:
            name = Path(f["src"]).name
            shutil.copy(src / f["src"], out_img / name)
            figs.append({"src": f"img/{name}", "w": f["w"], "h": f["h"], "where": f["where"]})
        sessions = sorted({f'{x["source"]["qual"]} {x["source"]["session"]}' for x in qs}, reverse=True)
        bank.append({
            "id": qid,
            "stem": q["stem"],
            "answers": [q["answers"].get(k, "") for k in "ABCD"],
            "correct": "ABCD".index(q["correct"]),
            "figures": figs,
            "imageAnswers": q["image_answers"],
            "topics": topics_for(q),
            "seen": sessions,
            "year": int(sessions[0].split()[1][:4]),
        })
    bank.sort(key=lambda b: (-b["year"], b["id"]))
    (pub / "data").mkdir(parents=True, exist_ok=True)
    (pub / "data" / "questions.json").write_text(json.dumps(bank, ensure_ascii=False, separators=(",", ":")))

    from collections import Counter
    c = Counter(t for b in bank for t in b["topics"])
    print(f"raw {len(raw)} -> unique {len(bank)}", file=sys.stderr)
    print(f"seen 2+ times: {sum(len(b['seen']) > 1 for b in bank)}", file=sys.stderr)
    print(dict(c.most_common()), file=sys.stderr)


if __name__ == "__main__":
    main()

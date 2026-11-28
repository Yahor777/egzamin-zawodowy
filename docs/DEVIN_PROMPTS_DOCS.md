# Промпты Devin: переделка документации (пакеты E1–E4)

Каждый промпт — отдельная сессия (режим Free / SWE-2.1). Файлы у пакетов не пересекаются.

---

## E1 — Linux

```text
INF.02 pack E1 — rewrite Linux docs for a beginner. Repo Yahor777/egzamin-zawodowy.
Work autonomously to the end; do not stop to ask questions — decide and note decisions in the PR.

SETUP
- Read AGENTS.md (mandatory rules). Branch devin/pack-e1 from claude/lucid-darwin-jey0v9, PR into claude/lucid-darwin-jey0v9. Never push to claude/lucid-darwin-jey0v9 or main.

FILES (only these): app/public/content/howto/linux-*.md except linux-users.md, plus app/public/content/practice/cheat-linux-server.md.

REFERENCE FORMAT: app/public/content/howto/linux-users.md — copy its structure and tone exactly.
The reader is a Russian-speaking student who does not know what "-m" or "-aG" mean. Text in Russian, Polish exam terms kept (as in CKE INF.02 sheets).

FOR EVERY FILE
1. "Как читать команду" — an annotated diagram of one typical command: program, options (minus + letter), option value, target.
2. "Какую программу брать" — table task → program → what the name stands for.
3. For each program: table option → what the letter stands for (English word, e.g. -r = recursive) → what it does → example. No bare command lists: every command line in a code block has a comment explaining it.
4. Config files (netplan YAML, dhcpd.conf, smb.conf, apache vhost, sshd_config, fstab…): show the full file with every line commented; explain indentation rules and what each key means.
5. "Частые ошибки" — the exact error text the simulator prints (copy it from src/sim/linux/*) and how to fix it.
6. "Как проверить" — command + expected output, i.e. what the examiner checks.
7. Typical CKE task wording in Polish → which commands solve it (look at work/ and app/public/content/practice/inf02-*.md for real wording).

VERIFY
- Every command from the docs must work in the Linux simulator. Add app/src/sim/linux/__tests__/docs-e1.test.ts (same harness as scenarios.test.ts) that runs each documented command and checks no "command not found"/"invalid option" etc. If a real-Linux command is missing or wrong in the simulator, fix the simulator (src/sim/linux/*) with tests. Register the test in npm run test:sim.
- In app/: npx tsc -b, npm run test:sim, npm run build — all green.
- PR: Playwright screenshots (iPhone 14) of 2 rewritten docs (route #/doc/<slug>), list of simulator fixes, list of what is not done.
```

---

## E2 — Windows 11 + Windows Server

```text
INF.02 pack E2 — rewrite Windows and Windows Server docs for a beginner. Repo Yahor777/egzamin-zawodowy.
Work autonomously to the end; do not stop to ask questions — decide and note decisions in the PR.

SETUP
- Read AGENTS.md (mandatory rules). Branch devin/pack-e2 from claude/lucid-darwin-jey0v9, PR into claude/lucid-darwin-jey0v9. Never push to claude/lucid-darwin-jey0v9 or main.

FILES (only these): app/public/content/howto/windows-*.md, app/public/content/howto/winserver-*.md, app/public/content/practice/cheat-windows-client.md, app/public/content/practice/cheat-windows-server.md.

REFERENCE FORMAT: app/public/content/howto/linux-users.md — same structure and tone. Reader is a Russian-speaking beginner. Text in Russian; every Windows UI name exactly in Polish as in the real Polish Windows 11 / Windows Server 2022 (and as already used in our simulator src/sim/pc/*).

FOR EVERY FILE
1. Path to each window, step by step, as a numbered list: where to click (Menedżer serwera → Narzędzia → …), what the window/tab is called.
2. For every field, checkbox and option the CKE tasks use: what it means in plain Russian and what to enter in a typical task (example values). Explain the concept first in 2–3 sentences (e.g. what a DHCP scope / zastrzeżenie / GPO link / NTFS vs share permissions is and why both apply).
3. Commands (cmd, PowerShell, netsh, net user, net use, icacls, ipconfig, ftp, .bat): annotated diagram "как читать команду" + table of switches (/add, /domain, /grant, -Name…) with meaning; every command line commented.
4. "Частые ошибки" — the exact message our simulator shows (src/sim/pc/*) and the fix.
5. "Как проверить" — what the examiner checks and how to see it (window, command + expected output).
6. Typical CKE task wording in Polish → which steps solve it (see work/ and app/public/content/practice/inf02-*.md).

VERIFY
- Every command in the docs must work in our Windows shells (src/sim/pc/shell.ts, shell-srv.ts, batch.ts). Add app/src/sim/pc/__tests__/docs-e2.test.ts running each documented command headlessly; fix the simulator (with tests) where a real command is missing or wrong. Every UI path in the docs must exist in our simulator — if it does not, fix the doc or note it in the PR.
- In app/: npx tsc -b, npm run test:sim, npm run build — all green.
- PR: Playwright screenshots (iPhone 14) of 2 rewritten docs (route #/doc/<slug>), list of simulator fixes, list of what is not done.
```

---

## E3 — Сеть: роутер, свитч, подсети, стол

```text
INF.02 pack E3 — rewrite network docs for a beginner. Repo Yahor777/egzamin-zawodowy.
Work autonomously to the end; do not stop to ask questions — decide and note decisions in the PR.

SETUP
- Read AGENTS.md (mandatory rules). Branch devin/pack-e3 from claude/lucid-darwin-jey0v9, PR into claude/lucid-darwin-jey0v9. Never push to claude/lucid-darwin-jey0v9 or main.

FILES (only these): app/public/content/howto/router.md, router-wifi.md, switch.md, switch-t2500g.md, draytek.md, subnets.md, bench.md, app/public/content/practice/cheat-router-switch.md.

REFERENCE FORMAT: app/public/content/howto/linux-users.md — same structure and tone. Reader is a Russian-speaking beginner. Text in Russian; menu/field names exactly as in our simulators (src/sim/router, switch, draytek, jetstream), which copy the real TP-Link / DrayTek UIs.

FOR EVERY FILE
1. Concept first, plainly: what is a VLAN (tagged/untagged, PVID, trunk), DHCP pool, NAT/WAN, static route, SSID/WPA2, management IP — with a small ASCII diagram of the network from a typical CKE sheet.
2. Path to each page (menu → submenu) and EVERY field on it: meaning in Russian, what to enter in a typical task, typical mistake.
3. Docs for both school hardware (DrayTek Vigor2927 + TP-Link T2500G — what the student has at ZSE Rzeszów) and TP-Link WR840N/SG108E: make clear which section is for which; say how to switch in Settings → Оборудование.
4. subnets.md: step-by-step calculation method with 3 fully worked examples (mask from prefix, network/broadcast/host range, splitting into subnets), binary shown.
5. bench.md: how to cable the desk, what each "Почему не открывается" diagnosis means and how to fix it.
6. "Частые ошибки" with the exact message our simulator shows, and "Как проверить" (ping/ipconfig from a PC, what the examiner checks).

VERIFY
- Every page/field named in the docs must exist in our simulators; if not, fix the doc (or the simulator, with tests) and list it in the PR.
- In app/: npx tsc -b, npm run test:sim, npm run build — all green.
- PR: Playwright screenshots (iPhone 14) of 2 rewritten docs (route #/doc/<slug>), list of what is not done.
```

---

## E4 — Железо, смета, стратегия + польские версии документации

```text
INF.02 pack E4 — hardware/cost docs for a beginner + Polish versions of docs. Repo Yahor777/egzamin-zawodowy.
Work autonomously to the end; do not stop to ask questions — decide and note decisions in the PR.

SETUP
- Read AGENTS.md (mandatory rules). Branch devin/pack-e4 from claude/lucid-darwin-jey0v9, PR into claude/lucid-darwin-jey0v9. Never push to claude/lucid-darwin-jey0v9 or main.

PART 1 — rewrite (only these files): app/public/content/howto/hardware-ident.md, kosztorys.md, app/public/content/practice/cheat-hardware-cabling.md, cheat-exam-strategy.md, cheat-frequency.md.
Reference format: app/public/content/howto/linux-users.md. Reader is a Russian-speaking beginner.
- hardware-ident: how to recognise every component/port/connector/cable that appears in CKE sheets (work/ texts), what each marking means (e.g. DDR4-3200 CL16, SATA III, PCIe x16, Cat 6 U/UTP, T568B), with a table "маркировка → что значит → как отвечать в задании".
- kosztorys: the exact table format CKE expects, how to compute netto/VAT/brutto with 2 fully worked examples, rounding rules, typical mistakes.
- cheat-hardware-cabling: crimping T568A/B step by step with colour order, tester results meaning, BHP.
- strategy/frequency: keep the data, explain how to use it in Russian plainly.

PART 2 — Polish versions of docs:
- The docs viewer (find it: route #/doc/<slug>, src/pages/Doc*.tsx or similar) must show <slug>.pl.md when the RU/PL switch (src/lib/i18n, src/lib/store.ts) is PL and that file exists, otherwise the Russian file.
- Write Polish versions (<slug>.pl.md) for: the 5 files from PART 1 (after rewriting them) and howto/linux-users.md. Terminology exactly as in CKE INF.02 sheets. Do NOT touch the files packs E1–E3 are rewriting right now (howto/linux-* except linux-users, windows-*, winserver-*, router*, switch*, draytek, subnets, bench, cheat-linux-server, cheat-windows-*, cheat-router-switch).
- Add a test that every <slug>.pl.md has a matching <slug>.md and contains no Cyrillic.

VERIFY
- In app/: npx tsc -b, npm run test:sim, npm run build — all green.
- PR: Playwright screenshots (iPhone 14) of 1 rewritten doc in RU and 1 doc in PL, list of what is not done.
```

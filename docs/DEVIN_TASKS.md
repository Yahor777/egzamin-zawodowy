# Задания для Devin

Перед любым заданием прочитай `AGENTS.md` (ветки, команды, правила). Каждое задание — отдельная сессия,
ветка `devin/<имя>` от `claude/lucid-darwin-jey0v9`, PR в `claude/lucid-darwin-jey0v9`.
Критерий готовности для всех: `npx tsc -b` чисто, `npm run test:sim` зелёный, `npm run build` проходит,
в PR — скриншоты Playwright (iPhone 14 и 1280 px) изменённых экранов и список того, что не сделано.

Порядок — по ценности для экзамена.

---

## 1. Школьное оборудование во всех листах  (`devin/school-labs`)
**Зачем:** в школе ученика стоят DrayTek Vigor2927 и TP-Link JetStream T2500G (`src/sim/draytek`, `src/sim/jetstream`,
выбор в `src/sim/models.ts`, настройка «Оборудование» в Settings). Сейчас на обоих вариантах проверены только 2 листа.
**Сделать:**
- В `src/sim/labs/__tests__/school.test.ts` прогонять эталонные решения **всех** листов (`LABS`) и заданий (`drills`)
  с роутером/свитчом школьных моделей. Где решение опирается на заводские адреса TP-Link (192.168.0.1) или номера портов
  (`router:lan1` vs P1–P6, 8 vs 10 портов свитча) — сделать решения/проверки независимыми от модели.
- В текстах подсказок (`hint_ru`) и документации, где упоминаются меню TP-Link, добавить вариант для DrayTek/T2500G
  (подсказка выбирается по модели устройства в текущем сохранении).
- В диагностике «Почему» (`src/sim/bench/diagnose.ts`) порты DrayTek называть P1…P6, а не «LAN N».
**Готово, когда:** все листы и задания решаются на 100 % на обоих профилях оборудования.

## 2. Сервер печати Windows Server  (`devin/print-server`)
**Зачем:** урок 11 курса WS2022 ZSE и листы CKE (роль «Usługi drukowania i zarządzania dokumentami»).
**Сделать:** в `src/sim/pc/*` — роль и консоль «Zarządzanie drukowaniem» (Serwery wydruku → Drukarki, Sterowniki, Porty;
«Dodaj drukarkę…» — мастер с портом TCP/IP по адресу принтера со стола `printer`), вкладка «Udostępnianie» в свойствах
принтера (nazwa udziału), права «Drukuj/Zarządzaj dokumentami». На клиенте Windows 11: «Dodaj drukarkę» → `\\SERWER\drukarka`
(через существующую модель SMB `smb.ts`), печать тестовой страницы попадает в очередь на сервере.
Задание `ws-print` в реестре + эталонное решение + тест. Документация `public/content/howto/winserver-print.md`.
Сверка названий — по уроку 11 (адрес в `work/refs/URLS.md`).

## 3. Сверка оставшихся экранов Windows Server со школьными скриншотами  (`devin/ws-fidelity`)
**Сделать:** по урокам ZSE WS2022/2019 (адреса в `work/refs/URLS.md`, скриншоты скачивать только во временную папку)
сравнить и исправить подписи, порядок полей, значения по умолчанию:
редактор GPO (дерево «Konfiguracja komputera/użytkownika → Zasady → …»), «Zaawansowane ustawienia zabezpieczeń»
(вкладки Uprawnienia, Inspekcja, Dostęp czynny — добавить недостающие как в оригинале), FSRM (szablony przydziałów,
osłony plików, zaawansowane strony kreatora). Обновить `docs/FIDELITY.md` (что исправлено/что осталось).

## 4. FTP-клиент  (`devin/ftp-client`)
**Сделать:** в Windows-симуляторе команда `ftp` (open, user, ls/dir, get, put, cd, bye; ошибки 530/550 как в реальном IIS FTP)
и `ftp://адрес` в Edge (список файлов), с учётом настроек FTP-сайта/публикации IIS (`ServerState.iis`: привязка,
uwierzytelnianie podstawowe/anonimowe, reguły autoryzacji, ścieżka fizyczna, права NTFS через `smb-vfs.ts`).
Задание `ws-ftp` + решение + тест.

## 5. Linux: статические маршруты  (`devin/linux-routes`)
**Сделать:** в `src/sim/linux/*` — `ip route add/del`, `routes:` в netplan (не только default), `route -n`, `ip r`;
в `src/sim/net.ts` маршруты Linux участвуют в выборе next hop (как у роутера/Windows). Сценарии в
`src/sim/linux/__tests__/scenarios.test.ts` + тест сети в `labs2.test.ts`.

## 6. Свитч T2500G: running vs saved config  (`devin/jetstream-save`)
**Сделать:** изменения в `src/sim/jetstream/*` применяются сразу, но после перезагрузки (кнопка на столе или System Tools → Reboot)
без «Save Config» возвращается сохранённая конфигурация, как на реальном устройстве. Предупреждение о несохранённых изменениях.
Тест в `school.test.ts`.

## 7. Польский язык там, где сейчас только русский  (`devin/pl-texts`)
**Сделать:** цели шагов пути (`public/content/path/curriculum.json` → поля `objective_pl`), объяснения «Почему»
(`src/sim/bench/diagnose.ts`), подписи страниц шага (`src/path/*`) — переводы на польский, переключатель PL/RU
(`src/lib/i18n`) должен переключать их. Терминология — как в листах CKE.

## 8. VPN в RRAS  (`devin/rras-vpn`) — низкий приоритет
**Сделать:** вариант «Dostęp zdalny (połączenie telefoniczne lub sieć VPN)» в мастере RRAS (`src/sim/pc/rras*.ts`, `apps-server*.tsx`),
пул адресов, на клиенте Windows 11 — «Dodaj połączenie VPN» в Ustawieniach и подключение по PPTP/SSTP (симуляция).
Только если задания 1–7 сделаны.

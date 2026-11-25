# Windows Server: IIS — сайт, порт, привязка, брандмауэр

## 1. Установка и первая проверка

*Dodaj role i funkcje* → **Serwer sieci Web (IIS)** → *Zainstaluj*. Папка `C:\inetpub\wwwroot` и страница `iisstart.htm` создаются сами. На сервере и с клиента: Edge → `http://IP-сервера/` показывает «Internet Information Services».

## 2. Свой сайт

1. Папка: `mkdir C:\sites\firma` (cmd на сервере).
2. Страница: **Notatnik** → текст `<h1>Witamy</h1>` → *Plik → Zapisz jako…* → тип **Wszystkie pliki** → `C:\sites\firma\index.html` (иначе сохранится `index.html.txt`!).
3. `inetmgr` → *Witryny* → ПКМ → **Dodaj witrynę sieci Web…**: *Nazwa witryny*, *Ścieżka fizyczna* `C:\sites\firma`, *Typ* http, *Adres IP* «Wszystkie nieprzypisane», **Port** (например 8080), *Nazwa hosta* (если нужна).
4. Документ по умолчанию: *Dokument domyślny* (index.html, Default.htm, iisstart.htm …).

Одну пару IP+порт+имя хоста не могут занимать два работающих сайта: *Default Web Site* занимает порт 80 — либо останови его, либо свой сайт поставь на другой порт / имя хоста.

## 3. Брандмауэр сервера

Роль IIS открывает только **80 и 443**. Порт 8080 снаружи закрыт: пакеты молча отбрасываются → у клиента **ERR_CONNECTION_TIMED_OUT**.

`wf.msc` → *Reguły przychodzące* → *Nowa reguła…* → **Port** → TCP, *Określone porty lokalne*: `8080` → *Zezwalaj na połączenie* → профили → имя.

## 4. Что показывает Edge (и что это значит)

| Что вижу | Причина |
|---|---|
| Страница сайта | всё верно |
| `ERR_CONNECTION_TIMED_OUT` | брандмауэр сервера блокирует порт, либо сервер/кабель |
| `ERR_CONNECTION_REFUSED` | на порту никто не слушает: роль IIS не установлена, сайт *Zatrzymana*, другой порт |
| `DNS_PROBE_FINISHED_NXDOMAIN` | имени нет в DNS (*Nowy host (A)* в зоне) или клиент не использует DNS сервера |
| **HTTP Error 403.14 – Forbidden** | в папке нет документа по умолчанию, а *Przeglądanie katalogów* выключено |
| **HTTP Error 404.0 – Not Found** | нет файла / неверный путь |
| **400 Bad Request – Invalid Hostname** | у сайта привязка к имени хоста, а ты зашёл по IP или другому имени |
| **503 Service Unavailable** | остановлен пул приложений сайта |

Подробные ошибки (с «Najbardziej prawdopodobne przyczyny») IIS показывает только при запросе с самого сервера (`http://localhost:8080/`); удалённому клиенту — короткие страницы.

## 5. Имя вместо IP

В `dnsmgmt.msc`: зона → *Nowy host (A)*: `www` → IP сервера. На клиенте DNS = IP сервера → Edge: `http://www.firma.local:8080/`. Если в привязке сайта указан *Nazwa hosta*, то заходить нужно именно по этому имени.

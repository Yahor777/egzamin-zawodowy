# Сетевые модели и протоколы (Modele sieciowe i protokoły)

## Модель OSI (model ISO/OSI)
Разработана **ISO** (International Organization for Standardization); 7 уровней (warstw). Протокол (protokół) — набор правил передачи информации.

| № | Уровень (warstwa) | PDU (jednostka danych) | Устройства | Протоколы/примеры |
|---|---|---|---|---|
| 7 | Прикладной (aplikacji) | данные (dane) | шлюз прикладной, прокси | HTTP(S), FTP, SMTP, POP3, IMAP, DNS, DHCP, SNMP, SSH, Telnet, RDP |
| 6 | Представления (prezentacji) | данные | — | кодирование, шифрование, сжатие (JPEG, ASCII, TLS частично) |
| 5 | Сеансовый (sesji) | данные | — | управление сеансом (NetBIOS, RPC) |
| 4 | Транспортный (transportowa) | **сегмент** (segment) / датаграмма UDP | — | **TCP, UDP** |
| 3 | Сетевой (sieciowa) | **пакет** (pakiet) | **маршрутизатор (ruter)**, коммутатор L3 | **IP**, ICMP, IGMP, ARP*, IPsec, RIP/OSPF |
| 2 | Канальный (łącza danych) | **кадр** (ramka) | **коммутатор (przełącznik)**, **мост (most)**, сетевая карта, AP | Ethernet 802.3, Wi‑Fi 802.11, PPP; адрес **MAC**; подуровни **LLC** и **MAC** |
| 1 | Физический (fizyczna) | **бит** | **концентратор (hub)**, повторитель (wzmacniak/regenerator), кабели, модем | сигналы, разъёмы, кодирование линии |

\* ARP связывает уровни 3 и 2 (отображает IP → MAC).

- **Инкапсуляция (enkapsulacja)** — добавление заголовков каждого уровня к данным при движении вниз; декапсуляция — снятие при приёме.
- Заголовок кадра 802.3 содержит **MAC-адреса**; контроль ошибок кадра — **CRC** (поле FCS).
- Мнемоника снизу вверх: «Please Do Not Throw Sausage Pizza Away».

## Модель TCP/IP (DoD)
| TCP/IP | Соответствует OSI | Протоколы |
|---|---|---|
| Прикладной (aplikacji) | 5–7 | DNS, HTTP, FTP, SMTP, DHCP, SNMP, SSH |
| Транспортный (transportowa) | 4 | TCP, UDP |
| Интернета (Internetu / sieciowa) | 3 | **IP, ICMP, IGMP**, (банк: также **RIP**) |
| Доступа к сети (dostępu do sieci) | 1–2 | Ethernet, Wi‑Fi, ARP |

Пары из банка: «DNS – warstwa aplikacji», «ICMP – warstwa Internetu», «IGMP – warstwa Internetu», «RIP – warstwa internetu». Набор при открытии страницы: **HTTP, TCP, IP**.

## TCP vs UDP
| | TCP (Transmission Control Protocol) | UDP (User Datagram Protocol) |
|---|---|---|
| Соединение | **с установлением соединения (połączeniowy)** | **без соединения (bezpołączeniowy)** |
| Надёжность | подтверждения ACK, повторы, порядок | нет гарантий доставки |
| Механизмы | **sequence number, acknowledgment number**, окно, флаги SYN/ACK/FIN/RST/PSH/URG | только порты, длина, **контрольная сумма (suma kontrolna)** |
| Скорость | медленнее, больше заголовок (20 B) | быстрее, заголовок 8 B |
| Примеры | HTTP, FTP, SMTP, SSH, POP3, IMAP, RDP | DNS-запросы, DHCP, TFTP, SNMP, NTP, VoIP/RTP, стриминг |

- Тройное рукопожатие (three-way handshake): **SYN → SYN-ACK → ACK**.
- Флаг **ACK** — подтверждение получения данных. Сегментация данных — транспортный уровень.
- Заголовок UDP: порт источника, порт назначения, длина, **контрольная сумма**.

## Хорошо известные порты (porty dobrze znane, 0–1023)
| Порт | Протокол | Транспорт | Назначение |
|---|---|---|---|
| **20** | FTP-data | TCP | передача данных FTP |
| **21** | FTP | TCP | **команды (sterowanie)** FTP |
| **22** | SSH / SFTP / SCP | TCP | шифрованный терминал |
| **23** | Telnet | TCP | нешифрованный терминал |
| **25** | SMTP | TCP | отправка почты (587 submission, 465 SMTPS) |
| **53** | DNS | UDP/TCP | имена → IP |
| **67/68** | DHCP (сервер/клиент) | UDP | автоконфигурация |
| 69 | TFTP | UDP | простая передача файлов |
| **80** | HTTP | TCP | WWW |
| **110** | POP3 | TCP | приём почты (995 POP3S) |
| 123 | NTP | UDP | синхронизация времени |
| 137–139 | NetBIOS | UDP/TCP | имена Windows |
| **143** | IMAP | TCP | приём почты (993 IMAPS) |
| **161/162** | SNMP / SNMP trap | UDP | управление устройствами |
| 389 / 636 | LDAP / LDAPS | TCP | каталог |
| **443** | HTTPS | TCP | WWW шифрованный (TLS) |
| 445 | SMB/CIFS | TCP | общие файлы Windows |
| 1194 | OpenVPN | UDP | VPN |
| 1723 | PPTP | TCP | VPN |
| 1812/1813 | RADIUS | UDP | аутентификация |
| 3306 | MySQL | TCP | БД |
| **3389** | **RDP** | TCP | удалённый рабочий стол Windows |
| 5060 | SIP | UDP/TCP | VoIP сигнализация |
| 5900 | VNC | TCP | удалённый экран |
| 8080 | HTTP-alt | TCP | прокси/альтернативный WWW |

- Порт в URL: `http://www.adres_serwera.pl:22` — **порт, отличный от стандартного** для услуги.
- Apache `Listen 8012` → открыть `http://localhost:8012`.
- Чтобы заблокировать/пропустить FTP — порты **20 и 21**.

## DNS (Domain Name System)
- Перевод имён (nazw domenowych, mnemonicznych) в IP. Порт 53. Сервер в Linux — **BIND** (named).
- Записи (rekordy):
  - **A** — имя → IPv4 (32 бита); **AAAA** — имя → IPv6.
  - **CNAME** — псевдоним (alias) для записи A.
  - **MX** — почтовый сервер домена.
  - **NS** — сервер имён; создаётся **автоматически** при создании зоны прямого просмотра (Windows Server) вместе с SOA.
  - **PTR** — IP → имя (зона обратного просмотра, strefa wyszukiwania wstecznego).
  - **SOA** — начало полномочий зоны; SRV — службы (AD).
- Зона прямого просмотра (strefa wyszukiwania do przodu): имя → IP; `nslookup host.domena.com` проверяет её.
- Active Directory **требует DNS**. Клиент для входа в домен должен иметь DNS = IP контроллера домена.
- Windows: `ipconfig /displaydns` — кэш DNS; `/flushdns` — очистить кэш; `/registerdns` — обновить аренду DHCP и перерегистрировать имена в DNS.

## DHCP (Dynamic Host Configuration Protocol)
- Порты UDP 67 (сервер) / 68 (клиент). Выдаёт IP, маску, шлюз, DNS, время аренды.
- Процесс **DORA**: **D**iscover (клиент, broadcast) → **O**ffer (сервер) → **R**equest (клиент) → **A**cknowledge (сервер, DHCPACK).
- Понятия: область/пул (zakres, scope), исключения (wykluczenia), **резервирование по MAC (zastrzeżenie)**, аренда (dzierżawa), опции (brama, DNS).
- Windows Server: роль «Serwer DHCP»; красная стрелка/значок на области — **область неактивна**.
- Linux: `sudo apt-get install isc-dhcp-server`, конфиг `dhcpd.conf` (`range 176.16.20.50 176.16.20.250;`).
- Проверка работы DHCP: `ipconfig /release` + `ipconfig /renew`.

## HTTP / HTTPS
- HTTP (Hypertext Transfer Protocol) — передача гипертекста, порт 80; сервер WWW (Apache, IIS, nginx).
- HTTPS — HTTP поверх **TLS/SSL**, порт **443**, шифрование (банк, приватность).
- Коды ответов: 200 OK, 301/302 перенаправление, 400 Bad Request, 401 Unauthorized, **403 Forbidden — нет прав к ресурсу**, 404 Not Found, 500 ошибка сервера.

## FTP, TFTP, FTPS, SFTP
- FTP (File Transfer Protocol) — передача файлов клиент-сервер, порты **21 (команды)** и **20 (данные)**; режимы **активный и пассивный**. Адрес: `ftp://ftp.nazwa.pl/`.
- Анонимный вход не работает, а с логином работает → **отключена анонимная аутентификация**.
- Windows Server: FTP входит в роль **Serwer sieci Web (IIS)**.
- **TFTP** — без соединения (UDP 69), без аутентификации.
- **FTPS** — FTP + SSL/TLS («S» = шифрование). **SFTP** — передача файлов поверх SSH.

## Почта: SMTP, POP3, IMAP
- **SMTP** (Simple Mail Transfer Protocol, 25) — **отправка** и пересылка почты между серверами.
- **POP3** (Post Office Protocol, 110) — **приём**: загружает письма на компьютер (обычно удаляет с сервера).
- **IMAP** (143) — приём с синхронизацией; сначала скачивает **только заголовки**, тело и вложения — после открытия письма.

## Удалённый доступ: SSH, Telnet, RDP, VNC
- **SSH** (Secure Shell, 22) — **шифрованный** терминал, безопасная удалённая работа; семейство с общим шифрованием (SSH, SCP, SFTP).
- **Telnet** (23) — удалённый терминал, **без шифрования**, только текст.
- **RDP** (Remote Desktop Protocol, 3389) — Pulpit zdalny Windows.
- **VNC** (RealVNC, TightVNC) — нужен **IP-адрес** и порт (5900).

## Служебные протоколы
- **ARP** (Address Resolution Protocol) — **IP → MAC** (48 бит); `arp -a` — таблица ARP. **RARP** — MAC → IP.
- **ICMP** (Internet Control Message Protocol) — контроль и сообщения об ошибках IP, использует **ping** и tracert. TTL = 0 → роутер отбрасывает пакет и шлёт ICMP Time Exceeded.
- **IGMP** — хосты сообщают роутеру о вступлении/выходе из **группы multicast**.
- **SNMP** (Simple Network Management Protocol, UDP 161/162) — мониторинг и конфигурация сетевых устройств; менеджер ↔ агент, база **MIB**; **trap** — агент сам сообщает менеджеру о событии. SNMPv3 — с шифрованием. MRTG — графики трафика по SNMP.
- **NTP** (123) — **синхронизация времени**.
- **LDAP** (389) — доступ к службам каталогов (AD, OpenLDAP). Атрибуты: `cn` — общее имя, **`sn` — фамилия (nazwisko)**, `givenName` — имя, `ou` — подразделение, `dc` — компонент домена, `uid`.
- **RADIUS** — централизованная аутентификация (Wi‑Fi WPA2-Enterprise, 802.1X).
- **SMB** (Server Message Block, IBM/Microsoft) — общий доступ к файлам/принтерам; в Linux — **Samba** (smbd, smb.conf). NFS — Unix. **NetBEUI** — только в сетях Microsoft.
- **SIP** (Session Initiation Protocol) — сигнализация/установление сеансов **VoIP**; RTP — голосовой поток. Телефон PSTN → **шлюз VoIP (bramka VoIP)**.
- **QoS** (Quality of Service) — приоритизация трафика (VoIP выше).
- Прочие: IRC — текстовый чат; BitTorrent — распределённая передача файлов P2P; X.25 — старая пакетная сеть ≤ 2 Мбит/с; **IETF** публикует документы **RFC**.

## VPN (Virtual Private Network)
- Защищённый **туннель (tunelowanie)** через публичную сеть; узлы сети прозрачны для пакетов.
- Виды: **site-to-site** (сеть-сеть), **remote access / client-to-site** (клиент-сеть).
- Протоколы: **PPTP** (аутентификация по незащищённому каналу, затем шифрование; инкапсуляция IP), L2TP/IPsec, SSTP, IKEv2, OpenVPN, WireGuard. **SNMP — не VPN-протокол**.

## Маршрутизация (routing, trasowanie)
- Маршрутизация — выбор оптимального пути. Статическая (ручные маршруты) vs динамическая (протоколы).
- IGP — внутри автономной системы; EGP — между AS.

| Протокол | Тип | Метрика | Примечание |
|---|---|---|---|
| **RIP** (Routing Information Protocol) | IGP, **вектор расстояний (distance vector)** | число переходов (hop count), макс. 15 | рассылает всю таблицу соседям каждые 30 с, UDP 520 |
| **OSPF** (Open Shortest Path First) | IGP, **состояние канала (link-state)** | стоимость (cost) | алгоритм Дейкстры, области (area 0) |
| **EIGRP** | IGP, гибридный (Cisco) | пропускная способность+задержка | быстрая сходимость |
| **BGP** (Border Gateway Protocol) | **EGP**, вектор путей | атрибуты пути | связывает **провайдеров/автономные системы** в Интернете |

- Коды в таблице маршрутизации Cisco: **C** — connected, **S** — static, **R — RIP**, **O — OSPF**, **D — EIGRP**, **B — BGP**.

## Расчёты передачи
- 1 байт = 8 бит. Время = размер (в битах) / скорость.
- 2 MB при 4 Mb/s: 2·8 = 16 Mb → 16/4 = **4 s**.
- 8 Mb/s × 6 s = 48 Mb = **6 MB**.

## Частые ловушки на экзамене
- FTP: **21 = команды**, **20 = данные**; блокировать нужно оба.
- POP3 и IMAP — **приём**; SMTP — **отправка**. «Сначала заголовки» = **IMAP**.
- TCP — с соединением и подтверждениями; UDP — без соединения и без контроля доставки.
- Сетевой уровень → **пакет**, канальный → **кадр**, транспортный → **сегмент**.
- ping использует **ICMP**, а не TCP/UDP.
- CNAME = псевдоним; A = IPv4; AAAA = IPv6; MX = почта; NS создаётся автоматически.
- SSH шифрует, Telnet — нет; RDP = 3389.
- RIP = вектор расстояний, OSPF = состояние канала, BGP = между провайдерами.
- VPN — не протокол SNMP; IGMP — для multicast-групп, не nslookup.
- ARP: IP → MAC; RARP: MAC → IP.

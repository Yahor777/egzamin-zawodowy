# Builds work/curriculum/curriculum.json: modules -> steps, validates refs against the repo,
# attaches exam value from the sheet/question analysis, and packs steps into calendar days.
import json, re, os, sys, datetime as dt, collections

ROOT = '/home/user/egzamin-zawodowy'
C = ROOT + '/app/public/content'
SP = os.path.dirname(os.path.abspath(__file__))

# ------------------------------------------------------------------ valid ids
def headings(path):
    out = []
    for l in open(path, encoding='utf-8'):
        m = re.match(r'^#{1,4}\s+(.*)$', l.rstrip())
        if m:
            out.append(m.group(1).strip())
    return out

NOTES = {f[:-3]: headings(f'{C}/notes/{f}') for f in os.listdir(C + '/notes')}
HOWTO = {f[:-3]: headings(f'{C}/howto/{f}') for f in os.listdir(C + '/howto')}
PRACT = {f[:-3]: headings(f'{C}/practice/{f}') for f in os.listdir(C + '/practice') if f.endswith('.md')}
src = open(ROOT + '/app/src/sim/drills/linux.ts').read() + open(ROOT + '/app/src/sim/drills/net.ts').read()
DRILLS = {}
for m in re.finditer(r"id: '([a-z0-9-]+)',\s*\n\s*topic: '(\w+)',\s*\n\s*title_ru: '([^']*)',[\s\S]*?minutes: (\d+)", src):
    DRILLS[m.group(1)] = {'topic': m.group(2), 'title_ru': m.group(3), 'minutes': int(m.group(4))}
labsrc = open(ROOT + '/app/src/sim/labs/labs.ts').read() + open(ROOT + '/app/src/sim/labs/labs-more.ts').read()
LABS = {m.group(1): m.group(2) for m in re.finditer(r"id: '(inf02-[0-9-]+)',\s*\n\s*code: '([^']+)'", labsrc)}
QS = json.load(open(ROOT + '/app/public/data/questions.json'))
TOPICS = collections.Counter(t for q in QS for t in q['topics'])
CMDS = collections.Counter(f"{c['os']}/{c['group']}" for c in json.load(open(C + '/commands.json')))
GENS = {'subnet', 'number', 'chmod'}
TOOLS = {'check-winserver.ps1', 'check-linux.sh', 'vm', 'exam', 'learn', 'mistakes', 'glossary', 'sandbox'}

errors = []
def ref(s):
    """'note:addressing#Таблица масок' | 'drill:rt-lan' | 'topic:addressing*20' ..."""
    t, rest = s.split(':', 1)
    sec = None
    n = None
    if '#' in rest:
        rest, sec = rest.split('#', 1)
    if '*' in rest:
        rest, n = rest.split('*', 1)
        n = int(n)
    r = {'type': t, 'id': rest}
    if sec:
        r['section'] = sec
    if n:
        r['count'] = n
    table = {'note': NOTES, 'howto': HOWTO, 'practice': PRACT}.get(t)
    if table is not None:
        if rest not in table:
            errors.append(f'missing {t} {rest}')
        elif sec and not any(h.startswith(sec) for h in table[rest]):
            errors.append(f'missing section {t}:{rest}#{sec}')
        elif sec:
            r['section'] = next(h for h in table[rest] if h.startswith(sec))
        r['route'] = {'note': 'notes/', 'howto': 'doc/', 'practice': 'practice/'}[t] + rest
    elif t == 'drill':
        if rest not in DRILLS: errors.append('missing drill ' + rest)
        else: r['route'] = 'drill/' + rest
    elif t == 'lab':
        if rest not in LABS: errors.append('missing lab ' + rest)
        else: r['route'] = 'lab/' + rest; r['code'] = LABS[rest]
    elif t == 'topic':
        if rest not in TOPICS: errors.append('missing topic ' + rest)
    elif t == 'cmd':
        if rest not in CMDS: errors.append('missing cmd group ' + rest)
    elif t == 'gen':
        if rest not in GENS: errors.append('missing gen ' + rest)
    elif t == 'tool':
        if rest not in TOOLS: errors.append('missing tool ' + rest)
    elif t == 'new':
        pass  # content to be created (see missing_spec)
    else:
        errors.append('bad ref type ' + s)
    return r

# ------------------------------------------------------------------ exam value
AGG = {r[0]: {'sheets_pct': r[2], 'avg_points_when_present': r[3], 'share_of_all_points_pct': r[4],
              'sheets_pct_2025_26': r[5]} for r in json.load(open(SP + '/agg.json'))}
QREC = [q for q in QS if not q.get('outdated') and any(s.startswith('EE.08') and int(s.split()[1][:4]) >= 2021 for s in q['seen'])]
QALL = [q for q in QS if not q.get('outdated')]
def wshare(topic):
    a = sum(1 for q in QALL if q['topics'] and q['topics'][0] == topic)
    b = sum(1 for q in QREC if q['topics'] and q['topics'][0] == topic)
    return {'written_primary_share_all_pct': round(100 * a / len(QALL), 1), 'written_primary_share_ee08_2021_24_pct': round(100 * b / len(QREC), 1)}

def value(skills=(), topics=()):
    v = {}
    if skills:
        v['practical'] = {s: AGG[s] for s in skills if s in AGG}
    if topics:
        v['written'] = {t: wshare(t) for t in topics}
    return v

# ------------------------------------------------------------------ steps
MODULES = []
def M(id, title_ru, title_pl, why_ru, weeks):
    m = {'id': id, 'title_ru': title_ru, 'title_pl': title_pl, 'why_ru': why_ru, 'planned_weeks': weeks, 'steps': []}
    MODULES.append(m)
    return m

ALL = {}
def S(mod, id, kind, mins, title_ru, title_pl, objective_ru, refs=(), pre=(), skills=(), topics=(), missing=None, extra=None):
    st = {'id': id, 'title_ru': title_ru, 'title_pl': title_pl, 'kind': kind, 'est_minutes': mins,
          'prerequisites': list(pre), 'refs': [ref(r) for r in refs], 'objective_ru': objective_ru}
    v = value(skills, topics)
    if v: st['exam_value'] = v
    if missing:
        st['missing'] = True
        st['missing_spec'] = missing
    if extra: st.update(extra)
    for p in pre:
        if p not in ALL: errors.append(f'{id}: prerequisite {p} not defined before')
    if id in ALL: errors.append('dup ' + id)
    ALL[id] = st
    mod['steps'].append(st)
    return st

def CP(mod, id, mins, title_ru, title_pl, objective_ru, review_drills=(), quiz=(), labs=(), pre=(), extra=None):
    refs = [f'drill:{d}' for d in review_drills] + [f'topic:{t}' for t in quiz] + [f'lab:{l}' for l in labs]
    e = {'review': {'drills_new_seed': list(review_drills), 'quiz_topics': list(quiz), 'pass_threshold_pct': 75,
                    'rule_ru': 'Каждый дрилл — с НОВЫМ seed (newDrillSeed), без открытия доков. <75 % → дрилл возвращается в план через 1 день, ≥75 % → через 7 дней.'}}
    if extra: e.update(extra)
    return S(mod, id, 'checkpoint', mins, title_ru, title_pl, objective_ru, refs, pre, extra=e)

# ================================================================== M0
m = M('m00-start', 'Старт: как устроен экзамен и входная диагностика', 'Start: budowa egzaminu i diagnoza',
      'Сначала понять, за что дают баллы (1 критерий = 1 балл T/N, порог 75 %), и измерить исходный уровень, чтобы план подстраивался.', 'W1')
S(m, 'm00-exam-format', 'theory', 15, 'Как устроен INF.02: письменная и практическая часть', 'Budowa egzaminu INF.02',
  'Знает: письменная — 40 вопросов/60 мин/порог 50 %; практика — 150 мин (+10 мин чтения), 31–51 критериев T/N по 1 баллу, порог 75 %; 5 rezultatów + przebieg.',
  ['practice:cheat-exam-strategy#1. Как считаются баллы', 'practice:cheat-frequency#Рейтинг типов заданий'])
S(m, 'm00-read-sheet', 'demo', 25, 'Разбор реального листа вместе с критериями (zo)', 'Analiza arkusza i zasad oceniania',
  'Умеет прочитать лист: таблица адресов, X = номер места, «zgłoś gotowość», папка для скриншотов на Egzamin-x; сопоставляет пункт задания с критериями оценки.',
  ['practice:inf02-2026-06-03', 'practice:cheat-exam-strategy#3. Когда поднимать руку'], ['m00-exam-format'])
S(m, 'm00-diag-written', 'quiz', 40, 'Входной тест: 40 вопросов за 60 минут', 'Test diagnostyczny 40 pytań',
  'Получен исходный % по темам (статистика по темам в приложении) — план усиливает темы < 50 %.',
  ['tool:exam'], ['m00-exam-format'], extra={'adaptive_ru': 'Темы с результатом < 50 % получают +50 % вопросов в quiz-шагах; темы > 80 % — квизы сокращаются вдвое.'})
S(m, 'm00-diag-practical', 'drill', 10, 'Входной дрилл: собрать схему и проверить связь', 'Drill diagnostyczny: schemat i ping',
  'Проверено, умеет ли он соединять устройства по схеме и пинговать; знакомство с интерфейсом стенда.',
  ['drill:net-schema', 'howto:bench'], ['m00-read-sheet'], skills=['connect', 'ping'])

# ================================================================== M1
m = M('m01-numbers-ipv4', 'Числа и адресация IPv4', 'Systemy liczbowe i adresacja IPv4',
      'Маски /25–/30 и подсчёт адресов нужны в роутере/свитче/DHCP почти каждого листа (WAN /26–/30 в 69 % листов) и ~10 % письменных вопросов (addressing) + basics.', 'W1')
S(m, 'm01-bin-hex', 'theory', 20, 'Системы счисления: 2, 8, 10, 16 и степени двойки', 'Systemy liczbowe',
  'Переводит 8-битное число между 2/10/16 без калькулятора; знает степени двойки до 2^10.',
  ['note:basics#Системы счисления', 'note:basics#Степени двойки'], topics=['basics'])
S(m, 'm01-bin-hex-gen', 'drill', 15, 'Тренажёр: системы счисления и U2 (10 задач)', 'Generator: systemy liczbowe',
  'Решает 8 из 10 сгенерированных задач без подсказки.', ['gen:number*10', 'note:basics#Отрицательные числа'], ['m01-bin-hex'], topics=['basics'])
S(m, 'm01-ipv4-basics', 'theory', 25, 'IPv4: адрес, маска, префикс, частные и специальные адреса', 'IPv4: adres, maska, adresy prywatne',
  'Переводит /24–/30 ↔ маску; отличает частные (RFC 1918), APIPA 169.254, loopback; знает, что шлюз в той же подсети.',
  ['note:addressing#Основы IPv4', 'note:addressing#Частные адреса', 'note:addressing#Специальные адреса', 'note:addressing#Таблица масок'],
  ['m01-bin-hex'], topics=['addressing'])
S(m, 'm01-subnet-method', 'theory', 20, 'Метод: адрес сети, broadcast, первый/последний хост', 'Adres sieci, rozgłoszeniowy, zakres hostów',
  'По адресу/префиксу за 1 минуту находит сеть, broadcast, диапазон хостов и число хостов.',
  ['howto:subnets', 'note:addressing#Метод'], ['m01-ipv4-basics'], topics=['addressing'])
S(m, 'm01-subnet-gen', 'drill', 20, 'Тренажёр подсетей (10 задач)', 'Generator: podsieci',
  '8/10 верно, среднее время < 90 с на задачу.', ['gen:subnet*10'], ['m01-subnet-method'], topics=['addressing'])
S(m, 'm01-subnet-hosts', 'drill', 15, 'Дрилл: N-я подсеть — адреса сервера и станции', 'Drill: adresy w podsieci',
  'Считает N-ю подсеть /26–/29 и настраивает в ней устройства (как в листах 2024-06-02, 2026-06-09).',
  ['drill:net-subnet-hosts'], ['m01-subnet-gen'], skills=['win_net'])
S(m, 'm01-subnet-router', 'drill', 15, 'Дрилл: LAN роутера и пул DHCP по маске', 'Drill: LAN rutera i pula DHCP',
  'Из адреса сети и маски выводит адрес роутера и допустимый диапазон DHCP.',
  ['drill:net-subnet-router'], ['m01-subnet-gen'], skills=['rt_lan', 'rt_dhcp'])
S(m, 'm01-quiz', 'quiz', 20, 'Квиз: адресация (20 вопросов)', 'Quiz: adresacja',
  '≥ 70 % на вопросах темы addressing; ошибки уходят в «Мои ошибки».', ['topic:addressing*20'], ['m01-subnet-method'], topics=['addressing'])
S(m, 'm01-ipv6-nat', 'theory', 15, 'IPv6 (сокращение записи), DHCP/APIPA, NAT', 'IPv6, APIPA, NAT',
  'Сокращает/разворачивает IPv6, знает типы адресов IPv6 (fe80::, ::1, 2000::/3) и зачем NAT — для письменной части.',
  ['note:addressing#IPv6', 'note:addressing#DHCP и APIPA', 'note:addressing#NAT', 'note:addressing#Частые ловушки'], ['m01-ipv4-basics'], topics=['addressing'])

# ================================================================== M2
m = M('m02-win-net', 'Windows-клиент: сеть, ping, брандмауэр', 'Windows: sieć, ping, zapora',
      'Настройка интерфейсов ОС + ping — в 96–100 % листов, вместе ~18 % всех баллов практики. Самые «дешёвые» баллы — делать на автомате.', 'W1')
S(m, 'm02-where', 'demo', 20, 'Где что настраивается: ncpa.cpl, свойства IPv4, ipconfig /all', 'Karta sieciowa, IPv4, ipconfig',
  'Находит нужную карту по MAC/имени, переименовывает подключение, читает ipconfig /all.',
  ['howto:windows-net#Где настраивается', 'howto:windows-net#Какая карта какая', 'practice:cheat-windows-client#1. Сеть'], ['m01-ipv4-basics'], skills=['win_net'])
S(m, 'm02-static', 'drill', 10, 'Дрилл: имя подключения и статический IPv4', 'Drill: nazwa połączenia i statyczny IPv4',
  'Без подсказок: имя, IP, маска, шлюз, 2 DNS.', ['drill:win-static'], ['m02-where'], skills=['win_net'])
S(m, 'm02-dhcp', 'drill', 8, 'Дрилл: адрес по DHCP и обновление аренды', 'Drill: DHCP i ipconfig /renew',
  'Переключает на автомат, делает ipconfig /release /renew и показывает полученный адрес экзаменатору.', ['drill:win-dhcp'], ['m02-where'], skills=['win_net'])
S(m, 'm02-two', 'drill', 12, 'Дрилл: две сетевые карты (LAN1/LAN2, вторая без шлюза)', 'Drill: dwie karty sieciowe',
  'Определяет карту по MAC/порту, настраивает две карты; знает, почему шлюз только на одной.', ['drill:win-two'], ['m02-static'], skills=['win_net'])
S(m, 'm02-firewall', 'drill', 12, 'Дрилл: брандмауэр — правило ICMPv4 «Żądanie echa»', 'Drill: zapora — ICMPv4',
  'Включает правило «Udostępnianie plików i drukarek (Żądanie echa — ICMPv4-In)» или создаёт своё; проверяет ping в обе стороны.',
  ['drill:win-firewall', 'howto:windows-net#Ответ на ping', 'practice:cheat-windows-client#5. Брандмауэр'], ['m02-static'], skills=['firewall', 'ping'])
S(m, 'm02-netsh', 'drill', 10, 'Дрилл: сеть из командной строки (netsh / PowerShell)', 'Drill: netsh',
  'Умеет задать адрес и переименовать подключение командой — запасной путь, если GUI «не слушается».', ['drill:win-netsh', 'cmd:windows/network'], ['m02-static'], skills=['win_net'])
S(m, 'm02-cmd-quiz', 'quiz', 15, 'Тренажёр команд: сеть Windows (ipconfig, ping, tracert, netstat, nslookup)', 'Polecenia sieciowe Windows',
  'Знает назначение и ключи сетевых команд (часто в письменной части).', ['cmd:windows/network', 'cmd:windows/cmd', 'note:windows#Сетевые команды'], ['m02-netsh'], topics=['windows'])

# ================================================================== M3
m = M('m03-router-switch', 'Роутер и коммутатор (web-интерфейс)', 'Ruter i przełącznik (GUI WWW)',
      'Роутер (96 % листов, ~4,5 балла) + свитч (96 %, ~3,5 балла) = ~18 % всех баллов. VLAN — 50 % листов, trunk растёт (22 % в 2025–26).', 'W1–W2')
S(m, 'm03-devices-theory', 'theory', 20, 'Сетевые устройства по уровням OSI, роль роутера и свитча, VLAN', 'Urządzenia sieciowe i VLAN',
  'Объясняет, что делает роутер (WAN/LAN/NAT/DHCP) и управляемый свитч (IP управления, VLAN), как зайти на устройство по адресу с наклейки.',
  ['note:netdevices#Устройства по уровням OSI', 'note:netdevices#VLAN и 802.1Q', 'practice:cheat-router-switch#0. Как попасть'], ['m02-static'], topics=['netdevices'])
S(m, 'm03-rt-lan', 'drill', 15, 'Дрилл: первый вход на роутер и адрес LAN', 'Drill: logowanie i LAN rutera',
  'Заходит на роутер с заводскими настройками, меняет LAN и пароль, возвращается по новому адресу.', ['drill:rt-lan', 'howto:router#LAN'], ['m03-devices-theory'], skills=['rt_lan'])
S(m, 'm03-rt-wan', 'drill', 12, 'Дрилл: WAN со статическим адресом (/26–/30 → маска)', 'Drill: WAN statyczny',
  'Ставит Static IP: IP, маска из префикса, шлюз, 1–2 DNS.', ['drill:rt-wan', 'howto:router#WAN'], ['m03-rt-lan', 'm01-subnet-method'], skills=['rt_wan'])
S(m, 'm03-rt-dhcp', 'drill', 12, 'Дрилл: DHCP-сервер роутера (пул, аренда, DNS) / выключение DHCP', 'Drill: serwer DHCP rutera',
  'Настраивает диапазон, время аренды в минутах, DNS; умеет и выключить DHCP, если так в листе.', ['drill:rt-dhcp', 'howto:router#DHCP'], ['m03-rt-lan'], skills=['rt_dhcp'])
S(m, 'm03-rt-reserv', 'drill', 12, 'Дрилл: резервирование адреса по MAC', 'Drill: rezerwacja adresu',
  'Находит MAC нужной карты (ipconfig /all, ip link) и закрепляет адрес; знает, что резерв может быть вне/внутри пула по документации.',
  ['drill:rt-reservation', 'howto:router#Резервирование'], ['m03-rt-dhcp', 'm02-two'], skills=['rt_reservation'])
S(m, 'm03-sw-ip', 'drill', 15, 'Дрилл: IP управления свитча (+ шлюз)', 'Drill: adres IP przełącznika',
  'Даёт ПК временный адрес из сети свитча, заходит, меняет IP/маску/шлюз.', ['drill:sw-ip', 'howto:switch#IP управления'], ['m03-devices-theory'], skills=['sw_ip'])
S(m, 'm03-conflict', 'drill', 20, 'Дрилл: роутер и свитч с одинаковым адресом по умолчанию', 'Drill: konflikt adresów',
  'Понимает порядок: настроить устройства по одному, иначе конфликт; восстанавливает доступ.', ['drill:net-conflict'], ['m03-sw-ip', 'm03-rt-lan'], skills=['sw_ip', 'rt_lan'])
S(m, 'm03-vlan-theory', 'theory', 15, 'VLAN 802.1Q: tagged/untagged, PVID, «VLAN zarządzalny»', 'VLAN: tagowanie, PVID',
  'Объясняет access (untagged) vs trunk (tagged), зачем PVID и VLAN управления.',
  ['practice:cheat-router-switch#2.2 VLAN', 'howto:switch#VLAN 802.1Q'], ['m03-sw-ip'], topics=['netdevices'])
S(m, 'm03-sw-vlan', 'drill', 15, 'Дрилл: VLAN с портами без тегов и PVID', 'Drill: VLAN, porty nietagowane',
  'Создаёт VLAN, добавляет порты untagged, выставляет PVID, не теряя доступ к свитчу.', ['drill:sw-vlan'], ['m03-vlan-theory'], skills=['sw_vlan'])
S(m, 'm03-sw-trunk', 'drill', 18, 'Дрилл: два VLAN и trunk-порт к роутеру', 'Drill: trunk',
  'Настраивает tagged-порт в нескольких VLAN (router-on-a-stick — тренд 2025–26).', ['drill:sw-trunk', 'practice:cheat-router-switch#1.5 VLAN на роутере'], ['m03-sw-vlan'], skills=['sw_trunk'])
S(m, 'm03-rt-route', 'drill', 12, 'Дрилл: статический маршрут и удалённое управление', 'Drill: trasa statyczna',
  'Добавляет статический маршрут (сеть/маска/шлюз) — пример листов 2026-06-09/10.', ['drill:rt-remote', 'howto:router-wifi#Статический маршрут'], ['m03-rt-lan'], skills=['rt_vlan_route'])
S(m, 'm03-wifi-theory', 'theory', 15, 'Wi‑Fi: 802.11 a/b/g/n/ac/ax, каналы 2,4 ГГц, WPA2/WPA3', 'Wi‑Fi: standardy, kanały, WPA2',
  'Знает пары «стандарт–частота–скорость», каналы 1–13 (центр. частоты, 2442 МГц = 7), почему WPA2-PSK AES.',
  ['note:netdevices#Стандарты Wi‑Fi', 'note:netdevices#Безопасность Wi‑Fi'], ['m03-devices-theory'], topics=['netdevices'])
S(m, 'm03-rt-wifi', 'drill', 10, 'Дрилл: Wi‑Fi — SSID, WPA2-PSK AES, канал = номер места', 'Drill: Wi‑Fi',
  'Настраивает 2,4 ГГц и выключает 5 ГГц при необходимости.', ['drill:rt-wifi', 'howto:router-wifi#Wi‑Fi'], ['m03-wifi-theory'], skills=['rt_wifi'])
S(m, 'm03-troubleshoot', 'drill', 15, 'Дрилл: найти, почему нет связи', 'Drill: diagnostyka braku łączności',
  'Систематично проверяет кабель → адрес/маска → шлюз → брандмауэр → VLAN.', ['drill:net-troubleshoot', 'howto:windows-net#Если нет связи'], ['m03-sw-vlan', 'm02-firewall'], skills=['ping'])
S(m, 'm03-extra', 'drill', 20, 'Доп. дриллы (по желанию): проброс порта, пароль/отключение портов свитча', 'Drill: przekierowanie portów, zabezpieczenie przełącznika',
  'Знает, где Virtual Server/DMZ и port security — встречались в 2022–2023, сейчас редко.', ['drill:rt-forward', 'drill:sw-secure'], ['m03-rt-lan', 'm03-sw-ip'], skills=['rt_other'],
  extra={'optional': True})
S(m, 'm03-quiz', 'quiz', 20, 'Квиз: сетевые устройства, VLAN, Wi‑Fi (20 вопросов)', 'Quiz: urządzenia sieciowe',
  '≥ 70 % по теме netdevices.', ['topic:netdevices*20'], ['m03-wifi-theory', 'm03-vlan-theory'], topics=['netdevices'])
CP(m, 'm03-checkpoint', 45, 'Контрольная точка: сетевая часть листа (роутер + Wi‑Fi + VLAN + сервер) за 40 мин', 'Punkt kontrolny: część sieciowa arkusza',
   'Полный «сетевой» лист с автопроверкой ≥ 75 % за 40 минут.', labs=['inf02-26-06-08'], pre=['m03-rt-wifi', 'm03-sw-vlan', 'm03-rt-reserv'])

# ================================================================== M4
m = M('m04-protocols', 'Модели OSI/TCP‑IP, протоколы и порты', 'Modele OSI/TCP-IP, protokoły i porty',
      'Почти чисто письменная тема: protocols — 9,8 % вопросов банка; порты/протоколы встречаются в ~13 % вопросов. На практике помогает понять DNS/DHCP/FTP/HTTP.', 'W2')
S(m, 'm04-osi', 'theory', 20, 'OSI и TCP/IP: уровни, PDU, устройства; TCP vs UDP', 'Model OSI i TCP/IP',
  'Ставит протокол/устройство на уровень OSI и TCP/IP; отличает TCP и UDP.', ['note:protocols#Модель OSI', 'note:protocols#Модель TCP/IP', 'note:protocols#TCP vs UDP'], ['m03-devices-theory'], topics=['protocols'])
S(m, 'm04-ports', 'theory', 20, 'Хорошо известные порты и службы', 'Porty dobrze znane',
  'Знает наизусть 20, 21, 22, 23, 25, 53, 67/68, 69, 80, 110, 143, 161, 389, 443, 445, 3389.', ['note:protocols#Хорошо известные порты'], ['m04-osi'], topics=['protocols'])
S(m, 'm04-port-cards', 'drill', 10, 'Карточки «порт ↔ протокол ↔ уровень ↔ TCP/UDP»', 'Fiszki: porty i protokoły',
  'Отвечает на 20 карточек подряд без ошибки.', ['new:drill-ports-flashcards'], ['m04-ports'], topics=['protocols'],
  missing={'type': 'generator', 'priority': 10, 'create': 'app/src/lib/generators.ts: genPorts() + GENERATORS.ports',
           'spec_ru': 'Генератор вопросов с 4 вариантами: «Порт 53 → ?», «SMTP → порт?», «Какой протокол на транспортном уровне использует DHCP? (UDP 67/68)», «Уровень OSI для ARP/ICMP/HTTP». Пул ≥ 30 пар из note:protocols. Пояснение RU/PL к каждой генерации. Без нового UI — тот же компонент Generator.',
           'acceptance': 'gen:ports появляется в «Тренажёрах», 30+ уникальных пар, unit-тест на однозначность ответа.'})
S(m, 'm04-services', 'theory', 25, 'DNS, DHCP (DORA), HTTP/HTTPS, FTP/SFTP, почта, SSH/RDP/Telnet, VPN, маршрутизация', 'Usługi sieciowe',
  'Описывает работу DHCP (DORA), типы записей DNS (A, AAAA, CNAME, MX, PTR, NS, SOA), протоколы почты, удалённого доступа, RIP/OSPF.',
  ['note:protocols#DNS', 'note:protocols#DHCP', 'note:protocols#FTP', 'note:protocols#Почта', 'note:protocols#Удалённый доступ', 'note:protocols#Маршрутизация'], ['m04-ports'], topics=['protocols'])
S(m, 'm04-quiz', 'quiz', 25, 'Квиз: протоколы и порты (25 вопросов)', 'Quiz: protokoły',
  '≥ 70 % по теме protocols.', ['topic:protocols*25'], ['m04-services'], topics=['protocols'])

# ================================================================== M5
m = M('m05-cabling-hardware', 'Кабели, монтаж и железо', 'Okablowanie, montaż i sprzęt',
      'Кабель+подключение+монтаж+BHP — 22 % всех баллов практики (100 % листов); идентификация параметров — 87 % листов, ~5 баллов. Письменно: hardware 12,8 %, cabling 10,4 %, peripherals+printers 8,4 %.', 'W2–W3')
S(m, 'm05-cabling-theory', 'theory', 25, 'Витая пара: категории, U/UTP…S/FTP, T568A/B, прямой/кросс, Ethernet-стандарты', 'Skrętka, T568A/B, standardy Ethernet',
  'Знает порядок цветов T568A и T568B, когда кросс, категории (5e/6/6A/7) и 100BASE-TX/1000BASE-T/…, длина 100 м.',
  ['note:cabling#Витая пара', 'note:cabling#Обозначения экранирования', 'note:cabling#Распиновка', 'note:cabling#Типы патч-кордов', 'note:cabling#Стандарты Ethernet'], [], topics=['cabling'])
S(m, 'm05-t568-drill', 'drill', 15, 'Интерактив: разложи 8 жил по T568A/T568B (вилка, Keystone, патч-панель)', 'Ćwiczenie: kolejność żył T568A/B',
  'Безошибочно раскладывает жилы для вилки 8P8C и по цветовой маркировке Keystone/патч-панели (A/B) за < 60 с.', ['new:drill-t568', 'practice:cheat-hardware-cabling#1. Цветовые схемы'], ['m05-cabling-theory'], skills=['cable'],
  missing={'type': 'drill (UI-виджет без сетевого симулятора)', 'priority': 7, 'create': 'app/src/sim/drills/cable.ts (+ простой drag&drop компонент)',
           'spec_ru': 'Режимы: (1) вилка 8P8C — расставить 8 цветных жил по пинам 1–8 по T568A или T568B (рандом); (2) кросс-кабель — второй конец; (3) Keystone/патч-панель — на модуле нарисованы метки A/B, нужно выбрать нужный ряд цветов; (4) вопросы-критерии CKE: «≤ 25 mm poza płaszcz», «≤ 13 mm rozkręcenia», «zatrzask na izolacji», «kabel typu drut dla panelu/Keystone, linka dla patchcordu». Проверка — сразу, с подсветкой ошибочного пина.',
           'acceptance': 'drill-id cable-t568, рандом A/B, засчитывается в progress как d:cable-t568.'})
S(m, 'm05-cabling-demo', 'demo', 20, 'Как CKE оценивает кабель: обжим, Keystone, патч-панель, тестер, RACK', 'Montaż okablowania wg kryteriów CKE',
  'Знает последовательность работ и все критерии (5,1 балла в среднем + 2–3 балла przebieg BHP); руками — на школьном стенде 2 раза до 20.12.',
  ['practice:cheat-hardware-cabling#2. Обжим', 'practice:cheat-hardware-cabling#3. Патч-панель', 'practice:cheat-hardware-cabling#4. Тестер', 'note:cabling#Инструменты'], ['m05-t568-drill'], skills=['cable', 'bhp'],
  extra={'offline_task_ru': 'В школе: 2 патчкорда (T568B прямой, кросс) + 1 Keystone+патч-панель с проверкой тестером. Засечь время (цель ≤ 15 мин на линию).'})
S(m, 'm05-hw-cpu-ram', 'theory', 30, 'Железо 1: CPU и сокеты, чипсет, RAM (DDR, тайминги, пропускная способность), шины', 'Sprzęt 1: CPU, RAM, magistrale',
  'Решает типовые вопросы: сокет ↔ процессор, DDR4 vs DDR5, расчёт пропускной способности, PCIe/SATA/M.2.',
  ['note:hardware#Процессор', 'note:hardware#Чипсет', 'note:hardware#Оперативная память', 'note:hardware#Шины расширения'], [], topics=['hardware'])
S(m, 'm05-hw-disk-bios', 'theory', 30, 'Железо 2: диски, разделы, RAID, BIOS/UEFI/POST, блок питания, ноутбуки', 'Sprzęt 2: dyski, RAID, BIOS',
  'Различает RAID 0/1/5/10, MBR/GPT, сигналы POST, считает мощность БП.', ['note:hardware#Диски и интерфейсы', 'note:hardware#RAID', 'note:hardware#BIOS', 'note:hardware#Блок питания'], ['m05-hw-cpu-ram'], topics=['hardware'])
S(m, 'm05-mount-demo', 'demo', 15, 'Монтаж RAM / видеокарты / диска / сетевой карты + ESD и BHP', 'Montaż podzespołów, ESD, BHP',
  'Знает порядок: обесточить → опаска ESD → монтаж → проверка загрузки; что оценивают (стабильно, без повреждений, система стартует).',
  ['practice:cheat-hardware-cabling#5. Монтаж', 'note:law_bhp#ESD', 'note:law_bhp#Безопасность работ'], ['m05-hw-cpu-ram'], skills=['hw_mount', 'bhp'],
  extra={'offline_task_ru': 'В школе: 1 раз заменить RAM и добавить диск, запустить систему.'})
S(m, 'm05-ident', 'drill', 25, 'Идентификация параметров: Windows (msinfo32, dxdiag, devmgmt, CPU-Z/GPU-Z/HWiNFO, CrystalDiskInfo) и Linux (lscpu, lshw, free, lsblk, uname -r)', 'Identyfikacja parametrów',
  'По заданию «Tabela N» находит каждый параметр нужным инструментом, делает скриншот в папку на Egzamin-x и даёт оценку «spełnia/nie spełnia wymagania».',
  ['new:drill-ident', 'practice:cheat-hardware-cabling#6. Идентификация', 'practice:cheat-linux-server#8. Идентификация', 'practice:inf02-2026-06-08#Задание 2', 'practice:inf02-2026-06-02#Задание 2'], ['m05-hw-cpu-ram'], skills=['ident'],
  missing={'type': 'drill (симулятор)', 'priority': 1, 'create': 'app/src/sim/drills/ident.ts + окна msinfo32/dxdiag/CPU-Z-подобное в sim/pc; в Linux — lshw -short, lspci, dmidecode -t memory, inxi (lscpu/free/lsblk/uname уже есть)',
           'spec_ru': 'Рандомная конфигурация ПК (CPU модель/ядра/потоки/частота/кэш, RAM объём/тип/частота/каналы/серийный номер, GPU производитель/модель/VRAM, диск модель/объём/SMART-атрибуты, NIC MAC/модель, ОС версия/сборка/ядро, разрешение/частота монитора). Задание как в листе: Tabela с 6–10 параметрами + требования программы (напр. «≥ 6 ядер, ≥ 3 ГГц, ≥ 16 GB»). Студент вводит значения и ставит оценку; проверка по модели + требование «есть скриншот» (кнопка «zrzut ekranu» в сим-окне сохраняет файл в Egzamin-x/Identyfikacja). Варианты ОС: Windows (70 %) и Linux (30 %).',
           'acceptance': 'Минимум 3 разных шаблона таблиц из реальных листов (2026-06-03 CPU/GPU/ядро, 2025-06-01 RAM через dmidecode, 2022-06-01 SMART), оценка «spełnia» проверяется.'})
S(m, 'm05-periph-print', 'theory', 30, 'Периферия и принтеры: интерфейсы, мониторы, UPS, этапы лазерной печати, неисправности', 'Peryferia i drukarki',
  'Отвечает на типовые вопросы о USB/HDMI/DP, матрицах, расчётах мониторов, лазерном/струйном/игольчатом принтере.',
  ['note:peripherals#USB', 'note:peripherals#Видеоинтерфейсы', 'note:peripherals#Мониторы', 'note:peripherals#ИБП', 'note:printers#Лазерный принтер', 'note:printers#Струйный', 'note:printers#Матричный'], ['m05-hw-cpu-ram'], topics=['peripherals', 'printers'])
S(m, 'm05-quiz-hw', 'quiz', 25, 'Квиз: железо (25 вопросов)', 'Quiz: sprzęt',
  '≥ 65 % по hardware (самая большая тема письменной части).', ['topic:hardware*25'], ['m05-hw-disk-bios'], topics=['hardware'])
S(m, 'm05-quiz-cab-per', 'quiz', 25, 'Квиз: кабели (15) + периферия и принтеры (10)', 'Quiz: okablowanie, peryferia',
  '≥ 70 % по cabling, ≥ 60 % по peripherals/printers.', ['topic:cabling*15', 'topic:peripherals*5', 'topic:printers*5'], ['m05-periph-print', 'm05-cabling-theory'], topics=['cabling', 'peripherals', 'printers'])

# ================================================================== M6
m = M('m06-linux-basics', 'Linux: от оболочки до сети и пользователей', 'Linux: powłoka, pliki, konta, sieć',
      'Linux есть в 31 из 52 листов (60 %); сеть Linux 44 %, пользователи/группы 37 % (~2,4 балла), права 31 %. Письменно linux — 16,5 % вопросов EE.08 2021–24 (тема №1). Слабое место ученика → идём медленно, с нуля.', 'W3')
S(m, 'm06-shell', 'theory', 20, 'Оболочка: FHS, pwd/ls/cd, sudo, man, автодополнение, история', 'Powłoka i struktura katalogów',
  'Ориентируется в /etc, /home, /var, /dev; понимает prompt $ vs #, sudo; читает ls -l.', ['note:linux#Структура каталогов', 'note:linux#Базовые команды', 'tool:vm'], [], topics=['linux'])
S(m, 'm06-cmd-files', 'drill', 15, 'Тренажёр команд: файлы и каталоги (уровень 1)', 'Polecenia: pliki',
  '10 команд подряд без подсказки (mkdir -p, cp -r, mv, rm -r, touch, cat, nano).', ['cmd:linux/files', 'cmd:linux/system'], ['m06-shell'], topics=['linux'])
S(m, 'm06-links-redirect', 'drill', 20, 'Дриллы: ссылки/копирование и вывод в файлы (> и >>)', 'Drill: dowiązania i przekierowania',
  'ln -s, cp -r, mv; «df -h > plik», «free >> plik» — критерии «wynik zapisany w pliku» (листы 2023–24).', ['drill:lx-links', 'drill:lx-redirect', 'howto:linux-files'], ['m06-cmd-files'], skills=['files'])
S(m, 'm06-perms-theory', 'theory', 20, 'Права: rwx, восьмеричная запись, chown, «пользователь, от имени которого работает Apache»', 'Uprawnienia: rwx, chmod, chown',
  'Переводит «właściciel pełne, grupa odczyt…» ↔ 740; меняет владельца/группу.', ['howto:linux-perms', 'note:linux#Права доступа', 'gen:chmod*10'], ['m06-shell'], skills=['lx_perms'], topics=['linux'])
S(m, 'm06-chmod', 'drill', 22, 'Дриллы: chmod числом и символами, chown', 'Drill: chmod, chown',
  'Оба дрилла ≥ 75 % без доков.', ['drill:lx-chmod', 'drill:lx-chmod-sym'], ['m06-perms-theory'], skills=['lx_perms'])
S(m, 'm06-users-theory', 'theory', 20, 'Пользователи и группы: useradd -m -s -u -c -G, passwd, groupadd -g, usermod -aG, /etc/passwd /etc/group', 'Konta i grupy',
  'Знает ключи useradd и где это хранится; понимает основную/дополнительную группу.', ['howto:linux-users', 'note:linux#Пользователи и группы'], ['m06-shell'], skills=['lx_users'], topics=['linux'])
S(m, 'm06-users', 'drill', 22, 'Дриллы: пользователи и группы; имя хоста и учётка с описанием', 'Drill: konta, grupy, hostname',
  'Создаёт группу с GID, пользователя с UID/оболочкой/домашним каталогом, добавляет в группу, меняет hostname.', ['drill:lx-users-groups', 'drill:lx-hostname-user'], ['m06-users-theory'], skills=['lx_users', 'hostname'])
S(m, 'm06-users2', 'drill', 30, 'Дриллы: chage (срок действия), sudo, изменение/удаление учёток', 'Drill: chage, sudo, usermod',
  'chage -E/-M/-m, usermod -aG sudo, usermod -s /bin/sh, groupmod -n, userdel -r.', ['drill:lx-chage', 'drill:lx-sudo', 'drill:lx-usermod'], ['m06-users'], skills=['lx_users'])
S(m, 'm06-netplan', 'drill', 30, 'Linux-сервер: netplan — статический адрес и два интерфейса', 'Linux: netplan',
  'Пишет YAML без ошибок отступов, netplan apply, проверяет ip a / ip r.', ['howto:linux-netplan', 'drill:lx-netplan-static', 'drill:lx-netplan-two'], ['m06-shell', 'm01-ipv4-basics'], skills=['lx_net'])
S(m, 'm06-nm', 'drill', 15, 'Linux-станция (Ubuntu Desktop/openSUSE): имя соединения и адрес через NetworkManager (GUI/nmcli)', 'Linux Desktop: NetworkManager',
  'Переименовывает соединение (IP_PC, LAN_K…) и задаёт статику/DHCP через nmcli или GUI; показывает результат nmcli con show / ip a.',
  ['new:drill-lx-nmcli', 'practice:cheat-linux-server#1.3 Ubuntu Desktop'], ['m06-netplan'], skills=['lx_net'],
  missing={'type': 'drill + поддержка команды в симуляторе', 'priority': 5, 'create': 'app/src/sim/linux/cmd_nmcli.ts (register("nmcli")) + drill lx-nmcli в drills/linux.ts',
           'spec_ru': 'Поддержать nmcli connection show | modify "<имя>" connection.id NEW | ipv4.method manual|auto ipv4.addresses A/P ipv4.gateway G ipv4.dns "D1 D2" | up/down; nmcli device status. Дрилл: «Nazwa przewodowego połączenia: IP_PC, adres 192.168.X.15/24, brama, DNS» (критерии 5.1–5.2 листов 2026-06-02/03). Проверка по модели соединения.',
           'acceptance': 'Задание из 2026-06-03 решается только nmcli; netplan-дриллы не ломаются.'})
S(m, 'm06-tar', 'drill', 10, 'Дрилл: архив tar (создать/распаковать, -v, -z)', 'Drill: tar',
  'tar -cvf / -czvf / -xvf / -tf без подсказки (15 % листов, растёт).', ['drill:lx-tar', 'howto:linux-files#Архивы tar'], ['m06-links-redirect'], skills=['lx_tar'])
S(m, 'm06-cmd-users', 'drill', 15, 'Тренажёр команд: users, permissions, archives, network', 'Polecenia: konta, uprawnienia, sieć',
  '≥ 80 % верных с первой попытки.', ['cmd:linux/users', 'cmd:linux/permissions', 'cmd:linux/archives', 'cmd:linux/network'], ['m06-users2', 'm06-chmod'], topics=['linux'])
S(m, 'm06-quiz', 'quiz', 25, 'Квиз: Linux (25 вопросов)', 'Quiz: Linux',
  '≥ 70 % по теме linux.', ['topic:linux*25'], ['m06-cmd-users'], topics=['linux'])
CP(m, 'm06-checkpoint', 60, 'Контрольная точка: Linux-лист с автопроверкой', 'Punkt kontrolny: arkusz z Linuksem',
   'Лист ≥ 75 % без открытия доков (только --help/man).', review_drills=['lx-users-groups', 'lx-chmod', 'lx-netplan-static'], labs=['inf02-26-06-04'], pre=['m06-netplan', 'm06-users2'])

# ================================================================== M7
m = M('m07-win-client', 'Windows-клиент: учётки, политики, общий доступ, .bat', 'Windows: konta, zasady, udostępnianie, pliki wsadowe',
      'Учётки Windows — 54 % листов; имя компьютера 38 %; локальные политики 13 % (растут: 19 % в 2025–26); .bat — 12 % листов, ~3 балла. Письменно windows — 12,3 % вопросов.', 'W4')
S(m, 'm07-accounts-theory', 'theory', 15, 'Учётные записи, группы, UAC; net user / net localgroup; lusrmgr.msc', 'Konta i grupy w Windows',
  'Знает опции «Użytkownik musi zmienić hasło…», «nie może zmienić hasła», «hasło nigdy nie wygasa», «konto wyłączone».',
  ['note:windows#Учётные записи и UAC', 'note:windows#net user', 'practice:cheat-windows-client#3. Пользователи'], ['m02-where'], skills=['win_users'], topics=['windows'])
S(m, 'm07-accounts-drill', 'drill', 15, 'Дрилл: локальные пользователи и группы (GUI и net user)', 'Drill: konta lokalne',
  'Создаёт пользователя/группу, членство, опции пароля; командой и через lusrmgr.', ['new:drill-win-users', 'cmd:windows/users', 'cmd:windows/powershell'], ['m07-accounts-theory'], skills=['win_users'],
  missing={'type': 'drill (симулятор уже умеет net user, lusrmgr, New-LocalUser)', 'priority': 6, 'create': 'drills/net.ts → win-users (topic windows)',
           'spec_ru': 'Параметры: имя/полное имя/пароль, группа (Użytkownicy/Administratorzy/новая), флаги: нельзя менять пароль, пароль не истекает, учётка истекает (net user /expires), отключена. Вариант «za pomocą polecenia systemowego + zapisz polecenie w tabeli» (лист 2023-06-01). Проверка по модели пользователей sim/pc.',
           'acceptance': 'drill win-users в списке Windows, 3 варианта задания, проверка всех флагов.'})
S(m, 'm07-hostname', 'drill', 10, 'Имя компьютера, рабочая группа, описание, перезагрузка', 'Nazwa komputera',
  'Меняет имя (sysdm.cpl / Rename-Computer) и знает, что нужна перезагрузка — делать ДО AD DS и присоединения к домену.', ['practice:cheat-windows-client#2. Имя ПК', 'cmd:windows/system'], ['m07-accounts-theory'], skills=['hostname'])
S(m, 'm07-policies', 'theory', 20, 'Локальные политики: secpol.msc / gpedit.msc (пароли, блокировка, Ctrl+Alt+Del, аудит, запреты)', 'Zasady lokalne',
  'Знает путь к каждой настройке: Zasady konta → Zasady haseł / blokady; Zasady lokalne → Opcje zabezpieczeń / Zasady inspekcji; Szablony administracyjne → Panel sterowania / System.',
  ['practice:cheat-windows-client#4. Локальные политики', 'note:winserver#Политика паролей'], ['m07-accounts-theory'], skills=['win_localpol'])
S(m, 'm07-policy-quiz', 'quiz', 10, 'Квиз «где эта настройка?» (политики и консоли .msc)', 'Quiz: gdzie jest to ustawienie?',
  'Сопоставляет 15 требований из листов с путём в secpol/gpedit/консоли (без запоминания всех путей — понимание структуры).', ['new:quiz-settings-path'], ['m07-policies'], skills=['win_localpol', 'gpo'],
  missing={'type': 'quiz (новый тип вопроса «путь в GUI»)', 'priority': 9, 'create': 'app/public/content/practice/settings-paths.json + режим в Test',
           'spec_ru': '40–60 карточек «требование из листа (PL) → путь в консоли (PL-интерфейс)»: сложность паролей, мин. длина, блокировка после N попыток, Ctrl+Alt+Del, аудит входа, запрет Panelu sterowania, запрет regedit, запрет смены обоев, запрет установки MSI, отключение диспетчера задач, перемещаемый профиль, квоты, «nie może zmienić hasła». Формат — 4 варианта пути или сборка пути из 3–4 шагов.',
           'acceptance': 'Каждая карточка ссылается на лист CKE, где встречалась.'})
S(m, 'm07-shares-ntfs', 'theory', 25, 'Общий доступ и NTFS: права ресурса vs Zabezpieczenia, наследование, скрытый ресурс $, net share/net use', 'Udostępnianie i uprawnienia NTFS',
  'Объясняет «итоговое = минимум из ресурса и NTFS», отключает наследование «konwertuj na jawne», создаёт DANE$, подключает диск M:.',
  ['note:windows#Права NTFS и общий доступ', 'practice:cheat-windows-client#7. Общие папки', 'practice:cheat-windows-server#7. Общие папки'], ['m07-accounts-theory'], skills=['share', 'ntfs'], topics=['windows'])
S(m, 'm07-bat', 'drill', 20, '.bat: @echo off, echo, set /p, %1, for /L, mkdir, net user в цикле', 'Pliki wsadowe .bat',
  'Пишет скрипт как в листах 2025-06-09/2026-01-04 (папки STUDENT1…10, «Podaj imię», параметры) и проверяет запуском.',
  ['new:drill-bat', 'practice:cheat-windows-client#9. Пакетные файлы', 'practice:inf02-2026-01-04#Задание 8'], ['m07-accounts-drill'], skills=['win_script'],
  missing={'type': 'drill (интерпретатор подмножества cmd)', 'priority': 8, 'create': 'sim/pc/batch.ts + drills/net.ts → win-bat',
           'spec_ru': 'Редактор (Notatnik) + запуск .bat в симуляторе cmd: поддержать @echo off, echo, cls, pause, set, set /p, %1..%9, for /L %%i in (a,1,b) do, if exist/if ==, mkdir/md, cd, net user /add, net localgroup /add, rem. Проверка: и по коду (наличие конструкций, как в критериях CKE «użyte polecenie cls»), и по результату (папки/учётки созданы).',
           'acceptance': '3 задания из реальных листов (2025-06-09, 2026-01-01-SD, 2026-01-04) проходят проверку.'})
S(m, 'm07-disks', 'theory', 20, 'Диски: diskmgmt (раздел, буква, метка, NTFS, GPT), квоты NTFS, BitLocker, точка восстановления', 'Dyski, przydziały, BitLocker',
  'Знает путь к каждой операции и критерии (буква X:, метка Dane, квота 1 GB/уровень ostrzeżenia, klucz odzyskiwania na Egzamin-x).',
  ['note:windows#Управление дисками', 'practice:cheat-windows-client#6. Диски', 'note:windows#Копии и восстановление'], ['m07-accounts-theory'], skills=['disk_part', 'quota', 'encrypt', 'backup'], topics=['windows'])
S(m, 'm07-win-theory', 'theory', 25, 'Windows для письменной: редакции/лицензии, ФС, реестр, консоли .msc, загрузка и восстановление', 'Windows — teoria',
  'Отвечает на типовые вопросы о HKLM/HKCU, *.msc, FAT32/NTFS/exFAT, безопасном режиме, sfc/chkdsk.',
  ['note:windows#Редакции', 'note:windows#Файловые системы', 'note:windows#Реестр', 'note:windows#Консоли', 'note:windows#Загрузка'], ['m07-accounts-theory'], topics=['windows'])
S(m, 'm07-quiz', 'quiz', 25, 'Квиз: Windows (25 вопросов) + тренажёр команд cmd/PowerShell', 'Quiz: Windows',
  '≥ 70 % по теме windows.', ['topic:windows*25', 'cmd:windows/cmd', 'cmd:windows/system'], ['m07-win-theory'], topics=['windows'])

# ================================================================== M8
m = M('m08-winserver', 'Windows Server: роли — знание + пошаговые инструкции', 'Windows Server: role i usługi',
      'Контекст Windows Server есть в 40 из 52 листов; роли ≈ 13 % баллов. IIS 42 % (63 % в 2025–26), AD DS 38 %, OU/пользователи 31 %, общий доступ 27 %, принтер 27 %, NTFS 23 %, DNS/присоединение к домену/GPO 15–17 % (растут). Цель ученика — понимать и уметь пройти по шагам, а не «кликать наугад».', 'W4–W5')
S(m, 'm08-server-net', 'demo', 20, 'Server Manager, добавление ролей, сеть и имя сервера', 'Menedżer serwera, role, sieć',
  'Добавляет роль/funkcję мастером; настраивает LAN1/LAN2, DNS 127.0.0.1 перед AD DS; меняет имя до повышения.',
  ['practice:cheat-windows-server#1. Сеть', 'practice:cheat-windows-server#2. Установка ролей', 'note:winserver#Роли и компоненты'], ['m02-two', 'm07-hostname'], skills=['win_net', 'hostname'], topics=['winserver'])
S(m, 'm08-adds', 'demo', 25, 'AD DS: повышение до контроллера домена (новый лес), перезагрузка, проверка', 'AD DS: kontroler domeny',
  'Знает шаги мастера (Dodaj nowy las → nazwa domeny → poziom funkcjonalny → hasło DSRM) и что во время перезагрузки делать станцию.',
  ['note:winserver#Active Directory', 'practice:cheat-windows-server#3. AD DS', 'practice:inf02-2026-06-06#Задание 6'], ['m08-server-net'], skills=['ad_dc'], topics=['winserver'])
S(m, 'm08-ou-users', 'demo', 25, 'OU, пользователи (опции пароля), группы (zasięg/typ), присоединение станции и вход доменным пользователем', 'Jednostki organizacyjne, konta, dołączenie do domeny',
  'В dsa.msc создаёт OU → пользователя → группу (globalna/zabezpieczenia) → членство; на станции DNS = IP DC → dołącz do domeny → вход.',
  ['practice:cheat-windows-server#OU, пользователи, группы', 'note:winserver#Группы', 'practice:cheat-windows-client#2. Имя ПК', 'practice:inf02-2025-06-04#Задание 7'], ['m08-adds'], skills=['ad_ou_users', 'ad_join'], topics=['winserver'])
S(m, 'm08-shares-profile', 'demo', 25, 'Сервер: общий ресурс + NTFS, скрытый $, перемещаемый профиль \\\\SERWER\\profile$\\%username%', 'Udział, NTFS, profil mobilny',
  'Пошагово: папка → Udostępnianie zaawansowane (nazwa$, uprawnienia) → Zabezpieczenia → в профиле пользователя ścieżka profilu → вход на станции создаёт папку.',
  ['practice:cheat-windows-server#7. Общие папки', 'note:winserver#Профили', 'practice:inf02-2025-06-01#Задание 6'], ['m08-ou-users', 'm07-shares-ntfs'], skills=['share', 'ntfs', 'profile'])
S(m, 'm08-gpo', 'demo', 20, 'GPO: создать и связать с доменом/OU (запреты, пароли, установка MSI/принтера)', 'Zasady grupy (GPO)',
  'В gpmc.msc создаёт GPO, связывает с OU/корнем домена, находит настройку в Konfiguracja użytkownika/komputera; gpupdate /force.',
  ['practice:cheat-windows-server#9. GPO', 'note:winserver#Zasady grupy', 'practice:inf02-2026-06-09#Задание 9'], ['m08-ou-users', 'm07-policies'], skills=['gpo'], topics=['winserver'])
S(m, 'm08-dns', 'demo', 20, 'DNS: прямая зона, A/CNAME, обратная зона + PTR, SOA', 'DNS: strefy i rekordy',
  'Создаёт strefę wyszukiwania do przodu/wstecz, rekord A (www), alias, PTR; проверяет nslookup.',
  ['practice:cheat-windows-server#4. DNS', 'note:winserver#DNS', 'note:protocols#DNS'], ['m08-server-net'], skills=['dns'], topics=['winserver'])
S(m, 'm08-iis', 'demo', 25, 'IIS: сайт WWW (папка, привязка IP:порт/host, dokument domyślny) и FTP (anonim — odczyt, Administrator — zapis)', 'IIS: witryna WWW i FTP',
  'Пошагово создаёт сайт и FTP, проверяет браузером/FileZilla со станции — один из самых растущих блоков.',
  ['practice:cheat-windows-server#6. IIS', 'note:winserver#IIS', 'practice:inf02-2026-06-03#Задание 6', 'practice:inf02-2026-01-02#Задание 8'], ['m08-dns'], skills=['iis'], topics=['winserver'])
S(m, 'm08-print', 'demo', 15, 'Сетевой принтер TCP/IP RAW 192.168.0.200, драйвер с носителя, общий доступ, тестовая страница', 'Drukarka sieciowa TCP/IP RAW',
  'Добавляет принтер через port TCP/IP (RAW 9100), ставит драйвер из DRUKARKA, udostępnia (printer_XX), печатает с поднятой рукой.',
  ['practice:cheat-windows-server#10. Принтер', 'note:printers#Подключение и настройка'], ['m08-server-net'], skills=['printer'])
S(m, 'm08-rare', 'theory', 30, 'Редкие роли (знать путь): DHCP-сервер, Routing/NAT (RRAS), квоты/FSRM, NIC Teaming, Backup, RDP, Hyper-V/WDS/WSUS', 'Rzadsze role',
  'Для каждой роли знает: где добавить, 2–3 ключевых экрана, как проверить; для письменной — назначение WSUS/WDS/Hyper-V.',
  ['practice:cheat-windows-server#5. DHCP', 'practice:cheat-windows-server#8. Квоты', 'practice:cheat-windows-server#11. RDP', 'practice:cheat-windows-server#NIC Teaming', 'note:winserver#Hyper-V', 'note:winserver#WDS и WSUS', 'note:winserver#Резервное копирование'], ['m08-server-net'],
  skills=['ws_routing', 'ws_dhcp_role', 'quota', 'teaming', 'rdp', 'backup'], topics=['winserver'])
S(m, 'm08-steps-quiz', 'quiz', 20, 'Квиз «собери шаги»: AD DS, OU/пользователь, общий $-ресурс, IIS, DNS, принтер, GPO', 'Quiz: kolejność kroków',
  'Для 8 ролей правильно упорядочивает шаги и выбирает нужную опцию диалога (без реального сервера).', ['new:quiz-winserver-steps'], ['m08-iis', 'm08-gpo', 'm08-print'], skills=['ad_dc', 'iis', 'share'],
  missing={'type': 'quiz/мини-симулятор кликов', 'priority': 2, 'create': 'app/src/sim/winsrv/ (лёгкие «скриншот-мастера») или app/public/content/practice/winserver-steps.json + режим упорядочивания',
           'spec_ru': 'Минимум: для каждой роли (AD DS, OU+user+group, join domain, share+NTFS+$, roaming profile, GPO, DNS A/PTR/CNAME, IIS WWW, IIS FTP, print TCP/IP RAW, квоты, RRAS LAN routing/NAT, DHCP scope) 5–9 шагов с польскими названиями кнопок; режимы «упорядочи», «выбери правильную опцию в диалоге» (напр. «Zarejestruj adresy tego połączenia w DNS», «Użytkownik nie może zmienić hasła»), «что проверит экзаминатор». Максимум (позже): кликабельные мастера в стиле sim/pc с проверкой состояния, чтобы шаги m08 стали drill.',
           'acceptance': '13 сценариев, каждый привязан к критериям из ≥ 2 реальных листов; результат пишется в progress как d:ws-*.'})
S(m, 'm08-vm', 'drill', 60, 'Школьная VM Windows Server: пройти AD DS → OU → пользователь → $-ресурс → IIS → DNS и проверить скриптом', 'Ćwiczenie na VM Windows Server',
  'Хотя бы один раз руками на настоящем сервере; check-winserver.ps1 с expect.json показывает все ✔.',
  ['tool:check-winserver.ps1', 'practice:cheat-windows-server#13. Финальная проверка', 'practice:inf02-2025-06-03'], ['m08-iis', 'm08-ou-users'], skills=['ad_dc', 'ad_ou_users', 'share', 'iis', 'dns'],
  extra={'offline_task_ru': 'В школе или на домашней VM (Hyper-V/VirtualBox, ознакомительная версия Windows Server 2022). Если нет доступа — заменить на «бумажный прогон»: выписать клики по разбору листа и сверить.'})
S(m, 'm08-quiz', 'quiz', 20, 'Квиз: Windows Server (20 вопросов)', 'Quiz: Windows Server',
  '≥ 70 % по теме winserver.', ['topic:winserver*20'], ['m08-rare'], topics=['winserver'])

# ================================================================== M9
m = M('m09-linux-server', 'Linux-сервер: службы, диски, скрипты', 'Serwer Linux: usługi, dyski, skrypty',
      'Службы Linux — 21 % листов (Apache/SSH/Samba/isc-dhcp), скрипты/диски — по 2–4 %, но в 2026 растут (2026-01-01 DHCP+скрипт = ~12 баллов, 2026-01-02 диск, 2026-06-04 Samba).', 'W5')
S(m, 'm09-services', 'drill', 20, 'systemctl (start/enable/status) и cron', 'systemctl i cron',
  'Включает автозапуск, останавливает/отключает службу, пишет строку crontab.', ['howto:linux-services', 'drill:lx-services', 'drill:lx-cron'], ['m06-users2'], skills=['lx_service'])
S(m, 'm09-ssh', 'drill', 12, 'SSH: порт, PermitRootLogin, автозапуск', 'SSH',
  'Правит sshd_config, перезапускает, подключается ssh user@IP.', ['howto:linux-ssh', 'drill:lx-ssh'], ['m09-services'], skills=['lx_service'])
S(m, 'm09-apache', 'drill', 15, 'Apache: своя страница, другой каталог/порт, владелец www-data', 'Apache',
  'index.html в /var/www/html или своём DocumentRoot, chown www-data:www-data, curl localhost.', ['howto:linux-apache', 'drill:lx-apache'], ['m09-services', 'm06-chmod'], skills=['lx_service', 'lx_perms'])
S(m, 'm09-dhcp', 'drill', 25, 'isc-dhcp-server: subnet/range/routers/DNS/lease, INTERFACESv4', 'Serwer DHCP isc-dhcp-server',
  'Пишет dhcpd.conf, указывает интерфейс, запускает; клиент получает адрес.', ['howto:linux-dhcp', 'drill:lx-dhcp', 'practice:cheat-linux-server#7.1 isc-dhcp-server'], ['m06-netplan', 'm09-services'], skills=['lx_service'])
S(m, 'm09-samba', 'drill', 20, 'Samba: ресурс в smb.conf, smbpasswd -a, права «только пользователь X»', 'Samba',
  'Ресурс dane доступен с Windows (\\\\IP\\dane) только нужному пользователю.', ['howto:linux-samba', 'drill:lx-samba'], ['m09-services', 'm06-users2'], skills=['lx_service', 'share'])
S(m, 'm09-disk', 'drill', 20, 'Диск: fdisk/parted, mkfs.ext4, mount, /etc/fstab', 'Dysk: partycja, ext4, fstab',
  'Раздел на весь диск → ext4 → /dane → fstab; знает тест скорости (Dyski/hdparm) для таблицы.', ['howto:linux-disk', 'drill:lx-disk', 'practice:inf02-2026-01-02#Задание 10'], ['m06-shell'], skills=['lx_disk'])
S(m, 'm09-script', 'drill', 25, 'bash-скрипт: $1 $2, for, useradd в цикле, chmod +x', 'Skrypt bash',
  'Пишет konta.sh как в 2026-01-01 (5 пользователей + каталоги из параметров) и запускает с параметрами.', ['howto:linux-script', 'drill:lx-script'], ['m06-users2'], skills=['lx_script'])
S(m, 'm09-realvm', 'drill', 30, 'Настоящий Linux в браузере: повторить DHCP или Samba без симулятора и проверить check-linux.sh', 'Prawdziwy Linux w przeglądarce',
  'Работает в реальной Debian-VM, где ошибки не подсвечиваются; самопроверка скриптом.', ['tool:vm', 'tool:check-linux.sh'], ['m09-dhcp'], skills=['lx_service'], extra={'optional': True})
CP(m, 'm09-checkpoint', 60, 'Контрольная точка: Linux-сервер с netplan, DHCP и скриптом (лист 2026-01-01)', 'Punkt kontrolny: serwer Linux',
   '≥ 75 % за 60 мин, доки — только по лестнице подсказок.', review_drills=['lx-netplan-two', 'lx-users-groups', 'lx-chmod'], labs=['inf02-26-01-01'], pre=['m09-dhcp', 'm09-script'])

# ================================================================== M10
m = M('m10-docs', 'Смета в Calc/Excel и письменные рекомендации', 'Kosztorys w arkuszu kalkulacyjnym i wskazania',
      'Смета — в 37 % листов и даёт в среднем 8 баллов (≈ 7 % всех баллов практики) — самый «дорогой» блок на единицу времени; при этом его нет ни в одном дрилле.', 'W5')
S(m, 'm10-calc-theory', 'theory', 15, 'Смета: колонки Lp./Nazwa/Ilość/Cena netto/VAT/brutto, формулы, формат «zł», условный рабат/цвет', 'Kosztorys: kolumny i formuły',
  'Знает, какие критерии ставят: «obliczenia wykonują się automatycznie», SUMA, ŚREDNIA, JEŻELI, ZAOKR, format walutowy, formatowanie warunkowe.',
  ['practice:cheat-exam-strategy#6. Электронная таблица', 'note:cabling#Расчёты стоимости', 'note:law_bhp#Сервисные расчёты'], [], skills=['spreadsheet'])
S(m, 'm10-calc-drill', 'drill', 30, 'Дрилл: собрать смету по условию листа (VAT 23 %, rabat, suma, średnia, kolor)', 'Drill: kosztorys',
  'По тексту из реального листа строит таблицу с формулами, которые проходят авто-проверку.', ['new:drill-kosztorys', 'practice:inf02-2025-06-04#Задание 9'], ['m10-calc-theory'], skills=['spreadsheet'],
  missing={'type': 'drill (мини-таблица с формулами)', 'priority': 3, 'create': 'app/src/sim/sheet/ (сетка 10×8 + парсер формул: =, + - * /, SUMA/SUM, ŚREDNIA/AVERAGE, JEŻELI/IF, ZAOKR/ROUND, ссылки A1, $A$1, диапазоны) + drills/docs-kosztorys.ts',
           'spec_ru': 'Генерировать условие как в листах (услуги/детали, цены netto, VAT 23 % или 8 %, rabat X % при сумме > Y, harmonogram ≤ 150 min → цвет). Проверка: в нужных ячейках формулы (не числа!), значения верны при изменении входных цен (пересчёт со случайными ценами), формат «zł» (флаг формата), условное форматирование (правило). Плюс шпаргалка PL/EN имён функций (Excel PL vs Calc).',
           'acceptance': '5 шаблонов из листов (2024-01-02, 2023-06-03 rabat, 2025-06-01 harmonogram с цветом, 2026-06-07, 2026-06-05), проверка «формула, а не число».'})
S(m, 'm10-wskazania', 'theory', 10, 'Wskazania: 5 стандартных рекомендаций по безопасности/эксплуатации (польские формулировки)', 'Wskazania dla użytkownika',
  'Пишет по-польски 5 коротких рекомендаций: antywirus, aktualizacje, konto bez uprawnień administratora, polityka haseł, ostrożność z pocztą (лист 2023-06-02).',
  ['practice:cheat-exam-strategy#7. «Wskazania»', 'note:security#Антивирус и обновления'], [], skills=['advice'])

# ================================================================== M11
m = M('m11-security-written', 'Безопасность, право/BHP, английский, диагностика — добор письменной части', 'Bezpieczeństwo, prawo, BHP, angielski',
      'security+law_bhp+other ≈ 8 % вопросов, english — термины в вопросах; это «добор» до порога 50 % в письменной части и ответы для wskazań.', 'W5')
S(m, 'm11-security', 'theory', 30, 'Безопасность: malware, атаки, firewall, шифрование, бэкап (GFS), UPS', 'Bezpieczeństwo systemów',
  'Отличает типы вредоносного ПО/атак, знает схемы ротации копий и типы бэкапа (pełna/przyrostowa/różnicowa).', ['note:security#Вредоносное ПО', 'note:security#Атаки', 'note:security#Шифрование', 'note:security#Резервное копирование'], [], topics=['security'])
S(m, 'm11-law', 'theory', 20, 'Лицензии, авторское право, RODO, BHP/эргономика, первая помощь, WEEE', 'Licencje, prawo, BHP',
  'GPL/freeware/shareware/OEM/BOX, требования к рабочему месту с монитором, порядок первой помощи при поражении током.', ['note:law_bhp#Лицензии', 'note:law_bhp#BHP', 'note:law_bhp#Первая помощь', 'note:law_bhp#Экология'], [], topics=['law_bhp'])
S(m, 'm11-english', 'theory', 15, 'Английский в ИТ: аббревиатуры и фразы', 'Język angielski zawodowy',
  'Расшифровывает 30 частых аббревиатур и понимает англ. сообщения из интерфейса роутера/свитча.', ['note:english#Расшифровки', 'note:english#Слова и фразы', 'tool:glossary'], [], topics=['other'])
S(m, 'm11-quiz', 'quiz', 25, 'Квиз: безопасность + право/BHP (25 вопросов)', 'Quiz: bezpieczeństwo, BHP',
  '≥ 70 %.', ['topic:security*15', 'topic:law_bhp*10'], ['m11-security', 'm11-law'], topics=['security', 'law_bhp'])
S(m, 'm11-mistakes', 'quiz', 30, 'Разбор «Моих ошибок» по всем темам', 'Powtórka błędów',
  'Список ошибок сокращён вдвое; каждая ошибка прочитана с объяснением RU/PL.', ['tool:mistakes'], ['m11-quiz'])

# ================================================================== M12
m = M('m12-exam-sim', 'Симуляция экзамена: полные листы под таймером + пробные письменные', 'Symulacja egzaminu',
      'Последние 2,5 недели: каждый блок навыков уже пройден, теперь — скорость (150 мин), порядок работ и «рука вверх» в нужных местах. Письменная неделя — облегчённая практика.', 'W6–W8')
S(m, 'm12-strategy', 'theory', 20, 'Стратегия 150 минут: порядок блоков, когда поднимать руку, чек-лист потерь', 'Strategia 150 minut',
  'Может по памяти рассказать тайминг (физика 0–20, сеть 25–50, сервер 50–100, станция 100–125, идентификация/смета, ping 135–150) и 10 частых потерь баллов.',
  ['practice:cheat-exam-strategy#2. Тайминг', 'practice:cheat-exam-strategy#4. Чек-лист', 'practice:cheat-exam-strategy#5. Если что-то'], ['m00-read-sheet'])

FULL = [  # (lab id or None, walkthrough slug, note)
    ('inf02-26-06-02', 'inf02-2026-06-02', 'патч-панель, VLAN 3, FTP в IIS, Linux-станция'),
    ('inf02-26-01-01', 'inf02-2026-01-01', 'Linux-сервер: netplan, isc-dhcp, скрипт; квоты'),
    ('inf02-26-06-08', 'inf02-2026-06-08', 'Wi‑Fi, VLAN 2/3, домен, общая папка, смета'),
    ('inf02-26-01-02', 'inf02-2026-01-02', 'VLAN, DHCP-резервы, DNS+IIS, диск в Linux'),
    ('inf02-26-06-01', 'inf02-2026-06-01', 'диск, VLAN 2/4, общий диск DRUGI, смета'),
    ('inf02-26-01-03', 'inf02-2026-01-03', 'RAM, принтер RAW, .bat, Apache'),
    ('inf02-26-01-04', 'inf02-2026-01-04', 'сетевая карта, CPU-Z, AD + GPO, .bat'),
    ('inf02-26-06-05', 'inf02-2026-06-05', 'видеокарта+RAM, IIS-сайт, смета с рабатом'),
    ('inf02-25-06-05', 'inf02-2025-06-05', 'LAN /28, Wi‑Fi, Linux: права и срок учётки'),
    ('inf02-26-06-04', 'inf02-2026-06-04', 'сетевая карта, Wi‑Fi, VLAN 201/202, Samba'),
    (None, 'inf02-2026-06-09', '«незнакомый» лист: подсети /26, RRAS, домен, GPO 7-Zip — только на бумаге/VM'),
    (None, 'inf02-2026-06-10', '«незнакомый» лист: BitLocker, домен, routing — генеральная репетиция'),
]
for i, (lab, wt, note) in enumerate(FULL, 1):
    refs = ([f'lab:{lab}'] if lab else []) + [f'practice:{wt}']
    S(m, f'm12-sheet-{i:02d}', 'full-sheet', 180 if i <= 10 else 170, f'Полный лист №{i} под таймером 150 мин: {note}', f'Pełny arkusz {i} (150 min)',
      'Сетевая/Linux-часть — в симуляторе с автопроверкой; серверная часть — на VM или «бумажный прогон» по разбору; затем самооценка по критериям zo и разбор потерянных баллов (20–30 мин).',
      refs, ['m12-strategy'], extra={'timer_minutes': 150, 'pass_threshold_pct': 75,
      'after_ru': 'Каждый потерянный критерий → соответствующий дрилл/шаг ставится в план на завтра (кнопка «повторить навык»).'})
for i in range(1, 8):
    S(m, f'm12-written-{i}', 'quiz', 60, f'Пробный письменный экзамен №{i}: 40 вопросов / 60 мин', f'Egzamin próbny {i}',
      'Результат ≥ 60 % стабильно (запас над порогом 50 %); после — 15 мин разбора ошибок.', ['tool:exam', 'tool:mistakes'], ['m11-mistakes'] if i == 1 else [f'm12-written-{i-1}'])
S(m, 'm12-speedrun', 'drill', 45, 'Спидран: роутер + свитч + интерфейсы + ping из любого листа за 30 мин', 'Speedrun: część sieciowa',
  'Сетевые ~25 % баллов набираются за 30 минут без ошибок.', ['lab:inf02-24-01-02', 'lab:inf02-23-06-01', 'lab:inf02-24-06-02'], ['m12-strategy'], extra={'repeatable': True})
S(m, 'm12-final-review', 'checkpoint', 60, 'Финальный обзор накануне: шпаргалки + чек-лист, без новых тем', 'Ostatnia powtórka',
  'Пролистаны 5 шпаргалок; повторены 3 самых слабых дрилла; собран «план 150 минут» на листке.',
  ['practice:cheat-exam-strategy', 'practice:cheat-router-switch', 'practice:cheat-windows-server', 'practice:cheat-linux-server', 'practice:cheat-windows-client', 'practice:cheat-hardware-cabling'], ['m12-strategy'])


CONS = [('inf02-24-06-06', 'Wi‑Fi и резерв; Linux: пользователь, группа, /dane 750, SSH'),
        ('inf02-23-06-01', 'VLAN 2, резерв; Linux: копия sshd_config, права 740, df в файл'),
        ('inf02-24-06-02', 'подсети /25, Wi‑Fi канал 7; скрипт с groupadd/groupmod и архив'),
        ('inf02-22-06-02', 'Apache на 8080 с корнем /www, проброс порта, SMART'),
        ('inf02-25-01-02', 'Linux-сервер: SSH в автозапуске, данные о RAM в файлы'),
        ('inf02-24-01-01', 'расчёт WAN /26; Linux: отчёт об интерфейсах в файл, chmod 666'),
        ('inf02-23-01-01', 'Linux-станция: DHCP + свой DNS, группа, ссылка на /dev, права 711'),
        ('inf02-25-06-09', 'WAN /27, DHCP с резервом, sudo-пользователь и tar')]
for i, (lab, note) in enumerate(CONS, 1):
    S(m, f'm12-lab-{i}', 'checkpoint', 60, f'Закрепление: лист {lab[5:]} без таймера, без доков ({note})', f'Utrwalenie: arkusz {lab[5:]}',
      'Пройти ≥ 75 %; документация — только через лестницу подсказок. Это одновременно интервальный повтор сетевых и Linux-дриллов.',
      [f'lab:{lab}'], ['m09-checkpoint'] if i > 2 else ['m06-checkpoint'], extra={'review': {'labs': [lab], 'pass_threshold_pct': 75}})
S(m, 'm12-ws-run2', 'drill', 90, 'Windows Server, второй прогон: лист 2025-06-04 (Wi‑Fi, домен, GPO-блокировка, общий принтер)', 'Windows Server — drugie podejście',
  'Серверная часть реального листа целиком на VM (или на бумаге по памяти, затем сверка с разбором) ≤ 50 мин.',
  ['practice:inf02-2025-06-04', 'tool:check-winserver.ps1'], ['m08-vm'], skills=['ad_dc', 'gpo', 'printer'])
S(m, 'm12-calc-2', 'drill', 30, 'Смета №2: harmonogram с суммой времени и условным цветом (как 2025-06-01/02)', 'Kosztorys 2',
  'Таблица с формулами и форматированием условным — с первого раза.', ['new:drill-kosztorys'], ['m10-calc-drill'], skills=['spreadsheet'])
S(m, 'm12-speedrun-2', 'drill', 45, 'Спидран №2: сетевая часть + ping за 30 мин (другие листы)', 'Speedrun 2',
  'Стабильно ≤ 30 мин.', ['lab:inf02-24-06-06', 'lab:inf02-25-06-09'], ['m12-speedrun'])

# extra spaced-repetition checkpoints (weekly), placed by the calendar
SR = M('sr-reviews', 'Интервальные повторения (вставляются в календарь)', 'Powtórki',
       'Навык, сделанный один раз, к экзамену забудется. Повтор через 1–3–7–14 дней с новым seed закрепляет его; квизы по прошлым темам держат письменную часть.', 'W1–W8')
CP(SR, 'sr-w1', 40, 'Повтор недели 1: Windows-сеть, подсети, роутер', 'Powtórka tygodnia 1',
   'Все дриллы ≥ 75 % с новым seed.', review_drills=['win-static', 'win-firewall', 'net-subnet-router', 'rt-lan'], quiz=['addressing'], pre=['m03-rt-lan'])
CP(SR, 'sr-w2', 50, 'Повтор недели 2: роутер/свитч/VLAN + протоколы', 'Powtórka tygodnia 2',
   'Все ≥ 75 %; квиз ≥ 70 %.', review_drills=['rt-wan', 'rt-reservation', 'sw-vlan', 'sw-trunk', 'win-two'], quiz=['protocols', 'netdevices'], pre=['m04-quiz'])
CP(SR, 'sr-w3', 50, 'Повтор недели 3: Linux-основы + железо', 'Powtórka tygodnia 3',
   'Все ≥ 75 %.', review_drills=['lx-users-groups', 'lx-chmod-sym', 'lx-netplan-two', 'lx-tar', 'rt-dhcp', 'sw-ip'], quiz=['hardware', 'cabling'], pre=['m06-checkpoint'])
CP(SR, 'sr-w4', 50, 'Повтор недели 4: Windows-клиент/сервер + сеть (14 дней)', 'Powtórka tygodnia 4',
   'Все ≥ 75 %.', review_drills=['win-netsh', 'rt-wifi', 'sw-trunk', 'lx-chage', 'lx-sudo', 'net-troubleshoot'], quiz=['windows', 'winserver'], pre=['m08-quiz'])
CP(SR, 'sr-w5', 50, 'Повтор недели 5: Linux-службы + всё «красное»', 'Powtórka tygodnia 5',
   'Все ≥ 75 %; дриллы со статусом failed — обязательно.', review_drills=['lx-dhcp', 'lx-samba', 'lx-apache', 'lx-script', 'rt-remote'], quiz=['linux', 'security'], pre=['m09-checkpoint'])

# ------------------------------------------------------------------ calendar
start = dt.date(2026, 11, 24)
practical = dt.date(2027, 1, 15)
HOL = {dt.date(2026, 12, 24): 0, dt.date(2026, 12, 25): 0, dt.date(2026, 12, 26): 90, dt.date(2027, 1, 1): 0, dt.date(2027, 1, 6): 180}
BREAK = (dt.date(2026, 12, 23), dt.date(2026, 12, 31))
def budget(d):
    if d in HOL: return HOL[d]
    if BREAK[0] <= d <= BREAK[1]: return 180
    if d.weekday() >= 5: return 180
    if dt.date(2027, 1, 7) <= d <= dt.date(2027, 1, 13): return 90   # written-exam window: lighter practical, more written
    return 80
LEARN = 15  # daily spaced-repetition of written questions ("Учёба"), not a step

ORDER = [
 # W1
 'm00-exam-format', 'm00-read-sheet', 'm00-diag-written', 'm00-diag-practical',
 'm01-bin-hex', 'm01-bin-hex-gen', 'm01-ipv4-basics', 'm01-subnet-method', 'm01-subnet-gen',
 'm02-where', 'm02-static', 'm02-dhcp', 'm01-quiz', 'm02-two', 'm02-firewall', 'm01-subnet-hosts', 'm01-subnet-router',
 'm02-netsh', 'm03-devices-theory', 'm03-rt-lan', 'm01-ipv6-nat', 'm02-cmd-quiz', 'sr-w1',
 # W2
 'm03-rt-wan', 'm03-rt-dhcp', 'm03-rt-reserv', 'm04-osi', 'm03-sw-ip', 'm03-conflict', 'm04-ports', 'm04-port-cards',
 'm03-vlan-theory', 'm03-sw-vlan', 'm04-services', 'm03-sw-trunk', 'm03-rt-route', 'm03-wifi-theory', 'm03-rt-wifi',
 'm04-quiz', 'm03-troubleshoot', 'm03-quiz', 'm03-checkpoint', 'm03-extra', 'sr-w2',
 'm05-cabling-theory', 'm05-t568-drill', 'm05-cabling-demo',
 # W3
 'm05-hw-cpu-ram', 'm06-shell', 'm06-cmd-files', 'm05-hw-disk-bios', 'm06-links-redirect', 'm06-perms-theory',
 'm05-mount-demo', 'm06-chmod', 'm05-ident', 'm06-users-theory', 'm06-users', 'm05-quiz-hw', 'm06-users2', 'm06-netplan',
 'm05-periph-print', 'm06-nm', 'm06-tar', 'm05-quiz-cab-per', 'm06-cmd-users', 'm06-quiz', 'm06-checkpoint', 'sr-w3',
 # W4
 'm07-accounts-theory', 'm07-accounts-drill', 'm07-hostname', 'm07-shares-ntfs', 'm07-policies', 'm07-policy-quiz',
 'm07-bat', 'm07-disks', 'm07-win-theory', 'm07-quiz', 'm08-server-net', 'm08-adds', 'm08-ou-users', 'm08-shares-profile',
 'm08-gpo', 'm08-dns', 'm08-iis', 'm08-print', 'm08-rare', 'm08-steps-quiz', 'm08-quiz', 'sr-w4',
 # W5
 'm08-vm', 'm09-services', 'm09-ssh', 'm09-apache', 'm10-calc-theory', 'm10-calc-drill', 'm09-dhcp', 'm09-samba',
 'm11-security', 'm09-disk', 'm09-script', 'm10-wskazania', 'm11-law', 'm11-english', 'm11-quiz', 'm09-checkpoint', 'm09-realvm',
 'm11-mistakes', 'm12-strategy', 'sr-w5',
 # W5 (каникулы): закрепление
 'm12-lab-1', 'm12-lab-2', 'm12-ws-run2', 'm12-calc-2',
]
# W6–W8 are pinned day by day (full sheets / written mocks)
PINNED = {
 '2026-12-27': ['m12-sheet-01'], '2026-12-28': ['m12-sheet-02'], '2026-12-29': ['m12-sheet-03'], '2026-12-30': ['m12-written-1', 'm12-speedrun'],
 '2026-12-31': ['m12-sheet-04'], '2027-01-01': [], '2027-01-02': ['m12-sheet-05'], '2027-01-03': ['m12-sheet-06'],
 '2027-01-04': ['m12-written-2'], '2027-01-05': ['m12-written-3'], '2027-01-06': ['m12-sheet-07'],
 '2027-01-07': ['m12-written-4'], '2027-01-08': ['m12-written-5'], '2027-01-09': ['m12-sheet-08'], '2027-01-10': ['m12-sheet-09'],
 '2027-01-11': ['m12-written-6'], '2027-01-12': ['m12-written-7'], '2027-01-13': ['m12-speedrun-2'],
 '2027-01-14': ['m12-final-review'],
}
OPTIONAL_LATER = ['m12-lab-3', 'm12-lab-4', 'm12-lab-5', 'm12-lab-6', 'm12-lab-7', 'm12-lab-8', 'm12-sheet-10', 'm12-sheet-11', 'm12-sheet-12']

for s in ORDER:
    if s not in ALL: errors.append('order: unknown ' + s)
missing_in_order = [s for s in ALL if s not in ORDER and not any(s in v for v in PINNED.values()) and s not in OPTIONAL_LATER]
if missing_in_order: errors.append('not scheduled: ' + ', '.join(missing_in_order))

days = []
d = start
queue = list(ORDER)
first_pinned = dt.date(2026, 12, 27)
while d < practical:
    key = d.isoformat()
    b = budget(d)
    day = {'date': key, 'weekday': ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][d.weekday()], 'budget_minutes': b,
           'written_sr_minutes': LEARN if b else 0, 'steps': []}
    left = b - (LEARN if b else 0)
    if d.weekday() == 4 and d < dt.date(2026, 12, 21):
        day['buffer_minutes'] = 40
        day['buffer_ru'] = 'Буфер: доделать незавершённое за неделю / повторить дриллы со статусом failed.'
        left -= 40
    if key in PINNED:
        day['steps'] = PINNED[key]
        left -= sum(ALL[s]['est_minutes'] for s in PINNED[key])
    if True:
        while queue and left > 0:
            mins = ALL[queue[0]]['est_minutes']
            if mins <= left + 10 or (not day['steps'] and mins > left):
                day['steps'].append(queue.pop(0)); left -= mins
            else:
                break
    day['planned_minutes'] = sum(ALL[s]['est_minutes'] for s in day['steps']) + day['written_sr_minutes'] + day.get('buffer_minutes', 0)
    days.append(day)
    d += dt.timedelta(days=1)
if queue:
    errors.append('calendar overflow: ' + ', '.join(queue))

when = {s: day['date'] for day in days for s in day['steps']}
for s in ALL.values():
    if s['id'] in when:
        s['scheduled_date'] = when[s['id']]
    for p in s['prerequisites']:
        if p in when and s['id'] in when and when[p] > when[s['id']]:
            errors.append(f"prereq after step: {p} ({when[p]}) > {s['id']} ({when[s['id']]})")

# week labels
def week(dstr):
    dd = dt.date.fromisoformat(dstr)
    return 1 + (dd - dt.date(2026, 11, 23)).days // 7
for mo in MODULES:
    ds = sorted(when[s['id']] for s in mo['steps'] if s['id'] in when)
    if ds:
        mo['scheduled'] = {'from': ds[0], 'to': ds[-1], 'weeks': sorted({week(x) for x in ds})}
    mo['est_minutes_total'] = sum(s['est_minutes'] for s in mo['steps'])

if errors:
    print('\n'.join(errors)); sys.exit(1)

EXTRA_GAPS = [
 {'step': None, 'title_ru': 'Плеер учебного пути (страница шага + прогресс по curriculum.json)', 'type': 'UI/инфраструктура', 'priority': 0,
  'create': 'app/src/pages/Path.tsx + lib/path.ts (читает work/curriculum/curriculum.json, скопированный в public/data/)',
  'spec_ru': 'Экран «Сегодня» из calendar.days; страница шага: Цель → Коротко (theory) → Пример (demo) → Сделай сам (drill/lab/quiz по refs) → Проверка → лестница подсказок. Прогресс: статус шага = статус его drill/lab в inf02.practice.v1, quiz — % из store; checkpoint/sr — повтор с новым seed. Сдвиг плана при пропуске дня (непройденное уезжает вперёд, full-sheet-дни закреплены).',
  'acceptance': 'Пройти 3 первых дня плана целиком внутри плеера.'},
 {'step': None, 'title_ru': 'Чек-листы самооценки по критериям CKE (zo) для всех 52 листов', 'type': 'контент (JSON) + UI', 'priority': 4,
  'create': 'app/public/content/practice/criteria/<sheet>.json (генерировать из work/practical/*_zo*.txt скриптом analysis/zo.py)',
  'spec_ru': 'Для серверных/физических частей, которые симулятор не проверяет (AD, IIS, DNS, общие ресурсы, принтер, смета, кабель), ученик отмечает T/N по каждому критерию; итог в % вместе с авто-проверкой лаба. Это позволяет считать full-sheet честно по шкале CKE. Парсер уже извлекает 2187 критериев (work/curriculum/analysis/criteria.json).',
  'acceptance': '20 листов с разборами имеют чек-лист; итоговый % = (авто + самооценка) / всего критериев.'},
 {'step': None, 'title_ru': 'Трёхуровневая лестница подсказок в дриллах и лабах', 'type': 'UI + контент', 'priority': 11,
  'create': 'LabTask: hint_ru → hints: [{doc: DocRef+section}, {text}, {solution}] ; DrillPages/LabPage',
  'spec_ru': 'Сейчас у задания одна подсказка. Нужно: уровень 1 — ссылка на раздел доки (уже есть в drill.docs, добавить section), уровень 2 — подсказка к конкретной проваленной проверке (LabCheck.fail_hint), уровень 3 — решение; фиксировать использованный уровень в progress (для интервальных повторов).',
  'acceptance': 'Во всех 41 дриллах есть уровни 1 и 3, в 20 самых частых — уровень 2.'},
]
GAPS = sorted([{'step': s['id'], 'title_ru': s['title_ru'], **s['missing_spec']} for s in ALL.values() if s.get('missing')] + EXTRA_GAPS, key=lambda x: x['priority'])

out = {
 'version': 1,
 'generated': dt.date.today().isoformat(),
 'student_ru': 'Русскоязычный ученик 3 класса technik informatyk; Windows Server знает «кликами», Linux-сервер и теория слабые; хочет делать сам, подсматривая только при затруднении.',
 'exam': {'qualification': 'INF.02', 'written': {'from': '2027-01-07', 'to': '2027-01-13', 'questions': 40, 'minutes': 60, 'pass_pct': 50},
          'practical': {'from': '2027-01-15', 'to': '2027-01-19', 'minutes': 150, 'reading_minutes': 10, 'pass_pct': 75,
                        'criteria_per_sheet': {'avg': 42.1, 'min': 31, 'max': 51}, 'points_per_criterion': 1}},
 'sources': {'practical_sheets_with_criteria': 52, 'practical_sheet_texts': 56, 'written_questions': len(QS),
             'analysis_scripts': 'work/curriculum/analysis/ (zo.py, classify.py, agg.py)'},
 'step_kinds': {
   'theory': 'Короткий текст (≤ 1 экран) со ссылками на разделы конспектов; в конце — 2–3 контрольных вопроса.',
   'demo': 'Пошаговый разбор на реальном примере (раздел шпаргалки/разбора листа) — «смотрю, как делается».',
   'drill': 'Один навык в симуляторе/тренажёре с автопроверкой и лестницей подсказок; засчитан при ≥ 75 %.',
   'quiz': 'N вопросов из банка по тегу topic (или режим экзамена); засчитан при ≥ 70 %.',
   'checkpoint': 'Повтор ранее пройденных дриллов с новым seed и квиз по прошлым темам — без доков.',
   'full-sheet': 'Полный лист под таймером 150 мин, затем самооценка по критериям и план исправлений.'},
 'ref_types': {'note': 'notes/<slug> (+section)', 'howto': 'doc/<slug>', 'practice': 'practice/<slug>', 'drill': 'drill/<id>', 'lab': 'lab/<id>',
               'topic': 'вопросы questions.json с этим тегом (count = сколько)', 'gen': 'генератор в Тренажёрах', 'cmd': 'тренажёр команд commands.json os/group',
               'tool': 'exam/learn/mistakes/glossary/vm/check-*.{ps1,sh}', 'new': 'контент, которого ещё нет (см. missing_spec шага)'},
 'hint_ladder': [
   {'level': 1, 'ru': 'Где искать: ссылка на раздел нашей документации (refs шага, тип howto/practice/note с section).', 'cost': 'без штрафа'},
   {'level': 2, 'ru': 'Конкретная подсказка к проваленной проверке (что именно не так: «маска /27 = 255.255.255.224», «порт 1 должен быть untagged»).', 'cost': 'балл за шаг ×0,75'},
   {'level': 3, 'ru': 'Готовое решение (команда/клики) + почему так; дрилл автоматически ставится в повтор через 1 день с новым seed.', 'cost': 'шаг не засчитан как «сам»'}],
 'spaced_repetition': {
   'written': 'Ежедневно 15 мин режима «Учёба» (встроенные интервальные повторы вопросов) — written_sr_minutes в календаре.',
   'practical': 'Дрилл ≥ 75 % без подсказок → повтор через 3, затем 7, затем 14 дней (новый seed); < 75 % или подсказка 3 уровня → завтра. Недельные checkpoint sr-w* собирают эти повторы.',
   'full_sheets': 'Каждый потерянный критерий полного листа → соответствующий дрилл/шаг на следующий день.'},
 'modules': MODULES,
 'calendar': {'start': start.isoformat(), 'end': (practical - dt.timedelta(days=1)).isoformat(),
              'assumptions_ru': 'Будни 80 мин (60–90), выходные и каникулы 23–31.12 — 180 мин, 24–25.12 и 1.01 — выходные, 6.01 (праздник) — 150 мин; 7–13.01 (окно письменного) — 90 мин с упором на пробные письменные; 14.01 — только финальный обзор. Если дата письменного известна — в этот день шаги не ставить.',
              'optional_if_time': OPTIONAL_LATER,
              'days': days},
 'gaps': GAPS,
}
os.makedirs(ROOT + '/work/curriculum', exist_ok=True)
json.dump(out, open(ROOT + '/work/curriculum/curriculum.json', 'w'), ensure_ascii=False, indent=1)
# summary
tot = sum(s['est_minutes'] for s in ALL.values())
print('steps', len(ALL), 'minutes', tot, 'missing', len(GAPS))
for mo in MODULES:
    print(mo['id'], mo.get('scheduled'), mo['est_minutes_total'])
for day in days:
    print(day['date'], day['weekday'], day['budget_minutes'], day['planned_minutes'], ' '.join(day['steps']))

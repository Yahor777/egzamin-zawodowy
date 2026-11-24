import re, sys, json, glob, os, collections
sys.path.insert(0, os.path.dirname(__file__))
from zo import parse

D = '/home/user/egzamin-zawodowy/work/practical'

def ctx(sect):
    t = (sect['title'] + ' ' + sect['uwaga'])
    tl = t.lower()
    if sect['kind'] == 'Przebieg':
        return 'przebieg'
    if re.search(r'kosztorys|arkusz kalkulac|harmonogram|wskazani|zalece', tl) and not re.search(r'serwer|stacj', sect['title'].lower()):
        return 'doc'
    if re.search(r'identyfikac|diagnost|parametr', sect['title'].lower()):
        return 'ident'
    lin = 'linux' in tl
    win = 'windows' in tl
    if lin and not win:
        return 'linux'
    if win and not lin:
        return 'winserver' if re.search(r'server|serwer', tl) else 'winclient'
    if lin and win:
        return 'mixed'
    if re.search(r'urządzeni[ae] sieciow|rutera|przełącznik', tl):
        return 'netdev'
    return 'other'


I = re.I
W = ('winserver','winclient','other')
L = ('linux',)
R = [
  ('bhp', r'.', 0, ('przebieg',)),
  ('advice', r'wskazani|zalece', I, ('doc',)),
  ('spreadsheet', r'.', 0, ('doc',)),
  ('firewall', r'zapor|ICMP|żądani\w* echa', I, None),
  ('ad_join', r'(podłączon|dodan|przyłączon)\w* do (utworzonej )?domen|do domeny|zalogowa\w* .*(domen|konto domenowe)|konto domenowe', I, None),
  ('vm', r'VirtualBox|maszyn\w* wirtualn|Hyper-V', I, None),
  ('registry', r'edytora rejestru|klucza HKLM|rejestrowanie', I, None),
  ('desktop_misc', r'sterowniki|WordPad|uruchamiania programu|Paska zadań|kursor|wyłączanie ekranu|mysz|opis komputera|Podsystem Windows dla systemu Linux|funkcj\w* systemu Windows|prędkość przesyłania|Liczba próbek|litery dysków|strefy czasowej|tapet|pulpit', I, None),
  ('cable', r'typ kabla|T568|T586|Keystone|8P8C|żył|tester|typu drut|typu linka|panel\w* krosow|RACK|gniazd\w* (sieciow|naścienn)|wtyk|zaciśni|kabel krosowy|kabla krosowego|płaszcz|U/UTP', I, None),
  ('hw_mount', r'(zamontowan|zdemontowan|montaż|wymian|zainstalowan\w* (kart|pamię))\w*.*(RAM|pamię|kart|dysk|płyt)|(RAM|pamię|kart\w* graficzn|kart\w* sieciow|dysk)\w* .*(zamontowan|zdemontowan)|uruchamia się system', I, None),
  ('connect', r'Załącznik|zgodnie ze schematem|podłączon\w* do (portu|gniazda)(?!.*adres)', I, None),
  ('ident', r'.', 0, ('ident',)),
  ('ping', r'komunikac|\bping\b|odpowiada na polecenie', I, None),
  ('rt_wifi', r'SSID|WPA|bezprzewodow|kana[łl]u? ', I, ('netdev','other','mixed')),
  ('wifi_client', r'bezprzewodow', I, None),
  ('rt_reservation', r'rezerwac|zarezerw', I, None),
  ('sw_trunk', r'z tagowaniem|tagowaniem|trunk|\btagged', I, None),
  ('sw_vlan', r'VLAN|PVID', 0, ('netdev','other')),
  ('ws_routing', r'[Rr]outing|[Rr]uting|NAT\b|Dostęp zdalny', 0, ('winserver','mixed')),
  ('rt_vlan_route', r'tras\w* statyczn|[Rr]outing|[Rr]uting|podinterfejs', 0, None),
  ('rt_wan', r'\bWAN\b', 0, None),
  ('rt_dhcp', r'DHCP|dzierżaw', 0, ('netdev','other')),
  ('rt_lan', r'LAN\w* .*rutera|ruter\w* .*\bLAN|interfejsu LAN|adres rutera', 0, ('netdev','other')),
  ('sw_ip', r'przełącznik|adres IP', I, ('netdev','other')),
  ('rt_other', r'ruter|przekierowan|DMZ|zdaln', I, ('netdev','other')),
  ('ad_dc', r'kontroler|Active Directory|AD DS|nowy las|Usługi domenowe|w nowym lesie|Utworzon\w* (now\w* )?domen|poziom funkcjonaln', I, None),
  ('gpo', r'obiekt\w* zasad|GPO|zasad\w* grup|zasad\w* .*(jednostk|domen)', I, None),
  ('ad_ou_users', r'jednostk\w* organizac|\bOU\b|użytkownik\w* domen|grup\w* o zasięgu', I, None),
  ('profile', r'profil', I, None),
  ('dns', r'stref\w* (wyszukiw|DNS|podstawow|now)|w (utworzonej|nowej) strefie|rekord|alias|SOA|PTR|CNAME|serwer\w* DNS\b.*(rol|dodan)|role: serwer DNS|rola DNS', I, ('winserver','winclient','other','mixed')),
  ('ws_dhcp_role', r'DHCP', 0, ('winserver',)),
  ('iis', r'IIS|witryn|sieci Web|FTP|dokument\w* domyśln|http://|www\.|przeglądar', I, None),
  ('printer', r'drukar|wydruk|drukowania', I, None),
  ('quota', r'przydzia|FSRM', I, None),
  ('encrypt', r'BitLocker|EFS|szyfrow|[Kk]lucz odzyskiwania', I, None),
  ('backup', r'kopi\w* zapasow|punkt\w* przywracania|Kopia', I, None),
  ('rdp', r'[Pp]ulpit\w* zdaln|RDP', 0, None),
  ('teaming', r'Teaming|zespoł\w* kart|zespół kart|zespołu', I, None),
  ('share', r'udostępn|udział|zasob|\$', I, ('winserver','winclient','other','mixed')),
  ('ntfs', r'Zabezpiecz|Pełna kontrola|NTFS|dziedzicz|Modyfikacja|Odczyt i wykonywanie', I, W + ('mixed',)),
  ('lx_script', r'skrypt|pętl', I, ('linux','mixed')),
  ('lx_tar', r'\btar\b|\.tar|archiw', I, None),
  ('lx_service', r'[Aa]pache|HTTP|\bssh|SSH|[Ss]amba|smb|dhcpd|isc-dhcp|serwer\w* DHCP|usług|subnet|range|lease|^\d|automatycznie po starcie', 0, ('linux','mixed')),
  ('lx_disk', r'partycj|fstab|montow|ext4|mkfs|sformatowan', I, ('linux',)),
  ('lx_perms', r'[Pp]raw|[Uu]prawnie|właściciel|chmod', 0, ('linux','mixed')),
  ('hostname', r'[Nn]azwa serwera|nazw\w* (komputera|hosta|serwera|stacji)|[Nn]azwa komputera|hostname|[Nn]adana nazwa|zmienion\w* nazw\w* na', 0, None),
  ('lx_users', r'kont\w*|użytkownik|grup\w*|hasł|UID|GID|powłok|root|sudo', I, ('linux',)),
  ('lx_net', r'adres|interfejs|brama|DNS|mask|połączeni|DHCP|MAC|IP', I, ('linux',)),
  ('win_script', r'plik\w* wsadow|\.bat|\.cmd|skrypt|set /p|echo|pause|cls', I, None),
  ('win_localpol', r'złożono|blokad|długoś\w* hasł|hasł\w* .*(minimal|maksym)|secpol|inspekcj|Ctrl', I, None),
  ('win_users', r'kont\w*|użytkownik|grup\w*|hasł', I, W + ('mixed',)),
  ('disk_part', r'partycj|wolumin|sformatowan|system\w* plików|literę|etykiet|GPT|MBR', I, None),
  ('win_net', r'adres|interfejs|brama|DNS|mask|połącze|DHCP|MAC|IPv|dzierżaw|kart\w* sieciow|VLAN|LAN', I, None),
  ('files', r'katalog|folder|plik', I, None),
  ('ident', r'tabel|parametr|zrzut|CrystalDisk|SMART|procesor|pamięci|dysk', I, None),
]
RC = [(s, re.compile(r, f), c) for s, r, f, c in R]
SEEN=set()
def classify(text, cx):
    if cx == 'mixed':
        if re.search(r' /\w|Samba|Linux|terminal', text): cx2 = 'linux'
        else: cx2 = 'mixed'
    else: cx2 = cx
    for s, r, c in RC:
        if c and cx2 not in c:
            continue
        if r.search(text):
            return s
    return 'UNCLASSIFIED'

def sheets():
    out = {}
    for p in sorted(glob.glob(D + '/*_zo*.txt')):
        b = os.path.basename(p)
        m = re.match(r'inf_02_(\d{4})_(\d\d)_(\d\d)_(S[GD])', b)
        out[f'{m.group(1)}-{m.group(2)}-{m.group(3)}-{m.group(4)}'] = p
    return out

if __name__ == '__main__':
    res = {}
    unc = []
    for sid, p in sheets().items():
        cs = parse(p)
        items = []
        for c in cs:
            cx = ctx(c['sect'])
            sk = classify(c['text'], cx)
            items.append({'skill': sk, 'ctx': cx, 'text': c['text'], 'sect': c['sect']['kind'][0] + str(c['sect']['n']), 'title': c['sect']['title']})
            if sk == 'UNCLASSIFIED':
                unc.append((sid, cx, c['text'][:140]))
        res[sid] = items
    json.dump(res, open(os.path.join(os.path.dirname(__file__), 'criteria.json'), 'w'), ensure_ascii=False, indent=1)
    for u in unc:
        print(*u)
    print(len(unc), 'unclassified of', sum(len(v) for v in res.values()), 'in', len(res), 'sheets')

import re, sys, json, glob, os, collections

D = '/home/user/egzamin-zawodowy/work/practical'
SKIP = re.compile(r'^\s*(Strona \d|stanowiska|Numer$|Egzaminator|imię i nazwisko|Załącznik|Elementy podlegające|nie spełnił|kryterium albo|jeżeli zdający spełnił|Układ graficzny|\*)')

def parse(path):
    lines = open(path, encoding='utf-8', errors='replace').read().split('\n')
    # start at first Rezultat
    i = next((k for k, l in enumerate(lines) if re.match(r'^\s*Rezultat\s*\d', l)), None)
    if i is None:
        return []
    crits = []
    sect = None
    state = 'uwaga'
    prev_free = None  # last free text line not assigned
    for raw in lines[i:]:
        l = raw.rstrip()
        s = l.strip()
        if not s or SKIP.match(s) or re.match(r'^[.…\s]+$', s):
            continue
        m = re.match(r'^(Rezultat|Przebieg)\s*(\d+)[.:]?\s*(.*)$', s)
        if m:
            sect = {'kind': m.group(1), 'n': int(m.group(2)), 'title': m.group(3), 'uwaga': ''}
            state = 'uwaga'
            prev_free = None
            continue
        if sect is None:
            continue
        if s.startswith('Uwaga') or s.startswith('UWAGA') or (state == 'uwaga' and s.startswith('Zdający') or s == 'zdający:'):
            state = 'uwaga'
            sect['uwaga'] += ' ' + s
            prev_free = None
            continue
        m1 = re.match(r'^(\d{1,2})\s+(\S.*)$', s)
        m2 = re.match(r'^(\d{1,2})$', s)
        if m1 and int(m1.group(1)) <= 30:
            c = {'sect': sect, 'n': int(m1.group(1)), 'text': m1.group(2)}
            crits.append(c); state = 'crit'; prev_free = None
            continue
        if m2:
            first = ''
            if prev_free is not None:
                first = prev_free['line']
                # remove from where it was appended
                if prev_free['where'] == 'uwaga':
                    sect['uwaga'] = sect['uwaga'][: -len(first) - 1]
                elif prev_free['where'] is not None:
                    w = prev_free['where']
                    w['text'] = w['text'][: -len(first) - 1]
            c = {'sect': sect, 'n': int(m2.group(1)), 'text': first, 'lone': True}
            crits.append(c); state = 'crit'; prev_free = None
            continue
        # free line
        if state == 'uwaga':
            sect['uwaga'] += ' ' + s
            prev_free = {'line': s, 'where': 'uwaga'}
        else:
            crits[-1]['text'] += ' ' + s
            prev_free = {'line': s, 'where': crits[-1]}
    return crits

if __name__ == '__main__':
    for p in sys.argv[1:]:
        for c in parse(p):
            print(c['sect']['kind'], c['sect']['n'], c['n'], '|', c['text'][:150])

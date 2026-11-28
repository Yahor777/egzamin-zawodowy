#!/usr/bin/env python3
"""Convert wide annotated-command tree diagrams in docs into phone-friendly
numbered form: the command, a line of numbers under its parts, then a list."""
import re, sys, glob

def convert(blk):
    lines = blk.rstrip('\n').split('\n')
    if len(lines) < 3 or max(len(l) for l in lines) <= 40: return None
    head, rest = lines[0], lines[1:]
    if any(c in head for c in '│└┌┐┘┬├'): return None
    items = []
    for l in rest:
        if '└┬┘' in l or '┌' in l: return None
        m = l.rfind('└─')
        if m < 0: return None
        if l[:m].strip('│ '): return None
        items.append((m, l[m + 2:].strip()))
    items.sort()
    toks = [m.start() for m in re.finditer(r'\S+', head)]
    if len(toks) == len(items):
        items = [(toks[i], lab) for i, (_, lab) in enumerate(items)]
    marks = [' '] * (len(head) + 4)
    out = []
    for i, (col, label) in enumerate(items, 1):
        n = str(i)
        for k, ch in enumerate(n):
            if col + k < len(marks): marks[col + k] = ch
        out.append(f'{i}. {label}')
    return f"{head}\n{''.join(marks).rstrip()}\n", '\n'.join(out)

def fix(path):
    s = open(path, encoding='utf-8').read()
    def rep(m):
        r = convert(m.group(2))
        if not r: return m.group(0)
        code, lst = r
        return f"```{m.group(1)}\n{code}```\n\n{lst}\n"
    s2 = re.sub(r"```([^\n]*)\n(.*?)```\n?", rep, s, flags=re.S)
    if s2 != s:
        open(path, 'w', encoding='utf-8').write(s2); print('fixed', path)

for p in sys.argv[1:] or glob.glob('public/content/howto/*.md') + glob.glob('public/content/practice/cheat-*.md'):
    fix(p)

import json,collections,statistics,os
d=json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'criteria.json')))
N=len(d)
tot=sum(len(v) for v in d.values())
print('sheets',N,'criteria',tot,'avg/sheet',round(tot/N,1), 'min',min(len(v) for v in d.values()),'max',max(len(v) for v in d.values()))
per=collections.defaultdict(dict)
for sid,items in d.items():
  for it in items: per[it['skill']][sid]=per[it['skill']].get(sid,0)+1
recent=[s for s in d if s[:4] in('2025','2026')]
old=[s for s in d if s not in recent]
rows=[]
for k,v in per.items():
  n=len(v); pts=sum(v.values())
  r=sum(1 for s in v if s in recent)
  rows.append((k,n,round(100*n/N),round(pts/n,1),round(100*pts/tot,1),round(100*r/len(recent)),round(100*(n-r)/len(old))))
rows.sort(key=lambda x:-x[1])
print('skill sheets pctSheets avgPts pctAllPts pctRecent pctOld', len(recent), len(old))
for r in rows: print(*r)
json.dump(rows,open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'agg.json'),'w'))
# ctx stats
cx=collections.defaultdict(set)
for sid,items in d.items():
  for it in items: cx[it['ctx']].add(sid)
print({k:len(v) for k,v in cx.items()})

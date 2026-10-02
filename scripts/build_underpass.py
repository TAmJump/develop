"""OpenStreetMap の日本全体データから、アンダーパス・掘割・洗い越し・冠水しやすい道路を抜き出し、
サイトで読むための小さなファイル群（up/）を作る。GitHub Actions（static.yml）が毎日自動で実行する。
入力：osmium export の geojsonseq（標準入力）。出力：up/meta.json, up/grid.json, up/t/<key>.json
"""
import json, sys, os, math, datetime, collections
ROADS = {'motorway','trunk','primary','secondary','tertiary','unclassified','residential','service','living_street',
         'motorway_link','trunk_link','primary_link','secondary_link','tertiary_link'}
TUN = {'yes','culvert','building_passage'}
out = sys.argv[1] if len(sys.argv) > 1 else 'up'
os.makedirs(out + '/t', exist_ok=True)
tiles = collections.defaultdict(list); grid = collections.Counter(); seen = set(); n = 0
for line in sys.stdin:
    line = line.strip().lstrip('\x1e')
    if not line: continue
    try: f = json.loads(line)
    except Exception: continue
    p = f.get('properties') or {}; g = f.get('geometry') or {}
    oid = str(p.get('@type', '')[:1]) + str(p.get('@id', ''))
    if oid in seen: continue
    hw = p.get('highway'); kind = None
    if g.get('type') == 'Point':
        if p.get('ford') and p.get('ford') != 'no': kind = 2
    elif g.get('type') == 'LineString':
        try: layer = int(str(p.get('layer', '0')).split(';')[0])
        except Exception: layer = 0
        if hw in ROADS and p.get('tunnel') in TUN: kind = 0
        elif hw in ROADS and layer < 0: kind = 1
        elif p.get('ford') and p.get('ford') != 'no': kind = 2
        elif hw and p.get('flood_prone') == 'yes': kind = 3
    if kind is None: continue
    c = g['coordinates']
    lon, lat = (c if g['type'] == 'Point' else c[len(c) // 2])[:2]
    if not (20 <= lat <= 46.5 and 122 <= lon <= 154): continue
    seen.add(oid); n += 1
    name = (p.get('name') or p.get('ref') or '')[:40]
    tiles['%d_%d' % (math.floor(lat * 2), math.floor(lon * 2))].append([round(lat, 5), round(lon, 5), kind, name, oid])
    grid[(round(lat, 1), round(lon, 1))] += 1
for k, v in tiles.items():
    json.dump(v, open('%s/t/%s.json' % (out, k), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
json.dump([[a, b, c] for (a, b), c in grid.items()], open(out + '/grid.json', 'w'), separators=(',', ':'))
json.dump({'updated': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%MZ'), 'total': n, 'tiles': sorted(tiles.keys())},
          open(out + '/meta.json', 'w'), separators=(',', ':'))
print('points', n, 'tiles', len(tiles))

# Build data/cards.json: one entry per unique card.
# Primary source: riccjohn/riftbound-card-db (Riot card gallery export, refreshed daily: includes Equipment might bonuses
# and granted effects, plus preview sets). Tags/supertypes joined from community datasets.
import json, re, sys, html, collections
DL = sys.argv[1]
db = json.load(open(f'{DL}/riftbound-card-db/public/data/cards.json'))
bot = json.load(open(f'{DL}/riftbound-card-bot/data/cards.json'))
cdx = json.load(open(f'{DL}/RiftCardex-data/catalogue/cards.json'))
SETCODE = {'Origins':'OGN','Spiritforged':'SFD','Unleashed':'UNL','Vendetta':'VEN','Radiance':'RAD','Proving Grounds':'OGS'}
PREVIEW = {'RAD'}
TYPES = {'Unit':'u','Spell':'s','Gear':'g','Legend':'L','Battlefield':'B','Rune':'r'}
def conv(h):
    if not h: return ''
    t = h.replace('<br />', '\n').replace('<br/>', '\n').replace('<br>', '\n').replace('</p><p>', '\n')
    t = re.sub(r'<[^>]+>', '', t)
    t = re.sub(r':rb_might:', '{might}', t); t = re.sub(r':rb_exhaust:', '{exhaust}', t)
    t = re.sub(r':rb_rune_rainbow:', '{power:any}', t); t = re.sub(r':rb_rune_(\w+):', r'{power:\1}', t)
    t = re.sub(r':rb_energy_(\d+):', r'{energy:\1}', t)
    return html.unescape(t).strip()
def fullname(c):
    rt = c.get('rulesText') or ''
    m = re.match(r'Riftbound [A-Za-z ]+: ', rt)
    if not m: return c['name']
    rest = rt[m.end():]
    base = c['name']
    if not rest.startswith(base): return base
    i = rest.find('. ', len(base))
    nm = rest[:i] if i >= 0 else rest.rstrip('.')
    return nm if len(nm) < len(base) + 40 else base
sup = {}; tagsBy = collections.defaultdict(set)
for c in bot:
    sup.setdefault(c['baseName'], c.get('supertype')); tagsBy[c['baseName']] |= set(c.get('tags') or [])
for c in cdx:
    nm = c['metadata'].get('clean_name') or c['name']
    sup.setdefault(nm, c['classification'].get('supertype')); tagsBy[nm] |= set(c.get('tags') or [])
def slug(n): return re.sub(r'-+','-', re.sub(r'[^a-z0-9]+','-', n.lower().replace("'", '').replace('’',''))).strip('-')
def altness(c):
    code = c['code']; return (c['rarity'] == 'Showcase', bool(re.search(r'[a-z*]/', code)), code)
groups = collections.defaultdict(list)
for c in db['cards']:
    if c['type'] not in TYPES: continue
    groups[(fullname(c), c['type'])].append(c)
out = {}
for (name, typ), cs in sorted(groups.items()):
    cs.sort(key=altness); c = cs[0]
    t = TYPES[typ]; cid = slug(name)
    if cid in out: cid = slug(name + '-' + typ)
    sets = sorted({SETCODE.get(x['set'], x['setId']) for x in cs})
    num = lambda v: None if v in (None, '') else int(str(v).replace('+',''))
    tg = sorted(set(c.get('tags') or []) | tagsBy.get(name, set()))
    st = (sup.get(name) or '').lower() or None
    if t == 'u' and not st and ',' in name and any(x in tg for x in [name.split(',')[0]]): st = 'champion'
    if t == 'L': st = 'legend'
    out[cid] = {'id': cid, 'n': name, 't': t, 'd': [x.lower() for x in (c['domains'] or []) if x != 'Colorless'],
        'e': num(c['energy']), 'pw': num(c['power']), 'm': num(c['might']), 'mb': num(c.get('mightBonus')),
        'txt': conv(c.get('abilityHtml')), 'eqtxt': conv(c.get('effectHtml')), 'tags': tg, 'sup': st,
        'set': SETCODE.get(c['set'], c['setId']), 'sets': sets, 'preview': all(s in PREVIEW for s in sets),
        'rarity': c['rarity'], 'img': c['image'].split('?')[0]}
# preview-set data has a few card types swapped; fix them by what the text says
FIX = {'resplendent-rostrum': 'g', 'zero-point-inflection': 'g', 'consult-the-heavens': 's', 'improvised-projectile': 's', 'supernova': 's', 'dockside-lock-up': 'g', 'invigorating-bloom': 'g', 'runeblade-anvil': 'g',
       'overloaded-traveler': 'u', 'siren-of-the-shallows': 'u', 'coalesced-energy': 'u'}
for k, t in FIX.items():
    if k in out: out[k]['t'] = t
    if k in out and t != 'u': out[k]['m'] = None
json.dump(out, open('data/cards.json', 'w'), indent=0, ensure_ascii=False)
cnt = collections.Counter(v['t'] for v in out.values())
print(len(out), dict(cnt), 'preview', sum(v['preview'] for v in out.values()), 'champions', sum(1 for v in out.values() if v['sup']=='champion'),
      'with equip bonus', sum(1 for v in out.values() if v['mb']))
for k in ['teemo-strategist','b-f-sword','boots-of-swiftness','swift-scout','dr-mundo-expert']:
    print(k, json.dumps(out.get(k), ensure_ascii=False)[:300])

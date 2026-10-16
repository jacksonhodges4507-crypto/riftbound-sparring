# Build the single-file app: engine bundle + card data + UI.
import json, subprocess
subprocess.run(['node', 'tools/bundle.js'], check=True)
head = open('ui.html').read().split('<script>')[0]          # page head + base CSS
head = head.replace('</style>', open('src/ui.css').read() + '\n</style>')
eng = open('build/engine.js').read()
cards = json.load(open('data/cards.json')); prog = json.load(open('data/prog.json')); decks = json.load(open('data/decks.json'))
art = {k: v for k, v in json.load(open('art-map.json')).items() if k.startswith('R_')}
slim = {k: {f: v[f] for f in ['id','n','t','d','e','pw','m','mb','txt','eqtxt','tags','sup','set','sets','preview','img'] if f in v} for k, v in cards.items()}
data = 'const CARDS=' + json.dumps(slim, separators=(',',':')) + ';\nconst PROG=' + json.dumps(prog, separators=(',',':')) + ';\nconst DECKS0=' + json.dumps(decks, separators=(',',':')) + ';\nconst ART=' + json.dumps(art) + ';\n'
out = head + '<script>\n' + eng + '\n</script>\n<script>\n' + data + open('src/ui.js').read() + '\n</script>\n</body>\n</html>\n'
open('Riftbound Sparring.html', 'w').write(out); print('Riftbound Sparring.html', len(out))

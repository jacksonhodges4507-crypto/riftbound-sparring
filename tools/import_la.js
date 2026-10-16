// Convert tournament lists (text) into data/decks.json entries. usage: node tools/import_la.js lists.txt prefix "event label"
const fs = require('fs');
const C = require('../data/cards.json');
const norm = (s) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const idx = new Map(), legIdx = new Map();
for (const c of Object.values(C)) { if (c.sup === 'token' || /^recruit-/.test(c.id)) continue; const k = norm(c.n); if (!idx.has(k) || c.t !== 'B') idx.set(k, c.id); if (c.t === 'L') legIdx.set(k, c.id); }
const find = (name, legend) => {
  let k = norm(name);
  if (legend) { const parts = name.split(','); const tail = norm(parts.slice(1).join(',') || name); if (legIdx.has(tail)) return legIdx.get(tail); if (legIdx.has(k)) return legIdx.get(k); }
  if (idx.has(k)) return idx.get(k);
  const alt = [...idx.keys()].find((x) => x.replace(/ /g, '') === k.replace(/ /g, '')); if (alt) return idx.get(alt);
  return null;
};
const [file, prefix, event] = process.argv.slice(2);
const text = fs.readFileSync(file, 'utf8'); const decks = JSON.parse(fs.readFileSync('data/decks.json', 'utf8'));
const missing = new Set(); let n = 0;
for (const block of text.split(/^# /m).filter((x) => x.trim())) {
  const lines = block.split('\n'); const [title, sub, player, place] = lines[0].split('|').map((x) => x.trim());
  const get = (k) => (lines.find((l) => l.startsWith(k + ':')) || '').slice(k.length + 1).trim();
  const list = (s) => { const o = {}; for (const part of s.split(',').map((x) => x.trim()).filter(Boolean)) { const m = part.match(/^(\d+)\s+(.+)$/); const id = find(m[2]); if (!id) { missing.add(m[2]); continue; } o[id] = (o[id] || 0) + +m[1]; } return o; };
  const legend = find(get('L'), true), champ = find(get('C'));
  if (!legend) missing.add('LEGEND ' + get('L')); if (!champ) missing.add('CHAMP ' + get('C'));
  const runes = {}; for (const part of get('R').split(',')) { const m = part.trim().match(/^(\d+)\s+(\w+)/); runes[m[2].toLowerCase()] = +m[1]; }
  const bfs = get('B').split(',').map((x) => { const id = find(x.trim()); if (!id) missing.add('BF ' + x.trim()); return id; }).filter(Boolean);
  const main = list(get('M')), side = list(get('S'));
  // a list that counts the champion in the main deck: take one copy out
  let cnt = Object.values(main).reduce((a, b) => a + b, 0);
  if (cnt === 40 && main[champ]) { main[champ]--; if (!main[champ]) delete main[champ]; cnt--; }
  const key = prefix + '-' + norm(title + ' ' + player).replace(/ /g, '-');
  decks[key] = { name: title, sub: sub.replace(/ \(.*\)$/, ''), src: `${place}, ${event} · ${player}`, event, player, place, legend, champ, runes, bfs, main, side };
  if (cnt !== 39) console.log('COUNT', key, cnt);
  n++;
}
fs.writeFileSync('data/decks.json', JSON.stringify(decks, null, 1));
console.log('decks', n, 'missing', [...missing]);

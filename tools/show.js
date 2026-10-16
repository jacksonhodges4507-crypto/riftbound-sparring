// show cards with unparsed text: node tools/show.js from count
const cov = require('../data/cover.json'), C = require('../data/cards.json'), P = require('../data/prog.json');
const HAND = (() => { const RB = require('../build/engine.js'); return RB.HAND; })();
const from = +process.argv[2] || 0, n = +process.argv[3] || 40;
const ids = Object.keys(cov).filter((id) => cov[id].unparsed && cov[id].unparsed.length && C[id].t !== 'L' && !HAND[id]);
console.log('remaining', ids.length);
for (const id of ids.slice(from, from + n)) {
  const c = C[id];
  console.log(`\n## ${id} [${c.t} ${c.e ?? ''}${c.pw ? '+' + c.pw + 'P' : ''}${c.m != null ? ' m' + c.m : ''} ${c.d.join('/')}] ${c.tags && c.tags.length ? '{' + c.tags.join(',') + '}' : ''}`);
  console.log('  TXT: ' + c.txt.replace(/\n/g, ' / '));
  if (c.eqtxt) console.log('  EQ: ' + c.eqtxt);
  console.log('  BAD: ' + cov[id].unparsed.map((u) => u.line).join(' || '));
  const ok = JSON.stringify(P[id]).replace(/"/g, '');
  if (P[id].ab.length || P[id].eq.length || Object.keys(P[id].kw).length) console.log('  HAVE: ' + ok.slice(0, 600));
}

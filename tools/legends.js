// For each legend: play random games with it and report how often its abilities actually did something.
const RB = require('../build/engine.js');
const cards = require('../data/cards.json'), prog = require('../data/prog.json');
RB.loadCards(cards, prog, RB.HAND);
const C = RB.C; const all = Object.values(C).filter((c) => !c.token);
let seed = 5; const R = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const only = process.argv[2];
function deckFor(leg) {
  const doms = leg.d && leg.d.length ? leg.d : ['fury', 'calm'];
  const ok = (c) => !c.d.length || c.d.every((d) => doms.includes(d));
  const champs = all.filter((c) => c.t === 'u' && ok(c) && c.sup === 'champion');
  // favour cards that share a tag/word with the legend's text so synergies show up
  const pool = all.filter((c) => ['u', 's', 'g'].includes(c.t) && ok(c));
  const main = {}; let n = 0;
  while (n < 39) { const c = pool[Math.floor(R() * pool.length)]; if ((main[c.id] || 0) >= 3) continue; main[c.id] = (main[c.id] || 0) + 1; n++; }
  const bfs = all.filter((c) => c.t === 'B'); const pick = () => bfs[Math.floor(R() * bfs.length)].id;
  return { name: leg.n, legend: leg.id, champ: champs.length ? champs[Math.floor(R() * champs.length)].id : null, runes: { [doms[0]]: 6, [doms[1] || doms[0]]: 6 }, bfs: [pick(), pick(), pick()], main };
}
const res = [];
for (const leg of all.filter((c) => c.t === 'L' && (!only || c.id === only))) {
  RB.STATS.fired = {}; let errors = 0, games = 0;
  for (let g = 0; g < 25; g++) {
    try {
      const s = RB.newGame(deckFor(leg), deckFor(leg), g % 2, 100 + g); RB.mulligan(s, 0, []); RB.mulligan(s, 1, []); RB.beginGame(s); RB.advance(s);
      let steps = 0;
      while (s.winner == null && steps < 3000 && s.turnNo < 50) {
        const p = RB.actor(s); if (p == null) { RB.advance(s); if (RB.actor(s) == null) break; continue; }
        const acts = RB.legal(s, p); const non = acts.filter((x) => x.t !== 'end' && x.t !== 'pass');
        // prefer legend abilities when available so they get exercised
        const leg = non.filter((x) => x.t === 'ab' && x.src === 'L');
        const a = leg.length && R() < 0.5 ? leg[0] : non.length && R() < 0.85 ? non[Math.floor(R() * non.length)] : acts.find((x) => x.t === 'end' || x.t === 'pass') || acts[0];
        RB.apply(s, a); steps++;
      }
      games++;
    } catch (e) { errors++; if (errors === 1) console.log(leg.id, e.stack.split('\n').slice(0, 3).join(' | ')); }
    RB.clearLog();
  }
  res.push([leg.id, RB.STATS.fired[leg.id] || 0, errors]);
}
for (const r of res.sort((a, b) => a[1] - b[1])) console.log(String(r[1]).padStart(5), r[2] ? 'ERR' + r[2] : '    ', r[0]);

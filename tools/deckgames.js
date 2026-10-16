// AI-vs-AI games between the built-in decks: crashes, stalls and win rates. usage: node tools/deckgames.js [games-per-deck] [prefix]
const RB = require('../build/engine.js');
RB.loadCards(require('../data/cards.json'), require('../data/prog.json'), RB.HAND);
const D = require('../data/decks.json'); const G = +process.argv[2] || 2, pre = process.argv[3] || '';
const keys = Object.keys(D).filter((k) => k.startsWith(pre)); const res = {}; let errs = 0, stalls = 0;
for (let i = 0; i < keys.length; i++) for (let g = 0; g < G; g++) {
  const a = keys[i], b = keys[(i + 1 + g * 7) % keys.length];
  try {
    const s = RB.newGame(D[a], D[b], g % 2, 500 + i * 13 + g); RB.mulligan(s, 0, []); RB.mulligan(s, 1, []); RB.beginGame(s); RB.advance(s);
    let steps = 0;
    while (s.winner == null && s.turnNo < 45 && steps < 2500) { const p = RB.actor(s); if (p == null) { RB.advance(s); if (RB.actor(s) == null) break; continue; } RB.apply(s, RB.aiHeuristic(s, p, 'normal')); steps++; }
    if (s.winner == null) { stalls++; console.log('no winner', a, 'vs', b, 'turn', s.turnNo, 'pts', s.players.map((x) => x.pts)); }
    for (const [k, w] of [[a, 0], [b, 1]]) { res[k] = res[k] || { w: 0, n: 0 }; res[k].n++; if (s.winner === w) res[k].w++; }
  } catch (e) { errs++; console.log('ERROR', a, 'vs', b, e.stack.split('\n').slice(0, 3).join(' | ')); }
  RB.clearLog();
}
console.log('errors', errs, 'stalls', stalls);
console.log(Object.entries(res).sort((x, y) => y[1].w / y[1].n - x[1].w / x[1].n).map(([k, v]) => `${k} ${v.w}/${v.n}`).join('\n'));

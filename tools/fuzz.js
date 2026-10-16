// Play many games to shake out engine bugs. usage: node tools/fuzz.js [games] [mode: random|ai] [decks: builtin|pool] [seed]
const RB = require('../build/engine.js');
const cards = require('../data/cards.json'), prog = require('../data/prog.json'), DECKS = require('../data/decks.json');
RB.loadCards(cards, prog, RB.HAND);
const N = +process.argv[2] || 50, mode = process.argv[3] || 'random', pool = process.argv[4] || 'builtin';
let seed = +process.argv[5] || 1;
const R = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const C = RB.C;
const all = Object.values(C).filter((c) => !c.token);
function randDeck() {
  const L = all.filter((c) => c.t === 'L'); const leg = L[Math.floor(R() * L.length)];
  const doms = leg.d && leg.d.length ? leg.d : ['fury', 'calm'];
  const ok = (c) => !c.d.length || c.d.every((d) => doms.includes(d));
  const champs = all.filter((c) => c.t === 'u' && ok(c) && c.sup === 'champion');
  const pool = all.filter((c) => ['u', 's', 'g'].includes(c.t) && ok(c));
  const main = {}; let n = 0;
  while (n < 39) { const c = pool[Math.floor(R() * pool.length)]; if ((main[c.id] || 0) >= 3) continue; main[c.id] = (main[c.id] || 0) + 1; n++; }
  const bfs = all.filter((c) => c.t === 'B'); const pick = () => bfs[Math.floor(R() * bfs.length)].id;
  return { name: leg.n, legend: leg.id, champ: champs.length ? champs[Math.floor(R() * champs.length)].id : null, runes: { [doms[0]]: 6, [doms[1] || doms[0]]: 6 }, bfs: [pick(), pick(), pick()], main };
}
const stats = { games: 0, errors: 0, stuck: 0, turns: 0, unauto: {}, errs: {} };
const usedCards = {};
for (let g = 0; g < N; g++) {
  const keys = Object.keys(DECKS);
  const D0 = pool === 'pool' ? randDeck() : DECKS[keys[Math.floor(R() * keys.length)]];
  const D1 = pool === 'pool' ? randDeck() : DECKS[keys[Math.floor(R() * keys.length)]];
  let s;
  try {
    s = RB.newGame(D0, D1, g % 2, seed + g);
    RB.mulligan(s, 0, []); RB.mulligan(s, 1, []); RB.beginGame(s); RB.advance(s);
    let steps = 0, last = null;
    while (s.winner == null && steps < 4000 && s.turnNo < 60) {
      const p = RB.actor(s);
      if (p == null) { RB.advance(s); if (RB.actor(s) == null && s.winner == null) { stats.stuck++; console.log('STUCK', g, s.mode, s.exec.length, JSON.stringify(s.exec[s.exec.length - 1] && s.exec[s.exec.length - 1].eff[s.exec[s.exec.length - 1].i]).slice(0, 200)); break; } continue; }
      let a;
      if (mode === 'ai') a = RB.aiHeuristic(s, p, 'normal');
      else {
        const acts = RB.legal(s, p); if (!acts.length) { stats.stuck++; console.log('NO ACTIONS', g, s.mode, s.choice && s.choice.kind); break; }
        const non = acts.filter((x) => x.t !== 'end' && x.t !== 'pass');
        a = non.length && R() < 0.85 ? non[Math.floor(R() * non.length)] : acts.find((x) => x.t === 'end' || x.t === 'pass') || acts[0];
      }
      if (a.t === 'play') usedCards[a.cid] = (usedCards[a.cid] || 0) + 1;
      last = a; RB.apply(s, a); steps++;
    }
    stats.turns += s.turnNo; if (s.winner != null) stats.won = (stats.won || 0) + 1;
  } catch (e) {
    stats.errors++; const k = (e.stack || String(e)).split('\n').slice(0, 3).join(' | ');
    stats.errs[k] = (stats.errs[k] || 0) + 1;
  }
  for (const l of RB.getLog()) { const m = l.msg.match(/effect "(\w+)" isn't automated/); if (m) stats.unauto[m[1]] = (stats.unauto[m[1]] || 0) + 1; }
  RB.clearLog();
  stats.games++;
}
console.log(JSON.stringify({ games: stats.games, won: stats.won, errors: stats.errors, stuck: stats.stuck, avgTurns: (stats.turns / stats.games).toFixed(1), unauto: stats.unauto, distinctCardsPlayed: Object.keys(usedCards).length }, null, 1));
for (const [k, v] of Object.entries(stats.errs).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(v, k);

// For every card: games where both decks are full of it; report crashes and abilities that never fire.
// usage: node tools/cardfuzz.js [games=6] [filter-substring]
const RB = require('../build/engine.js');
const cards = require('../data/cards.json'), prog = require('../data/prog.json');
RB.loadCards(cards, prog, RB.HAND);
RB.STATS.trace = (s) => JSON.stringify([s.objs.map((o) => [o.id, o.ctrl, o.loc, o.ex, o.dmg, o.mod, o.buff, o.emp, o.stun, o.att, o.kwT, o.kwP, o.temp, o.dbl, o.prevent, o.saves && o.saves.length, o.setBase]), s.players.map((p) => [p.hand.length, p.deck.length, p.deck[0], p.trash.length, p.banished.length, p.pts, p.xp, p.runes.length, p.runes.filter((r) => r.ex).length, p.legEx, p.legEmp, p.pool.length, (p.playable || []).length]), s.ctrl, s.turnFx, s.delayed.length, s.chain.map((x) => x.countered), s.bfs.map((b) => b.id), s.endFx.length]);
const deadTrig = {};
const C = RB.C; const all = Object.values(C).filter((c) => !c.token && c.id !== 'tok-gold');
const G = +process.argv[2] || 6, only = process.argv[3];
let seed = 9; const R = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const legends = all.filter((c) => c.t === 'L'), bfs = all.filter((c) => c.t === 'B');
function deckWith(card) {
  const doms = card.d && card.d.length ? card.d.slice() : ['fury'];
  const legs = legends.filter((l) => doms.every((d) => l.d.includes(d)));
  const leg = legs.length ? legs[Math.floor(R() * legs.length)] : legends[Math.floor(R() * legends.length)];
  const ld = leg.d.length ? leg.d : doms;
  const ok = (c) => !c.d.length || c.d.every((d) => ld.includes(d));
  const pool = all.filter((c) => ['u', 's', 'g'].includes(c.t) && ok(c));
  const main = {}; let n = 0;
  if (['u', 's', 'g'].includes(card.t)) { main[card.id] = 14; n = 14; }
  while (n < 39) { const c = pool[Math.floor(R() * pool.length)]; main[c.id] = (main[c.id] || 0) + 1; n++; }
  const bf = card.t === 'B' ? card.id : bfs[Math.floor(R() * bfs.length)].id;
  return { name: leg.n, legend: card.t === 'L' ? card.id : leg.id, champ: null, runes: { [ld[0]]: 6, [ld[1] || ld[0]]: 6 }, bfs: [bf, bf, bf], main };
}
const errs = {}, quiet = [], crashes = [];
let done = 0; let T0 = Date.now();
for (const card of all.filter((c) => !only || c.id.includes(only))) {
  if (card.t === 'r') continue;
  RB.STATS.fired = {}; RB.STATS.done = {}; RB.STATS.changed = {}; let ec = 0;
  for (let g = 0; g < G; g++) {
    let s;
    try {
      s = RB.newGame(deckWith(card), deckWith(card), g % 2, 1000 + g, { bf0: card.t === 'B' ? card.id : undefined }); RB.mulligan(s, 0, []); RB.mulligan(s, 1, []); RB.beginGame(s); RB.advance(s);
      let steps = 0;
      while (s.winner == null && steps < 2500 && s.turnNo < 40) {
        const p = RB.actor(s); if (p == null) { RB.advance(s); if (RB.actor(s) == null) { if (s.winner == null) throw new Error('stuck in ' + s.mode); break; } continue; }
        const acts = RB.legal(s, p); if (!acts.length) throw new Error('no legal actions in ' + s.mode + ' ' + (s.choice && s.choice.kind));
        const non = acts.filter((x) => x.t !== 'end' && x.t !== 'pass');
        const mine = non.filter((x) => x.cid === card.id || (x.t === 'ab' && ((x.src === 'L' && card.t === 'L') || (typeof x.src === 'number' && RB.ob(s, x.src) && RB.ob(s, x.src).cid === card.id))));
        const a = mine.length && R() < 0.7 ? mine[Math.floor(R() * mine.length)] : non.length && R() < 0.8 ? non[Math.floor(R() * non.length)] : acts.find((x) => x.t === 'end' || x.t === 'pass') || acts[0];
        RB.apply(s, a); steps++;
        for (const o of s.objs) if (o.loc !== 'base' && o.loc !== 0 && o.loc !== 1) throw new Error('bad loc ' + JSON.stringify(o.loc) + ' on ' + o.cid + ' after ' + JSON.stringify(a).slice(0, 200));
      }
    } catch (e) { ec++; const k = (e.stack || String(e)).split('\n').slice(0, 3).join(' | '); errs[k] = (errs[k] || []).concat(card.id); }
    RB.clearLog();
  }
  if (ec) crashes.push(card.id + ' x' + ec);
  const hasAb = card.ab.some((a) => a.kind === 'trig' || a.kind === 'act') || card.eqab.some((a) => a.kind === 'trig');
  if (hasAb && !RB.STATS.fired[card.id]) quiet.push(card.id);
  if (RB.STATS.done[card.id] >= 3 && !RB.STATS.changed[card.id]) deadTrig[card.id] = RB.STATS.done[card.id];
  done++; if (process.env.TRACE) console.error(card.id, Date.now() - T0);
}
console.log('triggers that ran but never changed anything:', Object.entries(deadTrig).map(([k, v]) => k + 'x' + v).join(' '));
console.log('cards', done, 'crashing', crashes.length, 'never fired', quiet.length);
for (const [k, v] of Object.entries(errs).sort((a, b) => b[1].length - a[1].length).slice(0, 25)) console.log(v.length, k, '::', [...new Set(v)].slice(0, 6).join(' '));
require('fs').writeFileSync(require('path').join(__dirname, '..', 'build', 'quiet.txt'), quiet.join('\n'));

// Scenario helpers: build an exact board, act, and check what happened.
const RB = require('../build/engine.js');
RB.loadCards(require('../data/cards.json'), require('../data/prog.json'), RB.HAND);
const C = RB.C;
const filler = { legend: 'scorn-of-the-moon', runes: { chaos: 6, mind: 6 }, bfs: ['rockfall-path'], main: { 'patched-porobot': 39 } };
// spec: { first, p0: {legend, hand:[cid], base:[cid|{cid,...}], bf0:[..], bf1:[..], runes:N|[dom...], deck:[cid], trash:[cid], xp, pts, gear:[..]}, p1: {...}, bfs:[id,id], ctrl:[p|null,p|null] }
function scene(spec) {
  RB.setLog(true); RB.clearLog();
  const D = (x) => Object.assign({}, filler, { legend: (x && x.legend) || filler.legend });
  const s = RB.newGame(D(spec.p0), D(spec.p1), spec.first || 0, spec.seed || 1, { bf0: (spec.bfs || [])[0] || 'rockfall-path', bf1: (spec.bfs || [])[1] || 'veiled-temple' });
  if (spec.bfs && spec.bfs[0] === 'rockfall-path' && !spec.keepRockfall) {}
  s.players.forEach((pl) => { pl.hand = []; pl.mulled = true; });
  s.mode = 'main'; s.turnNo = spec.turn || 3; s.active = spec.first || 0; s.firstTurn = [false, false];
  s.players[0].human = true; s.players[1].human = !!spec.bothHuman;
  for (const p of [0, 1]) {
    const x = spec['p' + p] || {}; const pl = s.players[p];
    pl.hand = (x.hand || []).slice(); if (x.deck) pl.deck = x.deck.slice(); if (x.trash) pl.trash = x.trash.slice();
    pl.xp = x.xp || 0; pl.pts = x.pts || 0; pl.champ = x.champ || null;
    const rs = Array.isArray(x.runes) ? x.runes : Array(x.runes != null ? x.runes : 6).fill((C[pl.legend].d || ['fury'])[0] || 'fury');
    pl.runes = rs.map((d) => ({ id: s.nid++, d, ex: false }));
    const put = (list, loc) => (list || []).map((e) => { const o = typeof e === 'string' ? { cid: e } : e; return RB.newObj(s, Object.assign({ k: C[o.cid].t, owner: p, loc, ex: false }, o)); });
    pl.objs = { base: put(x.base, 'base'), bf0: put(x.bf0, 0), bf1: put(x.bf1, 1), gear: put(x.gear, 'base') };
  }
  s.ctrl = spec.ctrl || [0, 1].map((i) => { const o = [...new Set(RB.unitsAt(s, i).map((u) => u.ctrl))]; return o.length === 1 ? o[0] : null; });
  RB.clearLog();
  return s;
}
const ids = (s, p, where) => s.players[p].objs[where].map((o) => o.id);
function find(s, cid, p) { return s.objs.find((o) => o.cid === cid && (p == null || o.ctrl === p)); }
function acts(s, p) { return RB.legal(s, p == null ? RB.actor(s) : p); }
function play(s, cid, match) { const a = acts(s).find((x) => x.t === 'play' && x.cid === cid && (!match || match(x))); if (!a) throw new Error('cannot play ' + cid + '; legal: ' + acts(s).map((x) => RB.actText(s, x)).join(' | ')); RB.apply(s, a); return a; }
function pick(s, pred) { const a = acts(s).find((x) => x.t === 'pick' && pred(x)); if (!a) throw new Error('no pick; choice ' + JSON.stringify(s.choice && s.choice.data && s.choice.data.why) + ' opts ' + acts(s).map((x) => x.label).join(' | ')); RB.apply(s, a); }
function passAll(s, limit) { for (let i = 0; i < (limit || 20); i++) { RB.advance(s); const p = RB.actor(s); if (p == null) break; if (s.choice) { if (s.players[s.choice.p].human && !s.autoAll) return; RB.answer(s, RB.defaultPick(s)); continue; } const a = acts(s, p).find((x) => x.t === 'pass'); if (!a) return; RB.apply(s, a); } }
function logText() { return RB.getLog().map((l) => l.msg).join('\n'); }
let fails = 0, passes = 0;
function check(name, cond, info) { if (cond) passes++; else { fails++; console.log('FAIL', name, info != null ? '— ' + info : ''); } }
function done() { console.log(`${passes} passed, ${fails} failed`); process.exitCode = fails ? 1 : 0; }
module.exports = { RB, C, scene, ids, find, acts, play, pick, passAll, logText, check, done };

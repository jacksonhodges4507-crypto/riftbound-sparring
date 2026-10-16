/* Riftbound Sparring — engine v3, part 1: card data, game state, zones, statics, costs.
   Every card's behaviour comes from its compiled program (data/prog.json) or a hand-written
   override (src/hand.js). The engine itself knows only the rules of the game. */
'use strict';
const DOMS = { fury: 'Fury', calm: 'Calm', mind: 'Mind', body: 'Body', chaos: 'Chaos', order: 'Order' };
const SPEED = { N: 'Normal', A: 'Action', R: 'Reaction' };
const BASE_WIN = 8;

/* ---------------- card database ---------------- */
let C = {};
function powerReq(card) {
  const n = card.pw || 0; if (!n) return [];
  const d = card.d && card.d.length ? card.d.join('|') : 'any';
  return Array(n).fill(d);
}
function loadCards(cards, prog, hand) {
  C = {};
  for (const [id, c] of Object.entries(cards)) {
    let pr = prog[id] || { kw: {}, ab: [], eq: [] };
    const h = hand && hand[id];
    if (h) pr = h.plus || h.eqPlus ? { kw: Object.assign({}, pr.kw, h.kw || {}), ab: (h.keep ? (pr.ab || []).filter((a, i) => h.keep.includes(i)) : pr.ab || []).concat(h.plus || []), eq: (pr.eq || []).concat(h.eqPlus || []) } : Object.assign({ kw: {}, ab: [], eq: [] }, h);
    const kw = Object.assign({}, pr.kw || {});
    const card = Object.assign({}, c, { kw, ab: pr.ab || [], eqab: pr.eq || [], p: powerReq(c), hand: !!(hand && hand[id]) });
    if (h && h.manual) card.manual = h.manual;
    if (card.ab.some((a) => a.zone === 'trash')) card.trashTrig = true;
    if (card.t === 's') card.sp = kw.reaction ? 'R' : kw.action ? 'A' : 'N';
    else if (kw.reaction || kw['quick-draw']) card.sp = 'R';
    if (card.e == null && ['u', 's', 'g'].includes(card.t)) card.e = 0;
    if (card.t === 'u' && card.m == null) card.m = 0;
    C[id] = card;
  }
  // built-in tokens
  tokenCard('Gold', 'g', null, {}, [{ kind: 'act', cost: { e: 0, pw: [], ex: true, killSelf: true }, speed: 'R', eff: [{ op: 'add', res: { e: 0, pw: ['any'] } }], limit: {} }]);
  return C;
}
// tokens are created on demand: "Play a 3 {might} Mech unit token" -> id 'tok-mech-3'
function tokenCard(name, t, m, kw, ab) {
  const id = 'tok-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + (m != null ? '-' + m : '') + (kw && Object.keys(kw).length ? '-' + Object.keys(kw).sort().join('-') : '');
  if (!C[id]) {
    const base = Object.values(C).find((c) => c.n === name && c.t === t && !c.tokenOf);
    C[id] = { id, n: name, t, d: [], e: 0, pw: 0, p: [], m: m != null ? m : (base ? base.m : 1), txt: base ? base.txt : '', tags: [name], sup: 'token', token: true, kw: Object.assign({}, base ? base.kw : {}, kw || {}), ab: ab || (base ? base.ab : []), eqab: [], img: base ? base.img : null };
  }
  return id;
}

/* ---------------- logging ---------------- */
let LOG = [], logOn = true;
function clearLog() { LOG = []; }
function log(msg, cls) { if (logOn) LOG.push({ msg, cls: cls || 'sys' }); }
const P = (p) => (p === 0 ? 'You' : 'AI');
const vb = (p, you, ai) => (p === 0 ? you : ai);
const Pos = (p) => (p === 0 ? 'your' : "AI's");
const cn = (cid) => (C[cid] ? C[cid].n : cid);

/* ---------------- random ---------------- */
function rnd(s) { s.seed = (s.seed + 0x6D2B79F5) | 0; let t = s.seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
function shuffle(s, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd(s) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function expand(list) { const a = []; for (const k in list) for (let i = 0; i < list[k]; i++) a.push(k); return a; }
const clone = (s) => (typeof structuredClone === 'function' ? structuredClone(s) : JSON.parse(JSON.stringify(s)));

/* ---------------- objects and zones ---------------- */
const ob = (s, id) => (id == null ? null : s.objs.find((o) => o.id === id) || null);
const units = (s) => s.objs.filter((o) => o.k === 'u');
const unitsAt = (s, loc, ctrl) => s.objs.filter((o) => o.k === 'u' && o.loc === loc && (ctrl == null || o.ctrl === ctrl));
const unitsOf = (s, p) => s.objs.filter((o) => o.k === 'u' && o.ctrl === p);
const gearOf = (s, p) => s.objs.filter((o) => o.k === 'g' && o.ctrl === p);
const eqOf = (s, u) => s.objs.filter((g) => g.k === 'g' && g.att === u.id);
const bfName = (s, i) => (i === 'base' ? 'base' : i == null ? '?' : C[s.bfs[i].id] ? C[s.bfs[i].id].n : 'battlefield');
const bfAb = (s, loc) => (typeof loc === 'number' && s.bfs[loc] && C[s.bfs[loc].id] ? C[s.bfs[loc].id].ab : []);
const winScore = (s) => BASE_WIN + s.bfs.reduce((a, b) => a + (staticsOfCard(b.id).filter((x) => x.s === 'winPlus').reduce((x, y) => x + y.n, 0)), 0);
const isEq = (cid) => C[cid] && C[cid].t === 'g' && !!C[cid].kw.equip;
const inCombat = (s, u) => !!(s.sd && s.sd.combat && u.loc === s.sd.bf);

function newObj(s, o) {
  const x = Object.assign({ id: s.nid++, dmg: 0, mod: 0, ex: false, stun: false, noMove: false, shroud: false, att: null, buff: 0, emp: 0, kwT: {}, kwP: {}, temp: false, token: false, moves: 0, born: s.turnNo, prevent: 0, saves: [] }, o);
  if (x.ctrl == null) x.ctrl = x.owner;
  if (C[x.cid] && C[x.cid].token) x.token = true;
  if (C[x.cid] && C[x.cid].kw.temporary) x.temp = true;
  s.objs.push(x);
  return x;
}

/* ---------------- statics: might and keywords ---------------- */
function staticsOfCard(cid) { const c = C[cid]; return c ? c.ab.filter((a) => a.kind === 'static') : []; }
function gateOK(s, a, src, p) {
  const g = a.gate; if (!g) return true;
  if (g.emp && !(src && (src.emp > 0 || (src.isLegend && s.players[p].legEmp > 0)))) return false;
  if (g.level && s.players[p].xp < g.level) return false;
  if (g.legion && !(s.players[p].tc.cards >= 1)) return false;
  return true;
}
// sources of static abilities on the board: units, gear, legends, battlefields
function* staticSources(s) {
  for (const o of s.objs) {
    const c = C[o.cid]; if (!c) continue;
    for (const a of c.ab) if (a.kind === 'static') yield { a, src: o, p: o.ctrl };
    if (o.att != null) { const host = ob(s, o.att); if (host) for (const a of c.eqab) if (a.kind === 'static') yield { a, src: host, p: host.ctrl, via: o }; }
  }
  for (const p of [0, 1]) { const L = s.players[p].legend; if (L && C[L]) for (const a of C[L].ab) if (a.kind === 'static') yield { a, src: { isLegend: true, ctrl: p, cid: L, loc: null, id: 'L' + p }, p }; }
  for (let i = 0; i < s.bfs.length; i++) { const b = s.bfs[i]; if (C[b.id]) for (const a of C[b.id].ab) if (a.kind === 'static') yield { a, src: { isBf: true, bf: i, cid: b.id, ctrl: s.ctrl[i], loc: i, id: 'B' + i }, p: s.ctrl[i] }; }
}
function condOK(s, cond, ctx) { return cond ? evalCond(s, cond, ctx) : true; }

function baseMight(s, u) {
  const c = C[u.cid]; let m = u.setBase != null ? u.setBase : (u.copyOf ? C[u.copyOf].m : c.m);
  return m || 0;
}
let _mightDepth = 0;
function might(s, u) {
  if (!u) return 0;
  if (_mightDepth > 3) return baseMight(s, u) + (u.mod || 0);
  _mightDepth++;
  try {
    let m = baseMight(s, u) + (u.mod || 0) + (u.buff || 0) * buffValue(s, u);
    for (const g of eqOf(s, u)) { const gc = C[g.cid]; let b = gc.mb != null ? gc.mb : 0; if (u.cid && C[u.cid].ab.some((a) => a.s === 'doubleEqBonus')) b *= 2; m += b; for (const a of gc.eqab) { if (a.s === 'mightIfFresh' && g.attTurn === s.turnNo) m += a.n; if (a.s === 'eqMight' && gateOK(s, a, u, u.ctrl)) m += a.n; } }
    for (const { a, src, p } of staticSources(s)) {
      if (a.s !== 'might' && a.s !== 'aura' && a.s !== 'mightPer') continue;
      if (!gateOK(s, a, src, p)) continue;
      if (a.s === 'might' && src === u) {
        if (!condOK(s, a.cond, { s, p: u.ctrl, self: u.id })) continue;
        m += a.n * (a.per ? countOf(s, a.per, { p: u.ctrl, self: u.id }) : 1);
      } else if (a.s === 'aura' && a.n) {
        if (!condOK(s, a.cond, { s, p, self: src.id })) continue;
        if (matchesF(s, u, a.f, { p: src.isBf ? u.ctrl : p, self: src.id, here: src.loc, bf: src.isBf ? src.bf : undefined })) {
          if (a.min1 || a.n < 0) { /* minimum handled below */ }
          m += a.n;
        }
      }
    }
    if (s.sd && s.sd.combat && u.loc === s.sd.bf && u.k === 'u') {
      const k = kwOf(s, u);
      if (u.ctrl === s.sd.att) m += (k.assault || 0) + (u.kwT.assaultFromShield ? (k.shield || 0) : 0);
      else {
        m += k.shield || 0;
        const st = staticsOn(s, 'defendAlone', u.ctrl); if (st && unitsAt(s, u.loc, u.ctrl).length === 1) m += st.n;
        if (bfAb(s, u.loc).some((a) => a.s === 'defendAloneMinus') && unitsAt(s, u.loc, u.ctrl).length === 1) m -= 2;
      }
    }
    if (u.dbl) m *= Math.pow(2, u.dbl);
    if (u.min1Floor && m < 1) m = 1;
    return Math.max(0, m);
  } finally { _mightDepth--; }
}
function buffValue(s, u) { return 1 + (s.turnFx.buffBonus && s.turnFx.buffBonus[u.ctrl] ? s.turnFx.buffBonus[u.ctrl] : 0); }
const KWNUM = new Set(['assault', 'shield', 'deflect', 'hunt']);
function addKw(out, kw) { for (const [k, v] of Object.entries(kw || {})) { if (KWNUM.has(k)) out[k] = (out[k] || 0) + (v === true ? 1 : v); else out[k] = v; } }
let _kwDepth = 0;
function kwOf(s, o) {
  if (!o) return {};
  if (_kwDepth > 2) { const c0 = C[o.copyOf || o.cid]; const r = {}; addKw(r, c0.kw); addKw(r, o.kwP); addKw(r, o.kwT); return r; }
  _kwDepth++;
  try { return kwOf1(s, o); } finally { _kwDepth--; }
}
function kwOf1(s, o) {
  const c = C[o.copyOf || o.cid]; const out = {};
  addKw(out, c.kw);
  addKw(out, o.kwP); addKw(out, o.kwT);
  if (o.k === 'u') for (const g of eqOf(s, o)) for (const a of C[g.cid].eqab) if (a.kind === 'grantKw') addKw(out, a.kw);
  if (o.k === 'u' && eqOf(s, o).length && staticsOn(s, 'eqGiveAssault', o.ctrl)) addKw(out, { assault: eqOf(s, o).length });
  for (const { a, src, p } of staticSources(s)) {
    if (a.s === 'kw' && src === o) { if (gateOK(s, a, src, p) && condOK(s, a.cond, { s, p, self: o.id })) addKw(out, a.kw); }
    else if (a.s === 'might' && a.kw && src === o) { if (gateOK(s, a, src, p) && condOK(s, a.cond, { s, p, self: o.id })) addKw(out, a.kw); }
    else if (a.s === 'kwN' && src === o) { if (gateOK(s, a, src, p)) out[a.kw] = (out[a.kw] || 0) + countOf(s, a.per, { p, self: o.id }); }
    else if (a.s === 'aura' && a.kw && (o.k === 'u' || (o.k === 'g' && a.f && a.f.type === 'g'))) {
      if (!gateOK(s, a, src, p) || !condOK(s, a.cond, { s, p, self: src.id })) continue;
      if (matchesF(s, o, a.f, { p: src.isBf ? o.ctrl : p, self: src.id, here: src.loc })) addKw(out, a.kw);
    }
  }
  if (out.temporary) out.temporary = true;
  return out;
}
const hasKw = (s, o, k) => !!kwOf(s, o)[k];
function hasStatic(s, o, name) {
  const c = C[o.copyOf || o.cid]; if (!c) return null;
  for (const a of c.ab) if (a.kind === 'static' && a.s === name && gateOK(s, a, o, o.ctrl) && condOK(s, a.cond, { s, p: o.ctrl, self: o.id })) return a;
  if (o.k === 'u') for (const g of eqOf(s, o)) for (const a of C[g.cid].eqab) if (a.kind === 'static' && a.s === name) return a;
  return null;
}
const isMighty = (s, u) => might(s, u) >= 5;
function canBeChosen(s, o, p) {
  if (o.ctrl === p) return true;
  if (o.shroud) return false;
  const u = hasStatic(s, o, 'untargetable'); if (u && !(u.unlessCombat && inCombat(s, o))) return false;
  for (const { a, src, p: q } of staticSources(s)) if (a.s === 'auraUntargetable' && q === o.ctrl && gateOK(s, a, src, q) && matchesF(s, o, a.f, { p: q, self: src.id, here: src.loc })) return false;
  return true;
}

/* ---------------- filters and counts ---------------- */
// does object/card x match filter f, seen from player ctx.p (friendly = ctx.p's)?
function matchesF(s, o, f, ctx) {
  if (!f) return true;
  const c = C[o.copyOf || o.cid]; if (!c) return false;
  const p = ctx.p;
  if (f.type) {
    const t = o.k || c.t;
    if (f.type === 'u' && t !== 'u') return false; if (f.type === 'g' && t !== 'g') return false;
    if (f.type === 'ug' && t !== 'u' && t !== 'g') return false; if (f.type === 'eq' && !(t === 'g' && c.kw.equip)) return false;
    if (f.type === 's' && c.t !== 's') return false; if (f.type === 'L' && c.t !== 'L') return false;
  }
  if (f.who === 'friendly' && o.ctrl !== p) return false;
  if (f.who === 'enemy' && o.ctrl === p) return false;
  if (f.other && (o.id === ctx.self || o.id === ctx.selfId)) return false;
  if (f.other && ctx.self == null && (ctx.it || []).includes(o.id)) return false;
  if (f.ex === true && !o.ex) return false; if (f.ready && o.ex) return false;
  if (f.stunned && !o.stun) return false; if (f.buffed && !(o.buff > 0)) return false; if (f.damaged && !(o.dmg > 0)) return false;
  if (f.emp && !(o.emp > 0)) return false;
  if (f.attacking && !(s.sd && s.sd.combat && o.loc === s.sd.bf && o.ctrl === s.sd.att)) return false;
  if (f.defending && !(s.sd && s.sd.combat && o.loc === s.sd.bf && o.ctrl !== s.sd.att)) return false;
  if (f.inCombat && !inCombat(s, o)) return false;
  if (f.inIt && !(ctx.it || []).includes(o.id)) return false;
  if (f.decree) { const dom = f.decree; const inFight = inCombat(s, o) && unitsAt(s, o.loc).some((x) => x.ctrl !== o.ctrl && C[x.cid].d.includes(dom)); const targeted = s.chain.some((x) => x.p !== o.ctrl && C[x.cid].d.includes(dom) && (x.chosen || []).includes(o.id)); if (!inFight && !targeted) return false; }
  if (f.tagNamed) { const me = ob(s, ctx.self); if (!me || !me.namedTag || !tagsOf(s, o).includes(me.namedTag)) return false; }
  if (f.notItLoc) { const r = ob(s, firstIt(ctx)); if (r && o.loc === r.loc) return false; }
  if (f.notTrig && ctx.trig && ctx.trig.obj === o.id) return false;
  if (f.movedThisTurn && !(o.moves > 0)) return false;
  if (f.champion && !(c.sup === 'champion')) return false;
  if (f.notThere && ctx.there != null && o.loc === ctx.there) return false;
  if (f.notHere) { const me = ob(s, ctx.self); if (me && o.loc === me.loc) return false; }
  if (f.notExhausted && ctx.exhausted === o.id) return false;
  if (f.unitBfOrGear && !((o.k === 'u' && o.loc !== 'base') || o.k === 'g')) return false;
  if (f.mightGEn != null && might(s, o) < f.mightGEn) return false;
  if (f.inShowdown && !(s.sd && o.loc === s.sd.bf)) return false;
  if (f.equipped && !eqOf(s, o).length) return false;
  if (f.attached && o.att == null) return false; if (f.detached && o.att != null) return false;
  if (f.mighty && !(o.k === 'u' && isMighty(s, o))) return false;
  if (f.token === true && !o.token) return false; if (f.token === false && o.token) return false;
  if (f.dom && !c.d.includes(f.dom)) return false;
  if (f.tag && !tagsOf(s, o).includes(f.tag)) return false;
  if (f.notTag && tagsOf(s, o).includes(f.notTag)) return false;
  if (f.tagAny && !f.tagAny.some((t) => tagsOf(s, o).includes(t))) return false;
  if (f.hasKw && !kwOf(s, o)[f.hasKw]) return false; if (f.notKw && kwOf(s, o)[f.notKw]) return false;
  if (f.mightLE != null && might(s, o) > f.mightLE) return false; if (f.mightGE != null && might(s, o) < f.mightGE) return false;
  if (f.mightLT) { const ref = f.mightLT === 'self' ? ob(s, ctx.self) : ob(s, firstIt(ctx)); if (!ref || might(s, o) >= might(s, ref)) return false; }
  if (f.mightGT) { const ref = ob(s, ctx.self); if (!ref || might(s, o) <= might(s, ref)) return false; }
  if (f.costLE != null) { const lim = f.costLE === 'selfMight' ? might(s, ob(s, ctx.self)) : f.costLE; if ((c.e || 0) > lim) return false; }
  if (f.sameName && ctx.self != null) { const me = ob(s, ctx.self); if (!me || C[me.cid].n !== c.n) return false; }
  if (f.where) {
    const L = o.loc;
    if (f.where === 'bf' && (L === 'base' || L == null)) return false;
    if (f.where === 'base' && L !== 'base') return false;
    if (f.where === 'here') { const h = ctx.here !== undefined ? ctx.here : ob(s, ctx.self) ? ob(s, ctx.self).loc : ctx.snap ? ctx.snap.deadLoc : undefined; if (h == null || L !== h) return false; }
    if (f.where === 'there') { const th = ctx.there != null ? ctx.there : ctx.thereFromIt; if (th == null || L !== th) return false; }
    if (f.where === 'moveFromTo') { const t = ctx.trig || {}; if (L === 'base' || (L !== t.from && L !== t.to)) return false; }
    if (f.where === 'itloc') { const it = ob(s, firstIt(ctx)); if (!it || L !== it.loc) return false; }
    if (f.where === 'same') { /* checked on group */ }
  }
  return true;
}
function firstIt(ctx) { return ctx && ctx.it && ctx.it.length ? ctx.it[0] : null; }
function tagsOf(s, o) { const c = C[o.copyOf || o.cid]; const t = (c.tags || []).slice(); if (o.extraTag) t.push(o.extraTag); if (o.k === 'u' && s.objs) for (const g of eqOf(s, o)) for (const a of C[g.cid].eqab) if (a.s === 'grantTag') t.push(a.tag); return t; }
function countOf(s, per, ctx) {
  const p = ctx.p;
  switch (per.count) {
    case 'control': return s.objs.filter((o) => matchesF(s, o, per.f, Object.assign({ s }, ctx))).length;
    case 'trash': return s.players[p].trash.length;
    case 'points': return s.players[p].pts;
    case 'runes': return s.players[p].runes.length;
    case 'bfs': return s.ctrl.filter((x) => x === p).length;
    case 'playedThisTurn': return s.players[p].tc.cards;
    case 'nameInTrash': { const me = ob(s, ctx.self); const nm = me ? C[me.cid].n : null; return s.players[p].trash.filter((x) => C[x] && C[x].n === nm).length; }
    case 'selfEmp': { const me = ob(s, ctx.self); return me ? me.emp : 0; }
    case 'attachedEq': { const me = ob(s, ctx.self); return me ? eqOf(s, me).length : 0; }
    case 'cardNameInTrash': { const nm = C[ctx.card] ? C[ctx.card].n : null; return s.players[p].trash.filter((x) => C[x] && C[x].n === nm).length; }
    case 'tagKinds': return (per.tags || []).filter((t) => unitsOf(s, p).some((u) => tagsOf(s, u).includes(t))).length;
    case 'maxMight': return Math.max(0, ...unitsOf(s, p).map((u) => might(s, u)));
    case 'holdPts': return s.players[p].tc.holdPts || 0;
    case 'controlEq': return s.objs.filter((o) => o.ctrl === p && isEq(o.cid)).length;
    default: return 0;
  }
}

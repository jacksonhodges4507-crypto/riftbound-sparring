/* engine v3, part 4: paying costs, playing cards, abilities, moving, showdowns, combat, turns. */

/* ---------------- resources ---------------- */
const matchesD = (req, d) => req === 'any' || d === 'any' || req.split('|').includes(d);
const rank = (r) => (r === 'any' ? 2 : r.includes('|') ? 1 : 0);
function poolUsable(s, entry, purpose) {
  if (!entry.lim) return true;
  if (entry.lim === 'showdown') return !!s.sd;
  if (!purpose) return false;
  if (entry.lim === 's') return purpose.type === 's';
  if (entry.lim === 'g') return purpose.type === 'g' || purpose.type === 'ab-g';
  if (entry.lim === 'u') return purpose.type === 'u' || purpose.type === 'ab-u';
  if (entry.lim === 'ug') return purpose.type === 'u' || purpose.type === 'g';
  return true;
}
// simple "mana abilities" that can be used while paying: exhaust (and maybe kill self) to add resources
function manaSources(s, p, purpose) {
  const out = [];
  const consider = (src, a, idx, legend) => {
    if (a.kind !== 'act' || !a.eff || a.eff.length !== 1 || a.eff[0].op !== 'add') return;
    const c = a.cost || {}; if (c.e || (c.pw && c.pw.length) || c.xp || c.discard || c.recycleTrash || c.killFriendly || c.exhaustFriendly) return;
    if (c.banishTrash && !s.players[p].trash.some((x) => ['u', 'g'].includes(C[x].t))) return;
    if (c.disemp && !(legend ? s.players[p].legEmp : src.emp)) return;
    if (!c.ex && !c.killSelf) return;
    if (legend ? s.players[p].legEx : src.ex) return;
    if (a.gate && !gateOK(s, a, legend ? { isLegend: true } : src, p)) return;
    const lim = a.limit && a.limit.spendOn || null; if (!poolUsable(s, { lim }, purpose)) return;
    if (a.limit && a.limit.atBf && (legend || src.loc === 'base')) return;
    if (src && src.cid === 'tok-gold') return; // gold handled separately
    const r = a.eff[0].empRes && (legend ? s.players[p].legEmp : src.emp) ? a.eff[0].empRes : a.eff[0].res; out.push({ legend, src: legend ? null : src.id, idx, e: r.e || 0, pw: (r.pw || []).slice(), cost: c });
  };
  for (const o of s.objs) if (o.ctrl === p && o.cid !== 'tok-gold') C[o.cid].ab.forEach((a, i) => consider(o, a, i, false));
  const L = s.players[p].legend; if (L && C[L]) C[L].ab.forEach((a, i) => consider(null, a, i, true));
  return out;
}
function resources(s, p, purpose) {
  const pl = s.players[p];
  const golds = s.objs.filter((o) => o.ctrl === p && o.cid === 'tok-gold' && !o.ex);
  const pool = pl.pool.filter((x) => poolUsable(s, x, purpose));
  return { readyRunes: pl.runes.filter((r) => !r.ex), runes: pl.runes, golds, poolE: pool.filter((x) => x.e).length, poolP: pool.filter((x) => x.p).map((x) => x.p), mana: manaSources(s, p, purpose) };
}
// can player p pay cost {e, pw:[req]} for this purpose?
function planPay(s, p, cost, purpose) {
  const R = resources(s, p, purpose);
  let e = cost.e || 0;
  const reqs = (cost.pw || []).slice().sort((a, b) => rank(a) - rank(b));
  const plan = { poolE: 0, poolP: [], runesEx: [], runesRc: [], golds: [], mana: [] };
  // power first: pool power, then runes (prefer exhausted ones), mana sources, gold
  const usedR = new Set(); const poolP = R.poolP.slice(); const mana = R.mana.slice(); const golds = R.golds.slice();
  for (const req of reqs) {
    const pi = poolP.findIndex((d) => matchesD(req, d)); if (pi >= 0) { plan.poolP.push(poolP.splice(pi, 1)[0]); continue; }
    const cand = R.runes.filter((r) => !usedR.has(r.id) && matchesD(req, r.d)).sort((a, b) => b.ex - a.ex);
    if (cand.length) { usedR.add(cand[0].id); plan.runesRc.push(cand[0].id); continue; }
    const mi = mana.findIndex((m) => m.pw.some((d) => matchesD(req, d))); if (mi >= 0) { plan.mana.push(mana.splice(mi, 1)[0]); continue; }
    if (golds.length) { plan.golds.push(golds.shift().id); continue; }
    return null;
  }
  // energy: pool, ready runes not being recycled, mana sources
  const pe = Math.min(e, R.poolE); plan.poolE = pe; e -= pe;
  const ready = R.readyRunes.filter((r) => !usedR.has(r.id));
  // runes being recycled can also be exhausted first for energy
  const exFirst = R.readyRunes.filter((r) => usedR.has(r.id));
  for (const r of ready.concat(exFirst)) { if (e <= 0) break; plan.runesEx.push(r.id); e--; }
  while (e > 0) { const mi = mana.findIndex((m) => m.e > 0); if (mi < 0) return null; const m = mana.splice(mi, 1)[0]; plan.mana.push(m); e -= m.e; }
  return plan;
}
function canPay(s, p, cost, purpose) { return !!planPay(s, p, cost || { e: 0, pw: [] }, purpose); }
function execPlan(s, p, plan) {
  const pl = s.players[p];
  let ue = plan.poolE; pl.pool = pl.pool.filter((x) => { if (x.e && ue > 0) { ue--; return false; } return true; });
  for (const d of plan.poolP) { const i = pl.pool.findIndex((x) => x.p === d); if (i >= 0) pl.pool.splice(i, 1); }
  for (const id of plan.runesEx) { const r = pl.runes.find((x) => x.id === id); if (r) r.ex = true; }
  for (const id of plan.runesRc) { const i = pl.runes.findIndex((x) => x.id === id); if (i >= 0) { pl.runeDeck.push(pl.runes.splice(i, 1)[0].d); emit(s, 'recycleRune', { p }); } }
  for (const id of plan.golds) { const g = ob(s, id); STATS.fired.gold = (STATS.fired.gold || 0) + 1; if (g) { s.objs = s.objs.filter((x) => x !== g); log(`${P(p)} ${vb(p, 'spend', 'spends')} a Gold.`); goldBonus(s, p); } }
  for (const m of plan.mana) {
    { const k = m.legend ? pl.legend : (ob(s, m.src) || {}).cid; if (k) STATS.fired[k] = (STATS.fired[k] || 0) + 1; }
    if (m.cost.banishTrash) { const i = pl.trash.map((x, j) => [x, j]).filter(([x]) => ['u', 'g'].includes(C[x].t)).sort((a2, b2) => cardVal(a2[0]) - cardVal(b2[0]))[0]; if (i) { pl.trash.splice(i[1], 1); pl.banished.push(i[0]); emit(s, 'youBanish', { p, cid: i[0] }); } }
    if (m.legend) { pl.legEx = true; if (m.cost.disemp) pl.legEmp = 0; log(`${P(p)} ${vb(p, 'use', 'uses')} ${cn(pl.legend)} for resources.`); }
    else { const o = ob(s, m.src); if (o) { o.ex = true; if (m.cost.disemp) o.emp = 0; if (m.cost.killSelf) removeObj(s, o, 'trash'); } }
  }
  pl.tc.spentPow += plan.runesRc.length + plan.golds.length + plan.poolP.length;
}
function goldBonus(s, p) { const L = s.players[p].legend; if (L && C[L].ab.some((a) => a.s === 'goldExtraE') && s.players[p].pts >= winScore(s) - 3) s.players[p].pool.push({ e: 1 }); }
function checkManualPay(s, p, cost, mp) {
  const pl = s.players[p]; if (!mp) return false;
  let e = cost.e || 0;
  const pool = pl.pool.filter((x) => poolUsable(s, x, mp.purpose || null)); e -= Math.min(e, pool.filter((x) => x.e).length);
  const exR = mp.ex.map((id) => pl.runes.find((r) => r.id === id)); if (exR.some((r) => !r || r.ex)) return false;
  if (exR.length !== e) return false;
  const rcR = mp.rc.map((id) => pl.runes.find((r) => r.id === id)); if (rcR.some((r) => !r)) return false;
  let reqs = (cost.pw || []).slice().sort((a, b) => rank(a) - rank(b));
  const poolP = pool.filter((x) => x.p).map((x) => x.p);
  reqs = reqs.filter((r) => { const i = poolP.findIndex((d) => matchesD(r, d)); if (i >= 0) { poolP.splice(i, 1); return false; } return true; });
  if (rcR.length > reqs.length) return false;
  const used = new Set(); const gsel = (mp.gold || []).map((id) => ob(s, id)); if (gsel.some((g) => !g || g.cid !== 'tok-gold' || g.ctrl !== p || g.ex)) return false;
  let golds = gsel.length;
  for (const r of reqs) { const i = rcR.findIndex((x, j) => !used.has(j) && matchesD(r, x.d)); if (i >= 0) { used.add(i); continue; } if (golds > 0) { golds--; continue; } return false; }
  return used.size === rcR.length && golds === 0;
}
function payManual(s, p, cost, mp) {
  const pl = s.players[p]; let e = cost.e || 0;
  pl.pool = pl.pool.filter((x) => { if (x.e && e > 0 && poolUsable(s, x, mp.purpose || null)) { e--; return false; } return true; });
  // power requirements met from the pool first
  const usedPool = [];
  for (const r of (cost.pw || []).slice().sort((a, b) => rank(a) - rank(b))) { const i = pl.pool.findIndex((x, j) => x.p && !usedPool.includes(j) && matchesD(r, x.p) && poolUsable(s, x, mp.purpose || null)); if (i >= 0) usedPool.push(i); }
  pl.pool = pl.pool.filter((x, j) => !usedPool.includes(j));
  mp.ex.forEach((id) => { const r = pl.runes.find((r2) => r2.id === id); if (r) r.ex = true; });
  for (const id of mp.rc) { const i = pl.runes.findIndex((x) => x.id === id); if (i >= 0) { pl.runeDeck.push(pl.runes.splice(i, 1)[0].d); emit(s, 'recycleRune', { p }); } }
  for (const id of mp.gold || []) { const g = ob(s, id); STATS.fired.gold = (STATS.fired.gold || 0) + 1; if (g) { s.objs = s.objs.filter((x) => x !== g); log(`${P(p)} ${vb(p, 'spend', 'spends')} a Gold.`); goldBonus(s, p); } }
  pl.tc.spentPow += mp.rc.length + (mp.gold || []).length;
}
function pay(s, p, cost, mp, purpose) {
  if (mp) mp.purpose = purpose || mp.purpose || null;
  if (mp && checkManualPay(s, p, cost, mp)) return payManual(s, p, cost, mp);
  const plan = planPay(s, p, cost, purpose); if (plan) execPlan(s, p, plan);
}
function autoPayPlan(s, p, cost) { const plan = planPay(s, p, cost, null); if (!plan) return null; return { ex: plan.runesEx, rc: plan.runesRc, gold: plan.golds }; }

/* ---------------- costs of actions ---------------- */
function cardStatics(s, cid, name) { return C[cid].ab.filter((a) => a.kind === 'static' && a.s === name); }
function playCost(s, p, a) {
  const c = C[a.cid]; let e = c.e || 0, pw = (c.p || []).slice(); const extra = {};
  if (a.src === 'hidden') e = 0;
  if (a.src === 'flow' && c.kw.flow) { e = c.kw.flow.e; pw = c.kw.flow.pw.slice(); if (staticsOn(s, 'flowLess', p)) e = Math.max(1, e - 2); }
  // cost reductions printed on the card
  const ctx = { s, p, self: null, paidExtra: a.extra };
  const cls = cardStatics(s, a.cid, 'costLess').filter((st) => gateOK(s, st, { isLegend: false }, p) && !(st.notFromHand && a.src === 'hand') && !(st.cond && !evalCond(s, st.cond, ctx)));
  const insteadOnly = cls.some((st) => st.instead);
  for (const st of cardStatics(s, a.cid, 'costLess')) {
    if (insteadOnly && !st.instead) continue;
    if (!gateOK(s, st, { isLegend: false }, p)) continue;
    if (st.notFromHand && a.src === 'hand') continue;
    if (st.cond && !evalCond(s, st.cond, ctx)) continue;
    const k = st.per ? countOf(s, st.per, ctx) : 1;
    e -= (st.e || 0) * k; for (let i = 0; i < (st.p || 0) * k && pw.length; i++) pw.pop();
  }
  // board-wide modifiers
  const cm = costMods(s, p, c, a); e += cm.d; for (let i = 0; i < cm.pwLess && pw.length; i++) pw.pop(); for (let i = 0; i < cm.pwMore; i++) pw.push('any');
  const nl = nextLessFor(s, p, c); if (nl) { e -= nl.e || 0; for (let i = 0; i < (nl.pw || 0) && pw.length; i++) pw.pop(); }
  if (a.sac != null && cardStatics(s, a.cid, 'sacCost').some((x) => x.reduce)) { const v = ob(s, a.sac); if (v) { e -= C[v.cid].e || 0; for (let i = 0; i < (C[v.cid].p || []).length && pw.length; i++) pw.pop(); } }
  if (a.sac != null) { const sc = cardStatics(s, a.cid, 'sacCost')[0]; if (sc && sc.reduceE) e -= sc.reduceE; }
  if (a.alt && a.t === 'play') { const al = cardStatics(s, a.cid, 'altCost')[0]; if (al) { e = al.cost.e || 0; pw = (al.cost.pw || []).slice(); } }
  if (a.buffN) for (let i = 0; i < a.buffN && pw.length; i++) pw.pop();
  if (a.rep && s.ctrl.some((q, i) => q === p && C[s.bfs[i].id].ab.some((x) => x.s === 'repeatLess'))) e = Math.max(0, e - 1);
  if (s.sd && (c.sp === 'R' || a.src === 'hidden') && C[s.bfs[s.sd.bf].id].ab.some((x) => x.s === 'reactionTax')) pw.push('any');
  if (a.sacN) for (let i = 0; i < a.sacN && pw.length; i++) pw.pop();
  if (a.x) { const xs = cardStatics(s, a.cid, 'xCost')[0]; if (xs && xs.from === 'e') e += a.x; else for (let i = 0; i < a.x; i++) pw.push('any'); }
  if (s.turnFx.grenade && s.turnFx.grenade.cid === a.cid && s.turnFx.grenade.p === p && a.src === 'trash') { e = 0; pw = ['any']; }
  if (a.src === 'trashAlt') { const tp = cardStatics(s, a.cid, 'trashPlay')[0]; if (tp) { e = tp.cost.e || 0; pw = (tp.cost.pw || []).slice(); } }
  if (a.src === 'playable') { const en = (s.players[p].playable || []).find((x) => x.cid === a.cid && x.cost); if (en) { e = en.cost.e || 0; pw = (en.cost.pw || []).slice(); } }
  if (a.sing) e -= 2;
  if (c.t === 'g' && orianaOK(s, p)) { e = Math.max(0, e - 1); if (pw.length) pw.pop(); }
  if (c.t === 'g' && !c.token && !(s.players[p].tc.gearNT) && s.ctrl.some((q, i) => q === p && C[s.bfs[i].id].ab.some((x) => x.s === 'firstGearLess'))) e = Math.max(0, e - 1);
  if (c.t === 'g' && s.turnFx.gearFree && s.turnFx.gearFree[p] && (c.e || 0) <= s.turnFx.gearFree[p]) e = 0;
  if (c.t === 's' && (a.picks || []).flat().some((id) => { const o = typeof id === 'number' ? ob(s, id) : null; return o && o.ctrl === p && o.loc !== 'base' && bfAb(s, o.loc).some((x) => x.s === 'spellLessHere'); }) && pw.length) pw.pop();
  if (c.t === 's' && (a.picks || []).flat().some((id) => { const o = typeof id === 'number' ? ob(s, id) : null; return o && o.ctrl === p && hasStatic(s, o, 'chosenDiscount'); })) { if (e > 0) e--; else if (pw.length) pw.pop(); }
  if (typeof a.to === 'number' && ['u', 'g'].includes(c.t) && s.active === p && C[s.bfs[a.to].id].ab.some((x) => x.s === 'firstHereLess') && !(s.players[p].tc.here || {})[a.to]) e = Math.max(0, e - 1);
  if (c.t === 'u' && typeof a.to === 'number' && s.ctrl[a.to] !== p && (c.tags || []).includes('Dragon') && C[s.bfs[a.to].id].ab.some((x) => x.s === 'dragonRoost')) pw.push('any', 'any');
  if (cm.minE != null && (c.e || 0) >= cm.minE) e = Math.max(cm.minE, e);
  e = Math.max(0, e);
  if (a.acc) { e += 1; pw.push(c.d.length ? c.d.join('|') : 'any'); }
  if (a.rep && repeatOf(s, p, c)) { const rr = repeatOf(s, p, c); const r = rr[a.repIdx || 0] || rr[0]; e += r.e || 0; pw.push(...(r.pw || [])); if (r.discard) extra.discard = (extra.discard || 0) + r.discard; }
  if (a.extra) { const xc = cardStatics(s, a.cid, 'extraCost')[0]; if (xc) { e += xc.cost.e || 0; pw.push(...(xc.cost.pw || [])); if (xc.cost.free) { e = 0; pw = []; } } }
  if (a.extra && hasEzrealDiscount(s, p)) { if (e > 0) e--; else if (pw.length) pw.pop(); }
  for (let i = 0; i < deflectTax(s, p, a); i++) pw.push('any');
  return { e, pw, extra };
}
function hasEzrealDiscount(s, p) { return s.objs.some((o) => o.ctrl === p && o.k === 'u' && C[o.cid].ab.some((x) => x.s === 'optCostDiscount')); }
function costFloor1(s, p, c) { return false; }
function costMods(s, p, c, a) {
  let d = 0, pwLess = 0, minE = null, pwMore = 0;
  for (const { a: st, src, p: q } of staticSources(s)) {
    if (st.s !== 'costMod') continue;
    if (!gateOK(s, st, src, q) || !condOK(s, st.cond, { s, p: q, self: src.id })) continue;
    const mine = q === p;
    if (st.who === 'you' && !mine) continue; if (st.who === 'opp' && mine) continue;
    if (st.type && st.type !== c.t) continue; if (st.tag && !(c.tags || []).includes(st.tag)) continue;
    if (st.inCombatOnly && !(src.loc != null && s.sd && s.sd.combat && src.loc === s.sd.bf)) continue;
    const empd = st.empAlt && src && src.emp > 0; d += empd ? st.empAlt.e : (st.e || 0); pwMore += empd ? (st.empAlt.pw || 0) : (st.pwMore || 0); pwLess += st.pwLess || 0; if (st.minE != null) minE = Math.max(minE || 0, st.minE);
  }
  if (s.turnFx.nextSpellLess && s.turnFx.nextSpellLess[p] && c.t === 's') d -= s.turnFx.nextSpellLess[p];
  if (s.turnFx.unitsCostMore && s.turnFx.unitsCostMore[p] && c.t === 'u' && !c.token) d += s.turnFx.unitsCostMore[p];
  return { d, pwLess, minE, pwMore };
}
function deflectTax(s, p, a) {
  let n = 0;
  if (a.cid && C[a.cid] && C[a.cid].ab.some((x) => x.s === 'ignoreDeflect')) return 0;
  for (const id of a.picks || []) {
    const list = Array.isArray(id) ? id : [id];
    for (const x of list) { const o = typeof x === 'number' ? ob(s, x) : null; if (!o || o.ctrl === p) continue; const d = kwOf(s, o).deflect || 0; if (!d) continue; if (o.loc !== 'base' && o.loc != null && bfAb(s, o.loc).some((q) => q.s === 'bfIgnoreDeflect')) continue; n += d; }
  }
  return n;
}
function abilityCost(s, p, a) {
  const ab = abilityOf(s, a); if (!ab) return { e: 0, pw: [] };
  let e = (ab.cost.e || 0), pw = (ab.cost.pw || []).slice();
  if (ab.cost.lessPer) e = Math.max(0, e - countOf(s, ab.cost.lessPer, { p, self: a.src }));
  { const o = typeof a.src === 'number' ? ob(s, a.src) : null; if (o && o.k === 'g' && !(s.players[p].tc.gearAb) && s.ctrl.some((q, i) => q === p && C[s.bfs[i].id].ab.some((x) => x.s === 'firstGearAbLess'))) e = Math.max(0, e - 1); }
  if (a.x) { if (ab.cost.xAmount === 'e') e += a.x; else for (let i = 0; i < a.x; i++) pw.push('any'); }
  for (let i = 0; i < deflectTax(s, p, a); i++) pw.push('any');
  return { e, pw };
}
function actionCost(s, p, a) {
  if (a.t === 'hide' && s.turnFx.freeHide && s.turnFx.freeHide[p]) return { e: 0, pw: [] };
  if (a.t === 'hide') return s.players[p].legend && C[s.players[p].legend].ab.some((x) => x.s === 'hideForEnergy') && a.alt ? { e: 1, pw: [] } : { e: 0, pw: ['any'] };
  if (a.t === 'equip' && a.alt) return { e: 0, pw: [] };
  if (a.t === 'equip') { const g = ob(s, a.g); const k = C[g.cid].kw.equip || { e: 0, pw: [] }; const pw = (k.pw || []).slice(); if (a.wm && pw.length) pw.pop(); let e = k.e || 0; if (k.reduceByMight) { const u = ob(s, a.u); e = Math.max(0, e - (u ? might(s, u) : 0)); } return { e, pw }; }
  if (a.t === 'emp') { const k = a.o === 'L' ? C[s.players[p].legend].kw.empower : C[ob(s, a.o).cid].kw.empower; if (!k) return { e: 0, pw: [] }; let e = k.e || 0; if (k.less) { if (k.less.per === 'runes') e = Math.max(0, e - k.less.e * s.players[p].runes.length); else if (k.less.le != null && s.players[p].runes.length <= k.less.le) e = Math.max(0, e - k.less.e); } const pw = (k.pw || []).slice(); const eo = a.o !== 'L' ? ob(s, a.o) : null; if (eo && eo.loc !== 'base' && eo.loc != null && bfAb(s, eo.loc).some((x) => x.s === 'empLessHere')) { if (e > 0) e--; else if (pw.length) pw.pop(); } return { e, pw }; }
  if (a.t === 'ab') return abilityCost(s, p, a);
  if (a.t !== 'play') return { e: 0, pw: [] };
  return playCost(s, p, a);
}
function purposeOf(s, a) {
  if (a.t === 'play') return { type: C[a.cid].t };
  if (a.t === 'ab') { const o = a.src === 'L' ? null : ob(s, a.src); return { type: o ? 'ab-' + o.k : 'ab-L' }; }
  if (a.t === 'equip') return { type: 'ab-g' };
  return { type: 'x' };
}

/* ---------------- abilities ---------------- */
function abilityOf(s, a) {
  if (typeof a.src === 'string' && a.src[0] === 'B') { const bc = C[s.bfs[+a.src[1]].id]; return bc ? bc.ab[a.idx] : null; }
  if (a.src === 'L') { const L = s.players[actor(s) != null ? actor(s) : s.active].legend; return C[L] ? C[L].ab[a.idx] : null; }
  const o = ob(s, a.src); if (!o) return null;
  if (a.host) { const g = ob(s, a.host); return g ? C[g.cid].eqab[a.idx] : null; }
  if (a.granted) return (o.grantAct || [])[a.idx] || null;
  if (a.bfGrant != null) { const st2 = C[s.bfs[a.bfGrant].id].ab[a.idx]; return st2 ? st2.ab : null; }
  if (a.borrow) return C[a.borrow].ab[a.idx] || null;
  return C[o.copyOf || o.cid].ab[a.idx] || null;
}
function abilityOpen(s, p, src, ab, legend, allowMana) {
  if (ab.kind !== 'act') return false;
  const c = ab.cost || {};
  if (c.ex && (legend ? s.players[p].legEx : src.ex)) return false;
  if (c.disemp && !(legend ? s.players[p].legEmp : src.emp)) return false;
  if (c.xp && s.players[p].xp < c.xp) return false;
  if (c.discard && s.players[p].hand.length < c.discard) return false;
  if (c.recycleTrash && s.players[p].trash.length < c.recycleTrash) return false;
  if (c.recycleTrashUnit && !s.players[p].trash.some((x) => C[x].t === 'u')) return false;
  if (c.spendBuffSelf && !(src && src.buff > 0)) return false;
  if (c.killFriendly && !s.objs.some((o) => o.ctrl === p && o !== src && (c.killFriendly === 'ug' || o.k === 'u'))) return false;
  if (c.exhaustFriendly && !s.objs.some((o) => o.ctrl === p && o.k === 'u' && !o.ex && o !== src)) return false;
  const lim = ab.limit || {};
  if (lim.atBf && (legend || !src || src.loc === 'base')) return false;
  if (lim.playedEq && !s.players[p].tc.eq) return false;
  if (lim.unattached && src && src.att != null) return false;
  if (lim.chose2 && s.players[p].chose < 2) return false;
  if (lim.choseEnemy && s.players[p].chose < 1) return false;
  if (c.exhaustFriendlyMighty && !s.objs.some((o) => o.ctrl === p && o.k === 'u' && !o.ex && o !== src && isMighty(s, o))) return false;
  if (lim.once && s.onceUsed[(legend ? 'L' + p : src.id) + ':act' + ab.idxKey]) return false;
  if (!gateOK(s, ab, legend ? { isLegend: true } : src, p)) return false;
  // pure resource abilities are used automatically while paying, not as separate actions
  if (!allowMana && ab.eff && ab.eff.length === 1 && ab.eff[0].op === 'add' && !c.e && !(c.pw && c.pw.length)) return false;
  return true;
}

/* ---------------- playing cards ---------------- */
function cardSpeedOK(s, p, cid, src) {
  const c = C[cid];
  if (s.mode === 'main') return s.active === p;
  if (src === 'hidden') return true;
  const k = c.kw;
  if (c.t === 'u' && k.ambush) return true;
  if (c.t === 's' || c.t === 'u' || c.t === 'g') {
    let sp = c.sp || 'N';
    if (c.t === 'g' && isEq(cid) && staticsOn(s, 'eqQuickDraw', p)) sp = 'R';
    if (c.t === 's' && s.sd && s.objs.some((o) => o.ctrl === p && o.loc === s.sd.bf && hasStatic(s, o, 'spellsReactionInSd'))) sp = 'R';
    if (c.t === 'g' && k.deploy && staticsOn(s, 'deployAction', p) && sp === 'N') sp = 'A';
    if (s.mode === 'showdown') return sp === 'A' || sp === 'R';
    if (s.mode === 'chain') return sp === 'R';
  }
  return false;
}
function unitDests(s, p, cid, src, meta) {
  const c = C[cid]; const st = (n) => c.ab.some((a) => a.kind === 'static' && a.s === n);
  if (src === 'hidden') return [meta.bf];
  if (c.kw.ambush && s.mode !== 'main') return [0, 1].filter((i) => unitsAt(s, i, p).length && !bfNoPlay(s, i));
  const out = ['base'];
  if (s.objs.some((o) => o.ctrl !== p && o.k === 'u' && o.loc !== 'base' && hasStatic(s, o, 'oppBaseOnly'))) return out;
  if (st('onlyConqueredBf')) return s.players[p].tc.conquered.filter((i) => !bfNoPlay(s, i));
  for (const i of [0, 1]) {
    if (bfNoPlay(s, i)) continue;
    const open = !unitsAt(s, i).length;
    if (s.ctrl[i] === p) out.push(i);
    else if (open && (st('playOpenBf') || staticsOn(s, 'friendsPlayOpenBf', p))) out.push(i);
    else if (!open && st('playEnemyBf')) out.push(i);
    else if (!open && unitsAt(s, i).length === 1 && unitsAt(s, i)[0].ctrl !== p && (st('playAloneEnemyBf') || staticsOn(s, 'friendsPlayAloneEnemyBf', p))) out.push(i);
  }
  if ((c.tags || []).includes('Dragon')) for (const i of [0, 1]) if (!out.includes(i) && C[s.bfs[i].id].ab.some((a) => a.s === 'dragonRoost')) out.push(i);
  if (s.mode !== 'main') return out.filter((x) => x === 'base' || unitsAt(s, x, p).length);
  return out;
}
function bfNoPlay(s, i) { return C[s.bfs[i].id] && C[s.bfs[i].id].ab.some((a) => a.s === 'bfNoPlay'); }
// selectors that are chosen as the card is played (first two simple single targets)
function pickSlots(eff) {
  const out = [];
  for (const op of eff || []) {
    if (out.length >= 2) break;
    if (op.op === 'choose' && op.t && op.t.q === 'one' && (op.t.n || 1) === 1) { out.push(op.t); continue; }
    if (op.op === 'counter' && op.t && op.t.q === 'one') { out.push(op.t); continue; }
    if (op.t && op.t.q === 'one' && (op.t.n || 1) === 1 && op.t.f && ['u', 'g', 'ug', 's'].includes(op.t.f.type) && !op.t.f.zone && ['deal', 'might', 'kill', 'return', 'stun', 'buff', 'ready', 'giveKw', 'move', 'banish', 'recall', 'exhaust', 'heal', 'temp', 'double', 'steal'].includes(op.op)) { out.push(op.op === 'move' ? Object.assign({}, op.t, { _move: true }) : op.t); continue; }
    if (['may', 'payOpt', 'if', 'oneOf', 'look', 'lookTake', 'choosePlayer', 'discard', 'ifDid'].includes(op.op)) break;
  }
  return out;
}
function enumeratePicks(s, p, eff, ctxExtra) {
  const slots = pickSlots(eff); if (!slots.length) return [[]];
  const res = [];
  const rec = (i, picks, it, there) => {
    if (res.length >= 40) return;
    if (i >= slots.length) { res.push(picks.slice()); return; }
    const ctx = Object.assign({ s, p, it, picks: [], pi: 0 }, ctxExtra || {}); if (there != null) ctx.there = there;
    let cands = candidates(s, slots[i], ctx, p);
    if (ctxExtra && ctxExtra.hiddenBf != null) cands = cands.filter((id) => { const o = ob(s, id); return !o || o.loc === ctxExtra.hiddenBf; });
    if (!cands.length) return; // no legal target: can't be played this way
    for (const c of cands) rec(i + 1, picks.concat([c]), slots[i].q === 'one' ? [c] : it, typeof c === 'string' && c[0] === 'B' ? +c.slice(1) : there);
  };
  rec(0, [], [], null);
  return res;
}
function playVariants(s, p, cid, src, meta) {
  const c = C[cid]; const out = [];
  const base = { t: 'play', cid, src, hid: meta.hid };
  const xc0 = cardStatics(s, cid, 'extraCost')[0];
  const extras = xc0 && (!xc0.cost.killFriendlyGear || gearOf(s, p).length) && (!xc0.cost.killFriendly || unitsOf(s, p).length) && (!xc0.cost.exhaustFriendly || unitsOf(s, p).some((u) => !u.ex)) && (!xc0.cond || evalCond(s, xc0.cond, { s, p })) && (!xc0.cost.discard || s.players[p].hand.length > xc0.cost.discard) && (!xc0.cost.exLegend || !s.players[p].legEx) && (!xc0.cost.spendBuff || s.objs.some((o) => o.ctrl === p && o.buff > 0)) && (!xc0.cost.xp || s.players[p].xp >= xc0.cost.xp) ? [false, true] : [false];
  const sc = cardStatics(s, cid, 'sacCost')[0];
  let sacs = sc ? (sc.mandatory ? [] : [null]).concat((sc.type === 'g' ? gearOf(s, p) : sc.type === 'ug' ? s.objs.filter((o) => o.ctrl === p && (o.k === 'u' || o.k === 'g')) : unitsOf(s, p)).filter((o) => (!sc.mighty || isMighty(s, o)) && (!sc.tagAny || sc.tagAny.some((t) => tagsOf(s, o).includes(t)))).map((u) => u.id)) : [null];
  if (sc && sc.mandatory && !sacs.length) return [];
  const alt0 = cardStatics(s, cid, 'altCost')[0]; const alts = alt0 && evalCond(s, alt0.cond, { s, p }) ? [false, true] : [false];
  const nb = s.objs.filter((o) => o.ctrl === p && o.buff > 0).length;
  const buffNs = cardStatics(s, cid, 'buffMany').length ? [0, 1, 2, 3].filter((k) => k <= nb && k <= (c.p || []).length) : [0];
  const sacNs = cardStatics(s, cid, 'sacMany').length ? [0, 1, 2, 3, 4].filter((k) => k <= unitsOf(s, p).length && k <= (c.p || []).length) : [0];
  const xs = cardStatics(s, cid, 'xCost')[0];
  const xVals = xs ? [1, 2, 3, 4, 5, 6].filter((k) => canPay(s, p, { e: (c.e || 0) + (xs.from === 'e' ? k : 0), pw: (c.p || []).concat(xs.from === 'e' ? [] : Array(k).fill('any')) }, { type: c.t })) : [0];
  const accs = (c.kw.accelerate || (s.turnFx.nextAccel && s.turnFx.nextAccel[p]) || (src !== 'hand' && staticsOn(s, 'accelNotHand', p))) && c.t === 'u' ? [false, true] : [false];
  const reps = repeatOf(s, p, c) ? [false, true] : [false];
  if (c.t === 'u') {
    const dests0 = unitDests(s, p, cid, src, meta);
    for (const sac of sacs) for (const to of (sc && sc.toSacLoc && sac != null && ob(s, sac) && typeof ob(s, sac).loc === 'number' && !dests0.includes(ob(s, sac).loc) ? dests0.concat([ob(s, sac).loc]) : dests0)) for (const acc of accs) for (const extra of extras) for (const sacN of sacNs) for (const alt of alts) for (const buffN of buffNs) out.push(Object.assign({}, base, { to, acc, extra, picks: [] }, sac != null ? { sac } : {}, sacN ? { sacN } : {}, alt ? { alt } : {}, buffN ? { buffN } : {}));
  } else if (c.t === 'g') {
    const dests = c.kw.deploy ? [0, 1].filter((i) => s.ctrl[i] === p || !unitsAt(s, i).length) : ['base'];
    for (const to of dests) for (const extra of extras) out.push(Object.assign({}, base, { to, extra, picks: [] }));
  } else {
    const body = c.ab.filter((a) => a.kind === 'spell').flatMap((a) => (gateOK(s, a, null, p) ? a.eff : []));
    const pickSets = enumeratePicks(s, p, body, { hiddenBf: src === 'hidden' ? meta.bf : null });
    const sing = singOK(s, p) ? [false, true] : [false];
    for (const picks of pickSets) for (const rep of reps) for (const extra of extras) for (const sg of sing) for (const x of xVals) for (const sac of sacs) out.push(Object.assign({}, base, { picks, rep, extra, sing: sg }, x ? { x } : {}, sac != null ? { sac } : {}));
  }
  return out.filter((a) => canPay(s, p, actionCost(s, p, a), purposeOf(s, a)) && extraOK(s, p, a));
}
function repeatOf(s, p, c) {
  if (c.t !== 's') return c.kw.repeat || null;
  if (c.kw.repeat) return c.kw.repeat;
  if (s.turnFx.nextRepeat && s.turnFx.nextRepeat[p]) return [{ e: c.e || 0, pw: (c.p || []).slice() }];
  if (s.sd && s.objs.some((o) => o.ctrl === p && o.loc === s.sd.bf && hasStatic(s, o, 'sdRepeat'))) return [{ e: 2, pw: ['chaos'] }];
  return null;
}
function nextLessFor(s, p, c) { const n = s.turnFx.nextLess && s.turnFx.nextLess[p]; if (!n) return null; if (n.type && n.type !== c.t) return null; return n; }
// Starry-Eyed Songstress: exhaust the legend and three friendly units to make a spell cost 2 less
function singOK(s, p) { const pl = s.players[p]; return !!(pl.legend && C[pl.legend].ab.some((x) => x.s === 'singDiscount') && !pl.legEx && unitsOf(s, p).filter((u) => !u.ex).length >= 3); }
function extraOK(s, p, a) {
  const cc = actionCost(s, p, a).extra || {};
  if (cc.discard && s.players[p].hand.length - (a.src === 'hand' ? 1 : 0) < cc.discard) return false;
  return true;
}
function playCard(s, p, a) {
  const pl = s.players[p], c = C[a.cid];
  const cost = actionCost(s, p, a);
  pay(s, p, cost, a.mp, purposeOf(s, a));
  if (c.p && c.p.length) pl.tc.spentPow += 0;
  if (a.src === 'hand') pl.hand.splice(pl.hand.indexOf(a.cid), 1);
  else if (a.src === 'champ') pl.champ = null;
  else if (a.src === 'hidden') { a.hbf = (s.hidden.find((h) => h.id === a.hid) || {}).bf; s.hidden = s.hidden.filter((h) => h.id !== a.hid); }
  else if (a.src === 'flow' || a.src === 'trash' || a.src === 'trashAlt') pl.trash.splice(pl.trash.indexOf(a.cid), 1);
  else if (a.src === 'playable') { const i = (pl.playable || []).findIndex((x) => x.cid === a.cid); const en = i >= 0 ? pl.playable.splice(i, 1)[0] : { zone: 'banished' }; if (en.banish) a.banishAfter = true; const z = en.zone === 'trash' ? pl.trash : pl.banished; const j = z.indexOf(a.cid); if (j >= 0) z.splice(j, 1); }
  if (a.sac != null && ob(s, a.sac)) a.sacCid = ob(s, a.sac).cid;
  if (a.sac != null) { const v = ob(s, a.sac); const sc = cardStatics(s, a.cid, 'sacCost')[0]; if (v) { if (sc && sc.mode === 'return') returnToHand(s, v); else kill(s, v); } }
  if (a.buffN) s.objs.filter((o) => o.ctrl === p && o.buff > 0).slice(0, a.buffN).forEach((o) => { o.buff--; emit(s, 'buffSpent', { p, obj: o.id }); });
  if (a.sacN) unitsOf(s, p).sort((x, y) => unitVal(s, x) - unitVal(s, y)).slice(0, a.sacN).forEach((v) => kill(s, v));
  if (a.extra) { const xc = cardStatics(s, a.cid, 'extraCost')[0]; if (xc && xc.cost.exLegend) pl.legEx = true; if (xc && xc.cost.xp) pl.xp -= xc.cost.xp; if (xc && xc.cost.spendBuff) { const o = s.objs.filter((x) => x.ctrl === p && x.buff > 0).sort((x, y) => unitVal(s, x) - unitVal(s, y))[0]; if (o) { o.buff--; emit(s, 'buffSpent', { p, obj: o.id }); } } if (xc && xc.cost.discard) { const w = pl.hand.filter((x) => x !== a.cid).sort((x, y) => cardVal(x) - cardVal(y))[0]; if (w) { pl.hand.splice(pl.hand.indexOf(w), 1); pl.trash.push(w); pl.tc.discarded++; } } if (xc && xc.cost.exhaustFriendly) { const v = unitsOf(s, p).filter((u) => !u.ex).sort((x, y) => unitVal(s, x) - unitVal(s, y))[0]; if (v) v.ex = true; } if (xc && xc.cost.killFriendlyGear) { const v = gearOf(s, p).sort((x, y) => cardVal(x.cid) - cardVal(y.cid))[0]; if (v) kill(s, v); } if (xc && xc.cost.killFriendly) { const v = unitsOf(s, p).sort((x, y) => unitVal(s, x) - unitVal(s, y))[0]; if (v) kill(s, v); } }
  if (a.sing) { pl.legEx = true; unitsOf(s, p).filter((u) => !u.ex).sort((x, y) => unitVal(s, x) - unitVal(s, y)).slice(0, 3).forEach((u) => { u.ex = true; }); log(`${cn(pl.legend)}: ${P(p)} ${vb(p, 'exhaust', 'exhausts')} three units to make the spell cheaper.`); }
  if (cost.extra && cost.extra.discard) { for (let i = 0; i < cost.extra.discard; i++) { const w = pl.hand.slice().sort((x, y) => cardVal(x) - cardVal(y))[0]; if (w) discardCard(s, p, w); } }
  pl.tc.cards++;
  const who = p ? 'ai' : 'you';
  const fromHidden = a.src === 'hidden';
  if (c.t === 'u' || c.t === 'g') {
    let ready = false;
    if (c.t === 'u') {
      if (a.acc) ready = true;
      for (const st of cardStatics(s, a.cid, 'enterReady')) if (gateOK(s, st, null, p) && (!st.cond || evalCond(s, st.cond, { s, p, paidExtra: a.extra, to: a.to }))) ready = true;
      if (s.turnFx.nextReady && s.turnFx.nextReady[p]) { ready = true; s.turnFx.nextReady[p] = false; }
      if (s.turnFx.enterReady && s.turnFx.enterReady[p]) ready = true;
      if (staticsOn(s, 'friendsEnterReady', p)) ready = true;
      if (c.token && staticsOn(s, 'tokensEnterReady', p)) ready = true;
    } else ready = !cardStatics(s, a.cid, 'enterEx').length;
    if (a.sac != null && ob(s, a.sac) == null && a.sacLoc != null) { /* sacrificed unit's battlefield */ }
    const loc = a.to != null ? a.to : 'base';
    const o = newObj(s, { cid: a.cid, k: c.t, owner: p, loc, ex: !ready });
    if (c.t === 'u') { pl.tc.units++; if (s.turnFx.nextAccel) s.turnFx.nextAccel[p] = false; if (s.turnFx.nextReadyBuff && s.turnFx.nextReadyBuff[p]) { s.turnFx.nextReadyBuff[p] = false; o.ex = false; s.exec.push({ eff: [{ op: 'buff', t: { q: 'self' } }], i: 0, ctx: { p, self: o.id, card: a.cid, it: [], picks: [], pi: 0 } }); } }
    if (c.t === 'g' && s.turnFx.gearFree && s.turnFx.gearFree[p] && (c.e || 0) <= s.turnFx.gearFree[p]) s.turnFx.gearFree[p] = 0;
    if (c.t === 'g') { pl.tc.gear++; if (isEq(a.cid)) pl.tc.eq++; if (!c.token) pl.tc.gearNT = (pl.tc.gearNT || 0) + 1; }
    if (typeof loc === 'number') { pl.tc.toBf = true; pl.tc.here = pl.tc.here || {}; pl.tc.here[loc] = (pl.tc.here[loc] || 0) + 1; }
    if (c.t === 'g' && orianaOK(s, p)) s.onceUsed['oriana' + p] = true;
    log(`${P(p)} ${vb(p, 'play', 'plays')} ${c.n}${fromHidden ? ' from hiding' : ''}${loc !== 'base' ? ' to ' + bfName(s, loc) : ''}${a.acc ? ' (Accelerated)' : ''}.`, who);
    // Vex, Apathetic and similar: stun units opponents play
    emit(s, 'played', { obj: o.id, p, cid: a.cid, to: loc, fromHidden, paidExtra: a.extra, hbf: fromHidden ? a.hbf : null });
    const nl = nextLessFor(s, p, c); if (nl) { s.turnFx.nextLess[p] = null; if (nl.killEOT) o.killEOT = true; }
    emit(s, 'cardPlayed', { p, cid: a.cid, obj: o.id, to: loc, fromHidden, paidE: cost.e, src: a.src });
    if (c.t === 'u' && c.kw.weaponmaster) s.exec.push({ eff: [{ op: 'weaponmaster' }], i: 0, ctx: { p, self: o.id, card: a.cid, it: [], picks: [], pi: 0 } });
    if (c.t === 'g' && (c.kw['quick-draw'] || (isEq(a.cid) && a.src === 'hand' && staticsOn(s, 'eqQuickDraw', p)))) s.exec.push({ eff: [{ op: 'quickDraw' }], i: 0, ctx: { p, self: o.id, card: a.cid, it: [], picks: [], pi: 0 } });
    // the frames for "When you play me" must see paidExtra
    for (const fr of s.exec) if (fr.ctx.self === o.id) fr.ctx.paidExtra = a.extra;
    refreshControl(s);
    if (loc !== 'base' && s.ctrl[loc] !== p && !s.sdQueue.some((q) => q.bf === loc) && !(s.sd && s.sd.bf === loc)) s.sdQueue.push({ bf: loc, att: p });
    return;
  }
  // spell: goes on the chain
  { const nl = nextLessFor(s, p, c); if (nl) s.turnFx.nextLess[p] = null; }
  pl.tc.spells++; if (cost.e >= 4) pl.tc.bigSpell = true; if (s.turnFx.nextRepeat && s.turnFx.nextRepeat[p]) s.turnFx.nextRepeat[p] = false;
  const item = { id: s.nid++, p, x: a.x || 0, sacCid: a.sacCid, banishAfter: !!a.banishAfter, cid: a.cid, picks: a.picks || [], rep: !!a.rep, src: a.src, extra: !!a.extra, chosen: (a.picks || []).flat().filter((x) => typeof x === 'number'), paidE: cost.e, hiddenBf: fromHidden ? a.hbf : null };
  if (s.turnFx.spellBonus && s.turnFx.spellBonus[p]) { item.bonus = s.turnFx.spellBonus[p]; s.turnFx.spellBonus[p] = 0; }
  s.chain.push(item);
  log(`${P(p)} ${vb(p, 'cast', 'casts')} ${c.n}${pickText(s, a.picks, 0)}${a.rep ? ' with Repeat' : ''}.`, who);
  emit(s, 'cardPlayed', { p, cid: a.cid, chainId: item.id, fromHidden, paidE: cost.e, src: a.src });
  noteChosen(s, { p }, item.chosen.filter((x) => ob(s, x)), true);
  if (s.mode === 'main' || s.mode === 'showdown') { s.chainCtx = s.mode; s.chainStarter = p; }
  s.mode = 'chain'; s.prio = 1 - p; s.passes = 0;
}
function resolveTop(s) {
  const it = s.chain.pop(), p = it.p, pl = s.players[p], c = C[it.cid];
  const dest = it.src === 'flow' || c.kw.banishAfter || it.banishAfter ? 'banish' : 'trash';
  if (it.countered) {
    if (it.toHand) { pl.hand.push(it.cid); log(`${c.n} returns to ${Pos(p)} hand.`); }
    else if (dest === 'trash') pl.trash.push(it.cid); else pl.banished.push(it.cid);
    return;
  }
  const body = c.ab.filter((a) => a.kind === 'spell' && gateOK(s, a, null, p)).flatMap((a) => a.eff);
  const times = it.rep ? 2 : 1;
  const after = { op: 'spellDone', dest, cid: it.cid, p: it.owner != null ? it.owner : p, recycle: it.recycle, virtuoso: it.virtuoso };
  const frames = [];
  for (let k = 0; k < times; k++) frames.push({ eff: body, i: 0, ctx: { p, self: null, card: it.cid, it: [], picks: k === 0 ? it.picks.slice() : [], pi: 0, isSpell: true, chainId: it.id, paidExtra: it.extra, hiddenBf: it.hiddenBf, src: it.src, x: it.x, paidE: it.paidE, sacCid: it.sacCid, bonus: it.bonus || 0 } });
  s.exec.push({ eff: [after], i: 0, ctx: { p, card: it.cid } });
  for (let i = frames.length - 1; i >= 0; i--) s.exec.push(frames[i]);
}
OPS.spellDone = (s, fr, op) => { const pl = s.players[op.p]; if (op.recycle) pl.deck.push(op.cid); else if (op.dest === 'banish') pl.banished.push(op.cid); else pl.trash.push(op.cid); };
OPS.weaponmaster = (s, fr) => {
  const ctx = fr.ctx; const me = ob(s, ctx.self); if (!me) return;
  const eqs = s.objs.filter((o) => o.ctrl === ctx.p && isEq(o.cid) && o.att !== me.id && canPay(s, ctx.p, actionCost(s, ctx.p, { t: 'equip', g: o.id, u: me.id, wm: true })));
  if (!eqs.length) return;
  const a = takeAns(fr);
  if (!a) return needChoice(s, fr, 'pickObj', { opts: eqs.map((o) => o.id).concat(['none']), why: `${cn(me.cid)} (Weaponmaster): attach an Equipment for 1 less power?` });
  if (a.v === 'none') return;
  const g = ob(s, a.v); if (!g) return;
  pay(s, ctx.p, actionCost(s, ctx.p, { t: 'equip', g: g.id, u: me.id, wm: true }));
  attach(s, g, me);
};
OPS.quickDraw = (s, fr) => {
  const ctx = fr.ctx; const g = ob(s, ctx.self); if (!g) return; const us = unitsOf(s, ctx.p); if (!us.length) return;
  const a = takeAns(fr);
  if (!a && us.length > 1) return needChoice(s, fr, 'pickObj', { opts: us.map((u) => u.id), why: `${cn(g.cid)} (Quick-Draw): attach to which unit?`, pol: 1 });
  attach(s, g, ob(s, a ? a.v : us[0].id));
};
function attach(s, g, u) { if (!g || !u) return; s.objs.forEach((x) => { if (x.copyBy === g.id) { delete x.copyOf; delete x.copyBy; } }); g.att = u.id; g.attTurn = s.turnNo; emit(s, 'gearAttached', { obj: g.id, host: u.id, p: u.ctrl }); g.loc = u.loc; log(`${cn(g.cid)} is attached to ${cn(u.cid)}.`); emit(s, 'equipped', { obj: u.id, gear: g.id, p: u.ctrl }); }
function pickText(s, picks, persp) {
  const parts = [];
  for (const pk of picks || []) for (const x of (Array.isArray(pk) ? pk : [pk])) {
    if (typeof x === 'number') { const o = ob(s, x); if (o) parts.push((o.ctrl === persp ? 'your ' : 'enemy ') + cn(o.cid) + (o.loc !== 'base' ? ' at ' + bfName(s, o.loc) : '')); }
    else if (typeof x === 'string' && x[0] === 'S') { const ch = s.chain.find((c) => 'S' + c.id === x); if (ch) parts.push('countering ' + cn(ch.cid)); }
  }
  return parts.length ? ': ' + parts.join(' · ') : '';
}

/* ---------------- moving ---------------- */
function moveUnit(s, u, to, info) {
  if (!u || !s.objs.includes(u) || u.loc === to) return;
  if (u.noMove && !(info && info.force)) { log(`${cn(u.cid)} can't move this turn.`); return; }
  if (to === 'base' && !(info && info.force) && (hasStatic(s, u, 'noMoveBase') || (u.loc !== 'base' && C[s.bfs[u.loc].id].ab.some((x) => x.s === 'bfNoRetreat')) || staticsAny(s, 'noRetreatAll'))) { log(`${cn(u.cid)} can't move to base.`); return; }
  const from = u.loc; u.loc = to; u.moves = (u.moves || 0) + 1;
  for (const g of eqOf(s, u)) g.loc = to;
  emit(s, 'move', { obj: u.id, from, to, nth: u.moves, p: u.ctrl });
  if (to !== 'base') {
    if (s.sd && s.sd.bf === to) { /* joins the showdown */ }
    else if (s.ctrl[to] !== u.ctrl && !s.sdQueue.some((q) => q.bf === to)) s.sdQueue.push({ bf: to, att: u.ctrl });
  }
  refreshControl(s);
}
function canMove(s, p, ids, to) {
  if (!ids.length) return false;
  return ids.every((id) => {
    const u = ob(s, id); if (!u || u.k !== 'u' || u.ctrl !== p || u.ex || u.noMove || u.loc === to) return false;
    if (to === 'base' && (hasStatic(s, u, 'noMoveBase') || (u.loc !== 'base' && bfAb(s, u.loc).some((a) => a.s === 'bfNoRetreat')) || staticsAny(s, 'noRetreatAll'))) return false;
    if (u.loc !== 'base' && to !== 'base' && !hasKw(s, u, 'ganking') && !C[s.bfs[to].id].ab.some((a) => a.s === 'bfGankIn')) return false;
    return true;
  });
}
function staticsAny(s, name) { for (const { a, src, p } of staticSources(s)) if (a.s === name && gateOK(s, a, src, p)) return a; return null; }
function exhaustObj(s, o) { if (!o || o.ex) return; o.ex = true; emit(s, 'becomeEx', { obj: o.id }); }
function orianaOK(s, p) { return !s.onceUsed['oriana' + p] && s.objs.some((o) => o.ctrl === p && o.loc !== 'base' && hasStatic(s, o, 'gearDiscountOnce')); }
function moveTax(s, p, ids, to) { if (to === 'base' || ids.length < 2) return 0; return unitsAt(s, to).some((u) => u.ctrl !== p && hasStatic(s, u, 'multiMoveTax')) ? ids.length - 1 : 0; }
function doMove(s, p, a) {
  const us = a.ids.map((id) => ob(s, id));
  if (a.tax) pay(s, p, { e: 0, pw: Array(a.tax).fill('any') });
  log(`${P(p)} ${vb(p, 'move', 'moves')} ${us.map((u) => cn(u.cid)).join(' + ')} to ${bfName(s, a.to)}.`, p ? 'ai' : 'you');
  us.forEach((u) => exhaustObj(s, u));
  us.forEach((u) => moveUnit(s, u, a.to, { byP: p }));
}

/* ---------------- showdowns and combat ---------------- */
function openShowdown(s, q) {
  const { bf, att } = q;
  if (!unitsAt(s, bf, att).length) { refreshControl(s); return; }
  if (s.ctrl[bf] === att && !unitsAt(s, bf, 1 - att).length) return;
  const combat = unitsAt(s, bf, 1 - att).length > 0;
  s.sd = { bf, att, prev: s.ctrl[bf], focus: att, passes: 0, combat, attackers: unitsAt(s, bf, att).map((u) => u.id), defenders: unitsAt(s, bf, 1 - att).map((u) => u.id) };
  s.mode = 'showdown';
  log(`Showdown at ${bfName(s, bf)} (${P(att)} ${combat ? 'attacking' : 'moving in'}).`, 'sd');
  emit(s, 'showdown', { bf, att });
  if (combat) {
    const A = unitsAt(s, bf, att), D = unitsAt(s, bf, 1 - att);
    for (const u of A) emit(s, 'attack', { obj: u.id, bf, alone: A.length === 1 });
    for (const u of D) emit(s, 'defend', { obj: u.id, bf, alone: D.length === 1 });
    for (const u of A) { const n = kwOf(s, u).disarm; if (n) s.exec.push({ eff: [{ op: 'might', n: -n, t: { q: 'one', n: 1, f: { type: 'u', who: 'enemy', where: 'here' } } }], i: 0, ctx: { p: u.ctrl, self: u.id, card: u.cid, it: [], picks: [], pi: 0 } }); }
    emit(s, 'youDefend', { p: 1 - att, bf });
    emit(s, 'combat', { bf, att });
  }
}
function combatPower(s, u) {
  if (u.stun) return 0;
  const nd = hasStatic(s, u, 'noCombatDmg'); if (nd) return 0;
  if (unitsAt(s, u.loc).some((v) => v.ctrl !== u.ctrl && hasStatic(s, v, 'smallFoesNoDmg') && might(s, u) < might(s, v))) return 0;
  return might(s, u);
}
function assignDamage(s, pool, targets, ignoreTank) {
  // Tank first, Backline last, otherwise kill the biggest thing it can
  const groups = [[], [], []];
  for (const u of targets) { const k = kwOf(s, u); groups[!ignoreTank && k.tank ? 0 : k.backline ? 2 : 1].push(u); }
  let excess = 0; const plan = new Map();
  for (const g of groups) {
    let list = g.slice();
    while (pool > 0 && list.length) {
      const rem = (u) => Math.max(1, might(s, u) - u.dmg);
      const killable = list.filter((u) => rem(u) <= pool).sort((a, b) => might(s, b) - might(s, a));
      const t = killable[0] || list.sort((a, b) => rem(a) - rem(b))[0];
      const d = Math.min(pool, rem(t)); plan.set(t, (plan.get(t) || 0) + d); pool -= d; list = list.filter((x) => x !== t);
    }
  }
  if (pool > 0) excess = pool;
  return { plan, excess };
}
function resolveShowdown(s) {
  const { bf, att, prev } = s.sd; const def = 1 - att;
  let A = unitsAt(s, bf, att), D = unitsAt(s, bf, def);
  let excessA = 0;
  if (A.length && D.length) {
    const pa = A.reduce((x, u) => x + combatPower(s, u), 0), pd = D.reduce((x, u) => x + combatPower(s, u), 0);
    log(`Combat at ${bfName(s, bf)}: ${P(att)} ${pa} might vs ${pd}.`, 'sd');
    const ignA = A.some((u) => hasStatic(s, u, 'ignoreTank')), ignD = D.some((u) => hasStatic(s, u, 'ignoreTank'));
    const ra = assignDamage(s, pa, D, ignA), rd = assignDamage(s, pd, A, ignD);
    excessA = ra.excess;
    // any amount of damage kills (Elder Dragon)
    const anyKillA = A.some((u) => hasStatic(s, u, 'anyDamageKills'));
    for (const [u, d] of ra.plan) { if (d > 0) { damage(s, u, anyKillA ? Math.max(d, might(s, u)) : d, { combat: true, p: att }); } }
    for (const [u, d] of rd.plan) { if (d > 0) damage(s, u, d, { combat: true, p: def }); }
    checkDeaths(s);
    A = unitsAt(s, bf, att); D = unitsAt(s, bf, def);
    unitsAt(s, bf).forEach((u) => { u.dmg = 0; });
    const participants = A.concat(D).map((u) => u.id);
    if (A.length && !D.length) { for (const u of A) emit(s, 'win', { obj: u.id }); emit(s, 'youWin', { p: att, bf }); }
    else if (D.length && !A.length) { for (const u of D) emit(s, 'win', { obj: u.id }); emit(s, 'youWin', { p: def, bf }); }
    for (const id of participants) emit(s, 'combatEnd', { obj: id });
    if (A.length && D.length) {
      if (s.objs.some((g) => g.ctrl === att && g.k === 'g' && hasStatic(s, g, 'tieRecallAll'))) { A.concat(D).forEach((u) => recallUnit(s, u, false)); log('Symbol of the Solari: the combat ties and all units there are recalled.'); A = []; D = []; }
      else { A.forEach((u) => recallUnit(s, u, false)); log(`Both sides survive; ${Pos(att)} attackers are recalled to base.`); A = []; }
    }
  }
  const combat = s.sd.combat;
  s.sd = null; s.players.forEach((x) => { x.pool = x.pool.filter((e) => e.lim !== 'showdown'); });
  if (A.length && !D.length) { setCtrl(s, bf, att); if (prev !== att) conquer(s, att, bf, { open: prev == null && !combat, afterAttack: combat, excess: excessA }); }
  else if (D.length && !A.length) setCtrl(s, bf, def);
  else if (!A.length && !D.length) setCtrl(s, bf, null);
  refreshControl(s);
}

/* ---------------- turn structure ---------------- */
function startTurn(s) {
  const p = s.active, pl = s.players[p];
  s.turnNo++; s.scored = [[], []]; s.players.forEach((x) => { x.chose = 0; x.tc = freshTC(); }); s.onceUsed = {}; s.turnFx = {};
  s.objs.forEach((o) => { o.moves = 0; });
  log(`— Turn ${s.turnNo} · ${P(p)} —`, 'turn');
  // Awaken
  for (const o of s.objs) if (o.ctrl === p && o.ex) { o.ex = false; if (o.k === 'u' && !hasStatic(s, o, 'noReady')) emit(s, 'becomeReady', { obj: o.id }); }
  pl.runes.forEach((r) => { r.ex = false; }); pl.legEx = false;
  // Beginning: start-of-phase effects, Temporary, then holds
  const firstBeg = s.firstTurn[p];
  emit(s, 'beginning', { p, first: firstBeg });
  drainExec(s);
  s.inBeginning = p;
  s.objs.filter((o) => o.ctrl === p && (o.temp || kwOf(s, o).temporary) && !(o.loc !== 'base' && unitsAt(s, o.loc, p).some((x) => hasStatic(s, x, 'noTempHere')))).forEach((o) => { log(`${cn(o.cid)} is Temporary and expires.`); kill(s, o); });
  drainExec(s);
  for (const i of [0, 1]) if (s.ctrl[i] === p) { hold(s, p, i); if (s.winner != null) return; }
  drainExec(s); s.inBeginning = null;
  // Channel
  let n = (s.firstTurn[p] && p !== s.first) ? 3 : 2;
  if (s.objs.some((o) => o.loc !== 'base' && C[o.cid].ab.some((a) => a.s === 'channelOnlyOne'))) n = 1;
  s.firstTurn[p] = false; channel(s, p, n);
  // Draw
  if (!pl.skipDraw && !staticsOn(s, 'skipDraw', p)) drawN(s, p, 1);
  pl.pool = [];
  for (const fx of s.endFx.filter((x) => x.k === 'addNextMain' && x.p === p)) { for (let i = 0; i < (fx.res.e || 0); i++) pl.pool.push({ e: 1 }); for (const d of fx.res.pw || []) pl.pool.push({ p: d }); }
  s.endFx = s.endFx.filter((x) => !(x.k === 'addNextMain' && x.p === p));
  s.mode = 'main';
  emit(s, 'mainStart', { p });
}
// run queued effects right away (used during the automatic start-of-turn steps); choices are answered by default
function drainExec(s) {
  for (let guard = 0; guard < 400 && (s.exec.length || s.choice); guard++) {
    if (s.winner != null) return;
    if (s.choice) { if (s.players[s.choice.p].human) return; finishChoice(s, defaultPick(s)); continue; }
    stepExec(s);
  }
}
function endTurn(s) {
  const p = s.active;
  log(`${P(p)} ${vb(p, 'end', 'ends')} the turn.`, p ? 'ai' : 'you');
  emit(s, 'endTurn', { p });
  drainExec(s);
  for (const fx of s.endFx) if (fx.k === 'readyRunes' && fx.p === p) { let n = fx.n; s.players[fx.p].runes.forEach((r) => { if (r.ex && n > 0) { r.ex = false; n--; } }); }
  s.endFx = s.endFx.filter((x) => !(x.k === 'readyRunes' && x.p === p));
  for (const o of s.objs.filter((x) => x.killEOT)) { log(`${cn(o.cid)} dies at end of turn.`); kill(s, o); }
  drainExec(s);
  s.objs.forEach((o) => { if (o.grantAct && o.grantTemp) { o.grantAct = null; o.grantTemp = false; } if (o.grantTrig && o.grantTrigTemp) { o.grantTrig = null; o.grantTrigTemp = false; } o.dmg = 0; o.mod = 0; o.stun = false; o.noMove = false; o.shroud = false; o.kwT = {}; o.dbl = 0; if (!o.animatedBy) o.setBase = null; o.prevent = 0; o.preventNext = false; o.killOnDamage = false; o.dmgMul = 0; o.saves = []; });
  for (const o of s.objs) if (o.tempCtrl != null) { o.ctrl = o.tempCtrl; delete o.tempCtrl; recallUnit(s, o, true); }
  s.delayed = s.delayed.filter((d) => d.until !== 'turn');
  s.players.forEach((pl2, q) => { pl2.playable = (pl2.playable || []).filter((x) => !(x.untilMyEnd && q === p) && !x.untilEOT); });
  s.reveal = [false, false];
  s.players.forEach((x) => { x.pool = []; });
  if (s.extraTurn === p) { s.extraTurn = null; } else s.active = 1 - p;
  refreshControl(s);
  startTurn(s);
}

/* ---------------- choices ---------------- */
function choiceOpts(s) {
  const ch = s.choice; if (!ch) return [];
  const d = ch.data; const pl = s.players[ch.p];
  switch (ch.kind) {
    case 'discard': return d.opts.map((c) => ({ v: c, label: `Discard ${cn(c)}` }));
    case 'stack': return d.cards.map((c) => ({ v: c, label: `Take ${cn(c)}` })).concat(d.may ? [{ v: 'none', label: 'Take nothing' }] : []);
    case 'vision': return [{ v: 'keep', label: `Keep ${cn(d.top)} on top` }, { v: 'recycle', label: `Recycle ${cn(d.top)}` }];
    case 'yn': return [{ v: 'yes', label: d.yes || 'Yes' }, { v: 'no', label: d.no || 'No' }];
    case 'player': return d.opts.map((q) => ({ v: q, label: q === ch.p ? 'You' : 'Opponent' }));
    case 'mode': return d.opts.map((i) => ({ v: i, label: d.labels[i] }));
    case 'dest': return d.opts.map((x) => ({ v: x, label: x === 'base' ? 'Base' : bfName(s, x) }));
    case 'rune': return d.opts.map((id) => { const r = pl.runes.find((x) => x.id === id); return { v: id, label: `Recycle a ${DOMS[r.d]} rune${r.ex ? ' (exhausted)' : ''}` }; });
    case 'pickObj': return d.opts.map((id) => ({ v: id, label: id === 'none' ? "Don't" : typeof id === 'number' ? objLabel(s, id, ch.p) : ({ yes: 'Yes', no: 'No', champ: 'From your Champion Zone', L: 'Your legend' })[id] || selLabel(s, id, ch.p) }));
    case 'sel': {
      if (d.upto || (d.n || 1) > 1) return [{ v: '__multi', label: 'multi' }];
      return d.opts.map((id) => ({ v: id, label: selLabel(s, id, ch.p) })).concat(d.optional ? [{ v: null, label: 'None' }] : []);
    }
    case 'tag': return d.opts.map((t) => ({ v: t, label: t }));
    default: return (d.opts || []).map((x) => ({ v: x, label: String(x) }));
  }
}
function objLabel(s, id, p) { const o = ob(s, id); if (!o) return '?'; return (o.ctrl === p ? 'Your ' : 'Enemy ') + cn(o.cid) + (o.loc !== 'base' && o.loc != null ? ' at ' + bfName(s, o.loc) : o.k === 'u' ? ' (base)' : ''); }
function selLabel(s, id, p) {
  if (typeof id === 'number') return objLabel(s, id, p);
  if (typeof id === 'string') {
    if (id[0] === 'S') { const x = s.chain.find((c) => 'S' + c.id === id); return x ? `Counter ${x.p === p ? 'your' : "the AI's"} ${cn(x.cid)}` : '?'; }
    if (id[0] === 'T') { const [q, cid] = id.slice(1).split(':'); return `${cn(cid)} (${+q === p ? 'your' : "opponent's"} trash)`; }
    if (id[0] === 'R') return 'Rune';
    if (id[0] === 'L') return (+id[1] === p ? 'Your' : "The AI's") + ' legend';
    if (id[0] === 'B') return bfName(s, +id[1]);
  }
  return String(id);
}
function finishChoice(s, v) {
  const ch = s.choice; if (!ch) return;
  s.choice = null;
  const fr = (ch.fid && s.exec.find((f) => f.fid === ch.fid)) || s.exec[ch.frameDepth != null && ch.frameDepth >= 0 ? ch.frameDepth : s.exec.length - 1];
  if (fr) { fr.ctx._ans = v; fr.ctx._ansAt = ch.at; }
}

/* ---------------- legal actions ---------------- */
function actor(s) {
  if (s.winner != null || s.mode === 'mull') return null;
  if (s.choice) return s.choice.p;
  if (s.exec.length) return null;
  if (s.mode === 'chain') return s.prio;
  if (s.mode === 'showdown') return s.sd.focus;
  if (s.mode === 'resolving') return null;
  return s.active;
}
function legal(s, p, opts) {
  const allowMana = !!(opts && opts.mana);
  if (actor(s) !== p) return [];
  if (s.choice) {
    const ch = s.choice;
    if (ch.kind === 'sel' && (ch.data.upto || (ch.data.n || 1) > 1)) return multiPickActs(s, ch);
    return choiceOpts(s).map((o) => ({ t: 'pick', v: o.v, label: o.label }));
  }
  const pl = s.players[p], out = [];
  const main = s.mode === 'main';
  const noCards = s.turnFx.noCards && s.turnFx.noCards[p], noSpells = s.turnFx.noSpells && s.turnFx.noSpells[p];
  for (const cid of [...new Set(pl.hand)]) {
    if (!C[cid] || C[cid].t === 'r') continue;
    if (noCards || (noSpells && C[cid].t === 's')) continue;
    if (C[cid].ab.some((x) => x.s === 'notEarly') && ownTurns(s, p) <= 3) continue;
    if (C[cid].t === 's' && s.objs.some((o) => o.named === C[cid].n && o.ctrl !== p && o.loc !== 'base')) continue;
    if (cardSpeedOK(s, p, cid, 'hand')) out.push(...playVariants(s, p, cid, 'hand', {}));
    if (main && C[cid].kw.hidden) for (const i of [0, 1]) if (s.ctrl[i] === p && hideRoom(s, p, i)) {
      const h = { t: 'hide', cid, bf: i }; if (canPay(s, p, actionCost(s, p, h))) out.push(h);
      const alt = { t: 'hide', cid, bf: i, alt: true }; if (pl.legend && C[pl.legend].ab.some((x) => x.s === 'hideForEnergy') && canPay(s, p, actionCost(s, p, alt))) out.push(alt);
    }
  }
  if (pl.champ && !noCards && cardSpeedOK(s, p, pl.champ, 'champ')) out.push(...playVariants(s, p, pl.champ, 'champ', {}));
  if (!noCards) for (const h of s.hidden.filter((x) => x.owner === p && x.turn < s.turnNo && !unitsAt(s, x.bf).some((u) => u.ctrl !== p && hasStatic(s, u, 'noRevealHere')) && !(noSpells && C[x.cid].t === 's'))) out.push(...playVariants(s, p, h.cid, 'hidden', { hid: h.id, bf: h.bf }));
  if (main) for (const cid of [...new Set(pl.trash)]) if (C[cid] && C[cid].kw.flow) out.push(...playVariants(s, p, cid, 'flow', {}));
  if (!noCards) for (const cid of [...new Set(pl.trash)]) { const tp = C[cid] && cardStatics(s, cid, 'trashPlay')[0]; if (tp && (!tp.cond || evalCond(s, tp.cond, { s, p })) && cardSpeedOK(s, p, cid, 'trashAlt')) out.push(...playVariants(s, p, cid, 'trashAlt', {})); }
  if (!noCards && staticsOn(s, 'playFromTrash', p)) for (const cid of [...new Set(pl.trash)]) if (C[cid] && ['u', 's', 'g'].includes(C[cid].t) && cardSpeedOK(s, p, cid, 'trash')) out.push(...playVariants(s, p, cid, 'trash', {}));
  if (!(s.turnFx.noCards && s.turnFx.noCards[p])) for (const en of (pl.playable || []).filter((x, i, a2) => a2.findIndex((y) => y.cid === x.cid) === i)) { const z = en.zone === 'trash' ? pl.trash : pl.banished; if (z.includes(en.cid) && cardSpeedOK(s, p, en.cid, 'playable') && !(s.turnFx.noSpells && s.turnFx.noSpells[p] && C[en.cid].t === 's')) out.push(...playVariants(s, p, en.cid, 'playable', {})); }
  // activated abilities
  const speedAllowed = (sp) => main ? true : s.mode === 'showdown' ? (sp === 'A' || sp === 'R') : sp === 'R';
  const abActs = (src, list, legend, host) => list.forEach((ab, idx) => {
    if (ab.kind !== 'act' || !speedAllowed(ab.speed)) return;
    ab.idxKey = idx;
    if (!abilityOpen(s, p, src, ab, legend, allowMana)) return;
    const a0 = { t: 'ab', src: legend ? 'L' : src.id, idx, host };
    const pickSets = enumeratePicks(s, p, ab.eff, { self: legend ? null : (host ? host : src.id) });
    for (const picks of pickSets) { const a = Object.assign({}, a0, { picks }); if (canPay(s, p, actionCost(s, p, a), purposeOf(s, a))) out.push(a); }
  });
  for (const o of s.objs.filter((x) => x.ctrl === p)) {
    abActs(o, C[o.copyOf || o.cid].ab, false);
    if (o.k === 'u') for (const g of eqOf(s, o)) abActs(o, C[g.cid].eqab, false, g.id);
    if (o.k === 'u' && o.loc !== 'base') bfAb(s, o.loc).forEach((st2, j) => { if (st2.s !== 'grantUnitsAct' || !speedAllowed(st2.ab.speed)) return; st2.ab.idxKey = 'b' + j; if (!abilityOpen(s, p, o, st2.ab, false)) return; out.push({ t: 'ab', src: o.id, idx: j, bfGrant: o.loc, picks: [] }); });
    if (o.k === 'u' && hasStatic(s, o, 'borrowExhaust')) {
      const seen = new Set();
      const lend = (cid, list, legend) => list.forEach((ab, idx) => { if (ab.kind !== 'act' || !(ab.cost || {}).ex || !speedAllowed(ab.speed)) return; const key = cid + ':' + idx; if (seen.has(key) || cid === o.cid) return; seen.add(key); ab.idxKey = 'h' + key; if (!abilityOpen(s, p, o, ab, false)) return; const a = { t: 'ab', src: o.id, idx, borrow: cid, picks: [] }; if (canPay(s, p, actionCost(s, p, a))) out.push(a); });
      for (const x of s.objs.filter((y) => y.ctrl === p && y !== o)) lend(x.cid, C[x.cid].ab, false);
      if (pl.legend) lend(pl.legend, C[pl.legend].ab, true);
    }
    if (o.grantAct) o.grantAct.forEach((ab, idx) => { if (ab.kind !== 'act' || !speedAllowed(ab.speed)) return; ab.idxKey = 'g' + idx; if (!abilityOpen(s, p, o, ab, false)) return; const a = { t: 'ab', src: o.id, idx, granted: true, picks: [] }; if (canPay(s, p, actionCost(s, p, a))) out.push(a); });
  }
  if (pl.legend && C[pl.legend]) abActs(null, C[pl.legend].ab, true);
  for (const i of [0, 1]) { const bc = C[s.bfs[i].id]; if (!bc) continue; bc.ab.forEach((ab, idx) => {
    if (ab.kind !== 'act' || !speedAllowed(ab.speed) || (ab.limit.myTurn && s.active !== p) || s.onceUsed['B' + i + p + ':act' + idx]) return;
    if (!ab.limit.anyPlayer && s.ctrl[i] !== p) return;
    if (ab.cost.exLegend && pl.legEx) return;
    const a = { t: 'ab', src: 'B' + i, idx, picks: [] }; if (canPay(s, p, actionCost(s, p, a))) out.push(a); }); }
  if (main) {
    for (const g of gearOf(s, p)) {
      if (isEq(g.cid)) for (const u of unitsOf(s, p)) if (g.att !== u.id) {
        const a = { t: 'equip', g: g.id, u: u.id }; if (equipExtraOK(s, p, g) && canPay(s, p, actionCost(s, p, a), { type: 'ab-g' })) out.push(a);
        if (C[g.cid].kw.equipAlt && unitsOf(s, p).some((x) => !x.ex && x.id !== u.id)) out.push({ t: 'equip', g: g.id, u: u.id, alt: true });
      }
    }
    for (const o of s.objs.filter((x) => x.ctrl === p && C[x.cid].kw.empower && (!x.emp || (hasStatic(s, x, 'empMax3') && x.emp < 3)))) { const a = { t: 'emp', o: o.id }; if (empExtraOK(s, p, C[o.cid].kw.empower, o) && canPay(s, p, actionCost(s, p, a))) out.push(a); }
    if (pl.legend && C[pl.legend] && C[pl.legend].kw.empower && !pl.legEmp) { const a = { t: 'emp', o: 'L' }; if (empExtraOK(s, p, C[pl.legend].kw.empower, null) && canPay(s, p, actionCost(s, p, a))) out.push(a); }
    const ready = unitsOf(s, p).filter((u) => !u.ex && !u.noMove), keys = new Set();
    const push = (ids, to) => { const k = ids.slice().sort().join(',') + '>' + to; if (keys.has(k) || !canMove(s, p, ids, to)) return; keys.add(k); const tax = moveTax(s, p, ids, to); if (tax && !canPay(s, p, { e: 0, pw: Array(tax).fill('any') })) return; out.push(tax ? { t: 'move', ids, to, tax } : { t: 'move', ids, to }); };
    for (const to of [0, 1, 'base']) {
      ready.forEach((u) => push([u.id], to));
      if (to !== 'base') { const b = ready.filter((u) => u.loc === 'base').map((u) => u.id); if (b.length > 1) push(b, to); const all = ready.filter((u) => u.loc !== to && (u.loc === 'base' || hasKw(s, u, 'ganking'))).map((u) => u.id); if (all.length > 1) push(all, to); }
    }
    out.push({ t: 'end' });
  } else out.push({ t: 'pass' });
  return out;
}
function hideRoom(s, p, i) { const n = s.hidden.filter((h) => h.owner === p && h.bf === i).length; const extra = C[s.bfs[i].id].ab.some((a) => a.s === 'hideExtra') ? 1 : 0; return n < 1 + extra; }
function equipExtraOK(s, p, g) { const k = C[g.cid].kw.equip || {}; if (k.killFriendly && !s.objs.some((o) => o.ctrl === p && o.k === 'u')) return false; if (k.xp && s.players[p].xp < k.xp) return false; if (k.recycleTrash && s.players[p].trash.length < k.recycleTrash) return false; return true; }
function empExtraOK(s, p, k, self) { if (k.killFriendly && !s.objs.some((o) => o.ctrl === p && o.k === 'u' && o !== self)) return false; if (k.discard && s.players[p].hand.length < k.discard) return false; if (k.discardType && !s.players[p].hand.some((c) => C[c].t === k.discardType)) return false; if (k.ex && self && self.ex) return false; return true; }
function multiPickActs(s, ch) {
  // upto-N selections: offer each single option (repeat to add more) + done
  const d = ch.data; const cur = d.cur || [];
  const out = d.opts.filter((id) => !cur.includes(id)).map((id) => ({ t: 'pick', v: { add: id }, label: selLabel(s, id, ch.p) }));
  out.push({ t: 'pick', v: { done: true }, label: cur.length ? `Done (${cur.length} chosen)` : 'Choose none' });
  return out;
}

/* ---------------- applying actions ---------------- */
function apply(s, a) {
  const p = actor(s); if (p == null) return;
  const pl = s.players[p], who = p ? 'ai' : 'you';
  switch (a.t) {
    case 'pick': {
      const ch = s.choice;
      if (ch && ch.kind === 'sel' && (ch.data.upto || (ch.data.n || 1) > 1)) {
        const d = ch.data; d.cur = d.cur || [];
        if (a.v && a.v.add != null) { d.cur.push(a.v.add); if (d.same && d.cur.length === 1) { const o = ob(s, a.v.add); if (o) d.opts = d.opts.filter((id) => { const x = ob(s, id); return x && x.loc === o.loc; }); } if (d.cur.length < (d.n || 1) && d.opts.some((id) => !d.cur.includes(id))) break; }
        finishChoice(s, d.cur.slice()); break;
      }
      finishChoice(s, a.v); break;
    }
    case 'pass':
      if (s.mode === 'chain') { s.passes++; if (s.passes >= 2) s.mode = 'resolving'; else s.prio = 1 - s.prio; }
      else if (s.mode === 'showdown') { s.sd.passes++; if (s.sd.passes < 2) s.sd.focus = 1 - s.sd.focus; }
      break;
    case 'end': endTurn(s); break;
    case 'move': doMove(s, p, a); break;
    case 'hide': {
      pay(s, p, actionCost(s, p, a), a.mp); pl.hand.splice(pl.hand.indexOf(a.cid), 1);
      s.hidden.push({ id: s.nid++, cid: a.cid, owner: p, bf: a.bf, turn: s.turnNo });
      log(`${P(p)} ${vb(p, 'hide', 'hides')} ${p === 0 ? cn(a.cid) : 'a card'} at ${bfName(s, a.bf)}.`, who); emit(s, 'hide', { p, bf: a.bf });
      break;
    }
    case 'equip': {
      const g = ob(s, a.g), u = ob(s, a.u); const k = C[g.cid].kw.equip || {};
      pay(s, p, actionCost(s, p, a), a.mp, { type: 'ab-g' });
      if (k.killFriendly) { const v = unitsOf(s, p).filter((x) => x !== u).sort((x, y) => cardVal(x.cid) - cardVal(y.cid))[0]; if (v) kill(s, v); }
      if (a.alt) { const v = unitsOf(s, p).filter((x) => !x.ex && x !== u).sort((x, y) => unitVal(s, x) - unitVal(s, y))[0]; if (v) v.ex = true; }
      if (k.xp) pl.xp -= k.xp; if (k.recycleTrash) for (let i = 0; i < k.recycleTrash; i++) pl.deck.push(pl.trash.shift());
      log(`${P(p)} ${vb(p, 'equip', 'equips')} ${cn(g.cid)} to ${cn(u.cid)}.`, who); attach(s, g, u); STATS.fired[g.cid] = (STATS.fired[g.cid] || 0) + 1;
      noteChosen(s, { p }, [u.id], false);
      break;
    }
    case 'emp': {
      const k = a.o === 'L' ? C[pl.legend].kw.empower : C[ob(s, a.o).cid].kw.empower;
      pay(s, p, actionCost(s, p, a), a.mp);
      if (k.killFriendly) { const v = unitsOf(s, p).filter((x) => x.id !== a.o).sort((x, y) => cardVal(x.cid) - cardVal(y.cid))[0]; if (v) kill(s, v); }
      if (k.discard) { const w = pl.hand.filter((c) => !k.discardType || C[c].t === k.discardType).sort((x, y) => cardVal(x) - cardVal(y))[0]; if (w) discardCard(s, p, w); }
      if (k.ex) { if (a.o === 'L') pl.legEx = true; else ob(s, a.o).ex = true; }
      if (a.o === 'L') { pl.legEmp = 1; log(`${P(p)} ${vb(p, 'empower', 'empowers')} ${cn(pl.legend)}.`, who); emit(s, 'becomeEmp', { legend: p, byP: p }); }
      else { log(`${P(p)} ${vb(p, 'empower', 'empowers')} ${cn(ob(s, a.o).cid)}.`, who); empowerObj(s, ob(s, a.o), p); }
      break;
    }
    case 'ab': {
      const ab = abilityOf(s, a); if (!ab) break;
      if (typeof a.src === 'string' && a.src[0] === 'B') {
        const i = +a.src[1]; if (ab.cost.exLegend) pl.legEx = true; STATS.fired[s.bfs[i].id] = (STATS.fired[s.bfs[i].id] || 0) + 1; pay(s, p, actionCost(s, p, a), a.mp); s.onceUsed['B' + i + p + ':act' + a.idx] = true;
        log(`${P(p)} ${vb(p, 'use', 'uses')} ${bfName(s, i)}.`, who);
        s.exec.push({ eff: ab.eff, i: 0, ctx: { p, self: null, card: s.bfs[i].id, it: [], picks: [], pi: 0, here: i, bf: i } }); break;
      }
      const legend = a.src === 'L'; const src = legend ? null : ob(s, a.src); const c = ab.cost || {};
      pay(s, p, actionCost(s, p, a), a.mp, purposeOf(s, a));
      if (c.ex) { if (legend) pl.legEx = true; else exhaustObj(s, src); }
      if (src && src.k === 'g' && !legend) pl.tc.gearAb = (pl.tc.gearAb || 0) + 1;
      if (c.disemp) { if (legend) pl.legEmp = 0; else src.emp = 0; }
      if (c.xp) pl.xp -= c.xp;
      if (c.discard) { const w = pl.hand.filter((x) => !c.discardType || C[x].t === c.discardType).sort((x, y) => cardVal(x) - cardVal(y))[0]; if (w) discardCard(s, p, w); }
      if (c.recycleTrash) { for (let i = 0; i < c.recycleTrash && pl.trash.length; i++) pl.deck.push(pl.trash.shift()); emit(s, 'youRecycle', { p }); }
      if (c.recycleTrashUnit) { const i = pl.trash.findIndex((x) => C[x].t === 'u'); if (i >= 0) pl.deck.push(pl.trash.splice(i, 1)[0]); }
      if (c.spendBuffSelf && src) { src.buff--; emit(s, 'buffSpent', { p, obj: src.id }); }
      if (c.killFriendly) { const v = s.objs.filter((o) => o.ctrl === p && o !== src && (c.killFriendly === 'ug' || o.k === 'u')).sort((x, y) => cardVal(x.cid) - cardVal(y.cid))[0]; if (v) kill(s, v); }
      if (c.exhaustFriendly) { const v = unitsOf(s, p).find((o) => !o.ex && o !== src); if (v) { v.ex = true; a.exhausted = v.id; } }
      if (c.exhaustFriendlyMighty) { const v = unitsOf(s, p).find((o) => !o.ex && o !== src && isMighty(s, o)); if (v) { v.ex = true; a.exhausted = v.id; } }
      if (ab.limit && ab.limit.once) s.onceUsed[(legend ? 'L' + p : src.id) + ':act' + a.idx] = true;
      const nm = legend ? cn(pl.legend) : cn(src.cid);
      const kcid = legend ? pl.legend : src.cid; STATS.fired[kcid] = (STATS.fired[kcid] || 0) + 1;
      log(`${P(p)} ${vb(p, 'use', 'uses')} ${nm}${pickText(s, a.picks, 0)}.`, who);
      if (src && src.k === 'g') emit(s, 'gearAbility', { p, obj: src.id });
      const snapPile = src && src.pile ? src.pile.slice() : null;
      if (c.killSelf && src) removeObj(s, src, 'trash');
      if (c.banishSelf && src) removeObj(s, src, 'banish');
      s.exec.push({ eff: ab.eff, i: 0, ctx: { p, self: legend ? null : (src ? src.id : null), card: legend ? pl.legend : a.host && ob(s, a.host) ? ob(s, a.host).cid : (src ? src.cid : null), it: [], picks: (a.picks || []).slice(), pi: 0, selfIsLegend: legend, x: a.x, spendOn: ab.limit && ab.limit.spendOn, exhausted: a.exhausted, snapPile, bonus: src && src.k === 'g' && staticsOn(s, 'gearAbBonus', p) ? 1 : 0 } });
      noteChosen(s, { p }, (a.picks || []).flat().filter((x) => typeof x === 'number' && ob(s, x)), false);
      break;
    }
    case 'play': playCard(s, p, a); break;
  }
  if (s.mode === 'showdown' && s.sd && !['pass', 'pick'].includes(a.t)) { s.sd.passes = 0; s.sd.focus = 1 - p; }
  advance(s);
}
// "becomes Mighty" (5+ might) is noticed whenever the game settles, whatever raised the might
function mightyScan(s) {
  let fired = false;
  for (const u of s.objs) {
    if (u.k !== 'u') continue;
    const m = isMighty(s, u);
    if (m && u.wasMighty === false) { emit(s, 'becomesMighty', { obj: u.id, p: u.ctrl }); fired = true; }
    u.wasMighty = m;
  }
  return fired && s.exec.length > 0;
}
function advance(s) {
  for (let guard = 0; guard < 3000; guard++) {
    if (s.winner != null) { s.mode = 'over'; s.exec = []; s.choice = null; return; }
    if (s.choice) return;
    if (s.exec.length) { stepExec(s); continue; }
    if (mightyScan(s)) continue;
    if (s.mode === 'resolving') {
      if (s.chain.length) { resolveTop(s); continue; }
      s.mode = s.chainCtx === 'showdown' && s.sd ? 'showdown' : 'main';
      if (s.mode === 'showdown') { s.sd.focus = 1 - s.chainStarter; s.sd.passes = 0; }
      refreshControl(s); continue;
    }
    if (s.mode === 'showdown') { if (s.sd.passes >= 2) { resolveShowdown(s); s.mode = 'main'; continue; } return; }
    if (s.mode === 'main') { if (s.sdQueue.length) { openShowdown(s, s.sdQueue.shift()); continue; } return; }
    return;
  }
}

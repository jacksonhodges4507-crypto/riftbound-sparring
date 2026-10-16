/* engine v3, part 3: conditions, events, and the interpreter that runs compiled card programs. */

/* ---------------- conditions ---------------- */
function evalCond(s, c, ctx) {
  const p = ctx.p; const me = ob(s, ctx.self); const it = ob(s, firstIt(ctx)); let r;
  switch (c.c) {
    case 'control': r = s.objs.filter((o) => matchesF(s, o, c.f, Object.assign({ s }, ctx))).length >= (c.n || 1); break;
    case 'exists': r = s.objs.some((o) => matchesF(s, o, c.f, Object.assign({ s }, ctx))); break;
    case 'runes': r = (c.ge == null || s.players[p].runes.length >= c.ge) && (c.le == null || s.players[p].runes.length <= c.le); break;
    case 'hand': r = s.players[p].hand.length <= c.le; break;
    case 'myTurn': r = s.active === p; break;
    case 'paidExtra': r = !!ctx.paidExtra; break;
    case 'selfEmp': r = ctx.selfIsLegend ? s.players[p].legEmp >= (c.n || 1) : !!(me && me.emp >= (c.n || 1)); break;
    case 'selfMighty': r = me ? isMighty(s, me) : !!(ctx.snap && ctx.snap.mighty); break;
    case 'selfBuffed': r = !!(me && me.buff > 0); break;
    case 'selfAtBf': r = !!(me && me.loc !== 'base'); break;
    case 'selfAlone': r = !!(me && inCombat(s, me) && unitsAt(s, me.loc, me.ctrl).length === 1); break;
    case 'selfAttackWithOther': r = !!(me && s.sd && s.sd.combat && me.loc === s.sd.bf && s.sd.att === me.ctrl && unitsAt(s, me.loc, me.ctrl).length > 1); break;
    case 'itEmp': r = !!(it && it.emp > 0); break;
    case 'itMightLE': r = it ? might(s, it) <= c.n : (ctx.itSnapMight != null && ctx.itSnapMight <= c.n); break;
    case 'itStunned': r = !!(it && it.stun); break;
    case 'itAttacking': r = !!(it && s.sd && s.sd.combat && it.loc === s.sd.bf && it.ctrl === s.sd.att); break;
    case 'itEnemy': r = it ? it.ctrl !== p : !!ctx.itWasEnemy; break;
    case 'itType': r = !!(ctx.lookCard && (c.t === 'eq' ? isEq(ctx.lookCard) : C[ctx.lookCard].t === c.t)); break;
    case 'itDied': r = !!ctx.itDied; break;
    case 'oppNearWin': r = s.players[1 - p].pts >= winScore(s) - 3; break;
    case 'meNearWin': r = s.players[p].pts >= winScore(s) - 3; break;
    case 'playedThisTurn': r = c.t === 's' ? s.players[p].tc.spells > 0 : s.players[p].tc.cards > 0; break;
    case 'legion': r = s.players[p].tc.cards >= 1; break;
    case 'oppControlsBf': r = s.ctrl.includes(1 - p); break;
    case 'oppStunned': r = s.objs.some((o) => o.ctrl !== p && o.stun); break;
    case 'enemyAloneHere': r = !!(me && me.loc !== 'base' && unitsAt(s, me.loc).filter((u) => u.ctrl !== p).length === 1); break;
    case 'friendsHere': { const n = me && me.loc !== 'base' ? unitsAt(s, me.loc, p).filter((u) => u.id !== me.id).length : 0; r = (c.eq == null || n === c.eq) && (c.ge == null || n >= c.ge); break; }
    case 'diedAlone': r = !!(ctx.snap && ctx.snap.alone); break;
    case 'unitsThere': r = ctx.there != null && unitsAt(s, ctx.there, p).length >= c.ge; break;
    case 'unitDiedThisTurn': r = !!s.turnFx.unitDied; break;
    case 'discardedThisTurn': r = s.players[p].tc.discarded > 0; break;
    case 'gainedXpThisTurn': r = s.players[p].tc.xp > 0; break;
    case 'nameInTrash': r = !!(me && s.players[p].trash.some((x) => C[x].n === C[me.cid].n)); break;
    case 'hiddenCount': r = s.hidden.filter((h) => h.owner === p).length >= c.ge; break;
    case 'bigSpellThisTurn': r = s.players[p].tc.bigSpell; break;
    case 'spentPower': r = s.players[p].tc.spentPow >= c.ge; break;
    case 'did': r = !!ctx.did; break;
    case 'selfNotHurt': r = !!(me && me.hurtTurn !== s.turnNo); break;
    case 'fromHand': r = ctx.src === 'hand'; break;
    case 'unitsThereAll': r = ctx.there != null && unitsAt(s, ctx.there).length >= c.ge; break;
    case 'levelGE': r = s.players[p].xp >= c.n; break;
    case 'channeledLT': r = (ctx.channeled || 0) < c.n; break;
    case 'runeDeckEmpty': r = !s.players[p].runeDeck.length; break;
    case 'allTags': r = c.tags.every((t) => unitsOf(s, p).some((u) => tagsOf(s, u).includes(t))); break;
    case 'itAlone': r = !!(it && it.loc !== 'base' && unitsAt(s, it.loc, it.ctrl).length === 1); break;
    case 'hiddenHere': r = !!(me && s.hidden.some((h) => h.owner === p && h.bf === me.loc)); break;
    case 'fewerRunes': r = s.players[p].runes.length < s.players[1 - p].runes.length; break;
    case 'fromHidden': r = !!(ctx.trig && ctx.trig.fromHidden); break;
    case 'controlHere': r = ctx.here != null && unitsAt(s, ctx.here, p).length > 0; break;
    case 'handEq': r = s.players[p].hand.length === c.n; break;
    case 'unitsAtBfEq': r = s.objs.filter((o) => o.k === 'u' && o.ctrl === p && o.loc !== 'base').length === c.n; break;
    case 'champGone': r = !s.players[p].champ && !!s.players[p].chosenChamp && s.players[p].trash.includes(s.players[p].chosenChamp); break;
    case 'toBfThisTurn': r = !!s.players[p].tc.toBf; break;
    case 'deployHere': r = !!(me && s.objs.some((o) => o.k === 'g' && o.ctrl === p && o.loc === me.loc && C[o.cid].kw.deploy)); break;
    case 'tookTag': r = !!(ctx.took && (C[ctx.took].tags || []).some((t) => c.tags.includes(t))); break;
    case 'friendDied': r = !!s.players[p].tc.friendDied; break;
    case 'oppStunnedAny': r = s.objs.some((o) => o.ctrl !== p && o.stun); break;
    case 'hasHidden': r = s.hidden.some((h) => h.owner === p); break;
    case 'hiddenAtBf': r = s.hidden.some((h) => h.owner === p && h.bf != null); break;
    case 'inBeginning': r = s.inBeginning === p; break;
    case 'bfExactly2': r = [0, 1].some((i) => s.ctrl[i] === p && unitsAt(s, i).length === 2); break;
    case 'otherMightGE': r = unitsOf(s, p).filter((u) => u.id !== ctx.self).reduce((x, u) => x + might(s, u), 0) >= c.n; break;
    case 'unitsThereEq': r = ctx.there != null && unitsAt(s, ctx.there, p).length === c.n; break;
    case 'trashHasTag': r = s.players[p].trash.some((x) => C[x].t === 'u' && (C[x].e || 0) <= c.maxE && (C[x].p || []).length <= c.maxP && (C[x].tags || []).some((t) => c.tags.includes(t))); break;
    case 'playedTrio': { const t = s.players[p].tc; r = t.units > 0 && (t.gearNT || 0) > 0 && t.spells > 0; break; }
    case 'unitsHereGE': r = ctx.here != null && unitsAt(s, ctx.here, p).length >= c.n; break;
    case 'playedToBf': r = ctx.to != null && ctx.to !== 'base'; break;
    case 'diedInBeginning': r = !!s.players[p].tc.diedInBeginning; break;
    case 'enemyDied': r = !!s.players[p].tc.enemyDied; break;
    case 'friendsGearHere': r = !!(me && me.loc !== 'base' && s.objs.filter((o) => o.ctrl === p && o !== me && o.loc === me.loc && (o.k === 'u' || (o.k === 'g' && o.att == null))).length >= c.ge); break;
    case 'afterAttackExcess': r = !!(ctx.trig && ctx.trig.afterAttack && (ctx.trig.excess || 0) >= c.n); break;
    case 'excessGE': r = !!(ctx.trig && (ctx.trig.excess || 0) >= c.n); break;
    default: r = false;
  }
  return c.not ? !r : r;
}

/* ---------------- events and triggers ---------------- */
// trigger sources: [{ab, idx, self, p, card, kind}]
function* trigSources(s) {
  for (const o of s.objs) {
    const c = C[o.copyOf || o.cid]; if (!c) continue;
    for (let i = 0; i < c.ab.length; i++) if (c.ab[i].kind === 'trig' && c.ab[i].zone !== 'trash') yield { a: c.ab[i], key: o.id + ':' + i, self: o.id, p: o.ctrl, cid: o.cid, obj: o };
    if (o.att != null) { const host = ob(s, o.att); if (host) for (let i = 0; i < C[o.cid].eqab.length; i++) { const a = C[o.cid].eqab[i]; if (a.kind === 'trig') yield { a, key: o.id + ':e' + i, self: host.id, p: host.ctrl, cid: o.cid, obj: host }; } }
    if (o.grantTrig) for (let i = 0; i < o.grantTrig.length; i++) yield { a: o.grantTrig[i], key: o.id + ':g' + i, self: o.id, p: o.ctrl, cid: o.cid, obj: o };
  }
  for (const p of [0, 1]) for (const cid of new Set(s.players[p].trash)) { const c = C[cid]; if (c && c.trashTrig) for (let i = 0; i < c.ab.length; i++) if (c.ab[i].kind === 'trig' && c.ab[i].zone === 'trash') yield { a: c.ab[i], key: 'T' + p + cid + ':' + i, self: null, p, cid, fromTrash: true }; }
  for (const p of [0, 1]) { const L = s.players[p].legend; if (L && C[L]) for (let i = 0; i < C[L].ab.length; i++) if (C[L].ab[i].kind === 'trig') yield { a: C[L].ab[i], key: 'L' + p + ':' + i, self: null, p, cid: L, legend: p }; }
  for (let b = 0; b < s.bfs.length; b++) { const id = s.bfs[b].id; if (C[id]) for (let i = 0; i < C[id].ab.length; i++) if (C[id].ab[i].kind === 'trig') yield { a: C[id].ab[i], key: 'B' + b + ':' + i, self: null, p: null, cid: id, bf: b }; }
  for (const d of s.delayed) yield { a: d.a, key: 'D' + d.id, self: d.self, p: d.p, cid: d.cid, delayed: d };
}
function trigMatches(s, src, ev, d) {
  const a = src.a; const ons = Array.isArray(a.on) ? a.on : [a.on];
  const me = src.self != null ? ob(s, src.self) : null;
  const p = src.p;
  for (const on of ons) {
    let ok = false;
    switch (on) {
      case 'played': ok = ev === 'played' && d.obj === src.self && (!a.toBf || d.to !== 'base') && (!a.fromHidden || d.fromHidden) && (!a.myTurn || s.active === p); break;
      case 'playedHidden': ok = ev === 'played' && d.obj === src.self && d.fromHidden; break;
      case 'attack': case 'defend': case 'conquer': case 'hold': case 'win': case 'combatEnd': case 'becomeEmp': case 'becomeReady': case 'buffed': case 'equipped': case 'leaves':
        ok = ev === on && d.obj === src.self;
        if (ok && on === 'conquer' && a.afterAttack && !d.afterAttack) ok = false;
        if (ok && on === 'conquer' && a.open && !d.open) ok = false;
        if (ok && a.oneOnOne && !(me && s.sd && unitsAt(s, s.sd.bf).length === 2)) ok = false;
        break;
      case 'chosen': ok = ev === 'chosen' && d.obj === src.self && d.p === p && (!a.bySpell || d.bySpell); break;
      case 'move': ok = ev === 'move' && d.obj === src.self && (!a.toBf || d.to !== 'base') && (!a.fromBf || d.from !== 'base') && (!a.nth || d.nth === a.nth); break;
      case 'die': ok = ev === 'die' && d.obj === src.self && (!a.inCombat || (d.snap && d.snap.wasCombat)); break;
      case 'discarded': ok = false; break; // handled directly in emit
      case 'showdownHere': ok = ev === 'showdown' && me && me.loc === d.bf; break;
      case 'beginning': ok = ev === 'beginning' && d.p === p; break;
      case 'beginningAny': ok = ev === 'beginning' && (!a.first || d.first); break;
      case 'mainStart': ok = ev === 'mainStart' && d.p === p; break;
      case 'endTurn': ok = ev === 'endTurn' && d.p === p; break;
      case 'youPlay': case 'oppPlay': case 'anyPlay': {
        if (ev !== 'cardPlayed') break;
        if (on === 'youPlay' && d.p !== p && src.bf == null) break;
        if (on === 'oppPlay' && d.p === p) break;
        const f = a.f || {}; const c = C[d.cid];
        if (f.type && f.type !== 'c' && !(f.type === 'u' ? c.t === 'u' : f.type === 'g' ? c.t === 'g' : f.type === 's' ? c.t === 's' : false)) break;
        if (f.costGE && (d.paidE || 0) < f.costGE && (c.e || 0) < f.costGE) break;
        if (f.powGE && (c.p || []).length < f.powGE) break;
        if (f.tag && !(c.tags || []).includes(f.tag)) break;
        if (f.token && !c.token) break;
        if (f.other && d.obj === src.self) break;
        if (f.mighty) { const o = ob(s, d.obj); if (!o || !isMighty(s, o)) break; }
        if (a.oppTurn && s.active === p) break;
        if (d.token && (f.type === 'c' || !f.type)) break;
        if (a.fromHidden && !d.fromHidden) break;
        if (a.notFromHand && (d.src === 'hand' || d.token)) break;
        if (f.hasKw && !(C[d.cid].kw || {})[f.hasKw]) break;
        if (f.unitOrGear && !['u', 'g'].includes(c.t)) break;
        if (a.inShowdown && !s.sd) break;
        if (a.nth && s.players[d.p].tc.cards !== a.nth) break;
        if (a.selfAtBf && !(me && me.loc !== 'base')) break;
        if (a.here && !(src.bf != null ? d.to === src.bf : me && d.to === me.loc)) break;
        if (a.firstHere && !(typeof d.to === 'number' && ((s.players[d.p].tc.here || {})[d.to] || 0) === 1)) break;
        if (a.firstGear && (c.token || s.players[d.p].tc.gear !== 1)) break;
        if (a.ctrlOnly && src.bf != null && s.ctrl[src.bf] !== d.p) break;
        ok = true; break;
      }
      case 'youConquer': case 'youHold': case 'youDefend':
        if (ev !== on) break;
        if (src.bf != null) { ok = d.bf === src.bf && (!a.mightyHere || d.mightyHere); }
        else ok = d.p === p && (!a.here || (me && me.loc === d.bf));
        break;
      case 'youWin': ok = ev === 'youWin' && d.p === p && (!a.here || (me && me.loc === d.bf)); break;
      case 'youReduceHere': ok = ev === 'mightReduced' && d.p === p && me && me.loc !== 'base' && me.loc === d.bf; break;
      case 'youMoveEnemy': ok = ev === 'movedEnemy' && d.p === p; break;
      case 'chosenHere': ok = ev === 'chosen' && d.bySpell && src.bf != null && ob(s, d.obj) && ob(s, d.obj).loc === src.bf && ob(s, d.obj).ctrl === d.p; break;
      case 'drawBig': ok = ev === 'youDraw' && d.p === p && s.players[p].hand.length >= 10; break;
      case 'returnedHere': ok = ev === 'returned' && src.bf != null && d.bf === src.bf; break;
      case 'anyEndTurn': ok = ev === 'endTurn'; break;
      case 'gearAttached': ok = ev === 'gearAttached' && d.obj === src.self; break;
      case 'friendMovesFromMe': ok = ev === 'move' && me && d.obj !== me.id && d.from === me.loc && ob(s, d.obj) && ob(s, d.obj).ctrl === p; break;
      case 'becomeEx': ok = ev === 'becomeEx' && d.obj === src.self; break;
      case 'mightReached': ok = ev === 'mightChanged' && d.obj === src.self && me && might(s, me) >= a.n; break;
      case 'friendlyAttackHere': ok = ev === 'combat' && d.att === p && me && me.loc === d.bf; break;
      case 'hideHere': ok = ev === 'hide' && src.bf != null && d.bf === src.bf; break;
      case 'combatHere': ok = ev === 'combat' && src.bf != null && d.bf === src.bf; break;
      case 'unitDies': {
        if (ev !== 'die' || !d.snap || d.snap.k !== 'u') break;
        const f = a.f || {}; const sn = d.snap;
        if (f.who === 'friendly' && sn.ctrl !== p) break; if (f.who === 'enemy' && sn.ctrl === p) break;
        if (f.other && sn.id === src.self) break; if (f.buffed && !(sn.buff > 0)) break; if (f.stunned && !sn.stun) break;
        if (f.notTag && (C[sn.cid].tags || []).includes(f.notTag)) break;
        if (f.where === 'here' && !(me && sn.deadLoc === me.loc)) break;
        if (a.selfAtBf && !(me && me.loc !== 'base')) break;
        if (a.byYou && d.byP !== p) break;
        ok = true; break;
      }
      case 'killBySpell': ok = ev === 'die' && d.bySpell && d.byP === p && d.snap && d.snap.k === 'u'; break;
      case 'youStun': ok = ev === 'stunned' && d.byP === p && d.enemy; break;
      case 'youDiscard': ok = ev === 'youDiscard' && d.p === p; break;
      case 'youBanish': ok = ev === 'youBanish' && d.p === p; break;
      case 'gearPlayedHere': ok = ev === 'cardPlayed' && d.obj === src.self; break;
      case 'youRecycle': ok = ev === 'youRecycle' && d.p === p; break;
      case 'youRecycleRune': ok = ev === 'recycleRune' && d.p === p; break;
      case 'unitReadied': ok = ev === 'unitReadied' && d.p === p; break;
      case 'unitBuffed': ok = ev === 'buffed' && d.p === p; break;
      case 'buffSpent': ok = ev === 'buffSpent' && d.p === p; break;
      case 'youChoose': ok = ev === 'chosen' && d.p === p && ob(s, d.obj) && ob(s, d.obj).ctrl === p; break;
      case 'youEmpower': ok = ev === 'becomeEmp' && d.byP === p && d.obj !== src.self && !(src.legend != null && d.legend === src.legend); break;
      case 'gearAbility': ok = ev === 'gearAbility' && d.p === p; break;
      case 'youHide': ok = ev === 'hide' && d.p === p; break;
      case 'becomesMighty': ok = ev === 'becomesMighty' && d.p === p; break;
      case 'aloneCombat': ok = (ev === 'attack' || ev === 'defend') && ob(s, d.obj) && ob(s, d.obj).ctrl === p && d.alone; break;
      case 'enemyAttacks': ok = ev === 'attack' && ob(s, d.obj) && ob(s, d.obj).ctrl !== p && s.ctrl[d.bf] === p; break;
      case 'unitMoves': ok = ev === 'move' && src.bf != null && d.from === src.bf; break;
      case 'oppMoves': ok = ev === 'move' && ob(s, d.obj) && ob(s, d.obj).ctrl !== p && d.to !== 'base' && !(me && me.loc === d.to); break;
      case 'oppScores': ok = ev === 'scored' && d.p !== p; break;
      case 'youDraw': ok = ev === 'youDraw' && d.p === p && (!a.nth || d.nth === a.nth); break;
      case 'delayedDies': ok = ev === 'die' && src.delayed && d.obj === src.delayed.target; break;
      case 'delayedWins': ok = ev === 'win' && src.delayed && d.obj === src.delayed.target; break;
      case 'delayedPlayed': ok = ev === 'cardPlayed' && src.delayed && d.p === src.delayed.p && C[d.cid].t === 'u'; break;
      case 'delayedHold': ok = ev === 'youHold' && src.delayed && d.p === src.delayed.watchP; break;
      case 'delayedDamaged': ok = ev === 'damaged'; break;
      default: ok = false;
    }
    if (ok) return true;
  }
  return false;
}
function emit(s, ev, d) {
  if (s.winner != null) return;
  const frames = [];
  if (ev === 'discarded') {
    const c = C[d.cid]; if (c) c.ab.forEach((a, i) => { if (a.kind === 'trig' && (Array.isArray(a.on) ? a.on : [a.on]).includes('discarded')) STATS.fired[d.cid] = (STATS.fired[d.cid] || 0) + 1, frames.push(mkFrame(a, { p: d.p, self: null, card: d.cid, trig: d, fromZone: 'trash' })); });
  }
  if (ev === 'die' && d.snap) {
    // the dead unit's own abilities ("Deathknell", "When I die") and those granted by its equipment are gone from the board: run them from the snapshot
    const c = C[d.snap.copyOf || d.snap.cid];
    const twice = staticsOn(s, 'deathknellTwice', d.snap.ctrl) ? 2 : 1;
    if (c) c.ab.forEach((a, i) => {
      if (a.kind === 'trig' && (Array.isArray(a.on) ? a.on : [a.on]).includes('die') && gateOK(s, a, d.snap, d.snap.ctrl) && (!a.inCombat || d.snap.wasCombat))
        for (let k = 0; k < twice; k++) { const f1 = mkFrame(a, { p: d.snap.ctrl, self: d.snap.id, card: d.snap.cid, trig: d, snap: d.snap }); f1.tcid = d.snap.cid; frames.push(f1); STATS.fired[d.snap.cid] = (STATS.fired[d.snap.cid] || 0) + 1; }
    });
  }
  for (const src of trigSources(s)) {
    const a = src.a;
    if (ev === 'die' && src.self === d.obj) continue;
    if (!trigMatches(s, src, ev, d)) continue;
    const p = src.p != null ? src.p : (d.p != null ? d.p : s.active);
    if (src.obj && !gateOK(s, a, src.obj, p)) continue;
    if (src.legend != null && !gateOK(s, a, { isLegend: true }, p)) continue;
    if (a.once === 'turn') { if (s.onceUsed[src.key]) continue; s.onceUsed[src.key] = true; }
    const ctx = { p, self: src.self, card: src.cid, trig: d, selfIsLegend: src.legend != null, bf: src.bf };
    if (src.bf != null) ctx.here = src.bf;
    if (d.bf != null) ctx.there = d.bf;
    STATS.fired[src.cid] = (STATS.fired[src.cid] || 0) + 1;
    if (src.delayed) { ctx.it = src.delayed.it || []; if (src.delayed.once) s.delayed = s.delayed.filter((x) => x !== src.delayed); }
    const fr0 = mkFrame(a, ctx); fr0.tcid = src.cid; fr0.tev = ev; frames.push(fr0);
  }
  // run in order: push in reverse so the first found resolves first
  for (let i = frames.length - 1; i >= 0; i--) s.exec.push(frames[i]);
  // special: Mighty transitions
}
const STATS = { fired: {}, done: {}, changed: {}, trace: null };
function staticsOn(s, name, p) { for (const { a, src, p: q } of staticSources(s)) if (a.s === name && q === p && gateOK(s, a, src, q)) return a; return null; }
function mkFrame(a, ctx) {
  const c = Object.assign({ it: [], picks: [], pi: 0 }, ctx);
  if (c.trig && c.trig.obj != null && !c.it.length && c.trig.obj !== c.self) c.it = [c.trig.obj];
  if (c.trig && c.trig.bf != null && c.there == null) c.there = c.trig.bf;
  if (c.trig && typeof c.trig.to === 'number' && c.there == null) c.there = c.trig.to;
  return { eff: a.eff || [], i: 0, ctx: c, label: a.label };
}
function runEffects(s, eff, ctx) { s.exec.push({ eff, i: 0, ctx: Object.assign({ it: [], picks: [], pi: 0 }, ctx) }); }

/* ---------------- selectors ---------------- */
// candidates for a selector, from the point of view of ctx.p
function candidates(s, sel, ctx, chooser) {
  const f = sel.f || {}; const zone = f.zone;
  if (zone === 'trash') {
    const p = f.who === 'enemy' ? 1 - ctx.p : ctx.p; const out = [];
    const seen = new Set();
    s.players[p].trash.forEach((cid, i) => { if (seen.has(cid)) return; if (cardMatches(s, cid, f)) { seen.add(cid); out.push('T' + p + ':' + cid); } });
    if (f.who === 'any' || f.anyTrash) s.players[1 - p].trash.forEach((cid) => { if (!seen.has('o' + cid) && cardMatches(s, cid, f)) { seen.add('o' + cid); out.push('T' + (1 - p) + ':' + cid); } });
    return out;
  }
  if (f.type === 's') return s.chain.filter((x) => (f.who !== 'enemy' || x.p !== ctx.p) && !x.countered && x.id !== ctx.chainId && spellFilter(s, x, f, ctx)).map((x) => 'S' + x.id);
  if (f.type === 'r') return s.players[ctx.p].runes.map((r) => 'R' + r.id);
  if (f.type === 'L') return [0, 1].map((p) => 'L' + p);
  if (f.type === 'B') return [0, 1].map((i) => 'B' + i);
  if (f.type === 'c') return s.players[ctx.p].hand.map((c, i) => 'H' + i);
  let list = s.objs.filter((o) => matchesF(s, o, f, Object.assign({ s }, ctx)));
  if (sel.notIt && ctx.it && ctx.it.length) list = list.filter((o) => !ctx.it.includes(o.id));
  if (sel._move) list = list.filter((o) => !o.noMove);
  if (chooser != null) list = list.filter((o) => canBeChosen(s, o, chooser));
  return list.map((o) => o.id);
}
function cardMatches(s, cid, f) {
  const c = C[cid]; if (!c) return false;
  if (f.type === 'u' && c.t !== 'u') return false; if (f.type === 'g' && c.t !== 'g') return false; if (f.type === 's' && c.t !== 's') return false; if (f.type === 'ug' && !['u', 'g'].includes(c.t)) return false;
  if (f.costLE != null && typeof f.costLE === 'number' && (c.e || 0) > f.costLE) return false;
  if (f.powLE != null && (c.p || []).length > f.powLE) return false;
  if (f.tagAny && !f.tagAny.some((t) => (c.tags || []).includes(t))) return false;
  if (f.tag && !(c.tags || []).includes(f.tag)) return false;
  if (f.hasKw && !c.kw[f.hasKw]) return false;
  return true;
}
function spellFilter(s, x, f, ctx) {
  const c = C[x.cid];
  if (f.costLE != null && (c.e || 0) > f.costLE) return false;
  if (f.powLE != null && (c.p || []).length > f.powLE) return false;
  if (f.ctrlPlayed2 && !(s.players[x.p].tc.spells >= 2)) return false;
  if (f.choosesFriendly && !(x.chosen || []).some((id) => { const o = ob(s, id); return o && o.ctrl === ctx.p; })) return false;
  if (C[x.cid].kw.uncounterable) return false;
  return true;
}
// polarity of an effect for AI targeting
function polOf(op) {
  if (!op) return 0;
  if (['deal', 'kill', 'banish', 'stun', 'counter', 'steal', 'exhaust'].includes(op.op)) return -1;
  if (op.op === 'return') return -0.6;
  if (op.op === 'might') return op.n < 0 ? -1 : 1;
  if (['buff', 'ready', 'giveKw', 'heal', 'empower', 'double'].includes(op.op)) return 1;
  if (op.op === 'move') return 0;
  return 0;
}

/* ---------------- the interpreter ---------------- */
const WAIT = Symbol('wait');
function needChoice(s, frame, kind, data) {
  if (frame.fid == null) frame.fid = 'f' + (s.nid++);
  s.choice = { p: data.p != null ? data.p : frame.ctx.p, kind, data, fid: frame.fid, at: frame.i, frameDepth: s.exec.indexOf(frame) };
  return WAIT;
}
// an answer only counts for the op that asked for it
function takeAns(frame) { if ('_ans' in frame.ctx) { const v = frame.ctx._ans, at = frame.ctx._ansAt; delete frame.ctx._ans; delete frame.ctx._ansAt; if (at != null && at !== frame.i) return null; return { v }; } return null; }

// resolve a selector to a list of object ids (may ask a choice)
function resolveSel(s, frame, sel, op) {
  // an op that asks a later question re-runs: reuse the targets it already resolved
  if (frame._sel && frame._sel.i === frame.i && frame._sel.sel === sel) { frame.ctx._fromPicks = true; return frame._sel.r.slice(); }
  const r = resolveSel0(s, frame, sel, op);
  if (r !== WAIT && sel) frame._sel = { i: frame.i, sel, r: r.slice(), fp: !!frame.ctx._fromPicks };
  return r;
}
function resolveSel0(s, frame, sel, op) {
  const ctx = frame.ctx;
  if (!sel) return [];
  if (sel.q === 'self') return ctx.self != null && ob(s, ctx.self) ? [ctx.self] : (ctx.self != null && ctx.snap ? [] : []);
  if (sel.q === 'it') return (ctx.it || []).filter((id) => typeof id !== 'number' || ob(s, id));
  if (sel.q === 'host') { const g = ob(s, ctx.self); return g && g.att != null ? [g.att] : []; }
  const chooser = ctx.p;
  const cands = candidates(s, op && op.op === 'move' && !sel._move ? Object.assign({}, sel, { _move: true }) : sel, ctx, ['each', 'all'].includes(sel.q) ? null : chooser);
  if (sel.q === 'each' || sel.q === 'all') {
    if (sel.f && sel.f.where === 'same' && cands.length) { /* group: pick the location of the first chosen */ }
    return cands;
  }
  // play-time picks (spells and abilities choose targets as they're played)
  if (ctx.picks && ctx.pi < ctx.picks.length) {
    const pk = ctx.picks[ctx.pi++]; const arr = Array.isArray(pk) ? pk : (pk == null ? [] : [pk]);
    ctx._fromPicks = true;
    return arr.filter((id) => cands.includes(id));
  }
  const a = takeAns(frame);
  if (a) { const v = a.v; const arr = Array.isArray(v) ? v : (v == null ? [] : [v]); return arr.filter((id) => cands.includes(id)); }
  if (!cands.length) return [];
  const n = sel.n || 1;
  if (sel.q === 'one' && cands.length <= n && !sel.optional) return cands.slice();
  return needChoice(s, frame, 'sel', { opts: cands, n, upto: sel.q === 'upto', why: frame.why || 'Choose', pol: polOf(op), op: op && op.op, same: sel.f && sel.f.where === 'same' });
}
function noteChosen(s, ctx, ids, bySpell) {
  let enemies = 0;
  for (const id of ids) {
    const o = ob(s, id); if (!o) continue;
    if (o.ctrl !== ctx.p) enemies++;
    emit(s, 'chosen', { obj: id, p: ctx.p, bySpell });
  }
  if (enemies) s.players[ctx.p].chose += 1;
}
function valOf(s, n, ctx) {
  if (typeof n === 'number') return n;
  if (!n) return 0;
  if (n.ref === 'selfMight') { const o = ob(s, ctx.self); return o ? might(s, o) : (ctx.snap ? ctx.snap.lastMight || 0 : 0); }
  if (n.ref === 'itMight') { const o = ob(s, firstIt(ctx)); return o ? might(s, o) : 0; }
  if (n.ref === 'selfAssault') { const o = ob(s, ctx.self); return o ? (kwOf(s, o).assault || 0) : 0; }
  if (n.ref === 'x') return ctx.x || 0;
  if (n.ref === 'ifEmp') { const o = ob(s, ctx.self); return o && o.emp > 0 ? n.b : n.a; }
  if (n.ref === 'spent') return ctx.spent || 0;
  if (n.ref === 'plusCount') return n.base + countOf(s, n.per, ctx);
  if (n.ref === 'saved') return ctx.saved || 0;
  if (n.ref === 'lastDiscardE') return ctx.lastDiscard ? C[ctx.lastDiscard].e || 0 : 0;
  if (n.ref === 'negCount') return -countOf(s, n.per, ctx);
  if (n.ref === 'mult') return n.k * (n.per ? countOf(s, n.per, ctx) : valOf(s, n.v, ctx));
  if (n.ref === 'excess') return (ctx.trig && ctx.trig.excess) || 0;
  if (n.ref === 'itDmg') { const o = ob(s, firstIt(ctx)); return o ? o.dmg : 0; }
  if (n.ref === 'selfMightRef') { const o = ob(s, ctx.self); return o ? might(s, o) : 0; }
  if (n.ref === 'ifCond') return evalCond(s, n.cond, ctx) ? n.b : n.a;
  if (n.ref === 'itCost') { const o = ob(s, firstIt(ctx)); return o ? C[o.cid].e || 0 : 0; }
  if (n.ref === 'count') return countOf(s, n.per, ctx);
  return 0;
}
function bonusDmg(s, ctx, target) {
  let b = 0;
  for (const { a, src, p } of staticSources(s)) {
    if (a.s === 'bonusDmg' && p === ctx.p && gateOK(s, a, src, p)) b += a.n;
    if (a.s === 'bonusDmgHere' && target && target.loc === src.loc) b += a.n;
  }
  if (ctx.bonus) b += ctx.bonus;
  return b;
}

const OPS = {};
// step one effect; returns WAIT if a choice is needed
function stepExec(s) {
  const fr = s.exec[s.exec.length - 1];
  if (!fr) return;
  if (s.exec.length > 300) { log('(a loop of triggered effects was stopped)'); s.exec = []; return; }
  if (STATS.trace && fr.tcid && fr.tsig == null) fr.tsig = STATS.trace(s);
  if (fr.i >= fr.eff.length) {
    s.exec.pop(); if (fr.onDone) fr.onDone(s);
    if (STATS.trace && fr.tcid && fr.tsig != null) { const k = fr.tcid; STATS.done[k] = (STATS.done[k] || 0) + 1; if (STATS.trace(s) !== fr.tsig) STATS.changed[k] = (STATS.changed[k] || 0) + 1; else if (STATS.onDead) STATS.onDead(s, fr); delete fr.tsig; }
    // cards looked at but never placed go back on top of the deck
    if (fr.ctx.look && fr.ctx.look.length && !s.exec.some((f) => f.ctx === fr.ctx)) { const pl = s.players[fr.ctx.p]; if (pl) pl.deck.unshift(...fr.ctx.look); fr.ctx.look = []; }
    return;
  }
  const op = fr.eff[fr.i];
  const fn = OPS[op.op] || (typeof HAND_OPS !== 'undefined' && HAND_OPS[op.op]);
  if (!fn) { log(`(effect "${op.op}" isn't automated: apply it by hand)`); fr.i++; return; }
  const r = fn(s, fr, op);
  if (r === WAIT) return WAIT;
  if (s.exec[s.exec.length - 1] === fr || s.exec.includes(fr)) { /* advance this frame (it may now be under a child frame) */ }
  fr.i++;
}
function pushChild(s, eff, ctx) { if (!eff || !eff.length) return; s.exec.push({ eff, i: 0, ctx }); }
const each = (s, ids, fn) => { for (const id of ids) { const o = ob(s, id); if (o) fn(o); } };
const who = (s, ctx, w) => {
  if (!w || w === 'you') return [ctx.p];
  if (w === 'each') return [ctx.p, 1 - ctx.p];
  if (w === 'opp') return [1 - ctx.p];
  if (w === 'trigP') return [ctx.trig && ctx.trig.p != null ? ctx.trig.p : ctx.p];
  if (w === 'chosenPlayer') return [ctx.chosenPlayer != null ? ctx.chosenPlayer : 1 - ctx.p];
  if (w === 'itController') { const o = ob(s, firstIt(ctx)); return [o ? o.ctrl : (ctx.itCtrl != null ? ctx.itCtrl : 1 - ctx.p)]; }
  if (w === 'itOwner') { const o = ob(s, firstIt(ctx)); return [o ? o.owner : (ctx.itOwner != null ? ctx.itOwner : ctx.p)]; }
  return [ctx.p];
};
const selIds = (s, fr, op) => { fr.ctx._fromPicks = false; const r = resolveSel(s, fr, op.t, op); if (r === WAIT) return WAIT; if (op.t && !['self', 'it', 'each', 'all'].includes(op.t.q)) { fr.ctx.it = r.slice(); if (!fr.ctx._fromPicks) noteChosen(s, fr.ctx, r, fr.ctx.isSpell); const o0 = ob(s, r[0]); if (o0 && typeof o0.loc === 'number' && fr.ctx.there == null) fr.ctx.thereFromIt = o0.loc; } else if (op.t && ['each', 'all'].includes(op.t.q)) fr.ctx.it = r.slice(); return r; };

OPS.draw = (s, fr, op) => { const n = op.per ? op.n * countOf(s, op.per, fr.ctx) : op.n; for (const p of who(s, fr.ctx, op.who)) drawN(s, p, n); };
OPS.channel = (s, fr, op) => { for (const p of who(s, fr.ctx, op.who)) { const g = channel(s, p, op.n, op.ex); fr.ctx.channeled = g; if (g) log(`${P(p)} ${vb(p, 'channel', 'channels')} ${g} rune${g > 1 ? 's' : ''}.`); } };
OPS.readyRunes = (s, fr, op) => {
  if (op.delay) { s.endFx.push({ k: 'readyRunes', p: fr.ctx.p, n: op.n }); return; }
  let n = op.n; for (const r of s.players[fr.ctx.p].runes) if (r.ex && n > 0) { r.ex = false; n--; }
};
OPS.xp = (s, fr, op) => { const n = op.per ? op.n * countOf(s, op.per, fr.ctx) : op.n; const pl = s.players[fr.ctx.p]; pl.xp += n; pl.tc.xp += n; if (n) { log(`${P(fr.ctx.p)} ${vb(fr.ctx.p, 'gain', 'gains')} ${n} XP (${pl.xp}).`); emit(s, 'gainXp', { p: fr.ctx.p, n }); } };
OPS.score = (s, fr, op) => { for (const p of who(s, fr.ctx, op.who)) { const g = gainPoints(s, p, op.n, 'effect'); if (g) log(`${P(p)} ${vb(p, 'score', 'scores')} ${op.n} (${s.players[p].pts}).`, 'score'); } };
OPS.discard = (s, fr, op) => {
  const ps = who(s, fr.ctx, op.who); const ctx = fr.ctx;
  ctx._dq = ctx._dq || ps.flatMap((p) => Array(op.n).fill(p));
  while (ctx._dq.length) {
    const p = ctx._dq[0]; const pl = s.players[p];
    if (!pl.hand.length) { ctx._dq.shift(); continue; }
    const a = takeAns(fr);
    if (!a) return needChoice(s, fr, 'discard', { p, opts: [...new Set(pl.hand)], why: `${cn(ctx.card)}: discard 1` });
    ctx._dq.shift(); discardCard(s, p, a.v); ctx.lastDiscard = a.v;
  }
  delete ctx._dq;
};
OPS.discardHand = (s, fr, op) => { for (const p of who(s, fr.ctx, op.who)) { const pl = s.players[p]; while (pl.hand.length) discardCard(s, p, pl.hand[0]); } };
OPS.predict = (s, fr, op) => {
  const pl = s.players[fr.ctx.p]; const ctx = fr.ctx;
  if (ctx._pr == null) ctx._pr = { left: Math.min(op.n, pl.deck.length), keep: [] };
  while (ctx._pr.left > 0) {
    const top = pl.deck[0]; const a = takeAns(fr);
    if (!a) return needChoice(s, fr, 'vision', { top, why: `Predict: you see ${cn(top)} on top of your deck. Keep it or recycle it?` });
    pl.deck.shift(); if (a.v === 'recycle') { pl.deck.push(top); log(`${P(ctx.p)} ${vb(ctx.p, 'recycle', 'recycles')} the top card.`); } else ctx._pr.keep.push(top);
    ctx._pr.left--;
  }
  pl.deck.unshift(...ctx._pr.keep); delete ctx._pr;
};
OPS.burn = (s, fr, op) => { for (const p of who(s, fr.ctx, op.who)) { const pl = s.players[p]; for (let i = 0; i < op.n && pl.deck.length; i++) { const c = pl.deck.shift(); pl.trash.push(c); fr.ctx.burned = c; } log(`${P(p)} ${vb(p, 'burn', 'burns')} ${op.n} (top of deck into the trash).`); } };
OPS.mill = (s, fr, op) => { const pl = s.players[fr.ctx.p]; for (let i = 0; i < op.n && pl.deck.length; i++) pl.trash.push(pl.deck.shift()); };
OPS.add = (s, fr, op) => {
  if (op.delay) { s.endFx.push({ k: 'addNextMain', p: fr.ctx.p, res: op.res }); return; }
  const pl = s.players[fr.ctx.p]; const r = op.res; const limit = fr.ctx.spendOn || null;
  for (let i = 0; i < (r.e || 0); i++) pl.pool.push({ e: 1, lim: limit });
  for (const d of r.pw || []) pl.pool.push({ p: d, lim: limit });
};
OPS.addX = (s, fr, op) => { const pl = s.players[fr.ctx.p]; const x = fr.ctx.x || 0; for (let i = 0; i < x; i++) pl.pool.push(op.from === 'e' ? { p: 'any' } : { e: 1 }); };
OPS.gold = (s, fr, op) => { const n = op.n || 1; for (let i = 0; i < n; i++) newObj(s, { cid: 'tok-gold', k: 'g', owner: fr.ctx.p, loc: 'base', ex: true }); log(`${P(fr.ctx.p)} ${vb(fr.ctx.p, 'make', 'makes')} ${n > 1 ? n + ' Gold' : 'a Gold'}.`, fr.ctx.p ? 'ai' : 'you'); };
OPS.token = (s, fr, op) => {
  const ctx = fr.ctx; const me = ob(s, ctx.self);
  let n = op.n || 1; if (op.per) n *= countOf(s, op.per, ctx);
  let kw = op.kw || {}; let cid = tokenCard(op.name, 'u', op.m, kw);
  if ((op.m || C[cid].m || 0) < 3 && s.objs.some((o) => o.ctrl === ctx.p && o.loc !== 'base' && hasStatic(s, o, 'mechReplace'))) { cid = tokenCard('Mech', 'u', 3, {}); op = Object.assign({}, op, { name: 'Mech' }); log('Heimerdinger: a 3-might Mech is made instead.'); }
  let loc = 'base';
  if (op.where === 'here') loc = me && me.loc != null ? me.loc : ctx.snap && ctx.snap.deadLoc != null ? ctx.snap.deadLoc : (ctx.there != null ? ctx.there : 'base');
  if (op.where === 'moveFrom') loc = ctx.trig && ctx.trig.from != null ? ctx.trig.from : 'base';
  if (op.where === 'there') loc = ctx.there != null ? ctx.there : (me ? me.loc : 'base');
  if (loc !== 'base' && s.ctrl[loc] !== ctx.p && unitsAt(s, loc).some((u) => u.ctrl !== ctx.p)) loc = 'base';
  const made = [];
  const readyAll = op.ready || staticsOn(s, 'tokensEnterReady', ctx.p);
  if (!s.onceUsed['zilean' + ctx.p] && s.objs.some((o) => o.ctrl === ctx.p && o.loc !== 'base' && hasStatic(s, o, 'tokenDouble'))) { s.onceUsed['zilean' + ctx.p] = true; n *= 2; log('Zilean: an extra copy of the token is played.'); }
  for (let i = 0; i < n; i++) { const o = newObj(s, { cid, k: 'u', owner: ctx.p, loc, ex: !readyAll }); made.push(o.id); emit(s, 'cardPlayed', { p: ctx.p, cid, obj: o.id, to: loc, token: true }); }
  ctx.it = made;
  log(`${P(ctx.p)} ${vb(ctx.p, 'make', 'makes')} ${n > 1 ? n + ' ' : 'a '}${C[cid].m}-might ${op.name}${n > 1 ? 's' : ''}${loc !== 'base' ? ' at ' + bfName(s, loc) : ''}.`, ctx.p ? 'ai' : 'you');
  refreshControl(s);
};
OPS.counter = (s, fr, op) => {
  const ids = resolveSel(s, fr, op.t, op); if (ids === WAIT) return WAIT;
  for (const sid of ids) {
    const x = s.chain.find((c) => 'S' + c.id === sid || c.id === sid); if (!x || x.countered) continue;
    if (staticsOn(s, 'uncounterable', x.p)) { log(`${cn(x.cid)} can't be countered.`); continue; }
    if (op.unless && s.players[x.p].human && canPay(s, x.p, op.unless)) {
      const a = takeAns(fr);
      if (!a) return needChoice(s, fr, 'yn', { p: x.p, why: `${cn(fr.ctx.card)}: pay ${op.unless.e} energy, or ${cn(x.cid)} is countered`, yes: `Pay ${op.unless.e}`, no: 'Let it be countered' });
      if (a.v === 'yes') { pay(s, x.p, op.unless); log(`${P(x.p)} ${vb(x.p, 'pay', 'pays')} ${op.unless.e} to keep ${cn(x.cid)}.`); continue; }
    } else if (op.unless && !s.players[x.p].human && canPay(s, x.p, op.unless)) { pay(s, x.p, op.unless); log(`${P(x.p)} ${vb(x.p, 'pay', 'pays')} ${op.unless.e} to keep ${cn(x.cid)}.`); continue; }
    x.countered = true; fr.ctx.countered = x.id; log(`${cn(x.cid)} is countered.`);
  }
};
OPS.counterToHand = (s, fr) => { const x = s.chain.find((c) => c.id === fr.ctx.countered); if (x) x.toHand = true; };
OPS.deal = (s, fr, op) => {
  const ids = selIds(s, fr, op); if (ids === WAIT) return WAIT;
  const n = valOf(s, op.n, fr.ctx);
  const srcInfo = { spell: fr.ctx.isSpell, p: fr.ctx.p };
  fr.ctx.itDied = false;
  each(s, ids, (o) => { const amt = n + bonusDmg(s, fr.ctx, o); if (amt > 0) { log(`${cn(fr.ctx.card)} deals ${amt} to ${cn(o.cid)}.`); damage(s, o, amt, srcInfo); if (!s.objs.includes(o)) fr.ctx.itDied = true; } });
};
OPS.fight = (s, fr) => {
  let ids = (fr.ctx.it || []).slice(); if (ids.length === 1 && fr.ctx.self != null) ids = [fr.ctx.self, ids[0]];
  const [a, b] = ids.map((id) => ob(s, id)); if (!a || !b) return;
  const ma = might(s, a), mb = might(s, b); log(`${cn(a.cid)} and ${cn(b.cid)} deal damage to each other.`);
  damage(s, b, ma, { p: fr.ctx.p }); damage(s, a, mb, { p: fr.ctx.p });
};
OPS.might = (s, fr, op) => {
  const ids = selIds(s, fr, op); if (ids === WAIT) return WAIT;
  let n = valOf(s, op.n, fr.ctx); if (op.per) n *= countOf(s, op.per, fr.ctx);
  if (n < 0 && op.t && !['each', 'all', 'self'].includes(op.t.q) && staticsOn(s, 'extraMinus', fr.ctx.p)) n -= 1;
  each(s, ids, (o) => {
    if (n < 0 && fxToMight(s, o, fr, op)) return;
    if (n < 0 && op.min1) { const cur = might(s, o); const nw = Math.max(Math.min(cur, 1), cur + n); o.mod += nw - cur; }
    else o.mod += n;
  });
  if (ids.length) log(`${ids.map((id) => cn(ob(s, id) && ob(s, id).cid)).join(', ')} ${n >= 0 ? 'get' : 'get'} ${n >= 0 ? '+' : ''}${n} might this turn.`);
  if (n > 0) each(s, ids, (o) => emit(s, 'mightChanged', { obj: o.id }));
  if (n < 0) each(s, ids, (o) => { if (o.ctrl !== fr.ctx.p) emit(s, 'mightReduced', { p: fr.ctx.p, obj: o.id, bf: o.loc }); });
  checkDeaths(s);
};
OPS.giveKw = (s, fr, op) => { const ids = selIds(s, fr, op); if (ids === WAIT) return WAIT; each(s, ids, (o) => { const tgt = op.perm ? o.kwP : o.kwT; addKw(tgt, op.kw); }); if (ids.length) log(`${ids.map((id) => cn(ob(s, id).cid)).join(', ')} gain${ids.length > 1 ? '' : 's'} ${Object.keys(op.kw).map((k) => '[' + k + ']').join(' ')}.`); };
OPS.temp = (s, fr, op) => { const ids = selIds(s, fr, op); if (ids === WAIT) return WAIT; each(s, ids, (o) => { o.temp = true; }); };
OPS.double = (s, fr, op) => { const ids = selIds(s, fr, op); if (ids === WAIT) return WAIT; each(s, ids, (o) => { o.dbl = (o.dbl || 0) + 1; }); };
OPS.kill = (s, fr, op) => { const ids = selIds(s, fr, op); if (ids === WAIT) return WAIT; fr.ctx.itSnapMight = ids.length ? might(s, ob(s, ids[0])) : null; each(s, ids, (o) => { fr.ctx.itWasEnemy = o.ctrl !== fr.ctx.p; fr.ctx.itCtrl = o.ctrl; kill(s, o, { spell: fr.ctx.isSpell, p: fr.ctx.p }); }); };
OPS.banish = (s, fr, op) => { const ids = selIds(s, fr, op); if (ids === WAIT) return WAIT; each(s, ids, (o) => { log(`${cn(o.cid)} is banished.`); removeObj(s, o, 'banish'); }); };
OPS.return = (s, fr, op) => { const ids = selIds(s, fr, op); if (ids === WAIT) return WAIT; each(s, ids, (o) => { if (o.k === 'u' && fxToMight(s, o, fr, op)) return; returnToHand(s, o); }); };
OPS.recall = (s, fr, op) => { const ids = selIds(s, fr, op); if (ids === WAIT) return WAIT; each(s, ids, (o) => { recallUnit(s, o, op.ex); log(`${cn(o.cid)} is recalled to base.`); }); };
OPS.ready = (s, fr, op) => { const ids = selIds(s, fr, op); if (ids === WAIT) return WAIT; each(s, ids, (o) => { if (o.ctrl !== fr.ctx.p && s.objs.some((w) => w.ctrl === fr.ctx.p && false)) return; if (s.objs.some((w) => w.k === 'u' && w.ctrl !== o.ctrl && w.loc !== 'base' && hasStatic(s, w, 'noReadyEnemies'))) { log(`${cn(o.cid)} can't be readied.`); return; } if (o.ex) { readyObj(s, o); log(`${cn(o.cid)} is readied.`); } }); };
OPS.exhaust = (s, fr, op) => { const ids = selIds(s, fr, op); if (ids === WAIT) return WAIT; each(s, ids, (o) => exhaustObj(s, o)); };
function fxToMight(s, o, fr, op) { if (o.ctrl === fr.ctx.p || !op.t || ['each', 'all'].includes(op.t.q)) return false; if (!hasStatic(s, o, 'fxToMight')) return false; o.mod += 3; log(`${cn(o.cid)} gets +3 might instead.`); return true; }
OPS.stun = (s, fr, op) => { const ids = selIds(s, fr, op); if (ids === WAIT) return WAIT; each(s, ids, (o) => { if (fxToMight(s, o, fr, op)) return; o.stun = true; log(`${cn(o.cid)} is stunned.`); emit(s, 'stunned', { obj: o.id, byP: fr.ctx.p, enemy: o.ctrl !== fr.ctx.p }); }); };
OPS.buff = (s, fr, op) => {
  const ids = selIds(s, fr, op); if (ids === WAIT) return WAIT;
  each(s, ids, (o) => { const many = hasStatic(s, o, 'manyBuffs'); if (o.buff > 0 && !many) return; o.buff += 1; log(`${cn(o.cid)} is buffed.`); emit(s, 'buffed', { obj: o.id, p: fr.ctx.p }); });
};
OPS.heal = (s, fr, op) => { const ids = selIds(s, fr, op); if (ids === WAIT) return WAIT; each(s, ids, (o) => { o.dmg = 0; }); };
OPS.empower = (s, fr, op) => {
  if (op.t && op.t.q === 'self' && fr.ctx.selfIsLegend) { const pl = s.players[fr.ctx.p]; pl.legEmp++; emit(s, 'becomeEmp', { legend: fr.ctx.p, byP: fr.ctx.p }); return; }
  const ids = selIds(s, fr, op); if (ids === WAIT) return WAIT; each(s, ids, (o) => empowerObj(s, o, fr.ctx.p));
};
function empowerObj(s, o, byP) { const max = hasStatic(s, o, 'empMax3') ? 3 : 1; if (o.emp >= max) return; o.emp++; log(`${cn(o.cid)} is empowered.`); emit(s, 'becomeEmp', { obj: o.id, byP }); }
OPS.disempower = (s, fr, op) => {
  if (op.t && op.t.q === 'self' && fr.ctx.selfIsLegend) { s.players[fr.ctx.p].legEmp = 0; return; }
  const ids = selIds(s, fr, op); if (ids === WAIT) return WAIT; each(s, ids, (o) => { o.emp = 0; });
};
OPS.choose = (s, fr, op) => {
  fr.ctx._fromPicks = false; const ids = resolveSel(s, fr, op.t, op); if (ids === WAIT) return WAIT;
  for (const id of ids) if (typeof id === 'string' && id[0] === 'B') fr.ctx.there = +id.slice(1);
  if (op.slot === 'b') fr.ctx.it = (fr.ctx.it || []).concat(ids); else fr.ctx.it = ids.slice();
  if (!fr.ctx._fromPicks) noteChosen(s, fr.ctx, ids, fr.ctx.isSpell);
};
OPS.choosePlayer = (s, fr, op) => {
  if (op.opp) { fr.ctx.chosenPlayer = 1 - fr.ctx.p; return; }
  const a = takeAns(fr);
  if (!a) return needChoice(s, fr, 'player', { why: `${cn(fr.ctx.card)}: choose a player`, opts: [1 - fr.ctx.p, fr.ctx.p] });
  fr.ctx.chosenPlayer = a.v;
};
OPS.revealHand = (s, fr, op) => { for (const p of who(s, fr.ctx, op.who)) { s.reveal[p] = true; log(`${P(p)} ${vb(p, 'reveal', 'reveals')} ${vb(p, 'your', 'their')} hand.`); } };
OPS.recycleTrash = (s, fr, op) => {
  const pl = s.players[fr.ctx.p]; let n = Math.min(op.n, pl.trash.length);
  for (let i = 0; i < n; i++) { const c = pl.trash.shift(); pl.deck.push(c); }
  if (n) emit(s, 'youRecycle', { p: fr.ctx.p });
};
OPS.recycleRune = (s, fr, op) => {
  const pl = s.players[fr.ctx.p]; if (!pl.runes.length) return;
  const a = takeAns(fr);
  if (!a && pl.human && pl.runes.length > 1) return needChoice(s, fr, 'rune', { why: `${cn(fr.ctx.card)}: choose a rune to recycle`, opts: pl.runes.map((r) => r.id) });
  const id = a ? a.v : (pl.runes.find((r) => r.ex) || pl.runes[pl.runes.length - 1]).id;
  const i = pl.runes.findIndex((r) => r.id === id); if (i < 0) return;
  pl.runeDeck.push(pl.runes.splice(i, 1)[0].d); log(`${P(fr.ctx.p)} ${vb(fr.ctx.p, 'recycle', 'recycles')} a rune.`); emit(s, 'recycleRune', { p: fr.ctx.p });
};
OPS.steal = (s, fr, op) => { const ids = selIds(s, fr, op); if (ids === WAIT) return WAIT; each(s, ids, (o) => { o.ctrl = fr.ctx.p; o.ex = true; if (op.recall) recallUnit(s, o, true); log(`${P(fr.ctx.p)} ${vb(fr.ctx.p, 'take', 'takes')} control of ${cn(o.cid)}.`); refreshControl(s); }); };
OPS.move = (s, fr, op) => {
  const ids = selIds(s, fr, op); if (ids === WAIT) return WAIT;
  if (!ids.length) return;
  const ctx = fr.ctx; let to = op.to;
  const me = ob(s, ctx.self);
  if (to === 'here') to = me ? me.loc : ctx.there;
  else if (to === 'there') to = ctx.there != null ? ctx.there : (me ? me.loc : 'base');
  else if (to === 'itloc') { const ref = ob(s, ctx.it && ctx.it.length > 1 ? ctx.it[0] : ctx.self); to = ref ? ref.loc : 'base'; }
  else if (to === 'base') to = 'base';
  else if (to === 'itLoc1') { const r = ob(s, firstIt(ctx)); if (!r) return; to = r.loc; }
  else if (to === 'trigTo') { to = ctx.trig ? ctx.trig.to : null; if (to == null) return; }
  else if (to === 'exhaustedLoc') { const x = ob(s, ctx.exhausted); if (!x) return; to = x.loc; }
  else if (['any', 'bf', 'bfOther', 'bfMine', 'bfOpen', 'withFriend', 'bfMineUnits', 'bfEnemy'].includes(to)) {
    const u0 = ob(s, ids[0]);
    let opts = ['base', 0, 1].filter((d) => d !== u0.loc);
    if (to !== 'any') opts = opts.filter((d) => d !== 'base');
    if (to === 'bfMine') opts = opts.filter((d) => s.ctrl[d] === ctx.p);
    if (to === 'bfOpen') opts = opts.filter((d) => !unitsAt(s, d).length);
    if (to === 'bfMineUnits') opts = opts.filter((d) => unitsAt(s, d, ctx.p).length);
    if (to === 'withFriend') opts = ['base', 0, 1].filter((d) => d !== u0.loc && unitsAt(s, d).some((x) => x.ctrl === u0.ctrl && x.id !== u0.id));
    if (!opts.length) return;
    const a = takeAns(fr);
    if (!a && opts.length > 1) return needChoice(s, fr, 'dest', { opts, why: `${cn(ctx.card)}: move ${cn(u0.cid)} where?`, obj: u0.id });
    to = a ? a.v : opts[0];
  }
  if (to == null) return;
  each(s, ids, (o) => { if (o.ctrl !== ctx.p && hasStatic(s, o, 'noEnemyMove')) { log(`${cn(o.cid)} can't be moved.`); return; } if (o.loc !== to) { log(`${cn(o.cid)} moves to ${bfName(s, to)}.`); moveUnit(s, o, to, { byEffect: true, byP: ctx.p }); if (o.ctrl !== ctx.p) emit(s, 'movedEnemy', { p: ctx.p, obj: o.id }); } });
  if (to !== 'base') ctx.there = to;
};
OPS.fromTrash = (s, fr, op) => {
  const ids = resolveSel(s, fr, op.t, op); if (ids === WAIT) return WAIT;
  for (const t of ids) { const [p, cid] = t.slice(1).split(':'); const pl = s.players[+p]; const i = pl.trash.indexOf(cid); if (i < 0) continue; pl.trash.splice(i, 1); s.players[+p].hand.push(cid); log(`${cn(cid)} returns from the trash to hand.`); }
};
OPS.look = (s, fr, op) => { const pl = s.players[fr.ctx.p]; fr.ctx.look = pl.deck.splice(0, op.n); fr.ctx.lookCard = fr.ctx.look[0];
  if (op.reveal) for (const c of fr.ctx.look) if (C[c].ab.some((x) => x.s === 'revealAdd')) { pl.pool.push({ e: 1 }, { e: 1 }); log(`${cn(c)} is revealed: ${P(fr.ctx.p)} ${vb(fr.ctx.p, 'add', 'adds')} 2 energy.`); }
  for (const c of fr.ctx.look) if (C[c].ab.some((x) => x.s === 'seenPlay')) s.exec.push({ eff: [{ op: 'payOpt', cost: { e: 0, pw: ['any'] }, then: [{ op: 'playSeen', cid: c }] }], i: 0, ctx: Object.assign({}, fr.ctx, { card: c, it: [] }) }); if (op.reveal && fr.ctx.look.length) log(`${P(fr.ctx.p)} ${vb(fr.ctx.p, 'reveal', 'reveals')} ${fr.ctx.look.map(cn).join(', ')}.`); };
OPS.lookTake = (s, fr, op) => {
  const ctx = fr.ctx; const cards = ctx.look || []; const pl = s.players[ctx.p];
  const ok = cards.filter((c) => op.type === 'card' || (op.type === 'unit or gear' ? ['u', 'g'].includes(C[c].t) : C[c].t === op.type[0]) && (op.costGE == null || (C[c].e || 0) >= op.costGE));
  if (!ok.length) return;
  const a = takeAns(fr);
  if (!a) return needChoice(s, fr, 'stack', { cards: [...new Set(ok)], may: op.may, why: `${cn(ctx.card)}: ${op.may ? 'you may take' : 'take'} one` });
  if (a.v == null || a.v === 'none') return;
  const i = cards.indexOf(a.v); if (i < 0) return; cards.splice(i, 1); pl.hand.push(a.v); ctx.took = a.v; log(`${P(ctx.p)} ${vb(ctx.p, 'take', 'takes')} ${ctx.p === 0 ? cn(a.v) : 'a card'}.`);
};
OPS.lookRest = (s, fr, op) => { const ctx = fr.ctx; const pl = s.players[ctx.p]; const rest = ctx.look || []; if (op.to === 'hand') { pl.hand.push(...rest); ctx.look = []; return; } if (op.to === 'trash') pl.trash.push(...rest); else pl.deck.push(...rest); if (rest.length && op.to !== 'trash') emit(s, 'youRecycle', { p: ctx.p }); ctx.look = []; };
OPS.lookTopIf = (s, fr, op) => { const ctx = fr.ctx; const pl = s.players[ctx.p]; const c = (ctx.look || [])[0]; if (!c) return; if (C[c].t === op.type) { pl.hand.push(c); ctx.look.shift(); log(`${P(ctx.p)} ${vb(ctx.p, 'draw', 'draws')} ${cn(c)}.`); } };
OPS.if = (s, fr, op) => { const ok = evalCond(s, op.cond, fr.ctx); pushChild(s, ok ? op.then : op.else, fr.ctx); };
OPS.ifDid = (s, fr, op) => { if (fr.ctx.did) pushChild(s, op.then, fr.ctx); };
OPS.may = (s, fr, op) => {
  const a = takeAns(fr);
  if (!a) return needChoice(s, fr, 'yn', { why: `${cn(fr.ctx.card)}: ${maySummary(op.then)}?`, yes: 'Yes', no: 'No', eff: op.then });
  fr.ctx.did = a.v === 'yes'; if (fr.ctx.did) pushChild(s, op.then, fr.ctx);
};
OPS.payOpt = (s, fr, op) => {
  const ctx = fr.ctx; const pl = s.players[ctx.p]; const me = ob(s, ctx.self);
  const canEx = !op.exSelf || (ctx.selfIsLegend ? !pl.legEx : (me && !me.ex));
  const okXp = !op.xp || pl.xp >= op.xp; const okBuff = !op.spendBuff || s.objs.some((o) => o.ctrl === ctx.p && o.buff > 0); const okDisc = !op.discard || pl.hand.length >= op.discard;
  if (!canEx || !okXp || !okBuff || !okDisc || !canPay(s, ctx.p, op.cost)) { ctx.did = false; return; }
  const a = takeAns(fr);
  if (!a) return needChoice(s, fr, 'yn', { why: `${cn(ctx.card)}: ${costSummary(op)} to ${maySummary(op.then)}?`, yes: 'Pay', no: 'No', eff: op.then, pay: op });
  ctx.did = a.v === 'yes'; if (!ctx.did) return;
  pay(s, ctx.p, op.cost);
  if (op.exSelf) { if (ctx.selfIsLegend) pl.legEx = true; else if (me) me.ex = true; }
  if (op.xp) pl.xp -= op.xp;
  if (op.spendBuff) { const o = s.objs.find((x) => x.ctrl === ctx.p && x.buff > 0); if (o) { o.buff--; emit(s, 'buffSpent', { p: ctx.p, obj: o.id }); } }
  if (op.discard) { const worst = pl.hand.slice().sort((a2, b2) => cardVal(a2) - cardVal(b2))[0]; if (pl.human) { pushChild(s, op.then, ctx); s.exec.push({ eff: [{ op: 'discard', n: op.discard }], i: 0, ctx }); return; } discardCard(s, ctx.p, worst); }
  pushChild(s, op.then, ctx);
};
OPS.oneOf = (s, fr, op) => {
  const key = op.onceKey ? op.onceKey + ':' + (fr.ctx.self != null ? fr.ctx.self : 'c' + fr.ctx.chainId) + ':' : null;
  const avail = op.opts.map((o, i) => i).filter((i) => !key || !s.onceUsed[key + i]);
  if (!avail.length) return;
  const a = takeAns(fr);
  if (!a) return needChoice(s, fr, 'mode', { why: `${cn(fr.ctx.card)}: choose one`, opts: avail, labels: op.opts.map((o) => maySummary(o)) });
  if (key) s.onceUsed[key + a.v] = true;
  pushChild(s, op.opts[a.v], fr.ctx);
};
OPS.delayTrig = (s, fr, op) => { s.delayed.push({ id: s.nid++, a: { kind: 'trig', on: op.on, eff: op.eff }, p: fr.ctx.p, self: fr.ctx.self, cid: fr.ctx.card, target: firstIt(fr.ctx), it: (fr.ctx.it || []).slice(), until: 'turn', once: op.once, watchP: 1 - fr.ctx.p }); };
OPS.turnFx = (s, fr, op) => { const t = s.turnFx; const p = fr.ctx.p; if (op.k === 'enterReady') { t.enterReady = t.enterReady || {}; t.enterReady[p] = true; } else if (op.k === 'buffBonus') { t.buffBonus = t.buffBonus || {}; t.buffBonus[p] = (t.buffBonus[p] || 0) + 1; } else t[op.k] = op.v != null ? op.v : true; };
OPS.log = (s, fr, op) => log(op.msg);

function maySummary(eff) {
  if (!eff || !eff.length) return 'do it';
  const o = eff[0];
  const t = (x) => !x ? '' : x.q === 'self' ? 'me' : x.q === 'it' ? 'it' : (x.f && x.f.who === 'enemy' ? 'an enemy ' : x.f && x.f.who === 'friendly' ? 'a friendly ' : 'a ') + ({ u: 'unit', g: 'gear', ug: 'unit or gear', s: 'spell' }[x.f && x.f.type] || 'target');
  switch (o.op) {
    case 'draw': return `draw ${o.n}`; case 'deal': return `deal ${typeof o.n === 'number' ? o.n : 'damage'} to ${t(o.t)}`; case 'kill': return `kill ${t(o.t)}`;
    case 'ready': return `ready ${t(o.t)}`; case 'buff': return `buff ${t(o.t)}`; case 'move': return `move ${t(o.t)}`; case 'return': return `return ${t(o.t)} to hand`;
    case 'might': return `give ${t(o.t)} ${o.n > 0 ? '+' : ''}${o.n} might`; case 'channel': return `channel ${o.n} rune`; case 'gold': return 'make a Gold';
    case 'token': return `make a ${o.name}`; case 'stun': return `stun ${t(o.t)}`; case 'score': return `score ${o.n}`; case 'xp': return `gain ${o.n} XP`;
    case 'choose': return maySummary(eff.slice(1)) || 'choose'; case 'readyRunes': return `ready ${o.n} runes`; case 'discard': return `discard ${o.n}`;
    case 'fromTrash': return 'return a card from your trash'; case 'predict': return 'Predict'; case 'empower': return 'empower'; case 'recall': return `recall ${t(o.t)}`;
    case 'giveKw': return `give ${t(o.t)} ${Object.keys(o.kw).join(', ')}`; case 'stunOrKill': return 'stun or kill';
    default: return o.op;
  }
}
function costSummary(op) { const parts = []; if (op.cost && op.cost.e) parts.push(op.cost.e + ' energy'); if (op.cost && op.cost.pw && op.cost.pw.length) parts.push(op.cost.pw.length + ' power'); if (op.exSelf) parts.push('exhaust it'); if (op.xp) parts.push(op.xp + ' XP'); if (op.spendBuff) parts.push('a buff'); if (op.discard) parts.push('discard ' + op.discard); return 'pay ' + (parts.join(' + ') || 'nothing'); }

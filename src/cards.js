/* engine v3, part 7: hand-written programs for individual cards (everything the compiler can't read).
   Each entry follows the printed text; see src/hand.js for the format. */

// play a card without paying its cost (units/gear enter the board, spells go on the chain)
function playFree(s, p, cid, o) {
  o = o || {}; const c = C[cid]; const pl = s.players[p]; if (!c) return null;
  const owner = o.owner != null ? o.owner : p;
  pl.tc.cards++;
  if (c.t === 'u' || c.t === 'g') {
    let to = o.to != null ? o.to : 'base';
    if (c.t === 'u' && to !== 'base' && unitsAt(s, to).some((u) => u.ctrl !== p) && !o.anywhere) to = 'base';
    let ready = !!o.ready;
    if (c.t === 'g') ready = !cardStatics(s, cid, 'enterEx').length;
    else {
      for (const st of cardStatics(s, cid, 'enterReady')) if (gateOK(s, st, null, p) && (!st.cond || evalCond(s, st.cond, { s, p }))) ready = true;
      if ((s.turnFx.enterReady && s.turnFx.enterReady[p]) || staticsOn(s, 'friendsEnterReady', p)) ready = true;
    }
    const x = newObj(s, { cid, k: c.t, owner, ctrl: p, loc: to, ex: !ready });
    if (c.t === 'u') pl.tc.units++; else { pl.tc.gear++; if (isEq(cid)) pl.tc.eq++; }
    log(`${P(p)} ${vb(p, 'play', 'plays')} ${c.n}${to !== 'base' ? ' to ' + bfName(s, to) : ''}, ignoring its cost.`, p ? 'ai' : 'you');
    emit(s, 'played', { obj: x.id, p, cid, to });
    emit(s, 'cardPlayed', { p, cid, obj: x.id, to, src: o.src || 'free', paidE: 0 });
    if (c.t === 'u' && c.kw.weaponmaster) s.exec.push({ eff: [{ op: 'weaponmaster' }], i: 0, ctx: { p, self: x.id, card: cid, it: [], picks: [], pi: 0 } });
    if (c.t === 'g' && c.kw['quick-draw']) s.exec.push({ eff: [{ op: 'quickDraw' }], i: 0, ctx: { p, self: x.id, card: cid, it: [], picks: [], pi: 0 } });
    refreshControl(s);
    if (to !== 'base' && s.ctrl[to] !== p && !s.sdQueue.some((q) => q.bf === to) && !(s.sd && s.sd.bf === to)) s.sdQueue.push({ bf: to, att: p });
    return x;
  }
  if (c.t === 's') {
    pl.tc.spells++;
    const item = { id: s.nid++, p, owner, cid, picks: [], rep: false, src: o.src || 'free', extra: false, chosen: [], paidE: 0, banishAfter: !!o.banishAfter };
    s.chain.push(item);
    log(`${P(p)} ${vb(p, 'cast', 'casts')} ${c.n}, ignoring its cost.`, p ? 'ai' : 'you');
    emit(s, 'cardPlayed', { p, cid, chainId: item.id, src: o.src || 'free', paidE: 0 });
    if (s.mode === 'main' || s.mode === 'showdown') { s.chainCtx = s.mode; s.chainStarter = p; s.mode = 'chain'; s.prio = 1 - p; s.passes = 0; }
    else if (s.mode === 'chain') { s.prio = 1 - p; s.passes = 0; }
    return item;
  }
  return null;
}
// ask the frame's player to pick a card id from a list (returns WAIT or the card)
function pickCard(s, fr, cards, why, may) {
  const a = takeAns(fr);
  if (!a) { if (!cards.length) return null; return needChoice(s, fr, 'stack', { cards: [...new Set(cards)], may, why }); }
  return a.v == null || a.v === 'none' ? null : a.v;
}
function askYN(s, fr, why, yes, no) { const a = takeAns(fr); if (!a) return needChoice(s, fr, 'yn', { why, yes: yes || 'Yes', no: no || 'No' }); return a.v === 'yes'; }
function askDest(s, fr, opts, why) { const a = takeAns(fr); if (!a) { if (opts.length <= 1) return opts[0]; return needChoice(s, fr, 'dest', { opts, why }); } return a.v; }
function askMode(s, fr, labels, why) { const a = takeAns(fr); if (!a) return needChoice(s, fr, 'mode', { why, opts: labels.map((x, i) => i), labels }); return a.v; }
function askObj(s, fr, ids, why, pol, p) { const a = takeAns(fr); if (!a) { if (ids.length === 1) return ids[0]; if (!ids.length) return null; return needChoice(s, fr, 'pickObj', { opts: ids, why, pol: pol || 0, p }); } return a.v; }
const fu = { type: 'u', who: 'friendly' }, eu = { type: 'u', who: 'enemy' };
const one = (f) => ({ q: 'one', n: 1, f }), upto = (n, f) => ({ q: 'upto', n, f }), self = { q: 'self' }, it = { q: 'it' };
const trig = H.trig, act = H.act, st = H.st;
const spell = (eff, more) => Object.assign({ kind: 'spell', eff }, more || {});
const OP = HAND_OPS;

/* ---------------- A–B ---------------- */
HAND['abandoned-hall'] = { ab: [trig('anyPlay', [{ op: 'may', then: [{ op: 'might', n: 1, t: one({ type: 'u', who: 'friendly', where: 'here' }) }] }], { f: { type: 's' } })] };
HAND['acceleration-gate'] = { plus: [spell([{ op: 'choose', t: upto(4, { type: 'ug', who: 'friendly', ex: true }) }, { op: 'ready', t: it }, { op: 'readyRunesRest', n: 4 }])] };
OP.readyRunesRest = (s, fr, op) => { let n = op.n - (fr.ctx.it || []).length; for (const r of s.players[fr.ctx.p].runes) if (r.ex && n > 0) { r.ex = false; n--; } };
HAND['acceptable-losses'] = { plus: [spell([{ op: 'eachPlayer', eff: [{ op: 'kill', t: one({ type: 'g', who: 'friendly' }) }] }])] };
OP.eachPlayer = (s, fr, op) => {
  const ctx = fr.ctx; const order = [s.active, 1 - s.active];
  for (let i = order.length - 1; i >= 0; i--) pushChild(s, op.eff, Object.assign({}, ctx, { p: order[i], it: [], picks: [], pi: 0 }));
};
HAND['affectionate-poro'] = { ab: [trig('combatEnd', [{ op: 'if', cond: { c: 'selfNotHurt' }, then: [{ op: 'draw', n: 1 }] }])] };
HAND['ahri-confident'] = { plus: [trig('youReduceHere', [{ op: 'might', n: 1, t: self }])] };
HAND['akali-brash'] = { plus: [trig('move', [{ op: 'banishTopPlayable' }], { nth: 2 })] };
OP.banishTopPlayable = (s, fr) => {
  const p = fr.ctx.p, pl = s.players[p]; if (!pl.deck.length) return;
  const c = pl.deck.shift(); pl.banished.push(c); pl.playable = pl.playable || []; pl.playable.push({ cid: c, untilMyEnd: true });
  log(`${P(p)} ${vb(p, 'banish', 'banishes')} ${cn(c)} from the top of the deck and may play it until the end of ${vb(p, 'your', 'their')} next turn.`, p ? 'ai' : 'you');
  emit(s, 'youBanish', { p, cid: c });
};
HAND['akali-deadly-weapon'] = { plus: [trig('move', [{ op: 'may', then: [{ op: 'deal', n: { ref: 'ifEmp', a: 1, b: 2 }, t: one({ type: 'u', where: 'moveFromTo' }) }] }])] };
HAND['akshan-mischievous'] = { plus: [trig('played', [{ op: 'if', cond: { c: 'paidExtra' }, then: [{ op: 'choose', t: one({ type: 'g', who: 'enemy' }) }, { op: 'akshan' }] }])] };
OP.akshan = (s, fr) => {
  const g = ob(s, firstIt(fr.ctx)); const me = ob(s, fr.ctx.self); if (!g) return;
  g.ctrlBack = g.ctrl; g.ctrl = fr.ctx.p; g.att = null; g.loc = 'base'; if (me) g.ctrlUntilGone = me.id;
  log(`${P(fr.ctx.p)} ${vb(fr.ctx.p, 'take', 'takes')} ${cn(g.cid)}.`);
  if (me && isEq(g.cid)) attach(s, g, me);
};
HAND['albus-ferros'] = { ab: [trig('played', [{ op: 'choose', t: upto(99, { type: 'u', who: 'friendly', buffed: true }) }, { op: 'spendBuffsIt', channelEach: 1 }])] };
OP.spendBuffsIt = (s, fr, op) => {
  let n = 0; each(s, fr.ctx.it || [], (o) => { if (o.buff > 0) { o.buff--; n++; emit(s, 'buffSpent', { p: fr.ctx.p, obj: o.id }); } });
  fr.ctx.spent = n;
  if (op.channelEach && n) { const g = channel(s, fr.ctx.p, n * op.channelEach, true); log(`${P(fr.ctx.p)} ${vb(fr.ctx.p, 'spend', 'spends')} ${n} buff${n > 1 ? 's' : ''} and ${vb(fr.ctx.p, 'channel', 'channels')} ${g}.`); }
};
HAND['alpha-strike'] = { plus: [spell([{ op: 'choose', t: one(fu) }, { op: 'splitDamage', f: { type: 'u', who: 'enemy', where: 'bf' }, xpPerKill: 1 }])] };
OP.splitDamage = (s, fr, op) => {
  const u = ob(s, firstIt(fr.ctx)); if (!u) return; let n = op.n != null ? valOf(s, op.n, fr.ctx) : might(s, u);
  const targets = s.objs.filter((o) => matchesF(s, o, op.f, Object.assign({ s }, fr.ctx)));
  const { plan } = assignDamage(s, n, targets, true); let kills = 0;
  for (const [t, d] of plan) { if (d > 0) { log(`${cn(u.cid)} deals ${d} to ${cn(t.cid)}.`); damage(s, t, d, { p: fr.ctx.p, spell: fr.ctx.isSpell }); if (!s.objs.includes(t)) kills++; } }
  if (op.xpPerKill && kills) pushChild(s, [{ op: 'xp', n: kills * op.xpPerKill }], fr.ctx);
};
HAND['altar-of-blood'] = { ab: [st('altarSave')] };
HAND['altar-of-memories'] = { ab: [trig('unitDies', [H.exMe([{ op: 'draw', n: 1 }, { op: 'handToDeck', choose: true }])], { f: { who: 'friendly' } })] };
OP.handToDeck = (s, fr, op) => {
  const ctx = fr.ctx, pl = s.players[ctx.p];
  if (ctx._htd == null) { const c = pickCard(s, fr, pl.hand, `${cn(ctx.card)}: put a card from your hand on your deck`, false); if (c === WAIT) return WAIT; if (c == null) return; ctx._htd = c; }
  let top = true;
  if (op.choose) { const m = askMode(s, fr, ['Top of deck', 'Bottom of deck'], `${cn(ctx.card)}: put ${cn(ctx._htd)} where?`); if (m === WAIT) return WAIT; top = m === 0; }
  const i = pl.hand.indexOf(ctx._htd); if (i >= 0) { pl.hand.splice(i, 1); if (top) pl.deck.unshift(ctx._htd); else pl.deck.push(ctx._htd); }
  delete ctx._htd;
};
HAND['amateur-demolitionist'] = { ab: [trig('played', [{ op: 'bomb' }])] };
HAND['ambessa-the-wolf'] = { plus: [st('might', { n: 3, gate: { emp: true } }), st('noDamageOutOfCombat', { gate: { emp: true } })] };
HAND['angle-shot'] = { plus: [spell([{ op: 'choose', t: one({ type: 'u' }) }, { op: 'angleShot' }, { op: 'draw', n: 1 }])] };
OP.angleShot = (s, fr) => {
  const u = ob(s, firstIt(fr.ctx)); if (!u) return;
  const eqs = s.objs.filter((g) => isEq(g.cid) && g.ctrl === u.ctrl).map((g) => g.id); if (!eqs.length) return;
  const gid = askObj(s, fr, eqs, `${cn(fr.ctx.card)}: which Equipment?`, 1); if (gid === WAIT) return WAIT;
  const g = ob(s, gid); if (!g) return;
  if (g.att === u.id) { g.att = null; log(`${cn(g.cid)} is detached.`); } else attach(s, g, u);
};
HAND['aphelios-exalted'] = { ab: [trig('equipped', [{ op: 'oneOf', onceKey: 'aphelios', opts: [[{ op: 'readyRunes', n: 2 }], [{ op: 'channel', n: 1, ex: true }], [{ op: 'buff', t: one(fu) }]] }])] };
HAND['applied-researchers'] = { plus: [st('costMod', { who: 'you', type: 's', e: -1, pwLess: 1, minE: 1, gate: { emp: true } })] };
HAND['apprentice-smith'] = { ab: [trig('move', [{ op: 'look', n: 1, reveal: true }, { op: 'lookTopIf', type: 'g' }, { op: 'lookRest', to: 'deck' }])] };
HAND['arachnoid-horror'] = { plus: [st('playAloneEnemyBf'), st('friendsPlayAloneEnemyBf')] };
HAND['arcane-shift'] = { kw: { banishAfter: true }, plus: [spell([{ op: 'choose', t: one(fu) }, { op: 'blink' }, { op: 'deal', n: 3, t: one({ type: 'u', who: 'enemy', where: 'bf' }) }])] };
// banish a unit, then its owner plays it again (ignoring its cost)
OP.blink = (s, fr, op) => {
  const ids = (fr.ctx.it || []).slice();
  for (const id of ids) { const o = ob(s, id); if (!o) continue; const cid = o.cid, owner = o.owner, loc = o.loc; removeObj(s, o, null); if (o.token) continue; log(`${cn(cid)} is banished and played again.`); playFree(s, owner, cid, { to: op.same ? loc : 'base' }); }
};
HAND['arise'] = { ab: [spell([{ op: 'token', name: 'Sand Soldier', m: 2, n: 1, per: { count: 'controlEq' }, where: 'base' }, { op: 'choose', t: { q: 'one', n: 2, f: { type: 'u', who: 'friendly', inIt: true } } }, { op: 'ready', t: it }])] };
HAND['ashe-focused'] = { ab: [trig('played', [{ op: 'asheBanish' }])] };
OP.asheBanish = (s, fr) => {
  const p = fr.ctx.p, q = 1 - p, opp = s.players[q]; if (!opp.hand.length) return;
  s.reveal[q] = true;
  const c = pickCard(s, fr, opp.hand, `${cn(fr.ctx.card)}: banish a card from the opponent's hand`, false); if (c === WAIT) return WAIT; if (c == null) return;
  opp.hand.splice(opp.hand.indexOf(c), 1); opp.banished.push(c); log(`${cn(fr.ctx.card)} banishes ${cn(c)} from ${Pos(q)} hand until they hold.`);
  s.delayed.push({ id: s.nid++, a: { kind: 'trig', on: 'delayedHold', eff: [{ op: 'returnBanished', cid: c, owner: q }] }, p, self: null, cid: fr.ctx.card, it: [], until: 'forever', once: true, watchP: q });
};
OP.returnBanished = (s, fr, op) => { const pl = s.players[op.owner]; const i = pl.banished.indexOf(op.cid); if (i >= 0) { pl.banished.splice(i, 1); pl.hand.push(op.cid); log(`${cn(op.cid)} returns to ${Pos(op.owner)} hand.`); } };
HAND['astral-heron'] = { ab: [trig('youPlay', [{ op: 'if', cond: { c: 'selfAtBf' }, then: [{ op: 'nextCardLess', e: 2, pw: 2 }] }], { f: { type: 'c' }, nth: 1 })] };
HAND['atakhan'] = { plus: [st('sacCost'), trig('attack', [{ op: 'defenderKillsHere' }])] };
OP.defenderKillsHere = (s, fr) => {
  const me = ob(s, fr.ctx.self); if (!me || me.loc === 'base') return; const q = 1 - fr.ctx.p;
  const ids = unitsAt(s, me.loc, q).map((u) => u.id); if (!ids.length) return;
  const id = askObj(s, fr, ids, `${cn(fr.ctx.card)}: kill one of your units here`, -1, q); if (id === WAIT) return WAIT;
  const o = ob(s, id); if (o) kill(s, o, { p: fr.ctx.p });
};
HAND['ava-achiever'] = { ab: [trig('attack', [{ op: 'payOpt', cost: { e: 0, pw: ['mind'] }, then: [{ op: 'playFromHandHere', f: { hasKw: 'hidden' } }] }])] };
OP.playFromHandHere = (s, fr, op) => {
  const me = ob(s, fr.ctx.self); const p = fr.ctx.p, pl = s.players[p];
  const cards = pl.hand.filter((c) => !op.f || !op.f.hasKw || C[c].kw[op.f.hasKw]);
  const c = pickCard(s, fr, cards, `${cn(fr.ctx.card)}: play a card from your hand here, ignoring its cost`, true); if (c === WAIT) return WAIT; if (c == null) return;
  pl.hand.splice(pl.hand.indexOf(c), 1); playFree(s, p, c, { to: me ? me.loc : 'base', anywhere: true, src: 'hand' });
};
HAND['avalanche'] = { ab: [spell([{ op: 'deal', n: 3, t: { q: 'each', f: { type: 'u', where: 'base' } } }])] };
HAND['azir-ascendant'] = { ab: [act({ pw: ['calm'] }, [{ op: 'choose', t: one({ type: 'u', who: 'friendly', other: true }) }, { op: 'azirSwap' }], { speed: 'A', limit: { once: true } })] };
OP.azirSwap = (s, fr, op) => {
  const me = ob(s, fr.ctx.self), u = ob(s, firstIt(fr.ctx)); if (!me || !u) return;
  const a = me.loc, b = u.loc;
  if (a !== b) { moveUnit(s, me, b, { byEffect: true, byP: fr.ctx.p }); moveUnit(s, u, a, { byEffect: true, byP: fr.ctx.p }); log(`${cn(me.cid)} and ${cn(u.cid)} swap places.`); }
  const eqs = op && op.noEq ? [] : eqOf(s, u).map((g) => g.id); if (!eqs.length) return;
  const g = askObj(s, fr, eqs.concat(['none']), `${cn(me.cid)}: take one of its Equipment?`, 1); if (g === WAIT) return WAIT;
  if (g !== 'none' && ob(s, g)) attach(s, ob(s, g), me);
};
HAND['baccai-sandspinner'] = { kw: { empower: { e: 5, pw: [], less: { e: 3, le: 4 } } }, plus: [] };
HAND['back-off'] = { plus: [spell([{ op: 'if', cond: { c: 'fromHand' }, then: [{ op: 'draw', n: 1 }] }])] };
HAND['back-to-back'] = { plus: [spell([{ op: 'might', n: 2, t: { q: 'one', n: 2, f: fu } }])] };
HAND['bonds-of-strength'] = { plus: [spell([{ op: 'might', n: 1, t: { q: 'one', n: 2, f: fu } }])] };
HAND['baited-hook'] = { ab: [act({ e: 1, pw: ['order'], ex: true }, [{ op: 'choose', t: one(fu) }, { op: 'baitedHook' }])] };
OP.baitedHook = (s, fr) => {
  const ctx = fr.ctx, p = ctx.p, pl = s.players[p];
  if (ctx._bh == null) { const u = ob(s, firstIt(ctx)); if (!u) return; ctx._bh = might(s, u); kill(s, u, { p }); ctx.look = pl.deck.splice(0, 5); }
  const ok = ctx.look.filter((c) => C[c].t === 'u' && (C[c].m || 0) <= ctx._bh + 1);
  const c = pickCard(s, fr, ok, `${cn(ctx.card)}: play a unit with up to ${ctx._bh + 1} might, ignoring its cost`, true); if (c === WAIT) return WAIT;
  if (c != null) { ctx.look.splice(ctx.look.indexOf(c), 1); playFree(s, p, c, {}); }
  pl.deck.push(...ctx.look); ctx.look = []; delete ctx._bh;
};
HAND['bandle-scouts-academy'] = { ab: [trig('hideHere', [{ op: 'gold', n: 1 }])] };
HAND['bandle-tree'] = { ab: [st('hideExtra')] };
HAND['bard-mercurial'] = { plus: [st('extraCost', { cost: { e: 0, pw: [], exLegend: true } })] };
HAND['beast-below'] = { ab: [trig('played', [{ op: 'return', t: one({ type: 'u', who: 'friendly', other: true }) }, { op: 'return', t: one(eu) }])] };
HAND['bedeviling-stranger'] = { plus: [trig('played', [{ op: 'chooseBf' }, { op: 'if', cond: { c: 'unitsThereAll', ge: 4 }, then: [{ op: 'may', then: [{ op: 'return', t: one({ type: 'u', who: 'enemy', where: 'there' }) }] }] }])] };
OP.chooseBf = (s, fr, op) => { const opts = (op.opts || [0, 1]).filter((i) => (!op.mine || s.ctrl[i] === fr.ctx.p) && (op.where !== 'mineUnits' || unitsAt(s, i, fr.ctx.p).length)); if (!opts.length) return; const v = askDest(s, fr, opts, `${cn(fr.ctx.card)}: choose a battlefield`); if (v === WAIT) return WAIT; fr.ctx.there = v; };
HAND['black-market'] = { ab: [act({ pw: ['any', 'any'] }, [{ op: 'draw', n: 1 }], { limit: { anyPlayer: true, myTurn: true } })] };
HAND['blade-of-the-exile'] = { kw: { equip: { e: 0, pw: ['any'] }, equipAlt: true }, plus: [] };
HAND['blast-cone'] = { plus: [trig('youMoveEnemy', [H.exMe([{ op: 'stun', t: it }])])] };
HAND['blighted-battleaxe'] = { eqPlus: [trig('endTurn', [{ op: 'battleaxe' }])] };
OP.battleaxe = (s, fr) => { const u = ob(s, fr.ctx.self); if (!u || u.conqTurn === s.turnNo) return; const g = eqOf(s, u).find((x) => x.cid === fr.ctx.card); if (g) { g.att = null; g.loc = 'base'; } log(`${cn(fr.ctx.card)} detaches and deals 4 to ${cn(u.cid)}.`); damage(s, u, 4, { p: fr.ctx.p }); };
HAND['blind-fury'] = { plus: [spell([{ op: 'blindFury' }])] };
OP.blindFury = (s, fr) => {
  const p = fr.ctx.p, q = 1 - p, opp = s.players[q]; if (!opp.deck.length) return;
  const c = opp.deck.shift(); log(`${P(q)} ${vb(q, 'reveal', 'reveals')} ${cn(c)}; ${P(p)} ${vb(p, 'banish', 'banishes')} it and ${vb(p, 'play', 'plays')} it.`);
  if (C[c].t === 'r' || C[c].t === 'B' || C[c].t === 'L') { opp.deck.push(c); return; }
  playFree(s, p, c, { owner: q });
};
HAND['blossoming-dreamroot'] = { plus: [trig('youWin', [{ op: 'draw', n: 1 }], { here: true })] };
HAND['blue-sentinel'] = { plus: [st('holdTwice')] };

/* ---------------- B–D ---------------- */
HAND['baron-nashor'] = { plus: [], manual: 'The Baron Pit battlefield token is not added (Baron enters like a normal unit).' };
HAND['bone-skewer'] = { plus: [spell([{ op: 'chooseBf' }, { op: 'boneSkewer' }])] };
OP.boneSkewer = (s, fr) => {
  const p = fr.ctx.p, q = 1 - p, opp = s.players[q], to = fr.ctx.there; if (to == null) return;
  s.reveal[q] = true;
  const c = pickCard(s, fr, opp.hand.filter((x) => C[x].t === 'u'), `${cn(fr.ctx.card)}: choose a unit from the opponent's hand`, true); if (c === WAIT) return WAIT; if (c == null) return;
  opp.hand.splice(opp.hand.indexOf(c), 1); const o = playFree(s, q, c, { to, anywhere: true });
  if (o) { o.stun = true; log(`${cn(c)} is stunned.`); }
};
HAND['bottled-constellation'] = { ab: [trig('mainStart', [{ op: 'if', cond: { c: 'control', n: 3, f: { type: 'ug', who: 'friendly', other: true } }, then: [{ op: 'may', then: [{ op: 'kill', t: { q: 'one', n: 3, f: { type: 'ug', who: 'friendly', other: true } } }, { op: 'score', n: 1 }] }] }])] };
HAND['brawl'] = { plus: [spell([{ op: 'choose', t: one({ type: 'u' }) }, { op: 'giveKwMight', kw: 'assault' }])] };
OP.giveKwMight = (s, fr, op) => { each(s, fr.ctx.it || [], (o) => { const n = might(s, o); o.kwT[op.kw] = (o.kwT[op.kw] || 0) + n; log(`${cn(o.cid)} gets [${op.kw} ${n}] this turn.`); }); };
HAND['brazen-buccaneer'] = { ab: [st('extraCost', { cost: { e: -2, pw: [], discard: 1 } })] };
HAND['brush'] = { plus: [trig(['youConquer', 'youHold'], [{ op: 'may', then: [{ op: 'restoreBf' }] }])] };
OP.restoreBf = (s, fr) => { const i = fr.ctx.bf != null ? fr.ctx.bf : fr.ctx.there; if (i == null || !s.bfs[i].orig) return; s.bfs[i].id = s.bfs[i].orig; delete s.bfs[i].orig; log(`${bfName(s, i)} returns.`); };
HAND['brutalizer'] = { eqPlus: [st('mightIfFresh', { n: 2 })] };
HAND['brynhir-thundersong'] = { ab: [trig('played', [{ op: 'turnFxP', k: 'noCards', who: 'opp' }])] };
OP.turnFxP = (s, fr, op) => { const q = op.who === 'opp' ? 1 - fr.ctx.p : fr.ctx.p; s.turnFx[op.k] = s.turnFx[op.k] || {}; s.turnFx[op.k][q] = op.v != null ? op.v : true; if (op.k === 'noCards') log(`${P(q)} can't play cards this turn.`); if (op.k === 'noSpells') log(`${P(q)} can't play spells this turn.`); };
HAND['buhru-captain'] = { ab: [trig('played', [{ op: 'oneOf', opts: [[{ op: 'draw', n: 1 }], [{ op: 'buff', t: self }], [{ op: 'log', msg: 'Buhru Captain: nothing chosen.' }]] }])] };
HAND['bullet-time'] = { plus: [st('xCost', { from: 'pw' }), spell([{ op: 'chooseBf' }, { op: 'deal', n: { ref: 'x' }, t: { q: 'each', f: { type: 'u', who: 'enemy', where: 'there' } } }])] };
HAND['bushwhack'] = { plus: [spell([{ op: 'turnFx', k: 'enterReady' }, { op: 'gold', n: 1 }])] };
HAND['call-to-battle'] = { ab: [spell([{ op: 'move', t: one(fu), to: 'bfMine' }, { op: 'oppMovesTo' }])] };
OP.oppMovesTo = (s, fr) => {
  const to = fr.ctx.there; if (to == null) return; const q = 1 - fr.ctx.p;
  const ids = unitsOf(s, q).filter((u) => u.loc !== to).map((u) => u.id); if (!ids.length) return;
  const id = askObj(s, fr, ids, `${cn(fr.ctx.card)}: move one of your units to ${bfName(s, to)}`, 0, q); if (id === WAIT) return WAIT;
  const o = ob(s, id); if (o) { log(`${cn(o.cid)} moves to ${bfName(s, to)}.`); moveUnit(s, o, to, { byEffect: true, byP: fr.ctx.p }); }
};
HAND['call-to-glory'] = { plus: [st('extraCost', { cost: { e: 0, pw: [], spendBuff: true, free: true } })] };
HAND['card-sharp'] = { ab: [trig('played', [{ op: 'may', then: [{ op: 'gold', n: 1 }] }, { op: 'cardSharp' }])] };
OP.cardSharp = (s, fr) => {
  const q = 1 - fr.ctx.p;
  const yes = askObj(s, fr, ['yes', 'no'], `${cn(fr.ctx.card)}: play a Gold token? (the opponent then gets one too)`, 0, q); if (yes === WAIT) return WAIT;
  if (yes === 'yes') { pushChild(s, [{ op: 'gold', n: 1 }], Object.assign({}, fr.ctx, { p: q })); pushChild(s, [{ op: 'gold', n: 1 }], fr.ctx); }
};
HAND['cataclysm'] = { plus: [spell([{ op: 'turnFxP', k: 'noSpells', who: 'opp' }])] };
HAND['cataclysmic-duel'] = { ab: [spell([{ op: 'duel' }])] };
OP.duel = (s, fr) => {
  const ctx = fr.ctx; ctx._keep = ctx._keep || {};
  for (const q of [ctx.p, 1 - ctx.p]) {
    if (ctx._keep[q] !== undefined) continue;
    const ids = unitsOf(s, q).map((u) => u.id); if (!ids.length) { ctx._keep[q] = null; continue; }
    const id = askObj(s, fr, ids, `${cn(ctx.card)}: choose the unit you keep`, 1, q); if (id === WAIT) return WAIT; ctx._keep[q] = id;
  }
  const keep = Object.values(ctx._keep); for (const u of units(s).filter((u) => !keep.includes(u.id))) kill(s, u, { p: ctx.p, spell: true });
  delete ctx._keep;
};
HAND['catalyst-of-aeons'] = { ab: [spell([{ op: 'channel', n: 2, ex: true }, { op: 'if', cond: { c: 'channeledLT', n: 2 }, then: [{ op: 'draw', n: 1 }] }])] };
HAND['chronobreak'] = { ab: [st('xCost', { from: 'pw' }), spell([{ op: 'choose', t: { q: 'upto', n: 99, f: fu } }, { op: 'chronobreak' }])] };
OP.chronobreak = (s, fr) => { const n = fr.ctx.x || 0; fr.ctx.it = (fr.ctx.it || []).slice(0, n); return OP.blink(s, fr, { same: true }); };
HAND['clocktower-guardian'] = { plus: [trig('die', [{ op: 'banishTopPlayFree', ignore: 'e' }])] };
OP.banishTopPlayFree = (s, fr, op) => {
  const p = fr.ctx.p, pl = s.players[p]; if (!pl.deck.length) return;
  if (fr.ctx._bt == null) { const c = pl.deck.shift(); pl.banished.push(c); fr.ctx._bt = c; log(`${P(p)} ${vb(p, 'banish', 'banishes')} ${cn(c)} from the top of the deck.`); }
  const c = fr.ctx._bt; const cost = op.ignore === 'e' ? { e: 0, pw: C[c].p || [] } : { e: 0, pw: [] };
  if (!['u', 'g', 's'].includes(C[c].t) || !canPay(s, p, cost)) { delete fr.ctx._bt; return; }
  const y = askYN(s, fr, `${cn(fr.ctx.card)}: play ${cn(c)}${cost.pw.length ? ' (paying only its Power)' : ''}?`, 'Play it', 'No'); if (y === WAIT) return WAIT;
  delete fr.ctx._bt; if (!y) return;
  pay(s, p, cost); pl.banished.splice(pl.banished.indexOf(c), 1); playFree(s, p, c, {});
};
HAND['coalesced-energy'] = { ab: [trig('endTurn', [{ op: 'recycleAllRunes' }, { op: 'channel', n: 4, ex: true }])] };
OP.recycleAllRunes = (s, fr) => { const pl = s.players[fr.ctx.p]; for (const r of pl.runes) pl.runeDeck.push(r.d); const n = pl.runes.length; pl.runes = []; if (n) { log(`${P(fr.ctx.p)} ${vb(fr.ctx.p, 'recycle', 'recycles')} all runes.`); emit(s, 'recycleRune', { p: fr.ctx.p }); } };
HAND['combat-experience'] = { kw: { reaction: true }, ab: [spell([{ op: 'choose', t: one({ type: 'u' }) }, { op: 'if', cond: { c: 'levelGE', n: 6 }, then: [{ op: 'might', n: 3, t: it }], else: [{ op: 'might', n: 1, t: it }] }])] };
HAND['command-attack'] = { ab: [trig('played', [{ op: 'oneOf', opts: [[{ op: 'move', t: one({ type: 'g', who: 'friendly', hasKw: 'deploy' }), to: 'bf' }], [{ op: 'look', n: 5 }, { op: 'lookTake', type: 'gear', may: true }, { op: 'lookRest', to: 'deck' }]] }])] };
HAND['commander-ledros'] = { plus: [st('sacMany')] };
HAND['concert-poster'] = { plus: [trig('played', [{ op: 'payOpt', cost: { e: 1, pw: [] }, then: [{ op: 'token', name: 'Recruit', m: 1, n: 1, where: 'base' }] }]), trig('youConquer', [{ op: 'payOpt', cost: { e: 1, pw: [] }, then: [{ op: 'token', name: 'Recruit', m: 1, n: 1, where: 'base' }] }], { here: true })] };
HAND['confront'] = { plus: [spell([{ op: 'turnFx', k: 'enterReady' }, { op: 'draw', n: 1 }])] };
HAND['conscription'] = { ab: [st('extraCost', { cost: { e: 0, pw: [], xp: 5 } }), spell([{ op: 'if', cond: { c: 'paidExtra' }, then: [{ op: 'steal', t: one({ type: 'u', who: 'enemy', where: 'bf' }), recall: true }], else: [{ op: 'steal', t: one({ type: 'u', who: 'enemy', where: 'bf', mightLE: 3 }), recall: true }] }])] };
HAND['consult-the-heavens'] = { kw: { reaction: true }, ab: [spell([{ op: 'giveKw', kw: { shield: 2 }, t: one({ type: 'u' }) }, { op: 'predict', n: 1 }])] };
HAND['consuming-curse'] = { plus: [spell([{ op: 'deal', n: { ref: 'plusCount', base: 2, per: { count: 'cardNameInTrash' } }, t: one({ type: 'u', where: 'bf' }) }])] };
HAND['convergent-mutation'] = { plus: [spell([{ op: 'choose', t: one(fu) }, { op: 'choose', slot: 'b', t: one({ type: 'u', who: 'friendly', notIt: true }) }, { op: 'raiseMightTo' }])] };
OP.raiseMightTo = (s, fr, op) => { const [a, b] = (fr.ctx.it || []).map((id) => ob(s, id)); if (!a || !b) return; const d = might(s, b) - might(s, a); if (d > 0) { a.mod += d; log(`${cn(a.cid)}'s might rises to ${might(s, a)} this turn.`); } if (op.plus) a.mod += op.plus; };
HAND['corrupted-dragon'] = { plus: [trig('attack', [{ op: 'choose', t: { q: 'upto', n: 99, f: { type: 'u', who: 'enemy', where: 'here', mightLE: 5 } } }, { op: 'move', t: it, to: 'base' }])] };
HAND['cosmic-vista'] = { ab: [trig('youHold', [{ op: 'if', cond: { c: 'runeDeckEmpty' }, then: [{ op: 'score', n: 1 }] }])] };
HAND['counter-strike'] = { plus: [spell([{ op: 'choose', t: one({ type: 'u' }) }, { op: 'preventNext' }, { op: 'draw', n: 1 }])] };
OP.preventNext = (s, fr) => each(s, fr.ctx.it || [], (o) => { o.preventNext = true; });
HAND['crescent-guardian'] = { ab: [st('extraCost', { cost: { e: 0, pw: ['chaos'] }, cond: { c: 'playedThisTurn', t: 's' } }), st('enterReady', { cond: { c: 'paidExtra' } })] };
HAND['cruel-patron'] = { ab: [st('sacCost', { mandatory: true })] };
HAND['cull-the-weak'] = { ab: [spell([{ op: 'eachPlayer', eff: [{ op: 'kill', t: one(fu) }] }])] };
HAND['cursed-sarcophagus'] = { ab: [trig('played', [{ op: 'sarcoBanish' }]), act({ ex: true }, [{ op: 'playFromPile', pay: true }])] };
OP.sarcoBanish = (s, fr) => { const me = ob(s, fr.ctx.self); const pl = s.players[fr.ctx.p]; const us = pl.trash.filter((c) => C[c].t === 'u'); pl.trash = pl.trash.filter((c) => C[c].t !== 'u'); pl.banished.push(...us); if (me) me.pile = (me.pile || []).concat(us); log(`${cn(fr.ctx.card)} banishes ${us.length} unit${us.length === 1 ? '' : 's'} from the trash.`); };
OP.playFromPile = (s, fr, op) => {
  const me = ob(s, fr.ctx.self); if (!me || !me.pile || !me.pile.length) return; const p = fr.ctx.p;
  const ok = me.pile.filter((c) => !op.pay || canPay(s, p, { e: C[c].e || 0, pw: C[c].p || [] }, { type: C[c].t }));
  const c = pickCard(s, fr, ok, `${cn(fr.ctx.card)}: play a unit banished with it`, true); if (c === WAIT) return WAIT; if (c == null) return;
  if (op.pay) pay(s, p, { e: C[c].e || 0, pw: C[c].p || [] }, null, { type: C[c].t });
  me.pile.splice(me.pile.indexOf(c), 1); const pl = s.players[p]; const j = pl.banished.indexOf(c); if (j >= 0) pl.banished.splice(j, 1);
  playFree(s, p, c, {});
};
HAND['daisy'] = { ab: [st('enterReady'), st('costLess', { e: 1, per: { count: 'tagKinds', tags: ['Bird', 'Cat', 'Dog', 'Poro'] } }), trig('attack', [{ op: 'if', cond: { c: 'allTags', tags: ['Bird', 'Cat', 'Dog', 'Poro'] }, then: [{ op: 'stun', t: one({ type: 'u', who: 'enemy', where: 'here' }) }] }])] };
HAND['dame-the-despoiler'] = { plus: [trig(['attack', 'defend'], [{ op: 'choose', t: one({ type: 'u', where: 'here', other: true }) }, { op: 'dameMatch' }], { gate: { emp: true } })] };
OP.dameMatch = (s, fr) => { const me = ob(s, fr.ctx.self), o = ob(s, firstIt(fr.ctx)); if (!me) return; if (o) { const d = might(s, o) - might(s, me); if (d > 0) me.mod += d; } me.mod += 1; log(`${cn(me.cid)} rises to ${might(s, me)} might this turn.`); };
HAND['dancing-grenade'] = { ab: [spell([{ op: 'grenade' }])] };
OP.grenade = (s, fr) => {
  const ctx = fr.ctx; const g = s.turnFx.grenadeN || 0;
  if (ctx._gt == null) { const ids = resolveSel(s, fr, one({ type: 'u' }), { op: 'deal' }); if (ids === WAIT) return WAIT; if (!ids.length) return; ctx._gt = ids[0]; const o = ob(s, ctx._gt); const amt = 2 + g + bonusDmg(s, ctx, o); log(`${cn(ctx.card)} deals ${amt} to ${cn(o.cid)}.`); ctx._gc = o.ctrl; damage(s, o, amt, { spell: true, p: ctx.p }); s.turnFx.grenadeN = g + 1; }
  const q = ctx._gc; if (q == null || !canPay(s, q, { e: 0, pw: ['any'] })) { delete ctx._gt; return; }
  const y = askObj(s, fr, ['yes', 'no'], `${cn(ctx.card)}: pay 1 power to throw it again?`, 0, q); if (y === WAIT) return WAIT;
  delete ctx._gt; if (y !== 'yes') return;
  pay(s, q, { e: 0, pw: ['any'] }); log(`${P(q)} ${vb(q, 'throw', 'throws')} ${cn(ctx.card)} again.`);
  pushChild(s, [{ op: 'grenade' }], Object.assign({}, ctx, { p: q, it: [], picks: [], pi: 0 }));
};
HAND['dazzling-aurora'] = { ab: [trig('endTurn', [{ op: 'revealUntil', type: 'u', play: true }])] };
OP.revealUntil = (s, fr, op) => {
  const p = fr.ctx.p, pl = s.players[p]; const seen = [];
  while (pl.deck.length) { const c = pl.deck.shift(); if (C[c].t === op.type) { log(`${P(p)} ${vb(p, 'reveal', 'reveals')} ${cn(c)}.`); pl.deck.push(...seen); if (op.play) playFree(s, p, c, {}); else pl.hand.push(c); return; } seen.push(c); }
  pl.deck.push(...seen);
};
HAND['deadly-flourish'] = { ab: [spell([{ op: 'deal', n: 3, t: one(eu) }, { op: 'delayTrig', on: 'delayedDies', once: true, eff: [{ op: 'gold', n: 1 }] }])] };
HAND['death-from-below'] = { ab: [spell([{ op: 'kill', t: one({ type: 'u', where: 'bf' }) }, { op: 'if', cond: { c: 'itMightLE', n: 3 }, then: [{ op: 'playableAgain', cost: { e: 0, pw: ['any'] } }] }])] };
OP.playableAgain = (s, fr, op) => { const pl = s.players[fr.ctx.p]; pl.playable = pl.playable || []; pl.playable.push({ cid: fr.ctx.card, zone: 'trash', cost: op.cost, untilEOT: true }); log(`${cn(fr.ctx.card)} can be played again from the trash this turn for 1 power.`); };
HAND['deathgrip'] = { plus: [spell([{ op: 'choose', t: one(fu) }, { op: 'saveMightKill' }, { op: 'might', n: { ref: 'saved' }, t: one({ type: 'u', who: 'friendly' }) }, { op: 'draw', n: 1 }])] };
OP.saveMightKill = (s, fr) => { const o = ob(s, firstIt(fr.ctx)); if (!o) return; fr.ctx.saved = might(s, o); kill(s, o, { p: fr.ctx.p, spell: true }); };
HAND['decree-of-discord'] = { ab: [spell([{ op: 'returnTotal', f: { type: 'u', who: 'enemy', dom: 'order' }, max: 5 }])] };
OP.returnTotal = (s, fr, op) => {
  const ctx = fr.ctx; let ids = s.objs.filter((o) => matchesF(s, o, op.f, Object.assign({ s }, ctx)) && canBeChosen(s, o, ctx.p)).map((o) => o.id);
  if (!ids.length) return;
  let pick;
  const a = takeAns(fr);
  if (!a) {
    if (!s.players[ctx.p].human) { pick = []; let t = 0; for (const id of ids.sort((x, y) => might(s, ob(s, y)) - might(s, ob(s, x)))) { const m = might(s, ob(s, id)); if (t + m <= op.max) { pick.push(id); t += m; } } }
    else return needChoice(s, fr, 'sel', { opts: ids, n: 99, upto: true, why: `${cn(ctx.card)}: return units with total might ${op.max} or less`, pol: -1 });
  } else pick = Array.isArray(a.v) ? a.v : [a.v];
  let t = 0; const ok = []; for (const id of pick) { const o = ob(s, id); if (!o) continue; const m = might(s, o); if (t + m <= op.max) { ok.push(id); t += m; } }
  each(s, ok, (o) => returnToHand(s, o));
};
HAND['decree-of-focus'] = { plus: [spell([{ op: 'might', n: 4, t: one({ type: 'u', who: 'friendly', decree: 'fury' }) }])] };

/* ---------------- D–F ---------------- */
HAND['decree-of-insight'] = { plus: [st('ignoreDeflect')] };
HAND['decree-of-strength'] = { ab: [spell([{ op: 'pickFromOppHand', dom: 'mind', act: 'recycle' }])] };
OP.pickFromOppHand = (s, fr, op) => {
  const q = 1 - fr.ctx.p, opp = s.players[q]; s.reveal[q] = true;
  const filt = (c) => (!op.type || C[c].t === op.type) && (!op.notType || C[c].t !== op.notType) && (!op.dom || C[c].d.includes(op.dom));
  const c = pickCard(s, fr, opp.hand.filter(filt), `${cn(fr.ctx.card)}: choose a card from the opponent's hand`, !!op.may); if (c === WAIT) return WAIT; if (c == null) return;
  opp.hand.splice(opp.hand.indexOf(c), 1);
  if (op.act === 'recycle') { opp.deck.push(c); log(`${P(q)} ${vb(q, 'recycle', 'recycles')} ${cn(c)}.`); emit(s, 'youRecycle', { p: q }); }
  else if (op.act === 'discard') { opp.hand.push(c); discardCard(s, q, c); }
  else if (op.act === 'banish') { opp.banished.push(c); log(`${cn(c)} is banished.`); }
};
HAND['defiant-dance'] = { plus: [spell([{ op: 'might', n: 2, t: one({ type: 'u' }) }, { op: 'might', n: -2, t: { q: 'one', n: 1, f: { type: 'u' }, notIt: true } }])] };
HAND['demacian-standard'] = { plus: [trig('friendlyAttackHere', [{ op: 'might', n: 2, t: one({ type: 'u', who: 'friendly', where: 'here', attacking: true }) }])] };
HAND['disposal-expert'] = { plus: [st('enterReady', { cond: { c: 'control', n: 1, f: { type: 'u', who: 'friendly' }, not: true } })] };
HAND['disposal-order'] = { plus: [spell([{ op: 'oneOf', opts: [[{ op: 'choose', t: { q: 'upto', n: 3, f: { zone: 'trash', who: 'enemy' } } }, { op: 'recycleTrashCards' }], [{ op: 'draw', n: 1 }]] }])] };
OP.recycleTrashCards = (s, fr) => { for (const t of fr.ctx.it || []) { if (typeof t !== 'string' || t[0] !== 'T') continue; const [q, cid] = t.slice(1).split(':'); const pl = s.players[+q]; const i = pl.trash.indexOf(cid); if (i >= 0) { pl.trash.splice(i, 1); pl.deck.push(cid); log(`${cn(cid)} is recycled from ${Pos(+q)} trash.`); emit(s, 'youRecycle', { p: +q }); } } };
HAND['divine-judgment'] = { ab: [spell([{ op: 'divineJudgment' }])] };
OP.divineJudgment = (s, fr) => {
  const ctx = fr.ctx; ctx._dj = ctx._dj || { step: 0 };
  const steps = []; for (const q of [ctx.p, 1 - ctx.p]) for (const k of ['u', 'g', 'r', 'h']) steps.push([q, k]);
  while (ctx._dj.step < steps.length) {
    const [q, k] = steps[ctx._dj.step]; const pl = s.players[q];
    const opts = k === 'u' ? unitsOf(s, q).map((u) => u.id) : k === 'g' ? gearOf(s, q).map((g) => g.id) : k === 'r' ? pl.runes.map((r) => 'R' + r.id) : pl.hand.map((c, i) => 'H' + i);
    let keep;
    if (opts.length <= 2) keep = opts;
    else {
      const a = takeAns(fr);
      if (!a) {
        if (!pl.human) { keep = k === 'h' ? pl.hand.map((c, i) => ['H' + i, cardVal(c)]).sort((x, y) => y[1] - x[1]).slice(0, 2).map((x) => x[0]) : k === 'r' ? opts.slice(0, 2) : opts.slice().sort((x, y) => (ob(s, y).k === 'u' ? unitVal(s, ob(s, y)) : 1) - (ob(s, x).k === 'u' ? unitVal(s, ob(s, x)) : 1)).slice(0, 2); }
        else return needChoice(s, fr, 'sel', { p: q, opts, n: 2, why: `${cn(ctx.card)}: choose 2 ${({ u: 'units', g: 'gear', r: 'runes', h: 'cards in hand' })[k]} to keep`, pol: 1 });
      } else keep = a.v;
    }
    ctx._dj[q + k] = keep; ctx._dj.step++;
  }
  for (const q of [0, 1]) {
    const pl = s.players[q];
    for (const o of unitsOf(s, q).concat(gearOf(s, q))) if (!(ctx._dj[q + o.k] || []).includes(o.id)) removeObj(s, o, 'recycle');
    const kr = ctx._dj[q + 'r'] || []; const rr = pl.runes.filter((r) => !kr.includes('R' + r.id)); pl.runes = pl.runes.filter((r) => kr.includes('R' + r.id)); pl.runeDeck.push(...rr.map((r) => r.d));
    const kh = ctx._dj[q + 'h'] || []; const keepH = pl.hand.filter((c, i) => kh.includes('H' + i)); const rest = pl.hand.filter((c, i) => !kh.includes('H' + i)); pl.hand = keepH; pl.deck.push(...rest);
  }
  log(`${cn(ctx.card)}: everything else is recycled.`); delete ctx._dj; refreshControl(s);
};
HAND['dockside-lock-up'] = { kw: { deploy: true }, ab: [trig('played', [{ op: 'choose', t: one({ type: 'u', where: 'here' }) }, { op: 'banishToPile' }]), trig('youHold', [{ op: 'playPileKillSelf' }], { here: true })] };
OP.banishToPile = (s, fr) => { const me = ob(s, fr.ctx.self); each(s, fr.ctx.it || [], (o) => { log(`${cn(o.cid)} is banished.`); if (me && !o.token) me.pile = (me.pile || []).concat([o.cid]); removeObj(s, o, 'banish'); }); };
OP.playPileKillSelf = (s, fr) => { const me = ob(s, fr.ctx.self); if (!me || !me.pile || !me.pile.length) return; const c = me.pile[0]; kill(s, me); for (const pl of s.players) { const i = pl.banished.indexOf(c); if (i >= 0) { pl.banished.splice(i, 1); break; } } playFree(s, fr.ctx.p, c, {}); };
HAND['dominus'] = { plus: [spell([{ op: 'choose', t: one({ type: 'u' }) }, { op: 'double', t: it }, { op: 'grantAct', ab: act({ pw: ['any', 'any'] }, [{ op: 'ready', t: self }]) }])] };
OP.grantAct = (s, fr, op) => each(s, fr.ctx.it || [], (o) => { o.grantAct = (o.grantAct || []).concat([op.ab]); o.grantTemp = !op.perm; });
HAND['double-trouble'] = { plus: [spell([{ op: 'look', n: 3 }, { op: 'lookTake', type: 'unit', may: true }, { op: 'lookRest', to: 'deck' }])] };
HAND['downwell'] = { ab: [spell([{ op: 'return', t: { q: 'each', f: { type: 'ug' } } }])] };
HAND['dragon-form'] = { plus: [spell([{ op: 'choose', t: one({ type: 'u' }) }, { op: 'setBase', n: 5 }])] };
OP.setBase = (s, fr, op) => each(s, fr.ctx.it || [], (o) => { o.setBase = op.n; log(`${cn(o.cid)}'s base might becomes ${op.n} this turn.`); });
HAND['dragon-roost'] = { ab: [st('dragonRoost')] };
HAND['dragons-rage'] = { ab: [spell([{ op: 'move', t: one(eu), to: 'any' }, { op: 'choose', slot: 'b', t: { q: 'one', n: 1, f: { type: 'u', who: 'enemy', where: 'itloc' }, notIt: true } }, { op: 'fight' }])] };
HAND['dune-devourer'] = { plus: [st('sacCost', { reduceE: 2 })] };
HAND['dune-surfer'] = { ab: [st('ignoreTank')] };
HAND['dusk-rose-lab'] = { ab: [trig('beginningAny', [{ op: 'if', cond: { c: 'controlHere' }, then: [{ op: 'may', then: [{ op: 'kill', t: one({ type: 'u', who: 'friendly', where: 'here' }) }, { op: 'draw', n: 1 }] }] }])] };
HAND['eager-apprentice'] = { ab: [st('costMod', { who: 'you', type: 's', e: -1, minE: 1, cond: { c: 'selfAtBf' } })] };
HAND['edge-of-night'] = { plus: [trig('played', [{ op: 'attachToHere' }], { fromHidden: true })] };
OP.attachToHere = (s, fr) => { const g = ob(s, fr.ctx.self); const bf = fr.ctx.trig && fr.ctx.trig.hbf; if (!g || bf == null) return; const ids = unitsAt(s, bf, fr.ctx.p).map((u) => u.id); const id = askObj(s, fr, ids, `${cn(g.cid)}: attach to which unit?`, 1); if (id === WAIT) return WAIT; if (id != null && ob(s, id)) attach(s, g, ob(s, id)); };
HAND['ekko-ingenious'] = { plus: [st('sacCost', { mandatory: true, mode: 'return' })] };
HAND['ekko-recurrent'] = { plus: [trig('die', [{ op: 'recycleSelfCard' }, { op: 'readyRunes', n: 99 }])] };
OP.recycleSelfCard = (s, fr) => { const sn = fr.ctx.snap; if (!sn) return; const pl = s.players[sn.owner]; const i = pl.trash.lastIndexOf(sn.cid); if (i >= 0) { pl.trash.splice(i, 1); pl.deck.push(sn.cid); log(`${cn(sn.cid)} is recycled.`); } };
HAND['elder-dragon'] = { plus: [st('anyDamageKills')] };
HAND['elnuk-herd'] = { ab: [trig('played', [{ op: 'might', n: 3, t: one({ type: 'u', who: 'friendly', other: true }) }, { op: 'if', cond: { c: 'fromHidden' }, then: [{ op: 'recycleSelfObj' }] }])] };
OP.recycleSelfObj = (s, fr) => { const o = ob(s, fr.ctx.self); if (o) { log(`${cn(o.cid)} is recycled.`); removeObj(s, o, 'recycle'); } };
HAND['en-garde'] = { plus: [spell([{ op: 'might', n: 1, t: one(fu) }, { op: 'if', cond: { c: 'itAlone' }, then: [{ op: 'might', n: 1, t: it }] }])] };
HAND['encore'] = { ab: [spell([{ op: 'chooseModes', n: 2, opts: [[{ op: 'deal', n: 2, t: one({ type: 'u' }) }], [{ op: 'token', name: 'Recruit', m: 1, n: 2, where: 'base' }], [{ op: 'might', n: 1, t: upto(2, { type: 'u' }) }], [{ op: 'look', n: 2 }, { op: 'lookTake', type: 'card' }, { op: 'lookRest', to: 'deck' }]], labels: ['Deal 2 to a unit', 'Two 1-might Recruits', 'Up to two units +1 might', 'Look at 2, draw 1'] }])] };
OP.chooseModes = (s, fr, op) => {
  const ctx = fr.ctx; ctx._cm = ctx._cm || [];
  while (ctx._cm.length < op.n) {
    const avail = op.opts.map((o, i) => i).filter((i) => !ctx._cm.includes(i));
    const a = takeAns(fr); if (!a) return needChoice(s, fr, 'mode', { why: `${cn(ctx.card)}: choose ${op.n - ctx._cm.length} more`, opts: avail, labels: op.labels || op.opts.map((o) => maySummary(o)) });
    ctx._cm.push(a.v);
  }
  const chosen = ctx._cm.slice().sort(); delete ctx._cm;
  for (let k = chosen.length - 1; k >= 0; k--) pushChild(s, op.opts[chosen[k]], Object.assign({}, ctx, { it: [] }));
};
HAND['endless-riches'] = { ab: [trig('played', [{ op: 'endlessRiches' }]), st('skipDraw'), st('playFromTrash')], manual: 'Cards going to your trash are not redirected to banishment.' };
OP.endlessRiches = (s, fr) => { const pl = s.players[fr.ctx.p]; pl.banished.push(...pl.hand, ...pl.trash); pl.hand = []; pl.trash = []; log(`${P(fr.ctx.p)} ${vb(fr.ctx.p, 'banish', 'banishes')} hand and trash.`); pushChild(s, [{ op: 'burn', n: 7 }], fr.ctx); };
HAND['esteemed-hierophant'] = { ab: [st('preventEnemyFx', { cond: { c: 'runes', ge: 7 } })] };
HAND['evelynn-entrancing'] = { plus: [trig('played', [{ op: 'if', cond: { c: 'myTurn' }, then: [{ op: 'may', then: [{ op: 'move', t: one({ type: 'u', who: 'enemy', notHere: true }), to: 'here' }] }] }], { fromHidden: true })] };
HAND['evelynn-in-control'] = { plus: [trig('hold', [{ op: 'if', cond: { c: 'hiddenHere' }, then: [{ op: 'score', n: 1 }] }])] };
HAND['existential-dread'] = { plus: [spell([{ op: 'choose', t: one({ type: 'u', who: 'enemy', attacking: true }) }, { op: 'if', cond: { c: 'itStunned' }, then: [{ op: 'return', t: it }], else: [{ op: 'stun', t: it }] }])] };
HAND['experimental-hexplate'] = { eqPlus: [st('grantTag', { tag: 'Mech' })] };
HAND['ezreal-prodigy'] = { plus: [st('optCostDiscount')] };
HAND['facebreaker'] = { plus: [spell([{ op: 'choose', t: one({ type: 'u', who: 'friendly', where: 'bf' }) }, { op: 'choose', slot: 'b', t: one({ type: 'u', who: 'enemy', where: 'itloc' }) }, { op: 'stun', t: it }])] };
HAND['fading-memories'] = { ab: [spell([{ op: 'temp', t: one({ type: 'ug', unitBfOrGear: true }) }])] };
HAND['fallen-feline'] = { ab: [trig('played', [{ op: 'nameSpell' }])] };
OP.nameSpell = (s, fr) => {
  const me = ob(s, fr.ctx.self); if (!me) return; const q = 1 - fr.ctx.p; const pl = s.players[q];
  const names = [...new Set(pl.deck.concat(pl.hand, pl.trash).filter((c) => C[c] && C[c].t === 's').map((c) => C[c].n))].sort();
  if (!names.length) return;
  const a = takeAns(fr);
  if (!a) {
    if (!s.players[fr.ctx.p].human) { const cnt = {}; for (const c of pl.deck.concat(pl.hand)) if (C[c] && C[c].t === 's') cnt[C[c].n] = (cnt[C[c].n] || 0) + cardVal(c); const best = Object.entries(cnt).sort((x, y) => y[1] - x[1])[0]; me.named = best ? best[0] : names[0]; }
    else return needChoice(s, fr, 'tag', { opts: names, why: `${cn(me.cid)}: name a spell` });
  } else me.named = a.v;
  log(`${cn(me.cid)} names ${me.named}.`);
};
HAND['fate-weaver'] = { ab: [trig('played', [{ op: 'look', n: 4 }, { op: 'lookTake', type: 'spell', costGE: 4, may: true }, { op: 'lookRest', to: 'deck' }])] };
HAND['fiora-peerless'] = { ab: [trig(['attack', 'defend'], [{ op: 'double', t: self }], { oneOnOne: true })] };
HAND['firelights-hideout'] = { ab: [trig('youConquer', [{ op: 'turnFxP', k: 'nextAccel' }])] };
HAND['fizz-trickster'] = { ab: [trig('played', [{ op: 'playFromTrashCheap', maxE: 3, recycle: true }])] };
OP.playFromTrashCheap = (s, fr, op) => {
  const p = fr.ctx.p, pl = s.players[p];
  const ok = pl.trash.filter((c) => C[c].t === 's' && (C[c].e || 0) <= op.maxE && canPay(s, p, { e: 0, pw: C[c].p || [] }));
  const c = pickCard(s, fr, ok, `${cn(fr.ctx.card)}: play a spell from your trash (pay only its Power)`, true); if (c === WAIT) return WAIT; if (c == null) return;
  pay(s, p, { e: 0, pw: C[c].p || [] }); pl.trash.splice(pl.trash.indexOf(c), 1);
  const item = playFree(s, p, c, { src: 'trash' }); if (item && op.recycle) item.recycle = true;
};
HAND['flame-chompers'] = { ab: [trig('discarded', [{ op: 'payOpt', cost: { e: 0, pw: ['fury'] }, then: [{ op: 'playSelfFromTrash' }] }])] };
OP.playSelfFromTrash = (s, fr) => { const pl = s.players[fr.ctx.p]; const i = pl.trash.lastIndexOf(fr.ctx.card); if (i < 0) return; pl.trash.splice(i, 1); playFree(s, fr.ctx.p, fr.ctx.card, {}); };
HAND['flash'] = { plus: [spell([{ op: 'move', t: upto(2, fu), to: 'base' }])] };
HAND['forbidding-waste'] = { ab: [st('defendAloneMinus')] };
HAND['forge-of-the-fluft'] = { ab: [act({ exLegend: true }, [{ op: 'choose', t: one({ type: 'eq', who: 'friendly' }) }, { op: 'choose', slot: 'b', t: one(fu) }, { op: 'attachIt' }])] };
HAND['forge-of-the-future'] = { plus: [act({ killSelf: true }, [{ op: 'choose', t: { q: 'upto', n: 4, f: { zone: 'trash', who: 'any' } } }, { op: 'recycleTrashCards' }])] };
HAND['forgotten-library'] = { ab: [trig('anyPlay', [{ op: 'predict', n: 1 }], { f: { type: 's', costGE: 4 }, ctrlOnly: true })] };
HAND['forgotten-monument'] = { ab: [st('noScoreEarly')] };
HAND['forgotten-relic'] = { ab: [trig(['played', 'beginning'], [{ op: 'burn', n: 1 }, { op: 'relicBurn' }])] };
OP.relicBurn = (s, fr) => { const c = fr.ctx.burned; if (!c || C[c].t !== 'u') return; pushChild(s, [{ op: 'might', n: C[c].m || 0, t: one(fu) }], fr.ctx); };
HAND['forgotten-signpost'] = { ab: [act({ ex: true, exhaustFriendly: true }, [{ op: 'move', t: { q: 'one', n: 1, f: { type: 'u', who: 'friendly', notExhausted: true } }, to: 'exhaustedLoc' }], { speed: 'A' })] };
HAND['forsaken-baccai'] = { ab: [trig('beginning', [{ op: 'if', cond: { c: 'fewerRunes' }, then: [{ op: 'might', n: 1, t: self }] }])] };
HAND['fortified-position'] = { ab: [trig('youDefend', [{ op: 'giveKw', kw: { shield: 2 }, t: one({ type: 'u' }) }])] };

/* ---------------- F–J ---------------- */
HAND['fox-fire'] = { plus: [spell([{ op: 'chooseBf' }, { op: 'killTotal', max: 4 }])] };
OP.killTotal = (s, fr, op) => {
  const ctx = fr.ctx; const there = ctx.there; let ids = unitsAt(s, there).filter((o) => canBeChosen(s, o, ctx.p)).map((o) => o.id); if (!ids.length) return;
  const a = takeAns(fr); let pick;
  if (!a) {
    if (!s.players[ctx.p].human) { pick = []; let t = 0; for (const id of ids.filter((id) => ob(s, id).ctrl !== ctx.p).sort((x, y) => might(s, ob(s, y)) - might(s, ob(s, x)))) { const m = might(s, ob(s, id)); if (t + m <= op.max) { pick.push(id); t += m; } } }
    else return needChoice(s, fr, 'sel', { opts: ids, n: 99, upto: true, why: `${cn(ctx.card)}: kill units with total might ${op.max} or less`, pol: -1 });
  } else pick = Array.isArray(a.v) ? a.v : [a.v];
  let t = 0; const ok = []; for (const id of pick) { const o = ob(s, id); if (!o) continue; const m = might(s, o); if (t + m <= op.max) { ok.push(id); t += m; } }
  each(s, ok, (o) => kill(s, o, { p: ctx.p, spell: true }));
};
HAND['friendship'] = { plus: [spell([{ op: 'might', n: { ref: 'count', per: { count: 'tagKinds', tags: ['Bird', 'Cat', 'Dog', 'Poro'] } }, t: one({ type: 'u' }) }])] };
HAND['frostcoat-mother'] = { kw: { empower: { e: 12, pw: [], less: { e: 1, per: 'runes' } } }, plus: [] };
HAND['grumpy-rockbear'] = { kw: { empower: { e: 12, pw: [], less: { e: 1, per: 'runes' } } }, plus: [] };
HAND['gangplank-naval'] = { plus: [st('fxToMight', { gate: { emp: true } })] };
HAND['gardens-of-becoming'] = { ab: [st('grantUnitsAct', { ab: act({ ex: true }, [{ op: 'xp', n: 1 }]) })] };
HAND['gearhead'] = { plus: [st('doubleEqBonus')] };
HAND['get-excited'] = { plus: [spell([{ op: 'discard', n: 1 }, { op: 'deal', n: { ref: 'lastDiscardE' }, t: one({ type: 'u', where: 'bf' }) }])] };
HAND['glasc-mixologist'] = { ab: [trig('die', [{ op: 'playFromTrashFree', type: 'u', maxE: 3, maxP: 1 }])] };
OP.playFromTrashFree = (s, fr, op) => {
  const p = fr.ctx.p, pl = s.players[p];
  const maxE = op.maxE === 'sac' ? (C[fr.ctx.sacCid] || {}).e || 0 : op.maxE, maxP = op.maxP === 'sac' ? ((C[fr.ctx.sacCid] || {}).p || []).length : op.maxP;
  const ok = pl.trash.filter((c) => C[c].t === op.type && (C[c].e || 0) <= maxE && (C[c].p || []).length <= maxP);
  const c = pickCard(s, fr, ok, `${cn(fr.ctx.card)}: play a ${op.type === 'u' ? 'unit' : 'card'} from your trash for free`, true); if (c === WAIT) return WAIT; if (c == null) return;
  pl.trash.splice(pl.trash.indexOf(c), 1); playFree(s, p, c, {});
};
HAND['glowstone'] = { keep: [], plus: [act({ disemp: true, ex: true }, [{ op: 'choosePlayer' }, { op: 'giveSelfTo' }]), trig('endTurn', [{ op: 'kill', t: self }, { op: 'deal', n: 5, t: { q: 'each', f: fu } }])] };
OP.giveSelfTo = (s, fr) => { const me = ob(s, fr.ctx.self); if (!me) return; const q = fr.ctx.chosenPlayer != null ? fr.ctx.chosenPlayer : fr.ctx.p; me.ctrl = q; me.loc = 'base'; log(`${P(q)} ${vb(q, 'gain', 'gains')} control of ${cn(me.cid)}.`); };
HAND['grim-resolve'] = { ab: [spell([{ op: 'might', n: 3, t: one(fu) }, { op: 'delayTrig', on: 'delayedWins', once: true, eff: [{ op: 'xp', n: 2 }] }])] };
HAND['guardian-angel'] = { eqPlus: [st('saveSelfKillEq')] };
HAND['guerilla-warfare'] = { ab: [spell([{ op: 'choose', t: { q: 'upto', n: 2, f: { zone: 'trash', hasKw: 'hidden' } } }, { op: 'fromTrash', t: it }, { op: 'turnFxP', k: 'freeHide' }])] };
HAND['gust-monk'] = { plus: [trig('played', [{ op: 'if', cond: { c: 'paidExtra' }, then: [{ op: 'choose', t: one({ zone: 'trash', who: 'any', anyTrash: true }) }, { op: 'banishTrashIt' }, { op: 'giveKw', kw: { assault: 2 }, t: one({ type: 'u' }) }] }])] };
OP.banishTrashIt = (s, fr) => { for (const t of fr.ctx.it || []) { if (typeof t !== 'string' || t[0] !== 'T') continue; const [q, cid] = t.slice(1).split(':'); const pl = s.players[+q]; const i = pl.trash.indexOf(cid); if (i >= 0) { pl.trash.splice(i, 1); pl.banished.push(cid); log(`${cn(cid)} is banished from the trash.`); emit(s, 'youBanish', { p: +q, cid }); } } fr.ctx.it = []; };
HAND['gutter-palace'] = { plus: [trig('beginning', [{ op: 'if', cond: { c: 'handEq', n: 4 }, then: [{ op: 'if', cond: { c: 'unitsAtBfEq', n: 4 }, then: [{ op: 'winGame' }] }] }])] };
OP.winGame = (s, fr) => { const p = fr.ctx.p; s.winner = p; s.mode = 'over'; log(`${cn(fr.ctx.card)}: ${P(p)} ${vb(p, 'win', 'wins')} the game!`, 'score'); };
HAND['guttural-roar'] = { plus: [spell([{ op: 'choose', t: one({ type: 'u' }) }, { op: 'if', cond: { c: 'itEmp' }, then: [{ op: 'might', n: 4, t: it }], else: [{ op: 'might', n: 2, t: it }] }])] };
HAND['hallowed-tomb'] = { ab: [trig('youHold', [{ op: 'if', cond: { c: 'champGone' }, then: [{ op: 'may', then: [{ op: 'champBack' }] }] }])] };
OP.champBack = (s, fr) => { const pl = s.players[fr.ctx.p]; const i = pl.trash.indexOf(pl.chosenChamp); if (i < 0 || pl.champ) return; pl.trash.splice(i, 1); pl.champ = pl.chosenChamp; log(`${cn(pl.champ)} returns to ${Pos(fr.ctx.p)} Champion Zone.`); };
HAND['heedless-resurrection'] = { plus: [st('sacCost', { mandatory: true }), spell([{ op: 'playFromTrashFree', type: 'u', maxE: 'sac', maxP: 'sac' }])] };
HAND['heimerdinger-academy-instructor'] = { ab: [st('mechReplace')] };
HAND['heimerdinger-inventor'] = { ab: [st('borrowExhaust')] };
HAND['helm-of-suppression'] = { plus: [st('costMod', { who: 'opp', type: 's', e: 1, empAlt: { e: 1, pw: 1 } })] };
HAND['herald-of-scales'] = { ab: [st('costMod', { who: 'you', tag: 'Dragon', e: -2, minE: 1 })] };
HAND['herald-of-the-emperor'] = { ab: [trig('played', [{ op: 'choose', t: one(fu) }, { op: 'setBase', n: 5 }])] };
HAND['here-to-help'] = { plus: [spell([{ op: 'playFromHandDiscount', e: 3, to: 'mine' }])] };
OP.playFromHandDiscount = (s, fr, op) => {
  const p = fr.ctx.p, pl = s.players[p]; const bfs = [0, 1].filter((i) => s.ctrl[i] === p); if (!bfs.length) return;
  const cost = (c) => ({ e: Math.max(0, (C[c].e || 0) - op.e), pw: C[c].p || [] });
  const ok = pl.hand.filter((c) => C[c].t === 'u' && canPay(s, p, cost(c), { type: 'u' }));
  if (fr.ctx._ph == null) { const c = pickCard(s, fr, ok, `${cn(fr.ctx.card)}: play a unit for ${op.e} less to a battlefield you control`, true); if (c === WAIT) return WAIT; if (c == null) return; fr.ctx._ph = c; }
  const to = askDest(s, fr, bfs, `${cn(fr.ctx.card)}: play it where?`); if (to === WAIT) return WAIT;
  const c = fr.ctx._ph; delete fr.ctx._ph; pay(s, p, cost(c), null, { type: 'u' }); pl.hand.splice(pl.hand.indexOf(c), 1); playFree(s, p, c, { to, src: 'hand' });
};
HAND['hexplosive-minefield'] = { plus: [spell([{ op: 'choose', t: { q: 'upto', n: 99, f: { type: 'g', who: 'friendly', tag: 'Bomb' } } }, { op: 'minefield' }])] };
OP.minefield = (s, fr) => { const n = (fr.ctx.it || []).filter((id) => ob(s, id)).length; each(s, fr.ctx.it || [], (o) => kill(s, o, { p: fr.ctx.p, spell: true })); if (!n) return; s.delayed.push({ id: s.nid++, a: { kind: 'trig', on: 'endTurn', eff: [{ op: 'bombs', n }] }, p: fr.ctx.p, self: null, cid: fr.ctx.card, it: [], until: 'turn', once: true }); };
OP.bombs = (s, fr, op) => { const opts = [0, 1]; const to = askDest(s, fr, opts, `${cn(fr.ctx.card)}: play ${op.n} Bombs to which battlefield?`); if (to === WAIT) return WAIT; for (let i = 0; i < op.n; i++) newObj(s, { cid: bombCard(), k: 'g', owner: fr.ctx.p, loc: to, ex: false }); log(`${P(fr.ctx.p)} ${vb(fr.ctx.p, 'play', 'plays')} ${op.n} Bombs at ${bfName(s, to)}.`); };
HAND['hextech-gauntlets'] = { kw: { equip: { e: 3, pw: ['any'], reduceByMight: true } }, eqPlus: [trig('conquer', [{ op: 'if', cond: { c: 'excessGE', n: 3 }, then: [{ op: 'draw', n: 1 }] }])] };
HAND['high-note'] = { plus: [spell([{ op: 'might', n: { ref: 'negCount', per: { count: 'control', f: { type: 'u', who: 'friendly', ex: true } } }, t: one({ type: 'u' }) }])] };
HAND['highlander'] = { plus: [spell([{ op: 'choose', t: one(fu) }, { op: 'addSave' }])] };
OP.addSave = (s, fr, op) => each(s, fr.ctx.it || [], (o) => { o.saves = (o.saves || []).concat([{ ex: true, payFury: !!(op && op.payFury) }]); });
HAND['hold-em'] = { plus: [st('costLess', { e: 2, cond: { c: 'toBfThisTurn' } })] };
HAND['hostile-takeover'] = { kw: { hidden: true }, ab: [spell([{ op: 'steal', t: one({ type: 'u', who: 'enemy', where: 'bf' }) }, { op: 'ready', t: it }, { op: 'tempCtrlIt' }])] };
OP.tempCtrlIt = (s, fr) => each(s, fr.ctx.it || [], (o) => { o.tempCtrl = o.owner; refreshControl(s); });
HAND['hungry-wolf'] = { ab: [act({ pw: ['order'] }, [{ op: 'ready', t: self }, { op: 'might', n: 1, t: self }], { limit: { once: true, choseEnemy: true } })] };
HAND['hunters-circle'] = { ab: [st('firstHereLess')] };
HAND['hwei-brooding-painter'] = { ab: [trig('move', [{ op: 'draw', n: 1 }, { op: 'discard', n: 1 }, { op: 'hweiType' }])] };
OP.hweiType = (s, fr) => { const c = fr.ctx.lastDiscard; if (!c) return; const t = C[c].t; pushChild(s, t === 's' ? [{ op: 'draw', n: 1 }] : t === 'g' ? [{ op: 'readyRunes', n: 2 }] : t === 'u' ? [{ op: 'might', n: 3, t: self }] : [], fr.ctx); };
HAND['iascylla'] = { ab: [trig('hold', [{ op: 'iascylla' }])] };
OP.iascylla = (s, fr) => { const me = ob(s, fr.ctx.self); if (!me || me.loc === 'base') return; s.delayed.push({ id: s.nid++, a: { kind: 'trig', on: 'mainStart', eff: [{ op: 'may', then: [{ op: 'move', t: one(eu), to: 'there' }] }] }, p: fr.ctx.p, self: me.id, cid: me.cid, it: [], until: 'forever', once: true, there: me.loc }); };
HAND['immortal-phoenix'] = { plus: [trig('killBySpell', [{ op: 'payOpt', cost: { e: 1, pw: ['fury'] }, then: [{ op: 'playSelfFromTrash' }] }], { zone: 'trash' })] };
HAND['imperial-decree'] = { ab: [spell([{ op: 'turnFx', k: 'killDamaged' }])] };
HAND['improvised-projectile'] = { kw: { action: true }, ab: [spell([{ op: 'choose', t: one({ type: 'g', who: 'friendly' }) }, { op: 'deal', n: { ref: 'itCost' }, t: one({ type: 'u', where: 'bf' }) }])] };
HAND['insightful-investigator'] = { ab: [trig('played', [{ op: 'revealOpp' }, { op: 'payOpt', cost: { e: 0, pw: [] }, xp: 2, then: [{ op: 'pickFromOppHand', act: 'discard' }, { op: 'draw', n: 1, who: 'opp' }] }])] };
OP.revealOpp = (s, fr) => { s.reveal[1 - fr.ctx.p] = true; log(`${P(1 - fr.ctx.p)} ${vb(1 - fr.ctx.p, 'reveal', 'reveals')} ${vb(1 - fr.ctx.p, 'your', 'their')} hand.`); };
HAND['invigorating-bloom'] = { ab: [trig('played', [{ op: 'might', n: 3, t: one(fu) }]), act({ ex: true, exhaustFriendlyMighty: true }, [{ op: 'draw', n: 1 }])] };
HAND['irelia-graceful'] = { ab: [st('chosenDiscount')] };
HAND['isolate'] = { ab: [spell([{ op: 'choose', t: one({ type: 'u', who: 'enemy', where: 'bf' }) }, { op: 'isolate' }])] };
OP.isolate = (s, fr) => { const o = ob(s, firstIt(fr.ctx)); if (!o) return; const from = o.loc; log(`${cn(o.cid)} moves to base.`); moveUnit(s, o, 'base', { byEffect: true, byP: fr.ctx.p }); if (unitsAt(s, from).filter((u) => u.ctrl !== fr.ctx.p).length === 1) pushChild(s, [{ op: 'draw', n: 1 }], fr.ctx); };
const IVERN_TAGS = ['Bird', 'Cat', 'Dog', 'Poro'];
HAND['ivern-friend-to-all'] = { ab: [trig('played', [{ op: 'chooseTag', tags: IVERN_TAGS }]), trig(['conquer', 'hold'], [{ op: 'if', cond: { c: 'allTags', tags: IVERN_TAGS }, then: [{ op: 'score', n: 1 }] }])] };
OP.chooseTag = (s, fr, op) => {
  const me = ob(s, fr.ctx.self); if (!me) return;
  const missing = op.tags.filter((t) => !unitsOf(s, fr.ctx.p).some((u) => tagsOf(s, u).includes(t)));
  const a = takeAns(fr);
  if (!a) { if (!s.players[fr.ctx.p].human) me.extraTag = missing[0] || op.tags[0]; else return needChoice(s, fr, 'tag', { opts: op.tags, why: `${cn(me.cid)}: choose a tag` }); } else me.extraTag = a.v;
  log(`${cn(me.cid)} becomes a ${me.extraTag}.`);
};
HAND['ivern-nurturer'] = { ab: [trig(['played', 'hold'], [{ op: 'look', n: 3 }, { op: 'lookTake', type: 'unit', may: true }, { op: 'lookRest', to: 'deck' }, { op: 'if', cond: { c: 'tookTag', tags: IVERN_TAGS }, then: [{ op: 'buff', t: one(fu) }] }])] };
HAND['jagged-cutlass'] = { eqPlus: [st('noEnemyMove')] };
HAND['janna-savior'] = { plus: [trig('played', [{ op: 'heal', t: { q: 'each', f: { type: 'u', who: 'friendly', where: 'here' } } }, { op: 'move', t: one({ type: 'u', who: 'enemy', where: 'here' }), to: 'base' }])] };
HAND['jarvan-iv-martial-paragon'] = { ab: [st('deployAction'), trig('conquer', [{ op: 'if', cond: { c: 'deployHere' }, then: [{ op: 'channel', n: 1, ex: true }] }])] };
HAND['jax-unmatched'] = { plus: [st('eqQuickDraw')] };
HAND['jayce-brilliant-inventor'] = { ab: [trig('played', [{ op: 'may', then: [{ op: 'readyAnything' }] }]), trig('youPlay', [{ op: 'may', then: [{ op: 'readyAnything' }] }], { f: { type: 'g' }, firstGear: true })] };
OP.readyAnything = (s, fr) => {
  const p = fr.ctx.p; const ids = s.objs.filter((o) => o.ctrl === p && o.ex && o.id !== fr.ctx.self).map((o) => o.id); const pl = s.players[p];
  const runes = pl.runes.filter((r) => r.ex).map((r) => 'R' + r.id); const opts = ids.concat(runes.slice(0, 1)).concat(pl.legEx ? ['L'] : []);
  if (!opts.length) return;
  const v = askObj(s, fr, opts, `${cn(fr.ctx.card)}: ready what?`, 1); if (v === WAIT) return WAIT;
  if (v === 'L') { pl.legEx = false; return; } if (typeof v === 'string' && v[0] === 'R') { const r = pl.runes.find((x) => 'R' + x.id === v); if (r) r.ex = false; return; }
  const o = ob(s, v); if (o) readyObj(s, o);
};
HAND['jayce-hammer-in-hand'] = { ab: [trig('becomeReady', [{ op: 'oneOf', opts: [[{ op: 'giveKw', kw: { assault: 2 }, t: self }], [{ op: 'giveKw', kw: { deflect: 2 }, t: self }], [{ op: 'giveKw', kw: { ganking: true }, t: self }]] }])] };
HAND['jayce-man-of-progress'] = { ab: [trig('played', [{ op: 'may', then: [{ op: 'kill', t: one({ type: 'g', who: 'friendly' }) }, { op: 'turnFxP', k: 'gearFree', v: 7 }] }])] };

/* ---------------- J–N ---------------- */
HAND['jhin-meticulous-killer'] = { plus: [st('altCost', { cost: { e: 0, pw: ['mind'] }, cond: { c: 'bigSpellThisTurn' } })] };
HAND['ksante-dauntless'] = { plus: [trig(['attack', 'defend'], [{ op: 'choose', t: one({ type: 'u', who: 'friendly', where: 'here' }) }, { op: 'doubleKw', kw: 'shield' }])] };
OP.doubleKw = (s, fr, op) => each(s, fr.ctx.it || [], (o) => { const n = kwOf(s, o)[op.kw] || 0; if (n) { o.kwT[op.kw] = (o.kwT[op.kw] || 0) + n; log(`${cn(o.cid)}'s [${op.kw}] doubles.`); } });
HAND['kaisa-evolutionary'] = { plus: [trig('conquer', [{ op: 'playFromTrashCheap', maxE: 'ptsLess', recycle: true }])] };
const _pftc = OP.playFromTrashCheap; OP.playFromTrashCheap = (s, fr, op) => _pftc(s, fr, op.maxE === 'ptsLess' ? Object.assign({}, op, { maxE: s.players[fr.ctx.p].pts - 1 }) : op);
HAND['kaisa-rebel'] = { kw: { disarm: 1 }, ab: [st('spellsReactionInSd')] };
HAND['kato-the-arm'] = { plus: [trig('move', [{ op: 'choose', t: one({ type: 'u', who: 'friendly', other: true }) }, { op: 'katoGive' }], { toBf: true })] };
OP.katoGive = (s, fr) => { const me = ob(s, fr.ctx.self), o = ob(s, firstIt(fr.ctx)); if (!me || !o) return; addKw(o.kwT, kwOf(s, me)); o.mod += might(s, me); log(`${cn(o.cid)} gets ${cn(me.cid)}'s keywords and +${might(s, me)} might.`); };
HAND['kayle-justified'] = { plus: [st('empMax3')] };
HAND['kayn-unleashed'] = { plus: [st('noDamageIfMoved2')] };
HAND['keeper-of-law'] = { ab: [st('costLess', { e: 2, p: 1, cond: { c: 'bfExactly2' } })] };
HAND['keeper-of-masks'] = { plus: [trig('played', [{ op: 'copiesOfMe', n: 2 }])] };
OP.copiesOfMe = (s, fr, op) => { const me = ob(s, fr.ctx.self); if (!me) return; const cid = tokenCard('Reflection', 'u', null, {}); for (let i = 0; i < op.n; i++) { const o = newObj(s, { cid, k: 'u', owner: fr.ctx.p, loc: me.loc, ex: true, copyOf: me.cid }); if (C[me.cid].kw.temporary) o.temp = true; } log(`${P(fr.ctx.p)} ${vb(fr.ctx.p, 'make', 'makes')} ${op.n} Reflections of ${cn(me.cid)}.`); };
HAND['keepers-verdict'] = { plus: [spell([{ op: 'choose', t: one({ type: 'u', who: 'enemy', where: 'bf' }) }, { op: 'toDeckTopOrBottom' }])] };
OP.toDeckTopOrBottom = (s, fr) => {
  const o = ob(s, firstIt(fr.ctx)); if (!o) return;
  const a = takeAns(fr); if (!a && s.players[o.owner].human) return needChoice(s, fr, 'mode', { p: o.owner, why: `${cn(fr.ctx.card)}: put ${cn(o.cid)} on top or bottom of your deck?`, opts: [0, 1], labels: ['Top', 'Bottom'] });
  const top = a ? a.v === 0 : false; log(`${cn(o.cid)} goes to the ${top ? 'top' : 'bottom'} of ${Pos(o.owner)} deck.`); removeObj(s, o, top ? 'deckTop' : 'recycle');
};
HAND['kennen-storm-of-shuriken'] = { plus: [trig('conquer', [{ op: 'flowFromTrash' }])] };
OP.flowFromTrash = (s, fr) => { const pl = s.players[fr.ctx.p]; const c = pickCard(s, fr, pl.trash.filter((x) => C[x].t === 's'), `${cn(fr.ctx.card)}: give a spell in your trash Flow this turn`, false); if (c === WAIT) return WAIT; if (c == null) return; pl.playable = pl.playable || []; pl.playable.push({ cid: c, zone: 'trash', cost: { e: C[c].e || 0, pw: (C[c].p || []).slice() }, untilEOT: true, banish: true }); log(`${cn(c)} can be played from the trash this turn.`); };
HAND['kharox'] = { plus: [trig('becomeEmp', [{ op: 'burn', n: 3, who: 'opp' }, { op: 'may', then: [{ op: 'playFromOppTrash', type: 'u' }] }])] };
OP.playFromOppTrash = (s, fr, op) => { const q = 1 - fr.ctx.p, pl = s.players[q]; const c = pickCard(s, fr, pl.trash.filter((x) => C[x].t === op.type), `${cn(fr.ctx.card)}: play a unit from the opponent's trash`, true); if (c === WAIT) return WAIT; if (c == null) return; pl.trash.splice(pl.trash.indexOf(c), 1); playFree(s, fr.ctx.p, c, { owner: q }); };
HAND['ki-barrier'] = { plus: [spell([{ op: 'choose', t: one({ type: 'u' }) }, { op: 'preventN', n: 7 }])] };
OP.preventN = (s, fr, op) => each(s, fr.ctx.it || [], (o) => { o.prevent = (o.prevent || 0) + op.n; });
HAND['kings-edict'] = { ab: [spell([{ op: 'oppChoosesKill' }])] };
OP.oppChoosesKill = (s, fr) => { const q = 1 - fr.ctx.p; const ids = units(s).filter((u) => u.ctrl !== fr.ctx.p).map((u) => u.id); if (!ids.length) return; const id = askObj(s, fr, ids, `${cn(fr.ctx.card)}: choose a unit (not the caster's) to kill`, -1, q); if (id === WAIT) return WAIT; const o = ob(s, id); if (o) kill(s, o, { p: fr.ctx.p, spell: true }); };
HAND['kinkou-initiate'] = { ab: [trig('played', [{ op: 'if', cond: { c: 'otherMightGE', n: 5 }, then: [{ op: 'draw', n: 1 }] }])] };
HAND['kraken-hunter'] = { plus: [st('buffMany')] };
HAND['last-rites'] = { eqPlus: [trig(['conquer', 'hold'], [{ op: 'playFromPileZone', zone: 'trash', type: 'u', pay: true }])] };
OP.playFromPileZone = (s, fr, op) => {
  const p = fr.ctx.p, pl = s.players[p]; const ok = pl[op.zone].filter((c) => C[c].t === op.type && (!op.pay || canPay(s, p, { e: C[c].e || 0, pw: C[c].p || [] }, { type: C[c].t })));
  const c = pickCard(s, fr, ok, `${cn(fr.ctx.card)}: you may play a unit from your ${op.zone}${op.pay ? ' (paying its cost)' : ''}`, true); if (c === WAIT) return WAIT; if (c == null) return;
  if (op.pay) pay(s, p, { e: C[c].e || 0, pw: C[c].p || [] }, null, { type: C[c].t }); pl[op.zone].splice(pl[op.zone].indexOf(c), 1); playFree(s, p, c, {});
};
HAND['leblanc-everywhere-at-once'] = { plus: [st('noTempHere')] };
HAND['leblanc-fragmented'] = { plus: [trig('die', [{ op: 'if', cond: { c: 'inBeginning' }, then: [{ op: 'draw', n: 2 }], else: [{ op: 'draw', n: 1 }] }])] };
HAND['lee-sin-ascetic'] = { plus: [st('manyBuffs')] };
HAND['legion-quartermaster'] = { ab: [st('sacCost', { mandatory: true, mode: 'return', type: 'g' })] };
HAND['lightning-rush'] = { plus: [spell([{ op: 'look', n: 3 }, { op: 'lookTake', type: 'card', may: true }, { op: 'lookRest', to: 'trash' }])] };
HAND['lilting-lullaby'] = { plus: [spell([{ op: 'counter', t: one({ type: 's' }) }, { op: 'noSpellsForCountered' }])] };
OP.noSpellsForCountered = (s, fr) => { const x = s.chain.find((c) => c.id === fr.ctx.countered); if (!x) return; s.turnFx.noSpells = s.turnFx.noSpells || {}; s.turnFx.noSpells[x.p] = true; log(`${P(x.p)} can't play spells this turn.`); };
HAND['lingering-animus'] = { ab: [st('enterReady', { cond: { c: 'friendDied' } })] };
HAND['lotus-trap'] = { plus: [spell([{ op: 'choose', t: one({ type: 'u' }) }, { op: 'dmgMul' }])] };
OP.dmgMul = (s, fr) => each(s, fr.ctx.it || [], (o) => { o.dmgMul = 2; });
HAND['loyal-pup'] = { ab: [trig('youDefend', [{ op: 'may', then: [{ op: 'move', t: self, to: 'there' }] }])] };
HAND['lulu-whimsical'] = { ab: [trig('move', [{ op: 'may', then: [{ op: 'choose', t: one({ type: 'u', other: true }) }, { op: 'setBase', n: 4 }] }])] };
HAND['mageseeker-investigator'] = { ab: [st('multiMoveTax')] };
HAND['mageseeker-warden'] = { ab: [st('oppBaseOnly', { cond: { c: 'selfAtBf' } }), st('noReadyEnemies', { cond: { c: 'selfAtBf' } })] };
HAND['marai-spire'] = { ab: [st('repeatLess')] };
HAND['meditation'] = { plus: [st('extraCost', { cost: { e: 0, pw: [], exhaustFriendly: true } }), spell([{ op: 'if', cond: { c: 'paidExtra' }, then: [{ op: 'draw', n: 2 }], else: [{ op: 'draw', n: 1 }] }])] };
HAND['mel-newly-awakened'] = { plus: [st('uncounterable', { gate: { emp: true } }), st('extraMinus', { gate: { emp: true } })] };
HAND['minah-swiftfoot'] = { ab: [trig('move', [{ op: 'oneOf', opts: [[{ op: 'discard', n: 1, who: 'each' }], [{ op: 'draw', n: 1, who: 'each' }]] }], { toBf: true })] };
HAND['mindsplitter'] = { ab: [trig('played', [{ op: 'pickFromOppHand', act: 'discard' }])] };
HAND['mirror-image'] = { ab: [spell([{ op: 'choose', t: one({ type: 'u' }) }, { op: 'mirror' }])] };
OP.mirror = (s, fr) => { const src = ob(s, firstIt(fr.ctx)); if (!src) return; const cid = tokenCard('Reflection', 'u', null, {}); const o = newObj(s, { cid, k: 'u', owner: fr.ctx.p, loc: 'base', ex: false, copyOf: src.copyOf || src.cid, temp: true }); log(`${P(fr.ctx.p)} ${vb(fr.ctx.p, 'make', 'makes')} a Reflection of ${cn(o.copyOf)}.`); emit(s, 'cardPlayed', { p: fr.ctx.p, cid, obj: o.id, to: 'base', token: true }); };
HAND['miss-fortune-captain'] = { plus: [trig('move', [{ op: 'may', then: [{ op: 'readyAnything' }] }], { nth: 1 })] };
HAND['mobilize'] = { ab: [spell([{ op: 'channel', n: 1, ex: true }, { op: 'if', cond: { c: 'channeledLT', n: 1 }, then: [{ op: 'draw', n: 1 }] }])] };
HAND['monch'] = { ab: [st('costLess', { e: 2, cond: { c: 'oppStunnedAny' } }), st('enterReady', { cond: { c: 'oppStunnedAny' } })] };
HAND['monster-harpoon'] = { plus: [spell([{ op: 'deal', n: { ref: 'ifCond', cond: { c: 'hasHidden' }, a: 2, b: 4 }, t: one({ type: 'u', where: 'bf' }) }])] };
HAND['moonfall'] = { plus: [spell([{ op: 'chooseBf', where: 'mineUnits' }, { op: 'may', then: [{ op: 'move', t: one({ type: 'u', who: 'enemy', notThere: true }), to: 'there' }] }, { op: 'might', n: -2, t: { q: 'each', f: { type: 'u', who: 'enemy', where: 'there' } } }])] };
HAND['mordekaiser-dominating'] = { ab: [trig(['played', 'attack'], [{ op: 'payOpt', cost: { e: 0, pw: [] }, discard: 1, then: [{ op: 'kill', t: one({ type: 'ug' }) }] }])] };
HAND['morgana-vindictive'] = { plus: [trig('played', [{ op: 'choose', t: one({ type: 'u', damaged: true }) }, { op: 'deal', n: { ref: 'itDmg' }, t: it }])] };
HAND['mushroom-pouch'] = { ab: [trig('beginning', [{ op: 'if', cond: { c: 'hiddenAtBf' }, then: [{ op: 'draw', n: 1 }] }])] };
HAND['mystic-reversal'] = { plus: [spell([{ op: 'choose', t: one({ type: 's' }) }, { op: 'stealSpell' }])] };
OP.stealSpell = (s, fr) => { for (const sid of fr.ctx.it || []) { const x = s.chain.find((c) => 'S' + c.id === sid); if (!x) continue; x.owner = x.owner != null ? x.owner : x.p; x.p = fr.ctx.p; x.picks = []; log(`${P(fr.ctx.p)} ${vb(fr.ctx.p, 'take', 'takes')} control of ${cn(x.cid)}.`); } };
HAND['mystic-vortex'] = { ab: [st('reactionTax')] };
HAND['nami-headstrong'] = { plus: [trig('hold', [{ op: 'turnFxP', k: 'nextReadyBuff' }])] };
HAND['needlessly-large-yordle'] = { plus: [st('costLess', { e: 2, p: 1, per: { count: 'holdPts' } })] };
HAND['neeko-blending-in'] = { plus: [], manual: 'Choosing extra legends and adding one to your Legend Zone is not automated.' };
HAND['nocturne-horrifying'] = { plus: [st('seenPlay')] };
OP.playSeen = (s, fr, op) => { const look = fr.ctx.look || []; const i = look.indexOf(op.cid); if (i < 0) return; look.splice(i, 1); playFree(s, fr.ctx.p, op.cid, {}); };
HAND['noxian-guillotine'] = { ab: [spell([{ op: 'choose', t: one({ type: 'u' }) }, { op: 'if', cond: { c: 'legion' }, then: [{ op: 'kill', t: it }], else: [{ op: 'killOnDamage' }] }])] };
OP.killOnDamage = (s, fr) => each(s, fr.ctx.it || [], (o) => { o.killOnDamage = true; log(`${cn(o.cid)} will die the next time it takes damage this turn.`); });

/* ---------------- N–R ---------------- */
HAND['noxus-saboteur'] = { ab: [st('noRevealHere')] };
HAND['ntofo-strikes'] = { plus: [spell([{ op: 'giveKw', kw: { shield: 2 }, t: one(fu) }, { op: 'dealKwOf', kw: 'shield', t: one(eu) }])] };
OP.dealKwOf = (s, fr, op) => { const src = ob(s, firstIt(fr.ctx)); const n = src ? kwOf(s, src)[op.kw] || 0 : 0; pushChild(s, [{ op: 'deal', n, t: op.t }], Object.assign({}, fr.ctx, { it: [] })); };
HAND['oasis-raider'] = { ab: [trig('beginning', [{ op: 'if', cond: { c: 'fewerRunes' }, then: [{ op: 'might', n: 2, t: self }, { op: 'giveKw', kw: { ganking: true }, t: self }] }])] };
HAND['ol-poro'] = { ab: [st('notEarly')] };
HAND['orianna-mechanical-marvel'] = { ab: [st('gearDiscountOnce')] };
HAND['ornns-forge'] = { ab: [st('firstGearLess')] };
HAND['ornn-blacksmith'] = { ab: [trig(['played', 'hold'], [{ op: 'look', n: 4 }, { op: 'lookTake', type: 'gear', may: true }, { op: 'lookRest', to: 'deck' }])] };
HAND['otterpus'] = { ab: [st('otterpus')] };
HAND['overloaded-traveler'] = { ab: [st('might', { n: 1, cond: { c: 'deployHere' } })] };
HAND['overt-operation'] = { plus: [spell([{ op: 'spendBuffsToReady' }, { op: 'buff', t: { q: 'each', f: fu } }])] };
OP.spendBuffsToReady = (s, fr) => each(s, unitsOf(s, fr.ctx.p).filter((u) => u.buff > 0 && u.ex).map((u) => u.id), (o) => { o.buff--; emit(s, 'buffSpent', { p: fr.ctx.p, obj: o.id }); readyObj(s, o); log(`${cn(o.cid)} spends its buff to ready.`); });
HAND['overzealous-fan'] = { ab: [trig('defend', [{ op: 'may', then: [{ op: 'kill', t: self }, { op: 'move', t: one({ type: 'u', attacking: true }), to: 'base' }] }])] };
HAND['pack-of-wonders'] = { ab: [act({ ex: true }, [{ op: 'packOfWonders' }])] };
OP.packOfWonders = (s, fr) => {
  const p = fr.ctx.p; const opts = s.objs.filter((o) => o.ctrl === p && o.id !== fr.ctx.self && (o.k === 'u' || o.k === 'g')).map((o) => o.id).concat(s.hidden.filter((h) => h.owner === p).map((h) => 'Hd' + h.id));
  const v = askObj(s, fr, opts, `${cn(fr.ctx.card)}: return what to your hand?`, 1); if (v === WAIT || v == null) return v === WAIT ? WAIT : undefined;
  if (typeof v === 'string') { const h = s.hidden.find((x) => 'Hd' + x.id === v); if (h) { s.hidden = s.hidden.filter((x) => x !== h); s.players[p].hand.push(h.cid); log(`${P(p)} ${vb(p, 'return', 'returns')} a hidden card to hand.`); } return; }
  const o = ob(s, v); if (o) returnToHand(s, o);
};
HAND['packed-amphitheater'] = { ab: [st('aura', { n: 1, f: { type: 'u', champion: true, where: 'here' } })] };
HAND['pakaa-protector'] = { ab: [trig('move', [{ op: 'look', n: 1, reveal: true }, { op: 'pakaa' }])] };
OP.pakaa = (s, fr) => { const c = (fr.ctx.look || [])[0]; if (!c) return; const pl = s.players[fr.ctx.p]; fr.ctx.look = []; if (C[c].t === 'u') { pl.hand.push(c); log(`${P(fr.ctx.p)} ${vb(fr.ctx.p, 'draw', 'draws')} ${cn(c)}.`); } else { pl.trash.push(c); pushChild(s, [{ op: 'might', n: 2, t: self }], fr.ctx); } };
HAND['party-favors'] = { ab: [spell([{ op: 'partyFavors' }])] };
OP.partyFavors = (s, fr) => { const q = 1 - fr.ctx.p; const v = askObj(s, fr, ['cards', 'runes'], `${cn(fr.ctx.card)}: choose Cards or Runes`, 0, q); if (v === WAIT) return WAIT; for (const x of [fr.ctx.p, q]) { if (v === 'runes') { channel(s, x, 1, true); } else drawN(s, x, 1); } log(`${P(q)} ${vb(q, 'choose', 'chooses')} ${v}.`); };
HAND['perched-grimwyrm'] = { ab: [st('onlyConqueredBf')] };
HAND['pillaged-armory'] = { kw: { deploy: true }, ab: [trig('played', [{ op: 'buff', t: one(fu) }]), trig('youConquer', [{ op: 'buff', t: one(fu) }], { here: true })] };
HAND['piltovan-forge'] = { ab: [st('firstGearAbLess')] };
HAND['piltovan-guidebot'] = { ab: [trig('youPlay', [{ op: 'may', then: [{ op: 'guidebot' }] }], { f: { type: 'c' } })] };
OP.guidebot = (s, fr) => { const me = ob(s, fr.ctx.self); const c = fr.ctx.trig && fr.ctx.trig.cid; if (me && c) { me.setBase = C[c].e || 0; log(`${cn(me.cid)}'s base might becomes ${me.setBase} this turn.`); } };
HAND['platewyrm-egg'] = { keep: [], plus: [st('enterEx'), act({ ex: true }, [{ op: 'add', res: { e: 1, pw: [] }, empRes: { e: 2, pw: [] } }], { speed: 'R' })] };
HAND['poppy-defender-of-the-meek'] = { plus: [st('extraCost', { cost: { e: -3, pw: [], xp: 3 } })] };
HAND['portal-rescue'] = { plus: [spell([{ op: 'choose', t: one(fu) }, { op: 'blink' }])] };
HAND['primordial-roar'] = { ab: [spell([{ op: 'showOff' }, { op: 'deal', n: { ref: 'saved' }, t: one({ type: 'u' }) }])] };
OP.showOff = (s, fr) => {
  const p = fr.ctx.p, pl = s.players[p]; const opts = unitsOf(s, p).map((u) => u.id).concat(pl.hand.map((c, i) => C[c].t === 'u' ? 'H' + i : null).filter(Boolean));
  if (!opts.length) { fr.ctx.saved = 0; return; }
  const v = askObj(s, fr, opts, `${cn(fr.ctx.card)}: show off a unit`, 1); if (v === WAIT) return WAIT;
  fr.ctx.saved = typeof v === 'number' ? might(s, ob(s, v)) : C[pl.hand[+v.slice(1)]].m || 0; log(`${P(p)} ${vb(p, 'show', 'shows')} off a ${fr.ctx.saved}-might unit.`);
};
HAND['profiteer'] = { ab: [trig('played', [{ op: 'may', then: [{ op: 'profiteer' }] }])] };
OP.profiteer = (s, fr) => {
  const p = fr.ctx.p, pl = s.players[p]; const from = s.objs.filter((o) => o.ctrl === p && o.emp > 0).map((o) => o.id).concat(pl.legEmp ? ['L'] : []); if (!from.length) return;
  if (fr.ctx._pf == null) { const v = askObj(s, fr, from, `${cn(fr.ctx.card)}: disempower what?`, -1); if (v === WAIT) return WAIT; fr.ctx._pf = v; }
  const to = s.objs.filter((o) => o.ctrl === p && (o.k === 'u' || o.k === 'g') && !(o.emp > 0) && o.id !== fr.ctx._pf).map((o) => o.id).concat(!pl.legEmp && fr.ctx._pf !== 'L' ? ['L'] : []); if (!to.length) { delete fr.ctx._pf; return; }
  const v = askObj(s, fr, to, `${cn(fr.ctx.card)}: empower what?`, 1); if (v === WAIT) return WAIT;
  const f = fr.ctx._pf; delete fr.ctx._pf; if (f === 'L') pl.legEmp = 0; else if (ob(s, f)) ob(s, f).emp = 0;
  if (v === 'L') { pl.legEmp = 1; emit(s, 'becomeEmp', { legend: p, byP: p }); } else if (ob(s, v)) empowerObj(s, ob(s, v), p);
};
HAND['promising-future'] = { ab: [spell([{ op: 'promisingFuture' }])] };
OP.promisingFuture = (s, fr) => {
  const ctx = fr.ctx; ctx._pr2 = ctx._pr2 || {};
  for (const q of [ctx.p, 1 - ctx.p]) {
    if (ctx._pr2[q] !== undefined) continue; const pl = s.players[q]; const look = pl.deck.slice(0, 5);
    if (!look.length) { ctx._pr2[q] = null; continue; }
    let c; const a = takeAns(fr);
    if (!a) { if (!pl.human) c = look.slice().sort((x, y) => cardVal(y) - cardVal(x))[0]; else return needChoice(s, fr, 'stack', { p: q, cards: [...new Set(look)], why: `${cn(ctx.card)}: choose a card to play` }); } else c = a.v;
    pl.deck.splice(0, look.length); const rest = look.slice(); rest.splice(rest.indexOf(c), 1); pl.deck.push(...rest); ctx._pr2[q] = c;
  }
  for (const q of [1 - ctx.p, ctx.p]) { const c = ctx._pr2[q]; if (!c) continue; const cost = { e: 0, pw: C[c].p || [] }; if (['u', 'g', 's'].includes(C[c].t) && canPay(s, q, cost)) { pay(s, q, cost); playFree(s, q, c, {}); } else { s.players[q].hand.push(c); } }
  delete ctx._pr2;
};
HAND['qiyana-victorious'] = { plus: [trig('conquer', [{ op: 'oneOf', opts: [[{ op: 'draw', n: 1 }], [{ op: 'channel', n: 1, ex: true }]] }])] };
HAND['rabadons-deathcrown'] = { eqPlus: [st('bonusDmg', { n: 3 })] };
HAND['rage-amplifier'] = { plus: [st('aura', { n: 1, f: fu }), st('aura', { n: 1, f: fu, gate: { emp: true } })] };
HAND['raging-firebrand'] = { ab: [trig('played', [{ op: 'nextCardLess', e: 5, type: 's' }])] };
HAND['rakelstake'] = { ab: [trig('anyPlay', [{ op: 'predict', n: 1 }], { f: { unitOrGear: true }, here: true, firstHere: true })] };
HAND['rally-the-troops'] = { plus: [spell([{ op: 'delayTrig', on: 'delayedPlayed', eff: [{ op: 'buff', t: it }] }, { op: 'draw', n: 1 }])] };
HAND['rampage'] = { plus: [st('extraCost', { cost: { e: 0, pw: ['body'] } }), spell([{ op: 'choose', t: one(fu) }, { op: 'choose', slot: 'b', t: one(eu) }, { op: 'if', cond: { c: 'paidExtra' }, then: [{ op: 'mightFirst', n: 2 }] }, { op: 'fight' }])] };
OP.mightFirst = (s, fr, op) => { const o = ob(s, firstIt(fr.ctx)); if (o) { o.mod += op.n; log(`${cn(o.cid)} gets +${op.n} might this turn.`); } };
HAND['ravenbloom-conservatory'] = { ab: [trig('youDefend', [{ op: 'look', n: 1, reveal: true }, { op: 'lookTopIf', type: 's' }, { op: 'lookRest', to: 'deck' }])] };
HAND['ravenbloom-prefect'] = { ab: [trig('oppPlay', [{ op: 'may', then: [{ op: 'banishTrigObj' }, { op: 'banish', t: self }] }], { f: { type: 'g' } })] };
OP.banishTrigObj = (s, fr) => { const o = ob(s, fr.ctx.trig && fr.ctx.trig.obj); if (o) { log(`${cn(o.cid)} is banished.`); removeObj(s, o, 'banish'); } };
HAND['ravenborn-tome'] = { ab: [act({ ex: true }, [{ op: 'turnFxP', k: 'spellBonus', v: 1 }])] };
HAND['rebuttal'] = { plus: [spell([{ op: 'choose', t: one({ type: 's', costLE: 4 }) }, { op: 'payOpt', cost: { e: 0, pw: ['any'] }, then: [{ op: 'stealSpell' }] }, { op: 'ifNot', then: [{ op: 'counter', t: it }] }])] };
OP.ifNot = (s, fr, op) => { if (!fr.ctx.did) pushChild(s, op.then, fr.ctx); };
HAND['reckless-innovator'] = { plus: [trig('becomeEx', [{ op: 'oneOf', opts: [[{ op: 'gold', n: 1 }], [{ op: 'payOpt', cost: { e: 0, pw: ['chaos'] }, then: [{ op: 'draw', n: 1 }] }]] }])] };
HAND['reckoners-arena'] = { ab: [trig('youHold', [{ op: 'conquerEffectsHere' }])] };
OP.conquerEffectsHere = (s, fr) => { const i = fr.ctx.here; if (i == null) return; for (const u of unitsAt(s, i, fr.ctx.p)) emit(s, 'conquer', { obj: u.id, bf: i, p: fr.ctx.p, excess: 0 }); };
HAND['red-brambleback'] = { plus: [st('conquerTwice')] };
HAND['reinforce'] = { ab: [spell([{ op: 'look', n: 5 }, { op: 'reinforce', less: 5 }, { op: 'lookRest', to: 'deck' }])] };
OP.reinforce = (s, fr, op) => {
  const p = fr.ctx.p; const cost = (c) => ({ e: Math.max(0, (C[c].e || 0) - op.less), pw: C[c].p || [] });
  const types = op.any ? ['u', 'g', 's'] : op.types || ['u'];
  const ok = (fr.ctx.look || []).filter((c) => types.includes(C[c].t) && canPay(s, p, cost(c), { type: C[c].t }));
  const c = pickCard(s, fr, ok, `${cn(fr.ctx.card)}: play a unit for ${op.less} less`, true); if (c === WAIT) return WAIT; if (c == null) return;
  fr.ctx.look.splice(fr.ctx.look.indexOf(c), 1); pay(s, p, cost(c), null, { type: C[c].t }); const o = playFree(s, p, c, {});
  if (op.thenEmp && o && o.id != null && s.objs.includes(o)) { fr.ctx.it = [o.id]; pushChild(s, [{ op: 'may', then: [{ op: 'empower', t: it }] }], fr.ctx); }
};
HAND['reksai-breacher'] = { plus: [st('accelNotHand')] };
HAND['reksai-swarm-queen'] = { ab: [trig('attack', [{ op: 'may', then: [{ op: 'look', n: 2, reveal: true }, { op: 'playFromLook', here: true }, { op: 'lookRest', to: 'deck' }] }])] };
HAND['relentless-pursuit'] = { ab: [spell([{ op: 'move', t: one(fu), to: 'any' }, { op: 'maybeAttach' }, { op: 'grantTrig', a: trig('conquer', [{ op: 'may', then: [{ op: 'move', t: self, to: 'base' }] }]) }])] };
OP.maybeAttach = (s, fr) => { const u = ob(s, firstIt(fr.ctx)); if (!u) return; const eqs = s.objs.filter((g) => isEq(g.cid) && g.ctrl === u.ctrl && g.att !== u.id).map((g) => g.id); if (!eqs.length) return; const g = askObj(s, fr, eqs.concat(['none']), `${cn(fr.ctx.card)}: attach an Equipment to ${cn(u.cid)}?`, 1); if (g === WAIT) return WAIT; if (g !== 'none' && ob(s, g)) attach(s, ob(s, g), u); };
OP.grantTrig = (s, fr, op) => each(s, fr.ctx.it || [], (o) => { o.grantTrig = (o.grantTrig || []).concat([op.a]); o.grantTrigTemp = !op.perm; });
HAND['rell-magnetic'] = { plus: [trig('attack', [{ op: 'playEqFree', maxE: 2 }])] };
OP.playEqFree = (s, fr, op) => { const p = fr.ctx.p, pl = s.players[p]; const me = ob(s, fr.ctx.self); const c = pickCard(s, fr, pl.hand.filter((x) => isEq(x) && (C[x].e || 0) <= op.maxE), `${cn(fr.ctx.card)}: play an Equipment for free and attach it`, true); if (c === WAIT) return WAIT; if (c == null) return; pl.hand.splice(pl.hand.indexOf(c), 1); const g = playFree(s, p, c, {}); if (g && me) attach(s, g, me); };
HAND['renata-glasc-mastermind'] = { ab: [act({ e: 1, pw: ['mind'] }, [{ op: 'draw', n: 1 }], { limit: { atBf: true } }), act({ e: 4, pw: ['mind', 'mind', 'mind', 'mind'], ex: true }, [{ op: 'score', n: 1 }], { limit: { atBf: true } })] };
HAND['renekton-brute'] = { plus: [trig('mightReached', [{ op: 'empower', t: self }], { n: 10 })] };
HAND['repulse'] = { plus: [spell([{ op: 'choose', t: one({ type: 'u', who: 'friendly', where: 'bf' }) }, { op: 'repulse' }])] };
OP.repulse = (s, fr) => { const id = firstIt(fr.ctx); if (id == null) return; const x = s.chain.slice().reverse().find((c) => c.p !== fr.ctx.p && !c.countered && (c.chosen || []).includes(id) && !(c.chosen || []).some((o) => o !== id && ob(s, o) && ob(s, o).ctrl === fr.ctx.p)); if (x) { x.countered = true; log(`${cn(x.cid)} is countered.`); } };
HAND['resonating-strike'] = { plus: [spell([{ op: 'chooseBf', mine: true }, { op: 'move', t: one({ type: 'u', who: 'friendly', notThere: true }), to: 'there' }, { op: 'might', n: 2, t: it }])] };
HAND['resplendent-rostrum'] = { ab: [act({ ex: true }, [{ op: 'draw', n: 1 }, { op: 'channel', n: 1, ex: true }]), trig('becomeEx', [{ op: 'might', n: 3, t: one(fu) }])] };
HAND['revna-the-lorekeeper'] = { plus: [trig('youPlay', [{ op: 'ready', t: self }], { f: { type: 's', costGE: 4 } })] };

/* ---------------- R–S ---------------- */
HAND['rift-herald'] = { ab: [trig('move', [{ op: 'look', n: 3 }, { op: 'lookTake', type: 'unit', may: true }, { op: 'lookRest', to: 'deck' }], { toBf: true }), trig('die', [{ op: 'playFromHandIgnoreE', type: 'u' }])] };
OP.playFromHandIgnoreE = (s, fr, op) => { const p = fr.ctx.p, pl = s.players[p]; const ok = pl.hand.filter((c) => C[c].t === op.type && canPay(s, p, { e: 0, pw: C[c].p || [] })); const c = pickCard(s, fr, ok, `${cn(fr.ctx.card)}: play a unit from hand to base (pay only its Power)`, true); if (c === WAIT) return WAIT; if (c == null) return; pay(s, p, { e: 0, pw: C[c].p || [] }); pl.hand.splice(pl.hand.indexOf(c), 1); playFree(s, p, c, { src: 'hand' }); };
HAND['riposte'] = { plus: [spell([{ op: 'choose', t: one(fu) }, { op: 'choose', slot: 'b', t: one({ type: 's' }) }, { op: 'riposte' }])] };
OP.riposte = (s, fr) => { const [uid, sid] = fr.ctx.it || []; const x = s.chain.find((c) => 'S' + c.id === sid); if (x && !x.countered && !staticsOn(s, 'uncounterable', x.p)) { x.countered = true; log(`${cn(x.cid)} is countered.`); } const u = ob(s, uid); if (u && x) { u.mod += C[x.cid].e || 0; log(`${cn(u.cid)} gets +${C[x.cid].e || 0} might this turn.`); } };
HAND['rippers-bay'] = { ab: [trig('returnedHere', [{ op: 'payOpt', cost: { e: 1, pw: [] }, then: [{ op: 'channel', n: 1, ex: true }] }])] };
HAND['risen-altar'] = { ab: [st('empLessHere')] };
HAND['riven-shattered'] = { plus: [trig('attack', [{ op: 'deal', n: { ref: 'mult', k: 2, per: { count: 'attachedEq' } }, t: one({ type: 'u', who: 'enemy', where: 'here' }) }])] };
HAND['royal-entourage'] = { ab: [trig('played', [{ op: 'oneOf', opts: [[{ op: 'readyLegend' }], [{ op: 'exhaustOppLegend' }]] }])] };
OP.exhaustOppLegend = (s, fr) => { const q = 1 - fr.ctx.p; s.players[q].legEx = true; log(`${Pos(q)} legend is exhausted.`); };
HAND['rumble-hotheaded'] = { plus: [trig('conquer', [{ op: 'may', then: [{ op: 'choose', t: one({ type: 'u', who: 'friendly', other: true }) }, { op: 'rumbleMech' }] }])] };
OP.rumbleMech = (s, fr) => {
  const p = fr.ctx.p, pl = s.players[p];
  if (fr.ctx._rm == null) { const u = ob(s, firstIt(fr.ctx)); if (!u) return; fr.ctx._rm = might(s, u); removeObj(s, u, 'recycle'); log(`${cn(u.cid)} is recycled.`); }
  const cost = (c) => ({ e: Math.max(0, (C[c].e || 0) - fr.ctx._rm), pw: C[c].p || [] });
  const ok = pl.trash.filter((c) => C[c].t === 'u' && (C[c].tags || []).includes('Mech') && canPay(s, p, cost(c), { type: 'u' }));
  const c = pickCard(s, fr, ok, `${cn(fr.ctx.card)}: play a Mech from your trash`, true); if (c === WAIT) return WAIT; const m = fr.ctx._rm; delete fr.ctx._rm; if (c == null) return;
  pay(s, p, cost(c), null, { type: 'u' }); pl.trash.splice(pl.trash.indexOf(c), 1); playFree(s, p, c, {}); void m;
};
HAND['runeblade-anvil'] = { ab: [trig('played', [{ op: 'banishTopPlayable' }]), trig('leavesSelf', [{ op: 'banishTopPlayable' }]), act({ e: 2, pw: ['chaos'], ex: true }, [{ op: 'kill', t: self }])] };
HAND['ruthless-strike'] = { ab: [st('extraCost', { cost: { e: 0, pw: [], discard: 1 } }), spell([{ op: 'deal', n: { ref: 'ifCond', cond: { c: 'paidExtra' }, a: 3, b: 5 }, t: one({ type: 'u', where: 'bf' }) }])] };
HAND['sabotage'] = { ab: [spell([{ op: 'pickFromOppHand', notType: 'u', act: 'recycle' }])] };
HAND['sacred-protector'] = { ab: [st('noCombatDmg', { cond: { c: 'friendsHere', eq: 1, not: true } })] };
HAND['sacrifice'] = { plus: [st('sacCost', { mandatory: true, mighty: true })] };
HAND['safety-inspector'] = { ab: [st('extraCost', { cost: { e: 0, pw: [], xp: 3 } }), trig('played', [{ op: 'if', cond: { c: 'paidExtra' }, then: [{ op: 'eachPlayer', only: 'opp', eff: [{ op: 'kill', t: one(fu) }] }], else: [{ op: 'eachPlayer', eff: [{ op: 'kill', t: one(fu) }] }] }])] };
const _ep = OP.eachPlayer; OP.eachPlayer = (s, fr, op) => { if (op.only === 'opp') { pushChild(s, op.eff, Object.assign({}, fr.ctx, { p: 1 - fr.ctx.p, it: [], picks: [], pi: 0 })); return; } return _ep(s, fr, op); };
HAND['sanction'] = { plus: [spell([{ op: 'oneOf', opts: [[{ op: 'empower', t: one({ type: 'u' }) }, { op: 'delayTrig', on: 'anyEndTurn', once: true, eff: [{ op: 'disempower', t: it }] }], [{ op: 'disempower', t: one({ type: 'u', emp: true }) }, { op: 'delayTrig', on: 'anyEndTurn', once: true, eff: [{ op: 'empower', t: it }] }]] }])] };
HAND['sandstone-chimera'] = { ab: [st('channelOnlyOne')] };
HAND['sandswept-tomb'] = { ab: [st('spellLessHere')] };
HAND['satchel-charge'] = { plus: [spell([{ op: 'move', t: one(fu), to: 'any' }, { op: 'bomb' }])] };
HAND['scrapheap'] = { ab: [trig(['played', 'die', 'discarded'], [{ op: 'draw', n: 1 }])] };
HAND['scuttle-crab'] = { plus: [trig('die', [{ op: 'revealOpp' }, { op: 'xp', n: 1 }])] };
HAND['seraphine-not-alone'] = { ab: [trig(['played', 'becomeEx'], [{ op: 'token', name: 'Recruit', m: 1, n: 1, where: 'base' }]), st('might', { n: 1, per: { count: 'control', f: { type: 'u', who: 'friendly', ex: true, other: true } } })] };
HAND['shadow'] = { ab: [st('enterReady', { cond: { c: 'playedToBf' } }), act({ e: 1, pw: ['any'], ex: true }, [{ op: 'stun', t: one({ type: 'u', who: 'enemy', attacking: true, where: 'here' }) }], { speed: 'A' })] };
HAND['shadow-dash'] = { plus: [spell([{ op: 'chooseBf', where: 'mineUnits' }, { op: 'move', t: one({ type: 'u', who: 'enemy', notThere: true }), to: 'there' }, { op: 'if', cond: { c: 'unitsThereEq', n: 2 }, then: [{ op: 'might', n: 1, t: { q: 'each', f: { type: 'u', who: 'friendly', where: 'there' } } }] }])] };
HAND['shadow-order-disciple'] = { ab: [trig('move', [{ op: 'may', then: [{ op: 'burn', n: 1 }, { op: 'might', n: 1, t: self }] }])] };
HAND['shadow-watcher'] = { ab: [st('enterReady', { cond: { c: 'diedInBeginning' } })] };
HAND['shadows-of-the-past'] = { kw: {}, ab: [spell([{ op: 'choose', t: { q: 'upto', n: 2, f: { zone: 'trash', type: 'u', who: 'any', anyTrash: true } } }, { op: 'trashToOwnerHand' }])] };
OP.trashToOwnerHand = (s, fr) => { for (const t of fr.ctx.it || []) { if (typeof t !== 'string' || t[0] !== 'T') continue; const [q, cid] = t.slice(1).split(':'); const pl = s.players[+q]; const i = pl.trash.indexOf(cid); if (i >= 0) { pl.trash.splice(i, 1); pl.hand.push(cid); log(`${cn(cid)} returns to ${Pos(+q)} hand.`); } } };
HAND['shady-spectacles'] = { plus: [trig('gearAttached', [{ op: 'spectacles' }])] };
OP.spectacles = (s, fr) => { const g = ob(s, fr.ctx.self); if (!g || g.att == null) return; const host = ob(s, g.att); const ids = unitsOf(s, host.ctrl).filter((u) => u !== host).map((u) => u.id); if (!ids.length) return; const v = askObj(s, fr, ids, `${cn(g.cid)}: ${cn(host.cid)} becomes a copy of which unit?`, 1); if (v === WAIT) return WAIT; const src = ob(s, v); if (src) { host.copyOf = src.copyOf || src.cid; host.copyBy = g.id; log(`${cn(host.cid)} becomes a copy of ${cn(host.copyOf)}.`); } };
HAND['shakedown'] = { plus: [spell([{ op: 'choose', t: one(eu) }, { op: 'shakedown' }])] };
OP.shakedown = (s, fr) => { const o = ob(s, firstIt(fr.ctx)); if (!o) return; const q = o.ctrl; const v = askObj(s, fr, ['draw', 'dmg'], `${cn(fr.ctx.card)}: let the caster draw 2, or ${cn(o.cid)} takes 6?`, 0, q); if (v === WAIT) return WAIT; if (v === 'draw') drawN(s, fr.ctx.p, 2); else { log(`${cn(fr.ctx.card)} deals 6 to ${cn(o.cid)}.`); damage(s, o, 6 + bonusDmg(s, fr.ctx, o), { spell: true, p: fr.ctx.p }); } };
HAND['shard-of-undoing'] = { ab: [trig('unitDies', [{ op: 'if', cond: { c: 'inBeginning' }, then: [{ op: 'eachPlayer', only: 'opp', eff: [{ op: 'kill', t: one(fu) }] }] }], { f: { who: 'friendly' }, once: 'turn' })] };
HAND['shimmering-swimmer'] = { ab: [st('extraCost', { cost: { e: 0, pw: [], killFriendly: true } }), trig('played', [{ op: 'if', cond: { c: 'paidExtra' }, then: [{ op: 'deal', n: 2, t: one({ type: 'u' }) }] }])] };
HAND['shock-blast'] = { plus: [st('costLess', { e: 2, cond: { c: 'control', f: { who: 'friendly', emp: true } } })] };
HAND['siphon-power'] = { plus: [spell([{ op: 'chooseBf' }, { op: 'might', n: 1, t: { q: 'each', f: { type: 'u', who: 'friendly', where: 'there' } } }, { op: 'might', n: -1, min1: true, t: { q: 'each', f: { type: 'u', who: 'enemy', where: 'there' } } }])] };
HAND['siphoning-strike'] = { ab: [spell([{ op: 'deal', n: { ref: 'ifCond', cond: { c: 'runes', ge: 7 }, a: 4, b: 7 }, t: one({ type: 'u', where: 'bf' }) }, { op: 'delayTrig', on: 'delayedDies', once: true, eff: [{ op: 'channel', n: 1, ex: true }] }])] };
HAND['sirens-song'] = { plus: [spell([{ op: 'move', t: one({ type: 'u', who: 'enemy', movedThisTurn: true }), to: 'any' }])] };
HAND['sivir-ambitious'] = { plus: [trig('conquer', [{ op: 'if', cond: { c: 'afterAttackExcess', n: 5 }, then: [{ op: 'may', then: [{ op: 'deal', n: { ref: 'excess' }, t: one(eu) }] }] }])] };
HAND['sky-splitter'] = { plus: [st('costLess', { e: 1, per: { count: 'maxMight' } })] };
HAND['skyfall-of-areion'] = { eqPlus: [st('holdIsConquer')] };
HAND['smite'] = { plus: [spell([{ op: 'choose', t: one({ type: 'u', where: 'bf' }) }, { op: 'banishOnDeath' }, { op: 'deal', n: 3, t: it }])] };
OP.banishOnDeath = (s, fr) => each(s, fr.ctx.it || [], (o) => { o.banishOnDeath = true; });
HAND['smoke-and-mirrors'] = { plus: [spell([{ op: 'choose', t: one(fu) }, { op: 'choose', slot: 'b', t: { q: 'one', n: 1, f: { type: 'u', who: 'friendly', notItLoc: true }, notIt: true } }, { op: 'swapIfTemp' }, { op: 'draw', n: 1 }])] };
OP.swapIfTemp = (s, fr) => { const [a, b] = (fr.ctx.it || []).map((id) => ob(s, id)); if (!a || !b || a.loc === b.loc) return; if (!(a.temp || b.temp || kwOf(s, a).temporary || kwOf(s, b).temporary)) return; const la = a.loc, lb = b.loc; moveUnit(s, a, lb, { byEffect: true, byP: fr.ctx.p }); moveUnit(s, b, la, { byEffect: true, byP: fr.ctx.p }); log(`${cn(a.cid)} and ${cn(b.cid)} swap places.`); };
HAND['sona-harmonious'] = { ab: [trig('endTurn', [{ op: 'if', cond: { c: 'selfAtBf' }, then: [{ op: 'readyRunes', n: 4 }] }])] };
HAND['soraka-wanderer'] = { kw: { backline: true }, ab: [st('sorakaSave')] };
HAND['soul-sword'] = { eqPlus: [st('eqMight', { n: 1, gate: { level: 3 } })] };
HAND['soulgorger'] = { ab: [trig('played', [{ op: 'playFromTrashIgnoreE', type: 'u' }])] };
OP.playFromTrashIgnoreE = (s, fr, op) => { const p = fr.ctx.p, pl = s.players[p]; const ok = pl.trash.filter((c) => C[c].t === op.type && canPay(s, p, { e: 0, pw: C[c].p || [] })); const c = pickCard(s, fr, ok, `${cn(fr.ctx.card)}: play a unit from your trash (pay only its Power)`, true); if (c === WAIT) return WAIT; if (c == null) return; pay(s, p, { e: 0, pw: C[c].p || [] }); pl.trash.splice(pl.trash.indexOf(c), 1); playFree(s, p, c, {}); };
HAND['spectral-matron'] = { ab: [trig('played', [{ op: 'playFromTrashFree', type: 'u', maxE: 3, maxP: 1 }])] };
HAND['spoils-of-war'] = { plus: [st('costLess', { e: 2, cond: { c: 'enemyDied' } })] };
HAND['sprite-fountain'] = { plus: [trig('die', [{ op: 'token', name: 'Sprite', m: 3, n: 1, ready: true, kw: { temporary: true }, where: 'base' }])] };
HAND['stalking-wolf'] = { plus: [st('sacCost', { mandatory: true, tagAny: ['Bird', 'Cat', 'Dog', 'Poro'], toSacLoc: true })] };
HAND['stalwart-goatherd'] = { plus: [trig('played', [{ op: 'may', then: [{ op: 'kill', t: one({ type: 'g', costLE: 4 }) }] }])] };
HAND['stand-united'] = { plus: [spell([{ op: 'buff', t: one(fu) }, { op: 'turnFx', k: 'buffBonus' }])] };
HAND['star-spring'] = { ab: [trig('anyPlay', [{ op: 'may', then: [{ op: 'move', t: one({ type: 'u', who: 'friendly', where: 'here', notTrig: true }), to: 'base' }] }], { f: { type: 'u', token: false }, here: true, firstHere: true })] };
HAND['star-crossed'] = { plus: [spell([{ op: 'return', t: one(fu) }, { op: 'return', t: one(eu) }])] };
HAND['stare-down'] = { ab: [spell([{ op: 'choose', t: one(fu) }, { op: 'chooseBf' }, { op: 'stareDown' }, { op: 'xp', n: 1 }])] };
OP.stareDown = (s, fr) => { const u = ob(s, firstIt(fr.ctx)); const i = fr.ctx.there; if (!u || i == null) return; const m = might(s, u); for (const e of unitsAt(s, i).filter((o) => o.ctrl !== fr.ctx.p && might(s, o) < m)) { log(`${cn(e.cid)} moves to base.`); moveUnit(s, e, 'base', { byEffect: true, byP: fr.ctx.p }); } };
HAND['stargazer'] = { ab: [st('flowLess')] };
HAND['steadfast-outrider'] = { plus: [st('might', { n: 2, cond: { c: 'friendsGearHere', ge: 2 } })] };
HAND['stealthy-pursuer'] = { ab: [trig('friendMovesFromMe', [{ op: 'may', then: [{ op: 'move', t: self, to: 'trigTo' }] }])] };
HAND['storm-raptor'] = { plus: [trig('unitDies', [{ op: 'draw', n: 1 }], { f: { who: 'enemy', stunned: true, where: 'here' } })] };
HAND['strike-down'] = { ab: [spell([{ op: 'choose', t: one({ type: 'u', who: 'friendly', equipped: true }) }, { op: 'choose', slot: 'b', t: one(eu) }, { op: 'firstHitsSecond' }, { op: 'detachOne' }])] };
OP.firstHitsSecond = (s, fr) => { const [a, b] = (fr.ctx.it || []).map((id) => ob(s, id)); if (!a || !b) return; const n = might(s, a); log(`${cn(a.cid)} deals ${n} to ${cn(b.cid)}.`); damage(s, b, n, { p: fr.ctx.p, spell: true }); };
OP.detachOne = (s, fr) => { const a = ob(s, firstIt(fr.ctx)); if (!a) return; const g = eqOf(s, a)[0]; if (g) { g.att = null; log(`${cn(g.cid)} is detached.`); } };
HAND['sudden-storm'] = { plus: [spell([{ op: 'choose', t: one({ type: 'u', where: 'bf' }) }, { op: 'deal', n: { ref: 'ifCond', cond: { c: 'itAttacking' }, a: 2, b: 4 }, t: it }])] };
HAND['sun-disc'] = { ab: [act({ ex: true }, [{ op: 'if', cond: { c: 'legion' }, then: [{ op: 'turnFxP', k: 'nextReady' }] }])] };
HAND['super-mega-death-rocket'] = { plus: [trig('youConquer', [{ op: 'payOpt', cost: { e: 0, pw: [] }, discard: 1, then: [{ op: 'trashSelfToHand' }] }], { zone: 'trash' })] };
OP.trashSelfToHand = (s, fr) => { const pl = s.players[fr.ctx.p]; const i = pl.trash.lastIndexOf(fr.ctx.card); if (i >= 0) { pl.trash.splice(i, 1); pl.hand.push(fr.ctx.card); log(`${cn(fr.ctx.card)} returns to ${Pos(fr.ctx.p)} hand.`); } };
HAND['svellsongur'] = { plus: [], manual: 'Copying the equipped unit\'s text onto the Equipment is not automated.' };

/* ---------------- S–Z ---------------- */
HAND['swain-visionary'] = { plus: [trig('conquer', [{ op: 'if', cond: { c: 'playedTrio' }, then: [{ op: 'score', n: 1 }] }])] };
HAND['switcheroo'] = { plus: [spell([{ op: 'choose', t: one({ type: 'u', where: 'bf' }) }, { op: 'choose', slot: 'b', t: { q: 'one', n: 1, f: { type: 'u', where: 'itloc' }, notIt: true } }, { op: 'swapMight' }])] };
OP.swapMight = (s, fr) => { const [a, b] = (fr.ctx.it || []).map((id) => ob(s, id)); if (!a || !b) return; const ma = might(s, a), mb = might(s, b); a.mod += mb - ma; b.mod += ma - mb; log(`${cn(a.cid)} and ${cn(b.cid)} swap might (${mb} / ${ma}).`); checkDeaths(s); };
HAND['symbol-of-the-solari'] = { ab: [st('tieRecallAll')] };
HAND['syndra-transcendent'] = { ab: [st('sdRepeat')] };
HAND['tactical-retreat'] = { plus: [spell([{ op: 'choose', t: one(fu) }, { op: 'addSave' }])] };
HAND['tail-cloaked-matriarch'] = { plus: [trig('becomeEmp', [{ op: 'playFromTrashFree', type: 'u', maxE: 3, maxP: 1 }])] };
HAND['teemo-strategist'] = { plus: [trig(['defend', 'playedHidden'], [{ op: 'look', n: 5, reveal: true }, { op: 'teemo' }, { op: 'lookRest', to: 'deck' }])] };
OP.teemo = (s, fr) => { const k = (fr.ctx.look || []).filter((c) => C[c].kw.hidden).length; if (!k) return; log(`${cn(fr.ctx.card)} finds ${k} card${k > 1 ? 's' : ''} with [Hidden].`); pushChild(s, Array(k).fill({ op: 'deal', n: 1, t: one({ type: 'u', who: 'enemy', where: 'here' }) }), Object.assign({}, fr.ctx, { it: [] })); };
HAND['temporal-breach'] = { plus: [spell([{ op: 'choose', t: one({ type: 'u' }) }, { op: 'blink', same: true }])] };
HAND['temporal-portal'] = { ab: [act({ pw: ['any'], ex: true }, [{ op: 'turnFxP', k: 'nextRepeat' }])] };
HAND['the-academy'] = { ab: [trig('youHold', [{ op: 'turnFxP', k: 'nextRepeat' }])] };
HAND['the-candlelit-sanctum'] = { ab: [trig('youConquer', [{ op: 'predict', n: 2 }])] };
HAND['the-dreaming-tree'] = { ab: [trig('chosenHere', [{ op: 'oncePerPlayer', key: 'dreaming', then: [{ op: 'draw', n: 1 }] }])] };
OP.oncePerPlayer = (s, fr, op) => { const k = op.key + fr.ctx.p; if (s.onceUsed[k]) return; s.onceUsed[k] = true; pushChild(s, op.then, fr.ctx); };
HAND['the-grand-plaza'] = { ab: [trig('youHold', [{ op: 'if', cond: { c: 'unitsHereGE', n: 7 }, then: [{ op: 'winGame' }] }])] };
HAND['the-harrowing'] = { ab: [spell([{ op: 'playFromTrashIgnoreE', type: 'u' }])] };
HAND['the-list'] = { ab: [trig('played', [{ op: 'nameTag' }]), act({ ex: true }, [{ op: 'might', n: -2, t: one({ type: 'u', tagNamed: true }) }])] };
OP.nameTag = (s, fr) => {
  const me = ob(s, fr.ctx.self); if (!me) return; const q = 1 - fr.ctx.p; const pl = s.players[q];
  const tags = [...new Set(pl.deck.concat(pl.hand, pl.trash, units(s).filter((u) => u.ctrl === q).map((u) => u.cid)).flatMap((c) => (C[c] && C[c].tags) || []))].sort();
  if (!tags.length) return;
  const a = takeAns(fr); if (!a && s.players[fr.ctx.p].human) return needChoice(s, fr, 'tag', { opts: tags, why: `${cn(me.cid)}: name a tag` });
  me.namedTag = a ? a.v : bestTag(s, q, tags); log(`${cn(me.cid)} names ${me.namedTag}.`);
};
HAND['the-zero-drive'] = { plus: [act({ e: 3, pw: ['mind'], banishSelf: true }, [{ op: 'zeroDrive' }], { limit: { unattached: true } })], eqPlus: [trig('die', [{ op: 'zeroBanish' }])] };
OP.zeroBanish = (s, fr) => { const sn = fr.ctx.snap; if (!sn) return; const pl = s.players[sn.owner]; const i = pl.trash.lastIndexOf(sn.cid); if (i < 0) return; pl.trash.splice(i, 1); pl.banished.push(sn.cid); const g = s.objs.find((o) => o.cid === 'the-zero-drive' && o.ctrl === fr.ctx.p); if (g) g.pile = (g.pile || []).concat([sn.cid]); log(`${cn(sn.cid)} is banished with The Zero Drive.`); };
OP.zeroDrive = (s, fr) => { const g = fr.ctx.snapPile || []; for (const c of g) { for (const pl of s.players) { const i = pl.banished.indexOf(c); if (i >= 0) { pl.banished.splice(i, 1); break; } } playFree(s, fr.ctx.p, c, {}); } };
HAND['threshold-of-the-gray'] = { ab: [trig('combatHere', [{ op: 'addBoth', e: 1 }])] };
OP.addBoth = (s, fr, op) => { for (const p of [0, 1]) for (let i = 0; i < op.e; i++) s.players[p].pool.push({ e: 1 }); log('Both players add 1 energy.'); };
HAND['thrill-of-the-hunt'] = { plus: [spell([{ op: 'choose', t: one(fu) }, { op: 'blinkTo' }])] };
OP.blinkTo = (s, fr) => { const o = ob(s, firstIt(fr.ctx)); if (!o) return; const to = askDest(s, fr, [0, 1], `${cn(fr.ctx.card)}: play ${cn(o.cid)} to which battlefield?`); if (to === WAIT) return WAIT; const cid = o.cid, owner = o.owner; removeObj(s, o, null); if (!o.token) playFree(s, owner, cid, { to, anywhere: true }); };
HAND['tideturner'] = { plus: [trig('played', [{ op: 'may', then: [{ op: 'choose', t: one({ type: 'u', who: 'friendly', other: true }) }, { op: 'azirSwap', noEq: true }] }])] };
HAND['time-warp'] = { kw: { banishAfter: true }, ab: [spell([{ op: 'extraTurn' }])] };
OP.extraTurn = (s, fr) => { s.extraTurn = fr.ctx.p; log(`${P(fr.ctx.p)} will take another turn after this one.`); };
HAND['tools-of-empire'] = { plus: [act({ ex: true }, [{ op: 'might', n: { ref: 'ifCond', cond: { c: 'selfEmp' }, a: 2, b: 4 }, t: one({ type: 'u' }) }])] };
HAND['tornado-warrior'] = { plus: [trig('played', [{ op: 'may', then: [{ op: 'empower', t: one({ type: 'ug', where: 'here' }) }, { op: 'delayTrig', on: 'anyEndTurn', once: true, eff: [{ op: 'disempower', t: it }] }] }], { fromHidden: true })] };
HAND['transpositionist'] = { ab: [act({ pw: ['chaos'], ex: true }, [{ op: 'choose', t: one(fu) }, { op: 'saveMightReturn' }, { op: 'playFromHandLess' }])] };
OP.saveMightReturn = (s, fr) => { const o = ob(s, firstIt(fr.ctx)); if (!o) return; fr.ctx.saved = might(s, o); returnToHand(s, o); };
OP.playFromHandLess = (s, fr) => { const p = fr.ctx.p, pl = s.players[p]; const ok = pl.hand.filter((c) => C[c].t === 'u' && (C[c].m || 0) < (fr.ctx.saved || 0)); const c = pickCard(s, fr, ok, `${cn(fr.ctx.card)}: play a unit with less might for free`, true); if (c === WAIT) return WAIT; if (c == null) return; pl.hand.splice(pl.hand.indexOf(c), 1); playFree(s, p, c, { src: 'hand' }); };
HAND['trapping-grounds'] = { ab: [trig('youConquer', [{ op: 'if', cond: { c: 'excessGE', n: 3 }, then: [{ op: 'token', name: 'Bird', m: 1, n: 1, kw: { deflect: 1 }, where: 'base' }] }])] };
HAND['tricksy-tentacles'] = { ab: [spell([{ op: 'moveTotal', max: 8 }])] };
OP.moveTotal = (s, fr, op) => {
  const ctx = fr.ctx;
  if (ctx._mt == null) {
    const ids = units(s).filter((o) => o.ctrl !== ctx.p && canBeChosen(s, o, ctx.p)).map((o) => o.id); if (!ids.length) return;
    let pick; const a = takeAns(fr);
    if (!a) { if (!s.players[ctx.p].human) { pick = []; let t = 0; for (const id of ids.sort((x, y) => might(s, ob(s, y)) - might(s, ob(s, x)))) { const m = might(s, ob(s, id)); if (t + m <= op.max) { pick.push(id); t += m; } } } else return needChoice(s, fr, 'sel', { opts: ids, n: 99, upto: true, why: `${cn(ctx.card)}: choose enemy units with total might ${op.max} or less`, pol: 0 }); } else pick = Array.isArray(a.v) ? a.v : [a.v];
    let t = 0; ctx._mt = []; for (const id of pick) { const o = ob(s, id); if (!o) continue; const m = might(s, o); if (t + m <= op.max) { ctx._mt.push(id); t += m; } }
  }
  const to = askDest(s, fr, ['base', 0, 1], `${cn(ctx.card)}: move them where?`); if (to === WAIT) return WAIT;
  each(s, ctx._mt, (o) => { if (o.loc !== to) { log(`${cn(o.cid)} moves to ${bfName(s, to)}.`); moveUnit(s, o, to, { byEffect: true, byP: ctx.p }); } }); delete ctx._mt;
};
HAND['trifarian-captain'] = { ab: [trig('played', [{ op: 'look', n: 4 }, { op: 'lookTakeF', maxE: 3, maxP: 1, types: ['u', 'g'] }, { op: 'lookRest', to: 'deck' }])] };
OP.lookTakeF = (s, fr, op) => { const ctx = fr.ctx; const ok = (ctx.look || []).filter((c) => op.types.includes(C[c].t) && (C[c].e || 0) <= op.maxE && (C[c].p || []).length <= op.maxP); const c = pickCard(s, fr, ok, `${cn(ctx.card)}: you may reveal one and draw it`, true); if (c === WAIT) return WAIT; if (c == null) return; ctx.look.splice(ctx.look.indexOf(c), 1); s.players[ctx.p].hand.push(c); ctx.took = c; log(`${P(ctx.p)} ${vb(ctx.p, 'reveal', 'reveals')} and ${vb(ctx.p, 'draw', 'draws')} ${cn(c)}.`); };
HAND['tryndamere-barbarian'] = { ab: [trig('conquer', [{ op: 'if', cond: { c: 'afterAttackExcess', n: 5 }, then: [{ op: 'score', n: 1 }] }])] };
HAND['twilight-shroud'] = { plus: [spell([{ op: 'might', n: 1, t: one(fu) }, { op: 'shroud' }])] };
OP.shroud = (s, fr) => each(s, fr.ctx.it || [], (o) => { o.shroud = true; });
HAND['twisted-fate-gambler'] = { ab: [trig('attack', [{ op: 'twistedFate' }])] };
OP.twistedFate = (s, fr) => {
  const pl = s.players[fr.ctx.p]; if (!pl.runeDeck.length) return; const d = pl.runeDeck.shift(); pl.runeDeck.push(d); log(`${cn(fr.ctx.card)} reveals a ${DOMS[d]} rune.`);
  const here = { type: 'u', who: 'enemy', where: 'here' };
  const eff = d === 'fury' ? [{ op: 'deal', n: 2, t: one(here) }, { op: 'deal', n: 1, t: { q: 'each', f: Object.assign({}, here) }, notIt: true }] : d === 'mind' ? [{ op: 'draw', n: 1 }] : d === 'order' ? [{ op: 'stun', t: one(eu) }] : [];
  if (d === 'fury') eff[1] = { op: 'dealOthers', n: 1, f: here };
  pushChild(s, eff, fr.ctx);
};
OP.dealOthers = (s, fr, op) => { const ex = fr.ctx.it || []; for (const o of s.objs.filter((x) => matchesF(s, x, op.f, Object.assign({ s }, fr.ctx)) && !ex.includes(x.id))) { log(`${cn(fr.ctx.card)} deals ${op.n} to ${cn(o.cid)}.`); damage(s, o, op.n + bonusDmg(s, fr.ctx, o), { p: fr.ctx.p }); } };
HAND['udyr-wildman'] = { ab: [act({ spendBuffSelf: true }, [{ op: 'oneOf', onceKey: 'udyr', opts: [[{ op: 'deal', n: 2, t: one({ type: 'u', where: 'bf' }) }], [{ op: 'stun', t: one({ type: 'u', where: 'bf' }) }], [{ op: 'ready', t: self }], [{ op: 'giveKw', kw: { ganking: true }, t: self }]] }])] };
HAND['undertitan'] = { plus: [st('revealAdd')] };
HAND['undying-legion'] = { ab: [st('trashPlay', { cost: { e: 3, pw: ['fury'] }, cond: { c: 'legion' } })] };
HAND['undying-loyalty'] = { ab: [st('costLess', { e: 2, cond: { c: 'trashHasTag', tags: ['Bird', 'Cat', 'Dog', 'Poro'], maxE: 2, maxP: 1 } }), spell([{ op: 'playFromTrashFree', type: 'u', maxE: 2, maxP: 1 }])] };
HAND['unlicensed-armory'] = { ab: [act({ discard: 1, ex: true }, [{ op: 'choose', t: one(fu) }, { op: 'addSave', payFury: true }])] };
HAND['unyielding-spirit'] = { plus: [spell([{ op: 'turnFx', k: 'noFxDmg' }])] };
HAND['valley-of-idols'] = { ab: [trig('anyPlay', [{ op: 'payOpt', cost: { e: 1, pw: [] }, then: [{ op: 'buff', t: it }] }], { f: { type: 'u' }, here: true })] };
HAND['vaults-of-helia'] = { ab: [trig('youHold', [{ op: 'turnFxP', k: 'unitsCostMore', v: 1 }])] };
HAND['veiled-temple'] = { ab: [trig('youConquer', [{ op: 'may', then: [{ op: 'ready', t: one({ type: 'g', who: 'friendly' }) }, { op: 'maybeDetach' }] }])] };
OP.maybeDetach = (s, fr) => { const g = ob(s, firstIt(fr.ctx)); if (!g || g.att == null) return; const y = askYN(s, fr, `Detach ${cn(g.cid)}?`, 'Detach', 'Keep'); if (y === WAIT) return WAIT; if (y) { g.att = null; log(`${cn(g.cid)} is detached.`); } };
HAND['vex-apathetic'] = { plus: [trig('oppPlay', [{ op: 'stun', t: it }, { op: 'noMoveIt' }], { f: { type: 'u' }, selfAtBf: true })] };
OP.noMoveIt = (s, fr) => each(s, fr.ctx.it || [], (o) => { o.noMove = true; });
HAND['vex-cheerless'] = { ab: [st('costMod', { who: 'you', type: 's', e: -1, pwLess: 1, minE: 1, inCombatOnly: true }), st('costMod', { who: 'opp', type: 's', e: 1, pwMore: 1, inCombatOnly: true })] };
HAND['vex-mocking'] = { plus: [trig('youStun', [{ op: 'may', then: [{ op: 'move', t: self, to: 'itLoc1' }] }])] };
HAND['vilemaw'] = { plus: [st('smallFoesNoDmg')] };
HAND['void-hatchling'] = { plus: [], manual: 'Looking at the top card before revealing is not automated.' };
HAND['void-rush'] = { ab: [spell([{ op: 'look', n: 2, reveal: true }, { op: 'reinforce', less: 2, any: true }, { op: 'lookRest', to: 'hand' }])] };
HAND['volibear-furious'] = { plus: [trig('attack', [{ op: 'choose', t: self }, { op: 'splitDamage', n: 5, f: { type: 'u', who: 'enemy', where: 'here' } }])] };
HAND['walking-roost'] = { plus: [trig('played', [{ op: 'eachPlayer', only: 'opp', eff: [{ op: 'token', name: 'Bird', m: 1, n: 1, kw: { deflect: 1 }, where: 'base' }] }])] };
HAND['wallop'] = { plus: [st('extraCost', { cost: { e: 0, pw: [], spendBuff: true, free: true } })] };
HAND['watchful-curator'] = { ab: [st('aura', { kw: { deflect: 1 }, f: { type: 'g', who: 'friendly' } })] };
HAND['whirlwind'] = { ab: [spell([{ op: 'whirlwind' }])] };
OP.whirlwind = (s, fr) => { const order = [1 - fr.ctx.p, fr.ctx.p]; for (let i = order.length - 1; i >= 0; i--) pushChild(s, [{ op: 'may', then: [{ op: 'return', t: one({ type: 'u' }) }] }], Object.assign({}, fr.ctx, { p: order[i], it: [], picks: [], pi: 0 })); };
HAND['wild-claw'] = { ab: [spell([{ op: 'look', n: 5 }, { op: 'reinforce', less: 5, types: ['u', 'g'], thenEmp: true }, { op: 'lookRest', to: 'deck' }])] };
HAND['yeti-brawler'] = { ab: [trig('conquer', [{ op: 'if', cond: { c: 'excessGE', n: 3 }, then: [{ op: 'gold', n: 2 }] }])] };
HAND['yuumi-magical-cat'] = { ab: [trig(['attack', 'defend'], [{ op: 'choose', t: one({ type: 'u', who: 'friendly', where: 'here', other: true }) }, { op: 'might', n: 3, t: it }, { op: 'giveKw', kw: { tank: true }, t: it }])] };
HAND['zaun-punk'] = { ab: [st('extraCost', { cost: { e: 0, pw: [], killFriendlyGear: true } }), trig('played', [{ op: 'if', cond: { c: 'paidExtra' }, then: [{ op: 'kill', t: one({ type: 'g' }) }] }])] };
HAND['zed-from-the-shadows'] = { plus: [st('extraCost', { cost: { e: 0, pw: [], discard: 1 } })] };
HAND['zed-without-a-sound'] = { plus: [act({ e: 1, pw: ['chaos'] }, [{ op: 'choose', t: one({ type: 'u', who: 'friendly', tag: 'Shadow Clone' }) }, { op: 'azirSwap', noEq: true }], { speed: 'A' })] };
HAND['zenith-blade'] = { ab: [spell([{ op: 'stun', t: one({ type: 'u', who: 'enemy', where: 'bf' }) }, { op: 'may', then: [{ op: 'move', t: one(fu), to: 'itLoc1' }] }])] };
HAND['zero-point-inflection'] = { ab: [trig('youPlay', [{ op: 'draw', n: 2 }], { f: { type: 'c' } }), trig('drawBig', [{ op: 'discardHand' }, { op: 'kill', t: self }, { op: 'score', n: 1, who: 'opp' }], { once: 'turn' })] };
HAND['zhonyas-hourglass'] = { plus: [st('saveFriend')] };
HAND['ziggs-short-fused'] = { ab: [trig('played', [{ op: 'bomb' }]), st('gearAbBonus')] };
HAND['zilean-time-mage'] = { ab: [st('tokenDouble')] };

/* ---------------- fixes found while reviewing compiled cards ---------------- */
HAND['clockwork-keeper'] = { plus: [trig('played', [{ op: 'if', cond: { c: 'paidExtra' }, then: [{ op: 'draw', n: 1 }] }])] };
HAND['curtain-call'] = { keep: [], plus: [spell([{ op: 'oneOf', onceKey: 'curtain', opts: [[{ op: 'draw', n: 1 }], [{ op: 'deal', n: 2, t: one({ type: 'u', where: 'bf' }) }], [{ op: 'deal', n: 3, t: one({ type: 'u', where: 'base' }) }], [{ op: 'might', n: -4, t: one({ type: 'u', where: 'bf' }) }]] }])] };
HAND['emperors-dais'] = { ab: [trig('youConquer', [{ op: 'payOpt', cost: { e: 1, pw: [] }, then: [{ op: 'return', t: one({ type: 'u', who: 'friendly', where: 'here' }) }, { op: 'token', name: 'Sand Soldier', m: 2, n: 1, where: 'here' }] }], { here: true })] };
HAND['hall-of-legends'] = { ab: [trig('youConquer', [{ op: 'payOpt', cost: { e: 1, pw: [] }, then: [{ op: 'readyLegend' }] }], { here: true })] };
HAND['fight-or-flight'] = { keep: [], plus: [spell([{ op: 'move', t: one({ type: 'u', where: 'bf' }), to: 'base' }])] };
HAND['lillia-fae-fawn'] = { kw: { accelerate: true }, ab: [trig('move', [{ op: 'token', name: 'Sprite', m: 3, n: 1, kw: { temporary: true }, where: 'moveFrom' }])] };
HAND['maddened-marauder'] = { kw: { tank: true }, ab: [trig('played', [{ op: 'move', t: one({ type: 'u', where: 'bf' }), to: 'base' }])] };
HAND['maduli-the-gatekeeper'] = { ab: [st('noReady'), act({ pw: ['chaos'] }, [{ op: 'maduli' }])] };
OP.maduli = (s, fr) => {
  const me = ob(s, fr.ctx.self); if (!me) return; const p = fr.ctx.p;
  const opts = [0, 1].filter((i) => i !== me.loc && unitsAt(s, i).some((u) => u.ctrl !== p) && might(s, me) > unitsAt(s, i).filter((u) => u.ctrl !== p).reduce((x, u) => x + might(s, u), 0));
  if (!opts.length) { log(`${cn(me.cid)} can't move: no enemy battlefield with less total Might.`); return; }
  const to = askDest(s, fr, opts, `${cn(me.cid)}: move to which battlefield?`); if (to === WAIT) return WAIT;
  log(`${cn(me.cid)} moves to ${bfName(s, to)}.`); moveUnit(s, me, to, { byEffect: true, byP: p });
};
HAND['obelisk-of-power'] = { ab: [trig('beginningAny', [{ op: 'channel', n: 1, who: 'trigP' }], { first: true })] };
HAND['stormbringer'] = { ab: [spell([{ op: 'choose', t: one({ type: 'u', who: 'friendly', where: 'base' }) }, { op: 'remember' }, { op: 'chooseBf' }, { op: 'deal', n: { ref: 'itMight' }, t: { q: 'each', f: { type: 'u', who: 'enemy', where: 'there' } } }, { op: 'stormbringerMove' }])] };
OP.stormbringerMove = (s, fr) => { const u = ob(s, fr.ctx.chosenUnit != null ? fr.ctx.chosenUnit : null); if (u && fr.ctx.there != null) { log(`${cn(u.cid)} moves to ${bfName(s, fr.ctx.there)}.`); moveUnit(s, u, fr.ctx.there, { byEffect: true, byP: fr.ctx.p }); } };
HAND['seat-of-power'] = { ab: [trig('youConquer', [{ op: 'drawPerOtherBf' }], { here: true })] };
OP.drawPerOtherBf = (s, fr) => { const p = fr.ctx.p; const n = [0, 1].filter((i) => i !== fr.ctx.here && s.ctrl[i] === p).length; if (n) drawN(s, p, n); };
OP.remember = (s, fr) => { fr.ctx.chosenUnit = firstIt(fr.ctx); };
HAND['voidreaver'] = { keep: [0, 1], plus: [act({ xp: 2, ex: true }, [{ op: 'move', t: one({ type: 'u', who: 'friendly', ex: true, where: 'bf' }), to: 'base' }])] };
HAND['the-arenas-greatest'] = { ab: [trig('beginningAny', [{ op: 'score', n: 1, who: 'trigP' }], { first: true })] };

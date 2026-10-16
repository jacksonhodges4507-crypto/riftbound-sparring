/* engine v3, part 2: game setup and the basic actions every card uses (draw, channel, kill, move, score). */

function mkPlayer(s, D, p) {
  const rd = []; for (const d in D.runes) for (let i = 0; i < D.runes[d]; i++) rd.push(d);
  const main = Object.assign({}, D.main);
  return {
    deck: shuffle(s, expand(main).filter((id) => C[id])), hand: [], trash: [], banished: [], runeDeck: shuffle(s, rd), runes: [], pts: 0, xp: 0,
    legend: D.legend, legEx: false, legEmp: 0, champ: D.champ || null, chosenChamp: D.champ || null, pool: [], human: false, name: D.name || '',
    tc: freshTC(), chose: 0, listTag: null, mulled: false, deckName: D.name,
  };
}
function freshTC() { return { cards: 0, units: 0, spells: 0, gear: 0, eq: 0, drawn: 0, discarded: 0, xp: 0, spentPow: 0, bigSpell: false, holdPts: 0, unitDied: false, enemyDied: false, conquered: [] }; }
function newGame(D0, D1, first, seed, opts) {
  opts = opts || {};
  const s = {
    seed: (seed != null ? seed : Math.random() * 2147483647) | 0, nid: 1, objs: [], ctrl: [null, null], active: first, first, turnNo: 0, scored: [[], []],
    firstTurn: [true, true], winner: null, mode: 'mull', chain: [], prio: null, passes: 0, chainCtx: 'main', chainStarter: null, sd: null, sdQueue: [],
    choice: null, exec: [], hidden: [], delayed: [], endFx: [], turnFx: {}, onceUsed: {}, reveal: [false, false], extraTurn: null,
  };
  s.players = [mkPlayer(s, D0, 0), mkPlayer(s, D1, 1)];
  const pick = (D, i) => (opts['bf' + i] && opts['bf' + i] !== 'random' ? opts['bf' + i] : D.bfs[Math.floor(rnd(s) * D.bfs.length)]);
  const b0 = pick(D0, 0); let b1 = pick(D1, 1);
  if (b1 === b0 && D1.bfs.length > 1 && !opts.bf1) b1 = D1.bfs.find((x) => x !== b0) || b1;
  s.bfs = [{ id: b0, owner: 0 }, { id: b1, owner: 1 }];
  drawN(s, 0, 4, true); drawN(s, 1, 4, true);
  return s;
}
function mulligan(s, p, idxs) { const pl = s.players[p]; const out = idxs.slice().sort((a, b) => b - a).map((i) => pl.hand.splice(i, 1)[0]); drawN(s, p, out.length, true); pl.deck.push(...out); pl.mulled = true; }
function beginGame(s) { s.mode = 'main'; log(`${s.first === 0 ? 'You go' : 'AI goes'} first. Battlefields: ${bfName(s, 0)} and ${bfName(s, 1)}.`); startTurn(s); }

/* ---------------- cards moving between zones ---------------- */
function drawN(s, p, n, quiet) {
  const pl = s.players[p];
  for (let i = 0; i < n; i++) {
    if (!pl.deck.length) {
      if (!pl.trash.length) return;
      pl.deck = shuffle(s, pl.trash); pl.trash = [];
      if (!quiet) { gainPoints(s, 1 - p, 1, 'burnout'); log(`${P(p)} burned out: trash shuffled into the deck, ${P(1 - p)} ${vb(1 - p, 'score', 'scores')} 1.`, 'score'); }
    }
    pl.hand.push(pl.deck.shift());
    if (!quiet) { pl.tc.drawn++; emit(s, 'youDraw', { p, nth: pl.tc.drawn }); }
  }
}
function channel(s, p, n, ex) { const pl = s.players[p]; let got = 0; for (let i = 0; i < n && pl.runeDeck.length; i++) { pl.runes.push({ id: s.nid++, d: pl.runeDeck.shift(), ex: !!ex }); got++; } return got; }
function discardCard(s, p, cid) {
  const pl = s.players[p]; const i = pl.hand.indexOf(cid); if (i < 0) return false;
  pl.hand.splice(i, 1); pl.trash.push(cid); pl.tc.discarded++;
  log(`${P(p)} ${vb(p, 'discard', 'discards')} ${cn(cid)}.`, p ? 'ai' : 'you');
  emit(s, 'discarded', { p, cid }); emit(s, 'youDiscard', { p, cid });
  return true;
}
function gainPoints(s, p, n, why) {
  for (const { a, src } of staticSources(s)) if (a.s === 'oppNoScore' && src.ctrl !== p && src.ctrl != null && condOK(s, a.cond, { s, p: src.ctrl, self: src.id })) { log(`${P(p)} can't score right now.`); return 0; }
  s.players[p].pts += n; emit(s, 'scored', { p, n });
  checkWin(s); return n;
}
function checkWin(s) { const W = winScore(s); for (const p of [0, 1]) if (s.players[p].pts >= W && s.winner == null) { s.winner = p; s.mode = 'over'; log(`${P(p)} ${vb(p, 'win', 'wins')} ${s.players[0].pts}–${s.players[1].pts}.`, 'score'); } }

/* ---------------- damage, death ---------------- */
function damage(s, u, n, srcInfo) {
  if (!u || !s.objs.includes(u) || n <= 0) return 0;
  if (u.prevent >= 99) return 0;
  if (srcInfo && !srcInfo.combat && srcInfo.p != null && srcInfo.p !== u.ctrl && hasStatic(s, u, 'preventEnemyFx')) { log(`${cn(u.cid)} prevents the damage.`); return 0; }
  if (u.moves >= 2 && hasStatic(s, u, 'noDamageIfMoved2')) return 0;
  if (u.preventNext) { u.preventNext = false; log(`Damage to ${cn(u.cid)} is prevented.`); return 0; }
  if (u.prevent > 0) { const k = Math.min(u.prevent, n); u.prevent -= k; n -= k; if (n <= 0) return 0; }
  if (srcInfo && srcInfo.spell && s.turnFx.noSpellDmg) return 0;
  if (srcInfo && !srcInfo.combat && s.turnFx.noFxDmg) return 0;
  if (u.dmgMul) n *= u.dmgMul;
  if (hasStatic(s, u, 'noDamageOutOfCombat') && !inCombat(s, u)) return 0;
  u.dmg += n; u.hurtTurn = s.turnNo; emit(s, 'damaged', { obj: u.id, n });
  if (s.turnFx.killDamaged || u.killOnDamage) { kill(s, u, srcInfo); return n; }
  checkDeaths(s, srcInfo);
  return n;
}
function checkDeaths(s, srcInfo) { let again = true; while (again) { again = false; for (const u of s.objs.filter((o) => o.k === 'u')) if (u.dmg > 0 && u.dmg >= might(s, u)) { kill(s, u, srcInfo); again = true; break; } } }
// replacement effects for "would die" are kept on the unit (u.saves) or come from statics/equipment
function trySave(s, u) {
  // Zhonya's Hourglass style gear: friendly gear with static 'saveFriend'
  for (const g of s.objs.filter((o) => o.k === 'g' && o.ctrl === u.ctrl)) {
    const a = hasStatic(s, g, 'saveFriend'); if (a) { log(`${cn(g.cid)} is destroyed to save ${cn(u.cid)}.`); removeObj(s, g, 'trash'); recallUnit(s, u, true); u.dmg = 0; return true; }
  }
  for (const g of eqOf(s, u)) { if (C[g.cid].eqab.some((a) => a.s === 'saveSelfKillEq')) { log(`${cn(g.cid)} breaks to save ${cn(u.cid)}.`); removeObj(s, g, 'trash'); u.dmg = 0; recallUnit(s, u, true); return true; } }
  if (u.loc !== 'base' && u.loc != null && inCombat(s, u) && C[s.bfs[u.loc].id] && C[s.bfs[u.loc].id].ab.some((a) => a.s === 'altarSave') && canPay(s, u.ctrl, { e: 0, pw: ['any', 'any', 'any'] }) && unitVal(s, u) >= 3) {
    pay(s, u.ctrl, { e: 0, pw: ['any', 'any', 'any'] }); log(`${bfName(s, u.loc)}: ${P(u.ctrl)} ${vb(u.ctrl, 'pay', 'pays')} to save ${cn(u.cid)}.`); u.dmg = 0; recallUnit(s, u, true); return true;
  }
  if (u.loc !== 'base' && unitsAt(s, u.loc, u.ctrl).some((x) => x !== u && hasStatic(s, x, 'sorakaSave') && might(s, x) > might(s, u))) { log(`Soraka saves ${cn(u.cid)}: healed, exhausted and recalled.`); u.dmg = 0; recallUnit(s, u, true); return true; }
  if (u.buff > 0) {
    const pl = s.players[u.ctrl];
    if (pl.legend && C[pl.legend].ab.some((a) => a.s === 'bossSave') && !pl.legEx && canPay(s, u.ctrl, { e: 0, pw: ['any'] })) {
      pay(s, u.ctrl, { e: 0, pw: ['any'] }); pl.legEx = true; u.buff--; emit(s, 'buffSpent', { p: u.ctrl, obj: u.id });
      log(`${cn(pl.legend)}: ${cn(u.cid)} spends its buff and is recalled instead of dying.`); u.dmg = 0; recallUnit(s, u, true); return true;
    }
  }
  if (u.saves && u.saves.length && u.saves[0].payFury && !canPay(s, u.ctrl, { e: 0, pw: ['fury'] })) u.saves.shift();
  if (u.saves && u.saves.length) { const sv = u.saves.shift(); if (sv.payFury) pay(s, u.ctrl, { e: 0, pw: ['fury'] }); log(`${cn(u.cid)} is saved and recalled.`); u.dmg = 0; recallUnit(s, u, sv.ex !== false); return true; }
  return false;
}
function kill(s, o, srcInfo) {
  if (!o || !s.objs.includes(o)) return false;
  if (o.k === 'u' && trySave(s, o)) return false;
  const loc = o.loc, alone = o.k === 'u' && loc !== 'base' && unitsAt(s, loc, o.ctrl).length === 1, mighty = o.k === 'u' && isMighty(s, o), wasCombat = o.k === 'u' && inCombat(s, o);
  log(`${Pos(o.ctrl).replace(/^./, (c) => c.toUpperCase())} ${cn(o.cid)} ${o.k === 'u' ? 'dies' : 'is destroyed'}.`, o.ctrl ? 'ai' : 'you');
  const snap = Object.assign({}, o, { alone, mighty, wasCombat, deadLoc: loc });
  removeObj(s, o, o.token ? null : o.banishOnDeath ? 'banish' : 'trash');
  if (s.inBeginning === snap.ctrl && snap.k === 'u') s.players[snap.ctrl].tc.diedInBeginning = true;
  s.players[snap.ctrl].tc.friendDied = true;
  if (snap.k === 'u') { s.players[snap.ctrl].tc.unitDied = true; s.players[1 - snap.ctrl].tc.enemyDied = true; s.turnFx.unitDied = true; }
  emit(s, 'die', { obj: snap.id, snap, p: snap.ctrl, bySpell: srcInfo && srcInfo.spell, byP: srcInfo && srcInfo.p });
  return true;
}
function removeObj(s, o, dest) {
  if (!o || !s.objs.includes(o)) return;
  s.objs = s.objs.filter((x) => x !== o);
  const owner = s.players[o.owner];
  if (o.k === 'u') s.objs.forEach((g) => { if (g.att === o.id) g.att = null; });
  s.objs.forEach((x) => { if (x.ctrlUntilGone === o.id) { x.ctrl = x.ctrlBack; delete x.ctrlUntilGone; if (x.att != null) x.att = null; x.loc = 'base'; log(`${cn(x.cid)} returns to ${Pos(x.ctrl)} control.`); } });
  if (o.att != null) o.att = null;
  if (!o.token && dest) { if (dest === 'trash') owner.trash.push(o.cid); else if (dest === 'hand') owner.hand.push(o.cid); else if (dest === 'recycle') owner.deck.push(o.cid); else if (dest === 'banish') owner.banished.push(o.cid); else if (dest === 'deckTop') owner.deck.unshift(o.cid); }
  emit(s, 'leaves', { obj: o.id, snap: o, dest });
  { const c = C[o.cid]; if (c) c.ab.forEach((a) => { const ons = Array.isArray(a.on) ? a.on : [a.on]; if (a.kind === 'trig' && (ons.includes('leavesSelf') || ons.includes('leaves'))) s.exec.push(mkFrame(a, { p: o.ctrl, self: null, card: o.cid, snap: o })); }); }
  s.objs.forEach((u) => { if (u.copyBy === o.id) { delete u.copyOf; delete u.copyBy; } });
  if (dest === 'banish' && !o.token) emit(s, 'youBanish', { p: o.owner, cid: o.cid });
  refreshControl(s);
}
function returnToHand(s, o) { if (!o || !s.objs.includes(o)) return; log(`${cn(o.cid)} returns to ${Pos(o.owner)} hand.`); const loc = o.loc; removeObj(s, o, 'hand'); if (o.k === 'u') emit(s, 'returned', { obj: o.id, p: o.owner, bf: loc }); }
function recallUnit(s, u, ex) { if (!u) return; const from = u.loc; u.loc = 'base'; if (ex) u.ex = true; if (from !== 'base') refreshControl(s); }
function readyObj(s, o) {
  if (!o || !o.ex) return;
  if (o.k === 'u' && hasStatic(s, o, 'noReady')) return;
  o.ex = false; emit(s, 'becomeReady', { obj: o.id }); if (o.k === 'u') emit(s, 'unitReadied', { obj: o.id, p: o.ctrl });
}

/* ---------------- control and scoring ---------------- */
function setCtrl(s, i, nc) {
  const old = s.ctrl[i]; if (old === nc) return; s.ctrl[i] = nc;
  if (old != null) { const lost = s.hidden.filter((h) => h.owner === old && h.bf === i); lost.forEach((h) => s.players[old].trash.push(h.cid)); s.hidden = s.hidden.filter((h) => !lost.includes(h)); if (lost.length) log(`${Pos(old)} hidden card at ${bfName(s, i)} is lost.`); }
  if (nc == null && old != null) log(`${bfName(s, i)} is now uncontrolled.`);
}
function refreshControl(s) {
  for (const i of [0, 1]) {
    if (s.sd && s.sd.bf === i) continue;
    if (s.sdQueue.some((q) => q.bf === i)) continue;
    const owners = [...new Set(unitsAt(s, i).map((u) => u.ctrl))];
    if (owners.length === 1) setCtrl(s, i, owners[0]);
    else if (owners.length === 0) setCtrl(s, i, null);
    else { const att = s.ctrl[i] == null ? s.active : 1 - s.ctrl[i]; s.sdQueue.push({ bf: i, att }); }
  }
}
function scoreBf(s, p, kind, i) {
  if (s.scored[p].includes(i)) return false;
  const bfc = C[s.bfs[i].id];
  if (bfc && bfc.ab.some((a) => a.s === 'noScoreEarly') && ownTurns(s, p) < 3) { log(`${bfName(s, i)} can't be scored yet.`); return false; }
  s.scored[p].push(i); const pl = s.players[p];
  if (ownTurns(s, p) <= 2 && s.objs.some((o) => o.k === 'u' && hasStatic(s, o, 'otterpus'))) { log(`Otterpus: ${P(p)} ${vb(p, 'draw', 'draws')} a card instead of scoring.`); drawN(s, p, 1); return false; }
  if (kind === 'conquer' && pl.pts === winScore(s) - 1 && !s.scored[p].includes(1 - i)) {
    log(`${P(p)} conquered ${bfName(s, i)}, but the final point needs both battlefields scored this turn. ${P(p)} ${vb(p, 'draw', 'draws')} a card instead.`, 'score'); drawN(s, p, 1); return false;
  }
  const got = gainPoints(s, p, 1, kind);
  if (got) { if (kind === 'hold') pl.tc.holdPts++; log(`${P(p)} ${kind === 'hold' ? vb(p, 'hold', 'holds') : vb(p, 'conquer', 'conquers')} ${bfName(s, i)}: +1 (${pl.pts}).`, 'score'); }
  return !!got;
}
function ownTurns(s, p) { return p === s.first ? Math.ceil(s.turnNo / 2) : Math.floor(s.turnNo / 2); }
function conquer(s, p, i, info) {
  s.players[p].tc.conquered.push(i);
  for (const u of unitsAt(s, i, p)) u.conqTurn = s.turnNo;
  scoreBf(s, p, 'conquer', i); if (s.winner != null) return;
  huntXp(s, p, i);
  const us = unitsAt(s, i, p).map((u) => u.id);
  const twice = unitsAt(s, i, p).some((u) => hasStatic(s, u, 'conquerTwice')) ? 2 : 1;
  for (const u of unitsAt(s, i, p)) if (hasStatic(s, u, 'holdIsConquer')) emit(s, 'hold', { obj: u.id, bf: i, p });
  for (let k = 0; k < twice; k++) for (const id of us) emit(s, 'conquer', { obj: id, bf: i, p, open: info && info.open, afterAttack: info && info.afterAttack, excess: info ? info.excess : 0 });
  emit(s, 'youConquer', { p, bf: i, excess: info ? info.excess : 0, mightyHere: unitsAt(s, i, p).some((u) => isMighty(s, u)) });
}
function huntXp(s, p, i) {
  let n = 0; for (const u of unitsAt(s, i, p)) { const h = kwOf(s, u).hunt; if (h) { n += h; STATS.fired[u.cid] = (STATS.fired[u.cid] || 0) + 1; } }
  if (n) { const pl = s.players[p]; pl.xp += n; pl.tc.xp += n; log(`${P(p)} ${vb(p, 'gain', 'gains')} ${n} XP from Hunt (${pl.xp}).`); emit(s, 'gainXp', { p, n }); }
}
function hold(s, p, i) {
  for (const g of s.objs.filter((o) => o.k === 'g' && o.loc === i && o.att == null && o.ctrl !== p && C[o.cid].kw.deploy)) { log(`${cn(g.cid)} is destroyed: ${P(p)} ${vb(p, 'hold', 'holds')} its battlefield.`); kill(s, g); }
  scoreBf(s, p, 'hold', i); if (s.winner != null) return;
  huntXp(s, p, i);
  const times = unitsAt(s, i, p).some((u) => hasStatic(s, u, 'holdTwice')) ? 2 : 1;
  for (const u of unitsAt(s, i, p)) if (hasStatic(s, u, 'holdIsConquer')) emit(s, 'conquer', { obj: u.id, bf: i, p, excess: 0 });
  for (let k = 0; k < times; k++) { for (const u of unitsAt(s, i, p)) emit(s, 'hold', { obj: u.id, bf: i, p }); emit(s, 'youHold', { p, bf: i }); }
}

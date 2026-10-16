/* engine v3, part 6: hand-written programs for cards whose printed text the compiler can't read yet,
   and the special effect ops they use.
   HAND[id] = { kw, ab, eq }      replaces the compiled program
   HAND[id] = { plus: [...] }     adds abilities to the compiled ones (keep: [i...] keeps only those compiled abilities) */
const HAND = {};
const HAND_OPS = {};

// shorthand for writing programs by hand
const H = {
  one: (f) => ({ q: 'one', n: 1, f }),
  upto: (n, f) => ({ q: 'upto', n, f }),
  self: { q: 'self' }, it: { q: 'it' },
  fu: { type: 'u', who: 'friendly' }, eu: { type: 'u', who: 'enemy' }, u: { type: 'u' },
  act: (cost, eff, more) => Object.assign({ kind: 'act', cost: Object.assign({ e: 0, pw: [] }, cost), speed: null, eff, limit: {} }, more || {}),
  trig: (on, eff, more) => Object.assign({ kind: 'trig', on, eff }, more || {}),
  st: (s, more) => Object.assign({ kind: 'static', s }, more || {}),
  exMe: (then, cost) => ({ op: 'payOpt', cost: Object.assign({ e: 0, pw: [] }, cost || {}), exSelf: true, then }),
};

/* ---------------- legends ---------------- */
HAND['agonys-embrace'] = { ab: [H.trig('youPlay', [{ op: 'draw', n: 1 }, { op: 'if', cond: { c: 'myTurn', not: true }, then: [{ op: 'discard', n: 1 }] }], { f: { type: 'c' }, fromHidden: true, once: 'turn' })] };
HAND['bashful-bloom'] = { ab: [H.act({ e: 4, ex: true, lessPer: { count: 'control', f: { type: 'u', who: 'friendly', hasKw: 'temporary' } } }, [{ op: 'token', name: 'Sprite', m: 3, n: 1, ready: true, kw: { temporary: true }, where: 'base' }])] };
HAND['blade-dancer'] = { ab: [
  H.trig('youChoose', [H.exMe([{ op: 'ready', t: H.it }], { pw: ['any'] })], { f: { type: 'u' } }),
  H.trig('youConquer', [{ op: 'payOpt', cost: { e: 1, pw: [] }, then: [{ op: 'readyLegend' }] }]),
] };
HAND['boy-who-shattered-time'] = { kw: { empower: { e: 1, pw: [], ex: true } }, ab: [H.act({ disemp: true, ex: true }, [{ op: 'nextUnitDiscount', e: 2, pw: 1 }])] };
HAND['chem-baroness'] = { plus: [H.st('goldExtraE')] };
HAND['curator-of-the-sands'] = { ab: [H.trig('youPlay', [H.exMe([{ op: 'readyRunes', n: 2 }])], { f: { unitOrGear: true, costGE: 7 } })] };
HAND['deceiver'] = { ab: [H.trig(['youConquer', 'youHold'], [{ op: 'payOpt', cost: { e: 0, pw: [] }, exSelf: true, discard: 1, then: [{ op: 'reflection' }] }])] };
HAND['exemplar-of-demacia'] = { ab: [H.trig('youPlay', [H.exMe([{ op: 'move', t: H.one(H.fu), to: 'there' }], { pw: ['any'] })], { f: { type: 'g', hasKw: 'deploy' } })] };
HAND['grandmaster-at-arms'] = { ab: [
  H.act({ e: 1, ex: true }, [{ op: 'choose', t: H.one({ type: 'eq', who: 'friendly', detached: true }) }, { op: 'choose', slot: 'b', t: H.one(H.fu) }, { op: 'attachIt' }]),
  H.act({ ex: true }, [{ op: 'choose', t: H.one({ type: 'eq', who: 'friendly', attached: true }) }, { op: 'choose', slot: 'b', t: H.one(H.fu) }, { op: 'attachIt' }]),
] };
HAND['green-father'] = { ab: [H.trig(['youConquer', 'youHold'], [H.exMe([{ op: 'brush' }])])] };
HAND['heart-of-the-tempest'] = { plus: [H.trig('youPlay', [{ op: 'empower', t: H.self }], { f: { type: 'c' }, notFromHand: true })] };
HAND['hexplosives-expert'] = { ab: [H.act({ e: 1, pw: ['any'], ex: true }, [{ op: 'bomb' }])] };
HAND['iron-revenant'] = { ab: [H.act({ ex: true, banishTrash: 'ug' }, [{ op: 'add', res: { e: 0, pw: ['any'] } }], { speed: 'R', limit: { spendOn: 'ug' } })] };
HAND['lady-of-clockwork'] = { ab: [H.trig('mainStart', [{ op: 'payOpt', cost: { e: 1, pw: [] }, then: [{ op: 'choose', t: H.one({ type: 'g', who: 'friendly' }) }, { op: 'gearToUnit' }] }])] };
HAND['master-of-shadows'] = { plus: [H.trig('youBanish', [{ op: 'empower', t: H.self }])] };
HAND['piltover-enforcer'] = { ab: [H.trig('youConquer', [{ op: 'if', cond: { c: 'excessGE', n: 3 }, then: [H.exMe([{ op: 'ready', t: H.one(H.u) }])] }])] };
HAND['pride-of-nazumah'] = { ab: [H.act({ e: 1, ex: true }, [{ op: 'giveKw', kw: { assaultFromShield: true }, t: H.one(H.fu) }])] };
HAND['purifier'] = { ab: [H.st('eqGiveAssault')] };
HAND['rogue-assassin'] = { kw: { empower: { e: 3, pw: ['any'] } }, ab: [H.act({ ex: true }, [{ op: 'if', cond: { c: 'myTurn' }, then: [{ op: 'move', t: H.one({ type: 'u', who: 'friendly', inShowdown: true }), to: 'base' }, { op: 'if', cond: { c: 'selfEmp' }, then: [{ op: 'ready', t: H.it }] }] }], { speed: 'A' })] };
HAND['starry-eyed-songstress'] = { ab: [H.st('singDiscount')] };
HAND['swift-scout'] = { ab: [H.st('hideForEnergy'), H.act({ e: 1, ex: true }, [{ op: 'teemoToHand' }])] };
HAND['the-boss'] = { ab: [H.st('bossSave'), H.trig('youConquer', [{ op: 'readyLegend' }])] };
HAND['unforgiven'] = { ab: [H.act({ e: 2, ex: true }, [{ op: 'choose', t: H.one(H.fu) }, { op: 'moveToggleBase' }])] };
HAND['virtuoso'] = { ab: [H.trig('youPlay', [{ op: 'virtuoso' }], { f: { type: 's', costGE: 4 } })] };
HAND['void-burrower'] = { ab: [H.trig('youConquer', [H.exMe([{ op: 'look', n: 2, reveal: true }, { op: 'playFromLook' }, { op: 'lookRest', to: 'deck' }])])] };
HAND['wuju-bladesman-starter'] = { ab: [H.st('defendAlone', { n: 2 })] };
HAND['wuju-master'] = { ab: [H.st('aura', { n: 1, f: { type: 'u', who: 'friendly' }, gate: { level: 6 } }), H.st('friendsEnterReady', { gate: { level: 11 } })] };

/* ---------------- ops used by hand-written programs ---------------- */
HAND_OPS.readyLegend = (s, fr) => { const pl = s.players[fr.ctx.p]; if (pl.legEx) { pl.legEx = false; log(`${cn(pl.legend)} is readied.`); } };
HAND_OPS.nextUnitDiscount = (s, fr, op) => { s.turnFx.nextLess = s.turnFx.nextLess || {}; s.turnFx.nextLess[fr.ctx.p] = { e: op.e, pw: op.pw, type: 'u', killEOT: true }; log(`${P(fr.ctx.p)}: the next unit this turn costs less (and dies at end of turn).`); };
HAND_OPS.nextCardLess = (s, fr, op) => { s.turnFx.nextLess = s.turnFx.nextLess || {}; s.turnFx.nextLess[fr.ctx.p] = { e: op.e || 0, pw: op.pw || 0, type: op.type || null }; log(`${P(fr.ctx.p)}: the next ${op.type === 's' ? 'spell' : 'card'} costs less.`); };
HAND_OPS.attachIt = (s, fr) => { const [g, u] = (fr.ctx.it || []).map((id) => ob(s, id)); if (g && u && g.k === 'g' && u.k === 'u') attach(s, g, u); };
HAND_OPS.moveToggleBase = (s, fr) => {
  const u = ob(s, firstIt(fr.ctx)); if (!u) return;
  if (u.loc !== 'base') { log(`${cn(u.cid)} moves to base.`); moveUnit(s, u, 'base', { byEffect: true, byP: fr.ctx.p }); return; }
  const opts = [0, 1].filter((i) => !bfNoPlay(s, i));
  const a = takeAns(fr); if (!a && opts.length > 1) return needChoice(s, fr, 'dest', { opts, why: `${cn(fr.ctx.card)}: move ${cn(u.cid)} where?`, obj: u.id });
  const to = a ? a.v : opts[0]; log(`${cn(u.cid)} moves to ${bfName(s, to)}.`); moveUnit(s, u, to, { byEffect: true, byP: fr.ctx.p });
};
HAND_OPS.teemoToHand = (s, fr) => {
  const p = fr.ctx.p, pl = s.players[p];
  const opts = unitsOf(s, p).filter((u) => u.owner === p && tagsOf(s, u).includes('Teemo')).map((u) => u.id);
  if (pl.champ && (C[pl.champ].tags || []).includes('Teemo')) opts.unshift('champ');
  if (!opts.length) return;
  const a = takeAns(fr); if (!a && opts.length > 1) return needChoice(s, fr, 'pickObj', { opts, why: `${cn(fr.ctx.card)}: put which Teemo into your hand?`, pol: 1 });
  const v = a ? a.v : opts[0];
  if (v === 'champ') { pl.hand.push(pl.champ); log(`${P(p)} ${vb(p, 'put', 'puts')} ${cn(pl.champ)} into ${vb(p, 'your', 'their')} hand from the Champion Zone.`); pl.champ = null; return; }
  const o = ob(s, v); if (o) returnToHand(s, o);
};
HAND_OPS.gearToUnit = (s, fr) => {
  for (const o of s.objs) if (o.animatedBy === fr.ctx.p) { o.k = 'g'; o.setBase = null; delete o.animatedBy; if (o.loc !== 'base') o.loc = 'base'; }
  const g = ob(s, firstIt(fr.ctx)); if (!g || g.k !== 'g') return;
  g.k = 'u'; g.setBase = C[g.cid].e || 0; g.animatedBy = fr.ctx.p; g.att = null; log(`${cn(g.cid)} becomes a ${g.setBase}-might unit.`);
};
HAND_OPS.brush = (s, fr) => {
  const i = fr.ctx.there; if (i == null || !C.brush) return;
  if (s.bfs[i].orig) return;
  s.bfs[i].orig = s.bfs[i].id; s.bfs[i].id = 'brush'; log(`${bfName(s, i)} now replaces ${cn(s.bfs[i].orig)}.`);
};
HAND_OPS.reflection = (s, fr) => {
  const ctx = fr.ctx; const i = ctx.there; if (i == null) return;
  const others = unitsAt(s, i).map((u) => u.id);
  const cid = tokenCard('Reflection', 'u', null, {});
  const o = newObj(s, { cid, k: 'u', owner: ctx.p, loc: i, ex: false, temp: true });
  if (others.length) {
    let pick = others[0];
    const a = takeAns(fr);
    if (!a && others.length > 1) { s.objs = s.objs.filter((x) => x !== o); s.nid--; return needChoice(s, fr, 'pickObj', { opts: others, why: 'Reflection: copy which unit?', pol: 1 }); }
    if (a) pick = a.v;
    const src = ob(s, pick); if (src) o.copyOf = src.copyOf || src.cid;
  }
  log(`${P(ctx.p)} ${vb(ctx.p, 'make', 'makes')} a Reflection${o.copyOf ? ' of ' + cn(o.copyOf) : ''} at ${bfName(s, i)}.`, ctx.p ? 'ai' : 'you');
  emit(s, 'cardPlayed', { p: ctx.p, cid, obj: o.id, to: i, token: true });
};
HAND_OPS.bomb = (s, fr) => {
  const ctx = fr.ctx; const opts = [0, 1].filter((i) => !bfNoPlay(s, i)); if (!opts.length) return;
  const a = takeAns(fr); if (!a && opts.length > 1) return needChoice(s, fr, 'dest', { opts, why: `${cn(ctx.card)}: play a Bomb to which battlefield?` });
  const to = a ? a.v : opts[0];
  const cid = bombCard();
  newObj(s, { cid, k: 'g', owner: ctx.p, loc: to, ex: false });
  log(`${P(ctx.p)} ${vb(ctx.p, 'play', 'plays')} a Bomb at ${bfName(s, to)}.`, ctx.p ? 'ai' : 'you');
};
function bombCard() {
  if (!C['tok-bomb']) C['tok-bomb'] = { id: 'tok-bomb', n: 'Bomb', t: 'g', d: [], e: 0, pw: 0, p: [], txt: '[Deploy] When this dies, deal 2 to an enemy unit there and kill your other Bombs there.', tags: ['Bomb'], sup: 'token', token: true, kw: { deploy: true }, eqab: [], img: null,
    ab: [{ kind: 'trig', on: 'die', eff: [{ op: 'bombBlast' }] }] };
  return 'tok-bomb';
}
HAND_OPS.bombBlast = (s, fr) => {
  const sn = fr.ctx.snap; if (!sn || sn.deadLoc == null || sn.deadLoc === 'base') return;
  const loc = sn.deadLoc; const p = fr.ctx.p;
  pushChild(s, [{ op: 'deal', n: 2, t: { q: 'one', n: 1, f: { type: 'u', who: 'enemy', where: 'there' } } }], Object.assign({}, fr.ctx, { there: loc, it: [] }));
  for (const o of s.objs.filter((x) => x.cid === 'tok-bomb' && x.ctrl === p && x.loc === loc)) kill(s, o);
};
HAND_OPS.virtuoso = (s, fr) => {
  const ctx = fr.ctx; const t = ctx.trig; if (!t || t.chainId == null) return;
  const item = s.chain.find((x) => x.id === t.chainId); if (!item) return;
  if (!s.players[ctx.p].human) { item.virtuoso = true; return; }
  const a = takeAns(fr); if (!a) return needChoice(s, fr, 'yn', { why: `${cn(ctx.card)}: banish ${cn(item.cid)} with your legend after it resolves?`, yes: 'Banish it', no: 'No' });
  if (a.v === 'yes') item.virtuoso = true;
};
HAND_OPS.playFromLook = (s, fr, op) => {
  const ctx = fr.ctx; const p = ctx.p; const cards = (ctx.look || []).filter((cid) => C[cid].t !== 's' || enumeratePicks(s, p, C[cid].ab.filter((x) => x.kind === 'spell').flatMap((x) => x.eff)).length);
  const ok = cards.filter((cid) => canPay(s, p, { e: C[cid].e || 0, pw: C[cid].p || [] }, { type: C[cid].t }));
  if (!ok.length) return;
  const a = takeAns(fr);
  if (!a) return needChoice(s, fr, 'stack', { cards: [...new Set(ok)], may: true, why: `${cn(ctx.card)}: you may play one (paying its cost)` });
  if (a.v == null || a.v === 'none') return;
  const i = ctx.look.indexOf(a.v); if (i < 0) return; ctx.look.splice(i, 1);
  const c = C[a.v]; const pl = s.players[p];
  pl.hand.push(a.v);
  const me = ob(s, ctx.self); const here = op.here && me && me.loc !== 'base' ? me.loc : null;
  const v = playVariants(s, p, a.v, 'hand', {}).filter((x) => x.to == null || x.to === (here != null ? here : 'base') || x.to === 'base' || C[a.v].t === 's').sort((x, y) => (y.to === here) - (x.to === here))[0];
  if (v && here != null && C[a.v].t === 'u') v.to = here;
  if (!v) { pl.hand.splice(pl.hand.lastIndexOf(a.v), 1); ctx.look.push(a.v); return; }
  playCard(s, p, v);
  if (c.t === 's' && s.mode === 'chain') { /* it resolves through the chain like any spell */ }
};
// Virtuoso: spells banished with the legend
OPS.spellDone0 = OPS.spellDone;
OPS.spellDone = (s, fr, op) => {
  const pl = s.players[op.p];
  if (op.virtuoso) {
    pl.legPile = pl.legPile || []; pl.legPile.push(op.cid); log(`${cn(op.cid)} is banished with ${cn(pl.legend)} (${pl.legPile.length}/4).`); emit(s, 'youBanish', { p: op.p, cid: op.cid });
    if (pl.legPile.length >= 4) { pl.trash.push(...pl.legPile); pl.legPile = []; const g = channel(s, op.p, 4); drawN(s, op.p, 1); log(`${cn(pl.legend)}: ${P(op.p)} ${vb(op.p, 'channel', 'channels')} ${g} runes and ${vb(op.p, 'draw', 'draws')} 1.`); }
    return;
  }
  return OPS.spellDone0(s, fr, op);
};

/* engine v3, part 5: the built-in AI (one-ply search over legal actions with a board evaluation),
   default answers for choices, action labels, and a text description of the state for Claude. */

function cardVal(cid) {
  const c = C[cid]; if (!c) return 0;
  const pw = (c.p || []).length;
  if (c.t === 'u') return (c.m || 0) * 0.6 + (c.e || 0) * 0.3 + pw * 0.4 + (c.sup === 'champion' || (c.tags || []).length ? 0.5 : 0) + (c.ab.length ? 0.4 : 0);
  if (c.t === 'g') return 1.4 + (c.e || 0) * 0.25 + pw * 0.3;
  return 1.8 + (c.e || 0) * 0.35 + pw * 0.4 + (c.sp === 'R' ? 0.4 : 0);
}
function unitVal(s, u) { return might(s, u) + (u.buff ? 0.5 : 0) + (u.emp ? 0.5 : 0) + (C[u.cid].ab.length ? 0.6 : 0) + (u.temp ? -1.5 : 0) + (u.token ? -0.3 : 0); }
let EVAL_LEVEL = 'normal';
function forceAt(s, q, i) { return unitsAt(s, i, q).reduce((x, u) => x + (u.stun ? 0 : might(s, u)), 0); }
function attackForce(s, q, i) { return unitsOf(s, q).filter((u) => !u.noMove && (u.loc === 'base' || (u.loc !== i && hasKw(s, u, 'ganking')))).reduce((x, u) => x + might(s, u), 0); }
function evalHard(s, p) {
  const o = 1 - p; let v = 0;
  const urg = (q) => 1 + Math.max(0, s.players[q].pts - 3) * 0.45;
  for (const i of [0, 1]) {
    if (s.ctrl[i] === o) { v -= 3.5 * urg(o); const def = forceAt(s, o, i), atk = attackForce(s, p, i); v += atk > def ? 3.2 : atk > 0 ? -0.4 * (def - atk > 4 ? 1 : 0) : -1.2; }
    if (s.ctrl[i] === p) { v += 2.2 * urg(p); const def = forceAt(s, p, i), atk = attackForce(s, o, i); v -= atk > def ? 2.6 : 0; }
    if (s.ctrl[i] == null) { v += attackForce(s, p, i) > 0 ? 0.8 : 0; v -= attackForce(s, o, i) > 0 ? 0.8 : 0; }
  }
  const A = s.players[p], B = s.players[o];
  v += (A.pts * A.pts - B.pts * B.pts) * 0.35;
  return v;
}
function evalS(s, p) {
  if (s.winner === p) return 1e5; if (s.winner === 1 - p) return -1e5;
  const o = 1 - p, A = s.players[p], B = s.players[o];
  const mt = (q) => unitsOf(s, q).reduce((x, u) => x + unitVal(s, u), 0);
  const ct = (q) => s.ctrl.filter((c) => c === q).length, at = (q) => unitsOf(s, q).filter((u) => u.loc !== 'base').length;
  const gv = (q) => gearOf(s, q).reduce((x, g) => x + (g.cid === 'tok-gold' ? 0.6 : 0.9), 0), hv = (q) => s.hidden.filter((h) => h.owner === q).length;
  const hand = (q) => s.players[q].hand.reduce((x, c) => x + 0.35 + cardVal(c) * 0.15, 0);
  const reserve = (q) => { const pl = s.players[q]; const fast = pl.hand.filter((c) => C[c] && C[c].t === 's' && (C[c].sp === 'R' || C[c].sp === 'A')); if (!fast.length) return 0; const need = Math.min(4, Math.max(...fast.map((c) => C[c].e || 0))); return Math.min(pl.runes.filter((r) => !r.ex).length, need); };
  const xp = (q) => Math.min(s.players[q].xp, 12) * 0.25;
  return (EVAL_LEVEL === 'hard' ? evalHard(s, p) : 0) + (reserve(p) - reserve(o)) * (EVAL_LEVEL === 'easy' ? 0 : 0.75) + (A.pts - B.pts) * 12 + (ct(p) - ct(o)) * 5 + (mt(p) - mt(o)) * 1.0 + (hand(p) - hand(o)) + (at(p) - at(o)) * 0.4 + (A.runes.length - B.runes.length) * 0.6 + (gv(p) - gv(o)) * 0.8 + (hv(p) - hv(o)) * 1.2 + (A.champ ? 0 : 1.2) + (xp(p) - xp(o)) + (A.legEmp - B.legEmp) * 0.8;
}
// a quick, deterministic answer for any choice (used for the AI and inside its look-ahead)
function selScore(s, id, p, pol, op) {
  if (typeof id === 'number') {
    const o = ob(s, id); if (!o) return -99;
    let v = o.k === 'u' ? unitVal(s, o) : 1.5;
    // an effect that would change nothing on this target is a poor pick
    if ((op === 'stun' && o.stun) || (op === 'ready' && !o.ex) || (op === 'exhaust' && o.ex) || (op === 'buff' && o.buff > 0) || (op === 'heal' && !o.dmg) || (op === 'empower' && o.emp > 0)) v -= 20;
    if (op === 'ready' && o.ex && o.ctrl !== p) v -= 20;
    const mine = o.ctrl === p;
    if (pol < 0) return mine ? -v - 10 : v;
    if (pol > 0) return mine ? v + (o.loc !== 'base' ? 1 : 0) : -v - 10;
    return mine ? v : -v;
  }
  if (typeof id === 'string') {
    if (id[0] === 'S') { const x = s.chain.find((c) => 'S' + c.id === id); return x ? (x.p === p ? -10 : cardVal(x.cid)) : -99; }
    if (id[0] === 'T') { const [q, cid] = id.slice(1).split(':'); return (+q === p ? 1 : 0.5) * cardVal(cid); }
    if (id[0] === 'L') return +id[1] === p ? (pol >= 0 ? 1 : -1) : (pol < 0 ? 1 : -1);
    if (id[0] === 'H') return 0;
  }
  return 0;
}
// small decisions (where, which mode, yes/no, single targets) are tried out one level deep
let _pickDepth = 0;
function defaultPick(s) {
  const ch = s.choice;
  if (_pickDepth === 0 && ['dest', 'mode', 'yn', 'player', 'pickObj', 'sel'].includes(ch.kind) && !(ch.kind === 'sel' && (ch.data.upto || (ch.data.n || 1) > 1))) {
    const opts = choiceOpts(s);
    if (opts.length > 1 && opts.length <= 8) {
      _pickDepth++; const prev = logOn; logOn = false;
      try {
        let best = null, bv = -Infinity;
        for (const o of opts) { const c = clone(s); try { finishChoice(c, o.v); settle(c); } catch (e) { continue; } const v = evalS(c, ch.p); if (v > bv) { bv = v; best = o.v; } }
        if (best !== null || bv > -Infinity) return best;
      } finally { _pickDepth--; logOn = prev; }
    }
  }
  return defaultPick0(s);
}
function defaultPick0(s) {
  const ch = s.choice, d = ch.data, p = ch.p, opts = choiceOpts(s);
  switch (ch.kind) {
    case 'discard': return d.opts.slice().sort((a, b) => cardVal(a) - cardVal(b))[0];
    case 'stack': { const c = d.cards.slice().sort((a, b) => cardVal(b) - cardVal(a))[0]; return c; }
    case 'vision': return cardVal(d.top) < 2.4 ? 'recycle' : 'keep';
    case 'yn': {
      if (d.eff && d.eff[0] && ['discard', 'kill', 'banish'].includes(d.eff[0].op) && d.eff[0].t && d.eff[0].t.f && d.eff[0].t.f.who === 'friendly') return 'no';
      return 'yes';
    }
    case 'player': return d.opts.includes(1 - p) ? 1 - p : d.opts[0];
    case 'mode': return d.opts[0];
    case 'dest': {
      const pref = d.opts.slice().sort((a, b) => destScore(s, p, b) - destScore(s, p, a));
      return pref[0];
    }
    case 'rune': return d.opts[0];
    case 'pickObj': { const o = d.opts.filter((x) => x !== 'none'); if (!o.length) return 'none'; return o.slice().sort((a, b) => selScore(s, b, p, d.pol || 1, d.op) - selScore(s, a, p, d.pol || 1, d.op))[0]; }
    case 'tag': return bestTag(s, 1 - p, d.opts);
    case 'sel': {
      const pol = d.pol || 0; const ranked = d.opts.slice().sort((a, b) => selScore(s, b, p, pol, d.op) - selScore(s, a, p, pol, d.op));
      if (d.upto || (d.n || 1) > 1) {
        let pick = ranked.filter((id) => selScore(s, id, p, pol, d.op) > -5).slice(0, d.n || 1);
        if (d.same && pick.length) { const o0 = ob(s, pick[0]); if (o0) pick = pick.filter((id) => { const x = ob(s, id); return x && x.loc === o0.loc; }); }
        if (!d.upto && pick.length < (d.n || 1)) pick = ranked.slice(0, d.n || 1);
        return pick;
      }
      return ranked[0];
    }
    default: return opts.length ? opts[0].v : null;
  }
}
function destScore(s, p, x) {
  if (x === 'base') return 0;
  const enemy = forceAt(s, 1 - p, x), mine = forceAt(s, p, x);
  return s.ctrl[x] === p ? 1 : enemy === 0 ? 3 : mine > enemy ? 2 : -1;
}
function bestTag(s, q, opts) {
  const cnt = {}; const pl = s.players[q];
  for (const cid of pl.deck.concat(pl.hand, pl.trash)) for (const t of (C[cid] && C[cid].tags) || []) cnt[t] = (cnt[t] || 0) + 1;
  for (const u of unitsOf(s, q)) for (const t of tagsOf(s, u)) cnt[t] = (cnt[t] || 0) + 3;
  const list = (opts || Object.keys(cnt)).slice().sort((a, b) => (cnt[b] || 0) - (cnt[a] || 0));
  return list[0];
}
function settle(c) {
  for (let i = 0; i < 400; i++) {
    advance(c); if (c.winner != null) return;
    if (c.choice) { finishChoice(c, defaultPick(c)); continue; }
    if (c.mode === 'chain' || c.mode === 'showdown') { apply(c, { t: 'pass' }); continue; }
    return;
  }
}
// apply a 'pick' the same way the UI does (multi-picks are added one by one)
function answer(s, v) {
  if (Array.isArray(v) && s.choice && s.choice.kind === 'sel' && (s.choice.data.upto || (s.choice.data.n || 1) > 1)) {
    for (const id of v) { if (!s.choice || s.choice.kind !== 'sel') break; apply(s, { t: 'pick', v: { add: id } }); }
    if (s.choice && s.choice.kind === 'sel' && (s.choice.data.upto || (s.choice.data.n || 1) > 1)) apply(s, { t: 'pick', v: { done: true } });
    return;
  }
  apply(s, { t: 'pick', v });
}
function simVal(s, a, p) { const c = clone(s); try { apply(c, a); settle(c); } catch (e) { return -1e4; } return evalS(c, p); }
function aiHeuristic(s, p, level) {
  level = level || 'normal'; const prevL = EVAL_LEVEL; EVAL_LEVEL = level;
  const acts = legal(s, p); if (acts.length <= 1) { EVAL_LEVEL = prevL; return acts[0]; }
  const prev = logOn; logOn = false;
  try {
    if (s.choice) {
      const ch = s.choice;
      if (ch.kind === 'sel' && (ch.data.upto || (ch.data.n || 1) > 1)) {
        const want = defaultPick(s); const cur = ch.data.cur || [];
        const nxt = (want || []).find((id) => !cur.includes(id));
        return acts.find((a) => a.v && a.v.add === nxt) || acts.find((a) => a.v && a.v.done) || acts[0];
      }
      if (level !== 'easy' && acts.length <= 16) {
        let best = null, bv = -Infinity;
        for (const a of acts) { const v = simVal(s, a, p); if (v > bv) { bv = v; best = a; } }
        if (best) return best;
      }
      const v = defaultPick(s); return acts.find((a) => a.v === v) || acts[0];
    }
    const passA = acts.find((a) => a.t === 'pass' || a.t === 'end');
    const base = passA.t === 'pass' ? simVal(s, passA, p) : evalS(s, p);
    const cands = acts.filter((a) => a !== passA).slice(0, 160);
    const scored = cands.map((a) => ({ a, v: simVal(s, a, p) })).sort((x, y) => y.v - x.v);
    if (level === 'easy') {
      if (Math.random() < 0.12 || !scored.length) return passA;
      const top = scored.slice(0, 3).filter((x) => x.v > base - 2); if (!top.length) return passA;
      return top[Math.floor(Math.random() * top.length)].a;
    }
    let best = passA, bv = base + (passA.t === 'end' ? 0.35 : 0.25);
    if (level === 'hard' && s.mode === 'main' && s.active === p) {
      for (const x of scored.slice(0, 10)) {
        const c = clone(s); try { apply(c, x.a); settle(c); } catch (e) { continue; }
        let v2 = evalS(c, p);
        if (c.winner == null && actor(c) === p && c.mode === 'main') {
          for (const b of legal(c, p).filter((a) => a.t !== 'end').slice(0, 90)) { const w = simVal(c, b, p); if (w > v2) v2 = w; }
        }
        const v = Math.max(x.v, v2 - 0.15);
        if (v > bv) { bv = v; best = x.a; }
      }
      return best;
    }
    for (const x of scored) if (x.v > bv) { bv = x.v; best = x.a; }
    return best;
  } finally { logOn = prev; EVAL_LEVEL = prevL; }
}

/* ---------------- labels ---------------- */
function abText(ab) {
  if (!ab) return '';
  if (ab.text) return ab.text;
  return maySummary(ab.eff);
}
function actText(s, a, persp) {
  const p = persp != null ? persp : actor(s) != null ? actor(s) : s.active;
  if (a.t === 'end') return 'End turn';
  if (a.t === 'pass') return 'Pass';
  if (a.t === 'pick') return a.label || String(a.v);
  if (a.t === 'move') return `Move ${a.ids.map((id) => cn(ob(s, id).cid)).join(' + ')} to ${bfName(s, a.to)}`;
  if (a.t === 'hide') return `Hide ${cn(a.cid)} at ${bfName(s, a.bf)}`;
  if (a.t === 'equip') return `Equip ${cn(ob(s, a.g).cid)} to ${cn(ob(s, a.u).cid)}`;
  if (a.t === 'emp') return `Empower ${a.o === 'L' ? cn(s.players[p].legend) : cn(ob(s, a.o).cid)}`;
  const k = actionCost(s, p, a); const costT = ` [${k.e}E${k.pw.length ? ' +' + k.pw.length + 'P' : ''}]`;
  if (a.t === 'ab') {
    const nm = a.src === 'L' ? cn(s.players[p].legend) : cn(ob(s, a.src).cid);
    return `${nm}: ${abText(abilityOf(s, a))}${pickText(s, a.picks, p)}${costT}`;
  }
  const c = C[a.cid];
  let t = `${c.t === 's' ? 'Cast' : 'Play'} ${c.n}`;
  if (c.t === 'u' && a.to !== 'base') t += ' to ' + bfName(s, a.to);
  t += pickText(s, a.picks, p);
  if (a.src === 'hidden') t += ' (from hiding)'; if (a.src === 'flow') t += ' (from trash)'; if (a.src === 'champ') t += ' (champion)';
  if (a.rep) t += ' + Repeat'; if (a.acc) t += ' + Accelerate'; if (a.extra) t += ' + extra cost';
  return t + costT;
}

/* ---------------- state as text for Claude ---------------- */
function describe(s, p) {
  const o = 1 - p, me = s.players[p], op = s.players[o], L = [];
  const uS = (u) => { const k = kwOf(s, u); return `${cn(u.cid)} [id ${u.id}] (${might(s, u)} might${u.dmg ? `, ${u.dmg} damage` : ''}${eqOf(s, u).length ? ', equipped: ' + eqOf(s, u).map((g) => cn(g.cid)).join('+') : ''}${Object.keys(k).length ? ', ' + Object.keys(k).join(', ') : ''}${u.ex ? ', exhausted' : ', ready'}${u.stun ? ', stunned' : ''}${u.buff ? ', buffed' : ''}${u.temp ? ', temporary' : ''})`; };
  const rs = (pl) => { const r = pl.runes; return `${r.filter((x) => !x.ex).length} ready of ${r.length} runes (${Object.keys(DOMS).map((d) => { const n = r.filter((x) => x.d === d).length; return n ? `${DOMS[d]} ${n}` : ''; }).filter(Boolean).join(', ')})`; };
  L.push(`Turn ${s.turnNo}, ${s.active === p ? 'your' : "opponent's"} turn. Score: you ${me.pts}, opponent ${op.pts}. First to ${winScore(s)}. XP: you ${me.xp}, opponent ${op.xp}.`);
  L.push(`Phase: ${s.mode === 'chain' ? 'chain open (only Reactions)' : s.mode === 'showdown' ? `showdown at ${bfName(s, s.sd.bf)} (${s.sd.att === p ? 'you' : 'opponent'} attacking)` : 'main phase'}.`);
  if (s.chain.length) L.push(`Chain (top first): ${s.chain.slice().reverse().map((x) => `${x.p === p ? 'your' : "opponent's"} ${cn(x.cid)}${x.countered ? ' (countered)' : ''}`).join('; ')}.`);
  L.push(`Your legend ${cn(me.legend)} (${me.legEx ? 'exhausted' : 'ready'}): ${C[me.legend] ? C[me.legend].txt : ''}`);
  L.push(`Opponent legend ${cn(op.legend)} (${op.legEx ? 'exhausted' : 'ready'}): ${C[op.legend] ? C[op.legend].txt : ''}`);
  L.push(`Your runes: ${rs(me)}. Opponent runes: ${rs(op)}.`);
  L.push(`Your hand: ${me.hand.map((c) => `${cn(c)} {${C[c].e}E${C[c].p.length ? '+' + C[c].p.length + 'P' : ''}${C[c].t === 'u' ? ', ' + C[c].m + ' might' : ''}${C[c].sp ? ', ' + SPEED[C[c].sp] : ''}: ${C[c].txt}}`).join('; ') || 'empty'}.`);
  L.push(`Champion zone: you ${me.champ ? cn(me.champ) : '(played)'}, opponent ${op.champ ? cn(op.champ) : '(played)'}. Opponent hand: ${op.hand.length} cards${s.reveal[o] ? ': ' + op.hand.map(cn).join(', ') : ''}. Decks: you ${me.deck.length}, opponent ${op.deck.length}.`);
  [0, 1].forEach((i) => {
    const b = C[s.bfs[i].id];
    L.push(`Battlefield ${b ? b.n : '?'} (${b ? b.txt : ''}) — ${s.ctrl[i] == null ? 'uncontrolled' : s.ctrl[i] === p ? 'you control' : 'opponent controls'}. Your units: ${unitsAt(s, i, p).map(uS).join('; ') || 'none'}. Enemy units: ${unitsAt(s, i, o).map(uS).join('; ') || 'none'}. Your hidden card: ${s.hidden.filter((h) => h.owner === p && h.bf === i).map((h) => cn(h.cid)).join(', ') || 'none'}. Enemy hidden cards: ${s.hidden.filter((h) => h.owner === o && h.bf === i).length}.`);
  });
  const gS = (g) => cn(g.cid) + (g.ex ? ' (exhausted)' : '') + (g.att != null && ob(s, g.att) ? ' on ' + cn(ob(s, g.att).cid) : '');
  L.push(`Your base: ${unitsAt(s, 'base', p).map(uS).join('; ') || 'no units'}; gear: ${gearOf(s, p).map(gS).join(', ') || 'none'}.`);
  L.push(`Enemy base: ${unitsAt(s, 'base', o).map(uS).join('; ') || 'no units'}; gear: ${gearOf(s, o).map(gS).join(', ') || 'none'}.`);
  return L.join('\n');
}
const RULES = `Riftbound 1v1 rules as played here: first to ${BASE_WIN} points. Two battlefields. Each turn: ready your cards, score 1 for each battlefield you control (Hold), channel 2 runes (3 on the second player's first turn), draw 1. Exhaust a rune for 1 energy; recycle a rune of the right domain for 1 power. Units enter exhausted at base or a battlefield you control. Exhaust a ready unit to move base<->battlefield; battlefield to battlefield needs Ganking. Moving into a battlefield you don't control opens a showdown: players alternate playing Action or Reaction cards until both pass, then if both sides have units there is combat. If both sides survive, attackers are recalled. If only the attacker remains they Conquer (+1, each battlefield scores once per turn). The final point can't come from a conquer unless you scored the other battlefield this turn. Spells: Normal on your own main phase only; Action also in showdowns; Reaction any time. Card text is followed as printed.`;

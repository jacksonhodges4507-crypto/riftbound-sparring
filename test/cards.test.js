const { RB, C, scene, find, acts, play, pick, passAll, logText, check, done } = require('./lib');
const T = (name, fn) => { try { fn(); } catch (e) { check(name, false, e.message.slice(0, 300)); } };

T('swift-scout returns Teemo from champion zone', () => {
  const s = scene({ p0: { legend: 'swift-scout', champ: 'teemo-strategist', runes: ['mind', 'mind'] } });
  const a = acts(s).find((x) => x.t === 'ab' && x.src === 'L'); check('scout ability offered', !!a);
  RB.apply(s, a); check('teemo in hand', s.players[0].hand.includes('teemo-strategist'), s.players[0].hand);
});
T('swift-scout hide for energy', () => {
  const s = scene({ p0: { legend: 'swift-scout', hand: ['teemo-strategist'], bf0: ['patched-porobot'], runes: ['mind'] }, ctrl: [0, null] });
  const h = acts(s).filter((x) => x.t === 'hide'); check('two hide options (power or energy)', h.length === 2, h.length);
});
T('blade-dancer readies chosen friendly unit', () => {
  const s = scene({ p0: { legend: 'blade-dancer', hand: ['discipline'], base: [{ cid: 'patched-porobot', ex: true }], runes: ['calm', 'calm', 'calm'] } });
  play(s, 'discipline', (a) => a.picks[0] === find(s, 'patched-porobot').id);
  // blade dancer trigger: pay power and exhaust legend?
  if (s.choice) pick(s, (x) => x.v === 'yes');
  passAll(s);
  check('porobot readied', !find(s, 'patched-porobot').ex, logText());
});
T('deathknell draws (watchful-sentry)', () => {
  const s = scene({ p0: { base: ['watchful-sentry'], hand: [] , deck: ['patched-porobot', 'patched-porobot'] }, p1: { hand: [] }, first: 1 });
  s.active = 1; const u = find(s, 'watchful-sentry'); RB.OPS.kill; // kill directly
  s.exec.push({ eff: [{ op: 'kill', t: { q: 'it' } }], i: 0, ctx: { p: 1, it: [u.id], picks: [], pi: 0 } }); RB.advance(s);
  check('drew a card', s.players[0].hand.length === 1, logText());
});
T('hunt gives xp on conquer', () => {
  const s = scene({ p0: { base: ['crowd-favorite'] } });
  const mv = acts(s).find((x) => x.t === 'move' && x.to === 0); RB.apply(s, mv); passAll(s);
  check('xp 1', s.players[0].xp === 1, logText());
});
T('avalanche hits bases only', () => {
  const s = scene({ p0: { hand: ['avalanche'], base: ['patched-porobot'], bf0: ['swain-visionary'], runes: ['body', 'body', 'body', 'body', 'body', 'body', 'body'] } });
  play(s, 'avalanche'); passAll(s);
  check('porobot died', !find(s, 'patched-porobot'), logText()); check('swain alive', !!find(s, 'swain-visionary'));
});
T('acceptable losses: each player kills a gear', () => {
  const s = scene({ p0: { hand: ['acceptable-losses'], gear: ['treasure-trove'], runes: ['chaos', 'chaos'] }, p1: { gear: ['pack-of-wonders'] } });
  play(s, 'acceptable-losses'); passAll(s); for (let i = 0; i < 3 && s.choice; i++) { RB.apply(s, acts(s)[0]); passAll(s); }
  check('no gear left', !s.objs.some((o) => o.k === 'g'), logText());
});
T('bullet time X damage', () => {
  const s = scene({ p0: { hand: ['bullet-time'], runes: ['body', 'body', 'body', 'body'] }, p1: { bf0: ['patched-porobot', 'patched-porobot'] } });
  const v = acts(s).filter((x) => x.t === 'play' && x.cid === 'bullet-time'); check('X variants', v.length >= 3, v.length);
  RB.apply(s, v.find((x) => x.x === 2)); passAll(s); if (s.choice) { pick(s, (x) => x.v === 0); passAll(s); }
  check('both porobots dead', !find(s, 'patched-porobot'), logText());
});
T('teemo strategist from hidden reveals and pings', () => {
  const s = scene({ p0: { bf0: ['patched-porobot'], deck: ['teemo-strategist', 'switcheroo', 'gust', 'bandle-tree', 'temporal-breach', 'stupefy'], runes: ['mind', 'mind', 'chaos'] }, p1: { bf0: [] }, ctrl: [0, null] });
  s.hidden.push({ id: 999, cid: 'teemo-strategist', owner: 0, bf: 0, turn: 1 });
  const p1u = RB.newObj(s, { cid: 'patched-porobot', k: 'u', owner: 1, loc: 0, ex: false }); s.ctrl[0] = 0;
  s.mode = 'showdown'; s.sd = { bf: 0, att: 1, prev: 0, focus: 0, passes: 0, combat: true };
  const a = acts(s).find((x) => x.t === 'play' && x.src === 'hidden'); check('teemo playable from hiding in showdown', !!a); RB.apply(s, a); s.autoAll = true; passAll(s);
  check('teemo dealt damage (3 hidden cards in top 5)', /finds 3 cards with \[Hidden\]/.test(logText()), logText());
});
T('teemo strategist on defend', () => {
  const s = scene({ p0: { bf0: ['teemo-strategist'], deck: ['teemo-strategist', 'switcheroo', 'gust', 'gust', 'gust'] }, p1: { base: ['swain-visionary'] }, first: 1 });
  s.active = 1; RB.apply(s, acts(s, 1).find((x) => x.t === 'move' && x.to === 0)); s.autoAll = true; passAll(s);
  check('defend trigger revealed', /finds 2 cards with \[Hidden\]/.test(logText()), logText());
});
T('stormbringer hits one battlefield and moves the unit there', () => {
  const s = scene({ p0: { hand: ['stormbringer'], base: ['swain-visionary'], runes: ['fury','fury','fury','fury','fury','fury','body','body'] }, p1: { bf0: ['patched-porobot'], bf1: ['patched-porobot'] } });
  play(s, 'stormbringer'); passAll(s);
  for (let i = 0; i < 6 && s.choice; i++) { if (s.choice.kind === 'dest') pick(s, (x) => x.v === 0); else pick(s, () => true); passAll(s); }
  check('enemy at bf0 dead', !RB.unitsAt(s, 0, 1).length, logText());
  check('enemy at bf1 alive', RB.unitsAt(s, 1, 1).length === 1, logText());
  check('swain moved to bf0', find(s, 'swain-visionary').loc === 0, logText());
});
T('scorn of the moon pays for a showdown spell', () => {
  const s = scene({ p0: { legend: 'scorn-of-the-moon', hand: ['ride-the-wind'], bf0: ['patched-porobot'], runes: ['chaos'] }, p1: { bf0: ['patched-porobot'] }, ctrl: [0, null] });
  s.mode = 'showdown'; s.sd = { bf: 0, att: 0, prev: 0, focus: 0, passes: 0, combat: true };
  const a = acts(s).find((x) => x.t === 'play' && x.cid === 'ride-the-wind'); check('ride the wind castable with legend energy', !!a, acts(s).map((x) => RB.actText(s, x)).join(' | '));
  if (a) { RB.apply(s, a); check('legend exhausted to pay', s.players[0].legEx); }
  s.sd = null; s.mode = 'main'; s.players[0].legEx = false;
  check('not usable outside showdowns', !acts(s).some((x) => x.t === 'play' && x.cid === 'ride-the-wind') || s.players[0].hand.indexOf('ride-the-wind') < 0);
});
T('grand duelist sees a unit become mighty from a buff', () => {
  const s = scene({ p0: { legend: 'grand-duelist', hand: ['discipline'], base: [{ cid: 'swain-visionary', mod: -2 }], runes: ['calm', 'calm', 'calm'] } });
  RB.advance(s); const before = s.players[0].runes.length;
  play(s, 'discipline'); s.autoAll = true; passAll(s);
  check('channelled a rune', s.players[0].runes.length === before + 1, logText());
});
T('vex apathetic: a unit played against it is stunned and cannot be moved, even by spells', () => {
  const s = scene({ p0: { hand: ['fizz-trickster', 'ride-the-wind'], runes: ['chaos', 'chaos', 'chaos', 'chaos', 'chaos', 'chaos', 'chaos'] }, p1: { bf0: ['vex-apathetic'] } });
  s.autoAll = true; play(s, 'fizz-trickster'); passAll(s);
  const f = find(s, 'fizz-trickster'); check('fizz stunned', f && f.stun, logText()); check('fizz cannot move', f && f.noMove);
  const rides = acts(s).filter((x) => x.t === 'play' && x.cid === 'ride-the-wind');
  check('ride the wind cannot choose fizz', !rides.some((x) => (x.picks || []).includes(f.id)), rides.map((x) => RB.actText(s, x)).join(' | '));
  check('no normal move for fizz', !acts(s).some((x) => x.t === 'move' && x.ids.includes(f.id)));
});
T('gold can be cashed in by clicking it, and pool power pays a manual payment', () => {
  const s = scene({ p0: { hand: ['ride-the-wind'], base: ['patched-porobot'], gear: [{ cid: 'tok-gold', ex: false }], runes: ['mind', 'mind'] } });
  const g = find(s, 'tok-gold'); const ab = RB.legal(s, 0, { mana: true }).find((x) => x.t === 'ab' && x.src === g.id);
  check('gold usable as an action', !!ab); RB.apply(s, ab); passAll(s);
  check('gold gone, power in pool', !find(s, 'tok-gold') && s.players[0].pool.some((x) => x.p), JSON.stringify(s.players[0].pool));
  const a = acts(s).find((x) => x.t === 'play' && x.cid === 'ride-the-wind'); check('ride the wind playable from pool + runes', !!a);
  const mp = { ex: s.players[0].runes.map((r) => r.id), rc: [], gold: [] };
  check('manual payment with pool power is valid', RB.checkManualPay(s, 0, RB.actionCost(s, 0, a), mp));
  RB.apply(s, Object.assign({}, a, { mp })); check('cast', /cast Ride the Wind/.test(logText()), logText()); check('pool spent', !s.players[0].pool.length);
});
done();

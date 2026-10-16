const { RB, C, scene, find, acts, play, pick, passAll, logText, check, done } = require('./lib');
const T = (name, fn) => { try { fn(); } catch (e) { check(name, false, e.message.slice(0, 400)); } };
const R = (d, n) => Array(n).fill(d);
const settleAI = (s) => { for (let i = 0; i < 60; i++) { RB.advance(s); const p = RB.actor(s); if (p == null || s.winner != null) return; if (p === 0 && s.choice) return; if (p === 0) { const pa = acts(s, 0).find((x) => x.t === 'pass'); if (!pa) return; RB.apply(s, pa); continue; } RB.apply(s, RB.aiHeuristic(s, 1, 'normal')); } };

T('gust returns small unit at battlefield', () => {
  const s = scene({ p0: { hand: ['gust'], runes: R('chaos', 2) }, p1: { bf0: ['patched-porobot'], base: ['patched-porobot'] } });
  play(s, 'gust'); passAll(s);
  check('gust: unit at bf returned', s.players[1].hand.includes('patched-porobot') && RB.unitsAt(s, 0, 1).length === 0, logText());
});
T('abandon counters and returns to hand', () => {
  const s = scene({ p0: { hand: ['discipline'], base: ['patched-porobot'], runes: R('calm', 3) }, p1: { hand: ['abandon'], runes: R('chaos', 3) }, bothHuman: true });
  s.autoAll = true; play(s, 'discipline'); const a = acts(s, 1).find((x) => x.t === 'play' && x.cid === 'abandon'); check('abandon offered on chain', !!a); RB.apply(s, a); passAll(s);
  check('discipline back in hand', s.players[0].hand.includes('discipline'), logText());
});
T('switcheroo swaps might', () => {
  const s = scene({ p0: { hand: ['switcheroo'], bf0: ['patched-porobot'], runes: R('chaos', 4) }, p1: { bf0: ['swain-visionary'] } });
  play(s, 'switcheroo', (a) => a.picks.length === 2 && RB.ob(s, a.picks[0]).cid === 'patched-porobot'); passAll(s);
  check('porobot now 6 might', RB.might(s, find(s, 'patched-porobot')) === 6, logText());
});
T('ride the wind moves and readies', () => {
  const s = scene({ p0: { hand: ['ride-the-wind'], base: [{ cid: 'patched-porobot', ex: true }], runes: R('chaos', 3) } });
  play(s, 'ride-the-wind'); passAll(s); if (s.choice) pick(s, (x) => x.v === 1); passAll(s);
  const u = find(s, 'patched-porobot'); check('moved and ready', u && u.loc === 1 && !u.ex, logText());
});
T('temporal breach blinks with play trigger', () => {
  const s = scene({ p0: { hand: ['temporal-breach'], bf0: ['scuttle-crab'], deck: R('patched-porobot', 5), runes: R('mind', 3) } });
  play(s, 'temporal-breach'); passAll(s); RB.advance(s);
  const u = find(s, 'scuttle-crab'); check('crab back at bf0 and drew', u && u.loc === 0 && s.players[0].hand.length === 1, logText());
});
T('moonfall pulls and shrinks', () => {
  const s = scene({ p0: { hand: ['moonfall'], bf0: ['patched-porobot'], runes: R('mind', 2).concat(R('chaos', 2)) }, p1: { base: ['swain-visionary'], bf0: ['ravenbloom-student'] } });
  play(s, 'moonfall'); passAll(s);
  for (let i = 0; i < 4 && s.choice; i++) { const ch = s.choice; if (ch.kind === 'yn') pick(s, (x) => x.v === 'yes'); else if (ch.kind === 'sel') pick(s, (x) => RB.ob(s, x.v) && RB.ob(s, x.v).cid === 'swain-visionary'); else RB.apply(s, acts(s)[0]); RB.advance(s); }
  const sw = find(s, 'swain-visionary'); check('swain pulled to bf0 and -2', sw && sw.loc === 0 && RB.might(s, sw) === 4, logText());
});
T('treasure trove leaves: draw + channel', () => {
  const s = scene({ p0: { gear: ['treasure-trove'], deck: R('patched-porobot', 4), runes: R('chaos', 1) } });
  const a = acts(s).find((x) => x.t === 'ab'); check('kill ability offered', !!a); RB.apply(s, a); RB.advance(s);
  check('drew and channeled', s.players[0].hand.length === 1 && s.players[0].runes.length === 1, logText());
});
T('bellows breath hits up to 3 at one location', () => {
  RB.tokenCard('Recruit', 'u', 1, {}); const s = scene({ p0: { hand: ['bellows-breath'], runes: R('mind', 2) }, p1: { bf0: ['tok-recruit-1', 'tok-recruit-1'], base: ['tok-recruit-1'] } });
  play(s, 'bellows-breath', (a) => !a.rep); passAll(s);
  for (let i = 0; i < 5 && s.choice; i++) { const opt = acts(s).find((x) => x.v && x.v.add != null && RB.ob(s, x.v.add).loc === 0) || acts(s).find((x) => x.v && x.v.done); RB.apply(s, opt); }
  check('two recruits at bf0 died', RB.unitsAt(s, 0, 1).length === 0 && RB.unitsAt(s, 'base', 1).length === 1, logText());
});
T('hard bargain: AI pays to keep its spell', () => {
  const s = scene({ p0: { hand: ['hard-bargain'], runes: R('chaos', 3) }, p1: { hand: ['discipline'], base: ['patched-porobot'], runes: R('calm', 4) }, first: 1 });
  s.active = 1; RB.apply(s, acts(s, 1).find((x) => x.t === 'play' && x.cid === 'discipline'));
  const hb = acts(s, 0).find((x) => x.t === 'play' && x.cid === 'hard-bargain' && !x.rep); RB.apply(s, hb); passAll(s);
  check('AI paid 2 to keep discipline', /pays 2 to keep/.test(logText()), logText());
});
T('scorn of the moon adds showdown energy', () => {
  const s = scene({ p0: { legend: 'scorn-of-the-moon', base: ['patched-porobot'], hand: ['stupefy'], runes: [] }, p1: { bf0: ['ravenbloom-student'] } });
  RB.apply(s, acts(s).find((x) => x.t === 'move' && x.to === 0));
  check('in showdown, stupefy castable via Scorn', RB.actor(s) === 0 && acts(s).some((x) => x.t === 'play' && x.cid === 'stupefy'), JSON.stringify({ mode: s.mode, actor: RB.actor(s) }) + logText());
});
T('diana lunari predicts on showdown', () => {
  const s = scene({ p0: { bf0: ['diana-lunari'], base: [], runes: R('mind', 2), deck: ['stupefy', 'patched-porobot'] }, p1: { base: ['patched-porobot'] }, first: 1 });
  s.active = 1; RB.apply(s, acts(s, 1).find((x) => x.t === 'move' && x.to === 0));
  for (let i = 0; i < 4 && s.choice; i++) { const ch = s.choice; if (ch.kind === 'yn') pick(s, (x) => x.v === 'yes'); else if (ch.kind === 'vision') pick(s, (x) => x.v === 'keep'); else RB.apply(s, acts(s)[0]); RB.advance(s); }
  check('drew the spell', s.players[0].hand.includes('stupefy'), logText());
});
T('frozen fortress pings at beginning', () => {
  const s = scene({ p0: { bf0: ['patched-porobot'] }, bfs: ['frozen-fortress', 'veiled-temple'] });
  RB.apply(s, { t: 'end' }); settleAI(s);
  const u = find(s, 'patched-porobot'); check('porobot damaged 1 on opponent beginning', u && (u.dmg === 1 || /deals 1 to Patched Porobot/.test(logText())), logText());
});
T('boots give ganking', () => {
  const s = scene({ p0: { bf0: ['patched-porobot'], gear: ['boots-of-swiftness'], runes: R('chaos', 2) } });
  const eq = acts(s).find((x) => x.t === 'equip'); RB.apply(s, eq);
  check('can move bf to bf', acts(s).some((x) => x.t === 'move' && x.to === 1), logText());
});
T('bewitching spirit: chosen player discards', () => {
  const s = scene({ p0: { hand: ['bewitching-spirit'], runes: R('chaos', 3) }, p1: { hand: ['gust', 'stupefy'] } });
  play(s, 'bewitching-spirit'); RB.advance(s); if (s.choice && s.choice.kind === 'player') pick(s, (x) => x.v === 1); passAll(s);
  check('AI discarded 1', s.players[1].hand.length === 1, logText());
});
T('ezreal prodigy discards 1 draws 2', () => {
  const s = scene({ p0: { hand: ['ezreal-prodigy', 'gust'], deck: R('stupefy', 4), runes: R('chaos', 4) } });
  play(s, 'ezreal-prodigy'); RB.advance(s); if (s.choice) RB.apply(s, acts(s)[0]); RB.advance(s);
  check('hand is 2', s.players[0].hand.length === 2, logText());
});
T('prodigal explorer after choosing enemies twice', () => {
  const s = scene({ p0: { legend: 'prodigal-explorer', hand: ['stupefy', 'stupefy'], deck: R('gust', 5), runes: R('mind', 2) }, p1: { base: ['patched-porobot'] } });
  play(s, 'stupefy'); passAll(s); play(s, 'stupefy'); passAll(s);
  check('legend usable', acts(s).some((x) => x.t === 'ab' && x.src === 'L'), logText());
});
T('irelia fervent +1 when chosen', () => {
  const s = scene({ p0: { hand: ['discipline'], base: ['irelia-fervent'], runes: R('calm', 2) } });
  play(s, 'discipline'); passAll(s);
  check('irelia 4+1+2=7', RB.might(s, find(s, 'irelia-fervent')) === 7, String(RB.might(s, find(s, 'irelia-fervent'))) + logText());
});
T("kai'sa legend pays power for a spell only", () => {
  const s = scene({ p0: { legend: 'daughter-of-the-void', hand: ['eclipse', 'ferrous-forerunner'], runes: R('fury', 3) }, p1: { bf0: ['swain-visionary'] } });
  check('eclipse castable (3 energy, no mind rune needed? needs legend for nothing)', acts(s).some((x) => x.t === 'play' && x.cid === 'eclipse'));
  const s2 = scene({ p0: { legend: 'daughter-of-the-void', hand: ['hextech-ray', 'noxus-hopeful'], runes: R('mind', 3) }, p1: { bf0: ['swain-visionary'] } });
  const hr = RB.C['hextech-ray']; check('hextech ray needs fury power and legend supplies it', acts(s2).some((x) => x.t === 'play' && x.cid === 'hextech-ray'), JSON.stringify(hr.p));
  const a = acts(s2).find((x) => x.t === 'play' && x.cid === 'hextech-ray'); RB.apply(s2, a); check('legend exhausted', s2.players[0].legEx);
});
T('void gate adds bonus damage', () => {
  const s = scene({ p0: { hand: ['hextech-ray'], runes: R('fury', 4) }, p1: { bf0: ['swain-visionary'] }, bfs: ['void-gate', 'rockfall-path'] });
  play(s, 'hextech-ray'); passAll(s); check('4 damage dealt', /deals 4 to Swain/.test(logText()), logText());
});
T('time warp takes another turn', () => {
  const s = scene({ p0: { hand: ['time-warp'], runes: R('mind', 14) } });
  play(s, 'time-warp'); passAll(s); RB.apply(s, acts(s).find((x) => x.t === 'end')); settleAI(s);
  check('still my turn after ending', s.active === 0, logText()); check('time warp banished', s.players[0].banished.includes('time-warp'));
});
done();

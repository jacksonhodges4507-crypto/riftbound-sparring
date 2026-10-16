// Play every spell / unit / gear from hand onto a busy board and check that its printed effect visibly does something.
// Reports: crashes, "not automated" logs, and cards whose play changed nothing beyond the card itself entering play.
const { RB, C, scene } = require('../test/lib');
const only = process.argv[2];
const sig = (s) => JSON.stringify({
  objs: s.objs.map((o) => [o.id, o.cid, o.ctrl, o.loc, o.ex, o.dmg, o.mod, o.buff, o.emp, o.stun, o.att, Object.keys(o.kwT || {}).join() + '|' + Object.keys(o.kwP || {}).join(), o.temp, o.dbl, o.prevent]).sort(),
  pl: s.players.map((p) => [p.hand.length, p.deck.slice(0, 6).join(), p.trash.length, p.banished.length, p.pts, p.xp, p.runes.length, p.runes.filter((r) => r.ex).length, p.legEx, p.legEmp, p.pool.length, (p.playable || []).length, p.deck.length]),
  ctrl: s.ctrl, fx: JSON.stringify(s.turnFx), del: s.delayed.length, hid: s.hidden.length, chain: s.chain.length, bfs: s.bfs.map((b) => b.id).join(),
});
const res = { crash: [], unauto: [], noop: [], unplayable: [], ok: 0 };
const deck = ['patched-porobot', 'gust', 'swain-visionary', 'temporal-breach', 'stupefy', 'hwei-brooding-painter', 'tideturner', 'morbid-return', 'ride-the-wind', 'abandon'];
for (const c of Object.values(C)) {
  if (!['u', 's', 'g'].includes(c.t) || c.token || c.sup === 'token' || /^recruit-/.test(c.id) || c.id.indexOf('tok-') === 0) continue;
  if (only && !c.id.includes(only)) continue;
  const doms = c.d.length ? c.d : ['fury'];
  const runes = []; for (let i = 0; i < 12; i++) runes.push(doms[i % doms.length]);
  let s;
  try {
    s = scene({
      p0: { hand: [c.id, 'stupefy', 'gust'], runes, base: ['patched-porobot', { cid: 'swain-visionary', buff: 1 }, { cid: 'tideturner', ex: true }], bf0: ['hwei-brooding-painter', 'patched-porobot'], gear: ['seal-of-rage', 'boots-of-swiftness'], deck, trash: ['swain-visionary', 'gust', 'boots-of-swiftness', 'patched-porobot'], xp: 8 },
      p1: { hand: ['gust', 'stupefy', 'swain-visionary'], base: ['patched-porobot', { cid: 'swain-visionary', stun: true }], bf1: ['hwei-brooding-painter', { cid: 'tideturner', dmg: 1 }], gear: ['seal-of-insight', 'long-sword'], deck, trash: ['gust', 'swain-visionary'] },
      ctrl: [0, 1], turn: 5,
    });
    s.autoAll = true; s.players[0].tc.cards = 1; s.players[1].pts = 5;
    const vs = RB.legal(s, 0).filter((a) => a.t === 'play' && a.cid === c.id);
    if (!vs.length) { res.unplayable.push(c.id); continue; }
    const a = vs.find((x) => x.extra) || vs.find((x) => x.to !== 'base' && x.to != null) || vs[0];
    const before = sig(s);
    RB.apply(s, a);
    for (let i = 0; i < 60; i++) { RB.advance(s); const p = RB.actor(s); if (p == null) break; if (s.choice) { RB.answer(s, RB.defaultPick(s)); continue; } const pass = RB.legal(s, p).find((x) => x.t === 'pass'); if (!pass) break; RB.apply(s, pass); }
    const log = RB.getLog().map((l) => l.msg).join('\n');
    if (/isn't automated/.test(log)) res.unauto.push(c.id);
    if (process.env.SHOW) console.log('## ' + c.id + ' :: ' + c.txt.replace(/\n/g, ' / ') + '\n  ' + log.replace(/\n/g, '\n  '));
    // remove the card itself from the comparison: did anything else change?
    const bef = JSON.parse(before); const oldIds = new Set(bef.objs.map((o) => o[0]));
    const after = JSON.parse(sig(s));
    const selfNew = after.objs.filter((o) => !oldIds.has(o[0]) && o[1] === c.id);
    const selfChanged = selfNew.some((o) => o[6] || o[7] || o[8] || o[9] || o[10] != null || o[11] !== '|' || o[13]);
    after.objs = after.objs.filter((o) => oldIds.has(o[0]) || o[1] !== c.id);
    after.pl[0][0] += 1; if (c.t === 's') after.pl[0][2] -= 1;
    for (const q of [0, 1]) { after.pl[q][6] = bef.pl[q][6]; after.pl[q][7] = bef.pl[q][7]; }
    const ab = c.ab.concat(c.eqab).filter((x) => x.kind === 'spell' || (x.kind === 'trig' && [].concat(x.on).includes('played')));
    if (process.env.SHOW) { const B = JSON.stringify(bef.objs), A = JSON.stringify(after.objs); console.log('  objs same:', A === B, '\n  B', B, '\n  A', A); }
    if (ab.length && !selfChanged && JSON.stringify(after) === JSON.stringify(bef)) res.noop.push(c.id);
    else res.ok++;
  } catch (e) { res.crash.push(c.id + ': ' + (e.stack || e).toString().split('\n').slice(0, 2).join(' ')); }
  RB.clearLog();
}
console.log('ok', res.ok, 'crash', res.crash.length, 'unauto', res.unauto.length, 'no visible effect', res.noop.length, 'unplayable here', res.unplayable.length);
for (const k of ['crash', 'unauto', 'noop']) if (res[k].length) console.log(k.toUpperCase() + ':\n  ' + res[k].join('\n  '));
require('fs').writeFileSync('build/smoke.json', JSON.stringify(res, null, 1));

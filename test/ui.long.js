// Play several full games in the real page, mixing clicks and random legal moves, and report page errors.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1500, height: 920 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await pg.route(/cmsassets|fonts\.g/, (r) => r.abort());
  await pg.goto('file://' + path.resolve('Riftbound Sparring.html'));
  const games = +process.argv[2] || 3;
  for (let g = 0; g < games; g++) {
    const keys = await pg.evaluate(() => Object.keys(DECKS));
    await pg.evaluate(([a, c]) => { UI.pk = a; UI.ak = c; UI.speed = 'fast'; UI.diff = 'easy'; render(); }, [keys[g % keys.length], keys[(g + 1) % keys.length]]);
    await pg.click('#start'); await pg.click('#preGo'); await pg.click('#keep');
    await pg.evaluate(() => { window.sleep = () => Promise.resolve(); });
    for (let step = 0; step < 3000; step++) {
      await pg.waitForTimeout(60);
      const st = await pg.evaluate(() => ({ stuck: actor(S) == null && !UI.driving && S.winner == null, actor: actor(S), winner: S.winner, paying: !!UI.paying, turn: S.turnNo, driving: UI.driving, tgt: !!UI.tgt }));
      if (st.winner != null || st.turn > 40) break; if (st.stuck) { console.log("STUCK", await pg.evaluate(() => JSON.stringify({ mode: S.mode, exec: S.exec.length, choice: S.choice }))); break; }
      if (st.actor !== 0 || st.driving) continue;
      if (st.paying) { await pg.click('#payAuto'); continue; }
      const r = Math.random();
      if (r < 0.5) {
        const opt = await pg.$('.cpop [data-topt], .cpop [data-pickidx], .pickover [data-pickidx]'); if (opt) { await opt.click(); continue; }
        const ok = await pg.$('.hand .hc.ok'); if (ok && r < 0.3) { await ok.click(); continue; }
      }
      await pg.evaluate(() => {
        if (UI.tgt) { const cs = targetChoices(); const c = cs[Math.floor(Math.random() * cs.length)]; if (c.act) { UI.tgt = null; doHuman(c.act); } else pickTarget(c.v); return; }
        const acts = legal(S, 0); const non = acts.filter((a) => a.t !== 'end' && a.t !== 'pass');
        const a = non.length && Math.random() < 0.8 ? non[Math.floor(Math.random() * non.length)] : acts.find((x) => x.t === 'end' || x.t === 'pass') || acts[0];
        if (a.t === 'pick' && a.v && a.v.add != null && Math.random() < 0.3) { doHuman(acts.find((x) => x.v && x.v.done) || a); return; }
        doHuman(a);
      });
    }
    const fin = await pg.evaluate(() => ({ turn: S.turnNo, pts: S.players.map((p) => p.pts), winner: S.winner }));
    console.log('game', g, JSON.stringify(fin));
    await pg.evaluate(() => { UI.screen = 'setup'; S = null; render(); });
  }
  await pg.screenshot({ path: 'build/long.png' });
  console.log('errors', errs.length, errs.slice(0, 8));
  await b.close();
})();

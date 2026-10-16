// Headless smoke test of the built page: start a game, play through a few turns by clicking.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1500, height: 920 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errs.push(m.text()); });
  await pg.route(/cmsassets|fonts\.g/, (r) => r.abort());
  await pg.goto('file://' + path.resolve('Riftbound Sparring.html'));
  await pg.waitForSelector('#start');
  await pg.selectOption('#speedSel', 'fast');
  await pg.click('#start'); await pg.click('#preGo'); await pg.click('#keep');
  const shot = async (n) => pg.screenshot({ path: `build/shot-${n}.png` });
  await pg.waitForTimeout(1500); await shot(1);
  // play: each step, if it's our move, click a playable hand card / pick first option / end turn
  for (let step = 0; step < 120; step++) {
    await pg.waitForTimeout(250);
    const st = await pg.evaluate(() => ({ actor: actor(S), mode: S.mode, choice: !!S.choice, winner: S.winner, tgt: !!UI.tgt, paying: !!UI.paying, turn: S.turnNo, driving: UI.driving }));
    if (st.winner != null || st.turn > 12) break;
    if (st.actor !== 0 || st.driving) continue;
    if (st.paying) { await pg.click('#payAuto'); continue; }
    const opt = await pg.$('.cpop [data-topt], .cpop [data-pickidx], .pickover [data-pickidx]');
    if (opt) { await opt.click(); continue; }
    const ok = await pg.$('.hand .hc.ok'); if (ok && Math.random() < 0.7) { await ok.click(); continue; }
    const ab = await pg.$('[data-abg]'); if (ab && Math.random() < 0.3) { await ab.click(); continue; }
    const pass = await pg.$('#pass, #end'); if (pass) { await pass.click(); continue; }
  }
  await shot(2);
  const fin = await pg.evaluate(() => ({ turn: S.turnNo, pts: S.players.map((p) => p.pts), log: RB.getLog().slice(-12).map((l) => l.msg) }));
  console.log(JSON.stringify(fin, null, 1)); console.log('errors:', errs.slice(0, 10));
  await b.close();
})();

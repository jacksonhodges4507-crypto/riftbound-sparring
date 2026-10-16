// Gold pays for a card in the real page, in both auto-pay and pay-myself modes.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1500, height: 920 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.route(/cmsassets|fonts\.g/, (r) => r.abort());
  await pg.goto('file://' + path.resolve('Riftbound Sparring.html'));
  await pg.click('#start'); await pg.click('#preGo'); await pg.click('#keep');
  for (const mode of ['manual', 'auto', 'auto']) {
    await pg.waitForFunction(() => actor(S) === 0 && S.mode === 'main' && !UI.driving, null, { timeout: 60000 });
    await pg.evaluate((mode) => {
      const pl = S.players[0]; pl.hand = ['ride-the-wind']; pl.runes = [{ id: 9001, d: 'mind', ex: false }, { id: 9002, d: 'mind', ex: false }];
      S.objs = S.objs.filter((o) => !(o.ctrl === 0 && o.cid === 'tok-gold'));
      newObj(S, { cid: 'patched-porobot', k: 'u', owner: 0, loc: 'base', ex: false }); newObj(S, { cid: 'tok-gold', k: 'g', owner: 0, loc: 'base', ex: false });
      UI.autopay = mode === 'auto'; render();
    }, mode);
    await pg.waitForTimeout(400); const card = await pg.$('.hand .hc.ok'); console.log(mode, 'card playable in hand:', !!card);
    if (!card) continue;
    await card.click(); await pg.waitForTimeout(300); console.log(mode, 'after click', JSON.stringify(await pg.evaluate(() => ({ tgt: UI.tgt && { key: UI.tgt.key, n: UI.tgt.acts.length }, paying: !!UI.paying, note: UI.note, hint: UI.hint, log: RB.getLog().slice(-2).map((l) => l.msg), ctx: !!UI.ctx }))));
    for (let i = 0; i < 6; i++) {
      const st = await pg.evaluate(() => ({ paying: !!UI.paying, tgt: !!UI.tgt, pop: !!document.querySelector('.cpop [data-topt], .cpop [data-pickidx], .pickover [data-pickidx], [data-obj].tgtok') }));
      if (st.paying) {
        const g = await pg.$('[data-gold]'); console.log(mode, 'gold clickable while paying:', !!g); if (g) await g.click();
        await pg.evaluate(() => { const P0 = UI.paying; P0.ex = S.players[0].runes.filter((r) => !r.ex).map((r) => r.id).slice(0, 2); render(); });
        const okBtn = await pg.$('#payOk:not([disabled])'); console.log(mode, 'confirm enabled:', !!okBtn); if (okBtn) await okBtn.click(); else break;
        await pg.waitForTimeout(300); continue;
      }
      const opt = await pg.$('[data-topt], [data-pickidx]'); if (opt) { await opt.click(); await pg.waitForTimeout(300); continue; }
      const tg = await pg.$('[data-obj].tgtok, .tgtok'); if (tg) { await tg.click(); await pg.waitForTimeout(300); continue; }
      break;
    }
    const res = await pg.evaluate(() => ({ goldLeft: S.objs.filter((o) => o.ctrl === 0 && o.cid === 'tok-gold').length, log: RB.getLog().slice(-4).map((l) => l.msg), hand: S.players[0].hand, paying: !!UI.paying, tgt: UI.tgt && UI.tgt.why }));
    console.log(mode, JSON.stringify(res));
    await pg.evaluate(() => { UI.paying = null; UI.tgt = null; render(); });
  }
  console.log('errors', errs);
  await b.close();
})();

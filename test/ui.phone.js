// Phone in landscape: tap to play, touch-drag a unit to a battlefield, long-press for the card menu.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.route(/cmsassets|fonts\.g/, (r) => r.abort());
  await pg.goto('file://' + path.resolve('Riftbound Sparring.html'));
  await pg.tap('#start'); await pg.tap('#preGo'); await pg.tap('#keep');
  await pg.waitForFunction(() => actor(S) === 0 && S.mode === 'main' && !UI.driving, null, { timeout: 60000 }); await pg.waitForTimeout(800);
  const st = () => pg.evaluate(() => ({ phone: PH.on, sc: +PH.sc.toFixed(2), hand: S.players[0].hand.length, ctx: !!UI.ctx, tgt: !!(UI.tgt), paying: !!UI.paying, log: RB.getLog().slice(-2).map((l) => l.msg) }));
  console.log('start', JSON.stringify(await st()));
  const cdp = await pg.context().newCDPSession(pg);
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  // long press a hand card
  let card = await pg.$('.hand [data-hand]'); let bx = await card.boundingBox();
  await touch('touchStart', bx.x + bx.width / 2, bx.y + 20); await pg.waitForTimeout(700); await touch('touchEnd');
  await pg.waitForTimeout(300); console.log('after long press', JSON.stringify(await st()));
  const items = await pg.$$eval('.ctxi', (x) => x.map((b) => b.textContent)); console.log('menu', items);
  const view = await pg.$('.ctxi:last-child'); if (view) { await view.tap(); await pg.waitForTimeout(300); console.log('viewing card', await pg.evaluate(() => !!UI.viewing)); await pg.evaluate(() => { UI.viewing = null; render(); }); }
  // put a cheap unit in hand and touch-drag it to base
  await pg.evaluate(() => { S.players[0].hand.unshift('patched-porobot'); render(); });
  await pg.waitForTimeout(300);
  card = await pg.$('.hand [data-hand="0"]'); bx = await card.boundingBox(); const base = await pg.$('.z-base[data-dest="base"], [data-dest="base"]'); const bb = await base.boundingBox();
  await touch('touchStart', bx.x + bx.width / 2, bx.y + 20);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', bx.x + bx.width / 2 + (bb.x + bb.width / 2 - bx.x - bx.width / 2) * i / 8, bx.y + 20 + (bb.y + bb.height / 2 - bx.y - 20) * i / 8); await pg.waitForTimeout(30); }
  await touch('touchEnd'); await pg.waitForTimeout(800);
  for (let i = 0; i < 4; i++) { const o = await pg.$('[data-topt], [data-pickidx], #payAuto'); if (!o) break; await o.tap(); await pg.waitForTimeout(400); }
  console.log('after drag', JSON.stringify(await st()), 'porobots', await pg.evaluate(() => S.objs.filter((o) => o.cid === 'patched-porobot' && o.ctrl === 0).length));
  // tap End turn
  const end = await pg.$('#end'); if (end) { await end.tap(); await pg.waitForTimeout(500); console.log('ended turn', await pg.evaluate(() => RB.getLog().slice(-3).map((l) => l.msg))); }
  console.log('ghosts', await pg.evaluate(() => document.querySelectorAll('.ghost').length), 'errors', errs);
  await pg.screenshot({ path: 'build/phone.png' }); await b.close();
})();

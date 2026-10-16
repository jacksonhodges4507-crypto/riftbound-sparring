// Dragging a hand card and dropping it back where it started (or the drag being cancelled) leaves nothing behind.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1500, height: 920 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.route(/cmsassets|fonts\.g/, (r) => r.abort());
  await pg.goto('file://' + path.resolve('Riftbound Sparring.html'));
  await pg.click('#start'); await pg.click('#preGo'); await pg.click('#keep');
  await pg.waitForFunction(() => actor(S) === 0 && S.mode === 'main' && !UI.driving, null, { timeout: 60000 }); await pg.waitForTimeout(800);
  const left = async () => pg.evaluate(() => ({ ghosts: document.querySelectorAll('.ghost').length, dragsrc: document.querySelectorAll('.dragsrc').length, dragging: document.body.classList.contains('dragging'), tgt: !!UI.tgt }));
  const card = await pg.$('.hand [data-hand]'); const bx = await card.boundingBox(); const x = bx.x + bx.width / 2, y = bx.y + bx.height / 2;
  // 1: drag away and back to the same spot
  await pg.mouse.move(x, y); await pg.mouse.down(); await pg.mouse.move(x + 60, y - 120, { steps: 5 }); await pg.mouse.move(x, y, { steps: 5 }); await pg.mouse.up(); await pg.waitForTimeout(300);
  console.log('drop on same spot:', JSON.stringify(await left()));
  await pg.evaluate(() => { UI.tgt = null; render(); });
  // 2: drag that gets cancelled (no pointerup)
  const card2 = await pg.$('.hand [data-hand]'); const b2 = await card2.boundingBox();
  await pg.mouse.move(b2.x + 20, b2.y + 20); await pg.mouse.down(); await pg.mouse.move(b2.x + 80, b2.y - 150, { steps: 5 });
  await pg.evaluate(() => document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true })));
  await pg.waitForTimeout(200); console.log('after cancel:', JSON.stringify(await left())); await pg.mouse.up();
  console.log('errors', errs); await b.close();
})();

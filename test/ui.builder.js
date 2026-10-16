const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.route(/cmsassets|fonts\.g/, (r) => r.abort());
  await pg.goto('file://' + path.resolve('Riftbound Sparring.html'));
  await pg.click('#importDeck');
  await pg.fill('#importText', `Legend:\n1 Swift Scout\nChampion:\n1 Teemo, Strategist\nMainDeck:\n3 Gust\n3 Stupefy\n3 Tideturner\n3 Switcheroo\n3 Bandle Scouts\n3 Watchful Sentry\n3 Temporal Breach\n3 Ride the Wind\n3 Moonfall\n3 Abandon\n3 Wages of Pain\n3 Bellows Breath\n2 Teemo, Strategist\n1 Not A Real Card\nBattlefields:\n1 Bandle Tree\n1 Rockfall Path\n1 Veiled Temple\nRunes:\n6 Mind Rune\n6 Chaos Rune`);
  await pg.click('#doImport'); await pg.waitForTimeout(300);
  await pg.screenshot({ path: 'build/builder-1.png' });
  const st = await pg.evaluate(() => { const k = UI.bld.k; const D = DECKS[k]; return { k, n: deckCount(D), probs: deckProblems(D), msg: UI.bld.msg, legend: D.legend, champ: D.champ }; });
  console.log(JSON.stringify(st));
  await pg.fill('#bq', 'poro'); await pg.waitForTimeout(200); await pg.screenshot({ path: 'build/builder-2.png' });
  await pg.click('[data-btab="look"]'); await pg.click('[data-sleeve="#6b1f2a"]'); await pg.click('#bldSave');
  await pg.screenshot({ path: 'build/builder-3.png' });
  console.log('errors', errs);
  await b.close();
})();

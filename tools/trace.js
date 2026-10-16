// Show examples of a card's triggers running without changing anything: node tools/trace.js card-id [games]
process.argv[3] = process.argv[3] || '8';
const id = process.argv[2]; const RB = require('../build/engine.js');
let shown = 0;
RB.STATS.onDead = (s, fr) => {
  if (fr.tcid !== id || shown >= 4) return; shown++;
  const L = RB.getLog().slice(-4).map((l) => l.msg).join(' / ');
  console.log(`-- ${fr.tev} turn ${s.turnNo} p${fr.ctx.p} self ${fr.ctx.self} it ${JSON.stringify(fr.ctx.it)} there ${fr.ctx.there}\n   eff ${JSON.stringify(fr.eff).slice(0, 300)}\n   log: ${L}`);
};
RB.setLog(true);
process.argv = [process.argv[0], process.argv[1], process.argv[3], id];
console.log('##', id, '::', RB.C[id] ? '' : '', require('../data/cards.json')[id].txt.replace(/\n/g, ' / '));
require('./cardfuzz.js');

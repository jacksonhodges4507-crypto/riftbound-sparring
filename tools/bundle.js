// Concatenate the engine sources into one script (browser) and a Node module.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const parts = ['core', 'state', 'fx', 'play', 'ai', 'hand', 'cards'].map((f) => fs.readFileSync(path.join(root, 'src', f + '.js'), 'utf8'));
const EXPORTS = ['C', 'DOMS', 'SPEED', 'BASE_WIN', 'loadCards', 'tokenCard', 'newGame', 'mulligan', 'beginGame', 'legal', 'apply', 'advance', 'actor', 'aiHeuristic', 'actText', 'describe', 'settle', 'evalS', 'defaultPick', 'answer', 'choiceOpts', 'finishChoice', 'clone', 'ob', 'might', 'kwOf', 'unitsAt', 'unitsOf', 'gearOf', 'eqOf', 'bfName', 'winScore', 'cn', 'actionCost', 'autoPayPlan', 'checkManualPay', 'canPay', 'abilityOf', 'newObj', 'hold', 'conquer', 'HAND', 'HAND_OPS', 'OPS', 'RULES', 'cardVal', 'STATS'];
const api = `\nconst RB = { ${EXPORTS.map((e) => e === 'C' ? 'get C() { return C; }' : e).join(', ')}, getLog: () => LOG, clearLog, setLog: (v) => { logOn = v; }, setEvalLevel: (l) => { EVAL_LEVEL = l; } };\nif (typeof module !== 'undefined') module.exports = RB;\n`;
const src = parts.join('\n') + api;
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.writeFileSync(path.join(root, 'build', 'engine.js'), src);
console.log('build/engine.js', src.length);

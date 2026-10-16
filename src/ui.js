/* Riftbound Sparring — table UI. The engine (src/*.js) runs every card from its compiled or hand-written program;
   this file draws the playmat, turns clicks/drags into engine actions, runs the AI, and hosts the deck builder. */
loadCards(CARDS, PROG, HAND);
const imgURL = (u) => u + '?w=480&auto=format';
function artErr(img) { if (!img.dataset.retry) { img.dataset.retry = 1; img.src = img.dataset.raw; } else { img.parentElement.classList.add('noart'); } }
const esc = (t) => String(t).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const store = { get(k, d) { try { const v = localStorage.getItem('rbs_' + k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('rbs_' + k, v); return true; } catch (e) { return false; } }, del(k) { try { localStorage.removeItem('rbs_' + k); } catch (e) {} } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const artURL = (k) => (ART[k] || (C[k] && C[k].img) || null);
const TYPE_NAME = { u: 'Unit', s: 'Spell', g: 'Gear', L: 'Legend', B: 'Battlefield', r: 'Rune' };
const costText = (c) => `${c.e || 0}E${c.p && c.p.length ? ' +' + c.p.length + 'P' : ''}`;

/* ---------------- decks: built-in tournament lists + your own ---------------- */
let DECKS = {};
function loadDecks() {
  DECKS = {};
  for (const [k, d] of Object.entries(DECKS0)) DECKS[k] = Object.assign({ builtin: true, sleeve: '#2c4152' }, JSON.parse(JSON.stringify(d)));
  try { const mine = JSON.parse(store.get('decks', '{}')); for (const [k, d] of Object.entries(mine)) DECKS[k] = d; } catch (e) {}
  try { const ov = JSON.parse(store.get('deckov', '{}')); for (const [k, d] of Object.entries(ov)) if (DECKS[k] && DECKS[k].builtin) Object.assign(DECKS[k], d); } catch (e) {}
}
function saveDeck(k) {
  const D = DECKS[k];
  if (D.builtin) { const ov = JSON.parse(store.get('deckov', '{}')); ov[k] = { main: D.main, side: D.side, sleeve: D.sleeve, bfs: D.bfs, runes: D.runes, champ: D.champ }; return store.set('deckov', JSON.stringify(ov)); }
  const mine = JSON.parse(store.get('decks', '{}')); mine[k] = D; return store.set('decks', JSON.stringify(mine));
}
function deleteDeck(k) { const mine = JSON.parse(store.get('decks', '{}')); delete mine[k]; store.set('decks', JSON.stringify(mine)); delete DECKS[k]; }
loadDecks();
const legDoms = (L) => (C[L] && C[L].d.length ? C[L].d : []);
const deckCount = (D) => Object.values(D.main || {}).reduce((a, b) => a + b, 0) + (D.champ ? 1 : 0);
function deckProblems(D) {
  const out = []; if (!D.legend || !C[D.legend]) out.push('no legend');
  const n = deckCount(D); if (n !== 40) out.push(`${n}/40 cards`);
  if (!D.champ) out.push('no champion');
  const doms = legDoms(D.legend);
  for (const c in D.main) { if (!C[c]) { out.push(`unknown card ${c}`); continue; } const total = D.main[c] + (c === D.champ ? 1 : 0); if (total > 3) out.push(`${C[c].n}: ${total} copies (max 3)`); if (C[c].kw.unique && total > 1) out.push(`${C[c].n} is Unique`); if (doms.length && C[c].d.length && !C[c].d.every((d) => doms.includes(d))) out.push(`${C[c].n} is outside ${doms.map((d) => DOMS[d]).join('/')}`); }
  const r = Object.values(D.runes || {}).reduce((a, b) => a + b, 0); if (r !== 12) out.push(`${r}/12 runes`);
  if (!D.bfs || D.bfs.length < 1) out.push('no battlefields');
  return out;
}
function automation(cid) { const c = C[cid]; if (!c) return 'none'; if (c.manual) return 'manual'; if (!c.txt || !c.txt.trim()) return 'vanilla'; return c.hand ? 'hand' : 'auto'; }

const UI = { screen: 'setup', pk: store.get('pk', 'diana'), ak: store.get('ak', 'irelia'), first: 'random', brain: store.get('brain', 'builtin'), key: store.get('key', ''), model: store.get('model', 'fast'),
  ctx: null, viewing: null, payOnce: null, pops: [], popN: 0, drawer: false, autopay: store.get('autopay', '1') === '1', runeArt: store.get('runeArt', 'ogn'), hist: [], paying: null, banner: null, lastTurn: 0,
  seenR: new Set(), seenO: new Set(), prevHand: [0, 0], round: +store.get('round', '0'), speed: store.get('speed', 'slow'), diff: store.get('diff', 'normal'), tgt: null, trash: null, t0: 0, myTime: 0, turnStart: 0,
  sel: [], driving: false, thinking: false, coach: '', coachBusy: false, mull: [], note: '', hint: '', settings: false, tools: null, bld: null, playmat: store.get('playmat', '') };
if (!DECKS[UI.pk]) UI.pk = Object.keys(DECKS)[0]; if (!DECKS[UI.ak]) UI.ak = Object.keys(DECKS)[0];
let S = null;

/* ---------------- card pieces ---------------- */
function artImg(key, alt) { const u = artURL(key); if (!u) return ''; return `<img src="${imgURL(u)}" data-raw="${u}" alt="${esc(alt || '')}" loading="lazy" onerror="artErr(this)">`; }
function cardHTML(cid, { cls = '', attrs = '', badges = '' } = {}) {
  const c = C[cid]; if (!c) return '';
  const fb = `<div class="fb"><b>${esc(c.n)}</b><span>${costText(c)}${c.t === 'u' ? ' · ' + c.m + ' might' : ''}</span><span>${esc(c.txt)}</span></div>`;
  return `<div class="card ${cls}" data-prev="${cid}" ${attrs}>${fb}${artImg(cid, c.n)}${badges}</div>`;
}
function pileHTML(n, rune, sleeve) { const layers = Math.min(6, Math.ceil(n / 7)); let h = ''; const st = sleeve ? `--sleeve:${sleeve};` : ''; for (let i = 0; i < layers; i++) h += `<div class="back ${rune ? 'rb' : 'sl'}" style="${st}--cw:var(--pw);--ch:var(--ph);position:absolute;left:${i * 1.2}px;top:${-i * 1.6}px"></div>`; return `<div class="stack" style="width:calc(var(--pw) + 8px);height:calc(var(--ph) + 10px);position:relative;opacity:${n ? 1 : 0.25}">${h || `<div class="back sl" style="${st}--cw:var(--pw);--ch:var(--ph);position:absolute;opacity:.3"></div>`}</div>`; }
const sleeveOf = (q) => (S && S.players[q].sleeve) || '#2c4152';
function objHTML(o, ctx) {
  const c = C[o.copyOf || o.cid], mine = o.ctrl === 0;
  const cls = ['slot', o.ex ? 'ex' : '', mine ? 'mine' : 'foe', UI.sel.includes(o.id) ? 'sel' : '', ctx.tgt.has(o.id) ? 'tgt' : '', ctx.picked && ctx.picked.has(o.id) ? 'sel' : ''].join(' ');
  let b = '';
  if (o.k === 'u') {
    const m = might(S, o), base = o.setBase != null ? o.setBase : c.m; b += `<span class="mightb ${m > base ? 'up' : m < base ? 'down' : ''}">${m}</span>`; if (o.dmg) b += `<span class="dmgb">${o.dmg}</span>`;
    const k = kwOf(S, o);
    const st = [o.stun ? 'Stunned' : '', o.emp ? 'Empowered' + (o.emp > 1 ? ' ×' + o.emp : '') : '', o.buff ? 'Buffed' : '', o.shroud ? 'Shrouded' : '', o.temp || k.temporary ? 'Temporary' : '', o.copyOf ? 'Copy' : ''].filter(Boolean);
    if (st.length) b += `<span class="statusb">${st.slice(0, 2).join(' · ')}</span>`;
    const eq = eqOf(S, o); if (eq.length) b += `<span class="eqtag">${eq.map((g) => esc(C[g.cid].n)).join(' + ')}</span>`;
  }
  if (o.k === 'g') { if (o.att != null) { const u = ob(S, o.att); b += `<span class="eqtag">on ${esc(u ? C[u.cid].n : '?')}</span>`; } const st = [o.temp ? 'Temporary' : '', o.emp ? 'Empowered' : ''].filter(Boolean); if (st.length) b += `<span class="statusb">${st.join(' · ')}</span>`; }
  const goldPay = UI.paying && o.cid === 'tok-gold' && o.ctrl === 0 && !o.ex; const gSel = goldPay && (UI.paying.gold || []).includes(o.id);
  return `<div class="${cls} ${goldPay ? 'payable' : ''} ${gSel ? 'goldsel' : ''}" data-obj="${o.id}" ${goldPay ? `data-gold="${o.id}"` : ''} data-anim="o${o.id}" tabindex="0">${cardHTML(o.copyOf || o.cid)}<div class="badges">${b}</div></div>`;
}
function runeKey(d, q) { const v = q === 0 ? UI.runeArt : 'ogn'; return ART['R_' + v + '_' + d] ? 'R_' + v + '_' + d : 'R_' + d; }
function runeCard(r, q) {
  const pay = UI.paying && q === 0; const inEx = pay && UI.paying.ex.includes(r.id), inRc = pay && UI.paying.rc.includes(r.id);
  const cls = ['rune', r.ex || inEx ? 'ex' : '', inRc ? 'rc' : '', pay ? 'payable' : ''].join(' ');
  return `<div class="${cls}" data-anim="r${r.id}" data-rid="${r.id}" data-owner="${q}" data-prev="${runeKey(r.d, q)}" title="${DOMS[r.d]} rune${r.ex ? ' (exhausted)' : ''}"><div class="fbd">${DOMS[r.d]}</div>${artImg(runeKey(r.d, q), DOMS[r.d] + ' Rune')}${inRc ? '<span class="rcmark">↺</span>' : ''}</div>`;
}

/* ---------------- screens ---------------- */
/* ---------------- phones ---------------- */
// On a phone in landscape the table is laid out at a fixed virtual size and scaled to fit, so it keeps the
// same arrangement as on a computer. Pointer coordinates are converted with toL() wherever layout math needs them.
const PH = { on: false, sc: 1, W: 0, H: 0, x0: 0 };
const isPhone = () => { try { return matchMedia('(pointer:coarse)').matches && Math.min(innerWidth, innerHeight) < 620; } catch (e) { return false; } };
function safeInsets() { const d = document.createElement('div'); d.style.cssText = 'position:fixed;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)'; document.body.appendChild(d); const cs = getComputedStyle(d); const r = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 }; d.remove(); return r; }
function phoneFit() {
  const de = document.documentElement, root = document.getElementById('root'); if (!root) return;
  const phone = isPhone(), game = UI.screen === 'game' && !!S, land = innerWidth > innerHeight;
  de.classList.toggle('phone', phone); de.classList.toggle('ph-game', phone && game); de.classList.toggle('portrait-game', phone && game && !land);
  if (phone && game && land) {
    const ins = safeInsets(); const vw = innerWidth - ins.l - ins.r, vh = innerHeight - ins.t - ins.b;
    const H = 560, W = Math.round(H * vw / vh), sc = vh / H;
    Object.assign(PH, { on: true, sc, W, H, x0: ins.l, y0: ins.t });
    root.style.cssText = `position:fixed;left:${ins.l}px;top:${ins.t}px;width:${W}px;height:${H}px;transform:scale(${sc});transform-origin:0 0;--vh:${H / 100}px;--vw:${W / 100}px`;
  } else { Object.assign(PH, { on: false, sc: 1, x0: 0, y0: 0 }); root.style.cssText = ''; }
}
const toL = (x, y) => (PH.on ? { x: (x - PH.x0) / PH.sc, y: (y - PH.y0) / PH.sc } : { x, y });
const vpW = () => (PH.on ? PH.W : innerWidth), vpH = () => (PH.on ? PH.H : innerHeight);
addEventListener('resize', () => { phoneFit(); if (UI.screen === 'game' && S) render(); });
addEventListener('orientationchange', () => setTimeout(() => { phoneFit(); render(); }, 200));
function render() {
  const root = document.getElementById('root'); phoneFit();
  if (UI.screen === 'game' && S) noteTurn();
  if (UI.screen === 'setup') root.innerHTML = setupHTML();
  else if (UI.screen === 'builder') root.innerHTML = builderHTML();
  else if (UI.screen === 'pregame') root.innerHTML = pregameHTML();
  else if (S.mode === 'mull') root.innerHTML = mullHTML();
  else root.innerHTML = tableHTML();
  if (UI.settings) root.insertAdjacentHTML('beforeend', settingsHTML());
  if (UI.importer) root.insertAdjacentHTML('beforeend', importHTML());
  for (const [id, v] of [['speedSel', UI.speed], ['diffSel', UI.diff], ['brainSel', UI.brain], ['first', UI.first]]) { const el = document.getElementById(id); if (el) el.value = v; }
  const lg = document.getElementById('log'); if (lg) lg.scrollTop = lg.scrollHeight;
  if (UI.screen === 'game') fitRows();
  animateNew();
  const co = document.getElementById('coachOut'); if (co) co.textContent = UI.coach || (UI.key ? 'On your turn, ask for the best line. After a game, ask for a review.' : 'The coach uses Claude. Add your Anthropic API key in Settings to turn it on.');
}
function deckTile(k) {
  const D = DECKS[k], L = C[D.legend]; const probs = deckProblems(D);
  return `<div class="deck ${UI.pk === k ? 'you' : ''} ${UI.ak === k ? 'ai' : ''}" style="--sleeve:${D.sleeve || '#2c4152'}">
    <div class="arts">${L ? cardHTML(D.legend) : ''}${D.champ ? cardHTML(D.champ) : ''}<div class="back sl sleeveprev" title="Sleeves"></div></div>
    <div><h2>${esc(D.name || 'Untitled')}</h2><div class="label">${esc(D.sub || (L ? L.n : ''))}</div></div>
    ${D.src ? `<div class="src">${esc(D.src)}</div>` : `<div class="src">Your deck</div>`}
    <details><summary>Decklist</summary><ul>${D.champ ? `<li>1 ${esc(C[D.champ] ? C[D.champ].n : D.champ)} (champion)</li>` : ''}${Object.entries(D.main || {}).map(([c, n]) => `<li>${n} ${esc(C[c] ? C[c].n : c)}</li>`).join('')}</ul>
      <div style="margin-top:6px">Runes: ${Object.entries(D.runes || {}).map(([d, n]) => n + ' ' + DOMS[d]).join(', ')}. Battlefields: ${(D.bfs || []).map((b) => (C[b] ? C[b].n : b)).join(', ')}.</div></details>
    ${probs.length ? `<div class="note" style="color:var(--foe)">Not legal yet: ${esc(probs.slice(0, 3).join(' · '))}</div>` : ''}
    <div class="bt"><button class="btn" data-build="${k}">Edit</button><button class="btn ${UI.pk === k ? 'gold' : ''}" data-pk="${k}">${UI.pk === k ? 'Your deck' : 'Play this'}</button><button class="btn" data-ak="${k}">${UI.ak === k ? 'AI pilots this' : 'Give to AI'}</button></div></div>`;
}
// decks are grouped: your own, the latest event's top 8, best-of-each-legend from that event, and older lists
function deckSections(ks) {
  const q = (UI.deckq || '').toLowerCase().trim();
  const match = (k) => { if (!q) return true; const D = DECKS[k]; return [D.name, D.sub, D.player, D.src, C[D.legend] && C[D.legend].n, C[D.champ] && C[D.champ].n].some((x) => x && String(x).toLowerCase().includes(q)); };
  const pinned = ks.filter((k) => k === UI.pk || k === UI.ak);
  const groups = [
    ['Your decks', ks.filter((k) => !DECKS[k].builtin)],
    ['RQ Los Angeles · Top 8', ks.filter((k) => DECKS[k].builtin && DECKS[k].event && /^la-/.test(k) && DECKS[k].place !== 'Best-of')],
    ['RQ Los Angeles · best finish for each legend', ks.filter((k) => DECKS[k].builtin && /^la-/.test(k) && DECKS[k].place === 'Best-of')],
    ['Earlier tournament lists', ks.filter((k) => DECKS[k].builtin && !/^la-/.test(k))],
  ];
  const sel = pinned.length ? `<div class="label" style="margin:4px 0 6px">Selected</div><div class="decks">${pinned.map(deckTile).join('')}</div>` : '';
  return `<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><input type="text" id="deckq" placeholder="Search decks by legend, champion or player" value="${esc(UI.deckq || '')}" style="flex:1;min-width:220px"></div>
    ${q ? '' : sel}
    ${groups.map(([title, list]) => { const l = list.filter(match).filter((k) => q || !pinned.includes(k)); if (!l.length) return ''; return `<details class="dgroup" ${q || title !== 'Earlier tournament lists' ? 'open' : ''}><summary><span class="label">${esc(title)}</span> <span class="note">${l.length}</span></summary><div class="decks">${l.map(deckTile).join('')}</div></details>`; }).join('')}`;
}
function setupHTML() {
  const ks = Object.keys(DECKS);
  return `<div class="setup">
    <div><div class="label">Practice table</div><h1>Riftbound Sparring</h1></div>
    <p class="lede">Pick your deck, hand the AI a deck, and play a full game to ${BASE_WIN} whenever you want. Every released card is in the builder and plays by its printed text: legends, champions, triggers, the chain, showdowns, Hidden, equipment and more.</p>
    <div class="row" style="flex-wrap:wrap;gap:8px"><button class="btn gold" id="newDeck">+ New deck</button><button class="btn" id="importDeck">Import a list</button><button class="btn" id="matUpload">Upload playmat</button>${UI.playmat ? '<button class="btn" id="matClear">Remove playmat</button>' : ''}<input type="file" id="matFile" accept="image/*" hidden></div>
    ${deckSections(ks)}
    <div><div class="label" style="margin-bottom:6px">Your rune art</div><div class="runeopts">${[['ogn', 'Origins'], ['ognsc', 'Origins showcase'], ['ven', 'Vendetta']].map(([v, n]) => `<div class="runeopt ${UI.runeArt === v ? 'on' : ''}" data-ro="${v}">${Object.keys((DECKS[UI.pk] || {}).runes || { fury: 1, calm: 1 }).map((d) => `<div class="rune"><div class="fbd">${DOMS[d]}</div>${artImg('R_' + v + '_' + d, DOMS[d] + ' Rune')}</div>`).join('')}<span class="note">${n}</span></div>`).join('')}</div></div>
    <div class="opts">
      <label><span class="label">Who goes first</span><select id="first"><option value="random">Coin flip</option><option value="you">You</option><option value="ai">AI</option></select></label>
      <label><span class="label">AI difficulty</span><select id="diffSel"><option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option></select></label>
      <label><span class="label">AI speed</span><select id="speedSel"><option value="slow">Slow (watch every play)</option><option value="normal">Normal</option><option value="fast">Fast</option></select></label>
      <label><span class="label">AI opponent</span><select id="brainSel"><option value="builtin">Built-in (instant, offline)</option><option value="claude">Claude (needs API key)</option></select></label>
      <button class="btn" id="openSettings">Settings</button>
      <button class="btn gold" id="start">Start game</button>
    </div>
    ${UI.setupMsg ? `<p class="note" style="color:var(--foe)">${esc(UI.setupMsg)}</p>` : ''}<p class="note">${UI.brain === 'claude' && !UI.key ? 'Claude is selected but no API key is saved yet, so the built-in AI will play until you add one in Settings. ' : ''}Card art loads from Riot's official card gallery, so you need to be online to see it.</p>
  </div>`;
}
function openPregame() { const D = DECKS[UI.pk]; UI.pre = { bf: UI.pre && UI.pre.k === UI.pk ? UI.pre.bf : null, k: UI.pk, main: JSON.parse(JSON.stringify(D.main)), side: JSON.parse(JSON.stringify(D.side || {})) }; UI.screen = 'pregame'; render(); }
function pregameHTML() {
  const D = DECKS[UI.pk], P0 = UI.pre; const n = Object.values(P0.main).reduce((a, b) => a + b, 0) + 1, ns = Object.values(P0.side).reduce((a, b) => a + b, 0);
  const row = (c, cnt, where) => `<button class="sbrow" data-sb="${where}:${c}"><span class="eart" data-prev="${c}">${cardHTML(c)}</span><span class="einfo"><b>${esc(C[c].n)}</b><span class="note">${costText(C[c])} · ${TYPE_NAME[C[c].t]}</span></span><b class="num">×${cnt}</b><span class="arrow">${where === 'main' ? '→' : '←'}</span></button>`;
  const sortk = (a, b) => C[a].e - C[b].e || C[a].n.localeCompare(C[b].n);
  return `<div class="setup pregame"><div><div class="label">Before the game · ${esc(D.name)} vs ${esc(DECKS[UI.ak].name)}</div><h1>Battlefield and sideboard</h1></div>
    <div><div class="label" style="margin-bottom:8px">Choose your battlefield</div><div class="bfpick">${D.bfs.map((b) => `<button class="bfopt ${P0.bf === b ? 'on' : ''}" data-bfpick="${b}"><div class="bfart">${artImg(b, C[b].n)}</div><b>${esc(C[b].n)}</b><span class="note">${esc(C[b].txt)}</span></button>`).join('')}
      <button class="bfopt ${P0.bf === 'random' || !P0.bf ? 'on' : ''}" data-bfpick="random"><div class="bfart rnd">?</div><b>Random</b><span class="note">Pick one for me</span></button></div></div>
    <div><div class="label" style="margin-bottom:8px">Sideboard · click a card to swap it between your deck and sideboard</div>
      <div class="sbgrid"><div class="box"><div class="hd"><h3>Main deck</h3><span class="num ${n === 40 ? 'ok' : 'bad'} ecount">${n}/40</span></div><div class="sblist">${Object.keys(P0.main).filter((c) => P0.main[c] > 0 && C[c]).sort(sortk).map((c) => row(c, P0.main[c], 'main')).join('')}</div></div>
      <div class="box"><div class="hd"><h3>Sideboard</h3><span class="num ecount ${ns <= 8 ? 'ok' : 'bad'}">${ns}/8</span></div><div class="sblist">${Object.keys(P0.side).filter((c) => P0.side[c] > 0 && C[c]).sort(sortk).map((c) => row(c, P0.side[c], 'side')).join('') || '<div class="note">Empty. Move cards here from your deck, or add sideboard cards in the deck builder.</div>'}</div></div></div>
      <p class="note">The deck needs exactly 40 cards (champion included) to start. Changes here only last for this match.</p></div>
    <div class="opts"><button class="btn" id="preBack">Back</button><button class="btn gold" id="preGo" ${n === 40 ? '' : 'disabled'}>Start the game</button></div></div>`;
}
function mullHTML() {
  const h = S.players[0].hand;
  return `<div class="setup"><div><div class="label">Opening hand · ${S.first === 0 ? 'you go first' : 'AI goes first, so you channel 3 runes on your first turn'}</div><h1>Mulligan</h1></div>
   <p class="lede">Tap up to two cards to put on the bottom of your deck and draw replacements.</p>
   <div class="mullrow">${h.map((c, i) => cardHTML(c, { cls: UI.mull.includes(i) ? 'pick' : '', attrs: `data-m="${i}"` })).join('')}</div>
   <div class="opts"><button class="btn gold" id="keep">${UI.mull.length ? `Swap ${UI.mull.length} and start` : 'Keep hand'}</button></div></div>`;
}
function settingsHTML() {
  return `<div class="modal" id="modal"><div class="box"><div class="hd"><h3>Settings</h3><button class="btn" id="closeSettings">Done</button></div>
    <label style="display:grid;gap:5px"><span class="label">AI opponent</span><select id="setBrain"><option value="builtin">Built-in (instant, offline)</option><option value="claude">Claude</option></select></label>
    <label style="display:grid;gap:5px"><span class="label">AI difficulty (built-in AI)</span><select id="setDiff"><option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option></select></label>
    <label style="display:grid;gap:5px"><span class="label">Round timer</span><select id="setRound"><option value="0">Off (just track time)</option><option value="30">30 minutes</option><option value="50">50 minutes (tournament round)</option></select></label>
    <label style="display:grid;gap:5px"><span class="label">AI speed</span><select id="setSpeed"><option value="slow">Slow (watch every play)</option><option value="normal">Normal</option><option value="fast">Fast</option></select></label>
    <label style="display:grid;gap:5px"><span class="label">Claude model</span><select id="setModel"><option value="fast">Fast (Claude Haiku 4.5)</option><option value="deep">Stronger, slower (Claude Sonnet 5.5)</option></select></label>
    <label style="display:grid;gap:5px"><span class="label">Anthropic API key</span><input type="password" id="setKey" placeholder="sk-ant-..." value="${esc(UI.key)}" autocomplete="off"></label>
    <p class="note">The key is saved only in this browser and is sent only to Anthropic's API. Each AI move and coach answer is a small API call billed to your account.</p>
  </div></div>`;
}
function syncSettings() { const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; }; set('setSpeed', UI.speed); set('setBrain', UI.brain); set('setModel', UI.model); set('setDiff', UI.diff); set('setRound', String(UI.round)); }
function readSettings() {
  const g = (id) => document.getElementById(id);
  if (g('setBrain')) { UI.brain = g('setBrain').value; store.set('brain', UI.brain); } if (g('setModel')) { UI.model = g('setModel').value; store.set('model', UI.model); } if (g('setKey')) { UI.key = g('setKey').value.trim(); store.set('key', UI.key); }
  if (g('setSpeed')) { UI.speed = g('setSpeed').value; store.set('speed', UI.speed); } if (g('setDiff')) { UI.diff = g('setDiff').value; store.set('diff', UI.diff); } if (g('setRound')) { UI.round = +g('setRound').value; store.set('round', g('setRound').value); }
}

/* ---------------- deck builder ---------------- */
const SLEEVES = ['#2c4152', '#6b1f2a', '#1f4d3a', '#3d2a6b', '#7a5a1c', '#1b1b1b', '#c9c9d4', '#0f5d7a', '#8a2f6b'];
function newDeckId() { return 'my-' + Date.now().toString(36); }
function openBuilder(k) {
  if (!k) { k = newDeckId(); DECKS[k] = { name: 'New deck', legend: null, champ: null, runes: {}, bfs: [], main: {}, side: {}, sleeve: SLEEVES[0] }; }
  UI.bld = { k, q: '', type: 'all', setf: 'all', side: false, tab: DECKS[k].legend ? 'cards' : 'legend', msg: '' }; UI.screen = 'builder'; render();
}
function champsFor(D) { const L = C[D.legend]; if (!L) return []; const doms = legDoms(D.legend); const tags = L.tags || [];
  return Object.values(C).filter((c) => c.t === 'u' && !c.token && c.sup === 'champion' && (!c.d.length || c.d.every((d) => doms.includes(d))) && (!tags.length || (c.tags || []).some((t) => tags.includes(t)))); }
function builderPool(D) {
  const doms = legDoms(D.legend); const b = UI.bld; const q = b.q.trim().toLowerCase();
  return Object.values(C).filter((c) => ['u', 's', 'g'].includes(c.t) && !c.token && c.sup !== 'token' && !/^recruit-(de|nx|zn)$/.test(c.id) && c.id.indexOf('tok-') !== 0 && (!doms.length || !c.d.length || c.d.every((d) => doms.includes(d))) &&
    (b.type === 'all' || c.t === b.type) && (b.setf === 'all' || (c.sets || [c.set]).includes(b.setf)) &&
    (!q || c.n.toLowerCase().includes(q) || (c.txt || '').toLowerCase().includes(q) || (c.tags || []).some((t) => t.toLowerCase().includes(q))))
    .sort((x, y) => (x.e || 0) - (y.e || 0) || x.n.localeCompare(y.n));
}
const AUTO_BADGE = { auto: ['✓', 'Plays automatically from its text'], hand: ['✓', 'Programmed by hand from its text'], vanilla: ['✓', 'No rules text'], manual: ['⚠', 'Part of this card is applied by hand with the table tools'] };
function builderHTML() {
  const b = UI.bld, D = DECKS[b.k]; const n = deckCount(D), probs = deckProblems(D);
  const list = b.side ? (D.side = D.side || {}) : D.main;
  const tabs = [['legend', 'Legend'], ['champ', 'Champion'], ['cards', 'Main deck'], ['bfs', 'Battlefields'], ['runes', 'Runes'], ['look', 'Sleeves & name']];
  let body = '';
  if (b.tab === 'legend') body = `<div class="bgrid">${Object.values(C).filter((c) => c.t === 'L').sort((x, y) => x.n.localeCompare(y.n)).map((c) => `<button class="bopt ${D.legend === c.id ? 'on' : ''}" data-setleg="${c.id}">${cardHTML(c.id)}<b>${esc(c.n)}</b><span class="note">${c.d.map((d) => DOMS[d]).join(' / ')}${c.manual ? ' · ⚠' : ''}</span></button>`).join('')}</div>`;
  else if (b.tab === 'champ') { const cs = champsFor(D); body = cs.length ? `<div class="bgrid">${cs.map((c) => `<button class="bopt ${D.champ === c.id ? 'on' : ''}" data-setchamp="${c.id}">${cardHTML(c.id)}<b>${esc(c.n)}</b><span class="note">${costText(c)} · ${c.m} might</span></button>`).join('')}</div>` : '<p class="note">Pick a legend first.</p>'; }
  else if (b.tab === 'bfs') body = `<p class="note">Choose up to 3 battlefields (${(D.bfs || []).length}/3).</p><div class="bgrid wide">${Object.values(C).filter((c) => c.t === 'B' && c.sup !== 'token').sort((x, y) => x.n.localeCompare(y.n)).map((c) => `<button class="bopt land ${(D.bfs || []).includes(c.id) ? 'on' : ''}" data-setbf="${c.id}"><div class="bfart">${artImg(c.id, c.n)}</div><b>${esc(c.n)}</b><span class="note">${esc(c.txt)}</span></button>`).join('')}</div>`;
  else if (b.tab === 'runes') { const doms = legDoms(D.legend); body = doms.length ? `<p class="note">12 runes split between your legend's domains.</p><div class="row" style="gap:24px;flex-wrap:wrap">${doms.map((d) => `<div class="runeset"><div class="rune"><div class="fbd">${DOMS[d]}</div>${artImg('R_' + d, DOMS[d])}</div><div class="ectl"><button class="btn sm" data-rune="${d}:-1">−</button><b class="num">${(D.runes || {})[d] || 0}</b><button class="btn sm" data-rune="${d}:1">+</button></div><span class="label">${DOMS[d]}</span></div>`).join('')}</div>` : '<p class="note">Pick a legend first.</p>'; }
  else if (b.tab === 'look') body = `<div style="display:grid;gap:14px;max-width:520px"><label style="display:grid;gap:5px"><span class="label">Deck name</span><input type="text" id="deckName" value="${esc(D.name || '')}"></label>
      <div><span class="label">Sleeve color</span><div class="row" style="gap:8px;margin-top:6px;flex-wrap:wrap">${SLEEVES.map((c) => `<button class="sleevebtn ${D.sleeve === c ? 'on' : ''}" data-sleeve="${c}" style="--sleeve:${c}"><div class="back sl"></div></button>`).join('')}<label class="sleevebtn custom" title="Custom color"><input type="color" id="sleeveCustom" value="${D.sleeve || '#2c4152'}"></label></div></div>
      <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" id="exportDeck">Copy list as text</button>${!D.builtin ? '<button class="btn" id="delDeck">Delete deck</button>' : '<button class="btn" id="resetDeck">Reset to tournament list</button>'}</div></div>`;
  else {
    const pool = builderPool(D); const shown = pool.slice(0, 160);
    const cap = (c) => 3 - (c === D.champ ? 1 : 0);
    const row = (c) => { const cnt = list[c.id] || 0; const au = AUTO_BADGE[automation(c.id)] || ['', ''];
      return `<div class="erow ${cnt ? 'on' : ''}"><div class="eart" data-prev="${c.id}">${cardHTML(c.id)}</div><div class="einfo"><b>${esc(c.n)} <span class="auto ${automation(c.id)}" title="${au[1]}">${au[0]}</span></b><span class="note">${costText(c)}${c.t === 'u' ? ' · ' + c.m + ' might' : ''}${c.sp && c.t === 's' ? ' · ' + SPEED[c.sp] : ''} · ${c.d.map((d) => DOMS[d]).join('/') || 'Colorless'} · ${c.set}${c.preview ? ' (preview)' : ''}</span>${c.manual ? `<span class="note warn">${esc(c.manual)}</span>` : ''}</div>
        <div class="ectl"><button class="btn sm" data-dec="${c.id}" ${cnt ? '' : 'disabled'}>−</button><b class="num">${cnt}</b><button class="btn sm" data-inc="${c.id}" ${cnt < cap(c.id) ? '' : 'disabled'}>+</button></div></div>`; };
    const inDeck = Object.keys(list).filter((c) => C[c] && list[c] > 0).sort((x, y) => (C[x].e || 0) - (C[y].e || 0) || C[x].n.localeCompare(C[y].n));
    body = `<div class="bsplit"><div class="bpool"><div class="row" style="gap:8px;flex-wrap:wrap"><input type="text" id="bq" placeholder="Search name, text or tag" value="${esc(b.q)}" style="flex:1;min-width:160px">
        <select id="btype"><option value="all">All types</option><option value="u">Units</option><option value="s">Spells</option><option value="g">Gear</option></select>
        <select id="bset"><option value="all">All sets</option>${['OGN', 'OGS', 'SFD', 'UNL', 'VEN', 'RAD'].map((x) => `<option value="${x}">${x}</option>`).join('')}</select></div>
        <div class="note">${pool.length} cards${pool.length > shown.length ? ` (showing ${shown.length}; search to narrow)` : ''} in ${legDoms(D.legend).map((d) => DOMS[d]).join(' and ') || 'all domains'}.</div>
        <div class="elist">${shown.map(row).join('')}</div></div>
      <div class="bdeck"><div class="row" style="justify-content:space-between"><b>${b.side ? 'Sideboard' : 'Main deck'}</b><button class="btn sm" id="bside">${b.side ? 'Edit main deck' : 'Edit sideboard'}</button></div>
        <div class="elist">${inDeck.map((c) => `<div class="drow" data-prev="${c}"><span class="num">${list[c]}×</span><span>${esc(C[c].n)}</span><span class="note">${costText(C[c])}</span><button class="btn sm" data-dec="${c}">−</button></div>`).join('') || '<div class="note">Nothing yet. Add cards with +.</div>'}</div></div></div>`;
  }
  return `<div class="setup builder" style="--sleeve:${D.sleeve || '#2c4152'}"><div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:10px"><div><div class="label">Deck builder</div><h1>${esc(D.name || 'New deck')}</h1></div>
      <div class="row" style="gap:10px"><span class="num ecount ${n === 40 ? 'ok' : 'bad'}">${n}/40</span><button class="btn" id="bldCancel">Back</button><button class="btn gold" id="bldSave">Save deck</button></div></div>
    <div class="note">${probs.length ? `<b style="color:var(--foe)">${esc(probs.slice(0, 4).join(' · '))}</b>` : '<b style="color:var(--ok)">Legal and ready to play</b>'}${b.msg ? ' · ' + esc(b.msg) : ''}</div>
    <div class="btabs">${tabs.map(([t, nm]) => `<button class="btab ${b.tab === t ? 'on' : ''}" data-btab="${t}">${nm}${t === 'legend' && D.legend ? ': ' + esc(C[D.legend].n) : ''}${t === 'champ' && D.champ ? ': ' + esc(C[D.champ].n) : ''}</button>`).join('')}</div>
    ${body}</div>`;
}
function deckText(D) {
  const L = []; L.push('Legend:'); if (D.legend) L.push('1 ' + C[D.legend].n); L.push('Champion:'); if (D.champ) L.push('1 ' + C[D.champ].n);
  L.push('MainDeck:'); for (const [c, n] of Object.entries(D.main)) if (C[c]) L.push(n + ' ' + C[c].n);
  L.push('Battlefields:'); for (const b of D.bfs || []) L.push('1 ' + C[b].n);
  L.push('Runes:'); for (const [d, n] of Object.entries(D.runes || {})) L.push(n + ' ' + DOMS[d] + ' Rune');
  if (D.side && Object.keys(D.side).length) { L.push('Sideboard:'); for (const [c, n] of Object.entries(D.side)) if (C[c]) L.push(n + ' ' + C[c].n); }
  return L.join('\n');
}
/* import: Rift Atlas / riftdecks / Piltover Archive style text lists */
const normName = (s) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
let NAME_IDX = null;
function nameIndex() { if (NAME_IDX) return NAME_IDX; NAME_IDX = new Map(); for (const c of Object.values(C)) { if (c.id.indexOf('tok-') === 0) continue; const k = normName(c.n); if (!NAME_IDX.has(k) || c.sup !== 'token') NAME_IDX.set(k, c.id); const short = normName(c.n.split(',')[0]); if (!NAME_IDX.has(short)) NAME_IDX.set(short, c.id); } return NAME_IDX; }
function findCard(name) {
  const idx = nameIndex(); const k = normName(name.replace(/\s*\((?:[A-Z]{2,4})?\s*[-#]?\s*\w*\)\s*$/, '').replace(/\s+[A-Z]{3}[- ]?\d+[a-z*]?$/, ''));
  if (idx.has(k)) return idx.get(k);
  for (const [nm, id] of idx) if (nm.startsWith(k) || k.startsWith(nm + ' ')) return id;
  return null;
}
function parseDeckText(txt) {
  const D = { name: 'Imported deck', legend: null, champ: null, runes: {}, bfs: [], main: {}, side: {}, sleeve: SLEEVES[0] }; const miss = [];
  let sec = null;
  for (let line of txt.split(/\r?\n/)) {
    line = line.trim(); if (!line) continue;
    const h = line.match(/^(legend|champion|chosen champion|main ?deck|main|battlefields?|runes?|rune deck|side ?board|sideboard)\s*:?\s*(?:\(\d+\))?\s*$/i);
    if (h) { const w = h[1].toLowerCase(); sec = w.startsWith('legend') ? 'legend' : w.includes('champion') ? 'champ' : w.startsWith('battle') ? 'bf' : w.startsWith('rune') ? 'rune' : w.startsWith('side') ? 'side' : 'main'; continue; }
    const m = line.match(/^(\d+)\s*x?\s+(.+)$/i) || line.match(/^(.+?)\s+x\s*(\d+)$/i);
    let n = 1, name = line; if (m) { if (/^\d+$/.test(m[1])) { n = +m[1]; name = m[2]; } else { name = m[1]; n = +m[2]; } }
    if (/^(deck|name)\s*:/i.test(line)) { D.name = line.replace(/^[^:]*:\s*/, ''); continue; }
    const id = findCard(name); if (!id) { miss.push(name); continue; }
    const c = C[id];
    if (c.t === 'L') { D.legend = id; continue; }
    if (c.t === 'B') { if (!D.bfs.includes(id)) D.bfs.push(id); continue; }
    if (c.t === 'r') { const d = c.d[0] || Object.keys(DOMS).find((x) => c.n.toLowerCase().includes(x)); if (d) D.runes[d] = (D.runes[d] || 0) + n; continue; }
    if (sec === 'side') { D.side[id] = (D.side[id] || 0) + n; continue; }
    if (sec === 'champ' && !D.champ) { D.champ = id; if (n > 1) D.main[id] = (D.main[id] || 0) + n - 1; continue; }
    D.main[id] = (D.main[id] || 0) + n;
  }
  if (!D.champ && D.legend) { const tags = C[D.legend].tags || []; const cand = Object.keys(D.main).find((id) => C[id].sup === 'champion' && (C[id].tags || []).some((t) => tags.includes(t))); if (cand) { D.champ = cand; D.main[cand]--; if (!D.main[cand]) delete D.main[cand]; } }
  if (D.legend) D.name = C[D.legend].n + ' (imported)';
  return { D, miss };
}
function importHTML() {
  return `<div class="modal" id="importer"><div class="box" style="width:min(620px,100%)"><div class="hd"><h3>Import a decklist</h3><button class="btn" id="closeImport">Cancel</button></div>
    <p class="note">Paste a list from Rift Atlas, riftdecks, Piltover Archive or similar. Lines like "3 Gust" or "Gust x3", with optional Legend / Champion / Main Deck / Battlefields / Runes / Sideboard headings.</p>
    <textarea id="importText" rows="14" style="width:100%;font:inherit;color:var(--ink);background:#0e171e;border:1px solid var(--line-strong);border-radius:8px;padding:8px">${esc(UI.importer.text || '')}</textarea>
    ${UI.importer.msg ? `<div class="note" style="color:var(--foe)">${esc(UI.importer.msg)}</div>` : ''}
    <div class="row" style="gap:8px;justify-content:flex-end"><button class="btn gold" id="doImport">Import</button></div></div></div>`;
}

/* ---------------- the table ---------------- */
function turnBanner() { if (!UI.banner) return ''; const b = UI.banner; return `<div class="turnban ${b.foe ? 'foe' : ''}"><div class="in"><h2>${esc(b.text)}</h2><div class="steps"><span>Awaken</span><span>Beginning</span><span>Channel</span><span>Draw</span></div></div></div>`; }
function noteTurn() { if (!S || S.mode === 'mull') return; if (S.turnNo !== UI.lastTurn) { UI.lastTurn = S.turnNo; const mine = S.active === 0; UI.banner = { text: (mine ? 'Your turn' : "AI's turn") + ' · ' + S.turnNo, foe: !mine }; clearTimeout(UI.banT); UI.banT = setTimeout(() => { UI.banner = null; const el = document.querySelector('.turnban'); if (el) el.remove(); }, 1900); } }
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
UI.anims = new Map();
function centerOf(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
function queueFly(key, src, delay, dur, kind) { if (RM || !src) return; const c = centerOf(src); UI.anims.set(key, { sx: c.x, sy: c.y, start: performance.now() + delay, dur, kind }); }
function playAnims() {
  const now = performance.now();
  for (const [key, an] of UI.anims) {
    const t = now - an.start; if (t > an.dur) { UI.anims.delete(key); continue; }
    const el = document.querySelector(`[data-anim="${key}"]`); if (!el || !el.animate) continue;
    const c = centerOf(el), dx = (an.sx - c.x) / PH.sc, dy = (an.sy - c.y) / PH.sc;
    const kf = an.kind === 'draw' ? [{ transform: `translate(${dx}px,${dy}px) rotate(-14deg) scale(.55)`, opacity: 0, filter: 'brightness(.4)' }, { offset: 0.25, opacity: 1 }, { transform: 'translateY(-18px) scale(1.12)', filter: 'brightness(1.3)', offset: 0.75 }, { transform: 'none', opacity: 1, filter: 'none' }]
      : an.kind === 'rune' ? [{ transform: `translate(${dx}px,${dy}px) scale(.7) rotate(-20deg)`, opacity: 0, filter: 'brightness(2)' }, { offset: 0.2, opacity: 1 }, { transform: 'scale(1.15)', filter: 'brightness(1.6)', offset: 0.8 }, { transform: 'none', opacity: 1, filter: 'none' }]
      : [{ transform: 'scale(1.3)', opacity: 0, filter: 'brightness(2)' }, { transform: 'none', opacity: 1, filter: 'none' }];
    const a = el.animate(kf, { duration: an.dur, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards', delay: Math.max(0, -t) });
    if (t > 0) a.currentTime = t;
  }
}
function animateNew() {
  if (!S || UI.screen !== 'game' || S.mode === 'mull') return;
  const pile = (k) => document.querySelector(`[data-pile="${k}"]`);
  let i = 0; document.querySelectorAll('[data-rid]').forEach((el) => { const id = +el.dataset.rid; if (!UI.seenR.has(id)) { UI.seenR.add(id); queueFly('r' + id, pile('rune' + el.dataset.owner), (i++) * 260, 700, 'rune'); } });
  const n0 = S.players[0].hand.length, n1 = S.players[1].hand.length, d0 = i * 260;
  if (n0 > UI.prevHand[0]) for (let j = UI.prevHand[0]; j < n0; j++) queueFly('h0_' + j, pile('deck0'), d0 + (j - UI.prevHand[0]) * 300, 800, 'draw');
  if (n1 > UI.prevHand[1]) for (let j = UI.prevHand[1]; j < n1; j++) queueFly('h1_' + j, pile('deck1'), d0 + (j - UI.prevHand[1]) * 300, 800, 'draw');
  UI.prevHand = [n0, n1];
  document.querySelectorAll('[data-obj]').forEach((el) => { const id = +el.dataset.obj; if (!UI.seenO.has(id)) { UI.seenO.add(id); UI.anims.set('o' + id, { sx: 0, sy: 0, start: performance.now(), dur: 480, kind: 'pop' }); } });
  playAnims();
}
function fitRows() {
  document.querySelectorAll('.zone, .lane, .hand').forEach((row) => {
    const kids = [...row.children].filter((k) => !k.classList.contains('zl') && k.offsetParent !== null && getComputedStyle(k).position !== 'absolute');
    kids.forEach((k) => { k.style.marginLeft = ''; }); if (kids.length < 2) return;
    const cs = getComputedStyle(row), avail = row.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const gap = parseFloat(cs.columnGap) || 0; const used = kids.reduce((a, k) => a + k.getBoundingClientRect().width / PH.sc, 0) + gap * (kids.length - 1);
    if (used <= avail) return; const over = (used - avail) / (kids.length - 1) + 2; kids.slice(1).forEach((k) => { k.style.marginLeft = -over + 'px'; });
  });
}
window.addEventListener('resize', () => { if (UI.screen === 'game') fitRows(); });
const myTurnToAct = () => S && actor(S) === 0 && !UI.driving && S.winner == null;
function poolEnergy(q) { return S.players[q].pool.filter((x) => x.e && poolUsable(S, x, { type: 'x' })).length; }
function tableHTML() {
  const me = S.players[0], ai = S.players[1], myAct = myTurnToAct();
  const acts = myAct ? legal(S, 0, { mana: true }) : [];
  const TS = targetSets(acts); const ctx = { tgt: TS.objs, picked: TS.picked };
  const dests = new Set(); if (UI.sel.length && myAct && S.mode === 'main' && !S.choice) for (const d of [0, 1, 'base']) if (canMove(S, 0, UI.sel, d)) dests.add(String(d));
  const hand = me.hand.map((c, i) => { const n = me.hand.length, mid = (n - 1) / 2, rot = (i - mid) * 3, lift = Math.abs(i - mid) * 3;
    const ok = acts.some((a) => (a.t === 'play' && a.src === 'hand' && a.cid === c) || (a.t === 'hide' && a.cid === c));
    return cardHTML(c, { cls: 'hc ' + (myAct && !UI.paying && !S.choice ? (ok ? 'ok' : 'dim') : ''), attrs: `data-hand="${i}" data-anim="h0_${i}" style="transform:translateY(${lift}px) rotate(${rot}deg)"` }); }).join('');
  const lane = (i, q) => { const hid = S.hidden.filter((h) => h.bf === i && h.owner === q);
    const hidHTML = hid.map((h) => q === 0 ? `<div class="back sl mine" style="--sleeve:${sleeveOf(0)}" data-hid="${h.id}" data-prev="${h.cid}" title="Your hidden ${esc(C[h.cid].n)}"><span class="hl">${esc(C[h.cid].n)}</span></div>` : `<div class="back sl hid" style="--sleeve:${sleeveOf(1)}" title="Enemy hidden card"><span class="hl">Hidden</span></div>`).join('');
    const gear = S.objs.filter((o) => o.k === 'g' && o.loc === i && o.att == null && o.ctrl === q);
    return `<div class="lane l${q}">${unitsAt(S, i, q).map((o) => objHTML(o, ctx)).join('')}${gear.map((o) => objHTML(o, ctx)).join('')}${hidHTML ? `<div class="hidrow">${hidHTML}</div>` : ''}</div>`; };
  const track = (q) => { const pl = S.players[q]; const W = winScore(S); const nums = []; for (let n = 0; n <= W; n++) nums.push(n); if (q === 0) nums.reverse();
    return `<div class="z-track">${nums.map((n) => `<span class="pt ${n === pl.pts ? 'cur' : ''} ${n < pl.pts ? 'past' : ''}">${n}</span>`).join('')}</div>`; };
  const bfZone = (q) => { const i = S.bfs.findIndex((b) => b.owner === q); const b = S.bfs[i], B = C[b.id], c = S.ctrl[i];
    return `<div class="z-bf bf ${S.sd && S.sd.bf === i ? 'sdx' : ''} ${dests.has(String(i)) || TS.zones.has(String(i)) ? 'dest' : ''}" data-dest="${i}">
      <div class="bfcardz" data-prev="${b.id}" title="${esc(B.n)}: ${esc(B.txt)}">${artImg(b.id, B.n)}<div class="bfcap"><span class="ctrl ${c == null ? 'cn' : 'c' + c}">${c == null ? 'Open' : c === 0 ? 'Yours' : 'AI'}</span>${S.sd && S.sd.bf === i ? '<span class="sdtag">Showdown</span>' : ''}<b>${esc(B.n)}</b></div></div>
      <div class="bflanes">${lane(i, 1)}${lane(i, 0)}</div></div>`; };
  const legAct = acts.some((a) => (a.t === 'ab' && a.src === 'L') || (a.t === 'emp' && a.o === 'L'));
  const legZone = (q) => { const pl = S.players[q]; const L = pl.legend; const st = [pl.legEmp ? 'Empowered' : '', pl.legPile && pl.legPile.length ? pl.legPile.length + ' banished' : ''].filter(Boolean);
    return `<div class="z-leg zbox"><span class="zlab">Legend</span><div class="legend-slot"><div class="slot ${pl.legEx ? 'ex' : ''} ${q === 0 ? 'mine' : ''} ${q === 0 && legAct ? 'canuse' : ''} ${TS.legends.has(q) ? 'tgt' : ''}" ${q === 0 ? 'data-leg="1" tabindex="0"' : `data-legfoe="1"`}>${cardHTML(L)}${st.length ? `<div class="badges"><span class="statusb">${st.join(' · ')}</span></div>` : ''}</div></div></div>`; };
  const champZone = (q) => { const pl = S.players[q]; return `<div class="z-champ zbox"><span class="zlab">Champion</span>${pl.champ ? `<div class="slot" ${q === 0 ? 'data-champ="1"' : ''}>${cardHTML(pl.champ)}</div>` : ''}</div>`; };
  const deckZone = (q) => { const pl = S.players[q]; return `<div class="z-deck zbox pile" data-pile="deck${q}"><span class="zlab">Deck</span>${pileHTML(pl.deck.length, false, sleeveOf(q))}<span class="cnt">${pl.deck.length}</span></div>`; };
  const trashZone = (q) => { const pl = S.players[q]; return `<div class="z-trash zbox pile trashpile" data-trash="${q}" title="Look through ${q ? "the AI's" : 'your'} trash and banished cards"><span class="zlab">Trash</span>${pl.trash.length ? cardHTML(pl.trash[pl.trash.length - 1], { attrs: 'style="--cw:var(--pw);--ch:var(--ph)"' }) : ''}<span class="cnt">${pl.trash.length}</span></div>`; };
  const rdeckZone = (q) => { const pl = S.players[q]; return `<div class="z-rdeck zbox pile" data-pile="rune${q}"><span class="zlab">Runes</span>${pileHTML(pl.runeDeck.length, true)}<span class="cnt">${pl.runeDeck.length}</span></div>`; };
  const runesZone = (q) => { const pl = S.players[q]; const rs = pl.runes.slice().sort((a, b) => a.d.localeCompare(b.d) || a.id - b.id); const pe = pl.pool.filter((x) => x.e).length, pp = pl.pool.filter((x) => x.p).length;
    return `<div class="z-runes zbox"><span class="zlab">Runes · ${pl.runes.filter((r) => !r.ex).length} ready${pe || pp ? ` · pool ${pe ? pe + 'E ' : ''}${pp ? pp + 'P' : ''}` : ''}${pl.xp ? ` · ${pl.xp} XP` : ''}</span><div class="runes">${rs.map((r) => runeCard(r, q)).join('')}</div></div>`; };
  const baseZone = (q) => `<div class="z-base zone ${q === 1 ? 'foebase' : ''} ${(q === 0 && dests.has('base')) || TS.zones.has('base') ? 'dest' : ''}" data-dest="base"><span class="zl">Base · units + gear</span>${unitsAt(S, 'base', q).map((o) => objHTML(o, ctx)).join('')}${S.objs.filter((o) => o.k === 'g' && o.ctrl === q && o.loc === 'base' && o.att == null).map((o) => objHTML(o, ctx)).join('')}</div>`;
  const mat = (q) => `<div class="pm ${q ? 'foe' : 'me'}">${track(q)}${bfZone(q)}${legZone(q)}${champZone(q)}${baseZone(q)}${deckZone(q)}${rdeckZone(q)}${runesZone(q)}${trashZone(q)}</div>`;
  const aiHand = `<div class="aihand" data-pile="hand1">${S.reveal[1] ? ai.hand.map((c) => cardHTML(c, { attrs: 'style="--cw:calc(var(--pw)*.85);--ch:calc(var(--ph)*.85)"' })).join('') : Array.from({ length: ai.hand.length }, (_, j) => `<div class="back sl" style="--sleeve:${sleeveOf(1)}" data-anim="h1_${j}"></div>`).join('')}<span class="label">${ai.hand.length} in hand${S.reveal[1] ? ' (revealed)' : ''}</span></div>`;
  const chain = S.chain.length ? `<div class="chainbox"><span class="label">Chain · top resolves first</span>${S.chain.slice().reverse().map((x) => `<div class="ci ${x.countered ? 'x' : ''} ${TS.chain.has(x.id) ? 'cit' : ''}" data-ci="${x.id}">${cardHTML(x.cid)}<span><b style="color:${x.p ? 'var(--foe)' : 'var(--you)'}">${x.p ? 'AI' : 'You'}</b> ${esc(C[x.cid].n)}${esc(pickText(S, x.picks, 0))}</span></div>`).join('')}</div>` : '';
  const legU = (q) => { if (q === 0 && UI.playmat) return `url('${UI.playmat}')`; const u = artURL(S.players[q].legend); return u ? `url('${imgURL(u)}')` : 'none'; };
  return `<div class="table"><div class="mat ${UI.playmat ? 'custommat' : ''}" style="--matTop:${legU(1)};--matBot:${legU(0)}"><div class="matbg top"></div><div class="matbg bot"></div>
      ${aiHand}${mat(1)}${mat(0)}
      <div class="handdock"><div class="hand" id="hand">${hand}</div></div>
      <div class="dock">${chain}${promptHTML(myAct, acts)}
        <div class="dockbar"><button class="btn sm" id="undo" ${UI.hist.length && myAct ? '' : 'disabled'} title="Undo (Ctrl+Z)">↶ Undo</button><button class="btn sm ${UI.autopay ? '' : 'gold'}" id="payToggle" title="Choose whether runes are paid for you">${UI.autopay ? 'Auto-pay' : 'Pay myself'}</button><button class="btn sm" id="toolsBtn" title="Fix the board by hand (T)">Tools</button>
          <span class="tpill num" title="Game time · your turn"><span id="tGame">${UI.t0 ? fmt((UI.tEnd || Date.now()) - UI.t0) : '0:00'}</span> · <span id="tTurn">${actor(S) === 0 && S.winner == null ? fmt(Date.now() - UI.turnStart) : '—'}</span>${UI.round ? ` · <span id="tRound">--</span>` : ''}</span></div></div>
      ${S.winner != null ? `<div class="banner"><h2>${S.winner === 0 ? 'You win' : 'AI wins'} · ${me.pts}–${ai.pts}</h2><div class="acts" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="review">Review my game</button><button class="btn" id="rematch">Rematch</button><button class="btn gold" id="newgame">Change decks</button></div></div>` : ''}
    </div>
    <button class="drawertab ${UI.drawer ? 'open' : ''}" id="drawerTab" title="Game log, coach and settings (L)">${UI.drawer ? 'Close ›' : '‹ Log &amp; coach'}</button>
    <div class="panel ${UI.drawer ? 'open' : ''}">
      <div class="box timer"><div class="tm"><span class="label">Game</span><b class="num" id="tGame2">${UI.t0 ? fmt((UI.tEnd || Date.now()) - UI.t0) : '0:00'}</b></div><div class="tm"><span class="label">Your total</span><b class="num" id="tMine">${fmt(UI.myTime)}</b></div></div>
      <div class="box grow"><div class="hd"><h3>Game log</h3><span class="label">AI: ${UI.brain === 'claude' && UI.key ? (UI.model === 'deep' ? 'Claude Sonnet' : 'Claude Haiku') : ({ easy: 'Easy', normal: 'Normal', hard: 'Hard' }[UI.diff] || 'built-in')}</span></div>
        ${UI.note ? `<div class="note">${esc(UI.note)}</div>` : ''}<div class="log" id="log">${RB.getLog().slice(-260).map((l) => `<div class="${l.cls}">${esc(l.msg)}</div>`).join('')}</div></div>
      <div class="box"><div class="hd"><h3>Coach</h3><button class="btn" id="coachBtn" ${myAct && !UI.coachBusy ? '' : 'disabled'}>${UI.coachBusy ? 'Thinking…' : 'Best line?'}</button></div><div class="coach" id="coachOut"></div></div>
      <div class="box"><div class="row" style="flex-wrap:wrap"><button class="btn" id="openSettings">Settings</button><button class="btn" id="quit">Change decks</button></div></div>
    </div></div>
    <div class="pops">${choicePop(myAct, acts)}${UI.pops.map(popHTML).join('')}</div>
    ${pickOverlay(myAct, acts)}${trashOverlay()}${toolsHTML()}${turnBanner()}${ctxHTML()}${viewHTML()}`;
}

/* ---------------- choosing how to play a card ---------------- */
const KEY_ORDER = { u: ['to', 'sac', 'sacN', 'alt', 'buffN', 'acc', 'extra'], g: ['to', 'extra'], s: ['p0', 'p1', 'x', 'sac', 'rep', 'extra', 'sing'], ab: ['p0', 'p1', 'x'] };
function tval(a, k) {
  if (k === 'to') return a.to; if (k === 'p0') return (a.picks || [])[0]; if (k === 'p1') return (a.picks || [])[1];
  if (k === 'x') return a.x || 0; if (k === 'sac') return a.sac != null ? a.sac : null; if (k === 'sacN' || k === 'buffN') return a[k] || 0;
  return !!a[k];
}
function keyOrder(a) { if (a.t === 'ab') return KEY_ORDER.ab; if (a.t === 'play') return KEY_ORDER[C[a.cid].t] || KEY_ORDER.s; return []; }
function startTarget(list, title, cid) {
  if (!list.length) { offerFail(title, cid); return; }
  UI.sel = []; UI.tgt = { title, cid, acts: list.filter((a) => a.t !== 'hide'), hides: list.filter((a) => a.t === 'hide'), picked: {} }; UI.hint = '';
  if (!UI.tgt.acts.length) { render(); return; }
  advanceTarget();
}
function nextKey(T) {
  for (const k of keyOrder(T.acts[0])) {
    if (k in T.picked) continue; const vals = T.acts.map((a) => tval(a, k));
    const uniq = [...new Set(vals.map((v) => JSON.stringify(v === undefined ? null : v)))]; if (uniq.length === 1) { T.picked[k] = vals[0]; continue; } return k;
  }
  return null;
}
function advanceTarget() {
  const T = UI.tgt; if (!T) return; if (!T.acts.length) { UI.tgt = null; render(); return; }
  const k = nextKey(T); T.key = k;
  if (k == null && T.acts.length === 1 && !T.hides.length) { const a = T.acts[0]; UI.tgt = null; doHuman(a); return; }
  render();
}
function pickTarget(v) { const T = UI.tgt; const k = T.key; T.acts = T.acts.filter((a) => JSON.stringify(tval(a, k) === undefined ? null : tval(a, k)) === JSON.stringify(v === undefined ? null : v)); T.picked[k] = v; T.hides = []; advanceTarget(); }
function costOf(a) { try { const k = actionCost(S, 0, a); return `${k.e}E${k.pw.length ? ' +' + k.pw.length + 'P' : ''}`; } catch (e) { return ''; } }
function valLabel(k, v, a) {
  const cost = a ? ` [${costOf(a)}]` : '';
  if (k === 'to') return (v === 'base' ? 'Base' : bfName(S, v)) + cost;
  if (k === 'p0' || k === 'p1') return v == null ? 'No target' : selLabel(S, v, 0);
  if (k === 'x') return `X = ${v}${cost}`;
  if (k === 'sac') return v == null ? `Don't sacrifice${cost}` : `Kill ${objLabel(S, v, 0)} as a cost${cost}`;
  if (k === 'sacN') return v ? `Kill ${v} friendly unit${v > 1 ? 's' : ''}${cost}` : `Kill none${cost}`;
  if (k === 'buffN') return v ? `Spend ${v} buff${v > 1 ? 's' : ''}${cost}` : `Spend no buffs${cost}`;
  const names = { acc: ['Accelerate (enters ready)', 'No Accelerate'], extra: ['Pay the additional cost', 'Skip the additional cost'], rep: ['Repeat it', 'No Repeat'], alt: ['Pay the alternate cost', 'Pay the normal cost'], sing: ['Exhaust legend + 3 units (2 less)', 'Pay normally'] };
  return (names[k] ? names[k][v ? 0 : 1] : String(v)) + cost;
}
function targetChoices() {
  const T = UI.tgt; if (!T) return [];
  if (T.key == null) return T.acts.map((a) => ({ label: actText(S, a, 0), act: a })).concat(T.hides.map((a) => ({ label: actText(S, a, 0), act: a })));
  const seen = new Map(); for (const a of T.acts) { const v = tval(a, T.key); const j = JSON.stringify(v === undefined ? null : v); if (!seen.has(j)) seen.set(j, { v, a }); }
  const showCost = !['p0', 'p1'].includes(T.key);
  return [...seen.values()].map(({ v, a }) => ({ label: valLabel(T.key, v, showCost ? a : null), v })).concat(T.hides.map((a) => ({ label: actText(S, a, 0), act: a })));
}
const KEY_PROMPT = { to: 'choose where to play it.', p0: 'choose a target.', p1: 'choose the second target.', x: 'choose how much to pay for X.', sac: 'choose a unit to kill as a cost.', sacN: 'choose how many units to kill.', buffN: 'choose how many buffs to spend.', acc: 'Accelerate?', extra: 'pay the additional cost?', rep: 'Repeat?', alt: 'which cost?', sing: 'use Starry-Eyed Songstress?' };
// what to highlight on the board: targets of the card being played, or options of an engine choice
function targetSets(acts) {
  const r = { objs: new Set(), zones: new Set(), chain: new Set(), legends: new Set(), picked: new Set() };
  const addV = (v) => { if (typeof v === 'number') r.objs.add(v); else if (v === 'base' || v === 0 || v === 1) r.zones.add(String(v)); else if (typeof v === 'string') { if (v[0] === 'S') r.chain.add(+v.slice(1)); else if (v[0] === 'L') r.legends.add(+v[1]); else if (v[0] === 'B') r.zones.add(v.slice(1)); } };
  if (UI.tgt && UI.tgt.key != null) { const k = UI.tgt.key; for (const a of UI.tgt.acts) { const v = tval(a, k); if (v == null) continue; if (k === 'to') r.zones.add(String(v)); else if (['p0', 'p1', 'sac'].includes(k)) addV(v); } return r; }
  if (S && S.choice && acts && acts.length && actor(S) === 0) {
    const d = S.choice.data;
    if (S.choice.kind === 'sel') { for (const id of d.opts) if (!(d.cur || []).includes(id)) addV(id); (d.cur || []).forEach((id) => r.picked.add(id)); }
    if (S.choice.kind === 'pickObj') for (const id of d.opts) if (typeof id === 'number') r.objs.add(id);
    if (S.choice.kind === 'dest') for (const x of d.opts) r.zones.add(String(x));
  }
  return r;
}
function choiceActFor(acts, v) { return acts.find((a) => a.t === 'pick' && (a.v === v || (a.v && typeof a.v === 'object' && a.v.add === v))); }
function offerFail(name, cid) { const c = C[cid] || {}; UI.hint = S.mode !== 'main' && c.t !== 's' && !c.kw.ambush ? `<b>${esc(name)}</b> can only be played in your main phase.` : S.mode === 'chain' && c.sp !== 'R' ? `<b>${esc(name)}</b> isn't a Reaction, so it can't respond on the chain.` : S.mode === 'showdown' && c.sp === 'N' ? `<b>${esc(name)}</b> is Normal speed and can't be played in a showdown.` : `<b>${esc(name)}</b> can't be played right now (not enough runes or no legal target).`; UI.tgt = null; render(); }
function handActs(cid) { return legal(S, 0, { mana: true }).filter((a) => (a.t === 'play' && a.src === 'hand' && a.cid === cid) || (a.t === 'hide' && a.cid === cid)); }

function modeText() {
  if (S.winner != null) return 'Game over.';
  const who = actor(S);
  if (S.choice) return who === 0 ? `<b>${esc(S.choice.data.why || 'Make a choice')}</b>` : '<span class="think">AI is choosing</span>';
  if (S.mode === 'chain') { const top = S.chain[S.chain.length - 1]; return who === 0 ? `<b>${top.p ? 'AI cast' : 'You cast'} ${esc(C[top.cid].n)}.</b> Respond with a Reaction or pass.` : '<span class="think">AI may respond</span>'; }
  if (S.mode === 'showdown') return who === 0 ? `<b>Showdown at ${esc(bfName(S, S.sd.bf))}.</b> ${S.sd.att === 0 ? 'You attacked.' : 'The AI attacked.'} Play an Action or Reaction, or pass.` : `<span class="think">Showdown at ${esc(bfName(S, S.sd.bf))}: AI's move</span>`;
  if (S.active === 0) return UI.sel.length ? `<b>${UI.sel.length} selected.</b> Tap a glowing battlefield or your base to move.` : UI.hint || '<b>Your turn.</b> Play cards, move units, or end your turn.';
  return `<span class="think">AI's turn${UI.thinking ? ' · thinking' : ''}</span>`;
}
const OVERLAY_KINDS = ['discard', 'stack'];
function choicePop(myAct, acts) {
  if (!myAct) return '';
  let opts = null, title = '', cid = null, multi = false;
  if (UI.tgt) { opts = targetChoices().map((c, i) => ({ i, label: c.label, src: 'topt' })); cid = UI.tgt.cid; title = `<b>${esc(UI.tgt.title)}</b>${UI.tgt.key == null ? ' · choose how to play it' : ' · ' + (KEY_PROMPT[UI.tgt.key] || 'choose')}`; }
  else if (S.choice && !OVERLAY_KINDS.includes(S.choice.kind)) {
    const ch = S.choice; multi = ch.kind === 'sel' && (ch.data.upto || (ch.data.n || 1) > 1);
    opts = acts.map((a, i) => ({ i, label: a.label, src: 'pick' })); title = `<b>${esc(ch.data.why || 'Make a choice')}</b>`;
    if (multi) title += `<div class="note">${(ch.data.cur || []).length} chosen${ch.data.n && ch.data.n < 99 ? ' of ' + (ch.data.upto ? 'up to ' : '') + ch.data.n : ''}. Click units on the board or pick here.</div>`;
    cid = ch.kind === 'vision' ? ch.data.top : (S.exec[ch.frameDepth] && S.exec[ch.frameDepth].ctx.card) || null;
  }
  if (!opts) return '';
  const boardHint = UI.tgt && UI.tgt.key && ['to', 'p0', 'p1', 'sac'].includes(UI.tgt.key);
  return `<div class="cpop">${cid && C[cid] ? `<div class="cpc" data-prev="${cid}">${cardHTML(cid)}</div>` : ''}
    <div class="cpb"><div class="msg">${title}${boardHint ? '<div class="note">Click a glowing card or zone on the board, or pick here.</div>' : ''}${UI.hint && UI.tgt ? `<div class="note">${UI.hint}</div>` : ''}</div>
    <div class="opts2">${opts.map((o) => `<button class="opt" data-${o.src === 'pick' ? 'pickidx' : 'topt'}="${o.i}">${o.i < 9 ? `<kbd>${o.i + 1}</kbd>` : ''}<span>${esc(o.label)}</span></button>`).join('')}</div>
    <div class="row" style="gap:8px">${UI.tgt ? '<button class="btn sm" id="cancel">Cancel <kbd>Esc</kbd></button>' : ''}${UI.hist.length && !UI.tgt ? '<button class="btn sm" id="undo">↶ Undo</button>' : ''}</div></div></div>`;
}
function pickOverlay(myAct, acts) {
  if (!(myAct && S.choice && OVERLAY_KINDS.includes(S.choice.kind))) return '';
  return `<div class="pickover"><div class="inner"><div class="actbox" style="border:0;padding:0"><div class="msg">${modeText()}</div></div>
    <div class="pickcards">${acts.map((a, i) => (a.v === 'none' ? `<button class="btn" data-pickidx="${i}">${esc(a.label)}</button>` : cardHTML(a.v, { attrs: `data-pickidx="${i}" title="${i < 9 ? 'Key ' + (i + 1) : ''}"` }))).join('')}</div>${UI.hist.length ? '<div><button class="btn sm" id="undo">↶ Undo last move</button></div>' : ''}</div></div>`;
}
function payStatus() {
  const P0 = UI.paying, pl = S.players[0]; const fl = pl.pool.filter((x) => x.e && poolUsable(S, x, purposeOf(S, P0.a))).length; const eNeed = Math.max(0, P0.cost.e - fl);
  const reqs = (P0.cost.pw || []).slice(); const rc = P0.rc.map((id) => pl.runes.find((r) => r.id === id)).filter(Boolean); const used = new Set();
  const pp = pl.pool.filter((x) => x.p && poolUsable(S, x, purposeOf(S, P0.a))).map((x) => x.p);
  const powRows = reqs.sort((a, b) => (a === 'any') - (b === 'any')).map((q) => { const k = pp.findIndex((d) => d === 'any' || q === 'any' || q.split('|').includes(d)); if (k >= 0) { pp.splice(k, 1); return { q, ok: true, pool: true }; } const i = rc.findIndex((r, j) => !used.has(j) && (q === 'any' || q.split('|').includes(r.d))); if (i >= 0) { used.add(i); return { q, ok: true }; } return { q, ok: false }; });
  let gl = (P0.gold || []).length; powRows.forEach((r) => { if (!r.ok && gl > 0) { r.ok = true; r.gold = true; gl--; } });
  const valid = checkManualPay(S, 0, P0.cost, { ex: P0.ex, rc: P0.rc, gold: P0.gold || [], purpose: purposeOf(S, P0.a) });
  return { eNeed, eHave: P0.ex.length, fl, powRows, valid };
}
function payHTML() {
  const P0 = UI.paying, st = payStatus(); const a = P0.a; const name = a.t === 'hide' ? 'Hide ' + C[a.cid].n : a.t === 'play' ? C[a.cid].n : a.t === 'equip' ? 'Equip' : 'Ability';
  const qn = (q) => (q === 'any' ? 'any' : q.split('|').map((d) => DOMS[d]).join(' or '));
  return `<div class="actbox"><div class="msg"><b>Pay for ${esc(name)}.</b> Click a ready rune to exhaust it for energy. Click an exhausted rune to recycle it for power.</div>
    <div class="payinfo"><div class="need"><span>Energy${st.fl ? ` (${st.fl} from your pool)` : ''}</span><b class="${st.eHave === st.eNeed ? 'ok' : ''} num">${st.eHave}/${st.eNeed}</b></div>
    ${st.powRows.map((r) => `<div class="need"><span>${qn(r.q)} power</span><b class="${r.ok ? 'ok' : ''}">${r.ok ? (r.gold ? 'paid with Gold' : r.pool ? 'from your pool' : 'paid') : 'needed'}</b></div>`).join('')}${S.objs.some((o) => o.ctrl === 0 && o.cid === 'tok-gold' && !o.ex) ? '<div class="note">Click a Gold in your base to spend it as 1 power of any type.</div>' : ''}
    ${!st.valid && st.eHave === st.eNeed && st.powRows.every((r) => r.ok) ? '<div class="note">Some of this cost comes from a card ability; use "Fill automatically".</div>' : ''}</div>
    <div class="big"><button class="btn gold" id="payOk" ${st.valid ? '' : 'disabled'}>Confirm payment <kbd>Space</kbd></button><button class="btn" id="payAuto">Fill automatically <kbd>A</kbd></button><button class="btn" id="cancel">Cancel <kbd>Esc</kbd></button></div></div>`;
}
function promptHTML(myAct, acts) {
  if (UI.paying && myAct) return payHTML();
  if (myAct && (UI.tgt || (S.choice && !OVERLAY_KINDS.includes(S.choice.kind)))) return `<div class="actbox"><div class="msg"><b>Make your choice</b> in the pop-up at the top.</div></div>`;
  const recent = RB.getLog().slice(-4).map((l) => `<div class="${l.cls}">${esc(l.msg)}</div>`).join('');
  let body = '';
  if (myAct && !S.choice) {
    let b = '';
    if (acts.some((a) => a.t === 'pass')) b += `<button class="btn gold" id="pass">Pass <kbd>Space</kbd></button>`;
    if (acts.some((a) => a.t === 'end')) b += `<button class="btn gold" id="end">End turn <kbd>Space</kbd></button>`;
    if (UI.sel.length) b += `<button class="btn" id="cancel">Clear selection <kbd>Esc</kbd></button>`;
    const abil = acts.filter((a) => a.t === 'ab' || a.t === 'emp' || a.t === 'equip');
    const groups = new Map(); for (const a of abil) { const k = a.t === 'ab' ? 'ab:' + a.src + ':' + a.idx + ':' + (a.host || '') + (a.borrow || '') + (a.bfGrant != null ? 'b' : '') + (a.granted ? 'g' : '') : a.t === 'emp' ? 'emp:' + a.o : 'eq:' + a.g; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a); }
    UI.abGroups = [...groups.values()];
    const abHTML = UI.abGroups.length ? `<div class="label" style="margin-top:4px">Abilities</div><div class="opts2">${UI.abGroups.map((g, i) => `<button class="opt" data-abg="${i}"><span>${esc(abGroupLabel(g))}</span></button>`).join('')}</div>` : '';
    body = `<div class="big">${b}</div>${abHTML}`;
  }
  return `<div class="actbox"><div class="msg">${modeText()}</div>${body}${recent ? `<div class="recent">${recent}</div>` : ''}<div class="keys">Space pass / end turn · Esc cancel · 1–9 pick · right-click for options</div></div>`;
}
function abGroupLabel(g) { const a = g[0]; if (a.t === 'emp') return actText(S, a, 0) + ` [${costOf(a)}]`; if (a.t === 'equip') { const gg = ob(S, a.g); return `Equip ${cn(gg.cid)}${g.length > 1 ? ' (choose unit)' : ' to ' + cn(ob(S, a.u).cid)}`; } const txt = actText(S, Object.assign({}, a, { picks: [] }), 0); return g.length > 1 ? txt.replace(/ \[[^\]]*\]$/, '') + ' (choose)' : txt; }
function startAbGroup(g) { const a = g[0]; if (a.t === 'equip') { UI.tgt = null; if (g.length === 1) { doHuman(a); return; } UI.tgt = { title: 'Equip ' + cn(ob(S, a.g).cid), cid: ob(S, a.g).cid, acts: [], hides: g, picked: {}, key: null }; render(); return; } startTarget(g, a.t === 'emp' ? 'Empower' : abGroupLabel([a]).split(':')[0], a.src === 'L' ? S.players[0].legend : typeof a.src === 'number' && ob(S, a.src) ? ob(S, a.src).cid : null); }

/* ---------------- overlays ---------------- */
function trashOverlay() {
  if (UI.trash == null) return ''; const q = UI.trash, pl = S.players[q];
  const cards = pl.trash.slice().reverse();
  return `<div class="pickover trashv"><div class="inner"><div class="hd" style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h3>${q ? "AI's" : 'Your'} trash · ${cards.length} card${cards.length === 1 ? '' : 's'}</h3><button class="btn" id="closeTrash">Close <kbd>Esc</kbd></button></div>
    <div class="note">Newest first. Hover a card to read it.</div>
    <div class="trashgrid">${cards.map((c) => cardHTML(c)).join('') || '<span class="note">Empty.</span>'}</div>
    ${pl.banished.length ? `<h3>Banished · ${pl.banished.length}</h3><div class="trashgrid">${pl.banished.slice().reverse().map((c) => cardHTML(c)).join('')}</div>` : ''}</div></div>`;
}
function popHTML(p) { return `<div class="pop ${p.who ? 'foe' : 'you'}" data-pop="${p.id}"><div class="pc">${cardHTML(p.cid)}</div><div class="pt"><span class="label" style="color:${p.who ? 'var(--foe)' : 'var(--you)'}">${p.who ? 'AI' : 'You'} ${esc(p.verb)}</span><b>${esc(C[p.cid].n)}</b><span>${esc(p.text)}</span></div></div>`; }
function pushPop(who, cid, verb, text, ms) { if (!C[cid]) return; const id = ++UI.popN; UI.pops.unshift({ id, who, cid, verb, text }); UI.pops = UI.pops.slice(0, 3); setTimeout(() => { UI.pops = UI.pops.filter((x) => x.id !== id); const el = document.querySelector(`[data-pop="${id}"]`); if (el) { el.classList.add('out'); setTimeout(() => el.remove(), 300); } }, ms || 5000); }
function popFor(who, a) {
  if (!a) return;
  if (a.t === 'play') { const c = C[a.cid]; if (c.t !== 's' && !c.ab.some((x) => x.kind === 'trig' && x.on === 'played') && who === 0) return; const txt = actText(S, a, who).replace(/ \[[^\]]*\]$/, ''); pushPop(who, a.cid, c.t === 's' ? 'cast' : 'played', txt.replace(/^(Cast|Play) /, ''), who ? 6000 : 4000); }
  else if (a.t === 'ab') { const cid = a.src === 'L' ? S.players[who].legend : typeof a.src === 'string' && a.src[0] === 'B' ? S.bfs[+a.src[1]].id : a.host ? ob(S, a.host).cid : ob(S, a.src) && ob(S, a.src).cid; if (cid) pushPop(who, cid, 'used', actText(S, a, who).replace(/ \[[^\]]*\]$/, ''), 4500); }
  else if (a.t === 'emp') { const cid = a.o === 'L' ? S.players[who].legend : ob(S, a.o).cid; pushPop(who, cid, 'empowered', cn(cid), 3500); }
}
/* manual tools: fix the board by hand when a card says something the table doesn't do for you */
function toolsHTML() {
  if (!UI.tools) return ''; const t = UI.tools; const o = t.obj != null ? ob(S, t.obj) : null;
  const btn = (k, label) => `<button class="btn sm" data-tool="${k}">${label}</button>`;
  return `<div class="toolpanel"><div class="hd" style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>Table tools</b><button class="btn sm" id="toolsClose">Close</button></div>
    <div class="note">Click a card on the board to adjust it. Every change goes in the log and can be undone.</div>
    ${o ? `<div class="toolsel">${esc(objLabel(S, o.id, 0))}</div><div class="toolgrid">${o.k === 'u' ? btn('m+', '+1 might') + btn('m-', '−1 might') + btn('dmg', '1 damage') + btn('heal', 'Heal') + btn('stun', o.stun ? 'Unstun' : 'Stun') + btn('buff', o.buff ? 'Remove buff' : 'Buff') : ''}${btn('ex', o.ex ? 'Ready' : 'Exhaust')}${btn('emp', o.emp ? 'Disempower' : 'Empower')}${btn('kill', o.k === 'u' ? 'Kill' : 'Destroy')}${btn('hand', 'Return to hand')}${btn('ctrl', 'Swap control')}${o.k === 'u' ? btn('base', 'Recall to base') : ''}</div>` : '<div class="note">No card selected.</div>'}
    <div class="label">Players</div><div class="toolgrid">${btn('draw0', 'You draw 1')}${btn('draw1', 'AI draws 1')}${btn('pt0', 'You +1 point')}${btn('pt0-', 'You −1 point')}${btn('pt1', 'AI +1 point')}${btn('pt1-', 'AI −1 point')}${btn('chan0', 'You channel 1')}${btn('xp0', 'You +1 XP')}${btn('xp0-', 'You −1 XP')}${btn('legr', 'Ready your legend')}${btn('gold0', 'You make a Gold')}${btn('disc0', 'You discard 1')}</div></div>`;
}
function toolDo(k) {
  UI.hist.push({ s: clone(S), log: RB.getLog().length });
  const o = UI.tools.obj != null ? ob(S, UI.tools.obj) : null; const say = (m) => log('(by hand) ' + m, 'sys');
  const me = S.players[0], ai = S.players[1];
  switch (k) {
    case 'm+': o.mod++; say(`${cn(o.cid)} +1 might this turn`); break; case 'm-': o.mod--; say(`${cn(o.cid)} −1 might this turn`); checkDeaths(S); break;
    case 'dmg': damage(S, o, 1, {}); say(`1 damage to ${cn(o.cid)}`); break; case 'heal': o.dmg = 0; say(`${cn(o.cid)} healed`); break;
    case 'stun': o.stun = !o.stun; say(`${cn(o.cid)} ${o.stun ? 'stunned' : 'unstunned'}`); break; case 'buff': o.buff = o.buff ? 0 : 1; say(`${cn(o.cid)} ${o.buff ? 'buffed' : 'loses its buff'}`); break;
    case 'ex': o.ex = !o.ex; say(`${cn(o.cid)} ${o.ex ? 'exhausted' : 'readied'}`); break; case 'emp': o.emp = o.emp ? 0 : 1; say(`${cn(o.cid)} ${o.emp ? 'empowered' : 'disempowered'}`); break;
    case 'kill': say(`${cn(o.cid)} killed`); kill(S, o, {}); UI.tools.obj = null; break; case 'hand': returnToHand(S, o); UI.tools.obj = null; break;
    case 'ctrl': o.ctrl = 1 - o.ctrl; if (o.k === 'u') recallUnit(S, o, true); say(`${cn(o.cid)} changes control`); refreshControl(S); break; case 'base': recallUnit(S, o, false); say(`${cn(o.cid)} recalled`); break;
    case 'draw0': drawN(S, 0, 1); say('you draw 1'); break; case 'draw1': drawN(S, 1, 1); say('AI draws 1'); break;
    case 'pt0': gainPoints(S, 0, 1); say('you +1 point'); break; case 'pt0-': me.pts = Math.max(0, me.pts - 1); say('you −1 point'); break;
    case 'pt1': gainPoints(S, 1, 1); say('AI +1 point'); break; case 'pt1-': ai.pts = Math.max(0, ai.pts - 1); say('AI −1 point'); break;
    case 'chan0': channel(S, 0, 1); say('you channel 1'); break; case 'xp0': me.xp++; say('you +1 XP'); break; case 'xp0-': me.xp = Math.max(0, me.xp - 1); say('you −1 XP'); break;
    case 'legr': me.legEx = false; say('your legend readies'); break; case 'gold0': newObj(S, { cid: 'tok-gold', k: 'g', owner: 0, loc: 'base', ex: true }); say('you make a Gold'); break;
    case 'disc0': if (me.hand.length) { runEffects(S, [{ op: 'discard', n: 1 }], { p: 0, card: me.legend }); advance(S); } break;
  }
  render(); drive();
}
let CTX_ITEMS = [];
function ctxHTML() { if (!UI.ctx) return ''; const w = 280; const x = Math.max(8, Math.min(UI.ctx.x, vpW() - w - 8)), y = Math.max(8, Math.min(UI.ctx.y, vpH() - CTX_ITEMS.length * 38 - 16));
  return `<div class="ctxmenu" style="left:${x}px;top:${y}px">${CTX_ITEMS.map((it, i) => `<button class="ctxi" data-ctx="${i}" ${it.dis ? 'disabled' : ''}>${esc(it.label)}</button>`).join('')}</div>`; }
function viewHTML() { if (!UI.viewing) return ''; const k = UI.viewing; const land = C[k] ? C[k].t === 'B' : false; return `<div class="pickover viewov" id="viewov"><div class="viewcard ${land ? 'land' : ''}">${artImg(k, '')}</div>${C[k] ? `<div class="viewtxt"><b>${esc(C[k].n)}</b><div>${esc(C[k].txt)}</div>${C[k].eqtxt ? `<div class="note">Equipped: ${esc(C[k].eqtxt)}</div>` : ''}${C[k].manual ? `<div class="note warn">${esc(C[k].manual)}</div>` : ''}</div>` : ''}</div>`; }

/* ---------------- clicks ---------------- */
function payClick(id) {
  const P0 = UI.paying, pl = S.players[0], r = pl.runes.find((x) => x.id === id); if (!r) return; const st = payStatus();
  const inEx = P0.ex.includes(id), inRc = P0.rc.includes(id);
  const powerLeft = st.powRows.some((x) => !x.ok && (x.q === 'any' || x.q.split('|').includes(r.d)));
  if (inRc) P0.rc = P0.rc.filter((x) => x !== id);
  else if (inEx) { P0.ex = P0.ex.filter((x) => x !== id); if (powerLeft) P0.rc.push(id); }
  else if (!r.ex && st.eHave < st.eNeed) P0.ex.push(id);
  else if (powerLeft) P0.rc.push(id);
  else UI.hint = r.ex ? "That rune's power isn't needed for this card." : 'You already have all the energy you need.';
  render();
}
function payAuto() { const P0 = UI.paying; const plan = autoPayPlan(S, 0, P0.cost); if (plan) { P0.ex = plan.ex; P0.rc = plan.rc; P0.gold = plan.gold || []; } if (!plan || !checkManualPay(S, 0, P0.cost, { ex: P0.ex, rc: P0.rc, gold: P0.gold })) { const a = P0.a; UI.paying = null; UI.payOnce = 'auto'; doHuman(a); return; } render(); }
function payConfirm() { const P0 = UI.paying; const mp = { ex: P0.ex.slice(), rc: P0.rc.slice(), gold: (P0.gold || []).slice(), purpose: purposeOf(S, P0.a) }; if (!checkManualPay(S, 0, P0.cost, mp)) return; const a = Object.assign({}, P0.a, { mp }); UI.paying = null; doHuman(a); }
function undo() { if (!UI.hist.length || UI.driving) return; const h = UI.hist.pop(); S = h.s; const L = RB.getLog(); L.length = h.log; UI.tgt = null; UI.paying = null; UI.sel = []; UI.hint = 'Undid your last move.'; UI.lastTurn = S.turnNo; UI.prevHand = [S.players[0].hand.length, S.players[1].hand.length]; render(); }
let suppressClick = false;
document.addEventListener('click', (e) => {
  if (suppressClick) { suppressClick = false; return; }
  const t = e.target.closest('#viewov,button,[data-bfpick],[data-sb],[data-gold],[data-ctx],[data-rid],[data-ro],[data-trash],[data-leg],[data-legfoe],[data-hand],[data-obj],[data-dest],[data-ci],[data-hid],[data-champ],[data-m],[data-pickidx],[data-topt],[data-pk],[data-ak],[data-abg],[data-tool],.pickover.trashv,[data-setleg],[data-setchamp],[data-setbf],[data-btab],[data-rune],[data-sleeve],[data-inc],[data-dec],[data-build]');
  if (!t) return;
  if (t.dataset.ctx != null) { const it = CTX_ITEMS[+t.dataset.ctx]; UI.ctx = null; if (it) it.fn(); else render(); return; }
  if (e.target.closest('#viewov')) { UI.viewing = null; render(); return; }
  if (t.classList && t.classList.contains('trashv') && !e.target.closest('.inner')) { UI.trash = null; render(); return; }
  if (t.id === 'closeTrash') { UI.trash = null; render(); return; }
  if (t.dataset.trash != null) { UI.trash = +t.dataset.trash; render(); return; }
  if (t.dataset.ro) { UI.runeArt = t.dataset.ro; store.set('runeArt', UI.runeArt); render(); return; }
  if (builderClick(t)) return;
  if (t.dataset.pk) { UI.pk = t.dataset.pk; store.set('pk', UI.pk); render(); return; }
  if (t.dataset.ak) { UI.ak = t.dataset.ak; store.set('ak', UI.ak); render(); return; }
  if (t.id === 'start') { const bad = [UI.pk, UI.ak].filter((k) => deckProblems(DECKS[k]).length); if (bad.length) { UI.setupMsg = `Fix ${bad.map((k) => DECKS[k].name).join(' and ')} first: ${deckProblems(DECKS[bad[0]]).join(' · ')}`; render(); return; } UI.setupMsg = ''; openPregame(); return; }
  if (t.id === 'openSettings') { UI.settings = true; render(); syncSettings(); return; }
  if (t.id === 'closeSettings') { readSettings(); UI.settings = false; render(); return; }
  if (t.dataset.m != null) { const i = +t.dataset.m; UI.mull = UI.mull.includes(i) ? UI.mull.filter((x) => x !== i) : UI.mull.length < 2 ? [...UI.mull, i] : UI.mull; render(); return; }
  if (t.id === 'keep') { mulligan(S, 0, UI.mull); mulligan(S, 1, aiMulligan(S)); beginGame(S); advance(S); UI.t0 = Date.now(); UI.turnStart = Date.now(); UI.myTime = 0; render(); drive(); return; }
  if (t.id === 'quit' || t.id === 'newgame') { UI.screen = 'setup'; S = null; UI.tgt = null; render(); return; }
  if (t.id === 'rematch') { startGame(); return; }
  if (t.dataset.bfpick) { UI.pre.bf = t.dataset.bfpick; render(); return; }
  if (t.dataset.sb) { const [w, c] = t.dataset.sb.split(':'); const P0 = UI.pre, from = w === 'main' ? P0.main : P0.side, to = w === 'main' ? P0.side : P0.main; if (from[c] > 0) { from[c]--; to[c] = (to[c] || 0) + 1; if (!from[c]) delete from[c]; } render(); return; }
  if (t.id === 'preBack') { UI.screen = 'setup'; render(); return; }
  if (t.id === 'preGo') { startGame(); return; }
  if (t.id === 'drawerTab') { UI.drawer = !UI.drawer; render(); return; }
  if (t.id === 'coachBtn') { askCoach(); return; }
  if (t.id === 'review') { reviewGame(); return; }
  if (!S || UI.screen !== 'game') return;
  if (t.id === 'toolsBtn') { UI.tools = UI.tools ? null : { obj: null }; render(); return; }
  if (t.id === 'toolsClose') { UI.tools = null; render(); return; }
  if (t.dataset.tool) { toolDo(t.dataset.tool); return; }
  if (UI.tools && t.dataset.obj != null) { UI.tools.obj = +t.dataset.obj; render(); return; }
  if (!myTurnToAct()) return;
  const acts = legal(S, 0, { mana: true });
  if (t.id === 'cancel') { UI.sel = []; UI.tgt = null; UI.paying = null; UI.hint = ''; render(); return; }
  if (t.dataset.gold != null && UI.paying) { const id = +t.dataset.gold, P0 = UI.paying; P0.gold = P0.gold || []; const i = P0.gold.indexOf(id); if (i >= 0) P0.gold.splice(i, 1); else P0.gold.push(id); render(); return; }
  if (t.id === 'undo') { undo(); return; }
  if (t.id === 'payToggle') { UI.autopay = !UI.autopay; store.set('autopay', UI.autopay ? '1' : '0'); render(); return; }
  if (t.id === 'payOk') { payConfirm(); return; }
  if (t.id === 'payAuto') { payAuto(); return; }
  if (UI.paying) { if (t.dataset.rid != null && t.dataset.owner === '0') payClick(+t.dataset.rid); return; }
  if (t.id === 'pass') { doHuman({ t: 'pass' }); return; }
  if (t.id === 'end') { doHuman({ t: 'end' }); return; }
  if (t.dataset.abg != null) { const g = (UI.abGroups || [])[+t.dataset.abg]; if (g) startAbGroup(g); return; }
  if (t.dataset.pickidx != null) { doHuman(acts[+t.dataset.pickidx]); return; }
  if (t.dataset.topt != null) { const c = targetChoices()[+t.dataset.topt]; if (!c) return; if (c.act) { UI.tgt = null; doHuman(c.act); } else pickTarget(c.v); return; }
  // engine choices answered by clicking the board
  if (S.choice) {
    let v = null;
    if (t.dataset.obj != null) v = +t.dataset.obj; else if (t.dataset.ci != null) v = 'S' + t.dataset.ci; else if (t.dataset.leg != null) v = 'L0'; else if (t.dataset.legfoe != null) v = 'L1';
    else { const z = e.target.closest('[data-dest]'); if (z) { const d = z.dataset.dest === 'base' ? 'base' : +z.dataset.dest; v = S.choice.kind === 'dest' ? d : 'B' + d; } }
    const a = v != null ? choiceActFor(acts, v) : null; if (a) doHuman(a); return;
  }
  if (UI.tgt && UI.tgt.key != null) {
    const sets = targetSets(acts);
    if (t.dataset.obj != null && sets.objs.has(+t.dataset.obj)) { pickTarget(+t.dataset.obj); return; }
    if (t.dataset.ci != null && sets.chain.has(+t.dataset.ci)) { pickTarget('S' + t.dataset.ci); return; }
    if (t.dataset.leg != null && sets.legends.has(0)) { pickTarget('L0'); return; } if (t.dataset.legfoe != null && sets.legends.has(1)) { pickTarget('L1'); return; }
    const z = e.target.closest('[data-dest]'); if (z) { const v = z.dataset.dest === 'base' ? 'base' : +z.dataset.dest; if (sets.zones.has(String(v))) { pickTarget(UI.tgt.key === 'to' ? v : 'B' + v); return; } }
    if (t.dataset.hand == null && t.dataset.leg == null && t.dataset.champ == null && t.dataset.hid == null) { UI.hint = 'Click a highlighted target, or pick one in the pop-up.'; render(); return; }
  }
  if (t.dataset.leg != null) { const la = acts.filter((a) => (a.t === 'ab' && a.src === 'L') || (a.t === 'emp' && a.o === 'L'));
    if (la.length) { const groups = new Map(); for (const a of la) { const k = a.t + (a.idx != null ? a.idx : ''); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a); } const gs = [...groups.values()]; if (gs.length === 1) startAbGroup(gs[0]); else startTarget(la, 'Legend', S.players[0].legend); return; }
    const pl = S.players[0]; UI.hint = pl.legEx ? '<b>Your legend is exhausted.</b> It readies at the start of your turn.' : `<b>${esc(C[pl.legend].n)}</b> has no ability you can use right now. Its triggered abilities happen on their own.`; render(); return; }
  if (t.dataset.hand != null) { const cid = S.players[0].hand[+t.dataset.hand]; startTarget(handActs(cid), C[cid].n, cid); return; }
  if (t.dataset.champ != null) { const cid = S.players[0].champ; startTarget(acts.filter((a) => a.t === 'play' && a.src === 'champ'), C[cid].n, cid); return; }
  if (t.dataset.hid != null) { const h = S.hidden.find((x) => x.id === +t.dataset.hid); startTarget(acts.filter((a) => a.t === 'play' && a.src === 'hidden' && a.hid === h.id), C[h.cid].n + ' (hidden)', h.cid); return; }
  if (t.dataset.obj != null) {
    const o = ob(S, +t.dataset.obj); if (!o) return;
    const own = acts.filter((a) => (a.t === 'ab' && a.src === o.id) || (a.t === 'emp' && a.o === o.id) || (a.t === 'equip' && a.g === o.id));
    if (o.ctrl === 0 && o.k === 'g') { if (own.length) { const groups = new Map(); for (const a of own) { const k = a.t + (a.idx != null ? a.idx : ''); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a); } const gs = [...groups.values()]; if (gs.length === 1) startAbGroup(gs[0]); else startTarget(own.filter((a) => a.t !== 'equip'), C[o.cid].n, o.cid); } else { UI.hint = `<b>${esc(C[o.cid].n)}</b> ${o.cid === 'tok-gold' && o.ex ? 'came into play exhausted. It readies at the start of your next turn; then click it (or pick it while paying) for 1 power of any type.' : 'has nothing to use right now.'}`; render(); } return; }
    if (o.ctrl === 0 && o.k === 'u' && S.mode === 'main') { if (o.ex || o.noMove) { if (own.length) { startAbGroup(own); return; } UI.hint = `<b>${esc(C[o.cid].n)}</b> is exhausted and can't move this turn.`; render(); return; }
      UI.tgt = null; UI.sel = UI.sel.includes(o.id) ? UI.sel.filter((x) => x !== o.id) : [...UI.sel, o.id]; UI.hint = own.length ? 'Right-click it to use its abilities.' : ''; render(); return; }
    if (o.ctrl === 0 && own.length) { startAbGroup(own); return; }
    return;
  }
  if (t.dataset.dest != null && UI.sel.length) { const d = t.dataset.dest === 'base' ? 'base' : +t.dataset.dest; const mv = acts.find((a) => a.t === 'move' && a.to === d && a.ids.length === UI.sel.length && a.ids.every((x) => UI.sel.includes(x))); if (mv) doHuman(mv); else if (canMove(S, 0, UI.sel, d)) doHuman({ t: 'move', ids: UI.sel.slice(), to: d }); return; }
});
function builderClick(t) {
  if (t.id === 'newDeck') { openBuilder(null); return true; }
  if (t.id === 'importDeck') { UI.importer = { text: '' }; render(); return true; }
  if (t.id === 'closeImport') { UI.importer = null; render(); return true; }
  if (t.id === 'doImport') { const txt = document.getElementById('importText').value; const { D, miss } = parseDeckText(txt); if (!D.legend && !Object.keys(D.main).length) { UI.importer = { text: txt, msg: 'No cards recognised.' }; render(); return true; } const k = newDeckId(); DECKS[k] = D; UI.importer = null; openBuilder(k); UI.bld.msg = miss.length ? `Not found: ${miss.slice(0, 6).join(', ')}${miss.length > 6 ? '…' : ''}` : 'Imported.'; render(); return true; }
  if (t.id === 'matUpload') { document.getElementById('matFile').click(); return true; }
  if (t.id === 'matClear') { UI.playmat = ''; store.del('playmat'); render(); return true; }
  if (t.dataset.build) { openBuilder(t.dataset.build); return true; }
  if (UI.screen !== 'builder') return false;
  const b = UI.bld, D = DECKS[b.k];
  if (t.dataset.btab) { b.tab = t.dataset.btab; render(); return true; }
  if (t.dataset.setleg) { D.legend = t.dataset.setleg; const doms = legDoms(D.legend); for (const c of Object.keys(D.main)) if (C[c].d.length && !C[c].d.every((d) => doms.includes(d))) delete D.main[c]; if (D.champ && !champsFor(D).some((c) => c.id === D.champ)) D.champ = null; const rs = {}; doms.forEach((d, i) => { rs[d] = (D.runes || {})[d] || (i === 0 ? 6 : 12 - 6); }); D.runes = rs; if (!D.name || D.name === 'New deck') D.name = C[D.legend].n; b.tab = D.champ ? 'cards' : 'champ'; render(); return true; }
  if (t.dataset.setchamp) { D.champ = t.dataset.setchamp; b.tab = 'cards'; render(); return true; }
  if (t.dataset.setbf) { const id = t.dataset.setbf; D.bfs = D.bfs || []; const i = D.bfs.indexOf(id); if (i >= 0) D.bfs.splice(i, 1); else if (D.bfs.length < 3) D.bfs.push(id); render(); return true; }
  if (t.dataset.rune) { const [d, n] = t.dataset.rune.split(':'); D.runes[d] = Math.max(0, Math.min(12, (D.runes[d] || 0) + +n)); const other = Object.keys(D.runes).find((x) => x !== d); if (other && +n > 0 && Object.values(D.runes).reduce((a, c) => a + c, 0) > 12) D.runes[other] = Math.max(0, D.runes[other] - 1); render(); return true; }
  if (t.dataset.sleeve) { D.sleeve = t.dataset.sleeve; render(); return true; }
  if (t.dataset.inc || t.dataset.dec) { const list = b.side ? D.side : D.main; const c = t.dataset.inc || t.dataset.dec; list[c] = (list[c] || 0) + (t.dataset.inc ? 1 : -1); if (list[c] <= 0) delete list[c]; render(); return true; }
  if (t.id === 'bside') { b.side = !b.side; render(); return true; }
  if (t.id === 'bldSave') { const nm = document.getElementById('deckName'); if (nm) D.name = nm.value; b.msg = saveDeck(b.k) ? 'Saved.' : 'Could not save (browser storage is full or blocked).'; UI.screen = 'setup'; render(); return true; }
  if (t.id === 'bldCancel') { loadDecks(); UI.screen = 'setup'; render(); return true; }
  if (t.id === 'exportDeck') { const txt = deckText(D); try { navigator.clipboard.writeText(txt); b.msg = 'List copied to the clipboard.'; } catch (e) { b.msg = 'Copy failed.'; } render(); return true; }
  if (t.id === 'delDeck') { deleteDeck(b.k); UI.screen = 'setup'; if (!DECKS[UI.pk]) UI.pk = Object.keys(DECKS)[0]; if (!DECKS[UI.ak]) UI.ak = Object.keys(DECKS)[0]; render(); return true; }
  if (t.id === 'resetDeck') { const ov = JSON.parse(store.get('deckov', '{}')); delete ov[b.k]; store.set('deckov', JSON.stringify(ov)); loadDecks(); render(); return true; }
  return false;
}
document.addEventListener('input', (e) => {
  if (e.target.id === 'deckq' && UI.screen === 'setup') { UI.deckq = e.target.value; const pos = e.target.selectionStart; render(); const el = document.getElementById('deckq'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } }
  if (e.target.id === 'bq' && UI.bld) { UI.bld.q = e.target.value; const pos = e.target.selectionStart; render(); const el = document.getElementById('bq'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } }
  if (e.target.id === 'deckName' && UI.bld) DECKS[UI.bld.k].name = e.target.value;
  if (e.target.id === 'sleeveCustom' && UI.bld) { DECKS[UI.bld.k].sleeve = e.target.value; }
});
document.addEventListener('change', (e) => {
  const id = e.target.id;
  if (id === 'btype' && UI.bld) { UI.bld.type = e.target.value; render(); return; }
  if (id === 'bset' && UI.bld) { UI.bld.setf = e.target.value; render(); return; }
  if (id === 'sleeveCustom' && UI.bld) { render(); return; }
  if (id === 'matFile') { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { shrinkImage(rd.result, 1600, (url) => { UI.playmat = url; if (!store.set('playmat', url)) UI.setupMsg = 'The playmat is too big to remember after reload, but it will show this session.'; render(); }); }; rd.readAsDataURL(f); return; }
  if (id === 'first') UI.first = e.target.value; if (id === 'speedSel') { UI.speed = e.target.value; store.set('speed', UI.speed); } if (id === 'diffSel') { UI.diff = e.target.value; store.set('diff', UI.diff); } if (id === 'brainSel') { UI.brain = e.target.value; store.set('brain', UI.brain); render(); }
});
function shrinkImage(src, max, cb) { const img = new Image(); img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)); const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); cb(cv.toDataURL('image/jpeg', 0.82)); }; img.onerror = () => cb(src); img.src = src; }

/* ---------------- drag and drop ---------------- */
let drag = null;
const LP = { t: null, x: 0, y: 0, el: null, ctxAt: 0 };
function lpCancel() { if (LP.t) clearTimeout(LP.t); LP.t = null; }
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' && UI.screen === 'game') {
    lpCancel(); LP.x = e.clientX; LP.y = e.clientY; LP.el = e.target;
    LP.t = setTimeout(() => { LP.t = null; if (Date.now() - LP.ctxAt < 800) return; cancelDrag(); suppressClick = true; setTimeout(() => { suppressClick = false; }, 400);
      LP.el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: LP.x, clientY: LP.y })); }, 450);
  }
}, true);
document.addEventListener('pointermove', (e) => { if (LP.t && Math.hypot(e.clientX - LP.x, e.clientY - LP.y) > 10) lpCancel(); }, true);
document.addEventListener('pointerup', lpCancel, true);
document.addEventListener('pointercancel', lpCancel, true);
document.addEventListener('pointerdown', (e) => {
  if (!drag) endDragVisuals(null);
  if (e.button !== 0 || !S || UI.screen !== 'game' || !myTurnToAct() || S.choice || UI.tools) return;
  const h = e.target.closest('[data-hand]'), o = e.target.closest('[data-obj]');
  if (h) { const cid = S.players[0].hand[+h.dataset.hand]; drag = { kind: 'hand', cid, el: h, x: e.clientX, y: e.clientY }; return; }
  if (o && !UI.tgt) { const u = ob(S, +o.dataset.obj); if (u && u.ctrl === 0 && u.k === 'u' && S.mode === 'main' && !u.ex && !u.noMove) { const ids = UI.sel.includes(u.id) ? UI.sel.slice() : [u.id]; drag = { kind: 'unit', ids, cid: u.cid, el: o, x: e.clientX, y: e.clientY }; } }
});
document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.on) { if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 7) return; startDrag(); }
  drag.ghost.style.left = e.clientX - drag.gw / 2 + 'px'; drag.ghost.style.top = e.clientY - drag.gh * 0.35 + 'px';
  document.querySelectorAll('.dropover').forEach((x) => x.classList.remove('dropover'));
  const z = dropZoneAt(e.clientX, e.clientY); if (z) z.classList.add('dropover');
});
function startDrag() {
  drag.on = true; const g = document.createElement('div'); g.className = 'ghost'; g.innerHTML = cardHTML(drag.cid); document.body.appendChild(g); drag.ghost = g;
  const r = g.getBoundingClientRect(); drag.gw = r.width || 100; drag.gh = r.height || 140; drag.el.classList.add('dragsrc'); document.body.classList.add('dragging');
  const zones = new Set();
  if (drag.kind === 'unit') { for (const d of [0, 1, 'base']) if (canMove(S, 0, drag.ids, d)) zones.add(String(d)); }
  else { const acts = handActs(drag.cid); const c = C[drag.cid]; if (c.t === 'u' || (c.t === 'g' && c.kw.deploy)) acts.filter((a) => a.t === 'play').forEach((a) => zones.add(String(a.to))); else if (acts.length) zones.add('any'); acts.filter((a) => a.t === 'hide').forEach((a) => zones.add(String(a.bf))); }
  drag.zones = zones;
  document.querySelectorAll('[data-dest]').forEach((z) => { if (zones.has(z.dataset.dest) || (zones.has('any') && !z.classList.contains('foebase'))) z.classList.add('dropok'); });
  if (zones.has('any')) { const m = document.querySelector('.mat'); if (m) m.classList.add('dropany'); }
}
function dropZoneAt(x, y, d) { d = d || drag; const el = document.elementFromPoint(x, y); if (!el || !d) return null; const z = el.closest('[data-dest]'); if (z && z.classList.contains('dropok')) return z; if (d.zones && d.zones.has('any') && el.closest('.mat')) return el.closest('.mat'); return null; }
// a drag can end without a pointerup (browser image drag, leaving the window, a touch cancel): always clean up
function endDragVisuals(d) {
  if (d && d.ghost) d.ghost.remove();
  if (d && d.el) d.el.classList.remove('dragsrc');
  document.querySelectorAll('.ghost').forEach((g) => g.remove());
  document.querySelectorAll('.dragsrc').forEach((x) => x.classList.remove('dragsrc'));
  document.body.classList.remove('dragging');
  document.querySelectorAll('.dropok,.dropover,.dropany').forEach((x) => x.classList.remove('dropok', 'dropover', 'dropany'));
}
function cancelDrag() { const d = drag; drag = null; endDragVisuals(d); }
document.addEventListener('pointercancel', cancelDrag);
window.addEventListener('blur', cancelDrag);
document.addEventListener('dragstart', (e) => { if (e.target.closest && e.target.closest('.mat, .hand, .card, img')) e.preventDefault(); });
document.addEventListener('pointerup', (e) => {
  if (!drag) { endDragVisuals(null); return; } const d = drag; drag = null; if (!d.on) { endDragVisuals(d); return; }
  suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
  if (d.ghost) d.ghost.style.display = 'none';
  const zz = dropZoneAt(e.clientX, e.clientY, d);
  endDragVisuals(d);
  const z = zz || (() => { const el = document.elementFromPoint(e.clientX, e.clientY); return el && el.closest('[data-dest]'); })();
  if (!z) return;
  const dest = z.dataset && z.dataset.dest != null ? (z.dataset.dest === 'base' ? 'base' : +z.dataset.dest) : null;
  if (d.kind === 'unit') { const mv = legal(S, 0, { mana: true }).find((a) => a.t === 'move' && a.to === dest && a.ids.length === d.ids.length && a.ids.every((x) => d.ids.includes(x))); if (mv) doHuman(mv); else if (dest != null && canMove(S, 0, d.ids, dest)) doHuman({ t: 'move', ids: d.ids, to: dest }); else { UI.hint = "Those units can't move there."; render(); } return; }
  const acts = handActs(d.cid), c = C[d.cid];
  if (c.t === 'u' || (c.t === 'g' && c.kw.deploy)) { const hid = acts.filter((a) => a.t === 'hide' && a.bf === dest); const pl = acts.filter((a) => a.t === 'play' && String(a.to) === String(dest));
    if (!pl.length && !hid.length) { UI.hint = `<b>${esc(c.n)}</b> can't be played there.`; render(); return; } startTarget(pl.concat(hid), c.n, d.cid); return; }
  if (dest != null && acts.some((a) => a.t === 'hide' && a.bf === dest) && !acts.some((a) => a.t === 'play')) { startTarget(acts.filter((a) => a.t === 'hide' && a.bf === dest), c.n, d.cid); return; }
  startTarget(acts, c.n, d.cid);
});

/* ---------------- right-click menu ---------------- */
function viewCard(cid) { UI.viewing = cid; render(); }
document.addEventListener('contextmenu', (e) => {
  const el = e.target.closest('[data-hand],[data-champ],[data-hid],[data-obj],[data-leg],[data-prev]'); if (!el || UI.screen !== 'game' || !S) return;
  e.preventDefault(); CTX_ITEMS = [];
  const myAct = myTurnToAct(); const acts = myAct ? legal(S, 0, { mana: true }) : [];
  const add = (label, fn, dis) => CTX_ITEMS.push({ label, fn, dis });
  let cid = el.dataset.prev || null;
  const groupsOf = (list) => { const gs = new Map(); for (const a of list) { const k = a.t + ':' + (a.idx != null ? a.idx : '') + (a.host || '') + (a.borrow || '') + (a.g || ''); if (!gs.has(k)) gs.set(k, []); gs.get(k).push(a); } return [...gs.values()]; };
  if (el.dataset.hand != null) { cid = S.players[0].hand[+el.dataset.hand]; const list = myAct ? handActs(cid) : [];
    const plays = list.filter((a) => a.t === 'play'), hides = list.filter((a) => a.t === 'hide');
    if (plays.length) { add(`${C[cid].t === 's' ? 'Cast' : 'Play'} ${C[cid].n} (auto-pay)`, () => { UI.payOnce = 'auto'; startTarget(plays, C[cid].n, cid); }); add(`${C[cid].t === 's' ? 'Cast' : 'Play'} ${C[cid].n} (pay myself)`, () => { UI.payOnce = 'manual'; startTarget(plays, C[cid].n, cid); }); }
    else add(`Can't play ${C[cid].n} right now`, () => {}, true);
    hides.forEach((a) => add(`Hide at ${bfName(S, a.bf)} (${costOf(a)})`, () => doHuman(a)));
    if (C[cid].kw.hidden && !hides.length) add('Hide: needs a battlefield you control and 1 power', () => {}, true); }
  if (el.dataset.champ != null) { cid = S.players[0].champ; const plays = acts.filter((a) => a.t === 'play' && a.src === 'champ'); if (plays.length) { add(`Play ${C[cid].n} (auto-pay)`, () => { UI.payOnce = 'auto'; startTarget(plays, C[cid].n, cid); }); add(`Play ${C[cid].n} (pay myself)`, () => { UI.payOnce = 'manual'; startTarget(plays, C[cid].n, cid); }); } }
  if (el.dataset.hid != null) { const h = S.hidden.find((x) => x.id === +el.dataset.hid); if (h) { cid = h.cid; const plays = acts.filter((a) => a.t === 'play' && a.src === 'hidden' && a.hid === h.id); if (plays.length) add(`Play ${C[cid].n} from hiding`, () => startTarget(plays, C[cid].n, cid)); } }
  if (el.dataset.leg != null) { cid = S.players[0].legend; for (const g of groupsOf(acts.filter((a) => (a.t === 'ab' && a.src === 'L') || (a.t === 'emp' && a.o === 'L')))) add(abGroupLabel(g), () => startAbGroup(g)); }
  if (el.dataset.obj != null) { const o = ob(S, +el.dataset.obj); if (o) { cid = o.copyOf || o.cid;
    if (o.ctrl === 0 && o.k === 'u' && myAct && S.mode === 'main' && !o.ex && !o.noMove) [0, 1, 'base'].filter((d) => canMove(S, 0, [o.id], d)).forEach((d) => add(`Move to ${bfName(S, d)}`, () => doHuman({ t: 'move', ids: [o.id], to: d })));
    if (o.ctrl === 0) for (const g of groupsOf(acts.filter((a) => (a.t === 'ab' && a.src === o.id) || (a.t === 'emp' && a.o === o.id) || (a.t === 'equip' && a.g === o.id)))) { add(abGroupLabel(g), () => startAbGroup(g)); }
    add('Adjust by hand (tools)', () => { UI.tools = { obj: o.id }; render(); }); } }
  if (cid && C[cid]) add('View card', () => viewCard(cid));
  if (!CTX_ITEMS.length) return;
  const lp = toL(e.clientX, e.clientY); UI.ctx = { x: lp.x, y: lp.y }; LP.ctxAt = Date.now(); render();
});
document.addEventListener('click', (e) => { if (UI.ctx && !e.target.closest('.ctxmenu') && Date.now() - LP.ctxAt > 450) { UI.ctx = null; render(); } }, true);

/* ---------------- keys and hover preview ---------------- */
document.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input,select,textarea')) return;
  if (UI.settings || UI.screen !== 'game' || !S) return;
  if (e.key === 'Escape' && (UI.trash != null || UI.viewing || UI.ctx || UI.tools)) { UI.trash = null; UI.viewing = null; UI.ctx = null; UI.tools = null; render(); return; }
  if (e.key.toLowerCase() === 'l' && !e.ctrlKey && !e.metaKey) { UI.drawer = !UI.drawer; render(); return; }
  if (e.key.toLowerCase() === 't' && !e.ctrlKey && !e.metaKey) { UI.tools = UI.tools ? null : { obj: null }; render(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  if (!myTurnToAct()) return;
  const acts = legal(S, 0, { mana: true });
  if (UI.paying) { if (e.code === 'Space') { e.preventDefault(); payConfirm(); } else if (e.key === 'Escape') { UI.paying = null; render(); } else if (e.key.toLowerCase() === 'a') payAuto(); return; }
  if (e.code === 'Space') { e.preventDefault(); if (S.choice || UI.tgt) return; const a = acts.find((x) => x.t === 'pass') || acts.find((x) => x.t === 'end'); if (a) doHuman(a); return; }
  if (e.key === 'Escape') { UI.sel = []; UI.tgt = null; UI.hint = ''; render(); return; }
  if (/^[1-9]$/.test(e.key)) { const i = +e.key - 1;
    if (S.choice) { if (acts[i]) doHuman(acts[i]); return; }
    if (UI.tgt) { const c = targetChoices()[i]; if (!c) return; if (c.act) { UI.tgt = null; doHuman(c.act); } else pickTarget(c.v); } }
});
document.addEventListener('mouseover', (e) => {
  if (PH.on || isPhone()) { const pv0 = document.getElementById('preview'); if (pv0) pv0.hidden = true; return; }
  const t = e.target.closest('[data-prev]'); const pv = document.getElementById('preview');
  if (!t) { pv.hidden = true; return; } const k = t.dataset.prev; const c = C[k]; const land = c && c.t === 'B';
  pv.className = 'preview' + (land ? ' land' : '');
  const fbt = c ? `<b>${esc(c.n)}</b><span>${c.t === 'L' || c.t === 'B' ? TYPE_NAME[c.t] : costText(c)}${c.t === 'u' ? ' · ' + c.m + ' might' : ''}${c.sp && c.t === 's' ? ' · ' + SPEED[c.sp] : ''}</span><span>${esc(c.txt)}</span>${c.eqtxt ? `<span>Equipped: ${esc(c.eqtxt)}</span>` : ''}` : '';
  pv.innerHTML = `<div class="card"><div class="fb" style="font-size:15px;padding:14px;gap:8px">${fbt}</div>${artImg(k, '')}</div>${c && c.manual ? `<div class="pvwarn">⚠ ${esc(c.manual)}</div>` : ''}`; pv.hidden = false;
  const r = t.getBoundingClientRect(); const w = land ? 300 : 250; pv.style.left = (r.left > window.innerWidth / 2 ? Math.max(8, r.left - w - 16) : Math.min(window.innerWidth - w - 8, r.right + 16)) + 'px'; pv.style.top = Math.max(8, Math.min(window.innerHeight - (land ? 230 : 360), r.top - 40)) + 'px';
});

/* ---------------- running a game ---------------- */
function aiMulligan(s) { const h = s.players[1].hand; return h.map((c, i) => [i, (C[c].e || 0) + (C[c].p || []).length]).filter(([, v]) => v >= 6).slice(0, 2).map(([i]) => i); }
function startGame() {
  clearLog(); const f = UI.first === 'random' ? (Math.random() < 0.5 ? 0 : 1) : UI.first === 'you' ? 0 : 1; const pre = UI.pre || {};
  const D0 = Object.assign({}, DECKS[UI.pk], { main: pre.main || DECKS[UI.pk].main }); const D1 = DECKS[UI.ak];
  S = newGame(D0, D1, f, undefined, { bf0: pre.bf && pre.bf !== 'random' ? pre.bf : undefined });
  S.players[0].human = true; S.players[0].sleeve = D0.sleeve || '#2c4152'; S.players[1].sleeve = D1.sleeve || '#6b1f2a';
  UI.screen = 'game'; UI.mull = []; UI.coach = ''; UI.sel = []; UI.tgt = null; UI.trash = null; UI.paying = null; UI.tools = null; UI.hist = []; UI.lastTurn = 0; UI.seenR = new Set(); UI.seenO = new Set(); UI.prevHand = [0, 0]; UI.note = ''; UI.tEnd = 0; UI.t0 = Date.now(); UI.myTime = 0; UI.turnStart = Date.now();
  render();
}
function needsPay(a) { if (!['play', 'hide', 'equip', 'ab', 'emp'].includes(a.t) || a.mp) return false; const c = actionCost(S, 0, a); const fl = S.players[0].pool.filter((x) => x.e && poolUsable(S, x, purposeOf(S, a))).length; return c.e - fl > 0 || (c.pw || []).length > 0; }
function doHuman(a) {
  if (!a || actor(S) !== 0 || UI.driving) return;
  const manual = UI.payOnce ? UI.payOnce === 'manual' : !UI.autopay; UI.payOnce = null;
  if (manual && needsPay(a)) { UI.tgt = null; UI.paying = { a, cost: actionCost(S, 0, a), ex: [], rc: [] }; render(); return; }
  UI.hist.push({ s: clone(S), log: RB.getLog().length }); if (UI.hist.length > 80) UI.hist.shift();
  UI.paying = null; UI.sel = []; UI.tgt = null; UI.hint = ''; popFor(0, a);
  try { apply(S, a); } catch (err) { console.error(err); UI.note = 'Something went wrong applying that move (' + (err.message || err) + '). It was undone.'; undo(); return; }
  if (a.t === 'end') UI.coach = ''; render(); drive();
}
async function drive() {
  if (UI.driving || !S) return; UI.driving = true; const g = S;
  try {
    for (let guard = 0; guard < 500 && S === g && UI.screen === 'game'; guard++) {
      advance(S); render(); if (S.winner != null) break;
      const who = actor(S); if (who == null) break; const acts = legal(S, who); if (!acts.length) break;
      if (acts.length === 1 && acts[0].t === 'pass' && !(who === 0 && S.mode === 'showdown')) { await sleep(who === 1 ? 250 : 450); if (S !== g) break; apply(S, acts[0]); continue; }
      if (who === 0) break;
      const SPD = { slow: 1.6, normal: 1, fast: 0.45 }[UI.speed] || 1; await sleep((S.mode === 'main' && !S.choice ? 650 : 500) * SPD); if (S !== g) break;
      let a = null, why = '';
      if (UI.brain === 'claude' && UI.key && !S.choice) { UI.thinking = true; render(); try { ({ a, why } = await claudeMove(S, 1, acts)); } catch (e) { UI.note = `Claude call failed (${e.message || e}); the built-in AI made this move.`; a = null; } UI.thinking = false; }
      if (!a) { await sleep(0); a = aiHeuristic(S, 1, UI.diff); }
      if (S !== g) break; if (why) log(`“${why}”`, 'why');
      popFor(1, a); if ((a.t === 'play' || a.t === 'ab') && UI.speed !== 'fast') { render(); await sleep(UI.speed === 'slow' ? 1500 : 900); if (S !== g) break; }
      try { apply(S, a); } catch (err) { console.error(err); UI.note = 'The AI hit an engine error and passed: ' + (err.message || err); const p = legal(S, 1).find((x) => x.t === 'pass' || x.t === 'end'); if (p) apply(S, p); else break; }
    }
  } finally { UI.driving = false; render(); }
}
async function callClaude(prompt, maxTokens) {
  const model = UI.model === 'deep' ? 'claude-sonnet-5-5' : 'claude-haiku-4-5-20251001';
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': UI.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model, max_tokens: maxTokens || 300, messages: [{ role: 'user', content: prompt }] }) });
  if (!r.ok) { let m = r.status + ''; try { const j = await r.json(); m = (j.error && j.error.message) || m; } catch (e) {} throw new Error(m); }
  const j = await r.json(); return (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}
async function claudeMove(s, p, acts) {
  const list = acts.slice(0, 70); const h = aiHeuristic(s, p, UI.diff); let hi = list.findIndex((a) => JSON.stringify(a) === JSON.stringify(h)); if (hi < 0) { list.push(h); hi = list.length - 1; }
  const prompt = `You are the AI opponent in a practice game of Riftbound (League of Legends TCG). Play to win like a strong tournament player.\n\n${RULES}\n\nSTATE (you are "you"):\n${describe(s, p)}\n\nLEGAL ACTIONS NOW:\n${list.map((a, i) => `${i}. ${actText(s, a, p)}`).join('\n')}\n\nA simple engine would pick #${hi}. Override it when you see a better line.\nPick exactly one action; you'll be asked again after it resolves.\nReply with only JSON: {"pick": <number>, "why": "<max 14 words, said to your opponent>"}`;
  const text = await callClaude(prompt, 200); const m = text.match(/\{[\s\S]*\}/); if (!m) throw new Error('no JSON');
  const j = JSON.parse(m[0]); const i = Number(j.pick); if (!Number.isInteger(i) || !list[i]) throw new Error('bad pick');
  return { a: list[i], why: String(j.why || '').slice(0, 160) };
}
async function askCoach() {
  if (!UI.key) { UI.coach = 'Add your Anthropic API key in Settings to use the coach.'; render(); return; }
  UI.coachBusy = true; UI.coach = 'Reading the board…'; render();
  const acts = legal(S, 0, { mana: true });
  const prompt = `You are a sharp Riftbound coach (League of Legends TCG) helping a player practice.\n\n${RULES}\n\nBOARD (the player is "you"):\n${describe(S, 0)}\n\nTHEIR LEGAL ACTIONS NOW:\n${acts.slice(0, 80).map((a, i) => `${i}. ${actText(S, a, 0)}`).join('\n')}\n\nGive the best sequence for the rest of this turn as a numbered list of at most 5 steps using card and battlefield names. Then one line starting "Why:" and one starting "Watch for:". Under 110 words, plain text.`;
  try { UI.coach = await callClaude(prompt, 400); } catch (e) { UI.coach = 'The coach could not reach Claude: ' + (e.message || e); }
  UI.coachBusy = false; render();
}
async function reviewGame() {
  if (!UI.key) { UI.coach = 'Add your Anthropic API key in Settings to get a game review.'; render(); return; }
  UI.coachBusy = true; UI.coach = 'Reviewing the game…'; render();
  const prompt = `You are a Riftbound coach. Review this practice game for the human player ("You") on ${S.players[0].name} against ${S.players[1].name}.\n\n${RULES}\n\nGAME LOG:\n${RB.getLog().slice(-260).map((l) => l.msg).join('\n')}\n\nGive three specific takeaways: what won or lost the game, one turn where a different line was better, and one habit to practice. Under 160 words, plain text.`;
  try { UI.coach = await callClaude(prompt, 500); } catch (e) { UI.coach = 'The review could not reach Claude: ' + (e.message || e); }
  UI.coachBusy = false; render();
}
var fmt = (ms) => { const t = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, sec = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0'); };
let lastMine = false;
setInterval(() => {
  if (!S || UI.screen !== 'game' || S.mode === 'mull' || !UI.t0) return;
  const now = Date.now(), mine = actor(S) === 0 && S.winner == null;
  if (S.winner != null) { if (!UI.tEnd) UI.tEnd = now; return; }
  if (mine && !lastMine) UI.turnStart = now; if (mine) UI.myTime += 1000; lastMine = mine;
  const set = (id, v, low) => { const el = document.getElementById(id); if (el) { el.textContent = v; el.classList.toggle('low', !!low); } };
  set('tGame', fmt(now - UI.t0)); set('tGame2', fmt(now - UI.t0)); set('tTurn', mine ? fmt(now - UI.turnStart) : '—'); set('tMine', fmt(UI.myTime));
  if (UI.round) { const left = UI.round * 60000 - (now - UI.t0); set('tRound', fmt(left), left < 5 * 60000); }
}, 1000);
render();

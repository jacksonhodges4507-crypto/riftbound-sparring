// Card-text compiler: turns each card's printed rules text into a small program the engine runs.
// node tools/compile.js  -> writes data/prog.json (programs) and data/cover.json (what parsed / what didn't)
// The output format is plain JSON so it can be embedded in the page and cloned with game state.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

class Unparsed extends Error {}
const fail = (m) => { throw new Unparsed(m); };

const NUMW = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twice: 2 };
const num = (w) => { if (w == null) return null; w = String(w).toLowerCase(); if (/^\d+$/.test(w)) return +w; if (w in NUMW) return NUMW[w]; return null; };
const DOMS = ['fury', 'calm', 'mind', 'body', 'chaos', 'order'];
const KW_SIMPLE = ['tank', 'ganking', 'deflect', 'backline', 'temporary', 'hidden', 'accelerate', 'ambush', 'vision', 'reaction', 'action', 'unique', 'weaponmaster', 'quick-draw', 'hunt', 'assault', 'shield', 'stun', 'deploy', 'disarm'];

// ---------- text normalisation ----------
function stripReminders(t) {
  let prev; do { prev = t; t = t.replace(/\s*\([^()]*\)/g, ''); } while (t !== prev);
  return t;
}
function norm(t) {
  return t.replace(/—|–/g, '—').replace(/\s+/g, ' ').replace(/\s+([.,])/g, '$1').trim();
}

// ---------- costs ----------
// returns {e, pw:[], ex, other:[...]}
function parseResources(s) {
  const out = { e: 0, pw: [] }; let m; const re = /\{(energy|power):(\w+)\}/g; let any = false;
  while ((m = re.exec(s))) { any = true; if (m[1] === 'energy') out.e += +m[2]; else out.pw.push(m[2]); }
  return any ? out : null;
}
function parseCostList(s) {
  // "{energy:1}{power:mind}, {exhaust}" | "Spend 3 XP, {exhaust}" | "Kill this, {exhaust}" | "Discard 1, {exhaust}" ...
  const cost = { e: 0, pw: [] };
  for (let part of s.split(/,\s*/)) {
    part = part.trim(); if (!part) continue;
    let m;
    if (part === '{exhaust}') { cost.ex = true; continue; }
    if (/^(\{(energy|power):\w+\})+$/.test(part)) { const r = parseResources(part); cost.e += r.e; cost.pw.push(...r.pw); continue; }
    if ((m = part.match(/^Spend (\d+) XP$/i))) { cost.xp = +m[1]; continue; }
    if (/^Kill this$/i.test(part)) { cost.killSelf = true; continue; }
    if (/^Banish this$/i.test(part)) { cost.banishSelf = true; continue; }
    if (/^Disempower (me|this)$/i.test(part)) { cost.disemp = true; continue; }
    if ((m = part.match(/^Discard (\d+)$/i))) { cost.discard = +m[1]; continue; }
    if ((m = part.match(/^Discard a (gear|spell|unit)$/i))) { cost.discardType = m[1].toLowerCase()[0]; cost.discard = 1; continue; }
    if ((m = part.match(/^Recycle (\d+) (?:cards )?from your trash$/i))) { cost.recycleTrash = +m[1]; continue; }
    if ((m = part.match(/^Recycle a unit from your trash$/i))) { cost.recycleTrashUnit = 1; continue; }
    if (/^Spend my buff$/i.test(part)) { cost.spendBuffSelf = true; continue; }
    if (/^Kill a friendly unit or gear$/i.test(part)) { cost.killFriendly = 'ug'; continue; }
    if (/^Kill a friendly unit$/i.test(part)) { cost.killFriendly = 'u'; continue; }
    if (/^Exhaust a unit you control$/i.test(part)) { cost.exhaustFriendly = true; continue; }
    if ((m = part.match(/^Pay any amount of (Energy|\{power:any\})$/i))) { cost.xAmount = m[1].toLowerCase() === 'energy' ? 'e' : 'p'; continue; }
    fail('cost: ' + part);
  }
  return cost;
}

// ---------- selectors (noun phrases) ----------
// sel = {q:'one'|'upto'|'each'|'self'|'it'|'trig'|'host'|'all', n, f:{...}}
const TYPEWORDS = [
  ['units or gear', 'ug'], ['unit or gear', 'ug'], ['units', 'u'], ['unit', 'u'], ['gear', 'g'], ['equipment', 'eq'], ['spells', 's'], ['spell', 's'],
  ['cards', 'c'], ['card', 'c'], ['runes', 'r'], ['rune', 'r'], ['legends', 'L'], ['legend', 'L'], ['battlefields', 'B'], ['battlefield', 'B']
];
const TAGPLURAL = { mechs: 'Mech', dragons: 'Dragon', poros: 'Poro', birds: 'Bird', cats: 'Cat', dogs: 'Dog', 'sand soldiers': 'Sand Soldier', recruits: 'Recruit', 'shadow clones': 'Shadow Clone', sprites: 'Sprite', yordles: 'Yordle' };
const TAGS = ['Poro', 'Mech', 'Dragon', 'Bird', 'Cat', 'Dog', 'Sand Soldier', 'Recruit', 'Shadow Clone', 'Sprite', 'Teemo', 'Yordle', 'Reflection', 'Tentacle', 'Ivern'];

function parseSel(np, ctx) {
  let s = np.trim().replace(/^the /i, '').replace(/[.,]$/, '');
  const low = s.toLowerCase();
  // pronouns
  if (/^(me|myself|this|this unit|this gear)$/i.test(s)) return { q: 'self' };
  if (/^(it|that unit|that card|the unit|the chosen unit|that gear|that enemy unit|the friendly unit|the enemy unit)$/i.test(s)) return { q: 'it' };
  if (/^(them|those units|these units|both units|those)$/i.test(s)) return { q: 'it', all: true };
  if (/^(the )?(attacking unit|an attacking unit)$/i.test(s)) return { q: 'one', n: 1, f: { type: 'u', attacking: true } };
  const sel = { q: 'one', n: 1, f: { type: null } };
  let rest = low;
  let m;
  // quantifier
  if ((m = rest.match(/^up to (one|two|three|four|five|\d+) /))) { sel.q = 'upto'; sel.n = num(m[1]); rest = rest.slice(m[0].length); }
  else if ((m = rest.match(/^(a|an|one) /))) { rest = rest.slice(m[0].length); }
  else if ((m = rest.match(/^(two|three|four|five|\d+) /))) { sel.q = 'one'; sel.n = num(m[1]); sel.exact = true; rest = rest.slice(m[0].length); }
  else if ((m = rest.match(/^(each|all|every) /))) { sel.q = 'each'; rest = rest.slice(m[0].length); }
  else if ((m = rest.match(/^any number of /))) { sel.q = 'upto'; sel.n = 99; rest = rest.slice(m[0].length); }
  else if ((m = rest.match(/^another /))) { sel.f.other = true; rest = rest.slice(m[0].length); }
  else sel.q = 'each'; // bare plural: "enemy units here", "friendly units"
  if ((m = rest.match(/^other /))) { sel.f.other = true; rest = rest.slice(m[0].length); }
  // owners / adjectives (any order)
  const adj = [
    [/^friendly /, () => sel.f.who = 'friendly'], [/^enemy /, () => sel.f.who = 'enemy'], [/^your other /, () => { sel.f.who = 'friendly'; sel.f.other = true; }],
    [/^your /, () => sel.f.who = 'friendly'], [/^other /, () => sel.f.other = true], [/^exhausted /, () => sel.f.ex = true], [/^ready /, () => sel.f.ready = true],
    [/^stunned /, () => sel.f.stunned = true], [/^buffed /, () => sel.f.buffed = true], [/^damaged /, () => sel.f.damaged = true],
    [/^attacking /, () => sel.f.attacking = true], [/^defending /, () => sel.f.defending = true], [/^equipped /, () => sel.f.equipped = true],
    [/^\[mighty\] /, () => sel.f.mighty = true], [/^token /, () => sel.f.token = true], [/^non-token /, () => sel.f.token = false],
    [/^detached /, () => sel.f.detached = true], [/^attached /, () => sel.f.attached = true],
    [/^(fury|calm|mind|body|chaos|order) /, (mm) => sel.f.dom = mm[1]], [/^non-dragon /, () => sel.f.notTag = 'Dragon'], [/^non-recruit /, () => sel.f.notTag = 'Recruit'],
  ];
  let again = true;
  while (again) { again = false; for (const [re, fn] of adj) { const mm = rest.match(re); if (mm) { fn(mm); rest = rest.slice(mm[0].length); again = true; } } }
  // tags: "your Mechs", "a Poro", "a Bird, Cat, Dog, or Poro", "a Teemo unit"
  for (const [pl, tag] of Object.entries(TAGPLURAL)) if (rest.startsWith(pl)) { sel.f.tag = tag; sel.f.type = 'u'; rest = rest.slice(pl.length); if (sel.q === 'one' && !sel.exact) sel.q = 'each'; break; }
  if (!sel.f.type) {
    if ((m = rest.match(/^bird, cat, dog, or poro( you control)?/))) { sel.f.tagAny = ['Bird', 'Cat', 'Dog', 'Poro']; sel.f.type = 'u'; rest = rest.slice(m[0].length); }
    else for (const tg of TAGS) { const tl = tg.toLowerCase(); if (rest.startsWith(tl + ' unit') || rest === tl || rest.startsWith(tl + ' ')) { sel.f.tag = tg; rest = rest.slice(tl.length).replace(/^ units?/, ''); sel.f.type = 'u'; break; } }
  }
  if (!sel.f.type) {
    for (const [w, t] of TYPEWORDS) if (rest.startsWith(w)) { sel.f.type = t; rest = rest.slice(w.length); if (w.endsWith('s') && sel.q === 'one' && !sel.exact && w !== 'gear') sel.q = 'each'; break; }
  }
  if (!sel.f.type) fail('np-type: ' + np);
  rest = rest.trim();
  // trailing qualifiers
  const tail = [
    [/^at a battlefield/, () => sel.f.where = 'bf'], [/^at battlefields/, () => sel.f.where = 'bf'], [/^at the same battlefield/, () => sel.f.where = 'same'],
    [/^at the same location/, () => sel.f.where = 'same'], [/^here/, () => sel.f.where = 'here'], [/^there/, () => sel.f.where = 'there'],
    [/^at my battlefield/, () => sel.f.where = 'here'], [/^at my location/, () => sel.f.where = 'here'], [/^in your base/, () => sel.f.where = 'base'], [/^in a base/, () => sel.f.where = 'base'], [/^at a base/, () => sel.f.where = 'base'],
    [/^at its location/, () => sel.f.where = 'itloc'], [/^at that battlefield/, () => sel.f.where = 'there'], [/^in combat/, () => sel.f.inCombat = true],
    [/^anywhere/, () => { }], [/^you control/, () => sel.f.who = 'friendly'], [/^an opponent controls/, () => sel.f.who = 'enemy'], [/^you own/, () => sel.f.who = 'friendly'],
    [/^with (\d+) \{might\} or less/, (mm) => sel.f.mightLE = +mm[1]], [/^with (\d+) \{might\} or more/, (mm) => sel.f.mightGE = +mm[1]],
    [/^with less might than (me|it)/, (mm) => sel.f.mightLT = mm[1] === 'me' ? 'self' : 'it'], [/^with greater might than me/, () => sel.f.mightGT = 'self'],
    [/^with energy cost no more than \{energy:(\d+)\}/, (mm) => sel.f.costLE = +mm[1]], [/^with energy cost no more than my might/, () => sel.f.costLE = 'selfMight'],
    [/^with \[(\w+)\]/, (mm) => sel.f.hasKw = mm[1].toLowerCase()], [/^without \[(\w+)\]/, (mm) => sel.f.notKw = mm[1].toLowerCase()],
    [/^that's exhausted/, () => sel.f.ex = true], [/^in your trash/, () => sel.f.zone = 'trash'], [/^from your trash/, () => sel.f.zone = 'trash'],
    [/^at each location/, () => sel.f.perLoc = true], [/^besides me/, () => sel.f.other = true], [/^with my name/, () => sel.f.sameName = true],
  ];
  again = true;
  while (again && rest) { again = false; for (const [re, fn] of tail) { const mm = rest.match(re); if (mm) { fn(mm); rest = rest.slice(mm[0].length).replace(/^,?\s*(and\s+)?/, ''); again = true; break; } } }
  if (rest) fail('np-tail: "' + rest + '" in ' + np);
  return sel;
}

// ---------- destinations ----------
function parseDest(d) {
  d = d.trim().toLowerCase().replace(/[.,]$/, '');
  if (/^(its|their|your|my|to its|to their) base$|^base$|^its owner's base$|^their owner's base$/.test(d)) return { to: 'base' };
  if (/^(here|this battlefield|my battlefield|to here)$/.test(d)) return { to: 'here' };
  if (/^(there|that battlefield|its battlefield)$/.test(d)) return { to: 'there' };
  if (/^(a|another) battlefield$/.test(d)) return { to: 'bf' };
  if (/^a battlefield you control$/.test(d)) return { to: 'bfMine' };
  if (/^an open battlefield$/.test(d)) return { to: 'bfOpen' };
  if (/^(its|my|that unit's) location$|^the same battlefield$|^to its location$/.test(d)) return { to: 'itloc' };
  if (/^a different battlefield$/.test(d)) return { to: 'bfOther' };
  if (/^a location where there's a unit with the same controller$/.test(d)) return { to: 'withFriend' };
  if (/^a battlefield where you have units$/.test(d)) return { to: 'bfMineUnits' };
  if (/^an occupied enemy battlefield.*$/.test(d)) return { to: 'bfEnemy' };
  fail('dest: ' + d);
}

// ---------- keyword grants ----------
function parseKwList(s) {
  // "[Assault 2] and [Ganking]" | "[Deflect], [Ganking], and [Shield]"
  const out = {}; const re = /\[([A-Za-z-]+)(?: (\d+))?\]/g; let m; let rest = s;
  while ((m = re.exec(s))) { const k = m[1].toLowerCase(); out[k] = m[2] ? +m[2] : (['assault', 'shield', 'deflect', 'hunt', 'disarm'].includes(k) ? 1 : true); rest = rest.replace(m[0], ''); }
  if (rest.replace(/,|and|\s/g, '')) fail('kwlist: ' + s);
  return out;
}

// ---------- conditions ----------
function parseCond(c) {
  c = c.trim().replace(/[.,]$/, ''); const l = c.toLowerCase(); let m;
  if ((m = l.match(/^you control (a|an|another|two or more|3 or more|three or more|4 or more) (.+)$/))) {
    const nn = { a: 1, an: 1, another: 1, 'two or more': 2, '3 or more': 3, 'three or more': 3, '4 or more': 4 }[m[1]];
    const s = parseSel('a ' + m[2], {}); return { c: 'control', n: nn, f: { ...s.f, who: 'friendly', other: m[1] === 'another' || s.f.other } };
  }
  if ((m = l.match(/^you control (\d+) or more other gear$/))) return { c: 'control', n: +m[1], f: { type: 'g', who: 'friendly' } };
  if ((m = l.match(/^you control (\d+) or (more|fewer) runes$/))) return { c: 'runes', [m[2] === 'more' ? 'ge' : 'le']: +m[1] };
  if ((m = l.match(/^you control (\d+) or more runes$/))) return { c: 'runes', ge: +m[1] };
  if ((m = l.match(/^you have (\d+)\+ runes$/))) return { c: 'runes', ge: +m[1] };
  if ((m = l.match(/^(?:while )?you have (\d+)\+ runes$/))) return { c: 'runes', ge: +m[1] };
  if ((m = l.match(/^you have (one|two|\d+) or fewer cards in your hand$/))) return { c: 'hand', le: num(m[1]) };
  if (/^it's your turn$/.test(l)) return { c: 'myTurn' };
  if (/^it's not your turn$/.test(l)) return { c: 'myTurn', not: true };
  if (/^you paid the additional cost$/.test(l)) return { c: 'paidExtra' };
  if (/^you paid my additional cost$/.test(l)) return { c: 'paidExtra' };
  if (/^i'm \[empowered\]$/.test(l)) return { c: 'selfEmp' };
  if (/^i'm \[mighty\]$|^i was \[mighty\]$/.test(l)) return { c: 'selfMighty' };
  if (/^it's \[empowered\]$/.test(l)) return { c: 'itEmp' };
  if (/^this is \[empowered\]$/.test(l)) return { c: 'selfEmp' };
  if ((m = l.match(/^it has (\d+) \{might\} or less$/))) return { c: 'itMightLE', n: +m[1] };
  if ((m = l.match(/^it had (\d+) \{might\} or less$/))) return { c: 'itMightLE', n: +m[1] };
  if (/^it is stunned$|^it's stunned$|^it's already stunned$/.test(l)) return { c: 'itStunned' };
  if (/^it's attacking$/.test(l)) return { c: 'itAttacking' };
  if (/^it was an enemy unit$/.test(l)) return { c: 'itEnemy' };
  if (/^it was a friendly unit$/.test(l)) return { c: 'itEnemy', not: true };
  if (/^it's a spell$/.test(l)) return { c: 'itType', t: 's' };
  if (/^it's a unit$/.test(l)) return { c: 'itType', t: 'u' };
  if (/^it's a gear$/.test(l)) return { c: 'itType', t: 'g' };
  if (/^it's an equipment$/.test(l)) return { c: 'itType', t: 'eq' };
  if (/^this kills it$/.test(l)) return { c: 'itDied' };
  if (/^an opponent's score is within 3 points of the victory score$/.test(l)) return { c: 'oppNearWin' };
  if (/^your score is within 3 points of the victory score$/.test(l)) return { c: 'meNearWin' };
  if (/^your score is not within 3 points of the victory score$/.test(l)) return { c: 'meNearWin', not: true };
  if (/^i'm at a battlefield$|^i am at a battlefield$/.test(l)) return { c: 'selfAtBf' };
  if (/^you've played a spell this turn$/.test(l)) return { c: 'playedThisTurn', t: 's' };
  if (/^you've played another card this turn$/.test(l)) return { c: 'legion' };
  if (/^an opponent controls a battlefield$/.test(l)) return { c: 'oppControlsBf' };
  if (/^an opponent controls a stunned unit$/.test(l)) return { c: 'oppStunned' };
  if ((m = l.match(/^you have (two|\d+) or more other units in your base$/))) return { c: 'control', n: num(m[1]), f: { type: 'u', who: 'friendly', where: 'base', other: true } };
  if ((m = l.match(/^you control (two|\d+) or more gear$/))) return { c: 'control', n: num(m[1]), f: { type: 'g', who: 'friendly' } };
  if (/^there is a ready enemy unit here$/.test(l)) return { c: 'exists', f: { type: 'u', who: 'enemy', where: 'here', ready: true } };
  if (/^an enemy unit is alone here$/.test(l)) return { c: 'enemyAloneHere' };
  if (/^there is exactly one other unit you control here$/.test(l)) return { c: 'friendsHere', eq: 1 };
  if (/^you have another unit here$/.test(l)) return { c: 'friendsHere', ge: 1 };
  if (/^i died alone$/.test(l)) return { c: 'diedAlone' };
  if (/^i didn't die alone$/.test(l)) return { c: 'diedAlone', not: true };
  if (/^if you have 4\+ units at that battlefield$|^you have 4\+ units at that battlefield$/.test(l)) return { c: 'unitsThere', ge: 4 };
  if (/^a unit died this turn$/.test(l)) return { c: 'unitDiedThisTurn' };
  if (/^you've discarded a card this turn$/.test(l)) return { c: 'discardedThisTurn' };
  if (/^you've gained xp this turn$/.test(l)) return { c: 'gainedXpThisTurn' };
  if (/^you have a card with my name in your trash$/.test(l)) return { c: 'nameInTrash' };
  if (/^you control a facedown card at a battlefield$|^you control a facedown card$/.test(l)) return { c: 'hiddenCount', ge: 1 };
  if (/^i'm buffed$/.test(l)) return { c: 'selfBuffed' };
  if (/^there's a stunned enemy unit here$/.test(l)) return { c: 'exists', f: { type: 'u', who: 'enemy', where: 'here', stunned: true } };
  if (/^you control another (\w+)$/.test(l)) { const mm = l.match(/^you control another (\w+)$/); return { c: 'control', n: 1, f: { type: 'u', who: 'friendly', other: true, tag: mm[1][0].toUpperCase() + mm[1].slice(1) } }; }
  fail('cond: ' + c);
}

// ---------- effects ----------
const POL_HARM = new Set(['deal', 'kill', 'return', 'stun', 'banish', 'counter', 'weaken', 'recallEnemy', 'temp']);

function E(op, o) { return Object.assign({ op }, o || {}); }

function parseClause(cl, ctx) {
  let c = cl.trim().replace(/\.$/, '').replace(/^then,?\s+/i, '').replace(/^and\s+/i, '');
  const l = c.toLowerCase(); let m;
  if (!c) return [];
  // conditionals
  if ((m = c.match(/^If (.+?), (.+)$/i))) {
    try { const cond = parseCond(m[1]); return [E('if', { cond, then: parseEffects(m[2], ctx) })]; } catch (e) { if (!(e instanceof Unparsed)) throw e; }
  }
  if ((m = c.match(/^(.+?) if (.+)$/i)) && !/^counter/i.test(c)) {
    try { const cond = parseCond(m[2]); return [E('if', { cond, then: parseEffects(m[1], ctx) })]; } catch (e) { if (!(e instanceof Unparsed)) throw e; }
  }
  if ((m = c.match(/^you may pay ((?:\{(?:energy|power):\w+\})+)(?: and exhaust (?:me|this))? to (.+)$/i))) return [E('payOpt', { cost: parseResources(m[1]), exSelf: /exhaust/.test(m[0].slice(0, m[0].indexOf(' to '))), then: parseEffects(m[2], ctx) })];
  if ((m = c.match(/^you may pay ((?:\{(?:energy|power):\w+\})+)$/i))) return [E('payOpt', { cost: parseResources(m[1]), then: [], bindDo: true })];
  if ((m = c.match(/^you may exhaust (?:me|this) to (.+)$/i))) return [E('payOpt', { cost: { e: 0, pw: [] }, exSelf: true, then: parseEffects(m[1], ctx) })];
  if ((m = c.match(/^you may spend (\d+) xp to (.+)$/i))) return [E('payOpt', { cost: { e: 0, pw: [] }, xp: +m[1], then: parseEffects(m[2], ctx) })];
  if ((m = c.match(/^you may spend a buff to (.+)$/i))) return [E('payOpt', { cost: { e: 0, pw: [] }, spendBuff: true, then: parseEffects(m[1], ctx) })];
  if ((m = c.match(/^you may discard 1 and exhaust me to (.+)$/i))) return [E('payOpt', { cost: { e: 0, pw: [] }, exSelf: true, discard: 1, then: parseEffects(m[1], ctx) })];
  if ((m = c.match(/^you may discard 1 to (.+)$/i))) return [E('payOpt', { cost: { e: 0, pw: [] }, discard: 1, then: parseEffects(m[1], ctx) })];
  if ((m = c.match(/^you may (.+)$/i))) return [E('may', { then: parseEffects(m[1], ctx) })];
  // simple verbs
  if ((m = l.match(/^draw (\d+|a card|one)$/))) return [E('draw', { n: num(m[1]) || 1 })];
  if ((m = l.match(/^draw (\d+) for each (.+)$/))) return [E('draw', { n: +m[1], per: parseCount(m[2]) })];
  if ((m = l.match(/^(?:you )?draw (\d+) and channel (\d+) runes? exhausted$/))) return [E('draw', { n: +m[1] }), E('channel', { n: +m[2], ex: true })];
  if ((m = l.match(/^channel (\d+) runes?( exhausted)?$/))) return [E('channel', { n: +m[1], ex: !!m[2] })];
  if ((m = l.match(/^(?:each player|that player) channels (\d+) runes?( exhausted)?$/))) return [E('channel', { n: +m[1], ex: !!m[2], who: 'each' })];
  if ((m = l.match(/^its owner channels (\d+) runes?( exhausted)?$/))) return [E('channel', { n: +m[1], ex: !!m[2], who: 'itOwner' })];
  if ((m = l.match(/^ready (?:up to )?(\d+|two) (?:friendly )?runes( at the end of this turn)?$/))) return [E('readyRunes', { n: num(m[1]), delay: !!m[2] })];
  if (/^ready your runes$/.test(l)) return [E('readyRunes', { n: 99 })];
  if ((m = l.match(/^gain (\d+) xp$/))) return [E('xp', { n: +m[1] })];
  if ((m = l.match(/^gain (\d+) xp for each (.+)$/))) return [E('xp', { n: +m[1], per: parseCount(m[2]) })];
  if ((m = l.match(/^(?:you )?score (\d+|1) points?$/))) return [E('score', { n: +m[1] })];
  if ((m = l.match(/^(?:each player|that player) gains (\d+) points?$/))) return [E('score', { n: +m[1], who: 'each' })];
  if ((m = l.match(/^discard (\d+)$/))) return [E('discard', { n: +m[1] })];
  if ((m = l.match(/^discard (\d+), then draw (\d+)$/))) return [E('discard', { n: +m[1] }), E('draw', { n: +m[2] })];
  if ((m = l.match(/^each player discards (\d+)$/))) return [E('discard', { n: +m[1], who: 'each' })];
  if ((m = l.match(/^each player draws (\d+)$/))) return [E('draw', { n: +m[1], who: 'each' })];
  if ((m = l.match(/^each player discards their hand, then draws (\d+)$/))) return [E('discardHand', { who: 'each' }), E('draw', { n: +m[1], who: 'each' })];
  if ((m = l.match(/^\[predict(?: (\d+))?\]$/)) || (m = l.match(/^predict(?: (\d+))?$/))) return [E('predict', { n: +(m[1] || 1) })];
  if ((m = l.match(/^\[burn (\d+)\]$/))) return [E('burn', { n: +m[1], who: 'you' })];
  if ((m = l.match(/^they \[burn (\d+)\]$/))) return [E('burn', { n: +m[1], who: 'chosenPlayer' })];
  if ((m = l.match(/^\[add\] ((?:\{(?:energy|power):\w+\})+)(?: at the start of your next main phase)?$/))) return [E('add', { res: parseResources(m[1]), delay: /next main/.test(l) })];
  if ((m = l.match(/^play (?:a|an|one) gold gear token exhausted$/))) return [E('gold', { n: 1 })];
  if ((m = l.match(/^play (two|three|four|\d+) gold gear tokens exhausted$/))) return [E('gold', { n: num(m[1]) })];
  if ((m = l.match(/^play (a|an|one|two|three|four|\d+) (ready )?(?:(\d+|\{energy:1\}) \{might\} )?([a-z' ]+?) (unit|gear) tokens?(?: with \[([a-z-]+)\])?(?: (to your base|in your base|into your base|at your base|here|there|to this battlefield|from bilgewater|to your base for each equipment you control))?$/))) {
    const nm = m[4].replace(/\b\w/g, (x) => x.toUpperCase());
    const mt = m[3] === '{energy:1}' ? 1 : (m[3] != null ? +m[3] : null);
    const where = !m[7] ? (ctx.kind === 'spell' ? 'base' : 'base') : /here|this battlefield/.test(m[7]) ? 'here' : /there/.test(m[7]) ? 'there' : 'base';
    return [E('token', { name: nm, m: mt, n: num(m[1]), ready: !!m[2], kw: m[6] ? { [m[6]]: true } : {}, where, per: /for each equipment/.test(m[7] || '') ? { count: 'controlEq' } : null })];
  }
  if ((m = l.match(/^play (?:a|an|one|two|three|four|\d+) (?:ready )?(?:\d+ \{might\} )?.+ unit tokens?.*$/))) fail('token-shape: ' + c);
  // counters
  if ((m = l.match(/^counter (?:a|an) (enemy )?spell(?: or ability)?(.*)$/))) {
    const rest = m[2].trim(); const t = { q: 'one', n: 1, f: { type: 's', who: m[1] ? 'enemy' : 'any' } };
    if (!rest) return [E('counter', { t })];
    let mm;
    if ((mm = rest.match(/^that costs no more than \{energy:(\d+)\} and no more than \{power:any\}$/))) { t.f.costLE = +mm[1]; t.f.powLE = 1; return [E('counter', { t })]; }
    if ((mm = rest.match(/^unless its controller pays \{energy:(\d+)\}$/))) return [E('counter', { t, unless: { e: +mm[1], pw: [] } })];
    if ((mm = rest.match(/^if an opponent has played another spell this turn$/))) { t.f.ctrlPlayed2 = true; return [E('counter', { t })]; }
    if ((mm = rest.match(/^that chooses a friendly unit or gear$/))) { t.f.choosesFriendly = true; return [E('counter', { t })]; }
    fail('counter: ' + c);
  }
  if (/^counter it$|^counter that spell$/.test(l)) return [E('counter', { t: { q: 'it' } })];
  if (/^return it to its owner's hand instead of putting it in their trash$/.test(l)) return [E('counterToHand')];
  // damage
  if ((m = c.match(/^[Dd]eal (\d+) to (.+?) and (\d+) to (.+)$/))) return [E('deal', { n: +m[1], t: parseSel(m[2], ctx) }), E('deal', { n: +m[3], t: parseSel(m[4], ctx) })];
  if ((m = c.match(/^[Dd]eal (\d+) to (.+?), then deal (\d+) to (.+)$/))) return [E('deal', { n: +m[1], t: parseSel(m[2], ctx) }), E('deal', { n: +m[3], t: { ...parseSel(m[4], ctx), notIt: true } })];
  if ((m = c.match(/^[Dd]eal (\d+) to each of up to (two|three|\d+) units$/))) return [E('deal', { n: +m[1], t: { q: 'upto', n: num(m[2]), f: { type: 'u' } } })];
  if ((m = c.match(/^[Dd]eal (\d+) (?:damage )?to (.+)$/))) return [E('deal', { n: +m[1], t: parseSel(m[2], ctx) })];
  if ((m = c.match(/^[Dd]eal damage equal to (my|its) [Mm]ight to (.+)$/))) return [E('deal', { n: { ref: m[1] === 'my' ? 'selfMight' : 'itMight' }, t: parseSel(m[2], ctx) })];
  if ((m = c.match(/^[Dd]eal damage equal to my \[Assault\] to (.+)$/))) return [E('deal', { n: { ref: 'selfAssault' }, t: parseSel(m[1], ctx) })];
  if ((m = c.match(/^(?:It|That unit|I) deals? damage equal to (?:its|my) Might to (.+)$/i))) return [E('deal', { n: { ref: 'itMight' }, src: 'it', t: parseSel(m[1], ctx) })];
  if (/^they deal damage equal to their mights to each other$|^we deal damage equal to our mights to each other$/.test(l)) return [E('fight')];
  // might
  if ((m = c.match(/^[Gg]ive (.+?) ([+-]\d+) \{might\}(?: this turn)?(?:, to a minimum of 1 \{might\})?(?: this turn)?$/))) {
    const n = +m[2]; return [E('might', { n, t: parseSel(m[1], ctx), min1: /minimum of 1/.test(c) })];
  }
  if ((m = c.match(/^[Gg]ive (.+?) ([+-]\d+) \{might\} this turn for each (.+)$/))) return [E('might', { n: +m[2], t: parseSel(m[1], ctx), per: parseCount(m[3]) })];
  if ((m = c.match(/^[Gg]ive (.+?) ([+-]\d+) \{might\} and (\[.+\]) this turn$/))) return [E('might', { n: +m[2], t: parseSel(m[1], ctx) }), E('giveKw', { kw: parseKwList(m[3]), t: { q: 'it' } })];
  if ((m = c.match(/^[Gg]ive (.+?) ([+-]\d+) \{might\} this turn and (.+?) ([+-]\d+) \{might\} this turn(?:, to a minimum of 1 \{might\})?$/))) {
    const a = parseSel(m[1], ctx), b = parseSel(m[3], ctx); return [E('might', { n: +m[2], t: a }), E('might', { n: +m[4], t: { ...b, notIt: true }, min1: /minimum/.test(c) })];
  }
  if ((m = c.match(/^[Gg]ive (.+?) (\[.+?\](?:(?:,| and|, and) \[.+?\])*)(?: this turn| this combat)?$/))) return [E('giveKw', { kw: parseKwList(m[2]), t: parseSel(m[1], ctx), perm: !/this turn|this combat/.test(c) })];
  if ((m = c.match(/^[Gg]ive (?:it|them) \[Temporary\]$/))) return [E('temp', { t: { q: 'it' } })];
  if ((m = c.match(/^[Gg]ive (.+?) \[Temporary\]$/))) return [E('temp', { t: parseSel(m[1], ctx) })];
  if ((m = c.match(/^[Dd]ouble (.+?)'s? [Mm]ight this turn$/))) return [E('double', { t: parseSel(m[1], ctx) })];
  if ((m = c.match(/^[Dd]ouble my Might this turn$/))) return [E('double', { t: { q: 'self' } })];
  // removal / movement
  if ((m = c.match(/^[Kk]ill (.+)$/)) && !/ to /.test(m[1])) return [E('kill', { t: parseSel(m[1], ctx) })];
  if ((m = c.match(/^[Bb]anish (.+)$/)) && !/,/.test(m[1])) return [E('banish', { t: parseSel(m[1], ctx) })];
  if ((m = c.match(/^[Rr]eturn (.+?) to (?:its|their) owners?'? hands?$/))) return [E('return', { t: parseSel(m[1], ctx) })];
  if ((m = c.match(/^[Rr]eturn (.+?) from your trash to your hand$/))) { const t = parseSel(m[1], ctx); if (!t.f) fail('fromTrash-pronoun'); t.f.zone = 'trash'; t.f.who = 'friendly'; return [E('fromTrash', { t, to: 'hand' })]; }
  if ((m = c.match(/^[Rr]eturn (.+?) to its owner's hand$/))) return [E('return', { t: parseSel(m[1], ctx) })];
  if ((m = c.match(/^[Rr]eturn me to my owner's hand$/))) return [E('return', { t: { q: 'self' } })];
  if ((m = c.match(/^[Rr]ecall (.+?)( exhausted)?$/))) return [E('recall', { t: parseSel(m[1], ctx), ex: !!m[2] })];
  if ((m = c.match(/^[Mm]ove (.+?) (?:from (?:a|the) battlefield )?to (.+)$/)) && !/ and /.test(m[1])) return [E('move', { t: parseSel(m[1].replace(/ from (a|the) battlefield$/, ''), ctx), ...parseDest(m[2]) })];
  if ((m = c.match(/^[Mm]ove (.+?) from a battlefield to (?:its|their) base$/))) { const t = parseSel(m[1], ctx); t.f.where = 'bf'; return [E('move', { t, to: 'base' })]; }
  if ((m = c.match(/^[Mm]ove (.+)$/)) && !/ to /.test(m[1]) && !/ and /.test(m[1])) return [E('move', { t: parseSel(m[1], ctx), to: 'any' })];
  if ((m = c.match(/^[Rr]eady (.+)$/)) && !/runes?$/.test(m[1])) return [E('ready', { t: parseSel(m[1], ctx) })];
  if ((m = c.match(/^[Ee]xhaust (.+)$/))) return [E('exhaust', { t: parseSel(m[1], ctx) })];
  if ((m = c.match(/^(?:\[Stun\]|[Ss]tun) (.+)$/))) return [E('stun', { t: parseSel(m[1], ctx) })];
  if ((m = c.match(/^(?:\[Buff\]|[Bb]uff) (.+)$/))) return [E('buff', { t: parseSel(m[1], ctx) })];
  if ((m = c.match(/^[Hh]eal (.+)$/))) return [E('heal', { t: parseSel(m[1], ctx) })];
  if ((m = c.match(/^[Ee]mpower (.+)$/))) return [E('empower', { t: parseSel(m[1], ctx) })];
  if ((m = c.match(/^[Dd]isempower (.+)$/))) return [E('disempower', { t: parseSel(m[1], ctx) })];
  if ((m = c.match(/^[Cc]hoose (.+?) and (.+)$/)) && !/^one/.test(m[1])) return [E('choose', { t: parseSel(m[1], ctx), slot: 'a' }), E('choose', { t: { ...parseSel(m[2], ctx), notIt: true }, slot: 'b' })];
  if ((m = c.match(/^[Cc]hoose (.+)$/)) && !/^one/i.test(m[1]) && !/^(a|an) (player|opponent)$/i.test(m[1])) return [E('choose', { t: parseSel(m[1], ctx) })];
  if ((m = l.match(/^choose (?:a player|an opponent)$/))) return [E('choosePlayer', { opp: /opponent/.test(l) })];
  if ((m = l.match(/^they discard (\d+)$/))) return [E('discard', { n: +m[1], who: 'chosenPlayer' })];
  if ((m = l.match(/^they reveal their hand$/))) return [E('revealHand', { who: 'chosenPlayer' })];
  if ((m = l.match(/^its controller draws (\d+)$/))) return [E('draw', { n: +m[1], who: 'itController' })];
  if ((m = l.match(/^they score (\d+) points?$/))) return [E('score', { n: +m[1], who: 'chosenPlayer' })];
  if ((m = l.match(/^put the top (\d+) cards of your main deck into your trash$/))) return [E('mill', { n: +m[1] })];
  if ((m = l.match(/^recycle (\d+) from your trash$/))) return [E('recycleTrash', { n: +m[1] })];
  if ((m = l.match(/^recycle one of your runes$/))) return [E('recycleRune', { n: 1 })];
  if ((m = l.match(/^take control of (.+?)(?: and recall it)?$/))) return [E('steal', { t: parseSel(m[1], ctx), recall: /recall/.test(l) })];
  if (/^recycle the rest$|^then recycle the rest$|^put the rest into your trash$|^recycle the remaining cards$/.test(l)) return [E('lookRest', { to: /trash/.test(l) ? 'trash' : 'recycle' })];
  if ((m = l.match(/^look at the top (\d+|two|three|four|five) cards of your main deck$/))) return [E('look', { n: num(m[1]) })];
  if ((m = l.match(/^reveal the top (\d+|two|three|four|five) cards of your main deck$/))) return [E('look', { n: num(m[1]), reveal: true })];
  if ((m = l.match(/^reveal the top card of your main deck$/))) return [E('look', { n: 1, reveal: true })];
  if ((m = l.match(/^you may reveal (?:a|an) (unit|gear|spell|unit or gear)(?: with energy cost \{energy:(\d+)\} or more)? from among them and draw it$/))) return [E('lookTake', { type: m[1], costGE: m[2] ? +m[2] : null, may: true })];
  if ((m = l.match(/^(?:you may )?choose a card from among them and draw it$/))) return [E('lookTake', { type: 'card', may: true })];
  if ((m = l.match(/^put 1 into your hand$/))) return [E('lookTake', { type: 'card' })];
  if ((m = l.match(/^draw one and recycle the other$/))) return [E('lookTake', { type: 'card' }), E('lookRest', { to: 'recycle' })];
  if ((m = l.match(/^if it's a (unit|gear|spell), (?:draw it|put it in your hand)$/))) return [E('lookTopIf', { type: m[1][0] })];
  if ((m = l.match(/^(?:otherwise, )?recycle it$/))) return [E('lookRest', { to: 'recycle' })];
  fail('clause: ' + c);
}

function parseCount(s) {
  s = s.toLowerCase().trim(); let m;
  if ((m = s.match(/^(?:of your |your )?\[mighty\] units?$/))) return { count: 'control', f: { type: 'u', who: 'friendly', mighty: true } };
  if ((m = s.match(/^enemy unit there$/))) return { count: 'control', f: { type: 'u', who: 'enemy', where: 'there' } };
  if ((m = s.match(/^friendly unit$/))) return { count: 'control', f: { type: 'u', who: 'friendly' } };
  if ((m = s.match(/^battlefield you or allies control$|^other battlefield you or allies control$/))) return { count: 'bfs' };
  if ((m = s.match(/^card in your trash$/))) return { count: 'trash' };
  if ((m = s.match(/^equipment attached to me$/))) return { count: 'attachedEq' };
  fail('count: ' + s);
}

// split a block of effect text into sentences/clauses and parse each
function splitSentences(t) {
  const out = []; let buf = '';
  const parts = t.split(/(?<=\.)\s+(?=[A-Z\[{])/);
  for (const p of parts) out.push(p.trim());
  return out.filter(Boolean);
}
function parseEffects(text, ctx) {
  const out = [];
  for (let sent of splitSentences(text)) {
    sent = sent.replace(/\.$/, '');
    let m;
    if ((m = sent.match(/^If you do, (.+)$/i))) {
      const last = out[out.length - 1];
      if (last && (last.op === 'payOpt' || last.op === 'may')) { last.then = (last.then || []).concat(parseEffects(m[1], ctx)); continue; }
      out.push(E('ifDid', { then: parseEffects(m[1], ctx) })); continue;
    }
    if ((m = sent.match(/^Otherwise, (.+)$/i))) {
      const last = out[out.length - 1]; if (!last || last.op !== 'if') fail('otherwise-without-if');
      last.else = parseEffects(m[1], ctx); continue;
    }
    out.push(...parseCompound(sent, ctx));
  }
  return out;
}
function parseCompound(sent, ctx) {
  try { return parseClause(sent, ctx); } catch (e) { if (!(e instanceof Unparsed)) throw e;
    // try splitting on ", then " / " and " / ", "
    const seps = [', then ', '. Then, ', ', and then ', ' and then ', ' then ', ' and ', ', '];
    for (const sep of seps) {
      let idx = sent.indexOf(sep);
      while (idx > 0) {
        const a = sent.slice(0, idx), b = sent.slice(idx + sep.length);
        try { const pa = parseClause(a, ctx); const pb = parseCompound(b.replace(/^then,?\s*/i, ''), ctx); return pa.concat(pb); } catch (e2) { if (!(e2 instanceof Unparsed)) throw e2; }
        idx = sent.indexOf(sep, idx + 1);
      }
    }
    throw e;
  }
}

// ---------- triggers ----------
// returns {on, f, rest} or null
const TRIGS = [
  [/^When you play (?:me|this)(?: to a battlefield)?, /i, (m, x) => ({ on: 'played', toBf: /battlefield/.test(m[0]) })],
  [/^When this is played, /i, () => ({ on: 'played' })],
  [/^When you play me or when I hold, /i, () => ({ on: ['played', 'hold'] })],
  [/^When I'm played and when I conquer, /i, () => ({ on: ['played', 'conquer'] })],
  [/^When you play me or when I score, /i, () => ({ on: ['played', 'conquer', 'hold'] })],
  [/^When you play me or I attack, /i, () => ({ on: ['played', 'attack'] })],
  [/^When you play me or at the start of your Beginning Phase, /i, () => ({ on: ['played', 'beginning'] })],
  [/^When you play me from face down(?: on your turn)?, /i, (m) => ({ on: 'played', fromHidden: true, myTurn: /your turn/.test(m[0]) })],
  [/^When you play this from face down, /i, () => ({ on: 'played', fromHidden: true })],
  [/^When I defend or I'm played from \[Hidden\], /i, () => ({ on: ['defend', 'playedHidden'] })],
  [/^When you play me or another Dragon, /i, () => ({ on: 'youPlay', f: { type: 'u', tag: 'Dragon' } })],
  [/^When I attack or defend one on one, /i, () => ({ on: ['attack', 'defend'], oneOnOne: true })],
  [/^When I attack or defend, /i, () => ({ on: ['attack', 'defend'] })],
  [/^When I attack while (.+?), /i, () => null],
  [/^When I attack, /i, () => ({ on: 'attack' })],
  [/^When I defend, /i, () => ({ on: 'defend' })],
  [/^When I conquer after an attack, /i, () => ({ on: 'conquer', afterAttack: true })],
  [/^When I conquer an open battlefield, /i, () => ({ on: 'conquer', open: true })],
  [/^The first time I conquer each turn, /i, () => ({ on: 'conquer', once: 'turn' })],
  [/^When I conquer or hold, /i, () => ({ on: ['conquer', 'hold'] })],
  [/^When I conquer, /i, () => ({ on: 'conquer' })],
  [/^When I hold, /i, () => ({ on: 'hold' })],
  [/^When I move to a battlefield, /i, () => ({ on: 'move', toBf: true })],
  [/^When I move from a battlefield, /i, () => ({ on: 'move', fromBf: true })],
  [/^When I move from a location, /i, () => ({ on: 'move' })],
  [/^The first time I move each turn, /i, () => ({ on: 'move', nth: 1 })],
  [/^The second time I move each turn, /i, () => ({ on: 'move', nth: 2 })],
  [/^The third time I move in a turn, /i, () => ({ on: 'move', nth: 3 })],
  [/^When I move, /i, () => ({ on: 'move' })],
  [/^\[Deathknell\](?:\[>\]| —|:)?\s*/i, () => ({ on: 'die' })],
  [/^When I die in combat, /i, () => ({ on: 'die', inCombat: true })],
  [/^When I die, /i, () => ({ on: 'die' })],
  [/^The first time I win a combat each turn, /i, () => ({ on: 'win', once: 'turn' })],
  [/^When I win a combat, /i, () => ({ on: 'win' })],
  [/^When a combat that I was in ends, /i, () => ({ on: 'combatEnd' })],
  [/^When I become \[Empowered\], /i, () => ({ on: 'becomeEmp' })],
  [/^When I become ready, /i, () => ({ on: 'becomeReady' })],
  [/^When you choose or ready me, /i, () => ({ on: ['chosen', 'becomeReady'] })],
  [/^When you choose me with a spell, /i, () => ({ on: 'chosen', bySpell: true })],
  [/^When you buff me, /i, () => ({ on: 'buffed' })],
  [/^When you attach an Equipment to me, /i, () => ({ on: 'equipped' })],
  [/^When you discard me, /i, () => ({ on: 'discarded' })],
  [/^When this leaves the board, /i, () => ({ on: 'leaves' })],
  [/^When a showdown begins here, /i, () => ({ on: 'showdownHere' })],
  [/^At the start of your Beginning Phase, /i, () => ({ on: 'beginning' })],
  [/^At start of your Beginning Phase, /i, () => ({ on: 'beginning' })],
  [/^At the start of each player's Beginning Phase, /i, () => ({ on: 'beginningAny' })],
  [/^At the start of each player's first Beginning Phase, /i, () => ({ on: 'beginningAny', first: true })],
  [/^At the start of your Main Phase, /i, () => ({ on: 'mainStart' })],
  [/^At the end of your turn, /i, () => ({ on: 'endTurn' })],
  [/^When you play a spell that costs \{energy:(\d+)\} or more, /i, (m) => ({ on: 'youPlay', f: { type: 's', costGE: +m[1] } })],
  [/^When you play a spell on an opponent's turn, /i, () => ({ on: 'youPlay', f: { type: 's' }, oppTurn: true })],
  [/^When you play a card on an opponent's turn, /i, () => ({ on: 'youPlay', f: { type: 'c' }, oppTurn: true })],
  [/^When you play a spell, /i, () => ({ on: 'youPlay', f: { type: 's' } })],
  [/^When you play a \[Mighty\] unit, /i, () => ({ on: 'youPlay', f: { type: 'u', mighty: true } })],
  [/^When you play a token unit, /i, () => ({ on: 'youPlay', f: { type: 'u', token: true } })],
  [/^When you play a unit during a showdown, /i, () => ({ on: 'youPlay', f: { type: 'u' }, inShowdown: true })],
  [/^When you play another unit, /i, () => ({ on: 'youPlay', f: { type: 'u', other: true } })],
  [/^When you play a unit, /i, () => ({ on: 'youPlay', f: { type: 'u' } })],
  [/^When you play a gear, /i, () => ({ on: 'youPlay', f: { type: 'g' } })],
  [/^When you play a card from (?:face down|\[Hidden\]), /i, () => ({ on: 'youPlay', f: { type: 'c' }, fromHidden: true })],
  [/^When you play your second card in a turn, /i, () => ({ on: 'youPlay', f: { type: 'c' }, nth: 2 })],
  [/^When you play a card with Power cost \{power:any\}\{power:any\} or more, /i, () => ({ on: 'youPlay', f: { type: 'c', powGE: 2 } })],
  [/^When an opponent plays a unit while I'm at a battlefield, /i, () => ({ on: 'oppPlay', f: { type: 'u' }, selfAtBf: true })],
  [/^When an opponent plays a gear, /i, () => ({ on: 'oppPlay', f: { type: 'g' } })],
  [/^When a player plays a spell, /i, () => ({ on: 'anyPlay', f: { type: 's' } })],
  [/^When a player plays a unit here, /i, () => ({ on: 'anyPlay', f: { type: 'u' }, here: true })],
  [/^When you conquer here with one or more \[Mighty\] units, /i, () => ({ on: 'youConquer', here: true, mightyHere: true })],
  [/^When you conquer here, /i, () => ({ on: 'youConquer', here: true })],
  [/^When you hold here, /i, () => ({ on: 'youHold', here: true })],
  [/^When you defend here, /i, () => ({ on: 'youDefend', here: true })],
  [/^When you conquer or hold, /i, () => ({ on: ['youConquer', 'youHold'] })],
  [/^When you or an ally hold, /i, () => ({ on: 'youHold' })],
  [/^When you conquer, /i, () => ({ on: 'youConquer' })],
  [/^When you hold, /i, () => ({ on: 'youHold' })],
  [/^When you win a combat, /i, () => ({ on: 'youWin' })],
  [/^When you defend at a battlefield, /i, () => ({ on: 'youDefend' })],
  [/^When combat starts here, /i, () => ({ on: 'combatHere' })],
  [/^When another friendly unit dies, /i, () => ({ on: 'unitDies', f: { who: 'friendly', other: true } })],
  [/^When a friendly unit dies, /i, () => ({ on: 'unitDies', f: { who: 'friendly' } })],
  [/^The first time a friendly unit dies each turn, /i, () => ({ on: 'unitDies', f: { who: 'friendly' }, once: 'turn' })],
  [/^When a buffed friendly unit dies, /i, () => ({ on: 'unitDies', f: { who: 'friendly', buffed: true } })],
  [/^When another non-Recruit unit you control dies, /i, () => ({ on: 'unitDies', f: { who: 'friendly', other: true, notTag: 'Recruit' } })],
  [/^When one or more enemy units die, /i, () => ({ on: 'unitDies', f: { who: 'enemy' } })],
  [/^Once each turn, when an enemy unit here dies, /i, () => ({ on: 'unitDies', f: { who: 'enemy', where: 'here' }, once: 'turn' })],
  [/^Once each turn, when an enemy unit dies while I'm at a battlefield, /i, () => ({ on: 'unitDies', f: { who: 'enemy' }, once: 'turn', selfAtBf: true })],
  [/^When you stun (?:an|one or more) enemy units?(?: at a battlefield)?, /i, () => ({ on: 'youStun' })],
  [/^When you kill a stunned enemy unit, /i, () => ({ on: 'unitDies', f: { who: 'enemy', stunned: true }, byYou: true })],
  [/^When you discard one or more cards, /i, () => ({ on: 'youDiscard' })],
  [/^When you recycle one or more cards, /i, () => ({ on: 'youRecycle' })],
  [/^When you recycle a rune, /i, () => ({ on: 'youRecycleRune' })],
  [/^When you ready a friendly unit, /i, () => ({ on: 'unitReadied', f: { who: 'friendly' } })],
  [/^When you buff a friendly unit, /i, () => ({ on: 'unitBuffed', f: { who: 'friendly' } })],
  [/^When you spend a buff, /i, () => ({ on: 'buffSpent' })],
  [/^When you choose a friendly unit, /i, () => ({ on: 'youChoose', f: { who: 'friendly' } })],
  [/^When you empower something else, /i, () => ({ on: 'youEmpower' })],
  [/^When you use an activated ability of a gear, /i, () => ({ on: 'gearAbility' })],
  [/^When you hide a card, /i, () => ({ on: 'youHide' })],
  [/^When a unit you control becomes \[Mighty\], |^When one of your units becomes \[Mighty\], /i, () => ({ on: 'becomesMighty', f: { who: 'friendly' } })],
  [/^When a friendly unit attacks or defends alone, /i, () => ({ on: 'aloneCombat', f: { who: 'friendly' } })],
  [/^When an enemy unit attacks a battlefield you control, /i, () => ({ on: 'enemyAttacks' })],
  [/^When a unit moves from here, /i, () => ({ on: 'unitMoves', fromHere: true })],
  [/^When an opponent moves to a battlefield other than mine, /i, () => ({ on: 'oppMoves', notMine: true })],
  [/^When an opponent scores, /i, () => ({ on: 'oppScores' })],
  [/^When you draw your second card each turn, /i, () => ({ on: 'youDraw', nth: 2 })],
];
function parseTrigger(line) {
  for (const [re, fn] of TRIGS) {
    const m = line.match(re);
    if (m) { const t = fn(m); if (!t) fail('trigger-shape: ' + line.slice(0, 60)); return { trig: t, rest: line.slice(m[0].length) }; }
  }
  return null;
}

// ---------- statics ----------
function parseStatic(line, card) {
  const l = line.toLowerCase().replace(/\.$/, ''); let m;
  const st = (o) => ({ kind: 'static', ...o });
  if (/^i enter ready$/.test(l)) return st({ s: 'enterReady' });
  if ((m = l.match(/^i enter ready if (.+)$/))) return st({ s: 'enterReady', cond: parseCond(m[1]) });
  if ((m = l.match(/^if (.+?), i enter ready$/))) return st({ s: 'enterReady', cond: parseCond(m[1]) });
  if (/^this enters exhausted$|^i enter exhausted$/.test(l)) return st({ s: 'enterEx' });
  if (/^you may play me to an open battlefield$/.test(l)) return st({ s: 'playOpenBf' });
  if (/^you may play me to an occupied enemy battlefield$/.test(l)) return st({ s: 'playEnemyBf' });
  if (/^friendly units may be played to open battlefields$/.test(l)) return st({ s: 'friendsPlayOpenBf' });
  if (/^i can be played to a battlefield you're attacking$|^i can be played to a battlefield where there are enemy units$/.test(l)) return st({ s: 'playEnemyBf' });
  if (/^i can't be chosen by enemy spells and abilities$/.test(l)) return st({ s: 'untargetable' });
  if (/^i can't be chosen by enemy spells and abilities unless i'm in combat$/.test(l)) return st({ s: 'untargetable', unlessCombat: true });
  if (/^i don't deal combat damage$/.test(l)) return st({ s: 'noCombatDmg' });
  if (/^i must be assigned combat damage last$/.test(l)) return st({ s: 'kw', kw: { backline: true } });
  if (/^i can't move to base$/.test(l)) return st({ s: 'noMoveBase' });
  if (/^i can't be readied$/.test(l)) return st({ s: 'noReady' });
  if (/^units can't be played here$/.test(l)) return st({ s: 'bfNoPlay' });
  if (/^units can't move from here to base$/.test(l)) return st({ s: 'bfNoRetreat' });
  if (/^units can't move to base$/.test(l)) return st({ s: 'noRetreatAll' });
  if ((m = l.match(/^i have ([+-]\d+) \{might\}$/))) return st({ s: 'might', n: +m[1], who: 'self' });
  if ((m = l.match(/^i have ([+-]\d+) \{might\} and (\[.+\])$/))) return st({ s: 'might', n: +m[1], who: 'self', kw: parseKwList(m[2]) });
  if ((m = l.match(/^i have (\[.+\])$/))) return st({ s: 'kw', kw: parseKwList(m[1]) });
  if ((m = l.match(/^i have (\[.+\]) and enter ready$/))) return [st({ s: 'kw', kw: parseKwList(m[1]) }), st({ s: 'enterReady' })];
  if ((m = l.match(/^i have ([+-]\d+) \{might\} and enter ready$/))) return [st({ s: 'might', n: +m[1], who: 'self' }), st({ s: 'enterReady' })];
  if ((m = l.match(/^while (.+?), i have ([+-]\d+) \{might\}$/))) return st({ s: 'might', n: +m[2], who: 'self', cond: parseStaticCond(m[1]) });
  if ((m = l.match(/^while (.+?), i have (\[.+\])$/))) return st({ s: 'kw', kw: parseKwList(m[2]), cond: parseStaticCond(m[1]) });
  if ((m = l.match(/^while (.+?), i have an additional ([+-]\d+) \{might\}$/))) return st({ s: 'might', n: +m[2], who: 'self', cond: parseStaticCond(m[1]) });
  if ((m = l.match(/^i have ([+-]\d+) \{might\} while (.+)$/))) return st({ s: 'might', n: +m[1], who: 'self', cond: parseStaticCond(m[2]) });
  if ((m = l.match(/^i have (\[.+\]) while (.+)$/))) return st({ s: 'kw', kw: parseKwList(m[1]), cond: parseStaticCond(m[2]) });
  if ((m = l.match(/^if (.+?), i have ([+-]\d+) \{might\} and (\[.+\])$/))) return st({ s: 'might', n: +m[2], who: 'self', kw: parseKwList(m[3]), cond: parseStaticCond(m[1]) });
  if ((m = l.match(/^if (.+?), i have ([+-]\d+) \{might\}$/))) return st({ s: 'might', n: +m[2], who: 'self', cond: parseStaticCond(m[1]) });
  if ((m = l.match(/^if (.+?), i have (\[.+\])$/))) return st({ s: 'kw', kw: parseKwList(m[2]), cond: parseStaticCond(m[1]) });
  if ((m = l.match(/^i have ([+-]\d+) \{might\} for each (.+)$/))) return st({ s: 'might', n: +m[1], who: 'self', per: parseStaticCount(m[2]) });
  if ((m = l.match(/^i get ([+-]\d+) \{might\} for each (.+)$/))) return st({ s: 'might', n: +m[1], who: 'self', per: parseStaticCount(m[2]) });
  if ((m = l.match(/^my might is increased by (.+)$/))) return st({ s: 'might', n: 1, who: 'self', per: parseStaticCount(m[1]) });
  if ((m = l.match(/^i have \[assault\] equal to (.+)$/))) return st({ s: 'kwN', kw: 'assault', per: parseStaticCount(m[1]) });
  // auras
  if ((m = l.match(/^(other friendly units|your other units|friendly units|your units|units|other buffed friendly units at my battlefield|your token units|your units here|friendly buffed units|units here with \[temporary\]|units here with \[tank\]|stunned enemy units here|your units that are \[empowered\]|your (mechs|dragons|sand soldiers|poros)|bird, cat, dog, poro, and ivern units)( here)?( each)? (have|get) ([+-]\d+) \{might\}(?:, to a minimum of 1 \{might\})?( here)?$/))) {
    return st({ s: 'aura', n: +m[6], f: auraF(m[1], m[3] || m[7]) });
  }
  if ((m = l.match(/^(other friendly units|your other units|friendly units|your units|units|your token units|friendly buffed units|units here with \[temporary\]|other friendly units here|your (mechs|dragons|sand soldiers))( here)?( each)? (?:have|give) (\[.+\])(?: if they didn't already)?$/))) {
    return st({ s: 'aura', kw: parseKwList(m[5]), f: auraF(m[1], m[3]) });
  }
  if ((m = l.match(/^while i'm at a battlefield, your other units here have (\[.+\])$/))) return st({ s: 'aura', kw: parseKwList(m[1]), f: { who: 'friendly', other: true, where: 'here' }, cond: { c: 'selfAtBf' } });
  if ((m = l.match(/^your units here with less might than me can't be chosen by enemy spells and abilities$/))) return st({ s: 'auraUntargetable', f: { who: 'friendly', where: 'here', mightLT: 'self' } });
  // cost changes
  if ((m = l.match(/^i cost \{energy:(\d+)\} less for each (.+?)(?:, to a minimum of \{energy:1\})?$/))) return st({ s: 'costLess', e: +m[1], per: parseStaticCount(m[2]) });
  if ((m = l.match(/^i cost \{energy:(\d+)\} less to play from anywhere other than your hand$/))) return st({ s: 'costLess', e: +m[1], notFromHand: true });
  if ((m = l.match(/^i cost \{energy:(\d+)\} less$/))) return st({ s: 'costLess', e: +m[1] });
  if ((m = l.match(/^(?:this|i) costs? \{energy:(\d+)\} less if (.+)$/))) return st({ s: 'costLess', e: +m[1], cond: parseCond(m[2]) });
  if ((m = l.match(/^if (.+?), this costs \{energy:(\d+)\} less$/))) return st({ s: 'costLess', e: +m[2], cond: parseCond(m[1]) });
  if ((m = l.match(/^this costs \{energy:(\d+)\} less$/))) return st({ s: 'costLess', e: +m[1] });
  if ((m = l.match(/^this costs \{energy:(\d+)\} less instead$/))) return st({ s: 'costLess', e: +m[1], instead: true });
  if ((m = l.match(/^i cost ((?:\{(?:energy|power):\w+\})+) less(?: instead)?$/))) { const r = parseResources(m[1]); return st({ s: 'costLess', e: r.e, p: r.pw.length, instead: /instead/.test(l) }); }
  if ((m = l.match(/^you may pay (\{.+\}) as an additional cost to play me$/))) return st({ s: 'extraCost', cost: parseResources(m[1]) });
  if ((m = l.match(/^as you play me, you may pay (\{.+\}) as an additional cost\. if you do, draw 1$/))) return st({ s: 'extraCost', cost: parseResources(m[1]) });
  if (/^your spells and abilities deal 1 bonus damage$/.test(l)) return st({ s: 'bonusDmg', n: 1 });
  if ((m = l.match(/^spells and abilities affecting units here each deal (\d+) bonus damage$/))) return st({ s: 'bonusDmgHere', n: +m[1] });
  if ((m = l.match(/^increase the points needed to win the game by (\d+)$/))) return st({ s: 'winPlus', n: +m[1] });
  if (/^your \[deathknell\] effects trigger an additional time$/.test(l)) return st({ s: 'deathknellTwice' });
  if (/^players ignore \[deflect\] while paying for spells and abilities choosing something here$/.test(l)) return st({ s: 'bfIgnoreDeflect' });
  if (/^your tokens enter ready$/.test(l)) return st({ s: 'tokensEnterReady' });
  if (/^other friendly units enter ready$/.test(l)) return st({ s: 'friendsEnterReady' });
  if (/^your deck can have any number of cards named .+$/.test(l)) return st({ s: 'deckAnyNumber' });
  if (/^units can move here from anywhere$/.test(l)) return st({ s: 'bfGankIn' });
  if (/^while i'm at a battlefield, opponents can't score points$/.test(l)) return st({ s: 'oppNoScore', cond: { c: 'selfAtBf' } });
  fail('static: ' + line);
}
function auraF(who, here) {
  who = who.toLowerCase(); const f = { type: 'u' };
  if (/other/.test(who)) f.other = true;
  if (/friendly|your/.test(who)) f.who = 'friendly';
  if (/enemy/.test(who)) f.who = 'enemy';
  if (/token/.test(who)) f.token = true;
  if (/buffed/.test(who)) f.buffed = true;
  if (/stunned/.test(who)) f.stunned = true;
  if (/empowered/.test(who)) f.emp = true;
  if (/temporary/.test(who)) f.hasKw = 'temporary';
  if (/tank/.test(who)) f.hasKw = 'tank';
  if (/mechs/.test(who)) f.tag = 'Mech'; if (/dragons/.test(who)) f.tag = 'Dragon'; if (/sand soldiers/.test(who)) f.tag = 'Sand Soldier'; if (/poros/.test(who)) f.tag = 'Poro';
  if (/bird, cat, dog, poro, and ivern/.test(who)) f.tagAny = ['Bird', 'Cat', 'Dog', 'Poro', 'Ivern'];
  if (/here|at my battlefield/.test(who) || here) f.where = 'here';
  if (who === 'units') f.who = 'any';
  return f;
}
function parseStaticCond(c) {
  c = c.toLowerCase().trim(); let m;
  if (/^i'm at a battlefield$/.test(c)) return { c: 'selfAtBf' };
  if (/^i'm attacking or defending alone$/.test(c)) return { c: 'selfAlone' };
  if (/^i'm attacking with another unit$/.test(c)) return { c: 'selfAttackWithOther' };
  if (/^i'm buffed$/.test(c)) return { c: 'selfBuffed' };
  if (/^i'm \[mighty\]$/.test(c)) return { c: 'selfMighty' };
  if (/^you have another unit here$/.test(c)) return { c: 'friendsHere', ge: 1 };
  if ((m = c.match(/^you have (\d+)\+ runes$/))) return { c: 'runes', ge: +m[1] };
  if (/^there's a stunned enemy unit here$/.test(c)) return { c: 'exists', f: { type: 'u', who: 'enemy', where: 'here', stunned: true } };
  if (/^i'm at a battlefield with exactly one other unit you control$/.test(c)) return { c: 'friendsHere', eq: 1 };
  if (/^you've discarded a card this turn$/.test(c)) return { c: 'discardedThisTurn' };
  if (/^you've gained xp this turn$/.test(c)) return { c: 'gainedXpThisTurn' };
  if (/^you've spent \{energy:4\} or more to play a spell this turn$/.test(c)) return { c: 'bigSpellThisTurn' };
  if (/^you've spent at least \{power:any\}\{power:any\} this turn$/.test(c)) return { c: 'spentPower', ge: 2 };
  if (/^i'm \[empowered\] three times$/.test(c)) return { c: 'selfEmp', n: 3 };
  return parseCond(c);
}
function parseStaticCount(s) {
  s = s.toLowerCase().trim(); let m;
  if ((m = s.match(/^(?:each )?(?:friendly gear|gear you control)$/))) return { count: 'control', f: { type: 'g', who: 'friendly' } };
  if (/^(?:the number of )?cards in your trash$|^card in your trash$/.test(s)) return { count: 'trash' };
  if (/^your points$/.test(s)) return { count: 'points' };
  if (/^the number of enemy units here$/.test(s)) return { count: 'control', f: { type: 'u', who: 'enemy', where: 'here' } };
  if (/^the number of gear you control$/.test(s)) return { count: 'control', f: { type: 'g', who: 'friendly' } };
  if (/^token unit you control$/.test(s)) return { count: 'control', f: { type: 'u', who: 'friendly', token: true } };
  if (/^buffed friendly unit at my battlefield$/.test(s)) return { count: 'control', f: { type: 'u', who: 'friendly', buffed: true, where: 'here' } };
  if (/^of your units with \[temporary\] at my battlefield$/.test(s)) return { count: 'control', f: { type: 'u', who: 'friendly', hasKw: 'temporary', where: 'here' } };
  if (/^other unit you control here with my name$/.test(s)) return { count: 'control', f: { type: 'u', who: 'friendly', where: 'here', other: true, sameName: true } };
  if (/^card you've played this turn$/.test(s)) return { count: 'playedThisTurn' };
  if (/^card with my name in your trash$/.test(s)) return { count: 'nameInTrash' };
  if (/^rune you control$/.test(s)) return { count: 'runes' };
  if (/^of your \[mighty\] units$/.test(s)) return { count: 'control', f: { type: 'u', who: 'friendly', mighty: true } };
  if (/^time i'm \[empowered\]$/.test(s)) return { count: 'selfEmp' };
  if (/^each gear you control$/.test(s)) return { count: 'control', f: { type: 'g', who: 'friendly' } };
  fail('scount: ' + s);
}

// ---------- keyword lines ----------
function parseKeywordLine(line, card) {
  // returns {kw:{...}, extra:[abilities]} or null
  const kws = {}; const extra = [];
  let rest = line.trim(); let m; let any = false;
  const take = (re) => { const mm = rest.match(re); if (mm) { rest = rest.slice(mm[0].length).replace(/^[,\s]+/, ''); any = true; } return mm; };
  while (rest) {
    if ((m = take(/^\[(Tank|Ganking|Backline|Temporary|Hidden|Accelerate|Ambush|Vision|Unique|Weaponmaster|Quick-Draw|Reaction|Action|Shield|Assault|Deflect|Hunt|Deploy|Disarm)\](?:\s+(\d+))?(?=$|[,\s])/i))) {
      const k = m[1].toLowerCase(); kws[k] = m[2] ? +m[2] : (['assault', 'shield', 'deflect', 'hunt', 'disarm'].includes(k) ? 1 : true); continue;
    }
    if ((m = take(/^\[(Assault|Shield|Deflect|Hunt|Disarm) (\d+)\]/i))) { kws[m[1].toLowerCase()] = +m[2]; continue; }
    if ((m = take(/^\[Repeat\]\s*—?\s*((?:\{(?:energy|power):\w+\})+(?:\s*\/\s*(?:\{(?:energy|power):\w+\})+)*)$/i))) { kws.repeat = m[1].split('/').map((x) => parseResources(x)); continue; }
    if ((m = take(/^\[Repeat\]\s*—\s*Discard 1$/i))) { kws.repeat = [{ e: 0, pw: [], discard: 1 }]; continue; }
    if ((m = take(/^\[Flow\]\s*((?:\{(?:energy|power):\w+\})+)$/i))) { kws.flow = parseResources(m[1]); continue; }
    if ((m = take(/^\[?Equip\]?\s*—?\s*(.+)$/i))) { kws.equip = parseCostList(m[1].replace(/\. This ability's Energy cost is reduced by the Might of the unit you choose$/i, '')); if (/reduced by the Might/i.test(m[1])) kws.equip.reduceByMight = true; continue; }
    if ((m = take(/^\[Empower\]\s*—?\s*(.+?)(?:\. This ability costs \{energy:(\d+)\} less (?:if you control (\d+) or fewer runes|for each (rune you control|friendly unit with \[Temporary\])))?$/i))) {
      const body = m[1].replace(/ or \{power:body\}$/, ''); kws.empower = /^(\{(energy|power):\w+\})+$/.test(body.replace(/\s/g, '')) ? parseResources(body) : parseCostList(body.replace(/^\{energy:1\} or \{power:body\}$/, '{energy:1}'));
      if (m[2]) kws.empower.less = { e: +m[2], le: m[3] ? +m[3] : null, per: m[4] ? 'runes' : null };
      continue;
    }
    if ((m = take(/^\[(Stun)\]$/i))) { kws.stunkw = true; continue; }
    if ((m = take(/^(Ganking|Hidden|Tank|Deflect|Accelerate)$/i))) { kws[m[1].toLowerCase()] = true; continue; }
    break;
  }
  if (!any || rest) return null;
  return { kw: kws, extra };
}

// ---------- whole card ----------
function compileCard(card) {
  const abilities = []; const unparsed = []; let total = 0;
  const kw = {};
  const raw = stripReminders(card.txt || '');
  let lines = raw.split('\n').map(norm).filter(Boolean);
  if (card.t === 's') { /* spells: speed keywords handled below */ }
  // multi-line constructs: "Choose one —A.B.C." comes as one line already; "do the following based on the discarded card's type:Spell — Draw 1." also one line
  for (let line of lines) {
    total++;
    try {
      const got = compileLine(line, card, kw);
      if (got) abilities.push(...(Array.isArray(got) ? got : [got]));
    } catch (e) {
      if (!(e instanceof Unparsed)) throw e;
      unparsed.push({ line, why: e.message });
    }
  }
  // Equipment granted text (what the attached unit gets)
  const eq = stripReminders(card.eqtxt || '');
  const eqAb = [];
  for (let line of eq.split('\n').map(norm).filter(Boolean)) {
    total++;
    try {
      const kl = parseKeywordLine(line, card);
      if (kl) { eqAb.push({ kind: 'grantKw', kw: kl.kw }); continue; }
      const got = compileLine(line, card, {}, true);
      if (got) eqAb.push(...(Array.isArray(got) ? got : [got]).map((a) => ({ ...a, granted: true })));
    } catch (e) { if (!(e instanceof Unparsed)) throw e; unparsed.push({ line: '(equipped) ' + line, why: e.message }); }
  }
  return { kw, ab: abilities, eq: eqAb, cover: { total, parsed: total - unparsed.length, unparsed } };
}

function compileLine(line, card, kw, granted) {
  let m; let gate = null;
  // gates
  for (;;) {
    if ((m = line.match(/^\[Empowered\](?:\[>\]|\s*—)?\s*/i))) { gate = Object.assign(gate || {}, { emp: true }); line = line.slice(m[0].length); continue; }
    if ((m = line.match(/^\[Level (\d+)\](?:\[>\]|\s*—)?\s*/i))) { gate = Object.assign(gate || {}, { level: +m[1] }); line = line.slice(m[0].length); continue; }
    if ((m = line.match(/^\[Legion\](?:\[>\]|\s*—)\s*/i))) { gate = Object.assign(gate || {}, { legion: true }); line = line.slice(m[0].length); continue; }
    if ((m = line.match(/^\[>>\]\s*/))) { line = line.slice(m[0].length); continue; }
    break;
  }
  const withGate = (x) => { if (!gate) return x; const arr = Array.isArray(x) ? x : [x]; arr.forEach((a) => { a.gate = gate; }); return x; };
  // keyword-only lines
  const kl = parseKeywordLine(line, card);
  if (kl) {
    if (gate) return withGate({ kind: 'static', s: 'kw', kw: kl.kw });
    Object.assign(kw, kl.kw); return null;
  }
  // speed prefix
  let speed = null;
  if ((m = line.match(/^\[(Action|Reaction)\](?:,\s*\[Legion\])?(?:\[>\]|\s*—)?\s*/i))) { speed = m[1][0].toUpperCase(); if (/Legion/.test(m[0])) gate = Object.assign(gate || {}, { legion: true }); line = line.slice(m[0].length); }
  // triggers
  const tr = parseTrigger(line);
  if (tr) {
    const ctx = { kind: 'trig', card };
    const eff = parseEffects(tr.rest, ctx);
    return withGate({ kind: 'trig', ...tr.trig, eff });
  }
  // activated abilities  "COSTS: [speed] — EFFECT"
  if ((m = line.match(/^((?:(?:\{(?:exhaust|energy:\d+|power:\w+)\})+|Spend \d+ XP|Kill this|Banish this|Disempower (?:me|this)|Discard \d+|Discard a \w+|Recycle \d+ from your trash|Recycle a unit from your trash|Spend my buff|Kill a friendly unit or gear|Exhaust a unit you control)(?:,\s*(?:(?:\{(?:exhaust|energy:\d+|power:\w+)\})+|Spend \d+ XP|Kill this|Banish this|Disempower (?:me|this)|Discard \d+|Recycle \d+ from your trash|Recycle a unit from your trash|Kill a friendly unit or gear|Exhaust a unit you control))*)\s*:\s*(.+)$/i))) {
    const cost = parseCostList(m[1]); let body = m[2]; let sp = speed;
    let mm;
    if ((mm = body.match(/^\[(Action|Reaction)\](?:,\s*\[Legion\])?\s*—\s*/i))) { sp = mm[1][0].toUpperCase(); if (/Legion/.test(mm[0])) gate = Object.assign(gate || {}, { legion: true }); body = body.slice(mm[0].length); }
    let limit = {};
    body = body.replace(/\s*Use (?:this ability |my abilities )?only while I'm at a battlefield\.?$/i, () => { limit.atBf = true; return ''; });
    body = body.replace(/\s*Use only once per turn\.?$|\s*Use only once each turn\.?$/i, () => { limit.once = true; return ''; });
    body = body.replace(/\s*Use only to play spells\.?$/i, () => { limit.spendOn = 's'; return ''; });
    body = body.replace(/\s*Use only to play gear or use gear abilities\.?$/i, () => { limit.spendOn = 'g'; return ''; });
    body = body.replace(/\s*Spend this Energy only during showdowns\.?$/i, () => { limit.spendOn = 'showdown'; return ''; });
    body = body.replace(/\s*Spend this Energy only to play units or activated abilities of units\.?$/i, () => { limit.spendOn = 'u'; return ''; });
    body = body.replace(/\s*Use only if you've played an Equipment this turn\.?$/i, () => { limit.playedEq = true; return ''; });
    let mmm;
    if ((mmm = body.match(/\s*Use only if you've chosen enemy units and\/or gear twice this turn with spells or unit abilities\.?$/i))) { limit.chose2 = true; body = body.slice(0, mmm.index); }
    const ctx = { kind: 'act', card };
    let eff;
    if ((mmm = body.match(/^Pay any amount of (Energy|\{power:any\}) to \[Add\] that much (\{power:any\}|Energy)\.?$/i))) eff = [E('addX', { from: /energy/i.test(mmm[1]) ? 'e' : 'p' })];
    else eff = parseEffects(body, ctx);
    return withGate({ kind: 'act', cost, speed: sp || (eff.length && eff.every((x) => x.op === 'add') ? 'R' : null), eff, limit });
  }
  // spell body
  if (card.t === 's' && !granted) {
    if (speed && !line.replace(/\s/g, '')) { kw.speed = speed; return null; }
    if (speed) kw.speed = speed;
    const ctx = { kind: 'spell', card };
    // spell statics
    try { const st = parseStatic(line, card); if (st && ['costLess', 'extraCost'].includes((Array.isArray(st) ? st[0] : st).s)) return withGate(st); } catch (e) { if (!(e instanceof Unparsed)) throw e; }
    if ((m = line.match(/^Choose one(?: you haven't already chosen)? —(.+)$/i))) {
      const opts = m[1].split(/\.(?=[A-Z\[{])/).map((x) => x.trim()).filter(Boolean).map((o) => parseEffects(o, ctx));
      return withGate({ kind: 'spell', eff: [E('oneOf', { opts })] });
    }
    if (/^This can't be countered$/i.test(line.replace(/\.$/, ''))) { kw.uncounterable = true; return null; }
    return withGate({ kind: 'spell', eff: parseEffects(line, ctx) });
  }
  // statics
  const st = parseStatic(line, card);
  return withGate(st);
}

// ---------- run ----------
if (require.main === module) {
  const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cards.json'), 'utf8'));
  const prog = {}; const cover = {};
  const why = new Map();
  let full = 0, partial = 0, none = 0, vanilla = 0;
  for (const [id, c] of Object.entries(cards)) {
    if (c.t === 'r') continue;
    let r;
    try { r = compileCard(c); } catch (e) { console.error('CRASH', id, e.stack); process.exit(1); }
    prog[id] = { kw: r.kw, ab: r.ab, eq: r.eq };
    cover[id] = r.cover;
    if (r.cover.total === 0) vanilla++; else if (r.cover.parsed === r.cover.total) full++; else if (r.cover.parsed) partial++; else none++;
    for (const u of r.cover.unparsed) { const k = u.why.replace(/\d+/g, 'N').slice(0, 90); why.set(k, (why.get(k) || 0) + 1); }
  }
  fs.writeFileSync(path.join(ROOT, 'data/prog.json'), JSON.stringify(prog));
  fs.writeFileSync(path.join(ROOT, 'data/cover.json'), JSON.stringify(cover));
  const n = full + partial + none + vanilla;
  console.log(`cards ${n}: fully automatic ${full + vanilla} (${Math.round(100 * (full + vanilla) / n)}%), partial ${partial}, not parsed ${none}`);
  const lines = Object.values(cover).reduce((a, c) => a + c.total, 0), ok = Object.values(cover).reduce((a, c) => a + c.parsed, 0);
  console.log(`ability lines ${lines}: parsed ${ok} (${Math.round(100 * ok / lines)}%)`);
  if (process.argv.includes('--why')) { const top = [...why.entries()].sort((a, b) => b[1] - a[1]).slice(0, +(process.argv[process.argv.indexOf('--why') + 1]) || 60); for (const [k, v] of top) console.log(v, k); }
}
module.exports = { compileCard, parseEffects, parseSel, parseCond, Unparsed };

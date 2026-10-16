# Riftbound Sparring

A practice table for the Riftbound TCG: build or pick a deck, hand the AI a deck, and play a full game in your browser. Works on computers and phones (turn the phone sideways).

**Play:** https://jacksonhodges4507-crypto.github.io/riftbound-sparring/

- Every released card (Origins through the Radiance preview) is in the deck builder and plays by its printed text.
- Built-in decks: RQ Los Angeles Top 8 and best finish for each legend, plus earlier tournament lists.
- The built-in AI runs in the browser, free and offline. A Claude opponent is optional and uses your own API key, which stays in your browser.

## Working on it

- `src/` — the rules engine (`core`, `state`, `fx`, `play`), the AI (`ai.js`), hand-written card programs (`hand.js`, `cards.js`) and the page (`ui.js`, `ui.css`, plus `ui.html`).
- `tools/compile.js` turns card text into programs (`data/prog.json`); `data/cards.json` is the card database; `data/decks.json` holds the built-in decks.
- `python3 build.py` rebuilds the single-file app. Copy `Riftbound Sparring.html` to `index.html` to publish.
- Tests: `node test/cards.test.js`, `node test/decks.test.js`, and the card fuzzers in `tools/`.

Found a card that doesn't work as printed? Open an issue with the card name and what happened.

# Barra Alsalfah Web — Build Tasks

Read `PRD.md` first for context. This file is the execution plan. Work
through milestones **in order**, and don't start a milestone until the
previous one's "Definition of Done" checklist passes.

---

## 0. Non-negotiable constraints (read before writing any code)

- **No build step.** Plain HTML/CSS/JS only. No React/Vue/Vite/webpack, no
  TypeScript, no npm dependencies of any kind.
- **No `fetch()` for local data.** Opening `index.html` directly via
  `file://` blocks `fetch()` of local files by browser security policy. All
  category data must be a plain JS object/array literal inside a `<script>`
  file (e.g. `data.js`), loaded with a normal `<script src="data.js"></script>`
  tag (not `type="module"`, to avoid CORS issues under `file://`).
- **Must run by double-clicking `index.html`.** No terminal, no server, no
  install step required for the end user. (A one-line static-server command
  can be mentioned as an optional alternative in a short `README.md`, but it
  must not be required.)
- **Everything in Arabic, RTL** (`<html lang="ar" dir="rtl">`).
- Single shared device, pass-around style. No networking code at all.

## 1. File structure

```
/barra-alsalfah-web
  index.html
  styles.css
  data.js       # category data + tunable constants
  app.js        # all game logic + rendering
  README.md     # 3 lines: how to open it, that's it
```

Keep it to these files. Don't split into more modules — this keeps it easy
for a non-technical person to understand what exists.

---

## 2. Design system (use exactly these tokens — do not substitute defaults)

### Color tokens
| Name | Hex | Use |
|---|---|---|
| Midnight Plum | `#201933` | App background |
| Deep Plum | `#2E2350` | Cards / surfaces |
| Flame Coral | `#FF5A5F` | Primary buttons / primary actions |
| Mint Pop | `#2DD4A7` | "Informed" role, success states, positive score |
| Golden Sand | `#FFB648` | "Out" role, highlights, warnings |
| Cloud White | `#F7F3ED` | Primary text on dark surfaces |
| Muted Lilac | `#9E93C2` | Secondary/help text |

Light mode: invert to a warm off-white background (`#F7F3ED`) with Midnight
Plum text, keep Flame Coral / Mint Pop / Golden Sand as accents unchanged.

### Type tokens
- Headings/display: **"Changa"** (Google Fonts, bold weights, full Arabic
  support) — used for game title, role reveal text, big round numbers.
- Body/UI: **"Tajawal"** (Google Fonts) — used for everything else.
- Do not use a generic uppercase "eyebrow" label above headings. Do not bold
  or color a single word inside a heading for emphasis — style the whole
  line intentionally instead.

### Layout & motion
- Mobile-first: one full-screen "step" visible at a time (setup → reveal →
  discuss → vote → results), not a scrolling long page.
- Large tap targets (min 48px height) everywhere — this is used mid-party,
  often in a dim room.
- Signature visual element: a **flip/reveal card** for the role reveal
  moment (tap card → it flips to show role + item). This is the one
  deliberate animated moment in the app — keep everything else (button
  hovers, screen transitions) quick and understated, not "fade-slide-up on
  every element."
- No identical rounded "SaaS cards" with the same soft grey shadow
  everywhere — the reveal card should look distinct from ordinary
  buttons/containers.
- Respect `prefers-reduced-motion`.
- Visible keyboard focus states on all interactive elements.

---

## 3. Data model

`data.js` exports (as plain global consts, no ES modules):

```js
const CATEGORIES = [
  {
    id: "anime",
    label: "أنمي",
    items: ["ناروتو", "ون بيس", "هجوم العمالقة", /* 12–15 total */]
  },
  { id: "food", label: "أكل", items: [ /* ... */ ] },
  { id: "desserts", label: "حلويات", items: [ /* ... */ ] },
  { id: "drinks", label: "مشروبات", items: [ /* ... */ ] },
  { id: "cartoons", label: "كرتون قديم", items: [ /* ... */ ] },
  { id: "series", label: "مسلسلات", items: [ /* ... */ ] },
  { id: "kpop", label: "كيبوب", items: [ /* ... */ ] },
  { id: "games", label: "ألعاب فيديو", items: [ /* ... */ ] },
  { id: "produce", label: "فواكه وخضار", items: [ /* ... */ ] },
  {
    id: "spy",
    label: "جاسوس (أماكن)",
    items: ["مستشفى", "مدرسة", "مطار", "ملعب", /* 12–15 total */]
  }
];

const GAME_DEFAULTS = {
  minPlayers: 3,
  maxPlayers: 10,
  outPlayersDefault: 1,
  outPlayersMaxThreshold: 6, // players >= this to allow choosing 2 "out"
  discussionSeconds: 180,
  scoring: {
    correctVote: 1,
    outEscaped: 2,
    outGuessedItemBonus: 1
  }
};
```

Each category needs **12–15 real items**, in Arabic, matching the examples
already gathered from the original app (anime: Naruto/One Piece/Attack on
Titan/etc.; food: Shawarma/Burger/Kabsah/etc.; K-pop: BTS/BLACKPINK/EXO/etc.;
spy category uses **places**, not objects).

---

## 4. Core algorithms (implement exactly this logic)

### 4.1 Category + item sampling (fixes "big category dominates" bug)
```
function pickSecretItem(selectedCategoryIds, usedItemsSet):
    repeat:
        categoryId = uniformRandomChoice(selectedCategoryIds)   // step 1: equal weight per category
        item = uniformRandomChoice(CATEGORIES[categoryId].items) // step 2: item within it
        key = categoryId + ":" + item
        if key not in usedItemsSet: 
            add key to usedItemsSet
            return { categoryId, item }
        // if every combination across all selected categories is now used,
        // clear usedItemsSet (reset the pool) and try again, show a subtle
        // "reshuffled" note to the host — do not error out.
```

### 4.2 "Out" player selection (fairness across rounds)
Maintain `outCount[playerId] = 0` for the session.
```
function pickOutPlayers(players, numOut):
    sorted = players sorted by outCount ascending, ties broken randomly
    chosen = first numOut players from sorted
    for p in chosen: outCount[p] += 1
    return chosen
```

### 4.3 Turn-order engine ("smart question distribution")
This produces a **speaking/asking order** for the discussion phase — not
question text.

Maintain per session-round: `askCount[playerId] = 0`, `answerCount[playerId] = 0`,
`lastPair = null`.

```
function buildTurnOrder(players, totalTurns):
    order = []
    for i in 1..totalTurns:
        askCandidates = players sorted by askCount ascending (random tiebreak)
        asker = first candidate in askCandidates such that
                asker != order[-1].asker if possible (avoid same asker twice in a row)
        answerCandidates = (players - asker) sorted by answerCount ascending (random tiebreak)
        answerer = first candidate such that (asker, answerer) != lastPair if possible
        askCount[asker] += 1
        answerCount[answerer] += 1
        lastPair = (asker, answerer)
        order.push({ asker, answerer })
    return order
```
`totalTurns` default = `players.length * 2` (configurable constant).

**Required self-check (write this as an actual test in `app.js` or a
`console.assert` block you run once during dev, then remove or leave behind
a `debugSimulateFairness()` function):** simulate 100 rounds with a fixed
player count (try 4, 6, 8) and confirm
`max(askCount) - min(askCount) <= 1` and `max(answerCount) - min(answerCount) <= 1`
at the end of each simulated round.

### 4.4 Voting & scoring
- Collect one private vote per player (see 4.5 for UI flow).
- Tally votes. If one player (or exact tied group matching `numOut`) has
  strictly the most votes and it matches the number of out-players expected,
  compare to the real out-player(s).
- If the top-voted player(s) match the real "out" set → those correct voters
  get `+1` each (`scoring.correctVote`).
- Any real "out" player NOT identified by the top vote → `+2`
  (`scoring.outEscaped`).
- After reveal, ask each "out" player (in the results screen) whether they
  want to guess the secret item; correct guess → `+1` bonus
  (`scoring.outGuessedItemBonus`), independent of whether they were caught.
- **Tie in votes** (no clear top player/group) → nobody is eliminated that
  round, no `correctVote` points awarded, but `outEscaped` still applies to
  all real out-players.

### 4.5 Privacy flow (single shared device)
Both the reveal phase and the voting phase use this pattern:
```
for each player in players (reveal) / players (vote):
    show a neutral "cover" screen: "مرر الجهاز لـ <player name> — اضغط لما توصلك"
    player taps "جاهز" -> reveals their role/vote UI
    player taps "تم" -> immediately returns to a neutral cover screen
       (never leave a role/vote screen visible without an explicit action)
```
This prevents the next/previous player from glimpsing sensitive info during
hand-off.

---

## 5. Milestones

### M0 — Project skeleton
- [ ] Create the 4 files listed in section 1.
- [ ] `index.html` boots to a title screen with the game name, big "start"
      button, and correct `lang="ar" dir="rtl"`.
- [ ] Google Fonts (`Changa`, `Tajawal`) linked in `<head>`.
- [ ] Confirm the whole thing opens correctly via double-click on
      `index.html` with **no console errors** (check by opening dev tools).

**Done when:** blank-but-styled title screen works offline (after first
font load) with zero setup.

### M1 — Data layer
- [ ] Fill in `data.js` with all 10 categories, 12–15 items each, plus
      `GAME_DEFAULTS`.
- [ ] Implement `pickSecretItem()` exactly per section 4.1, with the
      used-items reset behavior.

**Done when:** calling `pickSecretItem()` in the console 200 times across 3
selected categories never crashes, and roughly balances across categories
(spot-check counts, not exact).

### M2 — Setup screen
- [ ] Add/remove player name inputs, enforce 3–10 players.
- [ ] Multi-select category cards (tap to toggle, at least 1 required).
- [ ] Choose number of "out" players: 1 by default; only show the option
      for 2 when player count ≥ `outPlayersMaxThreshold`.
- [ ] Discussion timer length input (default from `GAME_DEFAULTS`).
- [ ] Persist this setup to `localStorage` and reload it on next visit.

**Done when:** a host can configure a full game and it survives a page
refresh.

### M3 — Game engine
- [ ] Implement `pickOutPlayers()` per 4.2.
- [ ] Implement `buildTurnOrder()` per 4.3, plus the fairness self-check
      described there — run it and paste/keep evidence it passes.
- [ ] Wire setup screen "Start" button to produce: selected secret item,
      out-player set, and turn order for round 1.

**Done when:** the fairness self-check passes for 4/6/8 simulated players.

### M4 — Reveal & Discussion screens
- [ ] Build the pass-the-device cover-screen pattern (4.5) for role reveal.
- [ ] Build the flip/reveal card as the signature animated moment (section
      2, layout & motion).
- [ ] "Informed" players see the secret item; "out" player(s) see only that
      they are out (no item).
- [ ] After all reveals, show the discussion screen: turn order list +
      optional countdown timer (start/pause/reset).

**Done when:** you can click through reveal for 5 fake players without any
player's info visibly leaking on the cover screens.

### M5 — Voting & Results
- [ ] Build the pass-the-device cover-screen pattern for private voting.
- [ ] Tally votes, apply the scoring rules in 4.4, handle the tie case.
- [ ] Results screen: reveal true out-player(s) + secret item, show who
      scored what this round, show updated running scoreboard.
- [ ] "Next Round" (new item/out-players, same players & scoreboard) vs.
      "New Game" (clears scoreboard, returns to setup) as two distinct
      buttons.

**Done when:** a full round — setup → reveal → discuss → vote → results —
completes with correct scoring for at least 3 manually tested scenarios
(clear winner, tie, out-player guesses item correctly).

### M6 — Polish & responsiveness
- [ ] Test and fix layout at 375px (phone), 768px (tablet), 1440px
      (laptop) widths.
- [ ] Light/dark mode toggle, remembered in `localStorage`.
- [ ] `prefers-reduced-motion` respected; visible focus states on all
      interactive elements.
- [ ] Write the 3-line `README.md`: "Open `index.html` in any browser.
      That's it. (Optional: run `npx serve .` if double-click doesn't work
      on your OS.)"
- [ ] Final pass against the "AI slop" checklist below.

**Done when:** all boxes above are checked and the app has been clicked
through start-to-finish on at least a phone-sized viewport.

---

## 6. "Don't look AI-generated" checklist (check before calling it done)

- [ ] No warm-cream background + terracotta/orange accent combo.
- [ ] No near-black background with a single neon accent as the *entire*
      palette.
- [ ] No identical rounded cards with the same soft grey drop-shadow used
      for every single container regardless of importance.
- [ ] No tracked-out ALL-CAPS "eyebrow" labels above headings.
- [ ] No arrow (`→`) tacked onto button/link text.
- [ ] No numbered `01 / 02 / 03` markers unless the content is genuinely a
      sequence.
- [ ] Only one deliberate animated moment (the reveal flip) — not
      fade-and-slide-up on every section.

---

## 7. Nice-to-haves (only after M0–M6 are fully done)
- [ ] Sound/haptic cue on reveal and when the timer ends.
- [ ] Per-category custom icon/illustration instead of plain text label.
- [ ] "Spy" category special UI (place-based, matches the original app's
      spy sub-mode).
- [ ] Export/share the final scoreboard as an image.

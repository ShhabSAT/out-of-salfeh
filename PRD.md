# Barra Alsalfah (برا السالفة) — Web App PRD

## 1. Summary
A responsive, browser-based party game inspired by "Barrah Alsalfah" by Table
Knight Games. Played by 3–10 people sharing **one device** that gets passed
around (no accounts, no backend, no internet required after first load except
for Google Fonts).

## 2. Goals
- Playable **tonight** with zero setup friction — no build tools, no
  `npm install`, no server required.
- Feels premium and fun, not like a generic/templated AI-made app.
- Turn order and "who is out" selection are provably fair over a session.
- Host can select **multiple categories at once** for one merged round pool.

## 3. Non-Goals (out of scope for v1)
- Online/remote multiplayer (separate devices, rooms, sockets).
- Accounts, backend, payments, analytics.
- Any language other than Arabic (RTL only).
- Auto-generated question *text*. The app manages **turn order only** —
  players still improvise their own real questions out loud.

## 4. Core Game Loop
1. **Setup** — add 3–10 player names, pick one or more categories, choose
   number of "out" players (1, or optionally 2 if players ≥ 6), set a
   discussion timer length.
2. **Secret Reveal** — device is passed to each player in turn. Tap to reveal
   your own role (+ the secret item, if you're "informed"), tap again to hide
   it before passing to the next player. A neutral cover screen sits between
   each player's turn.
3. **Discussion** — app shows a fair, algorithm-generated speaking/question
   order, with an optional countdown timer.
4. **Secret Voting** — device passed again, one player at a time, behind a
   cover screen, each casts a private vote.
5. **Results** — reveal the true "out" player(s), tally votes, award points,
   update the scoreboard.
6. **Next Round** (keeps scoreboard) or **New Game** (resets everything).

## 5. Feature List
- Multi-category selection, merged fairly into one round pool (category
  chosen first with equal weight, then an item inside it — so a big category
  doesn't dominate a small one).
- Session-level anti-repeat: no secret item repeats until its pool is fully
  used, then it reshuffles.
- Fair, weighted round-robin **turn-order algorithm** (full spec in
  `tasks.md`).
- Fairness tracking for who gets picked as "out" across rounds, so the same
  person isn't picked every time unless unavoidable.
- Hide/reveal + "pass the phone" cover screens for both role-reveal and
  voting, so nobody accidentally sees another player's screen.
- Configurable discussion timer.
- Running scoreboard across rounds, resettable.
- Setup (players / categories / timer / theme) remembered via
  `localStorage`.
- Fully responsive: phone, tablet, laptop.
- Arabic, right-to-left throughout. Playful, modern, non-generic visual
  identity (see Design Direction).
- Light / dark mode.

## 6. Design Direction (summary — full tokens in tasks.md)
- **Vibe:** a playful late-night hangout game show — not a generic SaaS
  dashboard, not a bare "AI default" look.
- **Palette:** deep plum background, warm coral for primary actions, mint for
  "informed" states, golden sand for "out" states, off-white text.
- **Type:** one bold, characterful Arabic display face for headings + one
  clean, highly legible Arabic face for body/UI text.
- **Motion:** one deliberate flip/reveal animation as the signature moment;
  minimal motion elsewhere; large, thumb-friendly tap targets.

## 7. Tech Stack
Plain **HTML + CSS + vanilla JavaScript**. No framework, no bundler, no
`npm install`. Category data lives inline in a `.js` file (not fetched as
JSON) so the app works by simply double-clicking `index.html` — no local
server needed.

## 8. Assumptions Made (flag if any should change)
- Single shared device, pass-around style — not remote/online multiplayer.
- "Smart question distribution" = a fair turn-order engine, not
  AI-generated question content.
- Default scoring (editable in code, one constant block):
  - Each "informed" player who votes for an actual "out" player: **+1**.
  - Each "out" player who escapes being voted out: **+2**.
  - An "out" player who correctly guesses the secret item: **+1** bonus
    (stacks even if also caught).
  - A tied vote = nobody is eliminated that round.

## 9. Success Criteria
- Runs on a phone browser tonight with zero installation — open one file.
- A non-programmer host can start it without any terminal commands.
- Turn order and "out" player selection are demonstrably fair (see the
  simulation check in `tasks.md`).
- Visual design reads as a distinct, intentional identity — not a
  recognizable AI-generated template.

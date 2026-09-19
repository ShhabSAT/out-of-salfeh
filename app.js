/* ==========================================================================
   برا السالفة — app bootstrap + rendering
   Plain vanilla JS. No modules, no build step.
   ========================================================================== */

const APP_VERSION = "1.0.0";

const STORAGE_KEYS = {
  setup: "barra.setup.v1",
  theme: "barra.theme.v1",
};

function defaultSetup() {
  return {
    names: ["", "", ""],
    categoryIds: [],
    numOut: GAME_DEFAULTS.outPlayersDefault,
    discussionSeconds: GAME_DEFAULTS.discussionSeconds,
  };
}

const state = {
  screen: "title",
  theme: "dark",
  setup: defaultSetup(),
};

let root = null;

/* --------------------------------------------------------------------------
   Small utilities
   -------------------------------------------------------------------------- */

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function el(html) {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

function randomChoice(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function shuffle(list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/* --------------------------------------------------------------------------
   Secret item sampling (tasks.md 4.1)
   Two-step draw so a large category never dominates a small one: first a
   category with equal weight, then an item inside it. Anti-repeat across the
   session via a used-items set; when the whole pool is exhausted it resets
   (reshuffles) instead of erroring.
   -------------------------------------------------------------------------- */

function hasAvailableItem(categories, usedItemsSet) {
  return categories.some((category) =>
    category.items.some((item) => !usedItemsSet.has(category.id + ":" + item))
  );
}

function pickSecretItem(selectedCategoryIds, usedItemsSet) {
  const categories = selectedCategoryIds
    .map((id) => CATEGORY_BY_ID[id])
    .filter(Boolean);

  if (categories.length === 0) {
    throw new Error("pickSecretItem: no valid categories selected");
  }

  let reshuffled = false;
  if (!hasAvailableItem(categories, usedItemsSet)) {
    usedItemsSet.clear();
    reshuffled = true;
  }

  let categoryId;
  let item;
  let key;
  do {
    const category = randomChoice(categories);
    categoryId = category.id;
    item = randomChoice(category.items);
    key = categoryId + ":" + item;
  } while (usedItemsSet.has(key));

  usedItemsSet.add(key);

  return {
    categoryId,
    categoryLabel: CATEGORY_BY_ID[categoryId].label,
    item,
    reshuffled,
  };
}

/* --------------------------------------------------------------------------
   Theme
   -------------------------------------------------------------------------- */

function loadTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEYS.theme);
  } catch (err) {
    saved = null;
  }
  if (saved === "light" || saved === "dark") {
    state.theme = saved;
  } else if (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: light)").matches
  ) {
    state.theme = "light";
  }
  applyTheme();
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", state.theme === "light" ? "#F7F3ED" : "#201933");
  }
}

function toggleTheme() {
  state.theme = state.theme === "light" ? "dark" : "light";
  try {
    localStorage.setItem(STORAGE_KEYS.theme, state.theme);
  } catch (err) {
    /* storage unavailable — theme simply won't persist */
  }
  applyTheme();
  render();
}

/* --------------------------------------------------------------------------
   Toast
   -------------------------------------------------------------------------- */

let toastTimer = null;

function showToast(message) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  if (toastTimer) clearTimeout(toastTimer);

  const node = el(
    `<div class="toast" role="status"><div class="toast__inner">${escapeHtml(
      message
    )}</div></div>`
  );
  document.body.appendChild(node);
  toastTimer = setTimeout(() => node.remove(), 2600);
}

/* --------------------------------------------------------------------------
   Top bar + screens
   -------------------------------------------------------------------------- */

function themeButton() {
  const label = state.theme === "light" ? "الوضع الليلي" : "الوضع النهاري";
  const icon = state.theme === "light" ? "🌙" : "☀️";
  return `<button class="btn btn--icon" data-action="toggle-theme" aria-label="${label}" title="${label}">${icon}</button>`;
}

function topbar({ title, right = "" } = {}) {
  return `
    <header class="topbar">
      <div class="topbar__side">${themeButton()}</div>
      <div class="topbar__title">${escapeHtml(title || "برا السالفة")}</div>
      <div class="topbar__side">${right}</div>
    </header>
  `;
}

function screenTitle() {
  return el(`
    <section class="screen">
      ${topbar({ title: "برا السالفة" })}
      <div class="hero">
        <h1 class="hero__mark">
          <span>برا</span>
          <span>السالفة</span>
        </h1>
        <div class="hero__rule"></div>
        <p class="hero__tag">
          لعبة جماعية على جهاز واحد: سوّالفة، أسئلة، وتصويت سري.
          واحد فيكم برا السالفة… اكتشفوه قبل لا يفوت الوقت.
        </p>
        <div class="hero__meta">
          <span class="chip">٣ – ١٠ لاعبين</span>
          <span class="chip">جهاز واحد</span>
          <span class="chip">بدون إنترنت</span>
        </div>
      </div>
      <button class="btn btn--primary btn--lg btn--block" data-action="go-setup">
        ابدأ اللعب
      </button>
    </section>
  `);
}

/* --------------------------------------------------------------------------
   Setup persistence
   -------------------------------------------------------------------------- */

function padTo(list, min) {
  const copy = list.slice();
  while (copy.length < min) copy.push("");
  return copy;
}

function loadSetup() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEYS.setup);
  } catch (err) {
    raw = null;
  }
  if (!raw) return;

  let saved = null;
  try {
    saved = JSON.parse(raw);
  } catch (err) {
    return;
  }
  if (!saved || typeof saved !== "object") return;

  const names = Array.isArray(saved.names)
    ? saved.names
        .slice(0, GAME_DEFAULTS.maxPlayers)
        .map((name) => (typeof name === "string" ? name : ""))
    : null;

  const validIds = Array.isArray(saved.categoryIds)
    ? saved.categoryIds.filter((id) => CATEGORY_BY_ID[id])
    : [];

  const seconds = Number(saved.discussionSeconds);
  const numOut = Number(saved.numOut);

  state.setup = {
    names:
      names && names.length >= GAME_DEFAULTS.minPlayers
        ? padTo(names, GAME_DEFAULTS.minPlayers)
        : defaultSetup().names,
    categoryIds: validIds,
    numOut: numOut === 2 ? 2 : 1,
    discussionSeconds:
      Number.isFinite(seconds) && seconds >= 0
        ? seconds
        : GAME_DEFAULTS.discussionSeconds,
  };
}

function saveSetup() {
  try {
    localStorage.setItem(STORAGE_KEYS.setup, JSON.stringify(state.setup));
  } catch (err) {
    /* storage unavailable — config simply won't persist */
  }
}

/* --------------------------------------------------------------------------
   Setup helpers
   -------------------------------------------------------------------------- */

function filledNames() {
  return state.setup.names.map((name) => name.trim()).filter(Boolean);
}

function playerCount() {
  return state.setup.names.length;
}

function canChooseTwoOut() {
  return filledNames().length >= GAME_DEFAULTS.outPlayersMaxThreshold;
}

function setupIsValid() {
  const count = filledNames().length;
  return (
    count >= GAME_DEFAULTS.minPlayers &&
    count <= GAME_DEFAULTS.maxPlayers &&
    state.setup.categoryIds.length >= 1
  );
}

function captureSetupForm() {
  document.querySelectorAll('[data-field="player-name"]').forEach((input) => {
    const index = Number(input.dataset.index);
    if (!Number.isNaN(index)) state.setup.names[index] = input.value;
  });
  const minutes = document.querySelector('[data-field="discussion-minutes"]');
  if (minutes) {
    const value = Number(minutes.value);
    state.setup.discussionSeconds = Number.isFinite(value)
      ? Math.max(0, Math.min(15, value)) * 60
      : GAME_DEFAULTS.discussionSeconds;
  }
}

/* --------------------------------------------------------------------------
   Setup screen
   -------------------------------------------------------------------------- */

function playerRow(name, index) {
  const removable = playerCount() > GAME_DEFAULTS.minPlayers;
  return `
    <div class="player-row">
      <span class="player-row__num" aria-hidden="true">${index + 1}</span>
      <input
        class="input"
        type="text"
        data-field="player-name"
        data-index="${index}"
        value="${escapeHtml(name)}"
        placeholder="اسم اللاعب"
        maxlength="20"
        autocomplete="off"
        aria-label="اسم اللاعب ${index + 1}"
      />
      <button
        class="btn btn--danger btn--icon"
        data-action="player-remove"
        data-index="${index}"
        aria-label="حذف اللاعب ${index + 1}"
        ${removable ? "" : "disabled"}
      >✕</button>
    </div>
  `;
}

function categoryCard(category) {
  const selected = state.setup.categoryIds.includes(category.id);
  return `
    <button
      type="button"
      class="category-card"
      data-action="toggle-category"
      data-id="${category.id}"
      aria-pressed="${selected}"
    >
      ${escapeHtml(category.label)}
      <span class="category-card__count">${category.items.length} عنصر</span>
    </button>
  `;
}

function outSegmented() {
  const two = canChooseTwoOut();
  return `
    <div class="segmented" role="group" aria-label="عدد اللاعبين خارج السالفة">
      <button type="button" data-action="out-set" data-value="1" aria-pressed="${
        state.setup.numOut === 1
      }">واحد</button>
      <button type="button" data-action="out-set" data-value="2" aria-pressed="${
        state.setup.numOut === 2
      }" ${two ? "" : "disabled"}>اثنين</button>
    </div>
  `;
}

function screenSetup() {
  const view = el(`
    <section class="screen screen--wide">
      ${topbar({
        title: "تجهيز اللعبة",
        right: `<button class="btn btn--icon" data-action="go-title" aria-label="رجوع">↩</button>`,
      })}
      <div class="panel">
        <div class="panel__head">
          <h2 class="panel__title">اللاعبون</h2>
          <p class="panel__hint">
            من ٣ إلى ١٠ لاعبين، وكلهم يشاركون نفس الجهاز.
            <span id="player-count"></span>
          </p>
        </div>
        <div class="players" id="players-list">
          ${state.setup.names.map(playerRow).join("")}
        </div>
        <button class="btn btn--outline btn--block" data-action="player-add">
          + أضف لاعب
        </button>
      </div>

      <div class="panel">
        <div class="panel__head">
          <h2 class="panel__title">الفئات</h2>
          <p class="panel__hint">اختر فئة أو أكثر — تُدمج كلها في جولة واحدة.</p>
        </div>
        <div class="category-grid">
          ${CATEGORIES.map(categoryCard).join("")}
        </div>
      </div>

      <div class="panel">
        <div class="panel__head">
          <h2 class="panel__title">إعدادات الجولة</h2>
        </div>
        <div class="field">
          <span class="field__label">كم واحد برا السالفة؟</span>
          ${outSegmented()}
        </div>
        <div class="field">
          <label class="field__label" for="discussion-minutes">مدة النقاش (دقائق)</label>
          <input
            class="input"
            id="discussion-minutes"
            type="number"
            data-field="discussion-minutes"
            min="0"
            max="15"
            step="1"
            value="${Math.round(state.setup.discussionSeconds / 60)}"
          />
          <span class="field__hint">اكتب ٠ لإلغاء المؤقت.</span>
        </div>
      </div>

      <button
        id="start-round"
        class="btn btn--primary btn--lg btn--block"
        data-action="start-round"
      >
        يلا نبدأ
      </button>
    </section>
  `);
  return view;
}

function refreshSetupControls() {
  const count = filledNames().length;
  const countEl = document.getElementById("player-count");
  if (countEl) countEl.textContent = `(${count} جاهزين)`;

  const twoDisabled = !canChooseTwoOut();
  const twoBtn = document.querySelector('[data-action="out-set"][data-value="2"]');
  if (twoBtn) {
    twoBtn.disabled = twoDisabled;
    if (twoDisabled && state.setup.numOut === 2) {
      state.setup.numOut = 1;
      const oneBtn = document.querySelector('[data-action="out-set"][data-value="1"]');
      if (oneBtn) oneBtn.setAttribute("aria-pressed", "true");
      twoBtn.setAttribute("aria-pressed", "false");
    }
  }

  const startBtn = document.getElementById("start-round");
  if (startBtn) startBtn.disabled = !setupIsValid();
}

/* --------------------------------------------------------------------------
   Game engine (tasks.md 4.2 + 4.3)
   -------------------------------------------------------------------------- */

function orderByCount(players, counts) {
  /* shuffle first, then stable-sort by count => random tie-break */
  return shuffle(players).sort(
    (a, b) => (counts[a.id] || 0) - (counts[b.id] || 0)
  );
}

function pickOutPlayers(players, numOut) {
  const count = Math.max(1, Math.min(numOut, players.length - 1));
  const sorted = shuffle(players).sort((a, b) => a.outCount - b.outCount);
  const chosen = sorted.slice(0, count);
  chosen.forEach((player) => {
    player.outCount += 1;
  });
  return chosen;
}

function buildTurnOrder(players, totalTurns, counters) {
  const count = players.length;
  const order = [];
  if (count < 2 || totalTurns <= 0) return order;

  /* Fair, weighted round-robin.
     The spec's raw greedy (pick min-ask, then min-answer excluding the
     asker) can drift: a player who is simultaneously the unique min in
     both counters is forced to ask at the exact moment they should
     answer, which leaves max-min = 2. Instead we arrange the players in
     a ring (least-used askers lead each pass, random tie-break) and have
     turn i ask while the NEXT player in the ring answers. Over any pass
     every player asks once and answers once, so both spreads stay <= 1
     by construction — and no asker ever repeats back-to-back, and no
     asker/answer pair immediately repeats. */
  let ring = [];
  let lastAsker = null;
  let lastPair = null;

  for (let i = 0; i < totalTurns; i++) {
    const offset = i % count;
    if (offset === 0) {
      ring = orderByCount(players, counters.ask);
      /* don't open a pass with the same person who just asked */
      if (lastAsker && ring[0].id === lastAsker && count > 2) {
        const swap = ring.findIndex((p) => p.id !== lastAsker);
        [ring[0], ring[swap]] = [ring[swap], ring[0]];
      }
      /* don't immediately repeat the exact same asker/answer pair */
      if (
        lastPair &&
        count > 3 &&
        ring[0].id === lastPair.asker &&
        ring[1].id === lastPair.answerer
      ) {
        [ring[1], ring[2]] = [ring[2], ring[1]];
      }
    }

    const asker = ring[offset];
    const answerer = ring[(offset + 1) % count];

    counters.ask[asker.id] = (counters.ask[asker.id] || 0) + 1;
    counters.answer[answerer.id] = (counters.answer[answerer.id] || 0) + 1;
    lastAsker = asker.id;
    lastPair = { asker: asker.id, answerer: answerer.id };
    order.push({ asker: asker.id, answerer: answerer.id });
  }

  return order;
}

function debugSimulateFairness(playerCounts, rounds) {
  const sizes = playerCounts || [4, 6, 8];
  const runs = rounds || 100;
  return sizes.map((size) => {
    const players = Array.from({ length: size }, (_, i) => ({
      id: "p" + i,
      outCount: 0,
    }));
    const counters = { ask: {}, answer: {} };
    let passed = true;
    let worstAsk = 0;
    let worstAnswer = 0;

    for (let r = 0; r < runs; r++) {
      buildTurnOrder(
        players,
        size * GAME_DEFAULTS.turnsPerPlayer,
        counters
      );
      const askValues = players.map((p) => counters.ask[p.id] || 0);
      const answerValues = players.map((p) => counters.answer[p.id] || 0);
      const askSpread = Math.max(...askValues) - Math.min(...askValues);
      const answerSpread =
        Math.max(...answerValues) - Math.min(...answerValues);
      worstAsk = Math.max(worstAsk, askSpread);
      worstAnswer = Math.max(worstAnswer, answerSpread);
      if (askSpread > 1 || answerSpread > 1) passed = false;
    }

    return { players: size, rounds: runs, passed, worstAsk, worstAnswer };
  });
}

function runFairnessSelfCheck() {
  const results = debugSimulateFairness([4, 6, 8], 100);
  const allPassed = results.every((r) => r.passed);
  if (allPassed) {
    console.info(
      "[برا السالفة] فحص العدالة نجح:",
      results
        .map(
          (r) =>
            `${r.players} لاعبين (فرق الأسنان ${r.worstAsk}/${r.worstAnswer})`
        )
        .join("، ")
    );
  } else {
    console.error("[برا السالفة] فحص العدالة فشل:", results);
  }
  return allPassed;
}

/* --------------------------------------------------------------------------
   Round lifecycle
   -------------------------------------------------------------------------- */

function startGame() {
  captureSetupForm();
  saveSetup();
  if (!setupIsValid()) {
    showToast("كمّل الأسماء واختر فئة أولاً");
    return;
  }

  const names = filledNames();
  state.game = {
    players: names.map((name, index) => ({
      id: "p" + index,
      name,
      score: 0,
      outCount: 0,
    })),
    round: 1,
    secret: null,
    outIds: [],
    turnOrder: [],
    askCount: {},
    answerCount: {},
    usedItems: new Set(),
    reshuffled: false,
    votes: {},
  };

  startRound();
}

function startRound() {
  const game = state.game;
  if (!game) return;

  game.players.forEach((player) => {
    if (game.askCount[player.id] == null) game.askCount[player.id] = 0;
    if (game.answerCount[player.id] == null) game.answerCount[player.id] = 0;
  });

  const secret = pickSecretItem(state.setup.categoryIds, game.usedItems);
  game.secret = secret;
  game.reshuffled = secret.reshuffled;

  game.outIds = pickOutPlayers(game.players, state.setup.numOut).map(
    (player) => player.id
  );

  game.turnOrder = buildTurnOrder(
    game.players,
    game.players.length * GAME_DEFAULTS.turnsPerPlayer,
    { ask: game.askCount, answer: game.answerCount }
  );

  game.votes = {};
  game.revealIndex = 0;
  game.revealStage = "cover";
  game.cardFlipped = false;
  game.voteIndex = 0;
  game.voteStage = "cover";

  state.screen = "reveal";
  render();
}

/* --------------------------------------------------------------------------
   Reveal phase (tasks.md 4.5 + signature flip card)
   -------------------------------------------------------------------------- */

function playerById(id) {
  const game = state.game;
  if (!game) return null;
  return game.players.find((player) => player.id === id) || null;
}

function maskName(id) {
  const player = playerById(id);
  return player ? player.name : "؟";
}

function screenRevealCover() {
  const game = state.game;
  const player = game.players[game.revealIndex];
  const ready = game.revealIndex === 0;
  return el(`
    <section class="screen">
      ${topbar({
        title: "كشف الدور",
        right: `<span class="chip">${game.revealIndex + 1} / ${game.players.length}</span>`,
      })}
      <div class="cover">
        <div class="cover__icon" aria-hidden="true">📱</div>
        <p class="cover__text">مرّر الجهاز إلى</p>
        <h2 class="cover__name">${escapeHtml(player.name)}</h2>
        <p class="cover__text">لا تضغط أي شيء إلا لما يوصل الجهاز بيدك.</p>
        <button class="btn btn--primary btn--lg" data-action="reveal-ready">
          جاهز
        </button>
      </div>
      <p class="centered field__hint">
        ${ready ? "ابدأ بأول لاعب." : "الأدوار سرية — لا أحد يشوف غير دوره."}
      </p>
    </section>
  `);
}

function cardBackHtml(isOut) {
  const game = state.game;
  if (isOut) {
    return `
      <div class="flip-card__emoji" aria-hidden="true">🎭</div>
      <div class="flip-card__role">برا السالفة</div>
      <p class="flip-card__category">
        خمّن السر من كلامهم، ولا تخليهم يعرفون إنك برا السالفة.
      </p>
    `;
  }
  return `
    <div class="flip-card__kicker">السر هو</div>
    <div class="flip-card__secret">${escapeHtml(game.secret.item)}</div>
    <div class="flip-card__category">${escapeHtml(game.secret.categoryLabel)}</div>
    <p class="flip-card__category">
      اوصفه بدون ما تقول اسمه، ولا تخلي اللي برا السالفة يعرفه.
    </p>
  `;
}

function screenRevealCard() {
  const game = state.game;
  const player = game.players[game.revealIndex];
  const isOut = game.outIds.includes(player.id);
  const flipped = !!game.cardFlipped;
  const backClass = isOut ? "is-out" : "is-in";

  /* The back face is only filled in once the player flips the card, so the
     secret never sits in the DOM (or a screen reader) before that tap. */
  const backContent = flipped ? cardBackHtml(isOut) : "";

  return el(`
    <section class="screen">
      ${topbar({
        title: `دور ${player.name}`,
        right: `<span class="chip">${game.revealIndex + 1} / ${game.players.length}</span>`,
      })}
      <div class="reveal-stage">
        <p class="reveal-progress">لا تبيّن الشاشة لأحد.</p>
        <button
          type="button"
          class="flip-card ${flipped ? "is-flipped" : ""}"
          data-action="flip-card"
          aria-label="اكشف دورك"
        >
          <div class="flip-card__inner">
            <div class="flip-card__face flip-card__face--front">
              <div class="flip-card__emoji" aria-hidden="true">🂠</div>
              <div class="flip-card__role">اضغط لكشف دورك</div>
              <div class="flip-card__kicker">سرّي — لا تبيّن لأحد</div>
            </div>
            <div class="flip-card__face flip-card__face--back ${backClass}">
              ${backContent}
            </div>
          </div>
        </button>
        <button
          id="reveal-done"
          class="btn btn--mint btn--lg"
          data-action="reveal-done"
          ${flipped ? "" : "hidden"}
        >
          تم، أخفِها
        </button>
      </div>
    </section>
  `);
}

function screenReveal() {
  const game = state.game;
  if (!game) {
    state.screen = "title";
    return screenTitle();
  }
  return game.revealStage === "card"
    ? screenRevealCard()
    : screenRevealCover();
}

function advanceReveal() {
  const game = state.game;
  game.revealIndex += 1;
  game.revealStage = "cover";
  game.cardFlipped = false;

  if (game.revealIndex >= game.players.length) {
    state.screen = "discussion";
    resetTimerToSetup();
    render();
    return;
  }
  render();
}

/* --------------------------------------------------------------------------
   Discussion phase + countdown timer
   -------------------------------------------------------------------------- */

let timerHandle = null;

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const secs = String(total % 60).padStart(2, "0");
  return minutes + ":" + secs;
}

function resetTimerToSetup() {
  const game = state.game;
  if (!game) return;
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
  game.timerRemaining = state.setup.discussionSeconds;
  game.timerRunning = false;
}

function startTimer() {
  const game = state.game;
  if (!game || game.timerRunning || game.timerRemaining <= 0) return;
  game.timerRunning = true;
  timerHandle = setInterval(tickTimer, 1000);
  updateTimerDisplay();
}

function stopTimer() {
  const game = state.game;
  if (game) game.timerRunning = false;
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
  updateTimerDisplay();
}

function tickTimer() {
  const game = state.game;
  if (!game || state.screen !== "discussion") {
    stopTimer();
    return;
  }
  game.timerRemaining = Math.max(0, game.timerRemaining - 1);
  updateTimerDisplay();
  if (game.timerRemaining === 0) {
    stopTimer();
    showToast("خلص الوقت! يلا نصوّت");
  }
}

function updateTimerDisplay() {
  const game = state.game;
  const display = document.getElementById("timer-display");
  if (!game || !display) return;
  display.textContent = formatTime(game.timerRemaining || 0);
  display.classList.toggle(
    "is-low",
    game.timerRemaining <= 30 && game.timerRemaining > 0
  );
  display.classList.toggle("is-done", game.timerRemaining <= 0);

  const toggle = document.getElementById("timer-toggle");
  if (toggle) {
    toggle.textContent = game.timerRunning ? "إيقاف مؤقت" : "تشغيل";
    toggle.disabled = game.timerRemaining <= 0;
  }
}

function screenDiscussion() {
  const game = state.game;
  const hasTimer = state.setup.discussionSeconds > 0;

  const turns = game.turnOrder
    .map((turn, index) => {
      const asker = playerById(turn.asker);
      const answerer = playerById(turn.answerer);
      return `
        <li class="turn-item">
          <span class="turn-item__num" aria-hidden="true">${index + 1}</span>
          <span class="turn-item__text">
            <b>${escapeHtml(asker ? asker.name : "؟")}</b> يسأل
            <i>${escapeHtml(answerer ? answerer.name : "؟")}</i>
          </span>
        </li>
      `;
    })
    .join("");

  return el(`
    <section class="screen screen--wide">
      ${topbar({
        title: "وقت السوالف",
        right: `<span class="chip">الجولة ${game.round}</span>`,
      })}
      ${
        game.reshuffled
          ? `<div class="note">خلصت كل عناصر الفئات المختارة، فتم خلط الأسرار من جديد.</div>`
          : ""
      }
      ${
        hasTimer
          ? `
        <div class="panel timer">
          <div
            id="timer-display"
            class="timer__display"
            role="timer"
            aria-live="off"
          >${formatTime(game.timerRemaining || state.setup.discussionSeconds)}</div>
          <div class="btn-row" style="width:100%">
            <button
              id="timer-toggle"
              class="btn btn--sand"
              data-action="timer-toggle"
            >${game.timerRunning ? "إيقاف مؤقت" : "تشغيل"}</button>
            <button class="btn btn--outline" data-action="timer-reset">تصفير</button>
          </div>
        </div>
      `
          : `<div class="note">النقاش بدون مؤقت — خذوا وقتكم.</div>`
      }
      <div class="panel">
        <div class="panel__head">
          <h2 class="panel__title">ترتيب الأسئلة</h2>
          <p class="panel__hint">
            واحد يسأل وواحد يجاوب بالترتيب — عشان الكل ياخذ دوره بالسؤال
            والجواب.
          </p>
        </div>
        <ol class="turn-list">
          ${turns}
        </ol>
      </div>
      <button class="btn btn--primary btn--lg btn--block" data-action="go-vote">
        خلصنا، يلا نصوّت
      </button>
    </section>
  `);
}

/* --------------------------------------------------------------------------
   Voting phase (tasks.md 4.5)
   -------------------------------------------------------------------------- */

function passCover({ title, player, action, progress, note }) {
  return el(`
    <section class="screen">
      ${topbar({
        title,
        right: progress
          ? `<span class="chip">${progress}</span>`
          : "",
      })}
      <div class="cover">
        <div class="cover__icon" aria-hidden="true">📱</div>
        <p class="cover__text">مرّر الجهاز إلى</p>
        <h2 class="cover__name">${escapeHtml(player.name)}</h2>
        <p class="cover__text">${escapeHtml(note)}</p>
        <button class="btn btn--primary btn--lg" data-action="${action}">
          جاهز
        </button>
      </div>
    </section>
  `);
}

function startVoting() {
  stopTimer();
  const game = state.game;
  game.votes = {};
  game.voteIndex = 0;
  game.voteStage = "cover";
  game.voteSelection = null;
  state.screen = "vote";
  render();
}

function screenVoteCover() {
  const game = state.game;
  const voter = game.players[game.voteIndex];
  return passCover({
    title: "التصويت السري",
    player: voter,
    action: "vote-ready",
    progress: `${game.voteIndex + 1} / ${game.players.length}`,
    note: "لا تضغط إلا لما يوصل الجهاز بيدك — صوتك محد يشوفه.",
  });
}

function screenVote() {
  const game = state.game;
  const voter = game.players[game.voteIndex];
  const options = game.players
    .filter((player) => player.id !== voter.id)
    .map((player) => {
      const selected = game.voteSelection === player.id;
      return `
        <button
          type="button"
          class="vote-option"
          data-action="vote-select"
          data-target="${player.id}"
          aria-pressed="${selected}"
        >
          <span>${escapeHtml(player.name)}</span>
          <span class="vote-option__check" aria-hidden="true">✓</span>
        </button>
      `;
    })
    .join("");

  return el(`
    <section class="screen">
      ${topbar({
        title: `تصويت ${voter.name}`,
        right: `<span class="chip">${game.voteIndex + 1} / ${game.players.length}</span>`,
      })}
      <div class="panel">
        <div class="panel__head">
          <h2 class="panel__title">مين برا السالفة؟</h2>
          <p class="panel__hint">اختر لاعباً واحداً — صوتك سرّي.</p>
        </div>
        <div class="vote-list">${options}</div>
      </div>
      <button
        id="vote-confirm"
        class="btn btn--primary btn--lg btn--block"
        data-action="vote-confirm"
        ${game.voteSelection ? "" : "disabled"}
      >
        ثبّت صوتي
      </button>
    </section>
  `);
}

function advanceVote() {
  const game = state.game;
  game.voteIndex += 1;
  game.voteStage = "cover";
  game.voteSelection = null;
  if (game.voteIndex >= game.players.length) {
    startGuessing();
    return;
  }
  render();
}

/* --------------------------------------------------------------------------
   Guess-the-secret phase (fair: happens before the public reveal)
   -------------------------------------------------------------------------- */

function startGuessing() {
  const game = state.game;
  game.guesses = {};
  game.guessIndex = 0;
  game.guessStage = "cover";
  state.screen = "guess";
  render();
}

function screenGuessCover() {
  const game = state.game;
  const player = game.players[game.guessIndex];
  return passCover({
    title: "تخمين السر",
    player,
    action: "guess-ready",
    progress: `${game.guessIndex + 1} / ${game.players.length}`,
    note: "فرصة أخيرة قبل كشف السر.",
  });
}

function screenGuess() {
  const game = state.game;
  const player = game.players[game.guessIndex];
  const isOut = game.outIds.includes(player.id);

  if (!isOut) {
    return el(`
      <section class="screen">
        ${topbar({
          title: `دور ${player.name}`,
          right: `<span class="chip">${game.guessIndex + 1} / ${game.players.length}</span>`,
        })}
        <div class="cover">
          <div class="cover__icon" aria-hidden="true">✅</div>
          <h2 class="cover__name">ما عليك تخمين</h2>
          <p class="cover__text">
            أنت داخل السالفة وتعرف السر — مرّر الجهاز لللي بعدك.
          </p>
          <button class="btn btn--mint btn--lg" data-action="guess-skip">
            تم
          </button>
        </div>
      </section>
    `);
  }

  return el(`
    <section class="screen">
      ${topbar({
        title: `تخمين ${player.name}`,
        right: `<span class="chip">${game.guessIndex + 1} / ${game.players.length}</span>`,
      })}
      <div class="panel">
        <div class="panel__head">
          <h2 class="panel__title">أنت برا السالفة… وش السر؟</h2>
          <p class="panel__hint">
            خمّن العنصر اللي كان مع الباقين. تخمين صحيح = نقطة إضافية.
          </p>
        </div>
        <div class="field">
          <label class="field__label" for="guess-input">تخمينك</label>
          <input
            class="input"
            id="guess-input"
            type="text"
            maxlength="40"
            autocomplete="off"
            placeholder="اكتب تخمينك هنا"
          />
        </div>
      </div>
      <div class="btn-row">
        <button class="btn btn--primary" data-action="guess-submit">
          أرسل التخمين
        </button>
        <button class="btn btn--outline" data-action="guess-skip">
          تخطّى
        </button>
      </div>
    </section>
  `);
}

function advanceGuess() {
  const game = state.game;
  game.guessIndex += 1;
  game.guessStage = "cover";
  if (game.guessIndex >= game.players.length) {
    computeResults();
    state.screen = "results";
    render();
    return;
  }
  render();
}

/* --------------------------------------------------------------------------
   Scoring & results (tasks.md 4.4)
   -------------------------------------------------------------------------- */

function normalizeArabic(value) {
  return String(value == null ? "" : value)
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىي]/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ");
}

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((id) => set.has(id));
}

function computeResults() {
  const game = state.game;
  const scoring = GAME_DEFAULTS.scoring;
  const outSet = new Set(game.outIds);

  const counts = {};
  game.players.forEach((player) => {
    counts[player.id] = 0;
  });
  Object.values(game.votes).forEach((target) => {
    if (counts[target] != null) counts[target] += 1;
  });

  const topCount = Math.max(0, ...Object.values(counts));
  const topIds = game.players
    .filter((player) => counts[player.id] === topCount && topCount > 0)
    .map((player) => player.id);

  const decisive =
    topCount > 0 && topIds.length === state.setup.numOut;
  const matched = decisive && sameSet(topIds, game.outIds);

  const caught = new Set();
  if (matched) {
    game.outIds.forEach((id) => caught.add(id));
  } else if (decisive) {
    topIds.forEach((id) => {
      if (outSet.has(id)) caught.add(id);
    });
  }

  const delta = {};
  const reasons = {};
  game.players.forEach((player) => {
    delta[player.id] = 0;
    reasons[player.id] = [];
  });
  const add = (id, points, label) => {
    delta[id] += points;
    reasons[id].push(label);
  };

  const correctVoters = [];
  if (matched) {
    game.players.forEach((voter) => {
      if (outSet.has(game.votes[voter.id])) {
        correctVoters.push(voter.id);
        add(voter.id, scoring.correctVote, "صوّت صح");
      }
    });
  }

  const escaped = [];
  game.outIds.forEach((id) => {
    if (!caught.has(id)) {
      escaped.push(id);
      add(id, scoring.outEscaped, "نجا من التصويت");
    }
  });

  const guessers = [];
  game.outIds.forEach((id) => {
    const guess = game.guesses[id];
    if (guess && normalizeArabic(guess) === normalizeArabic(game.secret.item)) {
      guessers.push(id);
      add(id, scoring.outGuessedItemBonus, "عرف السر");
    }
  });

  game.players.forEach((player) => {
    player.score += delta[player.id];
  });

  let verdict;
  if (matched) {
    verdict = "كشفوهم! تصويتكم طابخ على اللي برا السالفة.";
  } else if (!decisive) {
    verdict = "تعادل بالأصوات — ما طلع أحد هالجولة، واللي برا السالفة نجوا.";
  } else {
    verdict = "التصويت طلع برا السكة — اللي برا السالفة نجوا بجلدهم.";
  }

  game.result = {
    counts,
    topCount,
    topIds,
    decisive,
    matched,
    caught: [...caught],
    escaped,
    correctVoters,
    guessers,
    delta,
    reasons,
    verdict,
  };
}

function scoreboardRows(game, withRoundDelta) {
  const sorted = game.players
    .slice()
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "ar"));
  const leaderScore = sorted.length ? sorted[0].score : 0;
  return sorted
    .map((player, index) => {
      const delta = withRoundDelta ? game.result.delta[player.id] : 0;
      const deltaText =
        delta > 0
          ? `<span class="points-pos">+${delta}</span>`
          : `<span class="points-zero">٠</span>`;
      const leader =
        player.score === leaderScore && leaderScore > 0 ? "score-leader" : "";
      return `
        <tr class="${leader}">
          <td class="scoreboard__rank">${index + 1}</td>
          <td class="scoreboard__name">${escapeHtml(player.name)}</td>
          ${
            withRoundDelta
              ? `<td>${deltaText}</td>`
              : ""
          }
          <td class="scoreboard__total">${player.score}</td>
        </tr>
      `;
    })
    .join("");
}

function screenResults() {
  const game = state.game;
  const result = game.result;
  const outNames = game.outIds
    .map((id) => escapeHtml(maskName(id)))
    .join("، ");

  const summary = game.players
    .filter((player) => result.reasons[player.id].length > 0)
    .map((player) => {
      const list = result.reasons[player.id].join("، ");
      const total = result.delta[player.id];
      return `
        <li class="turn-item">
          <span class="turn-item__num" aria-hidden="true">+${total}</span>
          <span class="turn-item__text">
            <b>${escapeHtml(player.name)}</b>
            <span class="field__hint">${escapeHtml(list)}</span>
          </span>
        </li>
      `;
    })
    .join("");

  return el(`
    <section class="screen screen--wide">
      ${topbar({
        title: "النتيجة",
        right: `<span class="chip">الجولة ${game.round}</span>`,
      })}
      <div class="result-banner">
        <span class="result-banner__label">برا السالفة كانوا</span>
        <span class="result-banner__names">${outNames}</span>
        <span class="result-secret">
          <span class="result-banner__label">السر:</span>
          <span class="result-secret__value">${escapeHtml(game.secret.item)}</span>
          <span class="field__hint">(${escapeHtml(game.secret.categoryLabel)})</span>
        </span>
      </div>
      <div class="verdict">${escapeHtml(result.verdict)}</div>
      ${
        summary
          ? `
        <div class="panel">
          <div class="panel__head">
            <h2 class="panel__title">نقاط هالجولة</h2>
          </div>
          <ul class="turn-list">${summary}</ul>
        </div>
      `
          : ""
      }
      <div class="panel">
        <div class="panel__head">
          <h2 class="panel__title">لوحة النقاط</h2>
        </div>
        <table class="scoreboard">
          <thead>
            <tr>
              <th>#</th>
              <th>اللاعب</th>
              <th>هالجولة</th>
              <th>المجموع</th>
            </tr>
          </thead>
          <tbody>
            ${scoreboardRows(game, true)}
          </tbody>
        </table>
      </div>
      <div class="btn-row">
        <button class="btn btn--primary btn--lg" data-action="next-round">
          الجولة التالية
        </button>
        <button class="btn btn--outline btn--lg" data-action="new-game">
          لعبة جديدة
        </button>
      </div>
    </section>
  `);
}

function nextRound() {
  const game = state.game;
  game.round += 1;
  startRound();
}

function newGame() {
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
  state.game = null;
  state.screen = "setup";
  render();
}

/* --------------------------------------------------------------------------
   Router
   -------------------------------------------------------------------------- */

function render() {
  if (!root) return;
  root.innerHTML = "";
  let view;
  switch (state.screen) {
    case "setup":
      view = screenSetup();
      break;
    case "reveal":
      view = screenReveal();
      break;
    case "discussion":
      view = screenDiscussion();
      break;
    case "vote":
      view =
        state.game.voteStage === "cover" ? screenVoteCover() : screenVote();
      break;
    case "guess":
      view =
        state.game.guessStage === "cover" ? screenGuessCover() : screenGuess();
      break;
    case "results":
      view = screenResults();
      break;
    case "title":
    default:
      view = screenTitle();
      break;
  }
  root.appendChild(view);
  if (state.screen === "setup") refreshSetupControls();
  if (state.screen === "discussion") updateTimerDisplay();
  window.scrollTo(0, 0);
}

/* --------------------------------------------------------------------------
   Events
   -------------------------------------------------------------------------- */

document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-action]");
  if (!trigger) return;
  const action = trigger.getAttribute("data-action");

  switch (action) {
    case "toggle-theme":
      toggleTheme();
      break;
    case "go-setup":
      state.screen = "setup";
      render();
      break;
    case "go-title":
      captureSetupForm();
      saveSetup();
      state.screen = "title";
      render();
      break;
    case "player-add":
      captureSetupForm();
      if (playerCount() < GAME_DEFAULTS.maxPlayers) {
        state.setup.names.push("");
        saveSetup();
        render();
      }
      break;
    case "player-remove":
      captureSetupForm();
      if (playerCount() > GAME_DEFAULTS.minPlayers) {
        const index = Number(trigger.dataset.index);
        state.setup.names.splice(index, 1);
        saveSetup();
        render();
      }
      break;
    case "toggle-category": {
      captureSetupForm();
      const id = trigger.dataset.id;
      const at = state.setup.categoryIds.indexOf(id);
      if (at >= 0) state.setup.categoryIds.splice(at, 1);
      else state.setup.categoryIds.push(id);
      saveSetup();
      trigger.setAttribute(
        "aria-pressed",
        at >= 0 ? "false" : "true"
      );
      refreshSetupControls();
      break;
    }
    case "out-set":
      if (!trigger.disabled) {
        captureSetupForm();
        state.setup.numOut = Number(trigger.dataset.value) === 2 ? 2 : 1;
        saveSetup();
        render();
      }
      break;
    case "start-round":
      startGame();
      break;
    case "reveal-ready":
      if (state.game) {
        state.game.revealStage = "card";
        render();
      }
      break;
    case "flip-card": {
      if (!state.game || state.game.cardFlipped) break;
      const player = state.game.players[state.game.revealIndex];
      const isOut = state.game.outIds.includes(player.id);
      state.game.cardFlipped = true;
      const back = trigger.querySelector(".flip-card__face--back");
      if (back) back.innerHTML = cardBackHtml(isOut);
      trigger.classList.add("is-flipped");
      const done = document.getElementById("reveal-done");
      if (done) done.hidden = false;
      break;
    }
    case "reveal-done":
      advanceReveal();
      break;
    case "timer-toggle":
      if (state.game) {
        if (state.game.timerRunning) stopTimer();
        else startTimer();
      }
      break;
    case "timer-reset":
      if (state.game) {
        stopTimer();
        state.game.timerRemaining = state.setup.discussionSeconds;
        updateTimerDisplay();
      }
      break;
    case "go-vote":
      startVoting();
      break;
    case "vote-ready":
      state.game.voteStage = "vote";
      render();
      break;
    case "vote-select": {
      state.game.voteSelection = trigger.dataset.target;
      document
        .querySelectorAll('[data-action="vote-select"]')
        .forEach((option) =>
          option.setAttribute(
            "aria-pressed",
            option === trigger ? "true" : "false"
          )
        );
      const confirm = document.getElementById("vote-confirm");
      if (confirm) confirm.disabled = false;
      break;
    }
    case "vote-confirm":
      if (state.game.voteSelection) {
        state.game.votes[state.game.players[state.game.voteIndex].id] =
          state.game.voteSelection;
        advanceVote();
      }
      break;
    case "guess-ready":
      state.game.guessStage = "guess";
      render();
      break;
    case "guess-submit": {
      const input = document.getElementById("guess-input");
      state.game.guesses[state.game.players[state.game.guessIndex].id] =
        input ? input.value : "";
      advanceGuess();
      break;
    }
    case "guess-skip":
      advanceGuess();
      break;
    case "next-round":
      nextRound();
      break;
    case "new-game":
      newGame();
      break;
    default:
      break;
  }
});

document.addEventListener("input", (event) => {
  const field = event.target.dataset ? event.target.dataset.field : null;
  if (field === "player-name") {
    const index = Number(event.target.dataset.index);
    if (!Number.isNaN(index)) state.setup.names[index] = event.target.value;
    saveSetup();
    refreshSetupControls();
  } else if (field === "discussion-minutes") {
    const value = Number(event.target.value);
    state.setup.discussionSeconds = Number.isFinite(value)
      ? Math.max(0, Math.min(15, value)) * 60
      : GAME_DEFAULTS.discussionSeconds;
    saveSetup();
  }
});

/* --------------------------------------------------------------------------
   Debug hooks (safe to inspect from the browser console)
   -------------------------------------------------------------------------- */

window.__barra = {
  get state() {
    return state;
  },
  pickSecretItem,
  saveSetup,
  loadSetup,
  pickOutPlayers,
  buildTurnOrder,
  debugSimulateFairness,
  runFairnessSelfCheck,
};

/* --------------------------------------------------------------------------
   Init
   -------------------------------------------------------------------------- */

function init() {
  root = document.getElementById("app");
  loadTheme();
  loadSetup();
  runFairnessSelfCheck();
  render();
}

init();
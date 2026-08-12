"use strict";

const COLORS = ["red", "blue", "purple", "green", "yellow", "orange"];
const ROWS = 7;
const COLS = 7;
const STARTING_MOVES = 18;
const RED_TARGET = 12;

const state = {
  board: [],
  moves: STARTING_MOVES,
  score: 0,
  redCollected: 0,
  charge: 0,
  selected: null,
  locked: false,
  mode: null,
  boosterCounts: { rainbow: 1, mix: 1, bonk: 2 },
  tutorialStep: 0,
  soundOn: true,
  finished: false,
};

const $ = (selector) => document.querySelector(selector);
const boardEl = $("#board");
const movesEl = $("#movesValue");
const scoreEl = $("#scoreValue");
const redGoalEl = $("#redGoalValue");
const chargeFillEl = $("#chargeFill");
const chargeTextEl = $("#chargeText");
const razzleButton = $("#razzleButton");
const statusBanner = $("#statusBanner");
const tutorialModal = $("#tutorialModal");
const resultModal = $("#resultModal");

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function randomColor() { return COLORS[Math.floor(Math.random() * COLORS.length)]; }
function keyOf(r, c) { return `${r},${c}`; }
function parseKey(key) { return key.split(",").map(Number); }
function isAdjacent(a, b) { return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1; }

function generatePlayableBoard() {
  let attempts = 0;
  do {
    state.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        let choices = COLORS.slice();
        if (c >= 2 && state.board[r][c - 1] === state.board[r][c - 2]) {
          choices = choices.filter((color) => color !== state.board[r][c - 1]);
        }
        if (r >= 2 && state.board[r - 1][c] === state.board[r - 2][c]) {
          choices = choices.filter((color) => color !== state.board[r - 1][c]);
        }
        state.board[r][c] = choices[Math.floor(Math.random() * choices.length)];
      }
    }
    attempts += 1;
  } while (!hasPossibleMove() && attempts < 250);
}

function findMatches(board = state.board) {
  const matches = new Set();
  for (let r = 0; r < ROWS; r += 1) {
    let start = 0;
    while (start < COLS) {
      const color = board[r][start];
      let end = start + 1;
      while (end < COLS && color && board[r][end] === color) end += 1;
      if (color && end - start >= 3) {
        for (let c = start; c < end; c += 1) matches.add(keyOf(r, c));
      }
      start = end;
    }
  }
  for (let c = 0; c < COLS; c += 1) {
    let start = 0;
    while (start < ROWS) {
      const color = board[start][c];
      let end = start + 1;
      while (end < ROWS && color && board[end][c] === color) end += 1;
      if (color && end - start >= 3) {
        for (let r = start; r < end; r += 1) matches.add(keyOf(r, c));
      }
      start = end;
    }
  }
  return matches;
}

function swapInBoard(a, b) {
  const temp = state.board[a.r][a.c];
  state.board[a.r][a.c] = state.board[b.r][b.c];
  state.board[b.r][b.c] = temp;
}

function hasPossibleMove() {
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const current = { r, c };
      const candidates = [{ r, c: c + 1 }, { r: r + 1, c }];
      for (const next of candidates) {
        if (next.r >= ROWS || next.c >= COLS) continue;
        swapInBoard(current, next);
        const works = findMatches().size > 0;
        swapInBoard(current, next);
        if (works) return true;
      }
    }
  }
  return false;
}

function renderBoard() {
  boardEl.innerHTML = "";
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const color = state.board[r][c];
      const piece = document.createElement("button");
      piece.type = "button";
      piece.className = `piece ${color || ""}`;
      piece.dataset.row = String(r);
      piece.dataset.col = String(c);
      piece.setAttribute("role", "gridcell");
      piece.setAttribute("aria-label", color ? `${color} berry at row ${r + 1}, column ${c + 1}` : "empty tile");
      if (state.selected && state.selected.r === r && state.selected.c === c) piece.classList.add("selected");
      if (state.mode === "razzle") piece.classList.add("row-target");
      piece.addEventListener("click", onPieceClick);
      boardEl.appendChild(piece);
    }
  }
}

function updateHUD() {
  movesEl.textContent = String(state.moves);
  scoreEl.textContent = state.score.toLocaleString();
  redGoalEl.textContent = String(Math.min(state.redCollected, RED_TARGET));
  chargeTextEl.textContent = `${state.charge}/10`;
  chargeFillEl.style.width = `${state.charge * 10}%`;
  const ready = state.charge >= 10 && !state.finished;
  razzleButton.disabled = !ready;
  razzleButton.classList.toggle("ready", ready);
  $("#razzleHint").textContent = ready ? "READY! Choose a row to blast" : "Fill the meter to activate";
  updateBoosterButtons();
}

function updateBoosterButtons() {
  const mapping = { rainbow: "rainbowBooster", mix: "mixBooster", bonk: "bonkBooster" };
  Object.entries(mapping).forEach(([name, id]) => {
    const button = document.getElementById(id);
    const count = state.boosterCounts[name];
    button.querySelector("small").textContent = `x${count}`;
    button.disabled = count <= 0 || state.locked || state.finished;
    button.classList.toggle("active", state.mode === name);
  });
}

function setStatus(message, kind = "") {
  statusBanner.textContent = message;
  statusBanner.className = `status-banner ${kind}`.trim();
}

async function onPieceClick(event) {
  if (state.locked || state.finished) return;
  const target = event.currentTarget;
  const pos = { r: Number(target.dataset.row), c: Number(target.dataset.col) };

  if (state.mode === "razzle") {
    await useRazzleBlast(pos.r);
    return;
  }
  if (state.mode === "rainbow") {
    await useRainbow(pos);
    return;
  }
  if (state.mode === "bonk") {
    await useBonk(pos);
    return;
  }

  if (!state.selected) {
    state.selected = pos;
    renderBoard();
    softTone(420, 0.05);
    return;
  }

  if (state.selected.r === pos.r && state.selected.c === pos.c) {
    state.selected = null;
    renderBoard();
    return;
  }

  if (!isAdjacent(state.selected, pos)) {
    state.selected = pos;
    renderBoard();
    return;
  }

  const first = state.selected;
  state.selected = null;
  state.locked = true;
  swapInBoard(first, pos);
  renderBoard();
  await wait(120);

  const matches = findMatches();
  if (matches.size === 0) {
    swapInBoard(first, pos);
    renderBoard();
    const firstEl = pieceElement(first.r, first.c);
    const secondEl = pieceElement(pos.r, pos.c);
    firstEl?.classList.add("invalid");
    secondEl?.classList.add("invalid");
    setStatus("That swap doesn't make a match — try another pair! ✨", "warning");
    softTone(160, 0.08);
    await wait(300);
    state.locked = false;
    updateHUD();
    return;
  }

  state.moves -= 1;
  setStatus("Sweet match! Ruby's charge is growing ❤️");
  await resolveMatches(matches, true);
  state.locked = false;
  await afterActionCheck();
}

function pieceElement(r, c) {
  return boardEl.querySelector(`[data-row="${r}"][data-col="${c}"]`);
}

async function resolveMatches(initialMatches, playerTriggered) {
  let matches = initialMatches;
  let cascade = 0;
  while (matches.size > 0) {
    cascade += 1;
    const cleared = Array.from(matches).map(parseKey);
    let redCleared = 0;
    cleared.forEach(([r, c]) => {
      const el = pieceElement(r, c);
      el?.classList.add("clearing");
      if (state.board[r][c] === "red") redCleared += 1;
    });
    popTone(560 + cascade * 45);
    await wait(260);

    const clearedCount = cleared.length;
    state.redCollected += redCleared;
    state.score += clearedCount * 120 * cascade;
    if (playerTriggered || cascade > 1) {
      const chargeGain = Math.max(1, Math.ceil(clearedCount / 4)) + redCleared;
      state.charge = Math.min(10, state.charge + chargeGain);
    }

    cleared.forEach(([r, c]) => { state.board[r][c] = null; });
    collapseAndRefill();
    renderBoard();
    updateHUD();
    await wait(180);
    matches = findMatches();
    if (matches.size > 0) setStatus(`Cascade x${cascade + 1}! ✨`);
  }
}

function collapseAndRefill() {
  for (let c = 0; c < COLS; c += 1) {
    const column = [];
    for (let r = ROWS - 1; r >= 0; r -= 1) {
      if (state.board[r][c]) column.push(state.board[r][c]);
    }
    for (let r = ROWS - 1, i = 0; r >= 0; r -= 1, i += 1) {
      state.board[r][c] = i < column.length ? column[i] : randomColor();
    }
  }
}

async function useRazzleBlast(row) {
  if (state.charge < 10 || state.locked) return;
  state.locked = true;
  state.mode = null;
  setStatus("RAZZLE BLAST! Ruby clears the whole row! 💥❤️", "power");
  state.charge = 0;
  updateHUD();

  const targets = [];
  for (let c = 0; c < COLS; c += 1) targets.push([row, c]);
  let redCleared = 0;
  targets.forEach(([r, c]) => {
    if (state.board[r][c] === "red") redCleared += 1;
    pieceElement(r, c)?.classList.add("clearing");
  });
  burstAt(window.innerWidth / 2, window.innerHeight / 2, ["#ff416b", "#ffd34c", "#ffffff"]);
  powerTone();
  await wait(320);
  targets.forEach(([r, c]) => { state.board[r][c] = null; });
  state.redCollected += redCleared;
  state.score += targets.length * 175;
  collapseAndRefill();
  renderBoard();
  await wait(160);
  const cascades = findMatches();
  if (cascades.size) await resolveMatches(cascades, false);
  state.locked = false;
  await afterActionCheck();
}

async function useRainbow(pos) {
  const color = state.board[pos.r][pos.c];
  if (!color || state.boosterCounts.rainbow <= 0) return;
  state.locked = true;
  state.mode = null;
  state.boosterCounts.rainbow -= 1;
  setStatus(`Heartberry Rainbow clears every ${color} piece! 🌈`, "power");

  const targets = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) if (state.board[r][c] === color) targets.push([r, c]);
  }
  targets.forEach(([r, c]) => pieceElement(r, c)?.classList.add("clearing"));
  burstAt(window.innerWidth / 2, window.innerHeight / 2, ["#ff4268", "#ffc93d", "#60d04a", "#3ba7ff", "#9b51ff"]);
  powerTone();
  await wait(300);
  let redCleared = 0;
  targets.forEach(([r, c]) => {
    if (state.board[r][c] === "red") redCleared += 1;
    state.board[r][c] = null;
  });
  state.redCollected += redCleared;
  state.score += targets.length * 110;
  collapseAndRefill();
  renderBoard();
  updateHUD();
  await wait(160);
  const cascades = findMatches();
  if (cascades.size) await resolveMatches(cascades, false);
  state.locked = false;
  await afterActionCheck();
}

async function useBonk(pos) {
  if (state.boosterCounts.bonk <= 0) return;
  state.locked = true;
  state.mode = null;
  state.boosterCounts.bonk -= 1;
  const color = state.board[pos.r][pos.c];
  setStatus("BERRY BONK! One stubborn tile is gone. 🔨✨", "power");
  pieceElement(pos.r, pos.c)?.classList.add("clearing");
  softTone(220, .05); setTimeout(() => softTone(680, .06), 55);
  await wait(260);
  if (color === "red") state.redCollected += 1;
  state.score += 180;
  state.board[pos.r][pos.c] = null;
  collapseAndRefill();
  renderBoard();
  updateHUD();
  await wait(120);
  const cascades = findMatches();
  if (cascades.size) await resolveMatches(cascades, false);
  state.locked = false;
  await afterActionCheck();
}

async function useMixUp() {
  if (state.locked || state.finished || state.boosterCounts.mix <= 0) return;
  state.locked = true;
  state.mode = null;
  state.boosterCounts.mix -= 1;
  setStatus("BERRY MIX-UP! The board is getting a fresh bounce. 🔄", "power");
  boardEl.animate([{ transform: "rotate(0) scale(1)" }, { transform: "rotate(2deg) scale(.96)" }, { transform: "rotate(-2deg) scale(.96)" }, { transform: "rotate(0) scale(1)" }], { duration: 420, easing: "ease-in-out" });
  await wait(180);
  generatePlayableBoard();
  renderBoard();
  updateHUD();
  await wait(260);
  state.locked = false;
  setStatus("Fresh board! Find your next combo ✨");
}

async function afterActionCheck() {
  updateHUD();
  if (state.redCollected >= RED_TARGET) {
    await finishLevel(true);
    return;
  }
  if (state.moves <= 0) {
    await finishLevel(false);
    return;
  }
  if (!hasPossibleMove()) {
    setStatus("No moves left on the board — auto-shuffling! 🔄", "warning");
    await wait(400);
    generatePlayableBoard();
    renderBoard();
  }
  if (state.charge >= 10) setStatus("Ruby is READY! Tap Razzle Blast, then choose a row. 💥❤️", "power");
}

async function finishLevel(win) {
  state.finished = true;
  state.locked = true;
  updateHUD();
  await wait(350);
  const stars = win ? Math.max(1, Math.min(3, 1 + Number(state.score >= 3000) + Number(state.score >= 5200))) : 0;
  $("#resultStars").textContent = win ? `${"★ ".repeat(stars)}${"☆ ".repeat(3 - stars)}`.trim() : "☆ ☆ ☆";
  $("#resultEyebrow").textContent = win ? "RAZZLE RIDGE • FIRST SPARK RESTORED" : "RAZZLE RIDGE • TRY AGAIN";
  $("#resultTitle").textContent = win ? "LEVEL COMPLETE!" : "OUT OF MOVES";
  $("#resultCopy").textContent = win
    ? "Ruby recovered the first Heartberry spark and lit Razzle Ridge back up."
    : "You were close! Try a new route, save a booster, and charge Ruby sooner.";
  $("#coinReward").textContent = win ? "250" : "0";
  $(".reward-chest").textContent = win ? "🎁" : "💗";
  $(".story-tease").style.display = win ? "block" : "none";
  resultModal.classList.add("show");
  resultModal.setAttribute("aria-hidden", "false");
  if (win) {
    burstAt(window.innerWidth * .3, window.innerHeight * .42, ["#ff4f72", "#ffc93d", "#ffffff", "#83d95d"]);
    burstAt(window.innerWidth * .7, window.innerHeight * .42, ["#ff4f72", "#ffc93d", "#ffffff", "#8b4dff"]);
    victoryTone();
  }
}

function resetLevel() {
  state.moves = STARTING_MOVES;
  state.score = 0;
  state.redCollected = 0;
  state.charge = 0;
  state.selected = null;
  state.locked = false;
  state.mode = null;
  state.boosterCounts = { rainbow: 1, mix: 1, bonk: 2 };
  state.finished = false;
  generatePlayableBoard();
  renderBoard();
  updateHUD();
  setStatus("Match 3 or more berries. Red matches charge Ruby faster! ❤️");
}

function openTutorial() {
  state.tutorialStep = 0;
  tutorialModal.classList.add("show");
  tutorialModal.setAttribute("aria-hidden", "false");
  renderTutorialStep();
}

function renderTutorialStep() {
  const steps = [
    { icon: "🍓", title: "MAKE YOUR FIRST MATCH", text: "Swap two neighboring berries to create a line of 3 or more. Valid matches use one move." },
    { icon: "❤️", title: "CHARGE RUBY", text: "Every match builds Razzle Charge. Red berries charge Ruby especially fast — reach 10/10 to wake up her power." },
    { icon: "💥", title: "UNLEASH RAZZLE BLAST", text: "When Ruby is ready, tap Razzle Blast and choose any row. She clears the entire line without costing a move." },
  ];
  const step = steps[state.tutorialStep];
  $("#tutorialIcon").textContent = step.icon;
  $("#tutorialTitle").textContent = step.title;
  $("#tutorialText").textContent = step.text;
  document.querySelectorAll(".tutorial-dots span").forEach((dot, index) => dot.classList.toggle("active", index === state.tutorialStep));
  $("#tutorialNext").textContent = state.tutorialStep === steps.length - 1 ? "LET'S PLAY! ❤️" : "NEXT ✨";
}

function chooseMode(mode) {
  if (state.locked || state.finished) return;
  if (state.mode === mode) {
    state.mode = null;
    setStatus("Booster canceled — back to matching! ✨");
  } else {
    state.mode = mode;
    state.selected = null;
    const messages = {
      rainbow: "HEARTBERRY RAINBOW: tap a color to clear every piece of it. 🌈",
      bonk: "BERRY BONK: tap one tile to remove it instantly. 🔨",
      razzle: "RAZZLE BLAST: tap any tile in the row Ruby should clear. 💥❤️",
    };
    setStatus(messages[mode] || "Choose your target.", "power");
  }
  renderBoard();
  updateHUD();
}

function burstAt(x, y, colors) {
  const layer = $("#burstLayer");
  for (let i = 0; i < 34; i += 1) {
    const spark = document.createElement("span");
    spark.className = "spark";
    spark.style.left = `${x}px`;
    spark.style.top = `${y}px`;
    spark.style.background = colors[i % colors.length];
    const angle = Math.random() * Math.PI * 2;
    const distance = 70 + Math.random() * 190;
    spark.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    spark.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
    layer.appendChild(spark);
    setTimeout(() => spark.remove(), 950);
  }
}

let audioContext = null;
function getAudioContext() {
  if (!state.soundOn) return null;
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  return audioContext;
}
function softTone(freq = 440, duration = .06, gainValue = .035) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(gainValue, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + duration);
}
function popTone(freq) { softTone(freq, .08, .045); }
function powerTone() { [330, 440, 660, 880].forEach((f, i) => setTimeout(() => softTone(f, .12, .045), i * 60)); }
function victoryTone() { [523,659,784,1046].forEach((f,i)=>setTimeout(()=>softTone(f,.18,.05),i*95)); }

$("#startButton").addEventListener("click", () => {
  $("#introScreen").classList.remove("active");
  $("#playScreen").classList.add("active");
  resetLevel();
  openTutorial();
});
$("#restartButton").addEventListener("click", resetLevel);
$("#razzleButton").addEventListener("click", () => chooseMode("razzle"));
$("#rainbowBooster").addEventListener("click", () => chooseMode("rainbow"));
$("#bonkBooster").addEventListener("click", () => chooseMode("bonk"));
$("#mixBooster").addEventListener("click", useMixUp);
$("#tutorialNext").addEventListener("click", () => {
  if (state.tutorialStep < 2) {
    state.tutorialStep += 1;
    renderTutorialStep();
  } else {
    tutorialModal.classList.remove("show");
    tutorialModal.setAttribute("aria-hidden", "true");
    setStatus("Make a match! Red berries charge Ruby fastest ❤️");
  }
});
$("#playAgainButton").addEventListener("click", () => {
  resultModal.classList.remove("show");
  resultModal.setAttribute("aria-hidden", "true");
  resetLevel();
  openTutorial();
});
$("#backToTitleButton").addEventListener("click", () => {
  resultModal.classList.remove("show");
  resultModal.setAttribute("aria-hidden", "true");
  $("#playScreen").classList.remove("active");
  $("#introScreen").classList.add("active");
});
$("#soundToggle").addEventListener("click", (event) => {
  state.soundOn = !state.soundOn;
  event.currentTarget.textContent = state.soundOn ? "🔊" : "🔇";
  event.currentTarget.setAttribute("aria-label", state.soundOn ? "Mute sound" : "Unmute sound");
});

generatePlayableBoard();
renderBoard();
updateHUD();

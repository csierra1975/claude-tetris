'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#b0bec5', // Tuerca - gris metálico
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Tuerca (hueco central)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

function speedForLevel(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const gameoverBox = document.getElementById('gameover-box');
const pauseBox = document.getElementById('pause-box');
const controlsView = document.getElementById('controls-view');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const controlsBackBtn = document.getElementById('controls-back-btn');
const startLevelSelect = document.getElementById('start-level');
const startScreen = document.getElementById('start-screen');
const playBtn = document.getElementById('play-btn');
const recordEntryBox = document.getElementById('record-entry');
const qualifyMsg = document.getElementById('qualify-msg');
const playerNameInput = document.getElementById('player-name');
const saveScoreBtn = document.getElementById('save-score-btn');
const startRecordsList = document.getElementById('start-records-list');
const gameoverRecordsList = document.getElementById('gameover-records-list');
const startBestComboEl = document.getElementById('start-best-combo');
const startMaxLinesEl = document.getElementById('start-max-lines');
const gameoverBestComboEl = document.getElementById('gameover-best-combo');
const gameoverMaxLinesEl = document.getElementById('gameover-max-lines');

const MAX_START_LEVEL = 15;
const START_LEVEL_KEY = 'tetris-start-level';
const HIGH_SCORES_KEY = 'tetris-highscores';
const STATS_KEY = 'tetris-stats';
const MAX_RECORDS = 5;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, startLevel;
let gameStarted = false;
let combo = 0;
let maxComboThisGame = 0;
let pendingScore = null;
let scoreSaved = false;

function loadHighScores() {
  try {
    const raw = JSON.parse(localStorage.getItem(HIGH_SCORES_KEY));
    if (Array.isArray(raw)) return raw.slice(0, MAX_RECORDS);
  } catch (e) { /* ignore corrupt data */ }
  return [];
}

function loadStats() {
  try {
    const raw = JSON.parse(localStorage.getItem(STATS_KEY));
    if (raw && typeof raw === 'object') {
      return { bestCombo: raw.bestCombo || 0, maxLines: raw.maxLines || 0 };
    }
  } catch (e) { /* ignore corrupt data */ }
  return { bestCombo: 0, maxLines: 0 };
}

let highScores = loadHighScores();
let stats = loadStats();

function saveHighScores() {
  localStorage.setItem(HIGH_SCORES_KEY, JSON.stringify(highScores));
}

function saveStats() {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function qualifiesForHighScore(s) {
  if (s <= 0) return false;
  if (highScores.length < MAX_RECORDS) return true;
  return s > highScores[highScores.length - 1].score;
}

function addHighScore(name, s) {
  const entry = { name: name || 'AAA', score: s };
  highScores.push(entry);
  highScores.sort((a, b) => b.score - a.score);
  highScores = highScores.slice(0, MAX_RECORDS);
  saveHighScores();
  return highScores.includes(entry) ? entry : null;
}

function renderRecordsList(listEl, highlightEntry) {
  listEl.innerHTML = '';
  if (highScores.length === 0) {
    const li = document.createElement('li');
    li.className = 'record-empty';
    li.textContent = 'Sin records todavía';
    listEl.appendChild(li);
    return;
  }
  highScores.forEach((entry, i) => {
    const li = document.createElement('li');
    li.className = 'record-row';
    if (entry === highlightEntry) li.classList.add('highlight');

    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = `${i + 1}.`;

    const name = document.createElement('span');
    name.className = 'rname';
    name.textContent = entry.name;

    const scoreVal = document.createElement('span');
    scoreVal.className = 'rscore';
    scoreVal.textContent = entry.score.toLocaleString();

    li.append(rank, name, scoreVal);
    listEl.appendChild(li);
  });
}

function renderStats(comboEl, linesEl) {
  comboEl.textContent = `Mejor combo: ${stats.bestCombo}`;
  linesEl.textContent = `Líneas máx: ${stats.maxLines}`;
}

function refreshStartScreen() {
  renderRecordsList(startRecordsList, null);
  renderStats(startBestComboEl, startMaxLinesEl);
}

function resetRecords() {
  if (!confirm('¿Seguro que quieres borrar todos los records?')) return;
  highScores = [];
  stats = { bestCombo: 0, maxLines: 0 };
  saveHighScores();
  saveStats();
  refreshStartScreen();
  renderRecordsList(gameoverRecordsList, null);
  renderStats(gameoverBestComboEl, gameoverMaxLinesEl);
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = speedForLevel(level);
    updateHUD();
  }
  return cleared;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  const cleared = clearLines();
  combo = cleared > 0 ? combo + 1 : 0;
  maxComboThisGame = Math.max(maxComboThisGame, combo);
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--grid-color').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);

  stats.bestCombo = Math.max(stats.bestCombo, maxComboThisGame);
  stats.maxLines = Math.max(stats.maxLines, lines);
  saveStats();

  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  renderStats(gameoverBestComboEl, gameoverMaxLinesEl);

  pendingScore = score;
  scoreSaved = false;
  if (qualifiesForHighScore(score)) {
    recordEntryBox.classList.remove('hidden');
    playerNameInput.value = '';
    renderRecordsList(gameoverRecordsList, null);
  } else {
    recordEntryBox.classList.add('hidden');
    renderRecordsList(gameoverRecordsList, null);
  }

  pauseBox.classList.add('hidden');
  controlsView.classList.add('hidden');
  gameoverBox.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

function showPauseMenu() {
  gameoverBox.classList.add('hidden');
  controlsView.classList.add('hidden');
  pauseBox.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

function hidePauseMenu() {
  overlay.classList.add('hidden');
  pauseBox.classList.add('hidden');
  controlsView.classList.add('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    hidePauseMenu();
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    showPauseMenu();
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (!gameOver) animId = requestAnimationFrame(loop);
}

function init() {
  gameStarted = true;
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  combo = 0;
  maxComboThisGame = 0;
  paused = false;
  gameOver = false;
  dropInterval = speedForLevel(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  hidePauseMenu();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (!gameStarted) return;
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
pauseRestartBtn.addEventListener('click', init);
resumeBtn.addEventListener('click', togglePause);

controlsBtn.addEventListener('click', () => {
  pauseBox.classList.add('hidden');
  controlsView.classList.remove('hidden');
});

controlsBackBtn.addEventListener('click', () => {
  controlsView.classList.add('hidden');
  pauseBox.classList.remove('hidden');
});

for (let lvl = 1; lvl <= MAX_START_LEVEL; lvl++) {
  const option = document.createElement('option');
  option.value = lvl;
  option.textContent = lvl;
  startLevelSelect.appendChild(option);
}

startLevel = Number(localStorage.getItem(START_LEVEL_KEY));
if (!Number.isInteger(startLevel) || startLevel < 1 || startLevel > MAX_START_LEVEL) startLevel = 1;
startLevelSelect.value = startLevel;

startLevelSelect.addEventListener('change', () => {
  startLevel = Number(startLevelSelect.value);
  localStorage.setItem(START_LEVEL_KEY, startLevel);
});

playBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  init();
});

function trySaveScore() {
  if (scoreSaved || pendingScore == null) return;
  const name = playerNameInput.value.trim().slice(0, 12) || 'AAA';
  const entry = addHighScore(name, pendingScore);
  scoreSaved = true;
  recordEntryBox.classList.add('hidden');
  renderRecordsList(gameoverRecordsList, entry);
}

saveScoreBtn.addEventListener('click', trySaveScore);
playerNameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    trySaveScore();
  }
});

document.querySelectorAll('.reset-records-btn').forEach(btn => {
  btn.addEventListener('click', resetRecords);
});

const themeSwitch = document.getElementById('theme-switch');
const THEME_KEY = 'tetris-theme';

function applyTheme(theme) {
  document.body.classList.toggle('light-theme', theme === 'light');
  themeSwitch.checked = theme === 'light';
}

applyTheme(localStorage.getItem(THEME_KEY) || 'dark');

themeSwitch.addEventListener('change', () => {
  const theme = themeSwitch.checked ? 'light' : 'dark';
  applyTheme(theme);
  localStorage.setItem(THEME_KEY, theme);
});

refreshStartScreen();

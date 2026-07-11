'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = v => Math.max(0, Math.min(255, v));
  const r = clamp(((n >> 16) & 255) + amt);
  const g = clamp(((n >> 8) & 255) + amt);
  const b = clamp((n & 255) + amt);
  return `rgb(${r},${g},${b})`;
}

const SKINS = {
  retro: {
    colors: [
      null,
      '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784',
      '#e57373', '#90caf9', '#ffb74d', '#b0bec5',
    ],
    draw(ctx, px, py, size, color) {
      ctx.fillStyle = color;
      ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(px + 1, py + 1, size - 2, 4);
    },
  },
  neon: {
    colors: [
      null,
      '#00e5ff', '#ffee00', '#e040fb', '#00ff6a',
      '#ff1744', '#2979ff', '#ff9100', '#c0c0ff',
    ],
    draw(ctx, px, py, size, color) {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = color;
      ctx.fillRect(px + 2, py + 2, size - 4, size - 4);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = shade(color, 60);
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 2.5, py + 2.5, size - 5, size - 5);
      ctx.restore();
    },
  },
  pastel: {
    colors: [
      null,
      '#a8e6f0', '#fff2b2', '#e0bfe6', '#c3ecc0',
      '#f5c2c2', '#c0dcf5', '#ffdcb0', '#dcdce6',
    ],
    draw(ctx, px, py, size, color) {
      const r = 6;
      const x = px + 1, y = py + 1, w = size - 2, h = size - 2;
      ctx.fillStyle = color;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, w, h, r);
      } else {
        ctx.rect(x, y, w, h);
      }
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, w, h * 0.4, [r, r, 0, 0]);
        ctx.fill();
      }
    },
  },
  pixel: {
    colors: [
      null,
      '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784',
      '#e57373', '#90caf9', '#ffb74d', '#b0bec5',
    ],
    draw(ctx, px, py, size, color) {
      const x = px + 1, y = py + 1, w = size - 2, h = size - 2;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
      const cell = w / 4;
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          const light = (r + c) % 2 === 0;
          ctx.fillStyle = light ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)';
          ctx.fillRect(x + c * cell, y + r * cell, cell, cell);
        }
      }
      ctx.strokeStyle = shade(color, -60);
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    },
  },
};

let currentSkin = 'retro';

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

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const comboEl = document.getElementById('combo');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const nameEntry = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const saveBtn = document.getElementById('save-btn');
const overlayRecordsEl = document.getElementById('overlay-records');
const startScreen = document.getElementById('start-screen');
const startRecordsEl = document.getElementById('start-records');
const playBtn = document.getElementById('play-btn');
const resetBtn = document.getElementById('reset-btn');

const pauseOverlay = document.getElementById('pause-overlay');
const pauseMain = document.getElementById('pause-main');
const pauseControls = document.getElementById('pause-controls');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const controlsBackBtn = document.getElementById('controls-back-btn');
const levelMinusBtn = document.getElementById('level-minus');
const levelPlusBtn = document.getElementById('level-plus');
const startLevelValue = document.getElementById('start-level-value');

const START_LEVEL_KEY = 'tetris-start-level';
const MIN_START_LEVEL = 1;
const MAX_START_LEVEL = 10;

let board, current, next, score, lines, level, combo, bestCombo, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let startLevel = clamp(parseInt(localStorage.getItem(START_LEVEL_KEY), 10) || 1, MIN_START_LEVEL, MAX_START_LEVEL);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
    level = Math.max(startLevel, Math.floor(lines / 10) + 1);
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
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
  if (cleared > 0) {
    combo++;
    if (combo > 1) score += 50 * (combo - 1) * level;
    if (combo > bestCombo) bestCombo = combo;
  } else {
    combo = 0;
  }
  updateHUD();
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
  comboEl.textContent = combo > 1 ? `x${combo}` : '-';
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = SKINS[currentSkin];
  const color = skin.colors[colorIndex];
  context.globalAlpha = alpha ?? 1;
  skin.draw(context, x * size, y * size, size, color);
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

const RECORDS_KEY = 'tetris-records';
const LAST_NAME_KEY = 'tetris-last-name';

function loadRecords() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECORDS_KEY));
    return {
      scores: Array.isArray(raw?.scores) ? raw.scores : [],
      bestCombo: Number(raw?.bestCombo) || 0,
      maxLines: Number(raw?.maxLines) || 0,
    };
  } catch {
    return { scores: [], bestCombo: 0, maxLines: 0 };
  }
}

function saveRecords(r) {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(r));
}

function qualifies(points, r) {
  return r.scores.length < 5 || points > r.scores[r.scores.length - 1].score;
}

function addScore(name, points, r) {
  r.scores.push({ name: name || 'Anónimo', score: points });
  r.scores.sort((a, b) => b.score - a.score);
  r.scores = r.scores.slice(0, 5);
  return r.scores.findIndex(s => s.score === points && s.name === (name || 'Anónimo'));
}

function resetRecords() {
  localStorage.removeItem(RECORDS_KEY);
  renderRecords(startRecordsEl);
  renderRecords(overlayRecordsEl);
}

function renderRecords(container, highlightIndex) {
  const r = loadRecords();
  const rows = r.scores.length
    ? r.scores.map((s, i) => `
        <div class="record-row${i === highlightIndex ? ' highlight' : ''}">
          <span class="record-rank">${i + 1}</span>
          <span class="record-name">${s.name}</span>
          <span class="record-score">${s.score.toLocaleString()}</span>
        </div>`).join('')
    : '<p class="records-empty">Sin puntuaciones aún</p>';
  container.innerHTML = `
    <div class="records-list">${rows}</div>
    <div class="records-stats">
      <span>Mejor combo: x${r.bestCombo}</span>
      <span>Líneas máx.: ${r.maxLines}</span>
    </div>`;
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);

  const r = loadRecords();
  r.bestCombo = Math.max(r.bestCombo, bestCombo);
  r.maxLines = Math.max(r.maxLines, lines);
  saveRecords(r);

  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  nameInput.value = localStorage.getItem(LAST_NAME_KEY) || '';
  nameEntry.classList.remove('hidden');
  renderRecords(overlayRecordsEl);
  overlay.classList.remove('hidden');
}

function showPauseMenu() {
  pauseControls.classList.add('hidden');
  pauseMain.classList.remove('hidden');
  pauseOverlay.classList.remove('hidden');
}

function hidePauseMenu() {
  pauseOverlay.classList.add('hidden');
}

function saveCurrentScore() {
  const name = nameInput.value.trim().slice(0, 12);
  localStorage.setItem(LAST_NAME_KEY, name);
  const r = loadRecords();
  const idx = qualifies(score, r) ? addScore(name, score, r) : -1;
  saveRecords(r);
  nameEntry.classList.add('hidden');
  renderRecords(overlayRecordsEl, idx);
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    hidePauseMenu();
    document.activeElement?.blur();
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
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  combo = 0;
  bestCombo = 0;
  paused = false;
  gameOver = false;
  dropInterval = Math.max(100, 1000 - (startLevel - 1) * 90);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  hidePauseMenu();
  nameEntry.classList.add('hidden');
  startScreen.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
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
playBtn.addEventListener('click', init);
resetBtn.addEventListener('click', resetRecords);
saveBtn.addEventListener('click', saveCurrentScore);
nameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') saveCurrentScore();
});

resumeBtn.addEventListener('click', () => {
  if (paused) togglePause();
});

pauseRestartBtn.addEventListener('click', () => {
  init();
});

controlsBtn.addEventListener('click', () => {
  pauseMain.classList.add('hidden');
  pauseControls.classList.remove('hidden');
});

controlsBackBtn.addEventListener('click', () => {
  pauseControls.classList.add('hidden');
  pauseMain.classList.remove('hidden');
});

function setStartLevel(newLevel) {
  startLevel = clamp(newLevel, MIN_START_LEVEL, MAX_START_LEVEL);
  startLevelValue.textContent = startLevel;
  localStorage.setItem(START_LEVEL_KEY, startLevel);
}

levelMinusBtn.addEventListener('click', () => setStartLevel(startLevel - 1));
levelPlusBtn.addEventListener('click', () => setStartLevel(startLevel + 1));

startLevelValue.textContent = startLevel;

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

const skinSelect = document.getElementById('skin-select');
const SKIN_KEY = 'tetris-skin';

function applySkin(name) {
  currentSkin = SKINS[name] ? name : 'retro';
  document.body.dataset.skin = currentSkin;
  skinSelect.value = currentSkin;
  if (board) { draw(); drawNext(); }
}

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  localStorage.setItem(SKIN_KEY, skinSelect.value);
});

applySkin(localStorage.getItem(SKIN_KEY) || 'retro');
renderRecords(startRecordsEl);

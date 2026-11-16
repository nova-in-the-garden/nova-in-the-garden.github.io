// LORENZ CROSSING: game 1 in Nova's Arcade.
// Help Lorenz (a duckling in a frog costume) hop across glowing cellular-automaton
// blocks, comet lanes and a starry river to the golden nests.
//
// Arcade game interface (see games/README.md):
//   export const meta = { id, title, width, height }
//   export function create(host) -> { init(canvas), start(), pause(), resume(), destroy(),
//                                     onScore(fn), press(action), key(k), get paused }
//   export function preview(ctx, w, h, t)   // optional: attract picture for the cabinet screen
// The host (js/arcadeplayer.js) owns the overlay, keyboard, swipe and d-pad and sends actions:
//   'up' 'down' 'left' 'right' 'a' (confirm) 'tap'
import { pixelFont } from '../_shared/pixelfont.js';
import { scoreTable } from '../_shared/scores.js';

export const meta = { id: 'lorenz-crossing', title: 'Lorenz Crossing', width: 240, height: 256 };

const W = 240, H = 256, T = 16, COLS = 15;
const STEP = 1 / 60;
const NEST_ROW = 2, RIVER_TOP = 3, RIVER_BOT = 7, MEDIAN = 8, START_ROW = 14;
const NEST_COLS = [1, 4, 7, 10, 13];
const START_X = 7 * T + 8;
const TIME_LIMIT = 30, LIVES = 3, HOP_TIME = 0.11, EXTRA_LIFE_AT = 10000;

// ---------------------------------------------------------------- sprites
const PAL = {
  g: '#1f5a2a', G: '#58bd4a', h: '#8fe06c', W: '#ffffff', K: '#15121e', Y: '#ffd94a', y: '#e3a52a', O: '#ff8a2a', P: '#ff9aa6',
  B: '#fff0a6', E: '#ffcf3a', e: '#b8800f', H: '#fff8d0', n: '#5a3a16', N: '#8a5a1c', u: '#c99a2e', L: '#0e3a1c',
};
const MAPS = {
  up: [
    '..ggg......ggg..',
    '.gWWWg....gWWWg.',
    '.gWKKg....gKKWg.',
    '.gGGGGggggGGGGg.',
    'gGGhGGGGGGGGGGGg',
    'gGGYYYYYYYYYYGGg',
    'gGYYKYYYYYYKYYGg',
    'gGYPYYOOOOYYPYGg',
    'gGGYYYYOOYYYYGGg',
    '.gGGGGGGGGGGGGg.',
    '..gGGBBBBBBGGg..',
    '.gGGBBBBBBBBGGg.',
    '.gGGBBBBBBBBGGg.',
    '..gGGBBBBBBGGg..',
    '..gGGg....gGGg..',
    '.ggGgg....ggGgg.',
  ],
  hop: [
    '..ggg......ggg..',
    '.gWWWg....gWWWg.',
    '.gWKKg....gKKWg.',
    '.gGGGGggggGGGGg.',
    'gGGhGGGGGGGGGGGg',
    'gGGYYYYYYYYYYGGg',
    'gGYYKYYYYYYKYYGg',
    'gGYPYYOOOOYYPYGg',
    'gGGYYYYOOYYYYGGg',
    'ggGGGGGGGGGGGGgg',
    'GgGGBBBBBBBBGGgG',
    '.gGGBBBBBBBBGGg.',
    '..gGBBBBBBBBGg..',
    '..gGGGBBBBGGGg..',
    '.gGGg......gGGg.',
    '.gg..........gg.',
  ],
  left: [
    '................',
    '....ggg.........',
    '...gWWWg........',
    '...gKKWg........',
    '..gGGGGGGggg....',
    '..gYYYYYYGGGGg..',
    '.OOYKYYYYGGhGGg.',
    'OOOYYPYYYGGGGGg.',
    '.OOYYYYYYGGGGGg.',
    '..gGGGGGGGGGGGg.',
    '...gGBBBGGGGGg..',
    '..gGBBBBGGGGGGg.',
    '..gGBBBBGGGGGGg.',
    '...gGGGGGGGGGg..',
    '...gGGg..gGGg...',
    '..ggGg..ggGg....',
  ],
  happy: [
    '..ggg......ggg..',
    '.gWWWg....gWWWg.',
    '.gWKKg....gKKWg.',
    '.gGGGGggggGGGGg.',
    'gGGhGGGGGGGGGGGg',
    'gGGYKYYYYYYKYGGg',
    'gGYKYKYYYYKYKYGg',
    'gGYPYYOOOOYYPYGg',
    'gGGYYYOKKOYYYGGg',
    '.gGGGGGOOGGGGGg.',
    'GgGGGeEEEEeGGGgG',
    '.gGGeEHEEEEeGGg.',
    '.gGGeEEEEEEeGGg.',
    '..gGGeEEEEeGGg..',
    '..gGGgeeeegGGg..',
    '.ggGgg....ggGgg.',
  ],
  egg: [
    '..eEEe..',
    '.eEHEEe.',
    'eEHEEEEe',
    'eEEEEEEe',
    'eEEEEEEe',
    'eEEEEEEe',
    '.eEEEEe.',
    '..eeee..',
  ],
  smallEgg: ['.eEe.', 'eHEEe', 'eEEEe', 'eEEEe', '.eee.'],
  pad: [
    '................',
    '.....gGGGGg.....',
    '...gGGhhGGGGg...',
    '..gGGhGGGGGGGg..',
    '.gGGhGGGGG..GGg.',
    '.gGGGGGGG....Gg.',
    'gGGGGGGGGG..GGGg',
    'gGGGGGGGGGGGGGGg',
    'gGGGGGGGGGGGGGGg',
    '.gGGGGGGGGGGGGg.',
    '.gLGGGGGGGGGGLg.',
    '..gLLGGGGGGLLg..',
    '...gLLLLLLLLg...',
    '.....gggggg.....',
    '................',
    '................',
  ],
  life: ['.g..g.', 'gGggGg', 'gYYYYg', 'gYOOYg', '.gBBg.', '.g..g.'],
};
function fromMap(rows, pal = PAL, flip = false) {
  const c = document.createElement('canvas'); c.width = rows[0].length; c.height = rows.length;
  const x = c.getContext('2d');
  rows.forEach((r, y) => { for (let i = 0; i < r.length; i++) { const col = pal[r[i]]; if (col) { x.fillStyle = col; x.fillRect(flip ? r.length - 1 - i : i, y, 1, 1); } } });
  return c;
}
function canvasOf(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; }
function rngOf(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

let SPR = null;
function sprites() {
  if (SPR) return SPR;
  const R = rngOf(90);
  const S = {};
  S.up = fromMap(MAPS.up); S.hop = fromMap(MAPS.hop); S.happy = fromMap(MAPS.happy);
  S.left = fromMap(MAPS.left); S.right = fromMap(MAPS.left, PAL, true);
  S.egg = fromMap(MAPS.egg); S.smallEgg = fromMap(MAPS.smallEgg); S.pad = fromMap(MAPS.pad); S.life = fromMap(MAPS.life);
  S.padSink = canvasOf(16, 16, x => { x.globalAlpha = 0.45; x.drawImage(S.pad, 2, 2, 12, 12); });
  S.ripple = canvasOf(16, 16, x => { x.strokeStyle = 'rgba(160,190,255,.6)'; x.lineWidth = 1; x.beginPath(); x.ellipse(8, 9, 6, 3, 0, 0, 7); x.stroke(); x.beginPath(); x.ellipse(8, 9, 3, 1.5, 0, 0, 7); x.stroke(); });
  // nest: woven gold twigs
  S.nest = canvasOf(16, 16, x => {
    x.fillStyle = PAL.n; x.beginPath(); x.ellipse(8, 11, 7.5, 4.5, 0, 0, 7); x.fill();
    x.fillStyle = '#2a1a08'; x.beginPath(); x.ellipse(8, 10, 5, 2.4, 0, 0, 7); x.fill();
    for (let i = 0; i < 26; i++) { const a = R() * Math.PI * 2; x.fillStyle = R() < 0.5 ? PAL.u : PAL.N; x.fillRect(Math.round(8 + Math.cos(a) * (5 + R() * 2.5)), Math.round(11 + Math.sin(a) * (2.6 + R() * 1.6)), 2, 1); }
  });
  S.nestFull = canvasOf(16, 16, x => { x.drawImage(S.nest, 0, 0); x.drawImage(S.smallEgg, 2, 6); x.drawImage(S.smallEgg, 9, 6); x.drawImage(S.smallEgg, 5, 4); });
  // log pieces (16 x 14)
  const logPiece = kind => canvasOf(16, 14, x => {
    x.fillStyle = '#5a3a1e'; x.fillRect(0, 1, 16, 12); x.fillStyle = '#7a5130'; x.fillRect(0, 2, 16, 4); x.fillStyle = '#3a2412'; x.fillRect(0, 11, 16, 2);
    x.fillStyle = '#4a2e16'; for (let i = 0; i < 4; i++) x.fillRect(Math.floor(R() * 14), 4 + Math.floor(R() * 7), 3, 1);
    if (kind === 'L') { x.clearRect(0, 0, 2, 14); x.fillStyle = '#c08a50'; x.fillRect(1, 2, 3, 10); x.fillStyle = '#8a5a2e'; x.fillRect(2, 5, 1, 4); x.clearRect(0, 0, 1, 14); }
    if (kind === 'R') { x.fillStyle = '#c08a50'; x.fillRect(12, 2, 3, 10); x.fillStyle = '#8a5a2e'; x.fillRect(13, 5, 1, 4); x.clearRect(15, 0, 1, 14); }
    if (kind === 'M' && R() < 0.6) { x.fillStyle = '#3e7a2a'; x.fillRect(5, 1, 4, 2); x.fillStyle = '#5ca83a'; x.fillRect(6, 0, 2, 1); }
  });
  S.logL = logPiece('L'); S.logM = logPiece('M'); S.logM2 = logPiece('M'); S.logR = logPiece('R');
  // glowing gold automaton block frame for a "car" of len tiles
  const blockFrame = len => canvasOf(len * 16, 16, x => {
    const w = len * 16;
    x.fillStyle = 'rgba(255,210,90,.18)'; x.fillRect(0, 0, w, 16);
    x.fillStyle = '#ffd75a'; x.fillRect(1, 1, w - 2, 14); x.fillStyle = '#3a2706'; x.fillRect(2, 2, w - 4, 12);
    x.fillStyle = '#fff3b8'; x.fillRect(1, 1, w - 2, 1);
  });
  S.block2 = blockFrame(2); S.block3 = blockFrame(3);
  // Rule 90 lane cell (30 x 16) and its "about to be born" ghost
  S.caCell = canvasOf(30, 16, x => {
    x.fillStyle = 'rgba(255,200,80,.22)'; x.fillRect(0, 0, 30, 16);
    x.fillStyle = '#ffcf4a'; x.fillRect(1, 1, 28, 14); x.fillStyle = '#ffe9a0'; x.fillRect(1, 1, 28, 2);
    x.fillStyle = '#a8720a'; // tiny Sierpinski triangle inside (4 rows of Rule 90)
    const tri = ['...#...', '..#.#..', '.#...#.', '#.#.#.#']; tri.forEach((r, ry) => { for (let i = 0; i < 7; i++) if (r[i] === '#') x.fillRect(8 + i * 2, 5 + ry * 2, 2, 2); });
  });
  S.caGhost = canvasOf(30, 16, x => { x.strokeStyle = '#ffe08a'; x.lineWidth = 1; x.setLineDash([2, 2]); x.strokeRect(1.5, 1.5, 27, 13); });
  // comets
  S.cometHead = canvasOf(14, 14, x => { const g = x.createRadialGradient(7, 7, 0, 7, 7, 7); g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#ffe39a'); g.addColorStop(0.7, 'rgba(255,170,60,.7)'); g.addColorStop(1, 'rgba(255,140,40,0)'); x.fillStyle = g; x.fillRect(0, 0, 14, 14); });
  const tail = dir => canvasOf(56, 10, x => { const g = x.createLinearGradient(dir > 0 ? 56 : 0, 0, dir > 0 ? 0 : 56, 0); g.addColorStop(0, 'rgba(255,214,120,.95)'); g.addColorStop(0.4, 'rgba(255,150,70,.45)'); g.addColorStop(1, 'rgba(200,50,58,0)'); x.fillStyle = g; x.beginPath(); if (dir > 0) { x.moveTo(56, 2); x.lineTo(0, 5); x.lineTo(56, 8); } else { x.moveTo(0, 2); x.lineTo(56, 5); x.lineTo(0, 8); } x.fill(); });
  S.tailR = tail(1); S.tailL = tail(-1);  // tailR trails a comet moving right
  S.warnL = canvasOf(8, 8, x => { x.fillStyle = '#ff4a50'; x.beginPath(); x.moveTo(7, 0); x.lineTo(1, 4); x.lineTo(7, 8); x.fill(); });
  S.warnR = canvasOf(8, 8, x => { x.fillStyle = '#ff4a50'; x.beginPath(); x.moveTo(1, 0); x.lineTo(7, 4); x.lineTo(1, 8); x.fill(); });
  S.spark = canvasOf(5, 5, x => { x.fillStyle = '#fff3b0'; x.fillRect(2, 0, 1, 5); x.fillRect(0, 2, 5, 1); x.fillStyle = '#ffffff'; x.fillRect(2, 2, 1, 1); });
  S.bg = background(R, S);
  SPR = S; return S;
}
function grass(x, y0, h, R, base, tuft) {
  x.fillStyle = base; x.fillRect(0, y0, W, h);
  for (let i = 0; i < W * h / 7; i++) { x.fillStyle = R() < 0.5 ? tuft : '#173a20'; x.fillRect(Math.floor(R() * W), y0 + Math.floor(R() * h), 1, 1 + Math.floor(R() * 2)); }
  for (let i = 0; i < W / 14; i++) { const fx = Math.floor(R() * W), fy = y0 + 2 + Math.floor(R() * (h - 5)); x.fillStyle = ['#ff5a5a', '#fff2d0', '#ffd34a'][Math.floor(R() * 3)]; x.fillRect(fx, fy, 2, 2); }
}
function background(R, S) {
  return canvasOf(W, H, x => {
    x.fillStyle = '#070b1c'; x.fillRect(0, 0, W, H);
    // HUD
    x.fillStyle = '#0b1030'; x.fillRect(0, 0, W, 32); x.fillStyle = '#e8c15a'; x.fillRect(0, 31, W, 1);
    // nest hedge
    grass(x, 32, 16, R, '#1e4a28', '#3f8a46');
    x.fillStyle = '#2a1e30'; x.fillRect(0, 46, W, 2);
    for (const c of NEST_COLS) { x.fillStyle = '#0b1530'; x.fillRect(c * T - 2, 33, 20, 15); x.fillStyle = 'rgba(232,193,90,.35)'; x.fillRect(c * T - 2, 33, 20, 1); x.drawImage(S.nest, c * T, 32); }
    // starry river
    const rg = x.createLinearGradient(0, 48, 0, 128); rg.addColorStop(0, '#0a1650'); rg.addColorStop(1, '#0c1d5c'); x.fillStyle = rg; x.fillRect(0, 48, W, 80);
    for (let i = 0; i < 160; i++) { x.fillStyle = R() < 0.18 ? '#ffd970' : R() < 0.5 ? '#9fb6ff' : '#ffffff'; x.globalAlpha = 0.35 + R() * 0.6; x.fillRect(Math.floor(R() * W), 48 + Math.floor(R() * 80), 1, 1); }
    x.globalAlpha = 0.18; x.fillStyle = '#9fc0ff'; for (let r = 0; r < 5; r++) for (let i = 0; i < 9; i++) x.fillRect(Math.floor(R() * W), 48 + r * 16 + 13, 4 + Math.floor(R() * 6), 1);
    x.globalAlpha = 1;
    // median
    grass(x, 128, 16, R, '#22502c', '#4a9a50');
    // automaton lanes
    x.fillStyle = '#0a0d24'; x.fillRect(0, 144, W, 48);
    x.fillStyle = 'rgba(232,193,90,.28)'; for (const yy of [160, 176]) for (let i = 0; i < W; i += 12) x.fillRect(i, yy, 6, 1);
    // comet lanes (deep space)
    x.fillStyle = '#05071a'; x.fillRect(0, 192, W, 32);
    for (let i = 0; i < 70; i++) { x.fillStyle = R() < 0.2 ? '#ffd970' : '#ffffff'; x.globalAlpha = 0.3 + R() * 0.6; x.fillRect(Math.floor(R() * W), 192 + Math.floor(R() * 32), 1, 1); }
    x.globalAlpha = 1; x.fillStyle = 'rgba(200,50,58,.35)'; x.fillRect(0, 192, W, 1); x.fillRect(0, 223, W, 1);
    // start ledge
    grass(x, 224, 16, R, '#22502c', '#4a9a50');
    x.fillStyle = '#0b1030'; x.fillRect(0, 240, W, 16); x.fillStyle = '#e8c15a'; x.fillRect(0, 240, W, 1);
  });
}

// ---------------------------------------------------------------- lanes
// kind: 'log' | 'pad' | 'block' | 'ca' | 'comet'. x = left edge in loop space [0, loop).
function laneSpecs() {
  return [
    { row: 3, kind: 'log', len: 3, speed: 30, loop: 340, xs: [0, 113, 226] },
    { row: 4, kind: 'pad', len: 2, speed: -38, loop: 320, xs: [0, 80, 160, 240], sink: [1] },
    { row: 5, kind: 'log', len: 5, speed: 52, loop: 400, xs: [0, 200] },
    { row: 6, kind: 'log', len: 3, speed: 24, loop: 340, xs: [30, 143, 256] },
    { row: 7, kind: 'pad', len: 3, speed: -32, loop: 360, xs: [0, 120, 240], sink: [0] },
    { row: 9, kind: 'block', len: 2, speed: -42, loop: 320, xs: [0, 107, 214] },
    { row: 10, kind: 'ca', len: 2, speed: 20, loop: 512, xs: [] },
    { row: 11, kind: 'block', len: 3, speed: 36, loop: 340, xs: [0, 170] },
    { row: 12, kind: 'comet', len: 1, speed: -118, loop: 0, xs: [0, 0] },
    { row: 13, kind: 'comet', len: 1, speed: 92, loop: 0, xs: [0] },
  ];
}
function buildLanes() {
  return laneSpecs().map(s => {
    const n = s.xs.length;
    const L = { ...s, n, base: s.speed, pad: (s.loop - W) / 2, x: new Float32Array(n), w: s.len * T };
    s.xs.forEach((v, i) => { L.x[i] = v; });
    if (s.kind === 'pad') { L.sinkMask = new Uint8Array(n); (s.sink || []).forEach(i => { L.sinkMask[i] = 1; }); L.phase = new Float32Array(n); for (let i = 0; i < n; i++) L.phase[i] = i * 1.7; }
    if (s.kind === 'block') { L.bits = s.len * 4 - 1; L.ca = new Uint16Array(n * 3); for (let i = 0; i < n; i++) L.ca[i * 3 + 2] = 1 << (L.bits >> 1); L.caT = 0; }
    if (s.kind === 'ca') { L.cells = new Uint8Array(16); L.next = new Uint8Array(16); L.gen = 0; L.genT = 0; L.off = 0; L.pending = false; }
    if (s.kind === 'comet') { L.active = new Uint8Array(n); L.wait = new Float32Array(n); for (let i = 0; i < n; i++) L.wait[i] = 0.6 + i * 1.4; }
    return L;
  });
}
const PAD_FLOAT = 4.2, PAD_WARN = 1.0, PAD_DOWN = 1.6, PAD_RISE = 0.5, PAD_CYCLE = PAD_FLOAT + PAD_WARN + PAD_DOWN + PAD_RISE;
const padState = ph => { const p = ph % PAD_CYCLE; return p < PAD_FLOAT ? 0 : p < PAD_FLOAT + PAD_WARN ? 1 : p < PAD_FLOAT + PAD_WARN + PAD_DOWN ? 2 : 3; };

// ---------------------------------------------------------------- core
function makeCore(canvas, host = {}) {
  const S = sprites();
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const F = pixelFont({ gold: '#f6d36a', white: '#f3efe0', red: '#ff5a5a', green: '#9be37e', dim: '#8a90b0', navy: '#0b1030', blue: '#9fb6ff' });
  const scores = scoreTable(meta.id);
  const sfx = name => host.sfx?.(name);
  let R = rngOf(11);
  const lanes = buildLanes();
  const laneByRow = new Array(16).fill(null); lanes.forEach(l => { laneByRow[l.row] = l; });
  const g = {
    state: 'title', stateT: 0, score: 0, lives: LIVES, level: 1, timer: TIME_LIMIT, x: START_X, row: START_ROW, maxRow: START_ROW,
    hopT: 0, fromX: 0, fromRow: 0, toX: 0, toRow: 0, face: 'up', dead: false, deathKind: '', deathT: 0, bonusNest: -1, bonusT: 0, nextBonus: 8,
    nests: new Uint8Array(5), speedK: 1, extraGiven: false, entry: new Uint8Array([65, 65, 65]), entryPos: 0, entryRank: -1, lastRank: -1, frozen: false, happyT: 0, msg: '', msgT: 0,
  };
  // input queue (no allocation per press)
  const Q = new Int8Array(8); let qh = 0, qt = 0;
  const ACT = { up: 1, down: 2, left: 3, right: 4, a: 5, tap: 6 };
  const parts = { x: new Float32Array(24), y: new Float32Array(24), vx: new Float32Array(24), vy: new Float32Array(24), t: new Float32Array(24), n: 0, kind: 0 };
  let scoreFn = null, lastReported = -1;
  const report = (final = false) => { if (scoreFn && (final || g.score !== lastReported)) { lastReported = g.score; scoreFn({ score: g.score, level: g.level, lives: g.lives, state: g.state, final, best: Math.max(scores.best, g.score) }); } };

  function setSpeeds() { g.speedK = Math.min(2.3, 1 + 0.16 * (g.level - 1)); lanes.forEach(l => { l.speed = l.base * g.speedK; }); }
  function resetPlayer() { g.x = START_X; g.row = START_ROW; g.maxRow = START_ROW; g.hopT = 0; g.face = 'up'; g.dead = false; g.timer = Math.max(18, TIME_LIMIT - (g.level - 1) * 1.5); }
  function newGame(seed) {
    R = rngOf(seed ?? (Date.now() & 0xffffffff)); g.score = 0; g.lives = LIVES; g.level = 1; g.nests.fill(0); g.extraGiven = false; g.bonusNest = -1; g.nextBonus = 8;
    setSpeeds(); resetPlayer(); seedCA(lanes[6]); g.state = 'play'; g.stateT = 0; lastReported = -1; report(); sfx('start');
  }
  function addScore(n) {
    g.score += n;
    if (!g.extraGiven && g.score >= EXTRA_LIFE_AT) { g.extraGiven = true; g.lives++; flash('EXTRA LIFE!'); sfx('extra'); }
    report();
  }
  function flash(m) { g.msg = m; g.msgT = 1.4; }

  // ---- Rule 90 lane: a ring of 16 cells (each 2 tiles wide) that really evolves by Rule 90.
  // Cells that are about to be born show as dashed ghosts first, so it stays fair.
  function seedCA(L) {
    L.cells.fill(0); const k = 2 + Math.floor(R() * 2); let p = Math.floor(R() * 16);
    for (let i = 0; i < k; i++) { L.cells[p % 16] = 1; p += 4 + Math.floor(R() * 4); }
    L.gen = 0; L.genT = 0; L.pending = false;
  }
  function popCA(a) { let n = 0; for (let i = 0; i < 16; i++) n += a[i]; return n; }
  function stepCAPlan(L) { for (let i = 0; i < 16; i++) L.next[i] = L.cells[(i + 15) % 16] ^ L.cells[(i + 1) % 16]; }
  const CA_PERIOD = 2.8, CA_WARN = 0.8;

  function updateLanes(dt) {
    for (let li = 0; li < lanes.length; li++) {
      const L = lanes[li];
      if (L.kind === 'comet') {
        for (let i = 0; i < L.n; i++) {
          if (L.active[i]) { L.x[i] += L.speed * dt; if ((L.speed > 0 && L.x[i] > W + 70) || (L.speed < 0 && L.x[i] < -70)) { L.active[i] = 0; L.wait[i] = (1.2 + R() * 2.2) / Math.sqrt(g.speedK); } }
          else { L.wait[i] -= dt; if (L.wait[i] <= 0) { L.active[i] = 1; L.x[i] = L.speed > 0 ? -60 - i * 90 : W + 60 + i * 90; } }
        }
        continue;
      }
      if (L.kind === 'ca') {
        L.off = (L.off + L.speed * dt + L.loop) % L.loop;
        L.genT += dt;
        if (!L.pending && L.genT > CA_PERIOD - CA_WARN) { stepCAPlan(L); const p = popCA(L.next); if (p === 0 || p > 5) { L.next.fill(0); const k = 2 + Math.floor(R() * 2); let q = Math.floor(R() * 16); for (let i = 0; i < k; i++) { L.next[q % 16] = 1; q += 4 + Math.floor(R() * 4); } } L.pending = true; }
        if (L.genT > CA_PERIOD) { L.cells.set(L.next); L.gen++; L.genT = 0; L.pending = false; }
        continue;
      }
      for (let i = 0; i < L.n; i++) { L.x[i] = (L.x[i] + L.speed * dt + L.loop) % L.loop; }
      if (L.kind === 'pad') for (let i = 0; i < L.n; i++) if (L.sinkMask[i]) L.phase[i] += dt;
      if (L.kind === 'block') {
        L.caT += dt;
        if (L.caT > 0.28) {
          L.caT = 0; const n = L.bits, mask = (1 << n) - 1;
          for (let i = 0; i < L.n; i++) {
            const s = L.ca[i * 3 + 2]; let nx = ((((s << 1) | (s >> (n - 1))) ^ ((s >> 1) | (s << (n - 1)))) & mask);
            if (nx === 0 || nx === mask) nx = 1 << (n >> 1);
            L.ca[i * 3] = L.ca[i * 3 + 1]; L.ca[i * 3 + 1] = s; L.ca[i * 3 + 2] = nx;
          }
        }
      }
    }
  }
  const sx = (L, i) => L.x[i] - L.pad;      // screen left edge of item i
  const caX = (L, i) => ((L.off + i * 32) % L.loop) - L.pad;

  // ---- hazards
  function hitTraffic() {
    const L = laneByRow[g.row]; if (!L) return false;
    const a = g.x - 5, b = g.x + 5;
    if (L.kind === 'block') { for (let i = 0; i < L.n; i++) { const l = sx(L, i) + 1, r = l + L.w - 2; if (b > l && a < r) return true; } }
    else if (L.kind === 'ca') { for (let i = 0; i < 16; i++) if (L.cells[i]) { const l = caX(L, i) + 1, r = l + 28; if (b > l && a < r) return true; } }
    else if (L.kind === 'comet') { for (let i = 0; i < L.n; i++) if (L.active[i] && Math.abs(L.x[i] - g.x) < 10) return true; }
    return false;
  }
  // returns platform speed if Lorenz stands on something, or NaN when in the water
  function platformUnder() {
    const L = laneByRow[g.row]; if (!L) return 0;
    for (let i = 0; i < L.n; i++) {
      const l = sx(L, i), r = l + L.w;
      if (g.x >= l + 3 && g.x <= r - 3) {
        if (L.kind === 'pad' && L.sinkMask[i] && padState(L.phase[i]) === 2) return NaN;
        return L.speed;
      }
    }
    return NaN;
  }
  function die(kind) {
    if (g.state !== 'play') return;
    g.state = 'dying'; g.stateT = 0; g.deathKind = kind; g.hopT = 0; sfx(kind === 'water' ? 'splash' : 'hit');
    const n = 16; parts.n = n; parts.kind = kind === 'water' ? 1 : 0;
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; parts.x[i] = g.x; parts.y[i] = g.row * T + 8; parts.vx[i] = Math.cos(a) * (30 + (i % 3) * 14); parts.vy[i] = Math.sin(a) * (30 + (i % 3) * 14) - (kind === 'water' ? 30 : 0); parts.t[i] = 0; }
  }
  function reachNest() {
    let k = -1; for (let i = 0; i < 5; i++) if (Math.abs(NEST_COLS[i] * T + 8 - g.x) <= 9) k = i;
    if (k < 0 || g.nests[k]) return die('hedge');
    g.nests[k] = 1; let pts = 50 + Math.floor(g.timer) * 10;
    if (k === g.bonusNest) { pts += 200; g.bonusNest = -1; flash('GOLDEN EGG +200'); }
    addScore(pts); sfx('nest'); g.happyT = 0.9;
    let all = true; for (let i = 0; i < 5; i++) if (!g.nests[i]) all = false;
    if (all) { addScore(1000); g.state = 'clear'; g.stateT = 0; sfx('clear'); }
    else resetPlayer();
  }
  function startHop(dx, drow) {
    const tx = Math.max(8, Math.min(W - 8, g.x + dx * T)), tr = Math.max(NEST_ROW, Math.min(START_ROW, g.row + drow));
    if (tx === g.x && tr === g.row) return;
    g.fromX = g.x; g.fromRow = g.row; g.toX = tx; g.toRow = tr; g.hopT = HOP_TIME;
    g.face = drow < 0 ? 'up' : drow > 0 ? 'down' : dx < 0 ? 'left' : 'right'; sfx('hop');
  }
  function processInput() {
    while (qh !== qt) {
      const a = Q[qh]; qh = (qh + 1) & 7;
      if (g.state === 'title' || g.state === 'scores') { if (a === ACT.a || a === ACT.tap || a === ACT.up) { newGame(); } continue; }
      if (g.state === 'entry') { entryInput(a); continue; }
      if (g.state !== 'play' || g.hopT > 0) { if (g.state === 'play') { Q[qt] = a; qt = (qt + 1) & 7; return; } continue; } // keep one buffered hop
      if (a === ACT.up || a === ACT.tap || a === ACT.a) startHop(0, -1); else if (a === ACT.down) startHop(0, 1); else if (a === ACT.left) startHop(-1, 0); else if (a === ACT.right) startHop(1, 0);
    }
  }
  function entryInput(a) {
    const e = g.entry;
    if (a === ACT.up) e[g.entryPos] = e[g.entryPos] >= 90 ? 65 : e[g.entryPos] + 1;
    else if (a === ACT.down) e[g.entryPos] = e[g.entryPos] <= 65 ? 90 : e[g.entryPos] - 1;
    else if (a === ACT.left) g.entryPos = Math.max(0, g.entryPos - 1);
    else if (a === ACT.right) g.entryPos = Math.min(2, g.entryPos + 1);
    else if (a === ACT.a || a === ACT.tap) { if (g.entryPos < 2) g.entryPos++; else saveEntry(); }
    sfx('blip');
  }
  function saveEntry() { g.lastRank = scores.add(String.fromCharCode(g.entry[0], g.entry[1], g.entry[2]), g.score, g.level); g.state = 'scores'; g.stateT = 0; report(true); sfx('nest'); }

  function update(dt) {
    g.stateT += dt; if (g.msgT > 0) g.msgT -= dt; if (g.happyT > 0) g.happyT -= dt;
    if (!g.frozen) updateLanes(dt);
    processInput();
    if (g.state === 'play') {
      if (g.hopT > 0) {
        g.hopT -= dt; const k = 1 - Math.max(0, g.hopT) / HOP_TIME;
        g.x = g.fromX + (g.toX - g.fromX) * k;
        if (g.hopT <= 0) {
          g.x = g.toX; g.row = g.toRow; g.hopT = 0;
          if (g.row < g.maxRow) { g.maxRow = g.row; addScore(10); }
          if (g.row === NEST_ROW) return reachNest();
        }
      } else if (g.row >= RIVER_TOP && g.row <= RIVER_BOT) {
        const sp = platformUnder();
        if (Number.isNaN(sp)) return die('water');
        g.x += sp * dt;
        if (g.x < 3 || g.x > W - 3) return die('edge');
      }
      if (g.hopT <= 0 && hitTraffic()) return die(laneByRow[g.row].kind === 'comet' ? 'comet' : 'block');
      if (g.hopT > 0 && g.hopT < HOP_TIME * 0.5) { const r0 = g.row; g.row = g.toRow; const hit = hitTraffic(); g.row = r0; if (hit) { g.row = g.toRow; g.x = g.toX; return die(laneByRow[g.toRow].kind === 'comet' ? 'comet' : 'block'); } }
      g.timer -= dt; if (g.timer <= 0) { g.timer = 0; return die('time'); }
      if (g.timer < 8 && Math.floor(g.timer * 2) !== Math.floor((g.timer + dt) * 2)) sfx('tick');
      // golden egg bonus in a random empty nest
      g.nextBonus -= dt;
      if (g.bonusNest >= 0) { g.bonusT -= dt; if (g.bonusT <= 0) g.bonusNest = -1; }
      else if (g.nextBonus <= 0) { g.nextBonus = 9 + R() * 8; const k = Math.floor(R() * 5); if (!g.nests[k]) { g.bonusNest = k; g.bonusT = 5.5; } }
    } else if (g.state === 'dying') {
      for (let i = 0; i < parts.n; i++) { parts.x[i] += parts.vx[i] * dt; parts.y[i] += parts.vy[i] * dt; parts.vy[i] += 60 * dt; parts.t[i] += dt; }
      if (g.stateT > 1.1) {
        g.lives--; report();
        if (g.lives <= 0) { g.state = 'over'; g.stateT = 0; report(true); sfx('over'); }
        else { g.state = 'play'; resetPlayer(); }
      }
    } else if (g.state === 'clear') {
      if (g.stateT > 2.0) { g.level++; g.nests.fill(0); setSpeeds(); resetPlayer(); g.state = 'play'; flash('LEVEL ' + g.level); }
    } else if (g.state === 'over') {
      if (g.stateT > 2.2) {
        if (scores.qualifies(g.score)) { g.state = 'entry'; g.entry[0] = g.entry[1] = g.entry[2] = 65; g.entryPos = 0; g.lastRank = -1; }
        else { g.state = 'scores'; g.lastRank = -1; }
        g.stateT = 0;
      }
    }
  }

  // ---- drawing (no allocations in here)
  function drawLanes(t) {
    for (let li = 0; li < lanes.length; li++) {
      const L = lanes[li], y = L.row * T;
      if (L.kind === 'log') {
        for (let i = 0; i < L.n; i++) { const x0 = Math.round(sx(L, i)); if (x0 > W || x0 + L.w < 0) continue; for (let k = 0; k < L.len; k++) ctx.drawImage(k === 0 ? S.logL : k === L.len - 1 ? S.logR : (k & 1 ? S.logM2 : S.logM), x0 + k * T, y + 1); }
      } else if (L.kind === 'pad') {
        for (let i = 0; i < L.n; i++) {
          const x0 = Math.round(sx(L, i)); if (x0 > W || x0 + L.w < 0) continue;
          const st = L.sinkMask[i] ? padState(L.phase[i]) : 0;
          for (let k = 0; k < L.len; k++) {
            const px = x0 + k * T;
            if (st === 0) ctx.drawImage(S.pad, px, y);
            else if (st === 1) ctx.drawImage(S.pad, px + ((Math.floor(t * 20) & 1) ? 1 : -1), y + 1);
            else if (st === 2) ctx.drawImage(S.ripple, px, y);
            else ctx.drawImage(S.padSink, px, y);
          }
        }
      } else if (L.kind === 'block') {
        const fr = L.len === 2 ? S.block2 : S.block3;
        for (let i = 0; i < L.n; i++) {
          const x0 = Math.round(sx(L, i)); if (x0 > W || x0 + L.w < 0) continue;
          ctx.drawImage(fr, x0, y);
          for (let r = 0; r < 3; r++) { const s = L.ca[i * 3 + r]; for (let c = 0; c < L.bits; c++) { ctx.fillStyle = (s >> c) & 1 ? (r === 2 ? '#fff6c0' : '#ffd75a') : '#6a4a0c'; ctx.fillRect(x0 + 3 + c * 4, y + 3 + r * 4, 3, 3); } }
        }
      } else if (L.kind === 'ca') {
        const blink = (Math.floor(t * 8) & 1) === 0;
        for (let i = 0; i < 16; i++) {
          const x0 = Math.round(caX(L, i)); if (x0 > W || x0 + 30 < 0) continue;
          if (L.cells[i]) { if (L.pending && !L.next[i]) { ctx.globalAlpha = blink ? 0.55 : 1; ctx.drawImage(S.caCell, x0, y); ctx.globalAlpha = 1; } else ctx.drawImage(S.caCell, x0, y); }
          else if (L.pending && L.next[i] && blink) ctx.drawImage(S.caGhost, x0, y);
        }
      } else if (L.kind === 'comet') {
        for (let i = 0; i < L.n; i++) {
          if (L.active[i]) { const x0 = Math.round(L.x[i]); if (L.speed > 0) ctx.drawImage(S.tailR, x0 - 56, y + 3); else ctx.drawImage(S.tailL, x0, y + 3); ctx.drawImage(S.cometHead, x0 - 7, y + 1); }
          else if (L.wait[i] < 0.8 && (Math.floor(t * 10) & 1)) { if (L.speed > 0) ctx.drawImage(S.warnR, 2, y + 4); else ctx.drawImage(S.warnL, W - 10, y + 4); }
        }
      }
    }
  }
  function drawNests(t) {
    for (let i = 0; i < 5; i++) {
      const x = NEST_COLS[i] * T;
      if (g.nests[i]) ctx.drawImage(S.nestFull, x, 32);
      else if (i === g.bonusNest) { const b = (Math.sin(t * 8) + 1) * 0.5; ctx.drawImage(S.egg, x + 4, 36 - Math.round(b)); if (b > 0.7) ctx.drawImage(S.spark, x + 11, 34); }
    }
  }
  function drawLorenz(t) {
    let spr = S.up, yOff = 0;
    if (g.state === 'clear' || g.happyT > 0) spr = S.happy;
    else if (g.hopT > 0) { spr = g.face === 'left' ? S.left : g.face === 'right' ? S.right : S.hop; yOff = -Math.round(Math.sin((1 - g.hopT / HOP_TIME) * Math.PI) * 4); }
    else if (g.face === 'left') spr = S.left; else if (g.face === 'right') spr = S.right;
    const row = g.hopT > 0 ? g.fromRow + (g.toRow - g.fromRow) * (1 - g.hopT / HOP_TIME) : g.row;
    if (g.state === 'clear') { ctx.drawImage(S.happy, START_X - 8, START_ROW * T + Math.round(Math.sin(t * 10) * 2)); return; }
    if (g.happyT > 0 && g.row === START_ROW && g.hopT <= 0) { ctx.drawImage(S.happy, Math.round(g.x - 8), START_ROW * T); return; }
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(Math.round(g.x - 5), Math.round(row * T) + 14, 10, 2);
    ctx.drawImage(spr, Math.round(g.x - 8), Math.round(row * T) + yOff);
  }
  function drawDeath() {
    const k = g.stateT;
    if (k < 0.5 && (Math.floor(k * 16) & 1)) ctx.drawImage(S.up, Math.round(g.x - 8), g.row * T);
    for (let i = 0; i < parts.n; i++) {
      if (parts.kind === 1) { ctx.fillStyle = i & 1 ? '#bcd2ff' : '#ffffff'; ctx.fillRect(Math.round(parts.x[i]), Math.round(parts.y[i]), 2, 2); }
      else { ctx.globalAlpha = Math.max(0, 1 - parts.t[i]); ctx.drawImage(S.spark, Math.round(parts.x[i]) - 2, Math.round(parts.y[i]) - 2); ctx.globalAlpha = 1; }
    }
    if (parts.kind === 1 && k < 0.8) { ctx.drawImage(S.ripple, Math.round(g.x - 8), g.row * T); }
  }
  function drawHUD(t) {
    F.text(ctx, 'SCORE', 6, 4, 'red'); F.num(ctx, g.score, 6, 6, 16, 'white');
    F.text(ctx, 'LORENZ', 120, 4, 'gold', 1, 'center'); F.text(ctx, 'CROSSING', 120, 16, 'gold', 1, 'center');
    F.text(ctx, 'HI', 234, 4, 'red', 1, 'right'); F.num(ctx, Math.max(scores.best, g.score), 6, 234, 16, 'white', 1, 'right');
    // bottom: lives, level, timer bar
    for (let i = 0; i < Math.min(g.lives - (g.state === 'dying' ? 0 : 1), 6); i++) ctx.drawImage(S.life, 4 + i * 8, 246);
    F.text(ctx, 'LV', 64, 245, 'dim'); F.num(ctx, g.level, 0, 78, 245, 'gold');
    const full = 100, w = Math.round(full * Math.max(0, g.timer) / TIME_LIMIT);
    F.text(ctx, 'TIME', 128, 245, 'dim');
    ctx.fillStyle = '#1a2148'; ctx.fillRect(156, 246, full, 6);
    ctx.fillStyle = g.timer < 8 ? ((Math.floor(t * 6) & 1) ? '#ff4a50' : '#c8323a') : '#e8c15a'; ctx.fillRect(156 + full - w, 246, w, 6);
  }
  function panel(y, h) { ctx.fillStyle = 'rgba(7,11,28,.86)'; ctx.fillRect(16, y, W - 32, h); ctx.fillStyle = '#e8c15a'; ctx.fillRect(16, y, W - 32, 1); ctx.fillRect(16, y + h - 1, W - 32, 1); ctx.fillStyle = '#c8323a'; ctx.fillRect(16, y + 1, 2, h - 2); ctx.fillRect(W - 18, y + 1, 2, h - 2); }
  function drawScoresTable(y0, t) {
    F.text(ctx, 'HIGH SCORES', 120, y0, 'gold', 1, 'center');
    const L = scores.list;
    if (!L.length) { F.text(ctx, 'NO SCORES YET', 120, y0 + 20, 'dim', 1, 'center'); F.text(ctx, 'BE THE FIRST!', 120, y0 + 32, 'white', 1, 'center'); return; }
    for (let i = 0; i < L.length; i++) {
      const y = y0 + 14 + i * 11, hi = i === g.lastRank && (Math.floor(t * 4) & 1);
      const c = hi ? 'green' : i === 0 ? 'gold' : 'white';
      F.num(ctx, i + 1, 0, 52, y, 'dim', 1, 'right'); F.text(ctx, '.', 54, y, 'dim'); F.text(ctx, L[i].i, 66, y, c); F.num(ctx, L[i].s, 6, 150, y, c, 1, 'right'); F.text(ctx, 'LV', 162, y, 'dim'); F.num(ctx, L[i].l || 1, 0, 176, y, c);
    }
  }
  function render(t) {
    ctx.drawImage(S.bg, 0, 0);
    // twinkles in the river
    for (let i = 0; i < 6; i++) { const k = (t * 0.7 + i * 0.37) % 1; if (k < 0.3) ctx.drawImage(S.spark, (i * 53 + Math.floor(t * 0.7 + i * 0.37) * 37) % 230, 52 + (i * 29) % 70); }
    drawLanes(t); drawNests(t);
    const st = g.state;
    if (st === 'play' || st === 'clear') drawLorenz(t);
    if (st === 'dying') drawDeath();
    drawHUD(t);
    if (g.msgT > 0 && st === 'play') { panel(132, 22); F.text(ctx, g.msg, 120, 140, 'gold', 1, 'center'); }
    if (st === 'title') {
      panel(54, 150);
      F.text(ctx, 'LORENZ', 120, 64, 'gold', 2, 'center'); F.text(ctx, 'CROSSING', 120, 82, 'gold', 2, 'center');
      ctx.drawImage(S.up, 112, 102 + Math.round(Math.sin(t * 4) * 2));
      F.text(ctx, 'HOP LORENZ HOME TO', 120, 124, 'white', 1, 'center'); F.text(ctx, 'THE GOLDEN NESTS', 120, 134, 'white', 1, 'center');
      F.text(ctx, host.touch ? 'SWIPE OR USE THE PAD' : 'ARROWS OR WASD TO HOP', 120, 150, 'dim', 1, 'center');
      F.text(ctx, 'AVOID BLOCKS + COMETS', 120, 160, 'dim', 1, 'center'); F.text(ctx, 'RIDE LOGS + LILY PADS', 120, 170, 'dim', 1, 'center');
      if (Math.floor(t * 2) & 1) F.text(ctx, host.touch ? 'TAP TO START' : 'PRESS UP TO START', 120, 188, 'green', 1, 'center');
    } else if (st === 'clear') {
      panel(110, 40); F.text(ctx, 'ALL NESTS FULL!', 120, 118, 'gold', 1, 'center'); F.text(ctx, 'BONUS 1000', 120, 132, 'green', 1, 'center');
    } else if (st === 'over') {
      panel(104, 48); F.text(ctx, 'GAME OVER', 120, 112, 'red', 2, 'center'); F.text(ctx, 'SCORE', 96, 136, 'dim', 1, 'right'); F.num(ctx, g.score, 0, 104, 136, 'white');
    } else if (st === 'entry') {
      panel(70, 120);
      F.text(ctx, 'NEW HIGH SCORE!', 120, 80, 'gold', 1, 'center'); F.num(ctx, g.score, 0, 120, 94, 'white', 2, 'center');
      F.text(ctx, 'ENTER YOUR INITIALS', 120, 120, 'dim', 1, 'center');
      for (let i = 0; i < 3; i++) {
        const x = 96 + i * 20, on = i === g.entryPos;
        ctx.fillStyle = on ? '#e8c15a' : '#3a4270'; ctx.fillRect(x - 2, 152, 14, 2);
        const code = g.entry[i]; F.text(ctx, String.fromCharCode(code), x, 136, on && (Math.floor(t * 4) & 1) ? 'green' : 'white', 2);
        if (on) { F.text(ctx, '^', x + 2, 128, 'dim'); F.text(ctx, 'v', x + 2, 156, 'dim'); }
      }
      F.text(ctx, host.touch ? 'PAD: PICK  TAP: NEXT' : 'TYPE OR ARROWS, ENTER', 120, 170, 'dim', 1, 'center');
    } else if (st === 'scores') {
      panel(48, 152); drawScoresTable(56, t);
      if (Math.floor(t * 2) & 1) F.text(ctx, host.touch ? 'TAP TO PLAY AGAIN' : 'PRESS UP TO PLAY AGAIN', 120, 188, 'green', 1, 'center');
    }
  }

  return {
    g, lanes, scores, update, render, newGame,
    press(name) { const a = ACT[name]; if (!a) return; const nt = (qt + 1) & 7; if (nt !== qh) { Q[qt] = a; qt = nt; } },
    key(k) { // typing initials straight from the keyboard
      if (g.state !== 'entry') return false;
      if (k.length === 1 && /[a-z0-9]/i.test(k)) { g.entry[g.entryPos] = k.toUpperCase().charCodeAt(0); if (g.entryPos < 2) g.entryPos++; sfx('blip'); return true; }
      if (k === 'Enter') { saveEntry(); return true; }
      if (k === 'Backspace') { g.entryPos = Math.max(0, g.entryPos - 1); return true; }
      return false;
    },
    onScore(fn) { scoreFn = fn; },
    attract() { g.state = 'title'; },
    place(col, row) { g.x = col * T + 8; g.row = row; g.hopT = 0; g.maxRow = Math.min(g.maxRow, row); },
    sx, caX, laneByRow,
  };
}

// ---------------------------------------------------------------- host-facing game object
export function create(host = {}) {
  let core = null, canvas = null, raf = 0, last = 0, acc = 0, t = 0, paused = false, running = false;
  let fps = 0, frames = 0, fpsT = 0, worst = 0;
  function loop(now) {
    raf = 0; if (!running || paused) return;
    let dt = (now - last) / 1000; last = now; if (dt > 0.25) dt = 0.25; if (dt < 0) dt = 0;
    worst = Math.max(worst, dt); frames++; fpsT += dt; if (fpsT >= 1) { fps = frames / fpsT; frames = 0; fpsT = 0; }
    acc += dt;
    while (acc >= STEP) { core.update(STEP); t += STEP; acc -= STEP; }
    core.render(t);
    raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (!raf && running && !paused) { last = performance.now(); raf = requestAnimationFrame(loop); } };
  const api = {
    meta,
    init(cv) { canvas = cv; canvas.width = W; canvas.height = H; core = makeCore(canvas, host); core.render(0); return api; },
    start() { running = true; paused = false; core.attract(); kick(); },
    pause() { if (!running || paused) return; paused = true; if (raf) cancelAnimationFrame(raf); raf = 0; core.render(t); drawPaused(); },
    resume() { if (!paused) return; paused = false; kick(); },
    get paused() { return paused; },
    destroy() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; core = null; },
    onScore(fn) { core?.onScore(fn); },
    press(a) { if (paused) return; core?.press(a); },
    key(k) { return paused ? false : !!core?.key(k); },
    get fps() { return fps; },
    get worstFrame() { return worst; },
    resetStats() { worst = 0; frames = 0; fpsT = 0; },
    // test and Nova hooks
    get debug() { return core && { g: core.g, lanes: core.lanes, scores: core.scores, sx: core.sx, caX: core.caX, laneByRow: core.laneByRow, newGame: core.newGame, place: core.place, step: n => { for (let i = 0; i < n; i++) { core.update(STEP); t += STEP; } core.render(t); } }; },
  };
  function drawPaused() {
    const c = canvas.getContext('2d'); c.fillStyle = 'rgba(7,11,28,.6)'; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(7,11,28,.9)'; c.fillRect(40, 108, 160, 40); c.fillStyle = '#e8c15a'; c.fillRect(40, 108, 160, 1); c.fillRect(40, 147, 160, 1);
    PF = PF || pixelFont({ gold: '#f6d36a', dim: '#8a90b0' }); PF.text(c, 'PAUSED', 120, 116, 'gold', 2, 'center'); PF.text(c, host.touch ? 'TAP PLAY TO GO ON' : 'P TO GO ON', 120, 136, 'dim', 1, 'center');
  }
  return api;
}
let PF = null;

// attract picture for the cabinet screen in the 3D arcade (a live mini demo)
let demo = null;
export function preview(ctx, w, h, t) {
  if (!demo) { const c = document.createElement('canvas'); c.width = W; c.height = H; demo = { c, core: makeCore(c, { touch: false }), t: 0 }; demo.core.g.state = 'title'; }
  const dt = Math.min(0.5, Math.max(0, t - demo.t)); demo.t = t;
  for (let k = 0; k < Math.round(dt / STEP) && k < 30; k++) demo.core.update(STEP);
  demo.core.render(t);
  ctx.imageSmoothingEnabled = false;
  const s = Math.min(w / W, h / H), dw = W * s, dh = H * s;
  ctx.fillStyle = '#05070f'; ctx.fillRect(0, 0, w, h); ctx.drawImage(demo.c, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

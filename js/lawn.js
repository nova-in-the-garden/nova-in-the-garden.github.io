// Automata Lawn: a walkable garden of simple rules in the south of the planet.
// Plot 1 is a looping Nagel–Schreckenberg / Rule 184 road with a hesitation
// slider and a slow-to-start switch, so you can watch phantom jams form and
// see that a jammed road can remember. Plot 2 is Langton's ant; the others
// are marked and waiting.
import * as THREE from 'three';
import { mat, glow, mesh, canvasTexture, glowSprite } from './util.js';

const L = 400;                // cells on the ring (needs ~250+ for the road to remember a jam)
const ROAD_R = 7.1;           // metres, centre of the lane
const CELL = (Math.PI * 2 * ROAD_R) / L;
const VMAX = 5;               // full Nagel–Schreckenberg (Rule 184 is vmax = 1, p = 0)
const P0 = 0.5;               // extra hesitation for a stopped car (VDR / slow-to-start)
const COLORS = [0xe8c15a, 0xc8323a, 0xf6dc8c, 0xd8d0c0, 0x7aa0d8, 0xe07a3a];

function hud() {
  let el = document.getElementById('lawn-hud');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'lawn-hud';
  el.innerHTML = `
    <h3>The ring road</h3>
    <p class="lawn-lead">Rule 184 is a perfectly polite road. A little hesitation makes phantom jams. Slow-to-start gives the road a memory.</p>
    <label class="lawn-row">Hesitation <span class="lawn-val" data-k="p">10%</span>
      <input type="range" min="0" max="50" step="1" value="10" data-a="p">
    </label>
    <label class="lawn-row">Density <span class="lawn-val" data-k="rho">14%</span>
      <input type="range" min="6" max="30" step="1" value="14" data-a="rho">
    </label>
    <label class="lawn-check"><input type="checkbox" data-a="slow"> Slow to start</label>
    <div class="lawn-btns">
      <button type="button" class="pill" data-a="free">Start free-flowing</button>
      <button type="button" class="pill" data-a="jam">Start as a jam</button>
    </div>
    <p class="lawn-flow">Flow <b data-k="flow">—</b> cars / step</p>
    <p class="lawn-hint">At density 14% with slow-to-start, a free start keeps about 0.70 and a jam stays near 0.43. Same road, two memories.</p>
  `;
  document.body.appendChild(el);
  return el;
}

function plaque(w, h, title, body, gold = '#e8c15a') {
  return canvasTexture(Math.round(w * 280), Math.round(h * 280), (c, W, H) => {
    c.fillStyle = '#12182e'; c.fillRect(0, 0, W, H);
    c.strokeStyle = gold; c.lineWidth = 8; c.strokeRect(6, 6, W - 12, H - 12);
    c.fillStyle = gold; c.font = `italic 700 ${Math.round(W * 0.07)}px Georgia, serif`;
    c.textAlign = 'center'; c.textBaseline = 'top';
    c.fillText(title, W / 2, H * 0.08);
    c.fillStyle = '#e9e4d4'; c.font = `${Math.round(W * 0.048)}px Georgia, serif`;
    const words = body.split(' '), lines = []; let line = '';
    const maxW = W * 0.86;
    for (const wd of words) {
      const t = line ? line + ' ' + wd : wd;
      if (c.measureText(t).width > maxW) { lines.push(line); line = wd; } else line = t;
    }
    if (line) lines.push(line);
    const lh = Math.round(W * 0.062);
    let y = H * 0.22;
    for (const ln of lines) { c.fillText(ln, W / 2, y); y += lh; }
  });
}

function signboard(parent, x, z, rot, w, h, title, body, height = 1.35) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; parent.add(g);
  mesh(new THREE.CylinderGeometry(0.06, 0.07, height, 8), mat(0x3a2a18), 0, height / 2, 0, g);
  const tex = plaque(w, h, title, body);
  const matP = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }); matP.userData.keepGlow = true;
  const board = mesh(new THREE.PlaneGeometry(w, h), matP, 0, height + h / 2, 0.03, g);
  mesh(new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.05), mat(0x1a1430), 0, height + h / 2, 0, g);
  return g;
}

function plotPad(parent, x, z, label, body, coming = true) {
  const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
  const bed = mesh(new THREE.BoxGeometry(2.8, 0.08, 2.8), mat(coming ? 0x1a2e24 : 0x163028), 0, 0.04, 0, g);
  mesh(new THREE.BoxGeometry(2.9, 0.05, 0.08), glow(0xe8c15a, 0.4), 0, 0.08, 1.41, g);
  mesh(new THREE.BoxGeometry(2.9, 0.05, 0.08), glow(0xe8c15a, 0.4), 0, 0.08, -1.41, g);
  mesh(new THREE.BoxGeometry(0.08, 0.05, 2.9), glow(0xe8c15a, 0.4), 1.41, 0.08, 0, g);
  mesh(new THREE.BoxGeometry(0.08, 0.05, 2.9), glow(0xe8c15a, 0.4), -1.41, 0.08, 0, g);
  const heading = Math.atan2(x, z);
  signboard(g, 0, 1.15, heading + Math.PI, 1.7, 0.85, label, body);
  return g;
}

// ---------- traffic ----------
function makeRoad(n, start, rho) {
  const count = Math.max(1, Math.round(rho * n));
  const pos = new Array(count), v = new Array(count);
  if (start === 'jam') {
    for (let i = 0; i < count; i++) { pos[i] = i; v[i] = 0; }
  } else {
    for (let i = 0; i < count; i++) { pos[i] = Math.floor(i * n / count) % n; v[i] = VMAX; }
  }
  return { pos, v };
}

function stepRoad(state, n, p, slow, rnd) {
  const { pos, v } = state, N = pos.length;
  const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => pos[a] - pos[b]);
  const gap = new Array(N);
  for (let k = 0; k < N; k++) {
    const i = order[k], j = order[(k + 1) % N];
    gap[i] = (pos[j] - pos[i] - 1 + n) % n;
  }
  let moved = 0;
  for (let i = 0; i < N; i++) {
    const pb = (slow && v[i] === 0) ? P0 : p;
    let nv = Math.min(v[i] + 1, VMAX, gap[i]);
    if (rnd() < pb) nv = Math.max(nv - 1, 0);
    v[i] = nv; moved += nv;
  }
  for (let i = 0; i < N; i++) pos[i] = (pos[i] + v[i]) % n;
  return moved / n;
}

function cellPose(i, frac = 0) {
  const a = -((i + frac) / L) * Math.PI * 2;          // around +z, clockwise so they "drive" naturally
  return { x: Math.sin(a) * ROAD_R, z: Math.cos(a) * ROAD_R, a };
}

export function buildLawn(parent, ctx = {}) {
  const g = new THREE.Group(); parent.add(g);
  const ui = hud();

  // a slightly raised green bed so the road sits on a lawn, not the biome dirt
  mesh(new THREE.CylinderGeometry(14.2, 14.4, 0.06, 40), mat(0x1d3a28), 0, 0.03, 0, g).rotation.y = 0.2;

  // asphalt ring (a thin torus, flattened)
  const asphalt = mesh(new THREE.TorusGeometry(ROAD_R, 0.16, 8, L), mat(0x2a2b32, { roughness: 0.92, metalness: 0.05 }), 0, 0.16, 0, g);
  asphalt.rotation.x = Math.PI / 2;
  const curbIn = mesh(new THREE.TorusGeometry(ROAD_R - 0.22, 0.04, 6, L), glow(0xe8c15a, 0.45), 0, 0.20, 0, g); curbIn.rotation.x = Math.PI / 2;
  const curbOut = mesh(new THREE.TorusGeometry(ROAD_R + 0.22, 0.04, 6, L), glow(0xe8c15a, 0.45), 0, 0.20, 0, g); curbOut.rotation.x = Math.PI / 2;
  // dashed gold centre line
  for (let i = 0; i < L; i += 8) {
    const p = cellPose(i + 0.5);
    const dash = mesh(new THREE.BoxGeometry(0.05, 0.02, 0.55), glow(0xf6dc8c, 0.55), p.x, 0.33, p.z, g);
    dash.rotation.y = p.a;
  }

  // little cars as one instanced mesh (body) plus a cabin instance
  // cars sit on top of the asphalt (tube top is y=0.32). Kept shorter than
  // the free-flow gap (~0.8 m at 14% density) so a jam reads as a pack, not a pile.
  const bodyGeo = new THREE.BoxGeometry(0.28, 0.14, 0.46);
  const cabGeo = new THREE.BoxGeometry(0.20, 0.12, 0.20);
  const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.18, flatShading: true, emissive: 0x1a1208, emissiveIntensity: 0.35 });
  const cabMat = new THREE.MeshStandardMaterial({ color: 0x1a1430, roughness: 0.3, metalness: 0.15, flatShading: true, emissive: 0x0a0814, emissiveIntensity: 0.2 });
  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, L);
  const cabs = new THREE.InstancedMesh(cabGeo, cabMat, L);
  bodies.castShadow = false; cabs.castShadow = false;
  bodies.frustumCulled = false; cabs.frustumCulled = false;
  g.add(bodies, cabs);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const prev = new Float32Array(L); // last fractional position, for smoothing

  // control plinth + Nova's sign, in the infield, facing south (toward a visitor landing from +z)
  const plinth = new THREE.Group(); plinth.position.set(0, 0, 2.15); g.add(plinth);
  mesh(new THREE.CylinderGeometry(0.7, 0.78, 0.45, 8), mat(0x2a2438), 0, 0.22, 0, plinth);
  mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.06, 8), glow(0xe8c15a, 0.5), 0, 0.46, 0, plinth);
  const longNote = "When the cars follow Rule 184 they are perfectly polite: a car moves only if the next cell is empty, and jams never appear out of nowhere. Give a driver a small chance to hesitate, and that's the Nagel-Schreckenberg model — phantom jams form by themselves, and the road carries fewer cars. Flip slow-to-start and a stopped driver hesitates more than a moving one. Then the road can remember. At the same density, a free start keeps flowing (about 0.70 cars a step) and a jammed start stays jammed (about 0.43). Getting out is harder than getting in, so the jam outlives whatever caused it.";
  signboard(plinth, 0, -0.15, 0, 2.15, 1.35,
    "Can a road remember?",
    "Rule 184 is polite. A little hesitation makes phantom jams. Slow-to-start gives the road a memory: same density, two histories, a 39% drop in how many cars get through.",
    0.55);
  const lamp = glowSprite(2.2, 0xffd77a, 0.45); lamp.position.set(0, 2.1, 0); lamp.raycast = () => {}; plinth.add(lamp);

  // plots around the outside of the ring
  const plotR = 11.4;
  const plots = [
    { ang: 0.55, title: "Langton's ant", body: "One ant, two colours, a surprising highway. Walking now.", live: 'ant' },
    { ang: 2.2, title: "Rule 30", body: "Wolfram's chaotic rule. A plot reserved — coming next." },
    { ang: 3.7, title: "Rule 110 gliders", body: "The rule that can compute anything. A plot reserved — coming next." },
    { ang: 5.15, title: "Life", body: "Conway's Game of Life. A plot reserved — coming next." },
  ];
  let ant = null;
  for (const p of plots) {
    const x = Math.sin(p.ang) * plotR, z = Math.cos(p.ang) * plotR;
    const pad = plotPad(g, x, z, p.title, p.body, !p.live);
    if (p.live === 'ant') ant = makeAnt(pad);
  }

  // ---------- simulation state ----------
  const rnd = Math.random;
  const st = { p: 0.10, rho: 0.14, slow: false, start: 'even', flow: 0, ema: 0, steps: 0 };
  let road = makeRoad(L, st.start, st.rho);
  for (let i = 0; i < road.pos.length; i++) prev[i] = road.pos[i];
  let acc = 0, accFlow = 0, accN = 0;

  function reset(kind) {
    st.start = kind === 'jam' ? 'jam' : 'even';
    road = makeRoad(L, st.start, st.rho);
    st.ema = 0; st.flow = 0; st.steps = 0; accFlow = 0; accN = 0;
    for (let i = 0; i < road.pos.length; i++) prev[i] = road.pos[i];
    paintCars(1);
    renderHud();
  }

  function paintCars(k) {
    const n = road.pos.length;
    const color = new THREE.Color();
    for (let i = 0; i < L; i++) {
      if (i >= n) { dummy.scale.setScalar(0); dummy.position.set(0, -2, 0); dummy.updateMatrix(); bodies.setMatrixAt(i, dummy.matrix); cabs.setMatrixAt(i, dummy.matrix); continue; }
      dummy.scale.setScalar(1);
      // unwrap for lerp so we don't jump the long way around the ring
      let a0 = prev[i], a1 = road.pos[i];
      if (a1 + L / 2 < a0) a1 += L;
      if (a0 + L / 2 < a1) a0 += L;
      const frac = a0 + (a1 - a0) * k;
      const p = cellPose(frac);
      dummy.position.set(p.x, 0.40, p.z);
      dummy.rotation.set(0, p.a, 0);
      dummy.updateMatrix();
      bodies.setMatrixAt(i, dummy.matrix);
      col.setHex(COLORS[i % COLORS.length]);
      bodies.setColorAt(i, col);
      dummy.position.y = 0.53;
      dummy.translateZ(-0.04);
      dummy.updateMatrix();
      cabs.setMatrixAt(i, dummy.matrix);
    }
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
    bodies.instanceMatrix.needsUpdate = true;
    cabs.instanceMatrix.needsUpdate = true;
  }

  function renderHud() {
    ui.querySelector('[data-k="p"]').textContent = Math.round(st.p * 100) + '%';
    ui.querySelector('[data-k="rho"]').textContent = Math.round(st.rho * 100) + '%';
    ui.querySelector('[data-k="flow"]').textContent = st.ema ? st.ema.toFixed(3) : '—';
    ui.querySelector('[data-a="p"]').value = String(Math.round(st.p * 100));
    ui.querySelector('[data-a="rho"]').value = String(Math.round(st.rho * 100));
    ui.querySelector('[data-a="slow"]').checked = st.slow;
  }

  ui.addEventListener('input', e => {
    const a = e.target.dataset.a;
    if (a === 'p') { st.p = (+e.target.value) / 100; renderHud(); }
    if (a === 'rho') { st.rho = (+e.target.value) / 100; renderHud(); }
  });
  ui.addEventListener('change', e => {
    const a = e.target.dataset.a;
    if (a === 'slow') { st.slow = !!e.target.checked; renderHud(); }
    if (a === 'rho') reset(st.start);
  });
  ui.addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'free') reset('even');
    if (a === 'jam') reset('jam');
  });

  paintCars(1);
  renderHud();

  const api = {
    get p() { return st.p; }, set p(v) { st.p = Math.min(0.5, Math.max(0, +v)); renderHud(); },
    get rho() { return st.rho; }, set rho(v) { st.rho = Math.min(0.3, Math.max(0.06, +v)); reset(st.start); },
    get slow() { return st.slow; }, set slow(v) { st.slow = !!v; renderHud(); },
    get flow() { return st.ema; },
    get start() { return st.start; },
    get cars() { return road.pos.length; },
    get cells() { return L; },
    reset,
    step(n = 1) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < road.pos.length; k++) prev[k] = road.pos[k];
        sum += stepRoad(road, L, st.p, st.slow, rnd);
      }
      st.flow = n ? sum / n : 0;
      st.ema = st.flow;
      st.steps += n;
      paintCars(1);
      renderHud();
      return st.flow;
    },
    setActive(on) { document.body.classList.toggle('at-lawn', !!on); },
    viewPoint() {
      // 3/4 from the south-east, low enough that the cars read as cars
      return {
        from: new THREE.Vector3(7.8, 4.4, 11.6),
        at: new THREE.Vector3(0, 0.4, 1.2),
      };
    },
  };

  if (ctx) ctx.lawn = api;

  const STEP = 0.11; // seconds per sim step (a little faster than a heartbeat)
  return {
    api,
    update(t, dt) {
      acc += dt;
      while (acc >= STEP) {
        acc -= STEP;
        for (let i = 0; i < road.pos.length; i++) prev[i] = road.pos[i];
        const f = stepRoad(road, L, st.p, st.slow, rnd);
        accFlow += f; accN++; st.steps++;
        if (accN >= 8) { st.flow = accFlow / accN; st.ema = st.ema ? st.ema * 0.6 + st.flow * 0.4 : st.flow; accFlow = 0; accN = 0; renderHud(); }
      }
      paintCars(1 - acc / STEP);
      if (ant) ant.update(t, dt);
    },
  };
}

// Langton's ant on a small board (plot 2). Cheap: one canvas texture, many steps per tick.
function makeAnt(parent) {
  const N = 64;
  const cv = document.createElement('canvas'); cv.width = N; cv.height = N;
  const c = cv.getContext('2d', { willReadFrequently: true });
  const img = c.createImageData(N, N);
  const pix = img.data;
  const grid = new Uint8Array(N * N);
  const ink = [232, 193, 90], paper = [16, 28, 24];
  function put(i, on) {
    const o = i * 4, col = on ? ink : paper;
    pix[o] = col[0]; pix[o + 1] = col[1]; pix[o + 2] = col[2]; pix[o + 3] = 255;
  }
  for (let i = 0; i < N * N; i++) put(i, 0);
  c.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NEAREST; tex.minFilter = THREE.NEAREST;
  const board = mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: tex }), 0, 0.12, 0, parent);
  board.rotation.x = -Math.PI / 2;
  const antMesh = mesh(new THREE.SphereGeometry(0.05, 8, 6), glow(0xc8323a, 1.4), 0, 0.2, 0, parent);
  let x = N >> 1, y = N >> 1, dir = 0; // 0 +x, 1 +y, 2 -x, 3 -y
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  let dirty = true;
  function steps(n) {
    for (let k = 0; k < n; k++) {
      const i = y * N + x;
      if (grid[i]) { grid[i] = 0; dir = (dir + 3) & 3; } // white (gold) → turn left, flip
      else { grid[i] = 1; dir = (dir + 1) & 3; }
      put(i, grid[i]);
      x = (x + DIRS[dir][0] + N) % N;
      y = (y + DIRS[dir][1] + N) % N;
    }
    dirty = true;
  }
  steps(400); // already a little way into the walk
  return {
    update(t, dt) {
      steps(18); // highway appears after ~10k steps; 18/frame ≈ 1k/sec
      if (dirty) { c.putImageData(img, 0, 0); tex.needsUpdate = true; dirty = false; }
      const lx = (x + 0.5) / N * 2.4 - 1.2, lz = (y + 0.5) / N * 2.4 - 1.2;
      antMesh.position.set(lx, 0.2, lz);
    },
  };
}

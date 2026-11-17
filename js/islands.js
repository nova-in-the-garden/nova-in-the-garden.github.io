// Floating islands and the little things that live on them.
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { rng, rule90, mat, glow, mesh, jitter, glowSprite, textSprite, canvasTexture } from './util.js';
import { buildCottage } from './house.js';
import { buildStudio } from './studio.js';
import { paintFront, CARD_W, CARD_H } from './postcard.js';

export const GRASS = { hearth: 0x23402f, emergence: 0x1d3b2a, starDock: 0x1d2645, pixelStudio: 0x2a2347, wordWell: 0x24324a, workshop: 0x2f2a24, cornerCup: 0x3a2a22, printShop: 0x22283e, arcade: 0x24422c };

export function islandBase(isl, r, seed) {
  const R = rng(seed);
  const g = new THREE.Group();
  const topGeo = new THREE.CylinderGeometry(r, r * 0.96, 0.8, 22, 1);
  const top = mesh(jitter(topGeo, 0.12, R), mat(GRASS[isl.id] ?? 0x22344a), 0, -0.4, 0, g);
  // rocky underside: an upside-down jagged cone
  const rockGeo = jitter(new THREE.ConeGeometry(r * 0.98, r * 1.25, 14, 4), r * 0.09, R);
  const rock = mesh(rockGeo, mat(0x3a3550), 0, -0.8 - r * 0.62, 0, g); rock.rotation.x = Math.PI;
  // golden rim
  const rim = mesh(new THREE.TorusGeometry(r * 0.985, 0.07, 6, 48), glow(0xe8c15a, 0.9), 0, 0.02, 0, g); rim.rotation.x = Math.PI / 2;
  // little crystals hanging below
  for (let i = 0; i < 5; i++) {
    const a = R() * Math.PI * 2, d = R() * r * 0.5;
    const c = mesh(new THREE.OctahedronGeometry(0.25 + R() * 0.3), glow(i % 2 ? 0xe8c15a : 0x8fa8ff, 0.7), Math.cos(a) * d, -r * 0.9 - R() * r * 0.4, Math.sin(a) * d, g);
    c.scale.y = 2;
  }
  // tufts and stones
  for (let i = 0; i < Math.round(r * 2.2); i++) {
    const a = R() * Math.PI * 2, d = r * (0.55 + R() * 0.4);
    mesh(new THREE.ConeGeometry(0.12, 0.45 + R() * 0.4, 4), mat(0x3f6b45), Math.cos(a) * d, 0.2, Math.sin(a) * d, g);
  }
  g.userData.top = top;
  return g;
}

// On the tiny planet a place stands on level ground (the planet's flattened cap),
// so it only needs an invisible pad: Nova's free-spot test and click-to-visit hit it.
export function placeBase(isl, r) {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.CircleGeometry(r, 28), new THREE.MeshBasicMaterial({ visible: false }));
  pad.rotation.x = -Math.PI / 2; pad.position.y = 0.0; pad.userData.pad = true; g.add(pad);
  g.userData.top = pad;
  return g;
}

// ---------- decor helpers ----------
function lantern(parent, x, z, h = 2.4) {
  const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
  mesh(new THREE.CylinderGeometry(0.07, 0.1, h, 6), mat(0x1b1b24), 0, h / 2, 0, g);
  mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), glow(0xffd77a, 2.2), 0, h + 0.2, 0, g);
  mesh(new THREE.ConeGeometry(0.45, 0.35, 4), mat(0x1b1b24), 0, h + 0.68, 0, g).rotation.y = Math.PI / 4;
  const s = glowSprite(3.2, 0xffd77a, 0.8); s.position.y = h + 0.2; g.add(s);
  return g;
}
function tree(parent, x, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); parent.add(g);
  mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.8, 6), mat(0x4a3424), 0, 0.4, 0, g);
  for (let i = 0; i < 3; i++) mesh(new THREE.ConeGeometry(1.1 - i * 0.28, 1.2, 7), mat(0x1f4a35), 0, 1.1 + i * 0.7, 0, g);
  return g;
}

function christmasTree(parent, x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
  mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.7, 6), mat(0x4a3424), 0, 0.35, 0, g);
  const H = 4.2, base = 1.9, layers = 5;
  for (let i = 0; i < layers; i++) {
    const r = base * (1 - i / layers) + 0.3, y = 0.7 + i * (H / layers) * 0.85;
    mesh(new THREE.ConeGeometry(r, 1.6, 9), mat(0x17402c), 0, y + 0.8, 0, g);
  }
  // ornaments: 8 rows of Rule 90 from one lit cell at the top, wrapped onto the cone
  const rows = rule90(8), gold = glow(0xf2cd62, 1.4), red = glow(0xd2343c, 1.1);
  const lights = [];
  rows.forEach((row, ri) => {
    const y = 0.7 + H - 0.35 - ri * (H - 0.5) / 8;
    const rad = 0.25 + (ri + 0.6) * (base * 0.95) / 8;
    row.forEach((v, ci) => {
      if (!v) return;
      const a = (ci - (row.length - 1) / 2) * (Math.PI * 0.95 / 8) / 1.6;
      const o = mesh(new THREE.IcosahedronGeometry(0.11, 0), ri % 3 === 2 ? red : gold, Math.sin(a) * rad, y, Math.cos(a) * rad, g);
      lights.push(o);
    });
  });
  const star = mesh(new THREE.OctahedronGeometry(0.38, 0), glow(0xffe08a, 2.6), 0, 0.7 + H + 0.55, 0, g);
  const halo = glowSprite(2.6, 0xffe08a, 0.9); halo.position.copy(star.position); g.add(halo);
  return (t) => { star.rotation.y = t; lights.forEach((o, i) => { o.material = (Math.sin(t * 2 + i * 1.7) > -0.6) ? o.material : o.material; o.scale.setScalar(0.8 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 2.1))); }); };
}

function thanksgivingTable(parent, x, z, rot = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; parent.add(g);
  const wood = mat(0x6b4426);
  mesh(new THREE.BoxGeometry(2.6, 0.12, 1.3), wood, 0, 0.85, 0, g);
  for (const [lx, lz] of [[-1.15, -.5], [1.15, -.5], [-1.15, .5], [1.15, .5]]) mesh(new THREE.BoxGeometry(0.1, 0.85, 0.1), wood, lx, 0.42, lz, g);
  mesh(new THREE.BoxGeometry(2.7, 0.02, 0.5), mat(0xb8862b), 0, 0.92, 0, g); // gold runner
  // turkey
  const turkey = new THREE.Group(); turkey.position.set(0, 0.95, 0); g.add(turkey);
  mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 12), mat(0xe9e4d4), 0, 0, 0, turkey);
  const tb = mesh(new THREE.SphereGeometry(0.32, 10, 8), mat(0xa65a22, { roughness: .5 }), 0, 0.2, 0, turkey); tb.scale.set(1, 0.75, 1.25);
  for (const s of [-1, 1]) { const d = mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.35, 6), mat(0x9a521f), s * 0.24, 0.25, 0.28, turkey); d.rotation.x = 0.9; d.rotation.z = -s * 0.4; mesh(new THREE.SphereGeometry(0.05, 6, 4), mat(0xf3eee0), s * 0.32, 0.36, 0.42, turkey); }
  // mashed potatoes with butter
  const mp = new THREE.Group(); mp.position.set(-0.85, 0.95, 0.15); g.add(mp);
  mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.14, 10), mat(0x2b3a6b), 0, 0.07, 0, mp);
  mesh(new THREE.SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xf4efe0), 0, 0.13, 0, mp);
  mesh(new THREE.BoxGeometry(0.09, 0.05, 0.09), mat(0xf6d55c), 0, 0.33, 0, mp);
  // Oreo pie: dark crumb crust, cookies-and-cream filling, whipped swirls, whole Oreos standing up
  const pie = new THREE.Group(); pie.position.set(0.85, 0.95, 0.12); g.add(pie);
  mesh(new THREE.CylinderGeometry(0.34, 0.28, 0.16, 14), mat(0x1c1414), 0, 0.08, 0, pie);
  mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.03, 14), mat(0xe8e2d6), 0, 0.17, 0, pie);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    mesh(new THREE.ConeGeometry(0.06, 0.1, 6), mat(0xffffff), Math.cos(a) * 0.22, 0.23, Math.sin(a) * 0.22, pie);
    const o = new THREE.Group(); o.position.set(Math.cos(a + .5) * 0.2, 0.25, Math.sin(a + .5) * 0.2); o.rotation.set(Math.PI / 2, 0, a); pie.add(o);
    mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.025, 10), mat(0x151012), 0, 0.02, 0, o);
    mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.015, 10), mat(0xf5f2ea), 0, 0, 0, o);
    mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.025, 10), mat(0x151012), 0, -0.02, 0, o);
  }
  // two place settings: one for Nova, one for Lorenz
  for (const s of [-1, 1]) {
    mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 14), mat(0xf2ede0), s * 0.4, 0.93, s * 0.45, g);
    mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat(0x5a3a22), s * 0.4, 0.25, s * 1.0, g);
  }
  const c1 = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6), mat(0xf3ead2), -0.4, 1.08, -0.2, g);
  const flame = glowSprite(0.5, 0xffc060, 1); flame.position.set(-0.4, 1.28, -0.2); g.add(flame);
  return (t) => { flame.scale.setScalar(0.45 + Math.sin(t * 9) * 0.05); c1.rotation.y = t; };
}

function pond(parent, x, z, r) {
  const water = mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshStandardMaterial({ color: 0x1d3466, emissive: 0x0a1638, roughness: 0.15, metalness: 0.3 }), x, 0.03, z, parent);
  water.rotation.x = -Math.PI / 2;
  const shore = mesh(new THREE.TorusGeometry(r, 0.12, 5, 28), mat(0x6a6070), x, 0.03, z, parent); shore.rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) { const p = mesh(new THREE.CircleGeometry(0.3, 7), mat(0x3e7a4a), x + Math.cos(i * 2.2) * r * 0.6, 0.05, z + Math.sin(i * 2.2) * r * 0.6, parent); p.rotation.x = -Math.PI / 2; }
  return water;
}

// ---------- island decor ----------
const DECOR = {
  hearth(g, isl, ctx) {
    const ups = [];
    lantern(g, 0.6, 0.8, 2.6);
    // Nova's House: a walk-in cottage (js/house.js); clicking it steps inside
    const house = buildCottage(g, -5.1, -4.7, 0.8); house.group.scale.setScalar(1.5); ctx.cottage = house;   // a bit bigger so it reads from orbit ups.push(house.update);
    const sign = textSprite("Nova's House", { size: 1.6, sub: 'click to step inside' }); sign.material.sizeAttenuation = false; sign.scale.multiplyScalar(0.026 / 1.6); sign.position.set(1.5, 3.3, 1.9); sign.renderOrder = 9; sign.material.depthTest = false; house.group.add(sign);
    ups.push(christmasTree(g, 3.8, -3.0));
    ups.push(thanksgivingTable(g, 3.6, 3.6, -0.5));
    ctx.pond = { x: -3.2, z: 2.6, r: 2.2 }; pond(g, -3.2, 2.6, 2.2);
    ctx.avoid = [{ x: -5.1, z: -4.7, r: 4.0 }, { x: -3.0, z: -2.3, r: 1.1 }, { x: 3.8, z: -3.0, r: 2.2 }, { x: 3.6, z: 3.6, r: 1.9 }, { x: 0.6, z: 0.8, r: 0.6 }, { x: -3.2, z: -7.6, r: 1.6 }];
    return (t, dt) => ups.forEach(u => u(t, dt));
  },
  emergence(g, isl) {
    // Game of Life moss, live
    const N = 22, cell = 0.55, R = rng(2026);
    let grid = Array.from({ length: N * N }, () => R() < 0.32 ? 1 : 0);
    const inside = i => { const x = i % N - N / 2 + .5, y = Math.floor(i / N) - N / 2 + .5; return Math.hypot(x, y) < N / 2 - 0.5; };
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(cell * 0.9, 0.3, cell * 0.9), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), N * N);
    const M = new THREE.Matrix4(), C = new THREE.Color(); g.add(im);
    const live = new THREE.Color(0x7fd66a), dead = new THREE.Color(0x24402c);
    const age = new Float32Array(N * N);
    const draw = () => { for (let i = 0; i < N * N; i++) { const x = (i % N - N / 2 + .5) * cell, z = (Math.floor(i / N) - N / 2 + .5) * cell; const on = grid[i] && inside(i); M.makeScale(1, on ? 1 + Math.min(age[i], 6) * 0.25 : 0.25, 1); M.setPosition(x, on ? 0.15 + Math.min(age[i], 6) * 0.04 : 0.02, z); im.setMatrixAt(i, M); C.copy(on ? live : dead); if (on) C.lerp(new THREE.Color(0xe8c15a), Math.min(age[i], 8) / 10); im.setColorAt(i, C); } im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; };
    const step = () => { const nx = grid.slice(); let alive = 0; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += grid[((y + dy + N) % N) * N + (x + dx + N) % N]; const i = y * N + x; nx[i] = (grid[i] && (n === 2 || n === 3)) || (!grid[i] && n === 3) ? 1 : 0; age[i] = nx[i] ? age[i] + 1 : 0; alive += nx[i]; } grid = nx; if (alive < 20) for (let i = 0; i < N * N; i++) if (R() < 0.25) grid[i] = 1; };
    draw();
    // fireflies: a tiny flock
    const F = 30, pos = [], vel = [], geo = new THREE.BufferGeometry(), arr = new Float32Array(F * 3);
    for (let i = 0; i < F; i++) { pos.push(new THREE.Vector3((R() - .5) * 8, 2 + R() * 2, (R() - .5) * 8)); vel.push(new THREE.Vector3(R() - .5, 0, R() - .5)); }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xfff09a, size: 0.35, map: glowSpriteTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); g.add(pts);
    let acc = 0; const center = new THREE.Vector3(0, 3, 0), tmp = new THREE.Vector3();
    return (t, dt) => {
      acc += dt; if (acc > 0.45) { acc = 0; step(); draw(); }
      for (let i = 0; i < F; i++) {
        tmp.set(0, 0, 0); let n = 0; const al = new THREE.Vector3();
        for (let j = 0; j < F; j++) { if (i === j) continue; const d = pos[i].distanceTo(pos[j]); if (d < 2.2) { al.add(vel[j]); n++; if (d < 0.7) tmp.add(pos[i].clone().sub(pos[j]).multiplyScalar(0.6)); } }
        if (n) vel[i].lerp(al.divideScalar(n), 0.03); vel[i].add(tmp.multiplyScalar(dt)); vel[i].add(center.clone().sub(pos[i]).multiplyScalar(0.12 * dt));
        vel[i].y += Math.sin(t * 2 + i) * 0.02; vel[i].clampLength(0.6, 1.6); pos[i].addScaledVector(vel[i], dt);
        arr.set([pos[i].x, pos[i].y, pos[i].z], i * 3);
      }
      geo.attributes.position.needsUpdate = true;
    };
  },
  starDock(g, isl, ctx) {
    const dock = mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.4, 16), mat(0x4a4f6e), 0, 0.2, 0, g);
    const dome = mesh(new THREE.SphereGeometry(2.0, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xc9ccd8, { metalness: .3, roughness: .4 }), -3.5, 0, -2, g);
    mesh(new THREE.BoxGeometry(0.6, 2.2, 0.1), mat(0x101422), -3.5, 1.2, -0.05, g).rotation.x = -0.6;
    const scope = new THREE.Group(); scope.position.set(0.5, 0.4, 0.5); g.add(scope);
    for (let i = 0; i < 3; i++) { const l = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2, 5), mat(0x2a2a33), Math.cos(i * 2.1) * 0.5, 0.95, Math.sin(i * 2.1) * 0.5, scope); l.rotation.set(Math.sin(i * 2.1) * 0.25, 0, -Math.cos(i * 2.1) * 0.25); }
    const tube = mesh(new THREE.CylinderGeometry(0.28, 0.38, 2.6, 10), mat(0xe8c15a, { metalness: .6, roughness: .35 }), 0, 2.4, 0, scope); tube.rotation.set(-0.8, 0, 0.3);
    const orbit = new THREE.Group(); orbit.position.set(0, 6, 0); g.add(orbit);
    const planet = mesh(new THREE.IcosahedronGeometry(0.7, 2), mat(0x5fa0c8), 3.2, 0, 0, orbit);
    const ring = mesh(new THREE.TorusGeometry(1.1, 0.06, 4, 32), glow(0xe8c15a, 0.7), 0, 0, 0, planet); ring.rotation.x = 1.2;
    const sun = mesh(new THREE.IcosahedronGeometry(0.5, 1), glow(0xffe8a0, 2), 0, 0, 0, orbit); const sg = glowSprite(3, 0xffe0a0, .8); orbit.add(sg);
    const path = mesh(new THREE.TorusGeometry(3.2, 0.015, 3, 64), glow(0x8fa8ff, 0.6), 0, 0, 0, orbit); path.rotation.x = Math.PI / 2;
    const kiosk = ctx?.postcards?.planets?.length ? postcardKiosk(g, ctx.postcards) : null;
    return t => { orbit.rotation.y = t * 0.4; planet.rotation.y = t; if (kiosk) kiosk(t); };
  },
  pixelStudio(g, isl, ctx) {
    // interactive studio (gallery wall, easels, radio) when data/studio.json or data/radio.json exist
    if (ctx.world.studio || ctx.world.radio) { const st = buildStudio(g, isl, ctx); ctx.studio = st; return (t, dt) => st.update(t, dt, ctx.radioLevel ? ctx.radioLevel() : 0); }
    const loader = new THREE.TextureLoader();
    const imgs = ctx.world.easels || [];
    const spots = [[-3, -1.5, 0.5], [0, -3.2, 0], [3, -1.5, -0.5], [-0.5, 2.5, Math.PI - .3]];
    imgs.slice(0, 4).forEach((src, i) => {
      const [x, z, ry] = spots[i]; const e = new THREE.Group(); e.position.set(x, 0, z); e.rotation.y = ry; g.add(e);
      const wood = mat(0x7a5532);
      for (const s of [-1, 1]) { const l = mesh(new THREE.BoxGeometry(0.1, 3, 0.1), wood, s * 0.7, 1.5, 0, e); l.rotation.z = s * 0.08; }
      mesh(new THREE.BoxGeometry(0.1, 2.6, 0.1), wood, 0, 1.3, -0.5, e).rotation.x = -0.25;
      const big = i === 0; const w = big ? 2.4 : 1.6, h = big ? 1.6 : 1.6;
      mesh(new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.06), glow(0xc99a2e, 0.25), 0, 2.2, 0.06, e);
      const tex = loader.load(src); tex.colorSpace = THREE.SRGBColorSpace;
      mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }), 0, 2.2, 0.1, e);
    });
    // floating music notes for "Rule 90 sings"
    const notes = []; for (let i = 0; i < 6; i++) { const n = textSprite('♪', { size: 0.7, bg: 'rgba(0,0,0,0)' }); g.add(n); notes.push(n); }
    return t => notes.forEach((n, i) => { const p = (t * 0.25 + i / 6) % 1; n.position.set(2.5 + Math.sin(p * 6 + i) * 0.6, 1.5 + p * 4, 2 + Math.cos(i) * 0.6); n.material.opacity = Math.sin(p * Math.PI); });
  },
  wordWell(g, isl) {
    const stone = mat(0x6b6680);
    const well = mesh(new THREE.CylinderGeometry(1.3, 1.4, 1.1, 12, 1, true), stone, 0, 0.55, 0, g); well.material.side = THREE.DoubleSide;
    mesh(new THREE.TorusGeometry(1.32, 0.15, 5, 16), stone, 0, 1.1, 0, g).rotation.x = Math.PI / 2;
    const w = mesh(new THREE.CircleGeometry(1.25, 16), glow(0x5b78d8, 0.9), 0, 0.6, 0, g); w.rotation.x = -Math.PI / 2;
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.14, 2.2, 0.14), mat(0x5a3a22), s * 1.2, 1.6, 0, g);
    const roof = mesh(new THREE.ConeGeometry(1.8, 0.9, 4), mat(0x2a2d55), 0, 3.1, 0, g); roof.rotation.y = Math.PI / 4;
    const words = (isl.floatingWords || []).map((wd, i) => { const s = textSprite(wd.text, { size: 0.75, sub: wd.hint }); g.add(s); return s; });
    return t => words.forEach((s, i) => { const p = (t * 0.07 + i / words.length) % 1; const a = i * 1.3 + t * 0.1; s.position.set(Math.cos(a) * 1.6 * p, 1 + p * 7, Math.sin(a) * 1.6 * p); s.material.opacity = Math.sin(p * Math.PI); });
  },
  workshop(g) {
    const wood = mat(0x7a5532);
    mesh(new THREE.BoxGeometry(3, 0.15, 1.3), wood, 0, 1.0, -1.5, g);
    for (const [x, z] of [[-1.35, -2.0], [1.35, -2.0], [-1.35, -1.0], [1.35, -1.0]]) mesh(new THREE.BoxGeometry(0.12, 1, 0.12), wood, x, 0.5, z, g);
    // gear
    const gear = new THREE.Group(); gear.position.set(-0.6, 1.9, -1.6); g.add(gear);
    mesh(new THREE.TorusGeometry(0.5, 0.15, 6, 16), mat(0xe8c15a, { metalness: .7, roughness: .3 }), 0, 0, 0, gear);
    for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2; const tth = mesh(new THREE.BoxGeometry(0.2, 0.25, 0.22), mat(0xe8c15a, { metalness: .7, roughness: .3 }), Math.cos(a) * 0.7, Math.sin(a) * 0.7, 0, gear); tth.rotation.z = a; }
    // ball of yarn + hyperbolic crochet ruffle
    const yarn = mesh(new THREE.IcosahedronGeometry(0.45, 2), mat(0xc62f37), 0.9, 1.53, -1.4, g);
    for (let i = 0; i < 4; i++) { const tr = mesh(new THREE.TorusGeometry(0.46, 0.025, 4, 24), mat(0x9e2229), 0, 0, 0, yarn); tr.rotation.set(i, i * .7, 0); }
    const pts = []; const N = 120; const geo = new THREE.BufferGeometry(); const pos = [];
    for (let ri = 0; ri < 6; ri++) for (let i = 0; i < N; i++) { const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2; const r0 = 0.15 + ri * 0.18, r1 = r0 + 0.18; const y = (r, a) => Math.sin(a * (3 + ri * 2)) * 0.05 * ri * ri * 0.5; pos.push(Math.cos(a0) * r0, y(r0, a0) * 0.5, Math.sin(a0) * r0, Math.cos(a0) * r1, y(r1, a0), Math.sin(a0) * r1, Math.cos(a1) * r1, y(r1, a1), Math.sin(a1) * r1, Math.cos(a0) * r0, y(r0, a0) * 0.5, Math.sin(a0) * r0, Math.cos(a1) * r1, y(r1, a1), Math.sin(a1) * r1, Math.cos(a1) * r0, y(r0, a1) * 0.5, Math.sin(a1) * r0); }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
    const ruffle = mesh(geo, mat(0xe8c15a, { side: THREE.DoubleSide }), 2.2, 0.5, 1.5, g);
    mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.5, 6), mat(0x7a5532), 2.2, 0.25, 1.5, g);
    // the session chime
    const bell = new THREE.Group(); bell.position.set(-2.4, 0, 1.2); g.add(bell);
    mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), wood, 0, 1.3, 0, bell); mesh(new THREE.BoxGeometry(0.9, 0.12, 0.12), wood, 0.4, 2.6, 0, bell);
    const b = mesh(new THREE.ConeGeometry(0.32, 0.5, 10, 1, true), mat(0xe8c15a, { metalness: .8, roughness: .3, side: THREE.DoubleSide }), 0.75, 2.25, 0, bell);
    tree(g, 2.6, -2.4, 0.9);
    return t => { gear.rotation.z = t * 0.5; b.rotation.z = Math.sin(t * 2) * 0.15; ruffle.rotation.y = t * 0.2; };
  },
  cornerCup(g) {
    const shop = new THREE.Group(); shop.position.set(0, 0, -0.8); g.add(shop);
    mesh(new THREE.BoxGeometry(3.4, 2.4, 2.4), mat(0x7a4b34), 0, 1.2, 0, shop);
    mesh(new THREE.BoxGeometry(3.6, 0.18, 2.6), mat(0x2a1a14), 0, 2.48, 0, shop);
    mesh(new THREE.BoxGeometry(2.4, 1.0, 0.05), glow(0xffc87a, 1.2), -0.35, 1.25, 1.21, shop);
    mesh(new THREE.BoxGeometry(0.6, 1.4, 0.05), mat(0x2a1a14), 1.2, 0.7, 1.21, shop);
    // night-and-gold striped awning
    const aw = canvasTexture(256, 16, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#e8c15a' : '#141c3c'; c.fillRect(i * w / 8, 0, w / 8 + 1, h); } });
    const awn = mesh(new THREE.BoxGeometry(3.6, 0.06, 0.9), new THREE.MeshStandardMaterial({ map: aw, roughness: .9 }), 0, 2.0, 1.55, shop); awn.rotation.x = 0.35;
    const sign = textSprite('The Corner Cup', { size: 0.7 }); sign.position.set(0, 3.15, 0.8); shop.add(sign);
    // a giant iced macchiato on the roof: milk, espresso marks, caramel at the bottom
    const cup = new THREE.Group(); cup.position.set(0.9, 2.55, -0.3); shop.add(cup);
    mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.25, 12), new THREE.MeshStandardMaterial({ color: 0xc98b3a, roughness: .4 }), 0, 0.13, 0, cup);
    mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.5, 12), mat(0xefe6d6), 0, 0.5, 0, cup);
    mesh(new THREE.CylinderGeometry(0.36, 0.34, 0.25, 12), mat(0x6b3d1e), 0, 0.88, 0, cup);
    mesh(new THREE.CylinderGeometry(0.4, 0.26, 1.15, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: .22, roughness: .1 }), 0, 0.58, 0, cup);
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), mat(0x2b5d3a), 0.12, 1.2, 0, cup).rotation.z = -0.25;
    for (let i = 0; i < 11; i++) mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshStandardMaterial({ color: 0xdff4ff, transparent: true, opacity: .5 }), Math.cos(i * 2.3) * 0.2, 0.35 + (i % 4) * 0.18, Math.sin(i * 2.3) * 0.2, cup);
    // string lights
    const bulbs = [];
    for (let i = 0; i <= 14; i++) { const u = i / 14; const b = mesh(new THREE.SphereGeometry(0.07, 6, 4), glow(i % 3 ? 0xffd77a : 0xd2343c, 2), -1.8 + u * 3.6, 2.35 - Math.sin(u * Math.PI) * 0.35, 2.05, shop); bulbs.push(b); }
    // two little tables
    for (const x of [-1.2, 1.4]) { mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 10), mat(0x2a1a14), x, 0.8, 2.2, g); mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 6), mat(0x1b1b24), x, 0.4, 2.2, g); mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.18, 8), mat(0xe9e4d4), x, 0.92, 2.2, g); }
    return t => bulbs.forEach((b, i) => b.scale.setScalar(0.8 + 0.3 * Math.sin(t * 3 + i)));
  },
  printShop(g, isl, ctx) {
    // pedestals with any STL models found in projects/3dprint
    const prints = (isl.artifacts || []).filter(a => a.stl);
    // a little printer: frame + bed + nozzle that moves
    const pr = new THREE.Group(); pr.position.set(0, 0, -2.6); g.add(pr);
    const frame = mat(0x2a2d3e, { metalness: .4 });
    for (const [x, z] of [[-1, -.8], [1, -.8], [-1, .8], [1, .8]]) mesh(new THREE.BoxGeometry(0.1, 2.6, 0.1), frame, x, 1.3, z, pr);
    mesh(new THREE.BoxGeometry(2.1, 0.1, 1.7), frame, 0, 2.6, 0, pr);
    mesh(new THREE.BoxGeometry(1.6, 0.08, 1.4), mat(0x111111), 0, 0.5, 0, pr);
    const noz = mesh(new THREE.ConeGeometry(0.12, 0.3, 6), glow(0xe8c15a, 1), 0, 1.4, 0, pr); noz.rotation.x = Math.PI;
    // a tiny Sierpinski pyramid being "printed": Rule 90 rows stacked as layers
    const rows = rule90(8); const layer = mat(0xe8c15a, { metalness: .2, roughness: .5 }); const cube = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    const built = new THREE.Group(); built.position.set(0, 0.58, 0); pr.add(built);
    rows.slice().reverse().forEach((row, li) => row.forEach((v, ci) => { if (v) { const c = mesh(cube, layer, (ci - 7) * 0.09, li * 0.09, 0, built); c.visible = false; c.userData.layer = li; } }));
    const peds = [], loaders = [];
    // pedestals on a grid in front of the printer: rows of up to 6, more rows as prints are added
    const n = prints.length, cols = Math.min(6, Math.max(1, Math.ceil(n / Math.max(1, Math.ceil(n / 6))))), DX = 1.85, DZ = 2.1;
    prints.forEach((p, i) => {
      const row = Math.floor(i / cols), inRow = Math.min(cols, n - row * cols), col = i % cols;
      const ped = new THREE.Group(); ped.position.set((col - (inRow - 1) / 2) * DX, 0, 0.5 + row * DZ); g.add(ped);
      mesh(new THREE.CylinderGeometry(0.55, 0.66, 0.9, 10), mat(0x3a3f5c), 0, 0.45, 0, ped);
      mesh(new THREE.TorusGeometry(0.56, 0.035, 4, 24), glow(0xe8c15a, 1), 0, 0.9, 0, ped).rotation.x = Math.PI / 2;
      const holder = new THREE.Group(); holder.position.y = 0.95; ped.add(holder);
      const lbl = textSprite(p.name, { size: 0.19 }); lbl.position.set(0, 0.5, 0.78); ped.add(lbl);   // a small plaque on the pedestal's front
      // the model itself loads only when someone comes near the shop (see ctx.lazyPrints in main.js)
      loaders.push(() => ctx.loadSTL(p.stl).then(geo => {
        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: /duck|lorenz/i.test(p.stl) ? 0xf8e27a : 0xe8c15a, roughness: .45, metalness: .15 }));
        geo.computeBoundingBox(); const bb = geo.boundingBox, sz = new THREE.Vector3(); bb.getSize(sz);
        const s = 1.25 / Math.max(sz.x, sz.y, sz.z); m.scale.setScalar(s);
        const c = new THREE.Vector3(); bb.getCenter(c);
        // STL files are Z-up; stand them upright in three's Y-up world
        m.rotation.x = -Math.PI / 2; m.position.set(-c.x * s, -bb.min.z * s, c.y * s);
        m.userData.islandId = isl.id; ctx.pickables?.push(m);
        const spin = new THREE.Group(); spin.add(m); holder.add(spin); peds.push(spin);
      }).catch(e => console.warn('STL not loaded', p.stl, e)));
      p._pedestal = ped;
    });
    let loaded = false;
    ctx.lazyPrints = { group: g, get loaded() { return loaded; }, load() { if (loaded) return; loaded = true; loaders.forEach(f => f()); } };
    if (!prints.length) { const s = textSprite('Prints coming soon', { size: 0.4 }); s.position.set(0, 1.5, 1.5); g.add(s); }
    return t => { peds.forEach((s, i) => s.rotation.y = t * 0.5 + i); const k = (t * 0.6) % 10; noz.position.x = Math.sin(t * 5) * 0.5; noz.position.y = 0.75 + Math.min(k, 8) * 0.09; built.children.forEach(c => c.visible = c.userData.layer <= k); };
  },
};

let gst;
function glowSpriteTex() {
  if (gst) return gst; gst = canvasTexture(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,220,1)'); r.addColorStop(1, 'rgba(255,240,150,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }); return gst;
}

// The postcard kiosk on Star Dock: a slowly turning wire rack of real-planet postcards
// (painted by js/postcard.js) under a glowing sign. Click any part to open the Postcard Maker.
function postcardKiosk(g, data) {
  const k = new THREE.Group(); k.position.set(3.4, 0.4, 2.2); k.rotation.y = 0.55; k.userData.postcards = true; g.add(k);
  const wire = mat(0xc9a94a, { metalness: .7, roughness: .35 });
  mesh(new THREE.CylinderGeometry(0.75, 0.85, 0.16, 16), mat(0x2b3150), 0, 0.08, 0, k);
  mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.9, 8), wire, 0, 1.55, 0, k);
  const rack = new THREE.Group(); rack.position.y = 0.3; k.add(rack);
  const big = document.createElement('canvas'); big.width = CARD_W; big.height = CARD_H; const bctx = big.getContext('2d');
  const pick = ['trappist-1-e', 'kepler-16-b', '55-cnc-e', 'kelt-9-b', 'proxima-cen-b', 'k2-18-b', 'hd-189733-b', 'psr-b1257-12-c'];
  const ps = pick.map(id => data.planets.find(p => p.id === id)).filter(Boolean);
  while (ps.length < 8) ps.push(data.planets[ps.length % data.planets.length]);
  const texs = ps.map(p => { try { paintFront(bctx, p); } catch { bctx.fillStyle = '#123'; bctx.fillRect(0, 0, CARD_W, CARD_H); }
    return canvasTexture(300, 200, c => c.drawImage(big, 0, 0, 300, 200)); });
  for (let side = 0; side < 4; side++) {
    const face = new THREE.Group(); face.rotation.y = side * Math.PI / 2; rack.add(face);
    for (let row = 0; row < 2; row++) {
      const m = new THREE.MeshBasicMaterial({ map: texs[side * 2 + row], side: THREE.DoubleSide }); m.userData.keepGlow = true;
      const card = mesh(new THREE.PlaneGeometry(0.78, 0.52), m, 0, 0.75 + row * 0.75, 0.42, face); card.rotation.x = -0.12;
      mesh(new THREE.BoxGeometry(0.84, 0.04, 0.1), wire, 0, 0.47 + row * 0.75, 0.44, face);
    }
  }
  const signTex = canvasTexture(512, 128, (c, w, h) => {
    c.fillStyle = '#0d1430'; c.fillRect(0, 0, w, h); c.strokeStyle = '#e8c15a'; c.lineWidth = 8; c.strokeRect(6, 6, w - 12, h - 12);
    c.font = 'bold 62px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#f6dc8c'; c.fillText('POSTCARDS', w / 2, h / 2 + 3);
  });
  const sm = new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide }); sm.userData.keepGlow = true;
  const sign = new THREE.Group(); sign.position.y = 3.25; k.add(sign);
  mesh(new THREE.PlaneGeometry(1.7, 0.42), sm, 0, 0, 0, sign);
  const halo = glowSprite(2.6, 0xffd98a, 0.35); halo.position.y = 3.25; halo.raycast = () => {}; k.add(halo);
  k.traverse(o => { o.userData.postcards = true; });
  return t => { rack.rotation.y = t * 0.25; sign.rotation.y = Math.sin(t * 0.4) * 0.5; };
}

export function decorate(g, isl, ctx) {
  const fn = DECOR[isl.kind] || DECOR[isl.id];
  if (fn) return fn(g, isl, ctx);
  // unknown future island: a glowing crystal and a few trees
  const c = mesh(new THREE.OctahedronGeometry(1, 0), glow(0xe8c15a, 1.2), 0, 2.2, 0, g);
  const R = rng(isl.id.length * 7); for (let i = 0; i < 4; i++) tree(g, (R() - .5) * 6, (R() - .5) * 6, 0.8);
  return t => { c.rotation.y = t; c.position.y = 2.2 + Math.sin(t) * 0.2; };
}

const stlCache = new Map();
export function makeSTLLoader() {
  const loader = new STLLoader();
  return url => { if (!stlCache.has(url)) stlCache.set(url, loader.loadAsync(url).then(g => { g.computeVertexNormals(); return g; })); return stlCache.get(url); };
}

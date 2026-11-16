// Nova's House: the cottage on the Hearth (exterior) and the walk-in interior.
// The interior is its own small scene. All decorations come from world.house.items
// (data/house.json -> build_data.py -> world.json); see README "Decorating Nova's House".
import * as THREE from 'three';
import { rng, rule90, mat, glow, mesh, jitter, glowSprite, glowTexture, canvasTexture, mergeStatic } from './util.js';
import { DAY, collectGlows } from './daylight.js';
import { makeNova, novaIndoors } from './novabody.js';

const DEG = Math.PI / 180;
const GLASS_DAY = new THREE.Color(0x46577a);

// =====================================================================
// Exterior cottage (world units; Lorenz is about 1 unit tall)
// =====================================================================
export function buildCottage(parent, x, z, rot = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; parent.add(g);
  const R = rng(1116);
  const W = 3.6, D = 3.0, H = 1.8, B = 0.3; // width, depth, wall height, foundation
  const top = B + H;
  const plaster = mat(0xcdb48e), timber = mat(0x3a281c), stone = mat(0x6d6680), roofA = mat(0x252a54), roofB = mat(0x2f3566), trimGold = mat(0xe8c15a, { metalness: .35, roughness: .45 });
  const wood = mat(0x6b4426), navy = mat(0x1c2550);

  // foundation + walls
  mesh(jitter(new THREE.BoxGeometry(W + 0.3, B, D + 0.3, 4, 1, 4), 0.05, R), stone, 0, B / 2, 0, g);
  mesh(new THREE.BoxGeometry(W, H, D), plaster, 0, B + H / 2, 0, g);
  // timber frame: corner posts, top and middle beams, side braces
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(new THREE.BoxGeometry(0.16, H, 0.16), timber, sx * W / 2, B + H / 2, sz * D / 2, g);
  for (const yy of [B + 0.06, top - 0.06]) {
    for (const sz of [-1, 1]) mesh(new THREE.BoxGeometry(W + 0.04, 0.12, 0.08), timber, 0, yy, sz * (D / 2 + 0.02), g);
    for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(0.08, 0.12, D + 0.04), timber, sx * (W / 2 + 0.02), yy, 0, g);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const br = mesh(new THREE.BoxGeometry(0.07, 1.25, 0.08), timber, sx * (W / 2 + 0.025), B + H / 2, sz * D * 0.33, g);
    br.rotation.x = sz * sx * 0.55; br.rotation.y = Math.PI / 2; br.rotation.set(sz * 0.6, 0, 0);
  }

  // roof: ridge runs front-to-back, two shingled slabs with an overhang
  const rise = 1.4, over = 0.35, half = W / 2 + over;
  const a = Math.atan2(rise, W / 2);
  const eaveY = top - over * Math.tan(a);
  const L = Math.hypot(half, top + rise - eaveY);
  for (const s of [-1, 1]) {
    const slab = new THREE.Group(); slab.position.set(s * half / 2, (top + rise + eaveY) / 2, 0); slab.rotation.z = -s * a; g.add(slab);
    mesh(new THREE.BoxGeometry(L, 0.1, D + 0.7), roofA, 0, 0, 0, slab);
    for (let i = 0; i < 6; i++) mesh(new THREE.BoxGeometry(L / 6 + 0.04, 0.06, D + 0.74), i % 2 ? roofA : roofB, s * (-L / 2 + (i + 0.5) * L / 6), 0.07 + i * 0.004, 0, slab);
  }
  mesh(new THREE.BoxGeometry(0.16, 0.14, D + 0.8), trimGold, 0, top + rise + 0.04, 0, g); // ridge cap
  // gables (triangles front and back)
  const tri = new THREE.Shape(); tri.moveTo(-W / 2, 0); tri.lineTo(W / 2, 0); tri.lineTo(0, rise); tri.lineTo(-W / 2, 0);
  const gableGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.1, bevelEnabled: false });
  mesh(gableGeo, plaster, 0, top, D / 2 - 0.1, g); mesh(gableGeo, plaster, 0, top, -D / 2, g);
  // gold Rule 90 triangle on the front gable (8 rows, one instanced mesh)
  {
    const rows = rule90(8), cells = []; rows.forEach((row, ri) => row.forEach((v, ci) => v && cells.push([ci - 7, ri])));
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.075, 0.075, 0.03), glow(0xf2cd62, 1.3), cells.length);
    const M = new THREE.Matrix4(); cells.forEach(([cx, ri], i) => { M.makeTranslation(cx * 0.08, top + 0.95 - ri * 0.08, D / 2 + 0.02); im.setMatrixAt(i, M); });
    g.add(im);
  }

  // chimney on the west side (the Study fireplace is behind it), with soft smoke
  const chim = new THREE.Group(); chim.position.set(-W / 2 - 0.28, 0, 0.65); g.add(chim);
  mesh(jitter(new THREE.BoxGeometry(0.6, 4.25, 0.62, 2, 6, 2), 0.03, R), stone, 0, 2.125, 0, chim);
  mesh(new THREE.BoxGeometry(0.74, 0.1, 0.76), mat(0x4e4860), 0, 4.3, 0, chim);
  mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.28, 8), mat(0x8a4a32), 0.1, 4.48, 0, chim);
  const smoke = [], smokeMat = () => new THREE.SpriteMaterial({ map: glowTexture(), color: 0xa9aec4, transparent: true, opacity: 0, depthWrite: false });
  for (let i = 0; i < 9; i++) { const s = new THREE.Sprite(smokeMat()); chim.add(s); smoke.push(s); }

  // front door (left of center, it opens into the Study), with a lit hallway behind it
  const dx = -0.85, dW = 0.66, dH = 1.18;
  const lit = mesh(new THREE.PlaneGeometry(dW, dH), new THREE.MeshBasicMaterial({ color: 0xffc27a }), dx, B + dH / 2, D / 2 + 0.004, g);
  lit.userData.doorway = true;
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.08, dH + 0.08, 0.08), timber, dx + s * (dW / 2 + 0.04), B + dH / 2, D / 2 + 0.03, g);
  // half-round glowing transom over the door
  const transom = mesh(new THREE.CircleGeometry(dW / 2, 16, 0, Math.PI), glow(0xffc96a, 1.6), dx, B + dH + 0.04, D / 2 + 0.012, g); transom.userData.dynamic = true;
  mesh(new THREE.TorusGeometry(dW / 2 + 0.03, 0.035, 4, 16, Math.PI), timber, dx, B + dH + 0.04, D / 2 + 0.03, g);
  const hinge = new THREE.Group(); hinge.userData.dynamic = true; hinge.position.set(dx - dW / 2, B, D / 2 + 0.04); g.add(hinge);
  const door = new THREE.Group(); hinge.add(door);
  mesh(new THREE.BoxGeometry(dW, dH, 0.05), mat(0x5a3720), dW / 2, dH / 2, 0, door);
  for (let i = 1; i < 4; i++) mesh(new THREE.BoxGeometry(0.012, dH - 0.06, 0.055), mat(0x3a2414), i * dW / 4, dH / 2, 0, door);
  for (const yy of [0.25, dH - 0.25]) mesh(new THREE.BoxGeometry(dW - 0.04, 0.06, 0.06), mat(0x3a2414), dW / 2, yy, 0.01, door);
  mesh(new THREE.CircleGeometry(0.1, 12), glow(0xffcf7a, 1.8), dW / 2, dH * 0.72, 0.032, door);
  mesh(new THREE.TorusGeometry(0.1, 0.018, 4, 16), trimGold, dW / 2, dH * 0.72, 0.034, door);
  mesh(new THREE.SphereGeometry(0.035, 8, 6), trimGold, dW - 0.09, dH * 0.45, 0.05, door);

  // porch: deck, step, posts, canopy, hanging lantern, mat
  const pz = D / 2 + 0.5;
  mesh(new THREE.BoxGeometry(1.6, 0.1, 1.0), wood, dx, B - 0.02, pz, g);
  for (let i = 0; i < 5; i++) mesh(new THREE.BoxGeometry(0.012, 0.102, 1.0), mat(0x4a2e1a), dx - 0.64 + i * 0.32, B - 0.02, pz, g);
  mesh(new THREE.BoxGeometry(1.0, 0.12, 0.34), wood, dx, 0.1, pz + 0.66, g);
  mesh(new THREE.BoxGeometry(0.6, 0.012, 0.36), mat(0x8c2a2f), dx, B + 0.035, pz - 0.1, g);
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.09, 1.38, 0.09), timber, dx + s * 0.72, B + 0.69, pz + 0.42, g);
  const canopy = new THREE.Group(); canopy.position.set(dx, B + 1.46, pz + 0.02); canopy.rotation.x = 0.28; g.add(canopy);
  mesh(new THREE.BoxGeometry(1.75, 0.07, 1.12), roofA, 0, 0, 0, canopy);
  mesh(new THREE.BoxGeometry(1.77, 0.04, 0.05), trimGold, 0, -0.02, 0.56, canopy);
  const lantern = new THREE.Group(); lantern.userData.dynamic = true; lantern.position.set(dx + 0.56, B + 1.2, pz + 0.38); g.add(lantern);
  mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 4), timber, 0, 0.14, 0, lantern);
  const lglass = mesh(new THREE.BoxGeometry(0.17, 0.22, 0.17), glow(0xffd27a, 2.4), 0, 0, 0, lantern);
  mesh(new THREE.ConeGeometry(0.15, 0.11, 4), timber, 0, 0.16, 0, lantern).rotation.y = Math.PI / 4;
  mesh(new THREE.BoxGeometry(0.2, 0.03, 0.2), timber, 0, -0.12, 0, lantern);
  const lhalo = glowSprite(1.7, 0xffc870, 0.85); lantern.add(lhalo);
  const porchLight = new THREE.PointLight(0xffb866, 6, 6, 2); porchLight.position.set(0, -0.1, 0.1); lantern.add(porchLight);

  // windows that glow warm (they flicker a little, like lamps inside)
  const glows = [];
  function windowRect(px, py, pz, ry, w = 0.66, h = 0.6, shutters = true, box = true) {
    const wg = new THREE.Group(); wg.position.set(px, py, pz); wg.rotation.y = ry; g.add(wg);
    const gl = mesh(new THREE.PlaneGeometry(w, h), glow(0xffbf66, 1.6), 0, 0, 0.01, wg); gl.userData.dynamic = true; glows.push(gl);
    for (const s of [-1, 1]) { mesh(new THREE.BoxGeometry(w + 0.12, 0.07, 0.07), timber, 0, s * (h / 2 + 0.03), 0.03, wg); mesh(new THREE.BoxGeometry(0.07, h + 0.1, 0.07), timber, s * (w / 2 + 0.03), 0, 0.03, wg); }
    mesh(new THREE.BoxGeometry(0.035, h, 0.04), timber, 0, 0, 0.03, wg); mesh(new THREE.BoxGeometry(w, 0.035, 0.04), timber, 0, 0, 0.03, wg);
    if (shutters) for (const s of [-1, 1]) { const sh = mesh(new THREE.BoxGeometry(w * 0.42, h + 0.06, 0.03), navy, s * (w / 2 + 0.06 + w * 0.21), 0, 0.03, wg); mesh(new THREE.BoxGeometry(w * 0.3, 0.025, 0.035), trimGold, s * (w / 2 + 0.06 + w * 0.21), 0, 0.04, wg); }
    if (box) {
      mesh(new THREE.BoxGeometry(w + 0.12, 0.12, 0.16), wood, 0, -h / 2 - 0.1, 0.1, wg);
      for (let i = 0; i < 7; i++) mesh(new THREE.IcosahedronGeometry(0.045, 0), glow(i % 3 === 1 ? 0xf2cd62 : 0xc8323a, 0.5), -w / 2 + 0.06 + i * (w - 0.12) / 6, -h / 2 - 0.01, 0.1 + (i % 2) * 0.03, wg);
    }
    const halo = glowSprite(1.6, 0xffb860, 0.45); halo.position.z = 0.25; wg.add(halo);
    return wg;
  }
  windowRect(0.95, B + 1.0, D / 2 + 0.005, 0);                     // Art Corner, front
  windowRect(-W / 2 - 0.005, B + 1.05, -0.75, -Math.PI / 2, 0.56, 0.52); // Window Seat, west
  windowRect(W / 2 + 0.005, B + 1.05, -0.75, Math.PI / 2, 0.56, 0.52, true, false); // Lorenz's Nook, east
  windowRect(0.95, B + 1.05, -D / 2 - 0.005, Math.PI, 0.56, 0.52, false); // Nook, back
  // big round stargazing window on the back wall, and a duck-height porthole on the east wall
  function roundWin(px, py, pz, ry, r) {
    const wg = new THREE.Group(); wg.position.set(px, py, pz); wg.rotation.y = ry; g.add(wg);
    const gl = mesh(new THREE.CircleGeometry(r, 20), glow(0xffbf66, 1.5), 0, 0, 0.01, wg); gl.userData.dynamic = true; glows.push(gl);
    mesh(new THREE.TorusGeometry(r, 0.045, 5, 24), trimGold, 0, 0, 0.03, wg);
    for (let i = 0; i < 4; i++) mesh(new THREE.BoxGeometry(r * 2, 0.025, 0.03), timber, 0, 0, 0.03, wg).rotation.z = i * Math.PI / 4;
    const halo = glowSprite(r * 4, 0xffb860, 0.45); halo.position.z = 0.25; wg.add(halo);
  }
  roundWin(-0.85, B + 1.0, -D / 2 - 0.005, Math.PI, 0.5);
  roundWin(W / 2 + 0.005, B + 0.38, 0.75, Math.PI / 2, 0.16);

  // garden bits: path stones, bushes, flowers, mailbox, woodpile
  for (let i = 0; i < 6; i++) { const s = mesh(new THREE.CylinderGeometry(0.2 + R() * 0.06, 0.22, 0.06, 7), stone, dx + Math.sin(i * 0.6) * 0.35 + i * 0.12, 0.03, pz + 1.05 + i * 0.42, g); s.rotation.y = R() * 3; }
  const bush = mat(0x2d5a3a);
  for (const [bx, bz, bs] of [[0.4, 1.75, 0.32], [1.55, 1.7, 0.38], [-1.75, 1.65, 0.3], [1.75, -1.2, 0.34], [-1.8, -1.7, 0.36]]) mesh(jitter(new THREE.IcosahedronGeometry(bs, 1), 0.06, R), bush, bx, bs * 0.7, bz, g);
  for (let i = 0; i < 11; i++) mesh(new THREE.IcosahedronGeometry(0.05, 0), glow(i % 2 ? 0xf2cd62 : 0xc8323a, 0.6), 0.25 + (i % 6) * 0.26, 0.12 + (i % 2) * 0.05, 1.72 + Math.floor(i / 6) * 0.12, g);
  const mb = new THREE.Group(); mb.position.set(dx + 1.0, 0, pz + 1.3); mb.rotation.y = -0.3; g.add(mb);
  mesh(new THREE.BoxGeometry(0.06, 0.8, 0.06), timber, 0, 0.4, 0, mb);
  mesh(new THREE.BoxGeometry(0.2, 0.18, 0.32), mat(0x161616), 0, 0.88, 0, mb);
  mesh(new THREE.BoxGeometry(0.02, 0.16, 0.05), glow(0xc8323a, 0.6), 0.11, 0.97, -0.08, mb);
  for (let i = 0; i < 4; i++) { const lg = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 6), mat(0x6b4a30), -W / 2 - 0.3, 0.08 + (i > 1 ? 0.13 : 0), -0.2 - (i % 2) * 0.15 - (i > 1 ? 0.07 : 0), g); lg.rotation.x = Math.PI / 2; }

  // everything here is clickable as "the house"
  g.traverse(o => { if (o.isMesh) o.userData.house = true; });
  mergeStatic(g);

  let doorOpen = 0, doorTarget = 0;
  const update = (t, dt) => {
    doorOpen += (doorTarget - doorOpen) * Math.min(1, dt * 4);
    hinge.rotation.y = -doorOpen * 1.75;
    const f = 0.9 + 0.1 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1);
    // time of day: lamps and windows glow brightest at night (DAY is set by main.js)
    const w = DAY.window, dayGlass = DAY.day * 0.75;
    lglass.material.emissiveIntensity = 2.4 * f * DAY.glow; lhalo.material.opacity = 0.85 * f * DAY.halo; porchLight.intensity = 6 * f * w;
    glows.forEach((m, i) => { m.material.emissiveIntensity = (1.5 + 0.18 * Math.sin(t * (1.7 + i * 0.3) + i * 2)) * w; m.material.color.setHex(0xffbf66).lerp(GLASS_DAY, dayGlass); });
    transom.material.emissiveIntensity = (1.5 + 0.2 * Math.sin(t * 2.3)) * w;
    smoke.forEach((s, i) => {
      const p = ((t * 0.16) + i / smoke.length) % 1;
      s.position.set(0.1 + p * 0.9 + Math.sin(t * 0.7 + i) * 0.12, 4.6 + p * 2.6, Math.sin(t * 0.5 + i * 2) * 0.15);
      s.scale.setScalar(0.35 + p * 1.5); s.material.opacity = Math.sin(p * Math.PI) * 0.22;
    });
  };
  const doorWorld = () => { const v = new THREE.Vector3(dx, B + 0.75, D / 2 + 0.1); return g.localToWorld(v); };
  const doorFront = (d) => g.localToWorld(new THREE.Vector3(dx + 0.25, B + 1.6, D / 2 + d));
  return { group: g, update, setDoor: (open) => { doorTarget = open ? 1 : 0; }, doorWorld, doorFront };
}

// =====================================================================
// Interior (meters). The house is 11 m x 11 m: four 5.5 m rooms.
// Room-local coordinates: origin at the room's center on the floor, +x east,
// +z south (toward the front door), y up. Inner wall faces are at +-2.65.
// =====================================================================
const HALF = 2.75, IN = 2.65, WALL_H = 3.0, EYE = 1.55;
// Window Seat telescope spot (room-local) and aim: the tube points at the upper part of the round window (n wall, centre y 1.85, r 1.2)
const TSCOPE = (() => { const x = 0.95, z = -1.3, head = 1.27, tx = -0.05, ty = 2.25, tz = -IN; const dx = tx - x, dz = tz - z;
  return { x, z, head, ry: Math.atan2(dx, dz) / (Math.PI / 180), elev: Math.atan2(ty - head, Math.hypot(dx, dz)) }; })();
const ROOMS = {
  study: { name: 'Study', c: [-2.75, 2.75], walls: { n: [{ u: 1.45, w: 1.3, h: 2.35 }], s: [{ u: 0, w: 1.1, h: 2.25, front: true }], e: [{ u: -1.45, w: 1.3, h: 2.35 }], w: [] } },
  art: { name: 'Art Corner', c: [2.75, 2.75], walls: { n: [{ u: -1.45, w: 1.3, h: 2.35 }], w: [{ u: -1.45, w: 1.3, h: 2.35 }], s: [{ u: 1.0, w: 1.3, y0: 0.95, h: 1.3 }], e: [] } },
  window: { name: 'Window Seat', c: [-2.75, -2.75], walls: { s: [{ u: 1.45, w: 1.3, h: 2.35 }], e: [{ u: 1.45, w: 1.3, h: 2.35 }], n: [{ u: 0, y: 1.85, r: 1.2 }], w: [] } },
  nook: { name: "Lorenz's Nook", c: [2.75, -2.75], walls: { w: [{ u: 1.45, w: 1.3, h: 2.35 }], s: [{ u: -1.45, w: 1.3, h: 2.35 }], e: [{ u: 0, y: 0.6, r: 0.32 }], n: [] } },
};
// nice standing spots (room-local): from -> look at
const VIEWS = {
  study: { from: [1.55, EYE, 2.05], at: [-1.9, 1.25, -0.9] },
  art: { from: [-1.75, EYE, -1.85], at: [1.4, 1.35, 1.2] },
  window: { from: [0.9, 1.4, 1.75], at: [-0.25, 1.75, -2.65] },
  nook: { from: [-1.7, 1.45, 1.75], at: [1.0, 0.55, -1.6] },
};
export const ROOM_IDS = Object.keys(ROOMS);

// ---------- textures ----------
function planks(base, seed) {
  const R = rng(seed);
  const t = canvasTexture(256, 256, (c, w, h) => {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const col = new THREE.Color(base).offsetHSL(0, 0, (R() - 0.5) * 0.06);
      c.fillStyle = '#' + col.getHexString(); c.fillRect(0, i * h / n, w, h / n);
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, i * h / n); c.lineTo(w, i * h / n); c.stroke();
      const cut = R() * w; c.beginPath(); c.moveTo(cut, i * h / n); c.lineTo(cut, (i + 1) * h / n); c.stroke();
      c.strokeStyle = 'rgba(0,0,0,.08)'; c.lineWidth = 1;
      for (let k = 0; k < 5; k++) { const y = i * h / n + R() * h / n; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(w / 3, y + 2, 2 * w / 3, y - 2, w, y); c.stroke(); }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2.2, 2.2); return t;
}
function plasterTex(base, seed, pattern) {
  const R = rng(seed);
  const t = canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${R() < .5 ? '255,255,255' : '0,0,0'},${0.015 + R() * 0.03})`; c.fillRect(R() * w, R() * h, 2 + R() * 6, 2 + R() * 6); }
    if (pattern === 'stars') {
      for (let i = 0; i < 22; i++) { const x = R() * w, y = R() * h, s = 2 + R() * 4; c.fillStyle = `rgba(232,193,90,${0.35 + R() * 0.4})`; c.beginPath(); for (let k = 0; k < 8; k++) { const r = k % 2 ? s * 0.35 : s; const a = k * Math.PI / 4; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.fill(); }
    } else if (pattern === 'dots') {
      for (let y = 16; y < h; y += 32) for (let x = (y / 32 % 2) * 16 + 8; x < w; x += 32) { c.fillStyle = 'rgba(214,160,40,.22)'; c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill(); }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.5, 0.5); return t;
}
function rule90Rug(rows, fg, bg, edge) {
  const r = rule90(rows), w = rows * 2 - 1, px = 8;
  const t = canvasTexture(w * px + 32, rows * px + 32, (c, W, H) => {
    c.fillStyle = edge; c.fillRect(0, 0, W, H); c.fillStyle = bg; c.fillRect(8, 8, W - 16, H - 16);
    c.fillStyle = fg; r.forEach((row, y) => row.forEach((v, x) => v && c.fillRect(16 + x * px, 16 + y * px, px - 1, px - 1)));
  });
  t.magFilter = THREE.NearestFilter; return t;
}

// ---------- wall with openings ----------
function wallGeometry(len, openings) {
  const s = new THREE.Shape(); const L = len / 2;
  s.moveTo(-L, 0);
  openings.filter(o => !o.r && !o.y0).sort((a, b) => a.u - b.u).forEach(o => { s.lineTo(o.u - o.w / 2, 0); s.lineTo(o.u - o.w / 2, o.h); s.lineTo(o.u + o.w / 2, o.h); s.lineTo(o.u + o.w / 2, 0); });
  s.lineTo(L, 0); s.lineTo(L, WALL_H); s.lineTo(-L, WALL_H); s.lineTo(-L, 0);
  for (const o of openings) {
    if (o.r) { const p = new THREE.Path(); p.absarc(o.u, o.y, o.r, 0, Math.PI * 2, true); s.holes.push(p); }
    else if (o.y0) { const p = new THREE.Path(); p.moveTo(o.u - o.w / 2, o.y0); p.lineTo(o.u - o.w / 2, o.y0 + o.h); p.lineTo(o.u + o.w / 2, o.y0 + o.h); p.lineTo(o.u + o.w / 2, o.y0); p.lineTo(o.u - o.w / 2, o.y0); s.holes.push(p); }
  }
  return new THREE.ExtrudeGeometry(s, { depth: HALF - IN, bevelEnabled: false, curveSegments: 28 });
}
// placement of a wall's frame (local to room): returns {pos(u,y,inset), ry}
const WALL_FRAME = {
  n: { ry: 0, at: (u, y, d) => [u, y, -IN + d] },
  s: { ry: Math.PI, at: (u, y, d) => [u, y, IN - d] },
  e: { ry: -Math.PI / 2, at: (u, y, d) => [IN - d, y, u] },
  w: { ry: Math.PI / 2, at: (u, y, d) => [-IN + d, y, u] },
};

// =====================================================================
export function createHouse({ renderer, world, loadSTL, skyMaterial, onPick, onExit, onRoom, onViewPrint, onNova }) {
  const data = world.house || { items: [], rooms: [] };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050816);
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 400);
  camera.rotation.order = 'YXZ';
  const colliders = []; // [minx, maxx, minz, maxz] world
  const pickables = []; const anchors = {}; const roomGroups = {}; const updaters = [];
  const itemGroups = new Map();

  // ---------- sky outside the windows ----------
  let starsMat, constMat, moonIn, moonHaloIn, sunIn, sunHaloIn;
  {
    const R = rng(1611); const n = 700, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const u = R() * 2 - 1, th = R() * Math.PI * 2, y = Math.abs(u) * 0.9 + 0.05, r = Math.sqrt(1 - y * y); pos.set([Math.cos(th) * r * 120, y * 120 - 10, Math.sin(th) * r * 120], i * 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (skyMaterial) scene.add(new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), skyMaterial)); // the same sky as outside
    starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }); starsMat.userData.anim = true;
    scene.add(new THREE.Points(geo, starsMat));
    // the gold Rule 90 constellation, framed by the round window (north)
    const rows = rule90(16), cp = [];
    rows.forEach((row, ri) => row.forEach((v, ci) => v && cp.push((ci - 15) * 1.05 - 2.75, 13.5 - ri * 0.92, -46)));
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    constMat = new THREE.PointsMaterial({ color: 0xffd36a, size: 1.5, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); constMat.userData.anim = true;
    scene.add(new THREE.Points(cg, constMat));
    moonIn = mesh(new THREE.SphereGeometry(2.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff2cf, transparent: true }), 9, 7, -48, scene);
    moonHaloIn = glowSprite(14, 0xffe9b0, 0.5); moonHaloIn.material.userData.anim = true; moonHaloIn.position.copy(moonIn.position); scene.add(moonHaloIn);
    sunIn = mesh(new THREE.SphereGeometry(5.5, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff2d0, transparent: true }), 0, -60, 0, scene);
    sunHaloIn = glowSprite(50, 0xffd890, 0.7); sunHaloIn.material.userData.anim = true; scene.add(sunHaloIn);
    // a few of the Hearth's paper lanterns drifting outside
    for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2; const s = glowSprite(2.2, 0xffc070, 0.7); s.position.set(Math.cos(a) * 22, 1 + (i % 4) * 1.5, Math.sin(a) * 22); scene.add(s); const l = mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.6, 8), glow(0xffc96a, 1.6), 0, 0, 0, s.parent); l.position.copy(s.position); }
  }

  // ---------- light ----------
  const hemiIn = new THREE.HemisphereLight(0xffe0b8, 0x2a1e18, 0.55); scene.add(hemiIn);
  const roomLights = {};
  for (const [id, r] of Object.entries(ROOMS)) {
    const L = new THREE.PointLight(id === 'window' ? 0xffcf96 : 0xffc684, id === 'window' ? 7 : 10, 0, 2);
    L.position.set(r.c[0], 2.4, r.c[1]); scene.add(L); roomLights[id] = L;
  }
  const moonLight = new THREE.PointLight(0x9fb2ff, 3.5, 0, 2); moonLight.position.set(-2.75, 2.0, -4.6); scene.add(moonLight);

  // ---------- materials ----------
  const M = {
    wood: mat(0x6b4426), darkWood: mat(0x3a281c), lightWood: mat(0x9a6a3c), gold: mat(0xe8c15a, { metalness: .5, roughness: .35 }),
    stone: mat(0x786f84), soot: mat(0x120e0c), navy: mat(0x1f2a5c), red: mat(0xb32d35), cream: mat(0xeadfc8), black: mat(0x161418),
    beam: mat(0x4a3322),
  };
  const ROOM_STYLE = {
    study: { wall: plasterTex('#d9c39c', 1, ''), floor: planks(0x7a5230, 2), ceil: 0x5a3e2a },
    art: { wall: plasterTex('#ece2cf', 3, ''), floor: planks(0x9b7550, 4), ceil: 0x6a4c34 },
    window: { wall: plasterTex('#1c2550', 5, 'stars'), floor: planks(0x6a4a30, 6), ceil: 0x1a2048 },
    nook: { wall: plasterTex('#f0dc9a', 7, 'dots'), floor: planks(0x8a6440, 8), ceil: 0x6a4c34 },
  };

  // ---------- build rooms ----------
  function buildRooms() { for (const [id, r] of Object.entries(ROOMS)) {
    const rg = new THREE.Group(); rg.position.set(r.c[0], 0, r.c[1]); rg.userData.room = id; scene.add(rg); roomGroups[id] = rg;
    const st = ROOM_STYLE[id];
    const wallMat = new THREE.MeshStandardMaterial({ map: st.wall, roughness: 0.95 });
    // floor + ceiling + beams + baseboards
    const fl = mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshStandardMaterial({ map: st.floor, roughness: 0.8 }), 0, 0, 0, rg); fl.rotation.x = -Math.PI / 2;
    const ce = mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), mat(st.ceil), 0, WALL_H, 0, rg); ce.rotation.x = Math.PI / 2;
    for (const bz of [-1.4, 1.4]) mesh(new THREE.BoxGeometry(HALF * 2, 0.16, 0.18), M.beam, 0, WALL_H - 0.08, bz, rg);
    // walls
    for (const side of ['n', 's', 'e', 'w']) {
      const ops = r.walls[side]; const geo = wallGeometry(HALF * 2, ops);
      const w = new THREE.Mesh(geo, wallMat); rg.add(w);
      if (side === 'n') w.position.set(0, 0, -HALF);
      if (side === 's') w.position.set(0, 0, IN);
      if (side === 'e') { w.rotation.y = -Math.PI / 2; w.position.set(HALF, 0, 0); }
      if (side === 'w') { w.rotation.y = -Math.PI / 2; w.position.set(-IN, 0, 0); }
      const F = WALL_FRAME[side];
      // baseboard pieces + colliders between floor-level openings
      const floorOps = ops.filter(o => !o.r && !o.y0).sort((a, b) => a.u - b.u);
      let u0 = -HALF; const segs = [];
      for (const o of floorOps) { segs.push([u0, o.u - o.w / 2]); u0 = o.u + o.w / 2; } segs.push([u0, HALF]);
      for (const [a, b] of segs) {
        if (b - a < 0.01) continue;
        const bb = mesh(new THREE.BoxGeometry(b - a, 0.14, 0.03), M.darkWood, 0, 0, 0, rg); bb.position.set(...F.at((a + b) / 2, 0.07, 0.015)); bb.rotation.y = F.ry;
        const p1 = F.at(a, 0, 0), p2 = F.at(b, 0, -(HALF - IN));
        colliders.push([Math.min(p1[0], p2[0]) + r.c[0], Math.max(p1[0], p2[0]) + r.c[0], Math.min(p1[2], p2[2]) + r.c[1], Math.max(p1[2], p2[2]) + r.c[1]]);
      }
      // trims around openings
      for (const o of ops) {
        const tg = new THREE.Group(); tg.position.set(...F.at(o.u, 0, 0.0)); tg.rotation.y = F.ry; rg.add(tg);
        if (o.r) {
          const ring = mesh(new THREE.TorusGeometry(o.r, o.r > 0.5 ? 0.07 : 0.04, 6, 40), M.gold, 0, o.y, 0.02, tg);
          const glass = mesh(new THREE.CircleGeometry(o.r, 32), new THREE.MeshStandardMaterial({ color: 0x9fb4ff, transparent: true, opacity: 0.07, roughness: 0.05, metalness: 0.2, depthWrite: false }), 0, o.y, -0.05, tg);
          if (o.r > 0.5) { // rose-window spokes: 11 of them, plus an inner ring
            mesh(new THREE.TorusGeometry(o.r * 0.32, 0.03, 4, 24), M.gold, 0, o.y, -0.02, tg);
            for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2; const sp = mesh(new THREE.BoxGeometry(0.03, o.r * 0.68, 0.03), M.gold, Math.sin(a) * o.r * 0.66, o.y + Math.cos(a) * o.r * 0.66, -0.02, tg); sp.rotation.z = -a; }
          } else for (let i = 0; i < 2; i++) mesh(new THREE.BoxGeometry(o.r * 2, 0.025, 0.025), M.gold, 0, o.y, -0.02, tg).rotation.z = i * Math.PI / 2;
          glass.userData.glass = true;
        } else if (o.y0) {
          for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.08, o.h + 0.16, 0.06), M.darkWood, s * (o.w / 2 + 0.04), o.y0 + o.h / 2, 0.03, tg);
          mesh(new THREE.BoxGeometry(o.w + 0.24, 0.08, 0.06), M.darkWood, 0, o.y0 + o.h + 0.04, 0.03, tg);
          mesh(new THREE.BoxGeometry(o.w + 0.3, 0.07, 0.22), M.darkWood, 0, o.y0 - 0.03, 0.08, tg);
          mesh(new THREE.BoxGeometry(0.04, o.h, 0.04), M.darkWood, 0, o.y0 + o.h / 2, -0.05, tg);
          mesh(new THREE.BoxGeometry(o.w, 0.04, 0.04), M.darkWood, 0, o.y0 + o.h / 2, -0.05, tg);
          mesh(new THREE.PlaneGeometry(o.w, o.h), new THREE.MeshStandardMaterial({ color: 0x9fb4ff, transparent: true, opacity: 0.06, depthWrite: false }), 0, o.y0 + o.h / 2, -0.06, tg);
        } else {
          for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.1, o.h + 0.1, 0.05), M.darkWood, s * (o.w / 2 + 0.05), (o.h + 0.1) / 2, 0.025, tg);
          mesh(new THREE.BoxGeometry(o.w + 0.3, 0.1, 0.05), M.darkWood, 0, o.h + 0.05, 0.025, tg);
          if (o.front) { // the front door (closed from inside; click it to go back out)
            const dg = new THREE.Group(); dg.userData.exit = true; tg.add(dg); const tgDoor = tg; { const tg = dg;
            const d = mesh(new THREE.BoxGeometry(o.w, o.h, 0.06), mat(0x5a3720), 0, o.h / 2, -0.04, tg);
            for (let i = 1; i < 4; i++) mesh(new THREE.BoxGeometry(0.015, o.h - 0.1, 0.065), mat(0x3a2414), -o.w / 2 + i * o.w / 4, o.h / 2, -0.04, tg);
            mesh(new THREE.CircleGeometry(0.16, 16), glow(0xffcf7a, 0.6), 0, o.h * 0.72, -0.005, tg);
            mesh(new THREE.TorusGeometry(0.16, 0.025, 4, 18), M.gold, 0, o.h * 0.72, 0, tg);
            const knob = mesh(new THREE.SphereGeometry(0.05, 10, 8), M.gold, o.w / 2 - 0.12, o.h * 0.45, 0.02, tg);
            dg.traverse(m => { if (m.isMesh) { m.userData.exit = true; pickables.push(m); } }); }
            mesh(new THREE.BoxGeometry(0.9, 0.015, 0.55), M.red, 0, 0.008, 0.45, tgDoor);
          }
        }
      }
    }
    roomFurniture[id](rg, M);
  } }

  // =====================================================================
  // fixed furniture per room (room-local). Anchors are named Object3Ds that decor items attach to.
  // =====================================================================
  function anchor(name, parent, x, y, z, ryDeg = 0) { const o = new THREE.Object3D(); o.position.set(x, y, z); o.rotation.y = ryDeg * DEG; parent.add(o); anchors[name] = o; return o; }
  function collide(rg, x0, x1, z0, z1) { const c = rg.position; colliders.push([c.x + Math.min(x0, x1), c.x + Math.max(x0, x1), c.z + Math.min(z0, z1), c.z + Math.max(z0, z1)]); }
  function books(parent, x0, x1, y, z, seed, depth = 0.24) {
    const R = rng(seed); const cols = [0x8c2a2f, 0x1f2a5c, 0xc99a2e, 0x2d5a3a, 0x5a3a22, 0xe9e4d4, 0x161418];
    let x = x0; while (x < x1 - 0.04) { const w = 0.03 + R() * 0.035, h = 0.2 + R() * 0.12; const b = mesh(new THREE.BoxGeometry(w, h, depth * (0.8 + R() * 0.2)), mat(cols[Math.floor(R() * cols.length)]), x + w / 2, y + h / 2, z, parent); if (R() < 0.12) { b.rotation.z = 0.25; } x += w + 0.004; }
  }
  function lampPendant(rg, x, z, color = 0xffd08a) {
    mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), M.black, x, WALL_H - 0.15, z, rg);
    mesh(new THREE.ConeGeometry(0.2, 0.18, 10, 1, true), mat(0x2a2030, { side: THREE.DoubleSide }), x, WALL_H - 0.38, z, rg);
    mesh(new THREE.SphereGeometry(0.06, 8, 6), glow(color, 2.4), x, WALL_H - 0.45, z, rg);
    const h = glowSprite(0.9, color, 0.5); h.position.set(x, WALL_H - 0.47, z); rg.add(h);
  }
  var roomFurniture = {
    study(rg) {
      lampPendant(rg, 0, 0.3);
      // fireplace on the west wall (the chimney you can see outside)
      mesh(jitter(new THREE.BoxGeometry(0.5, WALL_H, 1.7, 2, 6, 4), 0.025, rng(5)), M.stone, -IN + 0.25, WALL_H / 2, 0, rg);
      mesh(new THREE.BoxGeometry(0.05, 0.72, 0.92), M.soot, -IN + 0.51, 0.46, 0, rg);
      mesh(new THREE.BoxGeometry(0.08, 0.1, 1.06), M.stone, -IN + 0.52, 0.86, 0, rg);
      mesh(new THREE.BoxGeometry(0.62, 0.05, 1.6), mat(0x5d5468), -IN + 0.78, 0.025, 0, rg);
      mesh(new THREE.BoxGeometry(0.34, 0.09, 1.95), M.wood, -IN + 0.6, 1.3, 0, rg);
      const fire = new THREE.Group(); fire.userData.dynamic = true; fire.position.set(-IN + 0.62, 0.05, 0); rg.add(fire);
      for (let i = 0; i < 3; i++) { const lg = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.6, 6), mat(0x4a3020), 0, 0.08 + (i === 2 ? 0.08 : 0), (i - 1) * 0.12, fire); lg.rotation.x = Math.PI / 2; lg.rotation.z = i === 2 ? 0.4 : 0; }
      const flames = [];
      for (let i = 0; i < 5; i++) { const f = mesh(new THREE.ConeGeometry(0.06 + (i % 2) * 0.03, 0.32, 6), glow(i % 2 ? 0xffb43a : 0xff7a2a, 2.6), 0, 0.3, (i - 2) * 0.08, fire); flames.push(f); }
      const fh = glowSprite(1.4, 0xff9a40, 0.9); fh.position.set(0.05, 0.35, 0); fire.add(fh);
      const fl = new THREE.PointLight(0xff8a3a, 4, 0, 2); fl.position.set(0.4, 0.5, 0); fire.add(fl);
      updaters.push(t => { flames.forEach((f, i) => { f.scale.y = 0.75 + 0.45 * Math.abs(Math.sin(t * (6 + i) + i * 1.7)); f.scale.x = f.scale.z = 0.9 + 0.15 * Math.sin(t * 9 + i); }); const k = 0.8 + 0.25 * Math.sin(t * 7.1) * Math.sin(t * 3.3 + 0.5); fl.intensity = 4 * k; fh.material.opacity = 0.75 * k; });
      for (const s of [-1, 1]) { mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.22, 8), M.cream, -IN + 0.62, 1.46, s * 0.78, rg); const cf = glowSprite(0.22, 0xffc060, 1); cf.position.set(-IN + 0.62, 1.62, s * 0.78); rg.add(cf); }
      anchor('study.mantel', rg, -IN + 0.62, 1.345, 0, 90);
      anchor('study.overmantel', rg, -IN + 0.515, 2.15, 0, 90);
      collide(rg, -HALF, -IN + 1.1, -0.95, 0.95);
      // bookshelf on the north wall: books on the left of each board, right side free for decor
      const bs = new THREE.Group(); bs.position.set(-1.2, 0, -IN + 0.19); rg.add(bs);
      for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.05, 2.2, 0.38), M.wood, s * 0.8, 1.1, 0, bs);
      mesh(new THREE.BoxGeometry(1.65, 2.2, 0.02), M.darkWood, 0, 1.1, -0.18, bs);
      const boards = [0.06, 0.5, 0.95, 1.4, 1.85, 2.2];
      boards.forEach(y => mesh(new THREE.BoxGeometry(1.6, 0.04, 0.36), M.wood, 0, y, 0, bs));
      books(bs, -0.76, 0.76, 0.08, 0, 11);
      books(bs, -0.76, -0.05, 0.52, 0, 12); books(bs, -0.76, 0.05, 0.97, 0, 13); books(bs, -0.76, -0.3, 1.42, 0, 14);
      boards.slice(1, 5).forEach((y, i) => anchor('study.shelf' + (i + 1), rg, -1.2 + 0.4, y + 0.02, -IN + 0.19, 0));
      collide(rg, -2.05, -0.35, -IN - 0.1, -IN + 0.42);
      // desk on the east wall + chair + desk lamp
      const desk = new THREE.Group(); desk.position.set(2.3, 0, 1.0); rg.add(desk);
      mesh(new THREE.BoxGeometry(0.7, 0.05, 1.5), M.lightWood, 0, 0.76, 0, desk);
      for (const [lx, lz] of [[-.3, -.68], [.3, -.68], [-.3, .68], [.3, .68]]) mesh(new THREE.BoxGeometry(0.05, 0.74, 0.05), M.wood, lx, 0.37, lz, desk);
      mesh(new THREE.BoxGeometry(0.5, 0.14, 0.5), M.wood, 0, 0.66, 0.4, desk); mesh(new THREE.SphereGeometry(0.02, 6, 4), M.gold, -0.26, 0.66, 0.4, desk);
      const lamp = new THREE.Group(); lamp.position.set(0.1, 0.785, -0.58); desk.add(lamp);
      mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.02, 10), M.gold, 0, 0.01, 0, lamp);
      mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 4), M.gold, 0, 0.18, 0, lamp);
      mesh(new THREE.ConeGeometry(0.1, 0.12, 10, 1, true), mat(0x1c2550, { side: THREE.DoubleSide }), 0, 0.38, 0, lamp);
      mesh(new THREE.SphereGeometry(0.035, 6, 4), glow(0xffe2a0, 3), 0, 0.34, 0, lamp);
      const dlh = glowSprite(0.7, 0xffd890, 0.55); dlh.position.set(0, 0.3, 0); lamp.add(dlh);
      anchor('study.desk', rg, 2.25, 0.785, 1.0, -90);
      collide(rg, 1.9, HALF, 0.2, 1.8);
      const chair = new THREE.Group(); chair.position.set(1.62, 0, 1.0); chair.rotation.y = Math.PI / 2; rg.add(chair);
      mesh(new THREE.BoxGeometry(0.44, 0.05, 0.42), M.wood, 0, 0.46, 0, chair);
      mesh(new THREE.BoxGeometry(0.44, 0.5, 0.04), M.wood, 0, 0.72, -0.2, chair);
      mesh(new THREE.BoxGeometry(0.4, 0.06, 0.38), M.red, 0, 0.5, 0.01, chair);
      for (const [lx, lz] of [[-.19, -.18], [.19, -.18], [-.19, .18], [.19, .18]]) mesh(new THREE.BoxGeometry(0.04, 0.46, 0.04), M.wood, lx, 0.23, lz, chair);
      collide(rg, 1.38, 1.86, 0.76, 1.24);
      // armchair by the fire
      const ac = new THREE.Group(); ac.position.set(-1.15, 0, 1.45); ac.rotation.y = -Math.PI / 2 - 0.6; rg.add(ac);
      const chairM = mat(0x34458c);
      mesh(new THREE.BoxGeometry(0.72, 0.36, 0.7), chairM, 0, 0.24, 0, ac);
      mesh(new THREE.BoxGeometry(0.72, 0.55, 0.16), chairM, 0, 0.66, -0.28, ac);
      for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.13, 0.24, 0.7), chairM, s * 0.33, 0.52, 0, ac);
      for (const [lx, lz] of [[-.3, -.28], [.3, -.28], [-.3, .28], [.3, .28]]) mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.08, 6), M.darkWood, lx, 0.03, lz, ac);
      mesh(new THREE.BoxGeometry(0.55, 0.1, 0.5), mat(0xe8c15a), 0, 0.46, 0.06, ac);
      collide(rg, -1.6, -0.7, 1.0, 1.9);
      // Rule 90 rug in black, red and gold
      const rug = mesh(new THREE.PlaneGeometry(2.4, 1.3), new THREE.MeshStandardMaterial({ map: rule90Rug(16, '#c8323a', '#141414', '#e8c15a'), roughness: 1 }), -0.3, 0.006, 0.2, rg); rug.rotation.x = -Math.PI / 2;
      // inside doormat by the front door
      anchor('study.door', rg, 0, 0, IN, 180);
    },
    art(rg) {
      lampPendant(rg, 0.3, 0.3);
      // easel facing the doorways (north-west)
      const ez = new THREE.Group(); ez.position.set(0.35, 0, 0.45); ez.rotation.y = -0.78 * Math.PI; rg.add(ez);
      for (const s of [-1, 1]) { const l = mesh(new THREE.BoxGeometry(0.05, 2.0, 0.05), M.lightWood, s * 0.42, 1.0, 0.05, ez); l.rotation.z = s * 0.1; }
      const back = mesh(new THREE.BoxGeometry(0.05, 1.9, 0.05), M.lightWood, 0, 0.92, -0.42, ez); back.rotation.x = -0.27;
      mesh(new THREE.BoxGeometry(1.0, 0.05, 0.1), M.lightWood, 0, 0.95, 0.08, ez);
      mesh(new THREE.BoxGeometry(0.06, 0.05, 0.08), M.lightWood, 0, 1.92, 0.04, ez);
      anchor('art.easel', ez, 0, 1.28, 0.1, 0).rotation.x = -0.1;
      collide(rg, -0.25, 0.95, -0.15, 1.05);
      // paint table with pots, brushes and a palette
      const pt = new THREE.Group(); pt.position.set(1.95, 0, 1.95); rg.add(pt);
      mesh(new THREE.BoxGeometry(1.0, 0.05, 0.7), M.wood, 0, 0.72, 0, pt);
      for (const [lx, lz] of [[-.45, -.3], [.45, -.3], [-.45, .3], [.45, .3]]) mesh(new THREE.BoxGeometry(0.04, 0.72, 0.04), M.wood, lx, 0.36, lz, pt);
      [0xc8323a, 0xe8c15a, 0x1f2a5c, 0xf2ede0, 0x161418].forEach((c, i) => { mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.07, 10), M.cream, -0.38 + i * 0.12, 0.78, -0.18, pt); mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 10), mat(c), -0.38 + i * 0.12, 0.815, -0.18, pt); });
      mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.14, 10), mat(0x3a5a8a), 0.32, 0.815, -0.15, pt);
      for (let i = 0; i < 5; i++) { const b = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.28, 4), M.lightWood, 0.32 + Math.sin(i * 1.3) * 0.02, 0.95, -0.15 + Math.cos(i * 1.3) * 0.02, pt); b.rotation.z = Math.sin(i * 2.1) * 0.2; }
      const pal = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.012, 14), M.lightWood, -0.1, 0.752, 0.12, pt); pal.scale.z = 0.7;
      [0xc8323a, 0xe8c15a, 0x2a3a8a, 0xffffff].forEach((c, i) => mesh(new THREE.SphereGeometry(0.022, 6, 4), mat(c), -0.2 + i * 0.065, 0.765, 0.08 + (i % 2) * 0.05, pt));
      anchor('art.painttable', rg, 1.95, 0.745, 2.15, 180);
      collide(rg, 1.4, 2.5, 1.55, 2.35);
      // stool, blank canvases waiting against the west wall, a picture rail
      mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.05, 10), M.red, -0.6, 0.6, 1.1, rg);
      for (let i = 0; i < 3; i++) mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 4), M.wood, -0.6 + Math.cos(i * 2.1) * 0.14, 0.3, 1.1 + Math.sin(i * 2.1) * 0.14, rg);
      collide(rg, -0.85, -0.35, 0.85, 1.35);
      for (let i = 0; i < 3; i++) { const cv = mesh(new THREE.BoxGeometry(0.03, 0.9 - i * 0.15, 0.7 - i * 0.1), M.cream, -IN + 0.12 + i * 0.05, 0.45 - i * 0.07, 1.6, rg); cv.rotation.z = -0.12; }
      collide(rg, -HALF, -IN + 0.35, 1.2, 2.0);
      for (const side of ['e', 'n']) { const F = WALL_FRAME[side]; const rail = mesh(new THREE.BoxGeometry(5.3, 0.04, 0.03), M.gold, 0, 0, 0, rg); rail.position.set(...F.at(0, 2.5, 0.015)); rail.rotation.y = F.ry; }
      const rug = mesh(new THREE.CircleGeometry(1.2, 24), mat(0x8c2a2f), 0.2, 0.006, 0.5, rg); rug.rotation.x = -Math.PI / 2;
      const rr = mesh(new THREE.TorusGeometry(1.1, 0.03, 3, 40), M.gold, 0.2, 0.008, 0.5, rg); rr.rotation.x = Math.PI / 2;
    },
    window(rg) {
      lampPendant(rg, -1.0, 1.2, 0xffc070);
      // cushioned window seat under the round window, cubby towers on each side
      mesh(new THREE.BoxGeometry(3.0, 0.5, 0.65), M.wood, 0, 0.25, -IN + 0.33, rg);
      mesh(new THREE.BoxGeometry(2.95, 0.12, 0.62), M.navy, 0, 0.56, -IN + 0.34, rg);
      [[-1.05, 0xe8c15a, 0.3], [-0.6, 0xc8323a, -0.2], [1.1, 0xeadfc8, 0.15]].forEach(([px, c, rz]) => { const p = mesh(new THREE.BoxGeometry(0.42, 0.36, 0.14), mat(c), px, 0.82, -IN + 0.14, rg); p.rotation.set(-0.25, 0, rz); });
      anchor('window.seat', rg, 0, 0.62, -IN + 0.34, 0);
      collide(rg, -1.5, 1.5, -HALF, -IN + 0.68);
      for (const s of [-1, 1]) {
        const tw = new THREE.Group(); tw.position.set(s * 2.05, 0, -IN + 0.3); rg.add(tw);
        mesh(new THREE.BoxGeometry(1.15, 2.1, 0.6), M.darkWood, 0, 1.05, -0.02, tw);
        for (const [yy, k] of [[0.95, 0], [1.55, 1]]) { mesh(new THREE.BoxGeometry(0.95, 0.42, 0.5), mat(0x120d0a), 0, yy + 0.21, 0.06, tw); }
        const n = s < 0 ? 1 : 3;
        anchor('window.cubby' + n, rg, s * 2.05, 0.95, -IN + 0.38, 0); anchor('window.cubby' + (n + 1), rg, s * 2.05, 1.55, -IN + 0.38, 0);
        collide(rg, s * 2.05 - 0.6, s * 2.05 + 0.6, -HALF, -IN + 0.62);
      }
      books(rg, -2.45, -1.75, 0.95, -IN + 0.36, 21, 0.3); books(rg, 1.65, 2.1, 1.55, -IN + 0.36, 22, 0.3);
      // a refractor on a wooden tripod, aimed up and out through the round window
      // (the model is MODELS.telescope, placed by the "telescope" item in data/house.json; +z points at the window)
      anchor('window.telescope', rg, TSCOPE.x, 0, TSCOPE.z, TSCOPE.ry);
      collide(rg, TSCOPE.x - 0.42, TSCOPE.x + 0.42, TSCOPE.z - 0.42, TSCOPE.z + 0.42);
      // round side table and a pouf
      const st = new THREE.Group(); st.position.set(-1.95, 0, 0.55); rg.add(st);
      mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 16), M.wood, 0, 0.58, 0, st); mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.56, 6), M.wood, 0, 0.29, 0, st); mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 12), M.wood, 0, 0.015, 0, st);
      anchor('window.table', rg, -1.95, 0.6, 0.55, 45);
      collide(rg, -2.3, -1.6, 0.2, 0.9);
      mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.36, 14), mat(0xc99a2e), 0.15, 0.18, 0.2, rg);
      collide(rg, -0.2, 0.5, -0.15, 0.55);
      // 11 little gold stars hanging from the ceiling
      const stars = [];
      for (let i = 0; i < 11; i++) {
        const sg = new THREE.Group(); sg.userData.dynamic = true; sg.position.set(-1.6 + (i % 6) * 0.62 + (i > 5 ? 0.3 : 0), WALL_H, -0.4 + (i > 5 ? 0.9 : 0)); rg.add(sg);
        const len = 0.5 + ((i * 7) % 5) * 0.12;
        mesh(new THREE.CylinderGeometry(0.003, 0.003, len, 3), mat(0xbbbbbb), 0, -len / 2, 0, sg);
        const s = mesh(new THREE.OctahedronGeometry(0.07, 0), new THREE.MeshStandardMaterial({ color: 0xe8b84a, emissive: 0xc8902a, emissiveIntensity: 0.55, metalness: 0.4, roughness: 0.4 }), 0, -len - 0.05, 0, sg); s.scale.set(1, 1, 0.4); stars.push([sg, s, i]);
      }
      updaters.push(t => stars.forEach(([sg, s, i]) => { sg.rotation.z = Math.sin(t * 0.8 + i) * 0.06; s.rotation.y = t * 0.6 + i; }));
      const rug = mesh(new THREE.CircleGeometry(1.4, 28), mat(0x141a3a), 0, 0.006, 0, rg); rug.rotation.x = -Math.PI / 2;
      for (const rr of [1.3, 0.9]) { const t = mesh(new THREE.TorusGeometry(rr, 0.025, 3, 40), M.gold, 0, 0.008, 0, rg); t.rotation.x = Math.PI / 2; }
    },
    nook(rg) {
      lampPendant(rg, 0, 0.2, 0xffd890);
      // woven basket bed with a red cushion and a gold blanket
      const bk = new THREE.Group(); bk.position.set(1.75, 0, -1.75); rg.add(bk);
      const weave = canvasTexture(64, 64, (c, w, h) => { c.fillStyle = '#9a6a3c'; c.fillRect(0, 0, w, h); c.fillStyle = '#6b4426'; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) c.fillRect(x * 8, y * 8, 8, 8); });
      weave.wrapS = weave.wrapT = THREE.RepeatWrapping; weave.repeat.set(6, 1);
      const bm = new THREE.MeshStandardMaterial({ map: weave, roughness: 1, side: THREE.DoubleSide });
      mesh(new THREE.CylinderGeometry(0.62, 0.5, 0.32, 20, 1, true), bm, 0, 0.16, 0, bk);
      mesh(new THREE.CircleGeometry(0.5, 20), bm, 0, 0.01, 0, bk).rotation.x = -Math.PI / 2;
      mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 24), mat(0x7a5230), 0, 0.32, 0, bk).rotation.x = Math.PI / 2;
      const cush = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 18), M.red, 0, 0.1, 0, bk);
      const bl = mesh(new THREE.BoxGeometry(0.5, 0.03, 0.34), mat(0xe8c15a), 0.12, 0.18, 0.12, bk); bl.rotation.y = 0.5;
      anchor('nook.basket', rg, 1.75, 0.17, -1.75, 0);
      collide(rg, 1.1, 2.4, -2.4, -1.1);
      // pond bowl with water and a lily pad
      const pb = new THREE.Group(); pb.position.set(-0.35, 0, -1.25); rg.add(pb);
      const pts = []; for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI / 2; pts.push(new THREE.Vector2(0.15 + Math.sin(a) * 0.45, 0.02 + (1 - Math.cos(a)) * 0.22)); }
      mesh(new THREE.LatheGeometry(pts, 24), mat(0x2a3a7a, { side: THREE.DoubleSide, roughness: .4 }), 0, 0, 0, pb);
      const water = mesh(new THREE.CircleGeometry(0.56, 24), new THREE.MeshStandardMaterial({ color: 0x3a64b8, emissive: 0x0a1a48, roughness: 0.1, metalness: 0.3 }), 0, 0.17, 0, pb); water.rotation.x = -Math.PI / 2;
      const lily = mesh(new THREE.CircleGeometry(0.12, 10, 0.3, Math.PI * 2 - 0.5), mat(0x3e7a4a, { side: THREE.DoubleSide }), 0.15, 0.175, 0.1, pb); lily.rotation.x = -Math.PI / 2; lily.userData.dynamic = true;
      mesh(new THREE.SphereGeometry(0.035, 6, 4), mat(0xf6c0d0), 0.15, 0.2, 0.1, pb);
      updaters.push(t => { lily.position.x = 0.15 + Math.sin(t * 0.4) * 0.05; lily.rotation.z = t * 0.1; });
      collide(rg, -0.95, 0.25, -1.85, -0.65);
      // a little dish of peas
      mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.06, 14), M.cream, 0.75, 0.03, -0.75, rg);
      for (let i = 0; i < 9; i++) mesh(new THREE.SphereGeometry(0.025, 6, 4), mat(0x6ab04a), 0.75 + Math.cos(i * 2.4) * 0.07 * (i % 3) / 2, 0.075, -0.75 + Math.sin(i * 2.4) * 0.07 * (i % 3) / 2, rg);
      // scarf hook (duck height) and a low shelf on the north wall
      const hk = new THREE.Group(); hk.position.set(-1.85, 1.0, -IN); rg.add(hk);
      mesh(new THREE.BoxGeometry(0.32, 0.14, 0.03), M.wood, 0, 0, 0.015, hk);
      const hook = mesh(new THREE.TorusGeometry(0.045, 0.012, 5, 12, Math.PI * 1.3), M.gold, 0, -0.03, 0.06, hk); hook.rotation.y = Math.PI / 2;
      anchor('nook.hook', rg, -1.85, 0.96, -IN + 0.07, 0);
      const sh = new THREE.Group(); sh.position.set(0.4, 1.0, -IN + 0.15); rg.add(sh);
      mesh(new THREE.BoxGeometry(1.3, 0.05, 0.3), M.lightWood, 0, 0, 0, sh);
      for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.04, 0.18, 0.2), M.darkWood, s * 0.5, -0.1, -0.03, sh);
      anchor('nook.shelf', rg, 0.4, 1.025, -IN + 0.15, 0);
      // night-light: a tiny glowing moon by the basket
      mesh(new THREE.SphereGeometry(0.07, 10, 8), glow(0xfff0c0, 2.2), 2.35, 0.07, -0.8, rg);
      const nl = glowSprite(0.8, 0xfff0c0, 0.6); nl.position.set(2.35, 0.1, -0.8); rg.add(nl);
      const rug = mesh(new THREE.CircleGeometry(0.75, 24), mat(0x3a64a8), 0.55, 0.006, 0.35, rg); rug.rotation.x = -Math.PI / 2; rug.scale.x = 1.25;
      for (let i = 0; i < 3; i++) { const lp = mesh(new THREE.CircleGeometry(0.12, 8, 0.4, Math.PI * 2 - 0.6), mat(0x3e7a4a), 0.25 + i * 0.3, 0.008, 0.2 + (i % 2) * 0.3, rg); lp.rotation.x = -Math.PI / 2; }
    },
  };
  buildRooms();
  Object.values(roomGroups).forEach(rg => mergeStatic(rg));

  // =====================================================================
  // decor models (meters, origin at the base center, front faces +z)
  // =====================================================================
  const MODELS = {
    // A white refractor with black bands on a tall wooden tripod (after the owner's reference photo).
    // Origin on the floor at the tripod centre; the tube points along +z, tilted up by TSCOPE.elev.
    telescope() {
      const g = new THREE.Group();
      const smooth = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0, ...o });
      const white = smooth(0xf1efe8, { roughness: 0.35 }), black = smooth(0x151517, { roughness: 0.5, metalness: 0.2 }), chrome = smooth(0xb8bcc4, { metalness: 0.8, roughness: 0.3 });
      const woodA = mat(0xb07a45, { roughness: 0.7 }), woodB = mat(0xc89260, { roughness: 0.7 }), glass = smooth(0x0a1630, { roughness: 0.05, metalness: 0.6 });
      const HUB = TSCOPE.head - 0.13, FOOT = 0.5, TOP = 0.075;
      // ---- tripod: three splayed two-section wooden legs, black clamps and feet; one leg toward the room, two toward the window
      const along = (s) => [TOP + (FOOT - TOP) * (1 - s), HUB * s];       // s = 0 foot .. 1 top, in the leg's own plane (radius, y)
      const tilt = Math.atan2(FOOT - TOP, HUB), legLen = Math.hypot(FOOT - TOP, HUB);
      for (const a of [Math.PI, Math.PI / 3, -Math.PI / 3]) {
        const lg = new THREE.Group(); lg.rotation.y = a - Math.PI / 2; g.add(lg);   // leg plane: local +x points out along azimuth a (a = 0 is +z)
        const seg = (s0, s1, w, d, m, dz = 0) => { const [r0, y0] = along(s0), [r1, y1] = along(s1); const b = mesh(new THREE.BoxGeometry(d, Math.hypot(r1 - r0, y1 - y0), w), m, (r0 + r1) / 2, (y0 + y1) / 2, dz, lg); b.rotation.z = tilt; return b; };
        seg(0.42, 0.97, 0.016, 0.03, woodA, 0.017); seg(0.42, 0.97, 0.016, 0.03, woodA, -0.017);   // upper section: twin rails
        seg(0.03, 0.5, 0.024, 0.026, woodB);                                                       // lower sliding section
        seg(0.4, 0.46, 0.058, 0.042, black); seg(0.03, 0.0, 0.03, 0.034, black);                  // clamp, rubber foot
        const [rk, yk] = along(0.47); const knob = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8), black, rk + 0.03, yk, 0, lg); knob.rotation.z = Math.PI / 2;
        // spreader arm from the centre post to the tray
        const [rs, ys] = along(0.42); const arm = mesh(new THREE.BoxGeometry(rs - 0.05, 0.012, 0.012), black, (rs + 0.05) / 2, ys, 0, lg);
      }
      void legLen;
      mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 3), black, 0, HUB + 0.01, 0, g).rotation.y = Math.PI / 6;   // triangular leg head
      const [, yTray] = along(0.42);
      mesh(new THREE.CylinderGeometry(0.012, 0.012, HUB - yTray, 6), chrome, 0, (HUB + yTray) / 2, 0, g);      // centre post
      mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.012, 18), chrome, 0, yTray + 0.008, 0, g);               // accessory tray
      for (let i = 0; i < 5; i++) { const aa = i / 5 * Math.PI * 2; mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.004, 10), black, Math.cos(aa) * 0.085, yTray + 0.016, Math.sin(aa) * 0.085, g); }
      // ---- alt-az head: turns toward the window, tube on top
      const head = new THREE.Group(); head.position.y = HUB + 0.035; g.add(head);
      mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.05, 14), black, 0, 0.025, 0, head);
      mesh(new THREE.BoxGeometry(0.035, 0.11, 0.08), black, 0.045, 0.085, 0, head);                         // side arm
      const handle = mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.3, 6), black, 0.06, 0.02, -0.14, head); handle.rotation.x = 1.15;  // slow-motion handle
      const ota = new THREE.Group(); ota.position.y = TSCOPE.head - HUB - 0.035; ota.rotation.x = -TSCOPE.elev; head.add(ota);
      const tube = (r0, r1, z0, z1, m, seg = 22) => { const c = mesh(new THREE.CylinderGeometry(r1, r0, z1 - z0, seg), m, 0, 0, (z0 + z1) / 2, ota); c.rotation.x = Math.PI / 2; return c; };
      const R = 0.048;
      tube(R, R, -0.42, 0.42, white);                                    // main tube
      tube(R + 0.008, R + 0.008, -0.43, -0.39, black);                   // rear cell
      for (const z of [-0.12, 0.1]) tube(R + 0.007, R + 0.007, z - 0.02, z + 0.02, black);   // tube rings
      tube(R + 0.006, R + 0.006, 0.3, 0.33, black);                      // band
      tube(R + 0.014, R + 0.014, 0.42, 0.46, black);                     // dew shield collar
      tube(R + 0.012, R + 0.012, 0.46, 0.68, white);                     // dew shield
      tube(R + 0.016, R + 0.016, 0.66, 0.69, black);                     // front lip
      const lens = mesh(new THREE.CircleGeometry(R + 0.008, 22), glass, 0, 0, 0.6, ota);  // objective, set back inside the shield
      mesh(new THREE.BoxGeometry(0.03, 0.022, 0.32), black, 0, -R - 0.012, -0.01, ota);   // dovetail on the mount
      // focuser, star diagonal and eyepiece at the back (eyepiece angled up for a comfortable look)
      tube(0.03, 0.03, -0.53, -0.43, black); tube(0.022, 0.022, -0.6, -0.53, chrome, 14);
      for (const sx of [-1, 1]) { const k = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 12), black, sx * 0.045, -0.03, -0.48, ota); k.rotation.z = Math.PI / 2; }
      mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), black, 0, 0, -0.63, ota);
      const ep = new THREE.Group(); ep.position.set(0, 0.02, -0.63); ep.rotation.x = -0.5; ota.add(ep);
      mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 14), chrome, 0, 0.05, 0, ep);
      mesh(new THREE.CylinderGeometry(0.024, 0.022, 0.07, 14), black, 0, 0.11, 0, ep);
      mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 14), black, 0, 0.155, 0, ep);
      // finder scope on a little bracket, up and to the right
      const fd = new THREE.Group(); fd.position.set(0.035, R + 0.04, -0.24); ota.add(fd);
      for (const z of [-0.06, 0.05]) mesh(new THREE.BoxGeometry(0.014, 0.04, 0.014), black, 0, -0.022, z, fd);
      const ftube = (r0, r1, z0, z1, m) => { const c = mesh(new THREE.CylinderGeometry(r1, r0, z1 - z0, 12), m, 0, 0, (z0 + z1) / 2, fd); c.rotation.x = Math.PI / 2; };
      ftube(0.014, 0.014, -0.1, 0.08, white); ftube(0.019, 0.019, 0.07, 0.12, black); ftube(0.01, 0.01, -0.15, -0.1, black);
      mergeStatic(g);
      void lens;
      return g;
    },
    macchiato() {
      const g = new THREE.Group();
      mesh(new THREE.CylinderGeometry(0.043, 0.036, 0.03, 14), mat(0xc98b3a, { roughness: .4 }), 0, 0.015, 0, g);
      mesh(new THREE.CylinderGeometry(0.047, 0.043, 0.075, 14), mat(0xf1e8d8), 0, 0.068, 0, g);
      mesh(new THREE.CylinderGeometry(0.05, 0.047, 0.04, 14), mat(0x6b3d1e), 0, 0.125, 0, g);
      mesh(new THREE.CylinderGeometry(0.051, 0.05, 0.006, 14), mat(0xd9a04a), 0, 0.147, 0, g);
      mesh(new THREE.CylinderGeometry(0.055, 0.04, 0.17, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }), 0, 0.085, 0, g);
      for (let i = 0; i < 5; i++) mesh(new THREE.BoxGeometry(0.022, 0.022, 0.022), new THREE.MeshStandardMaterial({ color: 0xe6f6ff, transparent: true, opacity: 0.55 }), Math.cos(i * 2.4) * 0.022, 0.06 + i * 0.016, Math.sin(i * 2.4) * 0.022, g).rotation.set(i, i * 2, 0);
      const straw = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.22, 6), mat(0x2b5d3a), 0.012, 0.17, 0, g); straw.rotation.z = -0.18;
      return g;
    },
    journal() {
      const g = new THREE.Group();
      const page = canvasTexture(256, 160, (c, w, h) => {
        c.fillStyle = '#f3ead2'; c.fillRect(0, 0, w, h); c.fillStyle = '#d8c9a4'; c.fillRect(w / 2 - 1, 0, 2, h);
        c.strokeStyle = 'rgba(40,40,80,.55)'; c.lineWidth = 1.2;
        const R = rng(42);
        for (let side = 0; side < 2; side++) for (let y = 18; y < h - 10; y += 11) { if (side === 1 && y > 70 && y < 140) continue; c.beginPath(); c.moveTo(side * w / 2 + 12, y); let x = side * w / 2 + 12; while (x < side * w / 2 + w / 2 - 14 - R() * 20) { x += 3 + R() * 6; c.lineTo(x, y + (R() - .5) * 2.5); } c.stroke(); }
        c.fillStyle = '#b8862b'; const r9 = rule90(8); r9.forEach((row, ry) => row.forEach((v, cx) => v && c.fillRect(w / 2 + 30 + cx * 5, 74 + ry * 7, 4, 4)));
      });
      const cover = mesh(new THREE.BoxGeometry(0.34, 0.012, 0.23), mat(0x1f2a5c), 0, 0.006, 0, g);
      const pages = mesh(new THREE.BoxGeometry(0.32, 0.012, 0.21), new THREE.MeshStandardMaterial({ map: page, roughness: 0.9 }), 0, 0.018, 0, g);
      pages.material = [mat(0xefe6cc), mat(0xefe6cc), new THREE.MeshStandardMaterial({ map: page, roughness: 0.9 }), mat(0xefe6cc), mat(0xefe6cc), mat(0xefe6cc)];
      mesh(new THREE.BoxGeometry(0.012, 0.003, 0.25), mat(0xc8323a), 0.02, 0.026, 0.02, g);
      const pen = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.15, 6), mat(0xe8c15a, { metalness: .5 }), 0.2, 0.012, 0.02, g); pen.rotation.set(Math.PI / 2, 0, 0.3);
      return g;
    },
    plant() {
      const g = new THREE.Group(); const R = rng(77);
      mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.35, 12), mat(0x161418), 0, 0.175, 0, g);
      mesh(new THREE.TorusGeometry(0.2, 0.02, 4, 18), mat(0xe8c15a, { metalness: .4 }), 0, 0.34, 0, g).rotation.x = Math.PI / 2;
      mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 12), mat(0x3a2a20), 0, 0.33, 0, g);
      for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2, l = 0.35 + R() * 0.35; const lf = mesh(new THREE.ConeGeometry(0.06, l, 4), mat(i % 2 ? 0x2f6b40 : 0x3e8a50), Math.cos(a) * 0.07, 0.33 + l / 2, Math.sin(a) * 0.07, g); lf.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45); lf.scale.z = 0.3; }
      return g;
    },
    blanket() {
      const g = new THREE.Group();
      const tex = rule90Rug(16, '#c8323a', '#121212', '#121212');
      const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, side: THREE.DoubleSide });
      const top = mesh(new THREE.BoxGeometry(1.0, 0.03, 0.55), m, 0, 0.015, 0, g);
      const drape = mesh(new THREE.BoxGeometry(1.0, 0.03, 0.42), m, 0, -0.18, 0.33, g); drape.rotation.x = 1.25;
      return g;
    },
    scarf() {
      const g = new THREE.Group();
      const tex = canvasTexture(32, 256, (c, w, h) => { for (let i = 0; i < 11; i++) { c.fillStyle = i % 2 ? '#e8c15a' : '#c62f37'; c.fillRect(0, i * h / 11, w, h / 11 + 1); } });
      const m = new THREE.MeshStandardMaterial({ map: tex, roughness: .9 });
      mesh(new THREE.TorusGeometry(0.05, 0.025, 6, 12), m, 0, -0.03, 0.02, g).rotation.y = Math.PI / 2;
      for (const [x, l, r] of [[-0.04, 0.55, 0.06], [0.05, 0.45, -0.08]]) { const e = mesh(new THREE.BoxGeometry(0.09, l, 0.025), m, x, -0.05 - l / 2, 0.03, g); e.rotation.z = r; mesh(new THREE.BoxGeometry(0.1, 0.03, 0.03), mat(0xe8c15a), x + Math.sin(-r) * l / 2 * 0, -0.06 - l, 0.03, g).rotation.z = r; }
      return g;
    },
    candle() { const g = new THREE.Group(); mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 10), mat(0xf3ead2), 0, 0.07, 0, g); const f = glowSprite(0.16, 0xffc060, 1); f.position.y = 0.17; g.add(f); return g; },
    books() { const g = new THREE.Group(); [0x8c2a2f, 0x1f2a5c, 0xc99a2e].forEach((c, i) => { const b = mesh(new THREE.BoxGeometry(0.24 - i * 0.02, 0.04, 0.17), mat(c), 0, 0.02 + i * 0.04, 0, g); b.rotation.y = i * 0.2; }); return g; },
    crystal() { const g = new THREE.Group(); const c = mesh(new THREE.OctahedronGeometry(0.08, 0), glow(0xe8c15a, 1.2), 0, 0.12, 0, g); c.scale.y = 1.6; return g; },
    yarn() { const g = new THREE.Group(); mesh(new THREE.IcosahedronGeometry(0.08, 2), mat(0xc62f37), 0, 0.08, 0, g); return g; },
    mug() { const g = new THREE.Group(); mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 14), mat(0x161418), 0, 0.05, 0, g); mesh(new THREE.TorusGeometry(0.03, 0.008, 5, 10), mat(0x161418), 0.05, 0.05, 0, g); return g; },
  };
  const FRAME_COLORS = { gold: 0xc99a2e, black: 0x151317, red: 0xb0282f, wood: 0x5a3a22, white: 0xeeeeee };
  const texLoader = new THREE.TextureLoader();
  function frameModel(it) {
    const g = new THREE.Group(); const w = it.width || 0.8, h = w / (it.aspect || 1.5), b = 0.055;
    const fm = it.frame === 'gold' ? mat(FRAME_COLORS.gold, { metalness: .5, roughness: .35 }) : mat(FRAME_COLORS[it.frame] ?? FRAME_COLORS.wood);
    mesh(new THREE.BoxGeometry(w + 2 * b, h + 2 * b, 0.02), mat(0x1a1410), 0, 0, 0.01, g);
    for (const s of [-1, 1]) { mesh(new THREE.BoxGeometry(w + 2 * b, b, 0.045), fm, 0, s * (h + b) / 2, 0.022, g); mesh(new THREE.BoxGeometry(b, h, 0.045), fm, s * (w + b) / 2, 0, 0.022, g); }
    const tex = texLoader.load(it.image); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12 }), 0, 0, 0.022, g);
    return g;
  }
  function printModel(it) {
    const g = new THREE.Group();
    const hit = mesh(new THREE.BoxGeometry((it.size || 0.3), (it.size || 0.3) * 0.6, (it.size || 0.3) * 0.5), new THREE.MeshBasicMaterial({ visible: false }), 0, (it.size || 0.3) * 0.3, 0, g);
    loadSTL(it.stl).then(geo => {
      geo.computeBoundingBox(); const bb = geo.boundingBox, sz = new THREE.Vector3(), c = new THREE.Vector3(); bb.getSize(sz); bb.getCenter(c);
      const s = (it.size || 0.3) / Math.max(sz.x, sz.y, sz.z);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: it.color || 0xe8c15a, roughness: .45, metalness: .15 }));
      m.scale.setScalar(s); m.rotation.x = -Math.PI / 2; m.position.set(-c.x * s, -bb.min.z * s, c.y * s);
      m.userData.decorId = it.id; g.add(m); pickables.push(m);
      hit.scale.set(sz.x * s / (it.size || 0.3), sz.z * s / ((it.size || 0.3) * 0.6), sz.y * s / ((it.size || 0.3) * 0.5)); hit.position.y = sz.z * s / 2;
    }).catch(e => console.warn('house STL not loaded', it.stl, e));
    return g;
  }

  // ---------- place decor ----------
  function place(it) {
    const room = roomGroups[it.room]; if (!room) return;
    let model;
    if (it.type === 'frame') model = frameModel(it);
    else if (it.type === 'print') model = printModel(it);
    else model = (MODELS[it.model] || MODELS.crystal)();
    const holder = new THREE.Group(); holder.add(model); holder.userData.decorId = it.id;
    const rot = (it.rotation || [0, 0, 0]).map(v => v * DEG);
    const off = it.offset || [0, 0, 0];
    if (it.anchor && anchors[it.anchor]) { anchors[it.anchor].add(holder); holder.position.set(...off); }
    else if (it.wall) { const F = WALL_FRAME[it.wall]; room.add(holder); holder.position.set(...F.at(it.u || 0, it.y ?? 1.6, 0.005)); holder.rotation.y = F.ry; holder.position.add(new THREE.Vector3(...off)); }
    else { room.add(holder); holder.position.set(...(it.position || [0, 0, 0])); }
    holder.rotation.x += rot[0]; holder.rotation.y += rot[1]; holder.rotation.z += rot[2];
    if (it.scale) holder.scale.setScalar(it.scale);
    holder.traverse(o => { if (o.isMesh) { o.userData.decorId = it.id; pickables.push(o); } });
    itemGroups.set(it.id, holder);
  }
  (data.items || []).forEach(place);

  // Nova herself, on the Window Seat cushion (curls up there at night)
  const novaIn = novaIndoors(makeNova({ lights: 'tail' }), { parent: roomGroups.window, x: -0.15, y: 0.62, z: -IN + 0.36, ry: 0, scale: 0.36 });
  novaIn.root.traverse(o => { if (o.isMesh) o.userData.novaPick = true; });
  updaters.push((t, dt) => { if (state.active) novaIn.tick(t, dt, { camera }); });

  // =====================================================================
  // walking
  // =====================================================================
  const state = { active: false, yaw: 0, pitch: 0, room: null, keys: new Set(), joy: { x: 0, y: 0 } };
  const pos = new THREE.Vector3();
  const RAD = 0.28;
  function resolve(p) {
    for (let k = 0; k < 2; k++) for (const [x0, x1, z0, z1] of colliders) {
      if (p.x > x0 - RAD && p.x < x1 + RAD && p.z > z0 - RAD && p.z < z1 + RAD) {
        const dl = p.x - (x0 - RAD), dr = (x1 + RAD) - p.x, dn = p.z - (z0 - RAD), ds = (z1 + RAD) - p.z;
        const m = Math.min(dl, dr, dn, ds);
        if (m === dl) p.x = x0 - RAD; else if (m === dr) p.x = x1 + RAD; else if (m === dn) p.z = z0 - RAD; else p.z = z1 + RAD;
      }
    }
    p.x = THREE.MathUtils.clamp(p.x, -5.5 + 0.1 + RAD, 5.5 - 0.1 - RAD); p.z = THREE.MathUtils.clamp(p.z, -5.5 + 0.1 + RAD, 5.5 - 0.1 - RAD);
  }
  const roomAt = p => (p.x < 0 ? (p.z > 0 ? 'study' : 'window') : (p.z > 0 ? 'art' : 'nook'));
  function setView(id) {
    const v = VIEWS[id], c = ROOMS[id].c;
    pos.set(v.from[0] + c[0], v.from[1], v.from[2] + c[1]);
    const at = new THREE.Vector3(v.at[0] + c[0], v.at[1], v.at[2] + c[1]);
    const d = at.sub(pos); state.yaw = Math.atan2(-d.x, -d.z); state.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    state.eye = v.from[1];
  }
  function goto(id) { if (!ROOMS[id]) return; setView(id); applyCam(); checkRoom(); }
  function applyCam() { camera.position.copy(pos); camera.position.y = state.eye ?? EYE; camera.rotation.set(state.pitch, state.yaw, 0); }
  function checkRoom() { const r = roomAt(pos); if (r !== state.room) { state.room = r; onRoom?.(r, ROOMS[r].name); } }

  const KEYMAP = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', KeyD: 'r', ArrowLeft: 'tl', ArrowRight: 'tr', KeyQ: 'tl', KeyE: 'tr' };
  addEventListener('keydown', e => { if (!state.active || e.target.closest?.('input,textarea')) return; const k = KEYMAP[e.code]; if (k) { state.keys.add(k); e.preventDefault(); } });
  addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) state.keys.delete(k); });
  addEventListener('blur', () => state.keys.clear());

  // drag to look, click/tap to pick
  const canvas = renderer.domElement; const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  const drags = new Map();
  canvas.addEventListener('pointerdown', e => { if (!state.active) return; drags.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY }); canvas.setPointerCapture?.(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (!state.active) return;
    const d = drags.get(e.pointerId);
    if (d) {
      const k = e.pointerType === 'touch' ? 0.006 : 0.0045;
      state.yaw += (e.clientX - d.x) * k; state.pitch += (e.clientY - d.y) * k; // drag the world: like turning your head
      state.pitch = THREE.MathUtils.clamp(state.pitch, -1.25, 1.1); d.x = e.clientX; d.y = e.clientY; return;
    }
    if (e.pointerType === 'mouse') { const now = performance.now(); if (now - (state.lastHover || 0) > 60) { state.lastHover = now; hover(e.clientX, e.clientY); } }
  });
  const end = e => {
    const d = drags.get(e.pointerId); drags.delete(e.pointerId);
    if (!state.active || !d || e.type === 'pointercancel') return;
    if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 7) pickAt(e.clientX, e.clientY);
  };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  const tip = document.getElementById('house-tip');
  const roomList = () => Object.values(roomGroups);
  function hit(x, y) {
    ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    // first solid thing under the pointer, so walls hide what is behind them; glass and glows are see-through
    const h = ray.intersectObjects(roomList(), true).find(h => h.object.isMesh && h.object.material && (h.object.material.depthWrite !== false || h.object.userData.decorId));
    return h && (h.object.userData.decorId || h.object.userData.exit || h.object.userData.novaPick) ? h : null;
  }
  function hover(x, y) {
    const h = hit(x, y); const id = h?.object.userData.decorId; const it = id && data.items.find(i => i.id === id);
    canvas.style.cursor = h ? 'pointer' : 'grab';
    if (tip) { if (it || h?.object.userData.exit || h?.object.userData.novaPick) { tip.textContent = it ? it.title : h.object.userData.novaPick ? 'Nova 🦊' : '⟵ Go back outside'; tip.style.left = x + 14 + 'px'; tip.style.top = y + 12 + 'px'; tip.hidden = false; } else tip.hidden = true; }
  }
  function pickAt(x, y) {
    const h = hit(x, y); if (!h) return null;
    if (h.object.userData.exit) { onExit?.(); return 'exit'; }
    if (h.object.userData.novaPick) { onNova?.(); return 'nova'; }
    const it = data.items.find(i => i.id === h.object.userData.decorId);
    if (it) { onPick?.(it, ROOMS[it.room]?.name); return it.id; }
    return null;
  }

  // mobile joystick
  const joy = document.getElementById('joy'); const knob = joy?.querySelector('i');
  if (joy) {
    let jid = null, cx = 0, cy = 0;
    joy.addEventListener('pointerdown', e => { jid = e.pointerId; const r = joy.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; joy.setPointerCapture(e.pointerId); move(e); e.preventDefault(); });
    const move = e => { if (e.pointerId !== jid) return; let dx = (e.clientX - cx) / 44, dy = (e.clientY - cy) / 44; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } state.joy.x = dx; state.joy.y = dy; knob.style.transform = `translate(${dx * 34}px,${dy * 34}px)`; };
    joy.addEventListener('pointermove', move);
    const up = e => { if (e.pointerId !== jid) return; jid = null; state.joy.x = state.joy.y = 0; knob.style.transform = ''; };
    joy.addEventListener('pointerup', up); joy.addEventListener('pointercancel', up);
  }

  const fwd = new THREE.Vector3(), right = new THREE.Vector3();
  function update(dt, t) {
    updaters.forEach(u => u(t, dt));
    if (!state.active) return;
    const K = state.keys;
    let mf = (K.has('f') ? 1 : 0) - (K.has('b') ? 1 : 0) - state.joy.y;
    let mr = (K.has('r') ? 1 : 0) - (K.has('l') ? 1 : 0) + state.joy.x;
    state.yaw += ((K.has('tl') ? 1 : 0) - (K.has('tr') ? 1 : 0)) * dt * 1.9;
    const l = Math.hypot(mf, mr); if (l > 1) { mf /= l; mr /= l; }
    if (l > 0.01) {
      fwd.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw)); right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
      const sp = 2.2 * dt; pos.addScaledVector(fwd, mf * sp).addScaledVector(right, mr * sp); resolve(pos);
      state.eye += (EYE - state.eye) * Math.min(1, dt * 2);
    }
    applyCam(); checkRoom();
  }
  function setActive(on, room) {
    state.active = on; state.keys.clear(); state.joy.x = state.joy.y = 0; drags.clear();
    if (on) { state.room = null; goto(room && ROOMS[room] ? room : 'study'); if (!room || !ROOMS[room]) { pos.set(-2.75, 0, 4.7); state.yaw = 0.12; state.pitch = innerWidth < innerHeight ? -0.16 : -0.05; state.eye = EYE; applyCam(); checkRoom(); } }
    if (tip) tip.hidden = true;
  }
  function screenPos(id) {
    const g = itemGroups.get(id); if (!g) return null;
    const box = new THREE.Box3().setFromObject(g); const c = box.getCenter(new THREE.Vector3()); c.project(camera);
    return { x: (c.x + 1) / 2 * innerWidth, y: (1 - c.y) / 2 * innerHeight, inFront: c.z < 1 };
  }
  function lookAtItem(id) {
    const g = itemGroups.get(id); if (!g) return;
    const box = new THREE.Box3().setFromObject(g); const c = box.getCenter(new THREE.Vector3());
    const it = data.items.find(i => i.id === id);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion((it.wall ? g : (g.parent || g)).getWorldQuaternion(new THREE.Quaternion())); // face it the way its wall/anchor faces n.y = 0; if (n.lengthSq() < 1e-4) n.set(0, 0, 1); n.normalize();
    const dist = it.type === 'frame' ? Math.max(1.3, (it.width || 0.8) * 1.4) : 1.0;
    pos.copy(c).addScaledVector(n, dist); pos.y = 0; resolve(pos);
    state.eye = THREE.MathUtils.clamp(c.y + 0.25, 0.9, EYE);
    const d = c.clone().sub(new THREE.Vector3(pos.x, state.eye, pos.z)); state.yaw = Math.atan2(-d.x, -d.z); state.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    applyCam(); checkRoom();
  }
  // ---------- time of day (called by main.js) ----------
  // Lamps are stronger at night; by day light pours in through the windows
  // (the window-seat light turns from moonlight blue to warm daylight).
  let applyGlowIn = null; const roomBase = {}; for (const k in roomLights) roomBase[k] = roomLights[k].intensity;
  const cDay = new THREE.Color(), cTmp = new THREE.Color();
  function daylight(st, sunDir, moonDir) {
    const p = st.pal;
    if (!applyGlowIn) applyGlowIn = collectGlows(scene);
    starsMat.opacity = p.stars; constMat.opacity = p.stars;
    const sunUp = THREE.MathUtils.smoothstep(st.sun.elevation, -2.5, 1.5), moonUp = THREE.MathUtils.smoothstep(st.moon.elevation, -2, 2);
    sunIn.position.set(sunDir[0] * 130, sunDir[1] * 130, sunDir[2] * 130); sunHaloIn.position.copy(sunIn.position);
    sunIn.material.opacity = sunUp; sunIn.visible = sunUp > 0.001; sunHaloIn.material.opacity = 0.7 * sunUp * (1 - 0.6 * THREE.MathUtils.clamp(st.sun.elevation / 12, 0, 1));
    sunIn.material.color.setHex(0xff9a52).lerp(cTmp.setHex(0xfff6e2), THREE.MathUtils.clamp(st.sun.elevation / 12, 0, 1));
    moonIn.position.set(moonDir[0] * 48, moonDir[1] * 48, moonDir[2] * 48); moonHaloIn.position.copy(moonIn.position);
    moonIn.material.opacity = moonUp * (0.4 + 0.6 * p.night); moonIn.visible = moonUp > 0.001; moonHaloIn.material.opacity = 0.5 * moonUp * p.night;
    for (const k in roomLights) roomLights[k].intensity = roomBase[k] * (0.5 + 0.5 * p.night);
    hemiIn.color.setHex(0xffe0b8).lerp(cDay.setHex(0xfff2e4), p.day); hemiIn.intensity = 0.55 + 0.65 * p.day;
    moonLight.color.setHex(0x9fb2ff).lerp(cDay.setHex(0xffe8c8), p.day); moonLight.intensity = 3.5 + 6 * p.day;
    applyGlowIn(1 - 0.45 * p.day, 1 - 0.55 * p.day);
  }
  function resize() { camera.aspect = innerWidth / innerHeight; camera.fov = innerWidth < innerHeight ? 78 : 70; camera.updateProjectionMatrix(); }
  resize();
  function novaScreen() { const c = novaIn.root.localToWorld(new THREE.Vector3(0, 0.55, 0)).project(camera); return { x: (c.x + 1) / 2 * innerWidth, y: (1 - c.y) / 2 * innerHeight, inFront: c.z < 1 }; }
  function lookAtNova() { pos.set(-2.75 - 0.15, 0, -2.75 - IN + 1.9); resolve(pos); state.eye = 1.05; const c = novaIn.root.localToWorld(new THREE.Vector3(0, 0.4, 0)); const d = c.sub(new THREE.Vector3(pos.x, state.eye, pos.z)); state.yaw = Math.atan2(-d.x, -d.z); state.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); applyCam(); checkRoom(); }
  return { scene, camera, update, daylight, setActive, goto, pickAt, screenPos, lookAtItem, resize, state, pos, rooms: ROOMS, items: data.items, colliders, novaScreen, lookAtNova, get novaStatus() { return novaIn.status; } };
}

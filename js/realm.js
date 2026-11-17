// The Realm: one big flat ground-level world (Earth feel, no curve) where every
// place stands at the spot the tiny planet's map gives it. Layout = an azimuthal
// equidistant projection of the planet lat/lon around the Hearth, so north on the
// planet is "up" (-z) on the ground and distances from home are true to the map.
// Winding roads (the planet's paths) join the places, with signposts, lanterns,
// meadows and trees. Ground tiles and plants stream in by distance; far places show
// as landmarks on the horizon.
import * as THREE from 'three';
import { rng, mat, glow, mesh, glowSprite, textSprite, canvasTexture, mergeStatic } from './util.js';
import { DAY } from './daylight.js';
import { dirFromLatLon } from './planet.js';

const Y = new THREE.Vector3(0, 1, 0);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createRealm(cfg, list, { grass = {} } = {}) {
  const K = cfg.realm?.scale || 220;                 // world units per radian of planet arc
  const centerId = cfg.realm?.center || 'hearth';
  const group = new THREE.Group(); group.name = 'realm'; group.visible = false;
  const places = new Map(), solids = [], pickables = [], chunked = [];
  const rnd = rng(9090);

  // ---------- layout ----------
  const cp = cfg.places?.[centerId] || { lat: 0, lon: 0 };
  const h = dirFromLatLon(cp.lat, cp.lon);
  const north = new THREE.Vector3(0, 1, 0).addScaledVector(h, -h.y).normalize(), east = new THREE.Vector3().crossVectors(north, h);
  for (const { id, r, name, short } of list) {
    const P = cfg.places?.[id] || { lat: 0, lon: 0, yaw: 0 };
    const n = dirFromLatLon(P.lat, P.lon), c = Math.acos(THREE.MathUtils.clamp(n.dot(h), -1, 1));
    let x = 0, z = 0;
    if (c > 1e-6) { const t = n.clone().addScaledVector(h, -n.dot(h)).normalize(); x = t.dot(east) * c * K; z = -t.dot(north) * c * K; }
    const yaw = (P.yaw || 0) * Math.PI / 180;
    places.set(id, { id, r, name, short, pos: new THREE.Vector3(x, 0, z), quat: new THREE.Quaternion().setFromAxisAngle(Y, yaw), yaw });
  }
  const P = [...places.values()];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of P) { minX = Math.min(minX, p.pos.x); maxX = Math.max(maxX, p.pos.x); minZ = Math.min(minZ, p.pos.z); maxZ = Math.max(maxZ, p.pos.z); }
  const M = 240; minX -= M; maxX += M; minZ -= M; maxZ += M;
  const bounds = { minX, maxX, minZ, maxZ };

  // ---------- roads (winding, between place edges) ----------
  const roads = [];
  const bucket = new Map(), BS = 16;
  const key = (i, j) => i * 100003 + j;
  (cfg.paths || []).forEach(([a, b], ri) => {
    const A = places.get(a), B = places.get(b); if (!A || !B) return;
    const d = B.pos.clone().sub(A.pos); const L = d.length(); d.divideScalar(L);
    const side = new THREE.Vector3(-d.z, 0, d.x);
    const s0 = A.r * 0.95, s1 = L - B.r * 0.95, amp = Math.min(26, L * 0.1), fr = 1.5 + (ri % 3) * 0.5, ph = ri * 1.7;
    const n = Math.max(6, Math.ceil((s1 - s0) / 2)); const pts = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, s = s0 + (s1 - s0) * u;
      const w = Math.sin(Math.PI * u) * amp * Math.sin(fr * Math.PI * u + ph) + Math.sin(Math.PI * u) * Math.sin(7 * u + ri) * 2.5;
      pts.push(A.pos.clone().addScaledVector(d, s).addScaledVector(side, w));
    }
    let len = 0; for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
    roads.push({ a, b, pts, len });
    for (const p of pts) { const k = key(Math.floor(p.x / BS), Math.floor(p.z / BS)); if (!bucket.has(k)) bucket.set(k, []); bucket.get(k).push(p); }
  });
  function roadDist(x, z, max = 14) {
    let best = max; const i0 = Math.floor((x - max) / BS), i1 = Math.floor((x + max) / BS), j0 = Math.floor((z - max) / BS), j1 = Math.floor((z + max) / BS);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const l = bucket.get(key(i, j)); if (l) for (const p of l) { const dd = Math.hypot(p.x - x, p.z - z); if (dd < best) best = dd; } }
    return best;
  }
  function placeDist(x, z) { let best = Infinity, bp = null; for (const p of P) { const dd = Math.hypot(p.pos.x - x, p.pos.z - z) - p.r * 1.2; if (dd < best) { best = dd; bp = p; } } return { d: best, p: bp }; }

  // ---------- ground height ----------
  const hills = (x, z) => 2.2 * Math.sin(x * 0.021 + 1.3) * Math.sin(z * 0.017 + 0.4) + 1.1 * Math.sin(x * 0.053 + z * 0.031) * Math.cos(z * 0.047 - 1.1) + 0.45 * Math.sin(x * 0.13 + 2) * Math.sin(z * 0.11);
  function heightAt(x, z) {
    const pd = placeDist(x, z).d, rd = roadDist(x, z);
    const w = smooth(0, 34, pd) * smooth(2.6, 20, rd);
    // the land rises gently toward the edge of the world (soft hills on the horizon)
    const ex = Math.max(0, bounds.minX + 120 - x, x - (bounds.maxX - 120)), ez = Math.max(0, bounds.minZ + 120 - z, z - (bounds.maxZ - 120));
    return (hills(x, z) * 0.7 + 0.9) * w + Math.pow(Math.hypot(ex, ez) / 120, 2) * 14 * w;
  }

  // ---------- ground tiles (built lazily, culled by distance) ----------
  const TS = 128, SEG = 30;
  const tMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const tiles = new Map();
  const base = new THREE.Color(0x30553a), dry = new THREE.Color(0x48582f), deep = new THREE.Color(0x244633), c = new THREE.Color(), cc = new THREE.Color();
  function buildTile(i, j) {
    const geo = new THREE.PlaneGeometry(TS, TS, SEG, SEG).rotateX(-Math.PI / 2).toNonIndexed();
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    const ox = (i + 0.5) * TS, oz = (j + 0.5) * TS;
    for (let k = 0; k < pos.count; k++) { const x = pos.getX(k) + ox, z = pos.getZ(k) + oz; pos.setXYZ(k, x, heightAt(x, z), z); }
    for (let k = 0; k < pos.count; k += 3) {
      const x = (pos.getX(k) + pos.getX(k + 1) + pos.getX(k + 2)) / 3, z = (pos.getZ(k) + pos.getZ(k + 1) + pos.getZ(k + 2)) / 3;
      const hh = hills(x, z), jj = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5) % 1;
      c.copy(base).lerp(hh > 0 ? dry : deep, Math.min(1, Math.abs(hh) * 0.35)).offsetHSL(0, 0, (jj - 0.5) * 0.04);
      const { d, p } = placeDist(x, z);
      if (p && d < 10) c.lerp(cc.setHex(grass[p.id] ?? 0x23402f), 0.75 * (1 - smooth(-4, 10, d)));
      for (let q = 0; q < 3; q++) col.set([c.r, c.g, c.b], (k + q) * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals(); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, tMat); m.userData.ground = true; group.add(m); return m;
  }
  // beyond the tiles: one big plain (the fog hides its edge)
  const far = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x2a4a33 }));
  far.position.set((minX + maxX) / 2, -4.2, (minZ + maxZ) / 2); group.add(far);

  const signs = [];
  // ---------- roads mesh, edge glow, lanterns, signposts ----------
  {
    const rib = [], glowP = [], halo = [];
    const lan = new THREE.Group(); const postM = mat(0x1b1b24), lampM = glow(0xffd77a, 2.2), redM = mat(0x8c2a2f);
    const postG = new THREE.CylinderGeometry(0.07, 0.1, 2.4, 6), lampG = new THREE.BoxGeometry(0.46, 0.55, 0.46), capG = new THREE.ConeGeometry(0.42, 0.32, 4);
    for (const R of roads) {
      const pts = R.pts;
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1]; const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; const sx = -dz / l * 1.4, sz = dx / l * 1.4;
        const q = [[a.x - sx, a.z - sz], [a.x + sx, a.z + sz], [b.x + sx, b.z + sz], [b.x - sx, b.z - sz]].map(([x, z]) => [x, heightAt(x, z) + 0.07, z]);
        rib.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]);
        if (k % 3 === 0) for (const s of [-1, 1]) { const x = a.x + sx * 1.15 * s, z = a.z + sz * 1.15 * s; glowP.push(x, heightAt(x, z) + 0.2, z); }
        if (k % 12 === 6) {
          const s = (k / 12) % 2 ? 1 : -1, x = a.x + sx * 2.2 * s, z = a.z + sz * 2.2 * s, y = heightAt(x, z);
          const L = new THREE.Group(); L.position.set(x, y, z); lan.add(L);
          mesh(postG, postM, 0, 1.2, 0, L); mesh(lampG, lampM, 0, 2.6, 0, L); mesh(capG, (k / 12) % 3 === 1 ? redM : postM, 0, 3.05, 0, L).rotation.y = Math.PI / 4;
          halo.push(x, y + 2.6, z);
        }
      }
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rib, 3)); rg.computeVertexNormals();
    group.add(new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ color: 0x8a6a3a, emissive: 0x3a2a0a, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 })));
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(glowP, 3));
    group.add(new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xf2cd62, size: 0.5, map: glowSprite().material.map, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending })));
    group.add(lan); mergeStatic(lan);
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(halo, 3));
    group.add(new THREE.Points(hg, new THREE.PointsMaterial({ color: 0xffd77a, size: 3, map: glowSprite().material.map, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending })));
    // signposts: where each road leaves a place, one board per destination
    const wood = mat(0x5a3a22);
    for (const p of P) {
      const outs = roads.filter(R => R.a === p.id || R.b === p.id); if (!outs.length) continue;
      const first = outs[0], start = first.a === p.id ? first.pts[3] : first.pts[first.pts.length - 4];
      const toC = p.pos.clone().sub(start).setY(0).normalize(), sideV = new THREE.Vector3(-toC.z, 0, toC.x);
      const sp = start.clone().addScaledVector(sideV, 2.6); sp.y = heightAt(sp.x, sp.z);
      const sg = new THREE.Group(); sg.position.copy(sp); group.add(sg); signs.push(sg);
      mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.4 + outs.length * 0.42, 6), wood, 0, (2.4 + outs.length * 0.42) / 2, 0, sg);
      outs.forEach((R, k) => {
        const dest = places.get(R.a === p.id ? R.b : R.a), pts = R.a === p.id ? R.pts : [...R.pts].reverse();
        const dir = pts[Math.min(pts.length - 1, 12)].clone().sub(pts[0]).setY(0).normalize();
        const label = `${dest.short || dest.name}  ›  ${Math.round(R.len / 10) * 10} m`;
        const tex = canvasTexture(512, 96, (g, w, hh) => { g.fillStyle = '#2b1a0e'; g.fillRect(0, 0, w, hh); g.strokeStyle = '#e8c15a'; g.lineWidth = 6; g.strokeRect(4, 4, w - 8, hh - 8); g.fillStyle = '#f6dc8c'; g.font = '600 46px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, w / 2, hh / 2 + 2); });
        const board = new THREE.Group(); board.position.y = 2.1 + k * 0.42; board.rotation.y = Math.atan2(dir.x, dir.z) - Math.PI / 2; sg.add(board);
        const face = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.36, 0.06), new THREE.MeshLambertMaterial({ map: tex }));
        face.position.x = 1.1; face.userData.signpost = dest.id; board.add(face); pickables.push(face);
        const tip = mesh(new THREE.ConeGeometry(0.2, 0.3, 3), mat(0xe8c15a), 2.35, 0, 0, board); tip.rotation.z = -Math.PI / 2; tip.userData.signpost = dest.id; pickables.push(tip);
      });
    }
  }

  // ---------- meadows: trees, flowers, tufts, rocks (instanced per 128-unit cell) ----------
  const CS = 256; const cells = new Map();
  const lam = col => new THREE.MeshLambertMaterial({ color: col, flatShading: true });
  const trunkG = new THREE.CylinderGeometry(0.15, 0.22, 0.9, 6).translate(0, 0.45, 0);
  const coneGs = [0, 1, 2].map(i => new THREE.ConeGeometry(1.1 - i * 0.28, 1.25, 7).translate(0, 1.15 + i * 0.7, 0));
  const ballG = new THREE.IcosahedronGeometry(1, 0).translate(0, 1.6, 0);
  const flowerG = new THREE.OctahedronGeometry(0.12, 0).translate(0, 0.22, 0), tuftG = new THREE.ConeGeometry(0.1, 0.5, 3).translate(0, 0.25, 0), rockG = new THREE.DodecahedronGeometry(0.5, 0);
  const KINDS = { trunk: [trunkG, lam(0x4a3424)], c0: [coneGs[0], lam(0x1f4a35)], c1: [coneGs[1], lam(0x24553c)], c2: [coneGs[2], lam(0x1f4a35)], ball: [ballG, lam(0x2f6a46)], ballR: [ballG, lam(0x7a3a3a)], flower: [flowerG, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x332211, flatShading: true })], tuft: [tuftG, lam(0x3f6b45)], rock: [rockG, lam(0x55506a)] };
  const items = {}; for (const k in KINDS) items[k] = new Map();
  const Mx = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), V = new THREE.Vector3();
  function add(kind, x, z, s, sy = s, color = null) {
    const ck = key(Math.floor(x / CS), Math.floor(z / CS)); const m = items[kind]; if (!m.has(ck)) m.set(ck, []);
    Q.setFromAxisAngle(Y, rnd() * 6.28); V.set(x, heightAt(x, z), z); S.set(s, sy, s); Mx.compose(V, Q, S); m.get(ck).push({ m: Mx.clone(), color });
  }
  const area = (maxX - minX) * (maxZ - minZ);
  const randXZ = () => [minX + rnd() * (maxX - minX), minZ + rnd() * (maxZ - minZ)];
  const fc = [0xf2cd62, 0xc8323a, 0xf4ece0, 0x9a7ae0, 0xf2cd62];
  let n = 0;
  for (let t = 0; t < area / 1100 && n < 1400; t++) {          // trees
    const [x, z] = randXZ(); if (placeDist(x, z).d < 6 || roadDist(x, z, 6) < 5.5) continue; n++;
    if (rnd() < 0.55) { const s = 0.6 + rnd() * rnd() * 1.1; add('trunk', x, z, s); add('c0', x, z, s); add('c1', x, z, s); add('c2', x, z, s); }
    else { const s = 0.5 + rnd() * rnd() * 0.8; add('trunk', x, z, s); add(rnd() < 0.12 ? 'ballR' : 'ball', x, z, s, s * (0.8 + rnd() * 0.5)); }
  }
  for (const R of roads) for (let k = 0; k < R.pts.length; k += 2) {   // flowers & tufts along roads
    const p = R.pts[k];
    for (let q = 0; q < 2; q++) { const a = rnd() * 6.28, d = 2.4 + rnd() * 6; const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d; if (roadDist(x, z, 3) < 2.2 || placeDist(x, z).d < 1) continue; add(rnd() < 0.55 ? 'flower' : 'tuft', x, z, 0.8 + rnd() * 0.7, undefined, fc[(k + q) % 5]); }
  }
  for (let t = 0; t < area / 260; t++) { const [x, z] = randXZ(); if (placeDist(x, z).d < 2 || roadDist(x, z, 3) < 2.4) continue; add('tuft', x, z, 0.8 + rnd() * 0.9); }
  for (let t = 0; t < area / 5000; t++) { const [x, z] = randXZ(); if (placeDist(x, z).d < 4 || roadDist(x, z, 4) < 3.5) continue; const s = 0.6 + rnd() * 1.6; add('rock', x, z, s, s * (0.4 + rnd() * 0.5)); }
  for (const kind in items) for (const [ck, list] of items[kind]) {
    const [g, m] = KINDS[kind]; const im = new THREE.InstancedMesh(g, m, list.length);
    list.forEach((it, k) => { im.setMatrixAt(k, it.m); if (it.color != null) im.setColorAt(k, c.setHex(it.color)); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere();
    group.add(im); chunked.push(im);
  }

  // ---------- horizon: a ring of dark distant hills (no fog, always there) ----------
  const ring = (() => {
    const N = 160, R0 = 1500, pos = [], cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const hgt = i => 40 + 28 * Math.sin(i * 0.37) * Math.sin(i * 0.11 + 1) + 16 * Math.sin(i * 1.3 + 2) + 10 * Math.sin(i * 2.9);
    for (let i = 0; i < N; i++) {
      const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2, h0 = hgt(i), h1 = hgt(i + 1);
      const p = (a, y) => [cx + Math.cos(a) * R0, y, cz + Math.sin(a) * R0];
      pos.push(...p(a0, -20), ...p(a1, -20), ...p(a1, h1), ...p(a0, -20), ...p(a1, h1), ...p(a0, h0));
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x0c1430, fog: false, side: THREE.DoubleSide })); m.frustumCulled = false; group.add(m); return m;
  })();

  // ---------- landmarks: what a far place looks like on the horizon ----------
  const dark = new THREE.MeshBasicMaterial({ color: 0x0a0f22, fog: false });
  const goldB = new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false });
  for (const p of P) {
    const L = new THREE.Group(); L.position.copy(p.pos); L.quaternion.copy(p.quat); group.add(L); p.landmark = L;
    if (p.id === 'arcade') {
      mesh(new THREE.CylinderGeometry(2.6, 4.2, 12, 8), dark, 0, 6, 0, L);
      for (const [x, y, z, r] of [[0, 15, 0, 6], [-5, 13, 2, 4.5], [5, 13.5, -1, 4.8], [2, 18, 3, 4], [-3, 17.5, -3, 4.2]]) mesh(new THREE.IcosahedronGeometry(r, 0), new THREE.MeshBasicMaterial({ color: 0x2a1c0c, fog: false }), x, y, z, L);
      mesh(new THREE.BoxGeometry(3.4, 1.0, 0.3), goldB, 0, 4.6, 3.6, L);
    } else if (p.id === 'starDock') {
      mesh(new THREE.SphereGeometry(2.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark, -3.5, 0, -2, L);
      const tube = mesh(new THREE.CylinderGeometry(0.35, 0.5, 5, 8), new THREE.MeshBasicMaterial({ color: 0xd8dce8, fog: false }), 0.5, 3.4, 0.5, L); tube.rotation.z = 0.7;
      mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.6, 4), dark, 0.5, 1.3, 0.5, L);
    } else if (p.id === 'hearth') {
      const b = new THREE.Group(); b.position.set(-5.1, 0, -4.7); b.rotation.y = 0.8; b.scale.setScalar(1.5); L.add(b);
      mesh(new THREE.BoxGeometry(3.6, 2.1, 3), dark, 0, 1.05, 0, b); const roof = mesh(new THREE.ConeGeometry(2.9, 1.5, 4), dark, 0, 2.85, 0, b); roof.rotation.y = Math.PI / 4;
      mesh(new THREE.BoxGeometry(0.6, 0.5, 0.05), goldB, 0.95, 1.3, 1.53, b); mesh(new THREE.BoxGeometry(0.6, 4.2, 0.6), dark, -2.1, 2.1, 0.65, b);
    } else {
      mesh(new THREE.CylinderGeometry(0.12, 0.18, 7, 6), dark, 0, 3.5, 0, L); mesh(new THREE.BoxGeometry(0.9, 1, 0.9), goldB, 0, 7.4, 0, L);
    }
    const beam = mesh(new THREE.CylinderGeometry(2.2, 0.6, 60, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xe8c15a, fog: false, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 0, 30, 0, L);
    beam.userData.beam = true;
    const lab = textSprite(p.name, { size: 1.6 }); lab.material.sizeAttenuation = false; lab.material.depthTest = false; lab.material.fog = false; lab.scale.multiplyScalar(0.028 / 1.6); lab.renderOrder = 11;
    lab.position.y = p.id === 'arcade' ? 24 : 11; L.add(lab);
    L.visible = false;
  }

  // ---------- fireflies that drift around wherever you are ----------
  const NF = 140, ff = [], fpos = new Float32Array(NF * 3);
  for (let i = 0; i < NF; i++) ff.push({ x: (rnd() - 0.5) * 120, z: (rnd() - 0.5) * 120, h: 0.5 + rnd() * 2, ph: rnd() * 6.28, w: 0.3 + rnd() * 0.6 });
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  const fireflies = new THREE.Points(fg, new THREE.PointsMaterial({ color: 0xf6e27a, size: 0.25, map: glowSprite().material.map, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
  fireflies.material.userData.anim = true; fireflies.frustumCulled = false; group.add(fireflies);

  // ---------- per-frame: stream tiles, cull plants, landmarks, fireflies ----------
  const VIEW = 300, LAND = 230;
  function update(t, dt, cam, { placeVisible } = {}) {
    const cx = cam.x, cz = cam.z;
    const i0 = Math.floor((Math.max(minX, cx - VIEW)) / TS), i1 = Math.floor((Math.min(maxX, cx + VIEW)) / TS), j0 = Math.floor((Math.max(minZ, cz - VIEW)) / TS), j1 = Math.floor((Math.min(maxZ, cz + VIEW)) / TS);
    let built = 0;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = key(i, j); if (tiles.has(k)) continue;
      const dx = Math.max(0, Math.abs((i + 0.5) * TS - cx) - TS / 2), dz = Math.max(0, Math.abs((j + 0.5) * TS - cz) - TS / 2);
      if (Math.hypot(dx, dz) > VIEW) continue;
      if (built++ < 1 || !ready) tiles.set(k, buildTile(i, j));   // a few per frame once running, all at once the first time
    }
    for (const m of tiles.values()) { const s = m.geometry.boundingSphere.center; m.visible = Math.hypot(s.x - cx, s.z - cz) < VIEW + TS; }
    for (const m of chunked) { const s = m.boundingSphere.center; m.visible = Math.hypot(s.x - cx, s.z - cz) < VIEW * 0.85 + m.boundingSphere.radius; }
    for (const sg of signs) sg.visible = Math.hypot(sg.position.x - cx, sg.position.z - cz) < 140;
    for (const p of P) { const d = Math.hypot(p.pos.x - cx, p.pos.z - cz); const near = d < LAND; p.landmark.visible = !near; if (placeVisible) placeVisible(p.id, near); }
    const a = fg.attributes.position;
    ff.forEach((f, i) => { let x = cx + ((f.x - cx) % 120 + 180) % 120 - 60, z = cz + ((f.z - cz) % 120 + 180) % 120 - 60; x += Math.sin(t * f.w + f.ph) * 0.8; z += Math.cos(t * f.w * 0.7 + f.ph) * 0.8; a.setXYZ(i, x, heightAt(x, z) + f.h + Math.sin(t * 1.3 + f.ph) * 0.3, z); });
    a.needsUpdate = true; fireflies.material.opacity = 0.1 + 0.85 * DAY.night;
    ring.material.color.setHex(DAY.day > 0.5 ? 0x5a7a9a : 0x0c1430);
    ready = true;
  }
  let ready = false;
  function prewarm(x, z) { ready = false; update(0, 0, new THREE.Vector3(x, 0, z), {}); }

  // ---------- walking: blockers ----------
  function addSolids(id, local) {
    const p = places.get(id); if (!p) return;
    const m = new THREE.Matrix4().compose(p.pos, p.quat, new THREE.Vector3(1, 1, 1));
    for (const [x, z, r] of local) { const v = new THREE.Vector3(x, 0, z).applyMatrix4(m); solids.push({ x: v.x, z: v.z, r }); }
  }
  function collide(v, rad = 0.35) {
    for (const s of solids) { const dx = v.x - s.x, dz = v.z - s.z, d = Math.hypot(dx, dz), min = s.r + rad; if (d < min) { const k = d > 1e-6 ? min / d : 0; v.x = s.x + (d > 1e-6 ? dx * k : min); v.z = s.z + dz * k; } }
    v.x = THREE.MathUtils.clamp(v.x, minX + 20, maxX - 20); v.z = THREE.MathUtils.clamp(v.z, minZ + 20, maxZ - 20);
    return v;
  }

  // ---------- minimap ----------
  function drawMap(ctx, w, hgt, me, yaw, scale = 0.22) {
    ctx.clearRect(0, 0, w, hgt);
    ctx.save(); ctx.beginPath(); ctx.arc(w / 2, hgt / 2, w / 2 - 2, 0, Math.PI * 2); ctx.fillStyle = 'rgba(10,15,36,.78)'; ctx.fill(); ctx.clip();
    const X = x => w / 2 + (x - me.x) * scale, Z = z => hgt / 2 + (z - me.z) * scale;
    ctx.strokeStyle = 'rgba(232,193,90,.6)'; ctx.lineWidth = 4;
    for (const R of roads) { ctx.beginPath(); R.pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Z(p.z)) : ctx.moveTo(X(p.x), Z(p.z)))); ctx.stroke(); }
    ctx.font = '600 19px system-ui, sans-serif'; ctx.textAlign = 'center';
    for (const p of P) {
      let x = X(p.pos.x), z = Z(p.pos.z); const dx = x - w / 2, dz = z - hgt / 2, d = Math.hypot(dx, dz), lim = w / 2 - 10;
      const edge = d > lim; if (edge) { x = w / 2 + dx / d * lim; z = hgt / 2 + dz / d * lim; }
      ctx.fillStyle = p.id === 'hearth' ? '#c8323a' : '#e8c15a'; ctx.beginPath(); ctx.arc(x, z, edge ? 5 : 8, 0, Math.PI * 2); ctx.fill();
      if (!edge) { ctx.fillStyle = '#f6dc8c'; ctx.fillText(p.short || p.name, x, z - 12); }
    }
    ctx.restore();
    // you (arrow) + north marker
    ctx.save(); ctx.translate(w / 2, hgt / 2); ctx.rotate(yaw); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(10, 12); ctx.lineTo(0, 6); ctx.lineTo(-10, 12); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#e8c15a'; ctx.font = '700 24px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('N', w / 2, 26);
    ctx.strokeStyle = 'rgba(232,193,90,.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(w / 2, hgt / 2, w / 2 - 2, 0, Math.PI * 2); ctx.stroke();
  }

  return { group, places, roads, bounds, heightAt, roadDist, update, prewarm, addSolids, collide, solids, pickables, drawMap };
}

// =====================================================================
// Walking on flat ground (same interface as the planet walker)
// =====================================================================
export function createFlatWalker(realm, camera, dom, { joy } = {}) {
  const pos = new THREE.Vector3(), n = new THREE.Vector3(0, 1, 0), f = new THREE.Vector3(0, 0, -1);
  const st = { active: false, yaw: 0, pitch: -0.08, keys: new Set(), joy: { x: 0, y: 0 }, eye: 1.6, speed: 6.5, dist: 0 };
  const look = new THREE.Vector3();
  function enter(p, lookAt) {
    pos.set(p.x, 0, p.z); realm.collide(pos);
    const d = lookAt ? lookAt.clone().sub(p) : new THREE.Vector3(0, 0, -1); st.yaw = Math.atan2(-d.x, -d.z);
    st.pitch = -0.08; st.active = true; st.dist = 0; place();
  }
  function exit() { st.active = false; st.keys.clear(); st.joy.x = st.joy.y = 0; }
  function place() {
    f.set(-Math.sin(st.yaw), 0, -Math.cos(st.yaw));
    camera.position.set(pos.x, realm.heightAt(pos.x, pos.z) + st.eye, pos.z); camera.up.set(0, 1, 0);
    look.copy(camera.position).addScaledVector(f, Math.cos(st.pitch)); look.y += Math.sin(st.pitch); camera.lookAt(look);
  }
  const K = k => st.keys.has(k);
  function update(dt) {
    if (!st.active) return;
    dt = Math.min(dt, 0.25);
    let fw = (K('w') || K('arrowup') ? 1 : 0) - (K('s') || K('arrowdown') ? 1 : 0) - st.joy.y;
    let sr = (K('d') ? 1 : 0) - (K('a') ? 1 : 0) + st.joy.x;
    st.yaw += ((K('arrowleft') || K('q') ? 1 : 0) - (K('arrowright') || K('e') ? 1 : 0)) * 1.9 * dt;
    const l = Math.hypot(fw, sr); if (l > 1) { fw /= l; sr /= l; }
    if (fw || sr) {
      f.set(-Math.sin(st.yaw), 0, -Math.cos(st.yaw)); const rx = -f.z, rz = f.x;
      let left = st.speed * (K('shift') ? 1.8 : 1) * dt * Math.hypot(fw, sr); st.dist += left;
      const mx = (f.x * fw + rx * sr) / (Math.hypot(fw, sr) || 1), mz = (f.z * fw + rz * sr) / (Math.hypot(fw, sr) || 1);
      while (left > 1e-6) { const s = Math.min(left, 0.3); left -= s; pos.x += mx * s; pos.z += mz * s; realm.collide(pos); }
    }
    place();
  }
  let drag = null;
  dom.addEventListener('pointerdown', e => { if (!st.active || e.target !== dom) return; drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
  addEventListener('pointermove', e => { if (!st.active || !drag || e.pointerId !== drag.id) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; st.yaw -= dx * 0.0045; st.pitch = THREE.MathUtils.clamp(st.pitch - dy * 0.0035, -1.2, 1.1); });
  addEventListener('pointerup', e => { if (drag && e.pointerId === drag.id) drag = null; });
  const keyName = e => e.key.toLowerCase();
  addEventListener('keydown', e => { if (!st.active || /input|textarea|select/i.test(e.target.tagName)) return; const k = keyName(e); if (['w', 'a', 's', 'd', 'q', 'e', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { st.keys.add(k); e.preventDefault(); } });
  addEventListener('keyup', e => st.keys.delete(keyName(e)));
  addEventListener('blur', () => st.keys.clear());
  if (joy) {
    const knob = joy.querySelector('i'); let jid = null, cx = 0, cy = 0;
    const set = (x, y) => { const r = 44; let dx = x - cx, dy = y - cy; const l = Math.hypot(dx, dy); if (l > r) { dx *= r / l; dy *= r / l; } knob.style.transform = `translate(${dx}px, ${dy}px)`; st.joy.x = dx / r; st.joy.y = dy / r; };
    joy.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); jid = e.pointerId; joy.setPointerCapture?.(e.pointerId); const b = joy.getBoundingClientRect(); cx = b.left + b.width / 2; cy = b.top + b.height / 2; set(e.clientX, e.clientY); });
    joy.addEventListener('pointermove', e => { if (e.pointerId === jid) set(e.clientX, e.clientY); });
    const end = e => { if (e.pointerId !== jid) return; jid = null; st.joy.x = st.joy.y = 0; knob.style.transform = ''; };
    joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
  }
  return { state: st, pos, n, f, enter, exit, update, place, get active() { return st.active; } };
}

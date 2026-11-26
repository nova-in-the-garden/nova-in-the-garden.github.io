// The Realm: one big flat ground-level world (Earth feel, no curve) where every
// place stands at the spot the tiny planet's map gives it. Layout = an azimuthal
// equidistant projection of the planet lat/lon around the Hearth, so north on the
// planet is "up" (-z) on the ground and distances from home are true to the map.
// Winding roads (the planet's paths) join the places, with signposts, lanterns,
// meadows and trees. Ground tiles and plants stream in by distance; far places show
// as landmarks on the horizon.
import * as THREE from 'three';
import { rng, rule90, mat, glow, mesh, glowSprite, textSprite, canvasTexture, mergeStatic } from './util.js';
import { DAY } from './daylight.js';
import { dirFromLatLon } from './planet.js';

const Y = new THREE.Vector3(0, 1, 0);
// Biomes: what the land looks like around each place (data/planet.json places.<id>.biome).
// ground = base colour; lift = a raised plateau the place sits on (its roads ramp up to it).
const BIOMES = {
  wild: { ground: 0x34583a }, meadow: { ground: 0x3a6a40 }, forest: { ground: 0x24462e }, lookout: { ground: 0x56654c, lift: 7 },
  painted: { ground: 0x3c5e48 }, amber: { ground: 0x7a7038 }, crystal: { ground: 0x3a4e56 }, yard: { ground: 0x5e584c },
  glow: { ground: 0x1c3e3a }, stones: { ground: 0x45524a }, lawn: { ground: 0x2a5a38 },
};
const BAND = [0xc8323a, 0xf2cd62, 0x9a7ae0, 0xf4ece0, 0x5a8ad8];
// Rule 30 rows (for the Emergence Grove's moss pattern)
function rule30Bits(w, rows) { let r = new Array(w).fill(0); r[w >> 1] = 1; const out = []; for (let i = 0; i < rows; i++) { out.push(r); r = r.map((_, j) => { const L = r[(j + w - 1) % w], C = r[j], R = r[(j + 1) % w]; return L ^ (C | R); }); } return out; }
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createRealm(cfg, list, { grass = {} } = {}) {
  const grassNow = { ...grass };
  let seasonSnow = 0, seasonFar = 0x35603f;
  const snowC = new THREE.Color(0xe8eef4);
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
    const biome = BIOMES[P.biome] ? P.biome : 'wild', B = BIOMES[biome];
    places.set(id, { id, r, name, short, biome, B, lift: B.lift || 0, pos: new THREE.Vector3(x, B.lift || 0, z), quat: new THREE.Quaternion().setFromAxisAngle(Y, yaw), yaw, near: false });
  }
  const P = [...places.values()];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of P) { minX = Math.min(minX, p.pos.x); maxX = Math.max(maxX, p.pos.x); minZ = Math.min(minZ, p.pos.z); maxZ = Math.max(maxZ, p.pos.z); }
  const M = 240; minX -= M; maxX += M; minZ -= M; maxZ += M;
  const bounds = { minX, maxX, minZ, maxZ };
  const key = (i, j) => i * 100003 + j;

  // ---------- the river (data: realm.river, a polyline that winds between places) ----------
  const river = (cfg.realm?.river || []).map(([x, z]) => new THREE.Vector2(x, z));
  const riverPts = [];   // smoothed + wiggled, every ~4 units
  for (let i = 0; i < river.length - 1; i++) {
    const a = river[i], b = river[i + 1], L = a.distanceTo(b), n = Math.ceil(L / 4);
    const p0 = river[Math.max(0, i - 1)], p3 = river[Math.min(river.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {   // Catmull-Rom through the data points
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (q0, q1, q2, q4) => 0.5 * (2 * q1 + (-q0 + q2) * t + (2 * q0 - 5 * q1 + 4 * q2 - q4) * t2 + (-q0 + 3 * q1 - 3 * q2 + q4) * t3);
      riverPts.push(new THREE.Vector2(f(p0.x, a.x, b.x, p3.x), f(p0.y, a.y, b.y, p3.y)));
    }
  }
  if (river.length) riverPts.push(river[river.length - 1].clone());
  const rBucket = new Map(), RB = 24;
  riverPts.forEach(p => { const k = key(Math.floor(p.x / RB), Math.floor(p.y / RB)); if (!rBucket.has(k)) rBucket.set(k, []); rBucket.get(k).push(p); });
  function riverDist(x, z, max = 24) {
    let best = max; const i0 = Math.floor((x - max) / RB), i1 = Math.floor((x + max) / RB), j0 = Math.floor((z - max) / RB), j1 = Math.floor((z + max) / RB);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const l = rBucket.get(key(i, j)); if (l) for (const p of l) { const dd = Math.hypot(p.x - x, p.y - z); if (dd < best) best = dd; } }
    return best;
  }

  // ---------- roads (winding, between place edges; they ramp up to raised places) ----------
  const roads = [];
  const bucket = new Map(), BS = 16;
  (cfg.paths || []).forEach(([a, b], ri) => {
    const A = places.get(a), B = places.get(b); if (!A || !B) return;
    const d = B.pos.clone().sub(A.pos).setY(0); const L = d.length(); d.divideScalar(L);
    const side = new THREE.Vector3(-d.z, 0, d.x);
    const s0 = A.r * 0.95, s1 = L - B.r * 0.95, amp = Math.min(26, L * 0.1), fr = 1.5 + (ri % 3) * 0.5, ph = ri * 1.7;
    const n = Math.max(6, Math.ceil((s1 - s0) / 2)); const pts = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, s = s0 + (s1 - s0) * u;
      const w = Math.sin(Math.PI * u) * amp * Math.sin(fr * Math.PI * u + ph) + Math.sin(Math.PI * u) * Math.sin(7 * u + ri) * 2.5;
      const p = A.pos.clone().setY(0).addScaledVector(d, s).addScaledVector(side, w);
      p.y = A.lift * (1 - smooth(0.03, 0.3, u)) + B.lift * smooth(0.7, 0.97, u);
      pts.push(p);
    }
    let len = 0; for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
    roads.push({ a, b, pts, len });
    for (const p of pts) { const k = key(Math.floor(p.x / BS), Math.floor(p.z / BS)); if (!bucket.has(k)) bucket.set(k, []); bucket.get(k).push(p); }
  });
  const _rn = { d: 0, y: 0 };
  function roadNear(x, z, max = 14) {
    let best = max, by = 0; const i0 = Math.floor((x - max) / BS), i1 = Math.floor((x + max) / BS), j0 = Math.floor((z - max) / BS), j1 = Math.floor((z + max) / BS);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const l = bucket.get(key(i, j)); if (l) for (const p of l) { const dd = Math.hypot(p.x - x, p.z - z); if (dd < best) { best = dd; by = p.y; } } }
    _rn.d = best; _rn.y = by; return _rn;
  }
  const roadDist = (x, z, max = 14) => roadNear(x, z, max).d;
  function placeDist(x, z) { let best = Infinity, bp = null; for (const p of P) { const dd = Math.hypot(p.pos.x - x, p.pos.z - z) - p.r * 1.2; if (dd < best) { best = dd; bp = p; } } return { d: best, p: bp }; }

  // ---------- ground height ----------
  const hills = (x, z) => 2.2 * Math.sin(x * 0.021 + 1.3) * Math.sin(z * 0.017 + 0.4) + 1.1 * Math.sin(x * 0.053 + z * 0.031) * Math.cos(z * 0.047 - 1.1) + 0.45 * Math.sin(x * 0.13 + 2) * Math.sin(z * 0.11);
  const rolling = (x, z) => 3.2 * Math.sin(x * 0.0085 + 0.7) * Math.cos(z * 0.0072 - 0.3);   // long gentle swells between places
  function terrain(x, z) {
    const { d: pd, p } = placeDist(x, z), rn = roadNear(x, z, 22);
    const ex = Math.max(0, bounds.minX + 120 - x, x - (bounds.maxX - 120)), ez = Math.max(0, bounds.minZ + 120 - z, z - (bounds.maxZ - 120));
    let hh = (hills(x, z) * 0.7 + 0.9) * smooth(0, 34, pd) + rolling(x, z) * smooth(10, 80, pd) + Math.pow(Math.hypot(ex, ez) / 120, 2) * 14;
    hh = p.lift + (hh - p.lift) * smooth(0, p.lift ? 26 : 34, pd);   // level ground (or a plateau) under every place
    hh = rn.y + (hh - rn.y) * smooth(2.6, 20, rn.d);                 // roads are level across, and ramp gently
    if (riverPts.length) { const rd = riverDist(x, z); if (rd < 12) hh += (-1.9 - hh) * (1 - smooth(3.2, 9.5, rd)); }
    return hh;
  }
  // where your feet go: the ground, or a bridge deck over the river
  function heightAt(x, z) {
    const g = terrain(x, z);
    if (riverPts.length && riverDist(x, z, 12) < 9.5) { const rn = roadNear(x, z, 3); if (rn.d < 2.2) return Math.max(g, rn.y + 0.32); }
    return g;
  }

  // ---------- biome blend: which landscape a point belongs to ----------
  const BR = 95, WILD = 0.18, _w = new Float32Array(P.length + 1);
  function weights(x, z) {
    let s = WILD; for (let i = 0; i < P.length; i++) { const p = P[i], d = Math.hypot(p.pos.x - x, p.pos.z - z) / BR; s += (_w[i] = Math.exp(-d * d)); }
    _w[P.length] = WILD; for (let i = 0; i <= P.length; i++) _w[i] /= s; return _w;
  }
  function pickBiome(x, z, u) { const w = weights(x, z); let acc = 0; for (let i = 0; i < P.length; i++) { acc += w[i]; if (u < acc) return P[i].B; } return BIOMES.wild; }

  // ---------- ground tiles (smooth, vertex-coloured by biome; built lazily, culled by distance) ----------
  const TS = 128, SEG = 32;
  const tMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const wind = { value: 0 };
  const tiles = new Map();
  const c = new THREE.Color(), cc = new THREE.Color(), acc = new THREE.Color();
  const bed = new THREE.Color(0x3a3324), rockC = new THREE.Color(0x5e5a66), mossC = new THREE.Color(0x2f8a7a);
  const BC = P.map(p => new THREE.Color(p.B.ground)), WC = new THREE.Color(BIOMES.wild.ground);
  const noise = (x, z) => Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2) * 0.5 + Math.sin(z * 0.13 + Math.sin(x * 0.05) * 3) * 0.5;
  const R30 = rule30Bits(64, 64);
  function groundColor(x, z, y, out) {
    const w = weights(x, z); out.setRGB(0, 0, 0);
    for (let i = 0; i < P.length; i++) if (w[i] > 0.002) out.r += BC[i].r * w[i], out.g += BC[i].g * w[i], out.b += BC[i].b * w[i];
    out.r += WC.r * w[P.length]; out.g += WC.g * w[P.length]; out.b += WC.b * w[P.length];
    out.multiplyScalar(1.28);   // lifted a touch so the low sun doesn't drown it
    const n = noise(x, z), j = (Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5) % 1) - 0.5;
    out.offsetHSL(n * 0.012, n * 0.05, n * 0.035 + j * 0.02);
    for (let i = 0; i < P.length; i++) {   // biome ground details
      const p = P[i]; if (w[i] < 0.25) continue; const k = (w[i] - 0.25) / 0.75;
      if (p.biome === 'glow') { const gx = Math.floor((x - p.pos.x) / 2.5) & 63, gz = Math.floor((z - p.pos.z) / 2.5) & 63; if (R30[gz][gx]) out.lerp(mossC, 0.45 * k); }
      else if (p.biome === 'painted') out.lerp(cc.setHex(BAND[(Math.floor((x * 0.8 + z * 0.35) / 10) % 5 + 5) % 5]), 0.08 * k);
      else if (p.biome === 'lookout' && y > 0.6 && y < p.lift - 0.3) out.lerp(rockC, 0.65 * smooth(0.6, 2, y) * k);   // the plateau's rocky skirt
    }
    const { d, p } = placeDist(x, z);
    if (p && d < 10) out.lerp(cc.setHex(grassNow[p.id] ?? 0x23402f), 0.6 * (1 - smooth(-4, 10, d)));
    if (seasonSnow > 0) out.lerp(snowC, seasonSnow * (y > 0.2 ? 0.85 : 0.55));
    if (y < -0.3) out.lerp(bed, smooth(-0.3, -1.4, y));
    return out;
  }
  function buildTile(i, j) {
    const geo = new THREE.PlaneGeometry(TS, TS, SEG, SEG).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    const ox = (i + 0.5) * TS, oz = (j + 0.5) * TS;
    for (let k = 0; k < pos.count; k++) { const x = pos.getX(k) + ox, z = pos.getZ(k) + oz, y = terrain(x, z); pos.setXYZ(k, x, y, z); groundColor(x, z, y, c); col.set([c.r, c.g, c.b], k * 3); }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals(); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, tMat); m.userData.ground = true; m.receiveShadow = true; group.add(m); return m;
  }
  // beyond the tiles: one big plain (the fog hides its edge)
  const far = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x35603f }));
  far.userData.ground = true; far.position.set((minX + maxX) / 2, -4.2, (minZ + maxZ) / 2); group.add(far);

  // ---------- water ----------
  if (riverPts.length > 1) {
    const pos = [], W = 4.6;
    for (let k = 0; k < riverPts.length - 1; k++) {
      const a = riverPts[k], b = riverPts[k + 1], dx = b.x - a.x, dz = b.y - a.y, l = Math.hypot(dx, dz) || 1, sx = -dz / l * W, sz = dx / l * W;
      pos.push(a.x - sx, -0.55, a.y - sz, a.x + sx, -0.55, a.y + sz, b.x + sx, -0.55, b.y + sz, a.x - sx, -0.55, a.y - sz, b.x + sx, -0.55, b.y + sz, b.x - sx, -0.55, b.y - sz);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    const water = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x2a5f96, emissive: 0x0a1a38, roughness: 0.15, metalness: 0.3, side: THREE.DoubleSide }));
    water.userData.water = true; group.add(water);
    // moon/sun glints drifting on the water
    const gl = []; riverPts.forEach((p, k) => { if (k % 2 === 0) for (let q = 0; q < 2; q++) gl.push(p.x + (rnd() - 0.5) * 6, -0.45, p.y + (rnd() - 0.5) * 6); });
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gl, 3));
    const glints = new THREE.Points(gg, new THREE.PointsMaterial({ color: 0xbfd4ff, size: 0.35, map: glowSprite().material.map, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    glints.material.userData.anim = true; group.add(glints); var riverGlints = glints;
  }

  const signs = [], bridges = [];
  // ---------- roads mesh, edge glow, lanterns, bridges, signposts ----------
  {
    const rib = [], glowP = [], halo = [];
    const lan = new THREE.Group(); const postM = mat(0x1b1b24), lampM = glow(0xffd77a, 2.2), redM = mat(0x8c2a2f);
    const postG = new THREE.CylinderGeometry(0.07, 0.1, 2.4, 6), lampG = new THREE.BoxGeometry(0.46, 0.55, 0.46), capG = new THREE.ConeGeometry(0.42, 0.32, 4);
    const brG = new THREE.Group(); const plank = mat(0x6a4a2c), railM = mat(0x8c2a2f);
    for (const R of roads) {
      const pts = R.pts; let run = [];
      const flushBridge = () => {
        if (run.length < 2) { run = []; return; }
        for (let q = 0; q < run.length - 1; q++) {   // deck segments + red-capped posts both sides
          const a = run[q], b = run[q + 1], mid = a.clone().add(b).multiplyScalar(0.5), l = a.distanceTo(b);
          const arch = Math.sin(Math.PI * (q + 0.5) / (run.length - 1)) * 0.5;
          const seg = mesh(new THREE.BoxGeometry(3.4, 0.22, l + 0.05), plank, mid.x, mid.y + 0.22 + arch, mid.z, brG); seg.lookAt(b.x, mid.y + 0.22 + arch, b.z);
          const dx = b.x - a.x, dz = b.z - a.z, sx = -dz / l * 1.75, sz = dx / l * 1.75;
          for (const s of [-1, 1]) { mesh(new THREE.BoxGeometry(0.16, 0.9, 0.16), railM, a.x + sx * s, a.y + 0.75 + arch, a.z + sz * s, brG); const rail = mesh(new THREE.BoxGeometry(0.1, 0.1, l), plank, mid.x + sx * s, mid.y + 1.15 + arch, mid.z + sz * s, brG); rail.lookAt(b.x + sx * s, mid.y + 1.15 + arch, b.z + sz * s); }
        }
        bridges.push({ road: R, at: run[Math.floor(run.length / 2)].clone() }); run = [];
      };
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1]; const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; const sx = -dz / l * 1.4, sz = dx / l * 1.4;
        const onRiver = riverPts.length && riverDist(a.x, a.z, 12) < 8.5;
        if (onRiver) { run.push(a); if (k === pts.length - 2) { run.push(b); flushBridge(); } continue; }
        if (run.length) { run.push(a); flushBridge(); }
        rib.push(a.x - sx, a.y + 0.07, a.z - sz, a.x + sx, a.y + 0.07, a.z + sz, b.x + sx, b.y + 0.07, b.z + sz, a.x - sx, a.y + 0.07, a.z - sz, b.x + sx, b.y + 0.07, b.z + sz, b.x - sx, b.y + 0.07, b.z - sz);
        if (k % 3 === 0) for (const s of [-1, 1]) { const x = a.x + sx * 1.15 * s, z = a.z + sz * 1.15 * s; glowP.push(x, terrain(x, z) + 0.2, z); }
        if (k % 12 === 6) {
          const s = (k / 12) % 2 ? 1 : -1, x = a.x + sx * 2.2 * s, z = a.z + sz * 2.2 * s, y = terrain(x, z);
          const L = new THREE.Group(); L.position.set(x, y, z); lan.add(L);
          mesh(postG, postM, 0, 1.2, 0, L); mesh(lampG, lampM, 0, 2.6, 0, L); mesh(capG, (k / 12) % 3 === 1 ? redM : postM, 0, 3.05, 0, L).rotation.y = Math.PI / 4;
          halo.push(x, y + 2.6, z);
        }
      }
    }
    group.add(brG); mergeStatic(brG);
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

  // ---------- landscape: plants, rocks and little landmarks, by biome (instanced per 256-unit cell) ----------
  const CS = 256;
  const lam = (col, o = {}) => new THREE.MeshLambertMaterial({ color: col, flatShading: true, ...o });
  const white = o => lam(0xffffff, o);
  const trunkG = new THREE.CylinderGeometry(0.15, 0.22, 0.9, 6).translate(0, 0.45, 0);
  // baked "ambient occlusion": a vertex-colour gradient, darker low down / underneath
  const shadeY = (g, y0, y1, lo = 0.62) => { g = g.index ? g.toNonIndexed() : g; const p = g.attributes.position, c = new Float32Array(p.count * 3); for (let k = 0; k < p.count; k++) { const v = lo + (1 - lo) * smooth(y0, y1, p.getY(k)); c[k * 3] = c[k * 3 + 1] = c[k * 3 + 2] = v; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.computeVertexNormals(); return g; };
  const mergeG = gs => { const n = gs.reduce((a, g) => a + g.attributes.position.count, 0), P = new Float32Array(n * 3), C = new Float32Array(n * 3); let k = 0; for (const g of gs) { P.set(g.attributes.position.array, k * 3); C.set(g.attributes.color.array, k * 3); k += g.attributes.position.count; } const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.BufferAttribute(P, 3)); o.setAttribute('color', new THREE.BufferAttribute(C, 3)); o.computeVertexNormals(); return o; };
  const coneGs = [0, 1, 2].map(i => shadeY(new THREE.ConeGeometry(1.1 - i * 0.28, 1.25, 7).translate(0, 1.15 + i * 0.7, 0), 0.55 + i * 0.7, 1.5 + i * 0.7, 0.58));
  // round trees: a main crown with two smaller lumps, so they read as leafy clumps, not single gems
  const ballG = mergeG([
    shadeY(new THREE.IcosahedronGeometry(1, 0).translate(0, 1.6, 0), 0.7, 2.4),
    shadeY(new THREE.IcosahedronGeometry(0.68, 0).rotateY(0.7).translate(0.62, 1.25, 0.25), 0.7, 1.9),
    shadeY(new THREE.IcosahedronGeometry(0.6, 0).rotateX(0.5).translate(-0.5, 2.05, -0.3), 1.5, 2.6, 0.75),
  ]);
  const KINDS = {
    trunk: [trunkG, lam(0x4a3424)], c0: [coneGs[0], lam(0x1f4a35, { vertexColors: true })], c1: [coneGs[1], lam(0x24553c, { vertexColors: true })], c2: [coneGs[2], lam(0x1f4a35, { vertexColors: true })],
    ball: [ballG, white({ vertexColors: true })], flower: [new THREE.OctahedronGeometry(0.2, 0).translate(0, 0.42, 0), white({ emissive: 0x221a10 })],
    stem: [new THREE.CylinderGeometry(0.02, 0.02, 0.42, 3).translate(0, 0.21, 0), lam(0x3f6b45)],
    tuft: [new THREE.ConeGeometry(0.16, 0.75, 3).translate(0, 0.37, 0), white()],
    rock: [new THREE.DodecahedronGeometry(0.5, 0), white()],
    shroomStem: [new THREE.CylinderGeometry(0.05, 0.07, 0.28, 5).translate(0, 0.14, 0), lam(0xe9e0cc)],
    shroomCap: [new THREE.SphereGeometry(0.17, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.27, 0), new THREE.MeshBasicMaterial({ color: 0xffffff })],
    reed: [new THREE.CylinderGeometry(0.02, 0.03, 1.4, 3).translate(0, 0.7, 0), lam(0x5a7a3a)],
    cattail: [new THREE.CylinderGeometry(0.05, 0.05, 0.22, 5).translate(0, 1.3, 0), lam(0x5a3a22)],
    crystal: [new THREE.OctahedronGeometry(0.45, 0).scale(0.6, 1.6, 0.6).translate(0, 0.6, 0), new THREE.MeshBasicMaterial({ color: 0xbbbbbb })],
    glowPlant: [new THREE.ConeGeometry(0.16, 0.9, 5).translate(0, 0.45, 0), new THREE.MeshBasicMaterial({ color: 0xffffff })],
    hedge: [new THREE.BoxGeometry(1, 0.7, 1).translate(0, 0.35, 0), lam(0x24553c)],
    berry: [new THREE.IcosahedronGeometry(0.07, 0), lam(0xc8323a, { emissive: 0x401010 })],
    snowcap: [new THREE.SphereGeometry(0.55, 7, 4).scale(1, 0.35, 1).translate(0, 2.55, 0), lam(0xeef2f6)],
  };
  for (const k in KINDS) KINDS[k][1].userData.gfxKind = k === 'rock' ? 'stone' : k === 'trunk' ? 'wood' : 'soft';
  // a gentle breeze: crowns, tufts and flowers lean with height (instanced, so it's all in the vertex shader)
  const SWAY = { c0: 0.06, c1: 0.06, c2: 0.06, ball: 0.045, tuft: 0.12, flower: 0.12, stem: 0.12, reed: 0.1, cattail: 0.1, glowPlant: 0.1, snowcap: 0.06 };
  for (const k in SWAY) {
    const m = KINDS[k][1], amp = SWAY[k];
    m.onBeforeCompile = sh => {
      sh.uniforms.uWind = wind;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        { vec3 ip = instanceMatrix[3].xyz; float h = max(0.0, position.y);
          float w = sin(uWind * 1.1 + ip.x * 0.08 + ip.z * 0.06) * 0.7 + sin(uWind * 2.3 + ip.x * 0.31) * 0.3;
          transformed.x += w * ${amp.toFixed(3)} * h * h * 0.5; transformed.z += w * ${(amp * 0.5).toFixed(3)} * h * h * 0.5; }
        #endif`);
    };
    m.customProgramCacheKey = () => 'nova-sway-' + k;
  }
  const items = {}; for (const k in KINDS) items[k] = new Map();
  const SMALL = new Set(['flower', 'stem', 'tuft', 'berry', 'reed', 'cattail', 'shroomStem', 'shroomCap']);   // little things: smaller cells, shown only nearby
  const Mx = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), V = new THREE.Vector3();
  function add(kind, x, z, s, sy = s, color = null, y = null, rotY = rnd() * 6.28) {
    const cs = SMALL.has(kind) ? CS / 2 : CS, ck = key(Math.floor(x / cs), Math.floor(z / cs)); const m = items[kind]; if (!m.has(ck)) m.set(ck, []);
    Q.setFromAxisAngle(Y, rotY); V.set(x, y ?? terrain(x, z), z); S.set(s, sy, s); Mx.compose(V, Q, S); m.get(ck).push({ m: Mx.clone(), color });
  }
  const pine = (x, z, s, tall = 1) => { add('trunk', x, z, s, s * tall); for (const k of ['c0', 'c1', 'c2']) add(k, x, z, s, s * tall); add('snowcap', x, z, s, s * tall); };
  const roundTree = (x, z, s, col = 0x2f6a46) => { add('trunk', x, z, s); add('ball', x, z, s, s * (0.8 + rnd() * 0.5), col); };
  const flower = (x, z, col, s = 1) => { add('stem', x, z, s); add('flower', x, z, s, s, col); };
  const shroom = (x, z, col, s = 1) => { add('shroomStem', x, z, s); add('shroomCap', x, z, s, s, col); };
  const GREENS = [0x3f6b45, 0x4a7a4a, 0x35603c, 0x56804a], pickC = a => a[Math.floor(rnd() * a.length)];
  const FLOWERS = [0xf2cd62, 0xc8323a, 0xf4ece0, 0x9a7ae0, 0xe8a0c0];
  const free = (x, z, place, road) => placeDist(x, z).d > place && roadDist(x, z, road + 1) > road && (!riverPts.length || riverDist(x, z, 8) > 6.5);

  // little landmarks around each place (data-driven by biome); they sit on open ground beside the place
  const feat = new THREE.Group(); group.add(feat);
  const spotNear = (p, dist, need = 7) => {   // an open spot at `dist` from the place, away from roads and the river
    for (let k = 0; k < 24; k++) { const a = p.yaw + 2.2 + k * 0.53, x = p.pos.x + Math.sin(a) * dist, z = p.pos.z + Math.cos(a) * dist;
      if (roadDist(x, z, need + 2) > need && placeDist(x, z).d > 3 && (!riverPts.length || riverDist(x, z, need + 4) > need)) return new THREE.Vector3(x, terrain(x, z), z); }
    return null;
  };
  const solid = (x, z, r) => solids.push({ x, z, r });
  const featMats = [];
  const FEATURES = {
    meadow(p) {   // a picket-fenced pea garden and an apple tree
      const g0 = spotNear(p, p.r + 12, 8); if (g0) {
        const G = new THREE.Group(); G.position.copy(g0); G.rotation.y = Math.atan2(p.pos.x - g0.x, p.pos.z - g0.z); feat.add(G);
        const wood = lam(0xf4ece0), soil = lam(0x4a3424), pea = lam(0x6aa84a); featMats.push(pea);
        mesh(new THREE.BoxGeometry(7, 0.12, 4.6), soil, 0, 0.06, 0, G);
        for (let i = 0; i <= 20; i++) { const t = i / 20, per = 2 * (8 + 5.6); let d = t * per, x, z;
          if (d < 8) { x = -4 + d; z = -2.8; } else if (d < 13.6) { x = 4; z = -2.8 + (d - 8); } else if (d < 21.6) { x = 4 - (d - 13.6); z = 2.8; } else { x = -4; z = 2.8 - (d - 21.6); }
          if (z > 2.7 && Math.abs(x) < 0.7) continue;   // a gate gap facing the place
          mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), wood, x, 0.45, z, G); }
        for (const z of [-2.8, 2.8]) for (const y of [0.35, 0.7]) { mesh(new THREE.BoxGeometry(3.3, 0.07, 0.05), wood, -2.35, y, z, G); mesh(new THREE.BoxGeometry(3.3, 0.07, 0.05), wood, 2.35, y, z, G); }
        for (const x of [-4, 4]) for (const y of [0.35, 0.7]) mesh(new THREE.BoxGeometry(0.05, 0.07, 5.6), wood, x, y, 0, G);
        for (let r = 0; r < 4; r++) for (let k = 0; k < 9; k++) { const x = -3 + k * 0.75, z = -1.6 + r * 1.05; mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 3), lam(0x8a6a3a), x, 0.5, z, G); mesh(new THREE.IcosahedronGeometry(0.18, 0), pea, x, 0.35 + (k % 3) * 0.18, z, G); }
        solid(g0.x, g0.z, 3.6);
      }
      const t0 = spotNear(p, p.r + 9, 5); if (t0) {
        const T = new THREE.Group(); T.position.copy(t0); feat.add(T);
        mesh(new THREE.CylinderGeometry(0.22, 0.34, 2.2, 7), lam(0x4a3424), 0, 1.1, 0, T);
        const appleLeaf = lam(0x2f6a46); featMats.push(appleLeaf);
        for (const [x, y, z, r] of [[0, 2.9, 0, 1.5], [0.9, 2.6, 0.4, 1.0], [-0.8, 2.7, -0.3, 1.1], [0.2, 3.6, 0.2, 1]]) mesh(new THREE.IcosahedronGeometry(r, 1), appleLeaf, x, y, z, T);
        for (let k = 0; k < 14; k++) { const a = k * 2.4, y = 2.3 + (k % 4) * 0.4; mesh(new THREE.SphereGeometry(0.13, 6, 4), lam(0xc8323a, { emissive: 0x300808 }), Math.cos(a) * 1.35, y, Math.sin(a) * 1.35, T); }
        solid(t0.x, t0.z, 0.6);
      }
    },
    forest(p) { for (let k = 0; k < 7; k++) { const s = spotNear(p, p.r + 4 + k * 1.3, 3); if (s) for (let q = 0; q < 5; q++) shroom(s.x + (rnd() - 0.5) * 2, s.z + (rnd() - 0.5) * 2, pickC([0xff5a4a, 0xffd27a, 0x8ac8ff]), 1.6 + rnd() * 1.8); } },
    lookout(p) { for (let k = 0; k < 9; k++) { const a = k / 9 * 6.28 + 0.3, d = p.r * 1.2 + 3 + rnd() * 3, x = p.pos.x + Math.sin(a) * d, z = p.pos.z + Math.cos(a) * d; if (roadDist(x, z, 5) > 4) { const s = 1.2 + rnd() * 1.6; add('rock', x, z, s, s * 0.8, 0x6a6672); solid(x, z, s * 0.45); } } },
    painted(p) {   // a Rule 90 flowerbed: each live cell is a flower, in Night & Gold with red
      const s = spotNear(p, p.r + 14, 10); if (!s) return; const rows = rule90(16), ang = Math.atan2(p.pos.x - s.x, p.pos.z - s.z), ca = Math.cos(ang), sa = Math.sin(ang);
      rows.forEach((row, ri) => row.forEach((v, ci) => { const lx = (ci - 15) * 0.5, lz = (ri - 8) * 0.5, x = s.x + lx * ca + lz * sa, z = s.z - lx * sa + lz * ca;
        if (v) flower(x, z, ri % 4 === 0 ? 0xc8323a : 0xf2cd62, 1.5); else if ((ri + ci) % 3 === 0) add('tuft', x, z, 0.7, 0.5, 0x2a4a33); }));
      for (let k = -16; k <= 16; k += 1) for (const e of [-1, 1]) { const lx = k * 0.5, lz = e * 4.6, x = s.x + lx * ca + lz * sa, z = s.z - lx * sa + lz * ca; add('hedge', x, z, 0.5, 0.8, null, null, -ang); }
    },
    amber(p) {   // a scarecrow in a red hat watching the coffee field
      const s = spotNear(p, p.r + 10, 5); if (!s) return; const G = new THREE.Group(); G.position.copy(s); feat.add(G);
      mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5), lam(0x6a4a2c), 0, 1.2, 0, G); mesh(new THREE.BoxGeometry(1.8, 0.08, 0.08), lam(0x6a4a2c), 0, 1.8, 0, G);
      mesh(new THREE.BoxGeometry(0.7, 0.8, 0.35), lam(0x3a5a8a), 0, 1.6, 0, G); mesh(new THREE.SphereGeometry(0.28, 8, 6), lam(0xe8d0a0), 0, 2.3, 0, G);
      mesh(new THREE.ConeGeometry(0.42, 0.45, 8), lam(0xc8323a), 0, 2.65, 0, G); solid(s.x, s.z, 0.5);
    },
    crystal(p) {   // three tidy terraces with crystals on top
      const s = spotNear(p, p.r + 11, 7); if (!s) return; const G = new THREE.Group(); G.position.copy(s); G.rotation.y = p.yaw + 0.4; feat.add(G);
      [[5.5, 0.4], [4, 0.8], [2.6, 1.2]].forEach(([w, y]) => mesh(new THREE.BoxGeometry(w, 0.4, w), lam(0x4a4f66), 0, y - 0.2, 0, G));
      for (let k = 0; k < 5; k++) { const cr = mesh(new THREE.OctahedronGeometry(0.5, 0), lam(k % 2 ? 0x8ae0ff : 0xffd27a, { emissive: k % 2 ? 0x1a4a60 : 0x604010 }), (k - 2) * 0.45, 1.6 + (k % 2) * 0.3, 0, G); cr.scale.set(0.6, 1.7, 0.6); }
      solid(s.x, s.z, 2.9);
    },
    yard(p) {   // gear sculptures
      for (let k = 0; k < 3; k++) { const s = spotNear(p, p.r + 6 + k * 3, 4); if (!s) continue; const G = new THREE.Group(); G.position.copy(s); G.rotation.y = k * 1.3; feat.add(G);
        const r = 0.8 + k * 0.35, steel = lam(0x9a9aa8, { flatShading: true }), rust = lam(0x8c4a2a);
        mesh(new THREE.BoxGeometry(0.25, 1.4, 0.25), lam(0x3a3a44), 0, 0.7, 0, G);
        const gear = new THREE.Group(); gear.position.y = 1.4 + r; G.add(gear); gear.rotation.z = k;
        mesh(new THREE.TorusGeometry(r, 0.18, 5, 18), k === 1 ? rust : steel, 0, 0, 0, gear);
        for (let t = 0; t < 10; t++) { const a = t / 10 * 6.28; const tooth = mesh(new THREE.BoxGeometry(0.25, 0.3, 0.3), k === 1 ? rust : steel, Math.cos(a) * (r + 0.22), Math.sin(a) * (r + 0.22), 0, gear); tooth.rotation.z = a; }
        solid(s.x, s.z, 0.6); }
    },
    glow(p) { for (let k = 0; k < 11; k++) { const a = k / 11 * 6.28, d = p.r * 1.2 + 5, x = p.pos.x + Math.sin(a) * d, z = p.pos.z + Math.cos(a) * d; if (roadDist(x, z, 4) > 3) add('glowPlant', x, z, 1.4, 2.6, k % 2 ? 0x5affd8 : 0x8a7aff); } },
    stones(p) {   // a stone circle of eleven standing stones, each with one old letter
      const s = spotNear(p, p.r + 15, 10); if (!s) return; const word = 'NOVA·LORENZ';
      for (let k = 0; k < 11; k++) { const a = k / 11 * 6.28, x = s.x + Math.sin(a) * 6, z = s.z + Math.cos(a) * 6, y = terrain(x, z);
        const tex = canvasTexture(64, 128, (g, w, hh) => { g.fillStyle = '#5c5a62'; g.fillRect(0, 0, w, hh); g.fillStyle = '#e8c15a'; g.font = '700 60px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(word[k], w / 2, hh / 2); });
        const st = mesh(new THREE.BoxGeometry(1, 2.4 + (k % 3) * 0.4, 0.5), [lam(0x5c5a62), lam(0x5c5a62), lam(0x5c5a62), lam(0x5c5a62), new THREE.MeshLambertMaterial({ map: tex }), lam(0x5c5a62)], x, y + 1.1, z, feat);
        st.rotation.y = a + Math.PI; solid(x, z, 0.55); }
    },
  };
  for (const p of P) FEATURES[p.biome]?.(p);

  // scattered plants: each spot picks a biome by blend weight, then that biome picks what grows there
  const area = (maxX - minX) * (maxZ - minZ);
  const randXZ = () => [minX + rnd() * (maxX - minX), minZ + rnd() * (maxZ - minZ)];
  { const G = growers(); for (const k in BIOMES) { BIOMES[k].grow = G[k] || G.wild; BIOMES[k].name = k; } }
  const N = Math.min(26000, Math.round(area / 50));
  for (let t = 0; t < N; t++) {
    const [x, z] = randXZ(); const u = rnd(), v = rnd();
    const rd = riverPts.length ? riverDist(x, z, 14) : 99;
    if (rd < 6.5) continue;
    if (rd < 11 && v < 0.6) { if (free(x, z, 1, 2.4)) { add('reed', x, z, 0.8 + rnd() * 0.6); if (rnd() < 0.35) add('cattail', x, z, 0.8 + rnd() * 0.6); } continue; }
    const B = pickBiome(x, z, u);
    B.grow(v, x, z);
  }
  // denser close to each place, so its biome reads right where you arrive
  for (const p of P) {
    const B = BIOMES[p.biome] || BIOMES.wild;
    for (let t = 0; t < 1600; t++) {
      const a = rnd() * 6.283, d = p.r + 6 + Math.sqrt(rnd()) * 105, x = p.pos.x + Math.cos(a) * d, z = p.pos.z + Math.sin(a) * d;
      if (riverPts.length && riverDist(x, z, 14) < 9) continue;
      (rnd() < 0.8 ? B : pickBiome(x, z, rnd())).grow(rnd(), x, z);
    }
  }
  // flowers & tufts along every road
  for (const R of roads) for (let k = 0; k < R.pts.length; k += 2) {
    const p = R.pts[k];
    for (let q = 0; q < 2; q++) { const a = rnd() * 6.28, d = 2.4 + rnd() * 6; const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d; if (!free(x, z, 1, 2.2)) continue; rnd() < 0.55 ? flower(x, z, pickC(FLOWERS)) : add('tuft', x, z, 0.8 + rnd() * 0.7, undefined, pickC(GREENS)); }
  }
  // what grows in each biome (v is a random 0..1 for this spot)
  function growers() {
    const tree = (x, z) => free(x, z, 6, 5.5), small = (x, z) => free(x, z, 1, 2.2);
    return {
      wild: (v, x, z) => { if (v < 0.3) small(x, z) && add('tuft', x, z, 0.8 + rnd() * 0.9, undefined, pickC(GREENS)); else if (v < 0.36) small(x, z) && flower(x, z, pickC(FLOWERS)); else if (v < 0.4) tree(x, z) && pine(x, z, 0.6 + rnd() * rnd() * 1.1); else if (v < 0.43) tree(x, z) && roundTree(x, z, 0.5 + rnd() * 0.8, rnd() < 0.1 ? 0x7a3a3a : 0x2f6a46); else if (v < 0.445) small(x, z) && add('rock', x, z, 0.6 + rnd() * 1.4, undefined, 0x55506a); },
      meadow: (v, x, z) => { if (v < 0.45) small(x, z) && flower(x, z, pickC(FLOWERS), 1 + rnd() * 0.4); else if (v < 0.8) small(x, z) && add('tuft', x, z, 0.8 + rnd() * 0.7, undefined, pickC(GREENS)); else if (v < 0.84) tree(x, z) && roundTree(x, z, 0.6 + rnd() * 0.6, rnd() < 0.3 ? 0x3f7a3a : 0x2f6a46); },
      forest: (v, x, z) => { if (v < 0.32) tree(x, z) && pine(x, z, 0.9 + rnd() * 0.9, 1.4 + rnd() * 0.6); else if (v < 0.42) small(x, z) && shroom(x, z, pickC([0xff5a4a, 0xffd27a, 0x8ac8ff, 0xff5a4a]), 1 + rnd() * 1.4); else if (v < 0.75) small(x, z) && add('tuft', x, z, 1 + rnd(), 0.8 + rnd() * 0.6, pickC([0x2a5a34, 0x356a3a, 0x24452c])); else if (v < 0.8) small(x, z) && add('rock', x, z, 0.6 + rnd(), undefined, 0x4a6a4a); },
      lookout: (v, x, z) => { if (v < 0.07) small(x, z) && add('rock', x, z, 1 + rnd() * 2.2, undefined, 0x6a6672); else if (v < 0.45) small(x, z) && add('tuft', x, z, 0.7, 0.45, pickC([0x6a7a5a, 0x5a6a50])); else if (v < 0.49) small(x, z) && flower(x, z, 0xf4ece0, 0.8); else if (v < 0.51) tree(x, z) && pine(x, z, 0.5 + rnd() * 0.4); },
      painted: (v, x, z) => { if (v < 0.7) small(x, z) && flower(x, z, BAND[(Math.floor((x * 0.8 + z * 0.35) / 10) % 5 + 5) % 5], 1.1 + rnd() * 0.5); else if (v < 0.85) small(x, z) && add('tuft', x, z, 0.8, undefined, pickC(GREENS)); else if (v < 0.88) tree(x, z) && roundTree(x, z, 0.6 + rnd() * 0.5, pickC([0x2f6a46, 0x6a3a7a, 0x7a3a3a])); },
      amber: (v, x, z) => { if (v < 0.62) small(x, z) && add('tuft', x, z, 0.9 + rnd() * 0.5, 1.6 + rnd() * 0.8, pickC([0xd8a840, 0xe8c15a, 0xc89030])); else if (v < 0.74) { if (small(x, z)) { const s = 0.35 + rnd() * 0.2; add('ball', x, z, s, s, 0x2a4a2c, terrain(x, z) - 0.9); for (let q = 0; q < 3; q++) add('berry', x + (rnd() - 0.5) * 0.5, z + (rnd() - 0.5) * 0.5, 1, 1, null, terrain(x, z) + 0.45 + rnd() * 0.3); } } else if (v < 0.76) tree(x, z) && roundTree(x, z, 0.6, 0x5a6a2a); },
      crystal: (v, x, z) => { if (v < 0.12) small(x, z) && add('crystal', x, z, 0.6 + rnd() * 0.9, 0.6 + rnd() * 1.2, pickC([0x8ae0ff, 0xffd27a, 0xb89aff])); else if (v < 0.42) small(x, z) && add('tuft', x, z, 0.7, undefined, pickC([0x3a5a5a, 0x4a6a5a])); else if (v < 0.47) small(x, z) && add('hedge', x, z, 0.9 + rnd() * 0.5, 0.8, null, null, 0); else if (v < 0.52) small(x, z) && add('rock', x, z, 0.7 + rnd(), undefined, 0x6a6a7a); },
      yard: (v, x, z) => { if (v < 0.25) small(x, z) && add('rock', x, z, 0.25 + rnd() * 0.4, 0.2, pickC([0x7a746a, 0x6a645a, 0x8a8478])); else if (v < 0.31) tree(x, z) && pine(x, z, 0.6 + rnd() * 0.6, 1.3); else if (v < 0.5) small(x, z) && add('tuft', x, z, 0.8, undefined, pickC([0x6a6a40, 0x5a5a3a])); },
      glow: (v, x, z) => { if (v < 0.22) small(x, z) && add('glowPlant', x, z, 0.8 + rnd() * 0.6, 0.8 + rnd() * 1.2, pickC([0x5affd8, 0x8a7aff, 0x7aff8a])); else if (v < 0.4) small(x, z) && shroom(x, z, pickC([0x5ad8ff, 0x8a7aff]), 1 + rnd()); else if (v < 0.65) small(x, z) && add('tuft', x, z, 0.8, undefined, pickC([0x1f5a4a, 0x2a6a5a])); else if (v < 0.68) tree(x, z) && roundTree(x, z, 0.6 + rnd() * 0.5, 0x1f4a5a); },
      stones: (v, x, z) => { if (v < 0.55) small(x, z) && add('tuft', x, z, 0.8 + rnd() * 0.4, 1 + rnd() * 0.5, pickC([0x9a7ae0, 0x8a6ad0, 0xb08ae8])); else if (v < 0.7) small(x, z) && add('tuft', x, z, 0.8, undefined, pickC(GREENS)); else if (v < 0.75) small(x, z) && add('rock', x, z, 0.8 + rnd() * 1.2, 1.2, 0x6a6872); else if (v < 0.77) tree(x, z) && pine(x, z, 0.6 + rnd() * 0.5); },
    };
  }
  mergeStatic(feat);
  const snowcapIMs = [], coloredIMs = [];
  for (const kind in items) for (const [ck, list] of items[kind]) {
    const [g, m] = KINDS[kind]; const im = new THREE.InstancedMesh(g, m, list.length);
    const bases = list.map(it => it.color ?? 0xffffff);
    list.forEach((it, k) => { im.setMatrixAt(k, it.m); im.setColorAt(k, c.setHex(bases[k])); });
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); im.userData.near = SMALL.has(kind) ? 120 : 255;   // VIEW * 0.85
    im.userData.kind = kind; im.userData.baseColors = bases;
    if (kind === 'snowcap') { im.visible = false; snowcapIMs.push(im); }
    else coloredIMs.push(im);
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
    lab.position.y = p.id === 'arcade' ? 24 : 11; L.add(lab); p.lab = lab;
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
  function update(t, dt, cam, { placeVisible, occluders: extraOcc } = {}) {
    const cx = cam.x, cz = cam.z; wind.value = t;
    const i0 = Math.floor((Math.max(minX, cx - VIEW)) / TS), i1 = Math.floor((Math.min(maxX, cx + VIEW)) / TS), j0 = Math.floor((Math.max(minZ, cz - VIEW)) / TS), j1 = Math.floor((Math.min(maxZ, cz + VIEW)) / TS);
    let built = 0;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = key(i, j); if (tiles.has(k)) continue;
      const dx = Math.max(0, Math.abs((i + 0.5) * TS - cx) - TS / 2), dz = Math.max(0, Math.abs((j + 0.5) * TS - cz) - TS / 2);
      if (Math.hypot(dx, dz) > VIEW) continue;
      if (built++ < 1 || !ready) tiles.set(k, buildTile(i, j));   // a few per frame once running, all at once the first time
    }
    for (const m of tiles.values()) { const s = m.geometry.boundingSphere.center; m.visible = Math.hypot(s.x - cx, s.z - cz) < VIEW + TS; }
    for (const m of chunked) { const s = m.boundingSphere.center; m.visible = Math.hypot(s.x - cx, s.z - cz) < m.userData.near + m.boundingSphere.radius; }
    for (const sg of signs) sg.visible = Math.hypot(sg.position.x - cx, sg.position.z - cz) < 140;
    for (const p of P) { const d = Math.hypot(p.pos.x - cx, p.pos.z - cz); p.near = p.near ? d < LAND + 15 : d < LAND - 15; p.landmark.visible = !p.near; if (placeVisible) placeVisible(p.id, p.near); }   // hysteresis: no flicker at the edge
    // far name tags are drawn through everything, so step them back while a nearby building stands in front of them
    const occ = [];
    for (const p of P) if (p.near) occ.push({ x: p.pos.x, z: p.pos.z, r: 8 });
    for (const o of extraOcc || []) occ.push(o);
    const front = occ.map(o => ({ ...o, d: Math.hypot(o.x - cx, o.z - cz) })).filter(o => o.d < 70 && o.d > o.r * 0.6);
    for (const q of P) {
      if (q.near || !q.lab) continue;
      const aq = Math.atan2(q.pos.x - cx, q.pos.z - cz); let hid = false;
      for (const o of front) {
        let da = Math.abs(Math.atan2(o.x - cx, o.z - cz) - aq); if (da > Math.PI) da = 2 * Math.PI - da;
        if (da < Math.atan2(o.r, o.d)) { hid = true; break; }
      }
      q.lab.visible = !hid;
    }
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
    if (riverPts.length) { ctx.strokeStyle = 'rgba(90,150,230,.75)'; ctx.lineWidth = 6; ctx.beginPath(); riverPts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Z(p.y)) : ctx.moveTo(X(p.x), Z(p.y)))); ctx.stroke(); ctx.strokeStyle = 'rgba(232,193,90,.6)'; ctx.lineWidth = 4; }
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


  function recolorTiles() {
    for (const m of tiles.values()) {
      const pos = m.geometry.attributes.position, col = m.geometry.attributes.color;
      for (let k = 0; k < pos.count; k++) { groundColor(pos.getX(k), pos.getZ(k), pos.getY(k), c); col.setXYZ(k, c.r, c.g, c.b); }
      col.needsUpdate = true;
    }
    far.material.color.setHex(seasonFar);
  }
  function setSeason(name, pal = {}, { weatherKind } = {}) {
    const snowy = (pal.snow || 0) > 0 || weatherKind === 'snow';
    seasonSnow = snowy ? Math.max(pal.snow || 0, weatherKind === 'snow' ? 0.55 : 0) : 0;
    seasonFar = pal.far || 0x35603f;
    const shift = name === 'winter' ? 0xd0d8e0 : name === 'autumn' ? 0xc4a050 : name === 'spring' ? 0x6ab050 : null;
    const amt = name === 'winter' ? 0.7 : name === 'autumn' ? 0.4 : name === 'spring' ? 0.25 : 0;
    P.forEach((p, i) => {
      BC[i].setHex(p.B.ground);
      if (shift) BC[i].lerp(cc.setHex(shift), amt);
    });
    WC.setHex(BIOMES.wild.ground);
    if (shift) WC.lerp(cc.setHex(shift), amt * 0.85);
    for (const id of Object.keys(grass)) {
      const base = new THREE.Color(grass[id]);
      if (shift) base.lerp(cc.setHex(shift), amt);
      grassNow[id] = base.getHex();
    }
    if (KINDS.c0) {
      KINDS.c0[1].color.setHex(pal.foliage || 0x1f4a35);
      KINDS.c1[1].color.setHex(pal.foliage2 || 0x24553c);
      KINDS.c2[1].color.setHex(pal.foliage3 || 0x1a3e2c);
      KINDS.hedge[1].color.setHex(pal.foliage2 || 0x24553c);
      KINDS.stem[1].color.setHex(pal.foliage || 0x3f6b45);
      KINDS.reed[1].color.setHex(pal.foliage2 || 0x5a7a3a);
    }
    const leafs = name === 'autumn' ? [0xb45a1e, 0xc48a28, 0xa03018] : null;
    for (const im of coloredIMs) {
      if (im.userData.kind !== 'ball' && im.userData.kind !== 'tuft') continue;
      im.userData.baseColors.forEach((hex, k) => {
        if (im.userData.kind === 'ball' && leafs) c.setHex(leafs[k % 3]);
        else if (im.userData.kind === 'ball' && name === 'winter') c.setHex(0x1a3a30);
        else if (im.userData.kind === 'ball' && name === 'spring') c.setHex(hex).offsetHSL(0.02, 0.05, 0.08);
        else c.setHex(hex);
        im.setColorAt(k, c);
      });
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    for (const m of featMats) {
      if (leafs) m.color.setHex(leafs[0]);
      else if (name === 'winter') m.color.setHex(0x1a3a30);
      else if (name === 'spring') m.color.setHex(0x4a8a4a);
      else m.color.setHex(m.userData.base || 0x2f6a46);
    }
    for (const im of snowcapIMs) im.visible = snowy;
    recolorTiles();
  }
  // remember summer greens on feature materials
  for (const m of featMats) m.userData.base = m.color.getHex();

  // where grass blades may grow (0..1 density): not on places, roads, or in the river
  function grassOK(x, z, y) {
    if (y < -0.25) return 0;
    const pd = placeDist(x, z).d; if (pd < 0.5) return 0;
    const rd = roadDist(x, z, 4); if (rd < 1.75) return 0;
    let k = smooth(0.5, 6, pd) * smooth(1.75, 2.7, rd);
    if (riverPts.length) { const vd = riverDist(x, z, 10); if (vd < 6.2) return 0; k *= smooth(6.2, 7.6, vd); }
    return k;
  }
  return { group, places, roads, bounds, heightAt, terrain, grassOK, groundColorAt: groundColor, get snow() { return seasonSnow; }, roadDist, riverDist, river: riverPts, bridges, biomeAt: (x, z) => pickBiome(x, z, 0.5), update, prewarm, addSolids, collide, solids, pickables, drawMap, signs, setSeason };
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

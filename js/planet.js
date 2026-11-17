// Nova's tiny planet: one small round world that holds every island.
// Everything is data-driven from world.planet (data/planet.json): radius,
// a lat/lon/yaw for each place, and the gold paths between them.
// Places sit on flattened "caps" so their buildings stand on level ground;
// the open land between them rolls gently.
import * as THREE from 'three';
import { rng, mat, glow, mesh, glowSprite, mergeStatic } from './util.js';
import { DAY } from './daylight.js';

const DEG = Math.PI / 180;
const Y = new THREE.Vector3(0, 1, 0);
export function dirFromLatLon(lat, lon, v = new THREE.Vector3()) {
  const la = lat * DEG, lo = lon * DEG;
  return v.set(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo));
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createPlanet(cfg = {}) {
  const R = cfg.radius || 44;
  const group = new THREE.Group(); group.name = 'planet';
  const places = new Map();
  const solids = [];
  const chunked = [];
  const AXES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(a => new THREE.Vector3(...a));
  const chunkOf = v => { const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z); return ax >= ay && ax >= az ? (v.x < 0 ? 1 : 0) : ay >= az ? (v.y < 0 ? 3 : 2) : (v.z < 0 ? 5 : 4); };          // walk blockers: { c: unit dir, r: radius in world units }

  // ---------- places ----------
  function place(id, r) {
    const P = cfg.places?.[id] || { lat: 0, lon: 0, yaw: 0 };
    const n = dirFromLatLon(P.lat, P.lon);
    // local +z ("front") = south on the surface, turned by yaw; at the pole, toward lon 0
    let s = Math.abs(n.y) > 0.999 ? new THREE.Vector3(0, 0, 1) : Y.clone().addScaledVector(n, -n.y).normalize().negate();
    s.applyAxisAngle(n, (P.yaw || 0) * DEG);
    const x = new THREE.Vector3().crossVectors(n, s).normalize();
    const rf = r * 1.1;                                  // level ground reaches a little past the island's edge
    const d = (R + Math.sqrt(R * R - rf * rf)) / 2;     // half mesa, half bowl: the plane sits between rim and dome
    const pl = { id, n, r, rf, d, alpha: Math.atan2(rf, d), skirt: 0.11, quat: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, n, s)), pos: n.clone().multiplyScalar(d), data: P };
    places.set(id, pl);
    return pl;
  }

  // ---------- ground height (shared by the mesh and the walker) ----------
  const hill = v => 0.45 * Math.sin(3.1 * v.x + 1.3) * Math.sin(2.7 * v.y + 0.4) * Math.sin(3.3 * v.z + 2.1) * 2
    + 0.22 * Math.sin(7.3 * v.x + 2.0 * v.z) * Math.cos(6.1 * v.y - 1.1) + 0.1 * Math.sin(13 * v.z + 5 * v.y);
  function capOf(v) {   // the place whose cap (incl. skirt) covers v, with its blend weight
    let best = null, bw = 0, bc = 0;
    for (const p of places.values()) {
      const c = v.dot(p.n); const g = Math.acos(Math.min(1, c));
      if (g > p.alpha + p.skirt) continue;
      const w = g <= p.alpha ? 1 : 1 - smooth(p.alpha, p.alpha + p.skirt, g);
      if (w > bw) { bw = w; best = p; bc = c; }
    }
    return { p: best, w: bw, c: bc };
  }
  function groundR(v) {   // v must be a unit vector
    const base = R + hill(v);
    const { p, w, c } = capOf(v);
    if (!p) return base;
    const flat = p.d / Math.max(0.2, c);
    return base + (flat - base) * w;
  }
  const surface = (v, lift = 0, out = new THREE.Vector3()) => out.copy(v).multiplyScalar(groundR(v) + lift);

  // ---------- path routes (great circles with a lazy wiggle) ----------
  const pathPts = [];   // unit dirs sampled ~every unit, for "keep clear" tests
  const routes = [];
  function route(a, b, seed) {
    const A = places.get(a), B = places.get(b); if (!A || !B) return null;
    const tot = Math.acos(THREE.MathUtils.clamp(A.n.dot(B.n), -1, 1));
    const a0 = (A.alpha * 0.8) / tot, a1 = 1 - (B.alpha * 0.8) / tot;
    if (a1 <= a0) return null;
    const axis = new THREE.Vector3().crossVectors(A.n, B.n).normalize();
    const n = Math.max(8, Math.ceil(tot * R * (a1 - a0) / 0.9));
    const pts = [];
    const amp = 0.085 + 0.035 * Math.sin(seed * 3.7), freq = 2 + (seed % 3);
    for (let i = 0; i <= n; i++) {
      const u = a0 + (a1 - a0) * i / n;
      const v = A.n.clone().applyAxisAngle(axis, tot * u);
      const w = Math.sin(Math.PI * (i / n)) * amp * Math.sin(freq * Math.PI * u + seed);   // sideways wiggle, zero at both ends
      v.addScaledVector(axis, w).normalize();
      pts.push(v);
    }
    return pts;
  }

  function nearPath(v, dist) { const c = Math.cos(dist / R); for (const p of pathPts) if (p.dot(v) > c) return true; return false; }
  function inPlace(v, pad = 0) { for (const p of places.values()) if (Math.acos(Math.min(1, v.dot(p.n))) < p.alpha + p.skirt + pad / R) return p; return null; }

  // ---------- build everything once the places are known ----------
  let atmo = null, fireflies = null, ffData = null, moons = [], skyLanterns = {}, pathMat = null, pathGlow = null;
  function build({ grass = {} } = {}) {
    const rnd = rng(4411);
    // terrain
    const geo = new THREE.IcosahedronGeometry(1, 34);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3(), c = new THREE.Color(), base = new THREE.Color(0x30553a), dry = new THREE.Color(0x48582f), deep = new THREE.Color(0x244633), capC = new THREE.Color();
    for (let i = 0; i < pos.count; i += 3) {
      // one colour per triangle (flat-shaded low poly look)
      const cen = new THREE.Vector3();
      for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, i + k).normalize(); cen.add(v); pos.setXYZ(i + k, ...v.clone().multiplyScalar(groundR(v)).toArray()); }
      cen.normalize();
      const h = hill(cen), j = (Math.sin(cen.x * 91.7 + cen.y * 37.1) * 43758.5) % 1;
      c.copy(base).lerp(h > 0 ? dry : deep, Math.min(1, Math.abs(h) * 0.9)).offsetHSL(0, 0, (Math.abs(j) - 0.5) * 0.035);
      const { p, w } = capOf(cen);
      if (p) { capC.setHex(grass[p.id] ?? 0x23402f); c.lerp(capC, w * 0.8); }
      for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
    }
    // split into six chunks (one per cube face direction) so the far side and off-screen parts are skipped
    const terrain = new THREE.Group(); terrain.name = 'terrain'; group.add(terrain);
    const tMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const parts = AXES.map(() => ({ p: [], c: [] }));
    for (let i = 0; i < pos.count; i += 3) {
      v.set(0, 0, 0); for (let k = 0; k < 3; k++) v.x += pos.getX(i + k), v.y += pos.getY(i + k), v.z += pos.getZ(i + k);
      const pt = parts[chunkOf(v)];
      for (let k = 0; k < 3; k++) { pt.p.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k)); pt.c.push(col[(i + k) * 3], col[(i + k) * 3 + 1], col[(i + k) * 3 + 2]); }
    }
    geo.dispose();
    parts.forEach((pt, ci) => {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pt.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(pt.c, 3)); g.computeVertexNormals(); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, tMat); m.userData.terrain = true; m.userData.chunk = AXES[ci]; terrain.add(m); chunked.push(m);
    });

    // paths: dim-gold ribbons laid on the ground + a dotted glow over them
    const ribbon = [], glowPts = [];
    (cfg.paths || []).forEach(([a, b], i) => {
      const pts = route(a, b, i + 1); if (!pts) return;
      routes.push({ a, b, pts }); pathPts.push(...pts);
      const side = new THREE.Vector3(), q0 = new THREE.Vector3(), q1 = new THREE.Vector3();
      for (let k = 0; k < pts.length - 1; k++) {
        const p0 = pts[k], p1 = pts[k + 1];
        side.subVectors(p1, p0).cross(p0).normalize();
        const wv = 0.55;
        const corners = [[p0, -wv], [p0, wv], [p1, wv], [p1, -wv]].map(([p, s]) => { const d = p.clone().addScaledVector(side, s / R).normalize(); return d.multiplyScalar(groundR(d) + 0.05); });
        ribbon.push(...corners[0].toArray(), ...corners[1].toArray(), ...corners[2].toArray(), ...corners[0].toArray(), ...corners[2].toArray(), ...corners[3].toArray());
        if (k % 2 === 0) glowPts.push(...surface(p0, 0.18, q0).toArray());
      }
    });
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(ribbon, 3)); rg.computeVertexNormals();
    pathMat = new THREE.MeshStandardMaterial({ color: 0x9a7432, emissive: 0xd9a845, emissiveIntensity: 0.4, roughness: 0.6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
    const pathMesh = new THREE.Mesh(rg, pathMat); pathMesh.name = 'paths'; group.add(pathMesh);
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(glowPts, 3));
    pathGlow = new THREE.Points(gg, new THREE.PointsMaterial({ color: 0xf2cd62, size: 0.55, map: glowSprite().material.map, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    group.add(pathGlow);

    // lanterns along the paths (one merged mesh per material + small halos)
    const lan = new THREE.Group(); const post = mat(0x1b1b24), lampM = glow(0xffd77a, 2.2), redM = mat(0x8c2a2f);
    const postG = new THREE.CylinderGeometry(0.06, 0.09, 2.0, 6), lampG = new THREE.BoxGeometry(0.42, 0.5, 0.42), capG = new THREE.ConeGeometry(0.38, 0.3, 4);
    const halos = [];
    routes.forEach(({ pts }, ri) => {
      for (let k = 3; k < pts.length - 3; k += 9) {
        const p = pts[k], nx = pts[k + 1];
        const side = new THREE.Vector3().subVectors(nx, p).cross(p).normalize();
        const d = p.clone().addScaledVector(side, ((k / 9 + ri) % 2 ? 1 : -1) * 1.25 / R).normalize();
        const L = new THREE.Group(); L.position.copy(surface(d, -0.05)); L.quaternion.setFromUnitVectors(Y, d); lan.add(L);
        mesh(postG, post, 0, 1.0, 0, L); mesh(lampG, lampM, 0, 2.15, 0, L);
        mesh(capG, (k / 9) % 3 === 1 ? redM : post, 0, 2.55, 0, L).rotation.y = Math.PI / 4;
        halos.push(...L.position.clone().addScaledVector(d, 2.15).toArray());
      }
    });
    group.add(lan); mergeStatic(lan);
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(halos, 3));
    group.add(new THREE.Points(hg, new THREE.PointsMaterial({ color: 0xffd77a, size: 2.6, map: glowSprite().material.map, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending })));

    // trees, flowers, rocks, tufts on open land (instanced)
    const free = (d, pad) => !inPlace(d, pad) && !nearPath(d, 1.6 + pad * 0.3);
    const randDir = () => { const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u); return new THREE.Vector3(s * Math.cos(th), u, s * Math.sin(th)); };
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), Qy = new THREE.Quaternion();
    function scatter(count, pad, fn, near = null) {
      const out = []; let tries = 0;
      while (out.length < count && tries++ < count * 30) {
        let d;
        if (near && rnd() < 0.7) { const pp = near[Math.floor(rnd() * near.length)]; d = pp.clone().add(randDir().multiplyScalar((1.6 + rnd() * 3) / R)).normalize(); }
        else d = randDir();
        if (!free(d, pad)) continue;
        out.push(d);
      }
      out.forEach((d, i) => fn(d, i));
      return out.length;
    }
    const lam = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    const batches = [];
    function inst(geo, material) { const b = { geo, material, items: AXES.map(() => []) }; batches.push(b); return b; }
    function put(b, d, s, lift = 0, sy = s, color = null) {
      Q.setFromUnitVectors(Y, d); Qy.setFromAxisAngle(Y, rnd() * 6.28); Q.multiply(Qy);
      P.copy(d).multiplyScalar(groundR(d) + lift * sy); S.set(s, sy, s); M.compose(P, Q, S); b.items[chunkOf(d)].push({ m: M.clone(), color });
    }
    // pines: trunk + three cones; round trees: trunk + ball
    const NP = 90, NR = 70;
    const trunkG = new THREE.CylinderGeometry(0.15, 0.22, 0.9, 6); trunkG.translate(0, 0.45, 0);
    const coneGs = [0, 1, 2].map(i => { const g = new THREE.ConeGeometry(1.1 - i * 0.28, 1.25, 7); g.translate(0, 1.15 + i * 0.7, 0); return g; });
    const ballG = new THREE.IcosahedronGeometry(1, 0); ballG.translate(0, 1.6, 0);
    const trunks = inst(trunkG, lam(0x4a3424), NP + NR);
    const pineMs = coneGs.map((g, i) => inst(g, lam(i % 2 ? 0x24553c : 0x1f4a35), NP));
    const ballM = inst(ballG, lam(0x2f6a46), NR), ballM2 = inst(ballG, lam(0x7a3a3a), 14);
    scatter(NP, 5, d => { const s = 0.45 + rnd() * rnd() * 0.75; put(trunks, d, s); pineMs.forEach(m => put(m, d, s)); });
    let red = 0;
    scatter(NR, 5, d => { const s = 0.38 + rnd() * rnd() * 0.55; put(trunks, d, s); if (red < 14 && rnd() < 0.18) { put(ballM2, d, s * 0.95); red++; } else put(ballM, d, s, 0, s * (0.8 + rnd() * 0.5)); });
    // flowers (gold, red, white, violet) near paths
    const flowerG = new THREE.OctahedronGeometry(0.12, 0); flowerG.translate(0, 0.22, 0);
    const flowers = inst(flowerG, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x332211, flatShading: true }), 420);
    const fc = [0xf2cd62, 0xc8323a, 0xf4ece0, 0x9a7ae0, 0xf2cd62];
    const stemG = new THREE.ConeGeometry(0.1, 0.5, 3); stemG.translate(0, 0.25, 0);
    const tufts = inst(stemG, lam(0x3f6b45), 500);
    scatter(420, 0.2, (d, i) => put(flowers, d, 0.8 + rnd() * 0.6, 0, undefined, fc[i % fc.length]), pathPts);
    scatter(500, 0.1, d => put(tufts, d, 0.8 + rnd() * 0.9));
    const rockG = new THREE.DodecahedronGeometry(0.5, 0);
    const rocks = inst(rockG, lam(0x55506a), 40); scatter(40, 0.8, d => put(rocks, d, 0.5 + rnd() * 1.2, 0.1, 0.4 + rnd() * 0.5));
    for (const b of batches) b.items.forEach((list, ci) => {
      if (!list.length) return;
      const m = new THREE.InstancedMesh(b.geo, b.material, list.length);
      list.forEach((it, k) => { m.setMatrixAt(k, it.m); if (it.color != null) m.setColorAt(k, c.setHex(it.color)); });
      m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere();
      m.userData.chunk = AXES[ci]; group.add(m); chunked.push(m);
    });

    // fireflies drifting low over the meadows
    const NF = 160; ffData = []; const fp = new Float32Array(NF * 3);
    scatter(NF, 0, d => ffData.push({ d, ph: rnd() * 6.28, h: 0.5 + rnd() * 1.8, w: 0.3 + rnd() * 0.6 }), pathPts);
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    fireflies = new THREE.Points(fg, new THREE.PointsMaterial({ color: 0xf6e27a, size: 0.24, map: glowSprite().material.map, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    fireflies.material.userData.anim = true; fireflies.frustumCulled = false; group.add(fireflies);

    // paper lanterns floating high above the planet (the sketch's drifting lights)
    skyLanterns = { body: new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.38, 0.8, 8), glow(0xffb866, 1.8), 16), list: [] }; group.add(skyLanterns.body);
    for (let i = 0; i < 16; i++) skyLanterns.list.push({ d: randDir(), h: 7 + rnd() * 9, sp: (rnd() - 0.5) * 0.04, ax: randDir() });
    skyLanterns.body.count = 16; skyLanterns.body.frustumCulled = false;
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(48), 3));
    skyLanterns.halo = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffc070, size: 3.2, map: glowSprite().material.map, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    skyLanterns.halo.frustumCulled = false; group.add(skyLanterns.halo);

    // a soft blue-gold rim of atmosphere around the planet (seen from orbit)
    atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.1, 48, 24), new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uCol: { value: new THREE.Color(0x4a6ad8) }, uI: { value: 0.9 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 uCol; uniform float uI; varying vec3 vN; varying vec3 vV; void main(){ float k = clamp(1. + dot(normalize(vN), normalize(vV)) * 1.0, 0., 1.); k = pow(k, 5.) * uI; gl_FragColor = vec4(uCol * k, k); }',
    }));
    atmo.renderOrder = -1; group.add(atmo);

    // moons: a ringed one (as in the sketch) and a small rocky one
    const m1 = new THREE.Group(); const ringed = new THREE.Group(); m1.add(ringed);
    mesh(new THREE.IcosahedronGeometry(4.2, 1), mat(0x8fa0c8), 0, 0, 0, ringed);
    const ring = mesh(new THREE.RingGeometry(5.6, 8.2, 40), new THREE.MeshStandardMaterial({ color: 0xe8c15a, emissive: 0x6a5020, side: THREE.DoubleSide, transparent: true, opacity: 0.75, roughness: 0.7 }), 0, 0, 0, ringed);
    ring.rotation.x = Math.PI / 2 - 0.35;
    const m2 = new THREE.Group(); const rocky = mesh(new THREE.IcosahedronGeometry(1.8, 0), mat(0xb9a690), 0, 0, 0, m2);
    group.add(m1, m2);
    moons = [
      { g: m1, body: ringed, dist: R * 2.55, tilt: 0.45, speed: 0.012, ph: 2.2 },
      { g: m2, body: rocky, dist: R * 1.75, tilt: -0.3, speed: 0.03, ph: 0.4 },
    ];
    return { terrain, lanterns: halos.length };
  }

  const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1);
  function update(t, dt) {
    if (fireflies) {
      const a = fireflies.geometry.attributes.position; const night = DAY.night;
      ffData.forEach((f, i) => {
        _a.set(Math.sin(t * f.w + f.ph), Math.cos(t * f.w * 0.7 + f.ph * 2), Math.sin(t * f.w * 0.5 + f.ph * 3)).multiplyScalar(0.8 / R);
        _v.copy(f.d).add(_a).normalize();
        const h = groundR(_v) + f.h + Math.sin(t * 1.3 + f.ph) * 0.3; a.setXYZ(i, _v.x * h, _v.y * h, _v.z * h);
      });
      a.needsUpdate = true; fireflies.material.opacity = 0.15 + 0.85 * night;
    }
    if (skyLanterns.list) {
      const ha = skyLanterns.halo.geometry.attributes.position;
      skyLanterns.list.forEach((u, i) => {
        _v.copy(u.d).applyAxisAngle(u.ax, t * u.sp); _p.copy(_v).multiplyScalar(R + u.h + Math.sin(t * 0.5 + i) * 0.6);
        _q.setFromUnitVectors(Y, _v); _m.compose(_p, _q, _s); skyLanterns.body.setMatrixAt(i, _m); ha.setXYZ(i, _p.x, _p.y, _p.z);
      });
      skyLanterns.body.instanceMatrix.needsUpdate = true; ha.needsUpdate = true;
    }
    moons.forEach(m => {
      const a = t * m.speed + m.ph; m.g.position.set(Math.cos(a) * m.dist, Math.sin(a) * m.dist * Math.sin(m.tilt), Math.sin(a) * m.dist * Math.cos(m.tilt));
      m.body.rotation.y = t * 0.05;
    });
    if (pathMat) pathMat.emissiveIntensity = 0.12 + 0.3 * DAY.glow;
  }

  // skip terrain/plant chunks that are round the back of the planet
  const _cd = new THREE.Vector3();
  function cull(cam) {
    const D = cam.length(); _cd.copy(cam).divideScalar(D);
    const lim = Math.acos(Math.min(1, (R - 1) / D)) + 0.42 + 0.98;
    if (atmo) { atmo.visible = D > R * 1.3; atmo.material.uniforms.uCol.value.setHex(DAY.day > 0.5 ? 0x8fb8ff : 0x4a6ad8).lerp(new THREE.Color(0xffc070), DAY.night > 0.2 && DAY.day > 0.1 ? 0.3 : 0); }
    for (const m of chunked) m.visible = Math.acos(THREE.MathUtils.clamp(_cd.dot(m.userData.chunk), -1, 1)) < lim;
  }

  // ---------- walking blockers ----------
  function addSolid(dir, r) { solids.push({ c: dir.clone().normalize(), r }); }
  function collide(n, rad = 0.35) {
    for (const s of solids) {
      const dist = Math.acos(Math.min(1, n.dot(s.c))) * R, min = s.r + rad;
      if (dist < min) {
        const tdir = n.clone().addScaledVector(s.c, -n.dot(s.c));
        if (tdir.lengthSq() < 1e-10) tdir.set(1, 0, 0).cross(s.c);
        tdir.normalize(); const th = min / R;
        n.copy(s.c).multiplyScalar(Math.cos(th)).addScaledVector(tdir, Math.sin(th));
      }
    }
    return n;
  }

  // ---------- line of sight (labels behind the planet hide) ----------
  const _o = new THREE.Vector3();
  function hidden(from, to, shrink = 1.5) {
    const rs = R - shrink; _o.subVectors(to, from); const L = _o.length(); _o.divideScalar(L);
    const b = from.dot(_o), cc = from.lengthSq() - rs * rs, disc = b * b - cc;
    if (disc <= 0) return false;
    const t0 = -b - Math.sqrt(disc);
    return t0 > 0 && t0 < L - 0.5;
  }

  return { R, group, cull, place, places, groundR, surface, build, update, routes, addSolid, collide, solids, hidden, inPlace, capOf };
}

// =====================================================================
// Walking on the planet: gravity points to the centre, up is the ground normal.
// =====================================================================
export function createWalker(planet, camera, dom, { joy } = {}) {
  const R = planet.R;
  const n = new THREE.Vector3(0, 1, 0), f = new THREE.Vector3(0, 0, -1);
  const st = { active: false, pitch: -0.08, keys: new Set(), joy: { x: 0, y: 0 }, eye: 1.6, speed: 6.5, run: 1, dist: 0 };
  const right = new THREE.Vector3(), tmp = new THREE.Vector3(), look = new THREE.Vector3();
  function enter(pos, lookAt) {
    n.copy(pos).normalize();
    tmp.copy(lookAt || pos.clone().add(new THREE.Vector3(0, 0, -1))).sub(pos);
    f.copy(tmp).addScaledVector(n, -tmp.dot(n));
    if (f.lengthSq() < 1e-6) f.set(1, 0, 0).cross(n);
    f.normalize(); st.pitch = -0.08; st.active = true; st.dist = 0; place();
  }
  function exit() { st.active = false; st.keys.clear(); st.joy.x = st.joy.y = 0; }
  function place() {
    const g = planet.groundR(n);
    camera.position.copy(n).multiplyScalar(g + st.eye);
    camera.up.copy(n);
    look.copy(camera.position).addScaledVector(f, Math.cos(st.pitch)).addScaledVector(n, Math.sin(st.pitch));
    camera.lookAt(look);
  }
  const K = k => st.keys.has(k);
  function update(dt) {
    if (!st.active) return;
    dt = Math.min(dt, 0.25);                     // frame-rate independent; huge hitches are capped
    let fw = (K('w') || K('arrowup') ? 1 : 0) - (K('s') || K('arrowdown') ? 1 : 0) + -st.joy.y;
    let sr = (K('d') ? 1 : 0) - (K('a') ? 1 : 0) + st.joy.x;
    const turn = (K('arrowleft') || K('q') ? 1 : 0) - (K('arrowright') || K('e') ? 1 : 0);
    if (turn) f.applyAxisAngle(n, turn * 1.9 * dt);
    const len = Math.hypot(fw, sr); if (len > 1) { fw /= len; sr /= len; }
    if (fw || sr) {
      right.crossVectors(f, n).normalize();
      const speed = st.speed * (K('shift') ? 1.8 : 1);
      let left = speed * dt * Math.hypot(fw, sr);
      st.dist += left;
      const mv = tmp.copy(f).multiplyScalar(fw).addScaledVector(right, sr).normalize();
      while (left > 1e-6) {                       // substeps keep collisions honest at low fps
        const step = Math.min(left, 0.3); left -= step;
        const p = n.clone().multiplyScalar(R).addScaledVector(mv, step);
        const old = n.clone(); n.copy(p).normalize(); planet.collide(n);
        // carry the heading and move direction along the curve (parallel transport)
        const q = new THREE.Quaternion().setFromUnitVectors(old, n); f.applyQuaternion(q); mv.applyQuaternion(q);
        f.addScaledVector(n, -f.dot(n)).normalize();
      }
    }
    place();
  }
  // drag to look
  let drag = null;
  dom.addEventListener('pointerdown', e => { if (!st.active || e.target !== dom) return; drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
  addEventListener('pointermove', e => {
    if (!st.active || !drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    f.applyAxisAngle(n, -dx * 0.0045); st.pitch = THREE.MathUtils.clamp(st.pitch - dy * 0.0035, -1.2, 1.1);
  });
  addEventListener('pointerup', e => { if (drag && e.pointerId === drag.id) drag = null; });
  // keys
  const keyName = e => e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  addEventListener('keydown', e => { if (!st.active || /input|textarea|select/i.test(e.target.tagName)) return; const k = keyName(e); if (['w', 'a', 's', 'd', 'q', 'e', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { st.keys.add(k); e.preventDefault(); } });
  addEventListener('keyup', e => st.keys.delete(keyName(e)));
  addEventListener('blur', () => st.keys.clear());
  // phone joystick (same look as the house's)
  if (joy) {
    const knob = joy.querySelector('i') || joy.appendChild(document.createElement('i'));
    let jid = null, cx = 0, cy = 0;
    const set = (x, y) => { const r = 44; let dx = x - cx, dy = y - cy; const l = Math.hypot(dx, dy); if (l > r) { dx *= r / l; dy *= r / l; } knob.style.transform = `translate(${dx}px, ${dy}px)`; st.joy.x = dx / r; st.joy.y = dy / r; };
    joy.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); jid = e.pointerId; joy.setPointerCapture?.(e.pointerId); const b = joy.getBoundingClientRect(); cx = b.left + b.width / 2; cy = b.top + b.height / 2; set(e.clientX, e.clientY); });
    joy.addEventListener('pointermove', e => { if (e.pointerId === jid) set(e.clientX, e.clientY); });
    const end = e => { if (e.pointerId !== jid) return; jid = null; st.joy.x = st.joy.y = 0; knob.style.transform = ''; };
    joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
  }
  return { state: st, n, f, enter, exit, update, place, get active() { return st.active; } };
}

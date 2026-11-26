// Ambient life in the Realm: butterflies flitting over the grass by day and small flocks of
// birds wheeling overhead (the fireflies at night live in js/realm.js). All instanced, two
// draw calls each; counts scale with the graphics tier. Clicking the grass drops seeds and
// some of the flock will swoop down to peck, then flush if you startle them.
import * as THREE from 'three';
import { rng } from './util.js';
import { DAY } from './daylight.js';

export function createLife(realm, { amount = 1 } = {}) {
  const group = new THREE.Group(); group.name = 'life'; group.userData.noDetail = true;
  const R = rng(1111);
  // a wing: one quad hinged on the body's long axis (z), reaching out along +x
  const wing = (w, l) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -l * 0.5, w, 0, -l * 0.2, w * 0.8, 0, l * 0.55, 0, 0, l * 0.35], 3)); g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals(); return g; };
  const mkPair = (geo, mat, n) => { const L = new THREE.InstancedMesh(geo, mat, n), Rt = new THREE.InstancedMesh(geo, mat, n); for (const m of [L, Rt]) { m.frustumCulled = false; m.userData.gfx = 1; m.castShadow = false; group.add(m); } return [L, Rt]; };
  // ----- butterflies -----
  const NB = 22;
  const bMat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, emissive: 0x221808 });
  const [bL, bR] = mkPair(wing(0.17, 0.2), bMat, NB);
  const COLS = [0xf2cd62, 0xffe7a8, 0xe8a040, 0xc8323a, 0x9a7ae0, 0xf4ece0];
  const bs = [];
  for (let i = 0; i < NB; i++) {
    const c = new THREE.Color(COLS[i % COLS.length]); bL.setColorAt(i, c); bR.setColorAt(i, c);
    bs.push({ x: (R() - 0.5) * 40, z: (R() - 0.5) * 40, h: 0.5 + R() * 1.2, ph: R() * 6.28, sp: 0.6 + R() * 0.6, f: 11 + R() * 6, tx: 0, tz: 0, yaw: 0, retarget: 0 });
  }
  // ----- birds -----
  const NF = 3, PER = 5, NBd = NF * PER;
  const dMat = new THREE.MeshLambertMaterial({ color: 0x2a2d3a, side: THREE.DoubleSide });
  const [dL, dR] = mkPair(wing(0.7, 0.32), dMat, NBd);
  const bodyGeo = new THREE.SphereGeometry(0.16, 8, 6); bodyGeo.scale(0.7, 0.7, 1.35);
  const bodyMesh = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0x1f2230 }), NBd);
  bodyMesh.frustumCulled = false; bodyMesh.userData.gfx = 1; bodyMesh.castShadow = false; group.add(bodyMesh);
  const flocks = [...Array(NF)].map((_, k) => ({ r: 40 + k * 18, h: 28 + k * 7, w: (k % 2 ? -1 : 1) * (0.09 + k * 0.02), ph: k * 2.1, cx: 0, cz: 0 }));
  const birds = [];
  for (let k = 0; k < NF; k++) for (let j = 0; j < PER; j++) {
    birds.push({ k, j, i: k * PER + j, mode: 'fly', x: 0, y: 0, z: 0, yaw: 0, roll: 0, seed: null, t: 0, pecks: 0, hop: R() * 6.28, sx: 0, sy: 0, sz: 0 });
  }
  const seedList = []; // {id, x, y, z, pecks, want}
  let seedSeq = 1;
  const M = new THREE.Matrix4(), Mw = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1);
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  function put(Lm, Rm, i, x, y, z, yaw, flap, s, roll = 0, bodyS = 0) {
    E.set(0, yaw, roll); Q.setFromEuler(E); P.set(x, y, z); S.setScalar(s); M.compose(P, Q, S);
    Mw.makeRotationZ(flap); Lm.setMatrixAt(i, Mw.premultiply(M));
    Mw.makeRotationZ(Math.PI - flap); Rm.setMatrixAt(i, Mw.premultiply(M));
    if (bodyS > 0.01) { S.set(s * 1.1, s * 1.1, s * 1.1); M.compose(P, Q, S); bodyMesh.setMatrixAt(i, M); }
    else bodyMesh.setMatrixAt(i, hide);
  }
  function formation(k, j, t, cam) {
    const f = flocks[k];
    const side = (j % 2 ? 1 : -1) * Math.ceil(j / 2), back = Math.ceil(j / 2) * 2.2 / f.r;
    const a = t * f.w + f.ph - back * Math.sign(f.w);
    const rr = f.r + side * 1.8, gy = realm.heightAt(cam.x, cam.z);
    const x = f.cx + Math.cos(a) * rr, z = f.cz + Math.sin(a) * rr, y = gy + f.h + Math.sin(t * 0.7 + j) * 0.6;
    const yaw = Math.atan2(-Math.sin(a) * Math.sign(f.w), Math.cos(a) * Math.sign(f.w));
    const flap = 0.25 + Math.sin(t * 6.5 + j * 1.3 + k) * 0.45;
    return { x, y, z, yaw, flap, roll: -0.25 * Math.sign(f.w) };
  }
  function turnToward(b, x, z, dt, rate = 3) {
    const want = Math.atan2(x - b.x, z - b.z);
    let d = want - b.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    b.yaw += d * Math.min(1, dt * rate);
  }
  function assignBirds(seed, maxN) {
    const flyers = birds.filter(b => b.mode === 'fly').sort((a, b) => Math.hypot(a.x - seed.x, a.z - seed.z) - Math.hypot(b.x - seed.x, b.z - seed.z));
    const n = Math.min(maxN, flyers.length);
    for (let i = 0; i < n; i++) {
      const b = flyers[i];
      b.mode = 'dive'; b.seed = seed.id; b.t = 0;
      b.sx = b.x; b.sy = b.y; b.sz = b.z;
      const ang = R() * 6.28, rad = 0.55 + R() * 0.45 + i * 0.25;
      b.lx = seed.x + Math.cos(ang) * rad; b.lz = seed.z + Math.sin(ang) * rad;
      b.ly = seed.y + 0.1;
    }
    seed.want = n;
    return n;
  }
  function feed(p) {
    const s = { id: p.id ?? seedSeq++, x: p.x, y: p.y, z: p.z, pecks: 0, want: 0 };
    seedList.push(s);
    const cap = amount >= 0.99 ? 3 : 2;
    const n = assignBirds(s, cap);
    return { ...s, assigned: n };
  }
  function removeSeed(id) {
    const i = seedList.findIndex(s => s.id === id);
    if (i >= 0) seedList.splice(i, 1);
    for (const b of birds) {
      if (b.seed !== id) continue;
      b.seed = null;
      if (b.mode === 'peck' || b.mode === 'land' || b.mode === 'dive') { b.mode = 'return'; b.t = 0; b.sx = b.x; b.sy = b.y; b.sz = b.z; }
    }
  }
  function startle(x, z, r = 5.5) {
    let n = 0;
    for (const b of birds) {
      if (!/peck|land|dive/.test(b.mode)) continue;
      if (Math.hypot(b.x - x, b.z - z) > r) continue;
      const dx = b.x - x, dz = b.z - z, d = Math.hypot(dx, dz) || 1;
      b.mode = 'startle'; b.t = 0; b.seed = null;
      b.sx = b.x; b.sy = b.y; b.sz = b.z;
      b.lx = b.x + (dx / d) * (6 + R() * 5); b.lz = b.z + (dz / d) * (6 + R() * 5); b.ly = b.y + 4.5 + R() * 2.5;
      n++;
    }
    return n;
  }
  function landedNear(x, z, r = 4) {
    return birds.some(b => /peck|land/.test(b.mode) && Math.hypot(b.x - x, b.z - z) < r);
  }

  let shown = 1, birdsShown = 1, weatherBad = false;
  function update(t, dt, cam) {
    const want = amount > 0 && !weatherBad ? THREE.MathUtils.smoothstep(DAY.day, 0.35, 0.7) : 0;
    shown += (want - shown) * Math.min(1, dt * 1.5);
    const wantB = amount > 0 && !weatherBad ? THREE.MathUtils.smoothstep(DAY.day, 0.2, 0.55) : 0;
    birdsShown += (wantB - birdsShown) * Math.min(1, dt * 1.5);
    group.visible = shown > 0.01 || birdsShown > 0.01 || birds.some(b => b.mode !== 'fly');
    if (!group.visible) return;
    const nb = Math.round(NB * Math.min(1, amount));
    for (let i = 0; i < NB; i++) {
      const b = bs[i];
      if (i >= nb || shown < 0.01) { bL.setMatrixAt(i, hide); bR.setMatrixAt(i, hide); continue; }
      // keep each butterfly within ~22 units of you: wrap around the camera
      let x = cam.x + (((b.x - cam.x) % 44) + 66) % 44 - 22, z = cam.z + (((b.z - cam.z) % 44) + 66) % 44 - 22;
      if ((b.retarget -= dt) <= 0) { b.retarget = 1.5 + R() * 2.5; const a = R() * 6.28; b.tx = Math.cos(a); b.tz = Math.sin(a); }
      b.x = x + b.tx * b.sp * dt + Math.sin(t * 1.7 + b.ph) * 0.6 * dt; b.z = z + b.tz * b.sp * dt + Math.cos(t * 1.3 + b.ph) * 0.6 * dt;
      const ok = realm.grassOK(b.x, b.z, 0) > 0.2 || realm.roadDist(b.x, b.z, 4) < 4;
      const y = realm.heightAt(b.x, b.z) + b.h + Math.sin(t * 2.3 + b.ph) * 0.25 + (ok ? 0 : 2.5);
      const yawT = Math.atan2(b.tx, b.tz); b.yaw += ((yawT - b.yaw + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 3);
      const flap = 0.15 + Math.abs(Math.sin(t * b.f + b.ph)) * 1.15;
      put(bL, bR, i, b.x, y, b.z, b.yaw, flap, shown);
    }
    bL.instanceMatrix.needsUpdate = bR.instanceMatrix.needsUpdate = true;
    if (bL.instanceColor) bL.instanceColor.needsUpdate = bR.instanceColor.needsUpdate = true;
    const nf = Math.max(1, Math.round(NF * Math.min(1, amount)));
    flocks.forEach((f, k) => {
      f.cx += (cam.x - f.cx) * Math.min(1, dt * 0.05); f.cz += (cam.z - f.cz) * Math.min(1, dt * 0.05);
    });
    if (weatherBad) {
      for (const b of birds) if (b.mode !== 'fly' && b.mode !== 'return' && b.mode !== 'startle') { b.mode = 'return'; b.t = 0; b.sx = b.x; b.sy = b.y; b.sz = b.z; }
    }
    for (const b of birds) {
      const i = b.i, form = formation(b.k, b.j, t, cam);
      if (b.k >= nf || (birdsShown < 0.01 && b.mode === 'fly')) { dL.setMatrixAt(i, hide); dR.setMatrixAt(i, hide); bodyMesh.setMatrixAt(i, hide); continue; }
      if (b.mode === 'fly') {
        b.x = form.x; b.y = form.y; b.z = form.z; b.yaw = form.yaw; b.roll = form.roll;
        put(dL, dR, i, b.x, b.y, b.z, b.yaw, form.flap, birdsShown, b.roll, 0);
        continue;
      }
      const seed = seedList.find(s => s.id === b.seed);
      if (b.mode === 'dive') {
        b.t += dt;
        const dur = 2.0, u = Math.min(1, b.t / dur), k = u * u * (3 - 2 * u);
        const lx = seed ? b.lx : form.x, lz = seed ? b.lz : form.z, ly = seed ? b.ly : form.y;
        b.x = b.sx + (lx - b.sx) * k; b.z = b.sz + (lz - b.sz) * k;
        const arc = Math.sin(u * Math.PI) * Math.max(2, (b.sy - ly) * 0.15);
        b.y = b.sy + (ly - b.sy) * k + arc * (1 - u);
        turnToward(b, lx, lz, dt, 4);
        const flap = 0.15 + Math.abs(Math.sin(t * 14 + b.i)) * 0.85;
        put(dL, dR, i, b.x, b.y, b.z, b.yaw, flap, 1, -0.35, 0);
        if (u >= 1) { b.mode = 'land'; b.t = 0; b.x = lx; b.z = lz; b.y = ly; }
      } else if (b.mode === 'land') {
        b.t += dt;
        const gy = realm.heightAt(b.x, b.z) + 0.12;
        b.y += (gy - b.y) * Math.min(1, dt * 8);
        const flap = Math.max(0.02, 0.2 - b.t * 0.35);
        put(dL, dR, i, b.x, b.y, b.z, b.yaw, flap, 0.52, 0.04, 1);
        if (b.t > 0.35) { b.mode = 'peck'; b.t = 0; b.pecks = 0; b.hop = R() * 6.28; }
      } else if (b.mode === 'peck') {
        b.t += dt;
        if (!seed) { b.mode = 'return'; b.t = 0; b.sx = b.x; b.sy = b.y; b.sz = b.z; }
        else {
          // small hops around the seed and a nodding peck
          const bob = Math.abs(Math.sin(b.t * 9)) * 0.05;
          const nod = Math.max(0, Math.sin(b.t * 9)) * 0.55;
          b.hop += dt * 0.8;
          const ox = seed.x + Math.cos(b.hop + b.i) * 0.75, oz = seed.z + Math.sin(b.hop + b.i) * 0.75;
          b.x += (ox - b.x) * Math.min(1, dt * 2); b.z += (oz - b.z) * Math.min(1, dt * 2);
          b.y = realm.heightAt(b.x, b.z) + 0.12 + bob;
          turnToward(b, seed.x, seed.z, dt, 5);
          put(dL, dR, i, b.x, b.y, b.z, b.yaw, 0.02 + nod * 0.05, 0.52, nod * 0.5, 1);
          if (Math.sin(b.t * 9) > 0.95) { b.pecks++; seed.pecks = (seed.pecks || 0) + 0.15; }
        }
      } else if (b.mode === 'startle') {
        b.t += dt;
        const dur = 0.85, u = Math.min(1, b.t / dur), k = 1 - (1 - u) * (1 - u);
        b.x = b.sx + (b.lx - b.sx) * k; b.z = b.sz + (b.lz - b.sz) * k;
        b.y = b.sy + (b.ly - b.sy) * k + Math.sin(u * Math.PI) * 1.2;
        turnToward(b, b.lx, b.lz, dt, 6);
        const flap = 0.1 + Math.abs(Math.sin(t * 18 + b.i)) * 1.1;
        put(dL, dR, i, b.x, b.y, b.z, b.yaw, flap, 1, -0.2, 0);
        if (u >= 1) { b.mode = 'return'; b.t = 0; b.sx = b.x; b.sy = b.y; b.sz = b.z; }
      } else if (b.mode === 'return') {
        b.t += dt;
        const dur = 2.2, u = Math.min(1, b.t / dur), k = u * u * (3 - 2 * u);
        b.x = b.sx + (form.x - b.sx) * k; b.z = b.sz + (form.z - b.sz) * k;
        b.y = b.sy + (form.y - b.sy) * k + Math.sin(u * Math.PI) * 3;
        turnToward(b, form.x, form.z, dt, 4);
        const flap = 0.2 + Math.abs(Math.sin(t * 11 + b.i)) * 0.7;
        put(dL, dR, i, b.x, b.y, b.z, b.yaw, flap, 1, form.roll * u, 0);
        if (u >= 1) { b.mode = 'fly'; b.t = 0; }
      }
    }
    dL.instanceMatrix.needsUpdate = dR.instanceMatrix.needsUpdate = true;
    bodyMesh.instanceMatrix.needsUpdate = true;
  }
  return {
    group, update, feed, removeSeed, startle, landedNear,
    get seeds() { return seedList; },
    get birds() { return birds; },
    get feeding() { return birds.filter(b => b.mode !== 'fly').length; },
    get pecking() { return birds.filter(b => b.mode === 'peck' || b.mode === 'land').length; },
    set amount(v) { amount = v; },
    set weather(kind) { weatherBad = /rain|snow|storm/.test(kind || ''); },
  };
}

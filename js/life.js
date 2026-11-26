// Ambient life in the Realm: butterflies flitting over the grass by day and small flocks of
// birds wheeling overhead (the fireflies at night live in js/realm.js). All instanced, two
// draw calls each; counts scale with the graphics tier.
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
  const flocks = [...Array(NF)].map((_, k) => ({ r: 40 + k * 18, h: 28 + k * 7, w: (k % 2 ? -1 : 1) * (0.09 + k * 0.02), ph: k * 2.1, cx: 0, cz: 0 }));
  const M = new THREE.Matrix4(), Mw = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1);
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  function put(Lm, Rm, i, x, y, z, yaw, flap, s, roll = 0) {
    E.set(0, yaw, roll); Q.setFromEuler(E); P.set(x, y, z); S.setScalar(s); M.compose(P, Q, S);
    Mw.makeRotationZ(flap); Lm.setMatrixAt(i, Mw.premultiply(M));
    Mw.makeRotationZ(Math.PI - flap); Rm.setMatrixAt(i, Mw.premultiply(M));
  }
  let shown = 1, birdsShown = 1, weatherBad = false;
  function update(t, dt, cam) {
    const want = amount > 0 && !weatherBad ? THREE.MathUtils.smoothstep(DAY.day, 0.35, 0.7) : 0;
    shown += (want - shown) * Math.min(1, dt * 1.5);
    const wantB = amount > 0 && !weatherBad ? THREE.MathUtils.smoothstep(DAY.day, 0.2, 0.55) : 0;
    birdsShown += (wantB - birdsShown) * Math.min(1, dt * 1.5);
    group.visible = shown > 0.01 || birdsShown > 0.01;
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
      const a0 = t * f.w + f.ph, gy = realm.heightAt(cam.x, cam.z);
      for (let j = 0; j < PER; j++) {
        const i = k * PER + j;
        if (k >= nf || birdsShown < 0.01) { dL.setMatrixAt(i, hide); dR.setMatrixAt(i, hide); continue; }
        const side = (j % 2 ? 1 : -1) * Math.ceil(j / 2), back = Math.ceil(j / 2) * 2.2 / f.r;   // a loose V
        const a = a0 - back * Math.sign(f.w);
        const rr = f.r + side * 1.8;
        const x = f.cx + Math.cos(a) * rr, z = f.cz + Math.sin(a) * rr, y = gy + f.h + Math.sin(t * 0.7 + j) * 0.6;
        const yaw = Math.atan2(-Math.sin(a) * Math.sign(f.w), Math.cos(a) * Math.sign(f.w));
        const flap = 0.25 + Math.sin(t * 6.5 + j * 1.3 + k) * 0.45;
        put(dL, dR, i, x, y, z, yaw, flap, birdsShown, -0.25 * Math.sign(f.w));
      }
    });
    dL.instanceMatrix.needsUpdate = dR.instanceMatrix.needsUpdate = true;
  }
  return { group, update, set amount(v) { amount = v; }, set weather(kind) { weatherBad = /rain|snow|storm/.test(kind || ''); } };
}

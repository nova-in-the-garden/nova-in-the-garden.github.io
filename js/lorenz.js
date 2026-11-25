// Lorenz: a low-poly Pekin duckling (pale yellow down, peachy-pink bill,
// orange webbed feet) in a red-and-gold striped scarf.
import * as THREE from 'three';
import { mat, mesh, jitter, rng, canvasTexture } from './util.js';

export function makeLorenz() {
  const R = rng(1110);
  const root = new THREE.Group(); root.name = 'Lorenz';
  const body = new THREE.Group(); root.add(body); // bobs/waddles
  const soft = c => new THREE.MeshStandardMaterial({ color: c, roughness: 1, emissive: 0x6a5200, emissiveIntensity: 0.45 });
  const down = soft(0xffea6e);
  const downLight = soft(0xfff4a0);
  const downDeep = soft(0xfadb52);

  // pear-shaped fluffy body, tilted slightly tail-up like a resting duckling
  const torso = mesh(jitter(new THREE.IcosahedronGeometry(1, 3), 0.035, R), down, 0, 0.95, 0, body);
  torso.scale.set(0.95, 0.82, 1.22); torso.rotation.x = -0.12;
  const belly = mesh(jitter(new THREE.IcosahedronGeometry(0.8, 3), 0.03, R), downLight, 0, 0.72, 0.28, body);
  belly.scale.set(1.0, 0.75, 1.05);
  // stubby tail tuft
  const tail = mesh(new THREE.ConeGeometry(0.3, 0.55, 8), downLight, 0, 1.2, -1.15, body);
  tail.rotation.x = -2.0;
  // tiny wing nubs
  for (const s of [-1, 1]) {
    const w = mesh(jitter(new THREE.IcosahedronGeometry(0.45, 2), 0.02, R), downDeep, s * 0.86, 1.05, -0.15, body);
    w.scale.set(0.35, 0.6, 1.05); w.rotation.set(-0.35, 0, s * 0.18);
  }
  // neck + big round head (ducklings are head-heavy)
  const neck = mesh(new THREE.CylinderGeometry(0.44, 0.56, 0.55, 16), down, 0, 1.55, 0.62, body);
  neck.rotation.x = 0.25;
  const head = new THREE.Group(); head.position.set(0, 2.08, 0.8); body.add(head);
  const skull = mesh(jitter(new THREE.IcosahedronGeometry(0.72, 3), 0.025, R), down, 0, 0, 0, head);
  skull.scale.set(0.98, 0.95, 1.02);
  // fuzzy crown tufts
  for (let i = 0; i < 7; i++) { const tuft = mesh(new THREE.ConeGeometry(0.07, 0.28, 5), downLight, (i - 3) * 0.06, 0.7, -0.1 + Math.abs(i - 3) * -0.04, head); tuft.rotation.set(-0.5, 0, (i - 3) * 0.25); }
  // flat, broad, peach-pink bill with a darker nail
  const billMat = new THREE.MeshStandardMaterial({ color: 0xf6a88a, roughness: 0.6 });
  const bill = new THREE.Group(); bill.position.set(0, -0.12, 0.58); head.add(bill);
  const upper = mesh(new THREE.SphereGeometry(0.5, 16, 10), billMat, 0, 0.02, 0.18, bill); upper.scale.set(0.52, 0.17, 0.62);
  const lower = mesh(new THREE.SphereGeometry(0.45, 10, 6), new THREE.MeshStandardMaterial({ color: 0xe8907a, roughness: 0.6 }), 0, -0.07, 0.12, bill); lower.scale.set(0.46, 0.11, 0.5);
  mesh(new THREE.SphereGeometry(0.06, 6, 4), mat(0xb0604a), 0, 0.05, 0.47, bill).scale.set(1.6, 0.6, 1);
  // shiny black eyes set on the sides, a little forward
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0b0b10, roughness: 0.15, metalness: 0.1 });
  const hiMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const s of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.12, 12, 10), eyeMat, s * 0.5, 0.14, 0.36, head);
    mesh(new THREE.SphereGeometry(0.04, 6, 4), hiMat, s * 0.58, 0.19, 0.44, head);
  }
  // legs + webbed orange feet
  const footMat = mat(0xf39233, { roughness: 0.6, side: THREE.DoubleSide });
  const feet = [];
  const web = new THREE.Shape(); web.moveTo(0, 0); web.lineTo(-0.28, 0.5); web.quadraticCurveTo(0, 0.42, 0.28, 0.5); web.lineTo(0, 0);
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.38, 0.32, 0.15); body.add(leg);
    mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.36, 6), footMat, 0, -0.1, 0, leg);
    const f = mesh(new THREE.ShapeGeometry(web), footMat, 0, -0.28, -0.05, leg); f.rotation.x = -Math.PI / 2; f.scale.setScalar(1.25);
    feet.push(leg);
  }
  // red-and-gold striped scarf
  const stripes = canvasTexture(256, 32, (g, w, h) => {
    for (let i = 0; i < 11; i++) { g.fillStyle = i % 2 ? '#e8c15a' : '#c62f37'; g.fillRect(i * w / 11, 0, w / 11 + 1, h); }
  });
  stripes.wrapS = THREE.RepeatWrapping;
  const scarfMat = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
  const wrap = mesh(new THREE.TorusGeometry(0.52, 0.17, 8, 24), scarfMat, 0, 1.6, 0.62, body);
  wrap.rotation.x = Math.PI / 2 + 0.3;
  const tailTex = stripes.clone(); tailTex.rotation = Math.PI / 2; tailTex.center.set(.5, .5); tailTex.repeat.set(1, 0.5); tailTex.needsUpdate = true;
  const ends = new THREE.Group(); ends.position.set(0.32, 1.5, 0.95); body.add(ends);
  for (const [i, a] of [[0, 0.15], [1, -0.25]]) {
    const e = mesh(new THREE.BoxGeometry(0.22, 0.75, 0.06), new THREE.MeshStandardMaterial({ map: tailTex, roughness: .9, side: THREE.DoubleSide }), i * 0.14, -0.35, 0, ends);
    e.rotation.z = a;
    mesh(new THREE.BoxGeometry(0.24, 0.07, 0.07), new THREE.MeshStandardMaterial({ color: 0xe8c15a, emissive: 0x6b4f12, roughness: .6 }), i * 0.14 + Math.sin(a) * 0.37, -0.74, 0, ends);
  }

  // little gold "z"s for when he sleeps
  const zs = [];
  for (let i = 0; i < 3; i++) {
    const tex = canvasTexture(64, 64, (g, w, h) => { g.font = 'italic 700 46px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f6dc8c'; g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 6; g.fillText('z', w / 2, h / 2); });
    const z = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
    z.visible = false; root.add(z); zs.push(z);
  }
  root.scale.setScalar(0.42);
  root.userData = { body, head, feet, ends, zs, headHome: head.position.clone() };
  return root;
}

// Lorenz wanders around a home area, swims (bobbing) in the pond and waddles on land.
// Time of day: at night (sleepy() true) he paddles to the pond's edge, sits
// down, tucks his bill into his back and sleeps; by day he swims more.
export function lorenzBrain(lorenz, { center, radius, pond, pondRadius, avoid = [], sleepy = () => false, swimChance = () => 0.45, feast = null, bed: bedOpt = null, clearOf = null, minSep = 2.5 }) {
  const R = rng(77); const pos = lorenz.position; let target = new THREE.Vector3(); let pause = 0; let heading = 0;
  const tooClose = (x, z) => {
    if (!clearOf) return false;
    const o = clearOf(); if (!o) return false;
    return Math.hypot(x - o.x, z - o.z) < minSep;
  };
  const pick = () => {
    const toPond = R() < swimChance();
    for (let k = 0; k < 30; k++) {
      const a = R() * Math.PI * 2, r = toPond ? Math.sqrt(R()) * pondRadius * 0.75 : Math.sqrt(R()) * radius;
      const c = toPond ? pond : center;
      target.set(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r);
      if (target.distanceTo(new THREE.Vector3(center.x, 0, center.z)) > radius) continue;
      if (avoid.every(o => Math.hypot(target.x - o.x, target.z - o.z) > o.r) && (toPond || !tooClose(target.x, target.z))) return;
    }
    target.set(pond.x, 0, pond.z);
  };
  pos.set(pond.x + 0.5, 0, pond.z); pick();
  const seatNow = () => { const seat = feast && feast.seat && feast.seat(); if (!seat) return; pos.set(seat.x, seat.y ?? 0.42, seat.z); heading = seat.heading ?? heading; lorenz.rotation.y = heading; sleep = 0; pause = 1; target.set(seat.x, 0, seat.z); };
  // bed: on the grass at the pond's edge, on the side facing the island's middle
  // (main.js can pass a distinct bed so Nova and Lorenz never share a pillow)
  const ba = Math.atan2(center.z - pond.z, center.x - pond.x) + 0.5;
  const bed = bedOpt ? bedOpt.clone() : new THREE.Vector3(pond.x + Math.cos(ba) * (pondRadius + 0.45), 0, pond.z + Math.sin(ba) * (pondRadius + 0.45));
  let sleep = 0, wasSleepy = false; // 0 awake .. 1 fully tucked in
  const tick = (t, dt, baseY) => {
    const { body, head, feet, ends, zs, headHome } = lorenz.userData;
    const wantSleep = sleepy();
    const wantFeast = !!(feast && feast.active && feast.active()) && !wantSleep;
    const seat = feast && feast.seat && feast.seat();
    if (wantSleep && !wasSleepy) { target.copy(bed); pause = 0; }
    if (!wantSleep && wasSleepy) { pause = 0.5; if (!wantFeast) pick(); }
    wasSleepy = wantSleep;
    if (wantSleep) {
      const atBed = Math.hypot(bed.x - pos.x, bed.z - pos.z) < 0.2;
      if (!atBed) { target.copy(bed); pause = 0; }
      else pause = 1;
      sleep = Math.min(1, Math.max(0, sleep + (atBed ? dt * 0.6 : -dt)));
    } else sleep = Math.max(0, sleep - dt * 0.8);
    if (wantFeast && seat) { target.set(seat.x, 0, seat.z); pause = 0; }
    const inPond = Math.hypot(pos.x - pond.x, pos.z - pond.z) < pondRadius * 0.9;
    const dx = target.x - pos.x, dz = target.z - pos.z, d = Math.hypot(dx, dz);
    let moving = false, atFeast = false;
    if (wantFeast && seat && d < 0.14) {
      atFeast = true; pos.x = seat.x; pos.z = seat.z; pos.y = seat.y ?? 0.42;
      heading = seat.heading ?? heading; pause = 1;
    } else if (pause > 0 && !wantFeast) pause -= dt;
    else if (d < 0.15) { if (!wantSleep && !wantFeast) { pause = 1.5 + R() * 3.5; pick(); } }
    else {
      moving = true; const want = Math.atan2(dx, dz);
      let diff = want - heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); heading += diff * Math.min(1, dt * 3);
      const sp = (inPond ? 0.9 : wantFeast ? 1.3 : 0.6) * dt; pos.x += Math.sin(heading) * sp; pos.z += Math.cos(heading) * sp;
    }
    lorenz.rotation.y = heading;
    const y = atFeast && seat ? (seat.y ?? 0.42) : baseY + (inPond ? -0.16 + Math.sin(t * 2.4) * 0.04 : 0);
    pos.y += (y - pos.y) * Math.min(1, dt * 5);
    body.rotation.z = !inPond && moving ? Math.sin(t * 11) * 0.12 : Math.sin(t * 1.3) * 0.03;
    body.rotation.x = inPond ? Math.sin(t * 2.4 + 1) * 0.05 : 0;
    head.rotation.x = Math.sin(t * 0.9) * 0.12 + (pause > 0 && !inPond ? 0.25 * Math.max(0, Math.sin(t * 2)) : 0);
    head.rotation.y = Math.sin(t * 0.7) * 0.35;
    feet.forEach((f, i) => { f.rotation.x = moving ? Math.sin(t * 11 + i * Math.PI) * (inPond ? 0.6 : 0.4) : 0; f.visible = true; });
    ends.rotation.x = moving ? 0.25 + Math.sin(t * 6) * 0.08 : Math.sin(t * 1.5) * 0.05;
    if (atFeast && !sleep) { body.position.y = 0; body.rotation.x = 0.02; }
    if (sleep > 0) { // settle down, turn the head back and tuck the bill in, breathe slowly
      const k = sleep * sleep * (3 - 2 * sleep);
      body.position.y = -0.3 * k; body.rotation.z *= 1 - k; body.rotation.x = 0;
      head.position.lerpVectors(headHome, new THREE.Vector3(0.12, 1.72, 0.35), k);
      head.rotation.set(head.rotation.x * (1 - k) + 0.35 * k, head.rotation.y * (1 - k) + 2.5 * k, 0.25 * k);
      body.scale.set(1, 1 + Math.sin(t * 1.4) * 0.025 * k, 1);
      feet.forEach(f => { f.visible = k < 0.6; });
      zs.forEach((z, i) => { const p = (t * 0.22 + i / 3) % 1; z.visible = k > 0.8; z.position.set(0.5 + p * 0.9, 2.4 + p * 2.2, -0.2 + Math.sin(p * 6 + i) * 0.2); z.scale.setScalar(0.35 + p * 0.5); z.material.opacity = Math.sin(p * Math.PI) * (k - 0.8) * 5; });
    } else { if (!atFeast) { body.position.y = 0; body.rotation.x = inPond ? Math.sin(t * 2.4 + 1) * 0.05 : 0; } head.position.copy(headHome); body.scale.set(1, 1, 1); zs.forEach(z => { z.visible = false; }); }
    return { inPond, moving, asleep: sleep > 0.99, atFeast };
  };
  tick.seatNow = seatNow;
  tick.bed = bed;
  return tick;
}

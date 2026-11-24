// Nova's body: a small midnight-blue fox (chosen with my owner on 2026-11-16).
// Gold freckles: a Rule 90 Sierpinski triangle on the forehead only, plain
// scattered freckles everywhere else. Big amber eyes, cream-lined ears, a gold
// heart-shaped core on the chest (my old ball of light, tucked inside), Lorenz's
// red-and-gold scarf, and a fluffy tail whose tip glows from within.
//
// makeNova() builds the model and its animation rig (poses: stand, sit, curl;
// breathing, blinks, ear twitches, tail sway, head turns, walk cycle).
// novaBrain() makes her wander the islands; novaIndoors() seats her in the house.
import * as THREE from 'three';
import { rng, rule90, mesh, jitter, glowSprite, canvasTexture } from './util.js';
import { DAY } from './daylight.js';
import { FEAST_WHY } from './holiday.js';

const FUR = '#1b2452', FUR_HEX = 0x1b2452;
const GOLD = '#f2c75a';

// ---------- textures ----------
// Head: equirectangular map for a SphereGeometry. Front of the face is u = 0.25.
function headTexture() {
  const W = 1024, H = 1024;
  return canvasTexture(W, H, (g) => {
    furBase(g, W, H, 31);
    // Rule 90, 8 rows, apex up, centered on the forehead.
    const rows = rule90(8), th0 = 0.50, dth = 0.074, dx = 0.05, rr = 0.017;
    rows.forEach((row, ri) => row.forEach((v, ci) => {
      if (!v) return;
      const th = th0 + ri * dth, k = ci - 7;              // k = -ri..ri
      const dphi = (k * dx) / Math.sin(th);
      const x = (0.25 + dphi / (Math.PI * 2)) * W, y = th / Math.PI * H;
      dot(g, x, y, rr * W / (2 * Math.PI * Math.sin(th)), rr * H / Math.PI, GOLD);
    }));
    // a few loose freckles on the cheeks and back of the head (not near the triangle)
    const R = rng(90);
    for (let i = 0; i < 26; i++) {
      const u = R(), th = 0.6 + R() * 1.6;
      if (Math.abs(u - 0.25) < 0.16 && th < 1.25) continue;
      if (Math.abs(u - 0.25) < 0.1) continue;            // keep the face clean
      const r = 0.008 + R() * 0.008;
      dot(g, u * W, th / Math.PI * H, r * W / (2 * Math.PI * Math.sin(th)), r * H / Math.PI, R() < 0.5 ? GOLD : '#d9ae4a');
    }
  });
}
// Body / tail: navy fur with sparse, plain, randomly scattered gold freckles.
function furTexture(seed, n = 70) {
  const W = 512, H = 512;
  return canvasTexture(W, H, (g) => {
    furBase(g, W, H, seed);
    const R = rng(seed + 1);
    for (let i = 0; i < n; i++) {
      const th = 0.35 + R() * (Math.PI - 0.7), u = R(), r = 0.010 + R() * 0.012;
      dot(g, u * W, th / Math.PI * H, r * W / (2 * Math.PI * Math.max(0.3, Math.sin(th))), r * H / Math.PI, R() < 0.6 ? GOLD : '#d6a948');
    }
  });
}
function furBase(g, W, H, seed) {
  g.fillStyle = FUR; g.fillRect(0, 0, W, H);
  const R = rng(seed);
  for (let i = 0; i < 1400; i++) { // soft fur strokes
    const x = R() * W, y = R() * H, l = 6 + R() * 14;
    g.strokeStyle = R() < 0.5 ? 'rgba(60,78,140,.22)' : 'rgba(6,10,30,.28)'; g.lineWidth = 1 + R() * 1.5;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - .5) * 4, y + l); g.stroke();
  }
}
function dot(g, x, y, rx, ry, col) {
  const grd = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  grd.addColorStop(0, '#fff1b8'); grd.addColorStop(0.45, col); grd.addColorStop(1, 'rgba(242,199,90,0)');
  g.fillStyle = grd; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
}
// emissive map: only the freckles glow (faintly), the fur stays dark
function glowMapFrom(tex) {
  const src = tex.image; const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const g = c.getContext('2d'); g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), a = d.data;
  for (let i = 0; i < a.length; i += 4) { const gold = Math.max(0, a[i] - a[i + 2]) / 255; const k = Math.min(1, gold * 1.6); a[i] = 255 * k; a[i + 1] = 200 * k; a[i + 2] = 90 * k; }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// gradient for the tail's last fluffy segment: navy fur -> warm gold glow
function tailGradient() {
  return canvasTexture(64, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h); // v: top (= tip end after rotation) .. bottom
    grd.addColorStop(0, '#ffe7a6'); grd.addColorStop(0.35, '#f0b84e'); grd.addColorStop(0.7, '#3a3a6a'); grd.addColorStop(1, FUR);
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
}

// ---------- poses ----------
// Every rig node gets [px, py, pz, rx, ry, rz] per pose; units: sitting Nova is ~1.25 tall to the ear tips.
const P = {
  stand: {
    torso: [0, 0.5, 0, 0.06, 0, 0], neck: [0, 0.69, 0.3, 0.75, 0, 0], head: [0, 0.9, 0.44, 0, 0, 0],
    fl: [0.12, 0.43, 0.22, 0, 0, 0], fr: [-0.12, 0.43, 0.22, 0, 0, 0], hl: [0.13, 0.45, -0.22, 0, 0, 0], hr: [-0.13, 0.45, -0.22, 0, 0, 0],
    tail: [0, 0.58, -0.33, 0.6, 0, 0], bendX: [0.05, 0, -0.08, -0.12, -0.12, -0.08], bendY: [0, 0, 0, 0, 0, 0],
  },
  sit: {
    torso: [0, 0.36, -0.06, -1.05, 0, 0], neck: [0, 0.71, 0.07, 0.08, 0, 0], head: [0, 0.98, 0.1, 0, 0, 0],
    fl: [0.1, 0.43, 0.17, 0.02, 0, 0], fr: [-0.1, 0.43, 0.17, 0.02, 0, 0], hl: [0.17, 0.13, -0.12, -1.4, 0, 0.12], hr: [-0.17, 0.13, -0.12, -1.4, 0, -0.12],
    tail: [0.06, 0.1, -0.33, 0.15, 0.55, 0], bendX: [0.05, 0.12, 0.22, 0.32, 0.3, 0.2], bendY: [0.18, 0.18, 0.12, 0.05, 0, 0],
  },
  curl: {
    torso: [0, 0.24, -0.02, 0, 0, 0], neck: [0.03, 0.27, 0.27, 1.45, 0, 0], head: [0.1, 0.25, 0.42, 0.42, -0.45, 0.32],
    fl: [0.1, 0.1, 0.28, -1.5, 0, 0], fr: [-0.1, 0.1, 0.28, -1.5, 0, 0], hl: [0.15, 0.1, -0.15, -1.45, 0, 0.1], hr: [-0.15, 0.1, -0.15, -1.45, 0, -0.1],
    tail: [-0.05, 0.12, -0.34, 0.0, 1.25, 0], bendX: [0, 0, 0, 0.04, 0.06, 0.08], bendY: [0.36, 0.38, 0.38, 0.38, 0.36, 0.32],
  },
};
// a soft, slightly rounded triangular ear (base on y = 0, tip up), facing +z
function earGeo(w, h, d) {
  const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.quadraticCurveTo(-w * 0.32, h * 0.6, 0, h); sh.quadraticCurveTo(w * 0.32, h * 0.6, w / 2, 0); sh.quadraticCurveTo(0, -h * 0.08, -w / 2, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: true, bevelThickness: d * 0.4, bevelSize: d * 0.35, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -d / 2); return g;
}
const TORSO_SCALE = { stand: [1, 1, 1], sit: [1, 1, 1], curl: [1.12, 0.86, 0.95] };

export function makeNova({ lights = 'both' } = {}) {
  const R = rng(1311);
  const root = new THREE.Group(); root.name = 'Nova';
  const rig = new THREE.Group(); root.add(rig);
  const mats = [];
  const M = m => { m.userData.keepGlow = true; mats.push(m); return m; };
  const headMap = headTexture(), bodyMap = furTexture(7, 80), tailMap = furTexture(19, 40);
  const furMat = (map, k = 0.5) => M(new THREE.MeshStandardMaterial({ map, roughness: 1, emissive: 0xffffff, emissiveMap: glowMapFrom(map), emissiveIntensity: k }));
  const headM = furMat(headMap, 0.55), bodyM = furMat(bodyMap, 0.5), tailM = furMat(tailMap, 0.45);
  const plain = M(new THREE.MeshStandardMaterial({ color: FUR_HEX, roughness: 1, emissive: 0x0a1238, emissiveIntensity: 0.6 }));
  const paw = M(new THREE.MeshStandardMaterial({ color: 0x141b3e, roughness: 1, emissive: 0x070c28, emissiveIntensity: 0.6 }));
  const muzzle = M(new THREE.MeshStandardMaterial({ color: 0x2a3670, roughness: 1, emissive: 0x0c1440, emissiveIntensity: 0.6 }));
  const chin = M(new THREE.MeshStandardMaterial({ color: 0x6b7396, roughness: 1, emissive: 0x161c3a, emissiveIntensity: 0.5 }));
  const cream = M(new THREE.MeshStandardMaterial({ color: 0xe9d2a6, roughness: 1, emissive: 0x3a2a10, emissiveIntensity: 0.5, side: THREE.DoubleSide }));
  const nodes = {};
  const node = (name, parent = rig) => { const g = new THREE.Group(); parent.add(g); nodes[name] = g; return g; };
  const sph = (r, w = 24, h = 16) => new THREE.SphereGeometry(r, w, h);

  // torso (+ heart core on the chest)
  const torso = node('torso');
  const torsoMesh = mesh(jitter(sph(1, 28, 18), 0.03, R), bodyM, 0, 0, 0, torso); torsoMesh.scale.set(0.27, 0.27, 0.38);
  const bellyFluff = mesh(jitter(sph(1, 16, 12), 0.05, R), plain, 0, -0.05, 0.2, torso); bellyFluff.scale.set(0.22, 0.22, 0.25);
  const heartShape = new THREE.Shape();
  heartShape.moveTo(0, -0.5); heartShape.bezierCurveTo(-0.15, -0.3, -0.62, -0.05, -0.55, 0.28); heartShape.bezierCurveTo(-0.5, 0.58, -0.12, 0.62, 0, 0.32);
  heartShape.bezierCurveTo(0.12, 0.62, 0.5, 0.58, 0.55, 0.28); heartShape.bezierCurveTo(0.62, -0.05, 0.15, -0.3, 0, -0.5);
  const heartGeo = new THREE.ExtrudeGeometry(heartShape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 3, curveSegments: 14 }); heartGeo.center();
  const heartMat = M(new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffbe3c, emissiveIntensity: 2.4, roughness: 0.35 }));
  const chest = new THREE.Group(); chest.position.set(0, -0.15, 0.36); chest.rotation.x = 0.62; torso.add(chest); // faces forward when sitting
  const heart = mesh(heartGeo, heartMat, 0, 0, 0.0, chest); heart.scale.setScalar(0.19);
  const heartHalo = glowSprite(0.75, 0xffc860, 0.8); heartHalo.material.userData.keepGlow = true; heartHalo.position.z = 0.04; chest.add(heartHalo);
  let coreLight = null;
  if (lights === 'both') { coreLight = new THREE.PointLight(0xffc870, 2, 3.2, 1.6); coreLight.position.z = 0.18; chest.add(coreLight); }

  // neck + scarf (red and gold, same stripes as Lorenz)
  const neck = node('neck');
  const stripes = canvasTexture(256, 32, (g, w, h) => { for (let i = 0; i < 11; i++) { g.fillStyle = i % 2 ? '#e8c15a' : '#c62f37'; g.fillRect(i * w / 11, 0, w / 11 + 1, h); } });
  stripes.wrapS = THREE.RepeatWrapping;
  const scarfMat = M(new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.9, side: THREE.DoubleSide, emissive: 0x2a0c08, emissiveIntensity: 0.6 }));
  stripes.repeat.set(2, 1); const wrap = mesh(new THREE.TorusGeometry(0.2, 0.058, 10, 28), scarfMat, 0, 0, 0, neck); wrap.rotation.x = Math.PI / 2; wrap.scale.z = 0.75;
  const endTex = stripes.clone(); endTex.rotation = Math.PI / 2; endTex.center.set(.5, .5); endTex.repeat.set(1, 0.6); endTex.needsUpdate = true;
  const endMat = M(new THREE.MeshStandardMaterial({ map: endTex, roughness: .9, side: THREE.DoubleSide, emissive: 0x2a0c08, emissiveIntensity: 0.6 }));
  const fringeMat = M(new THREE.MeshStandardMaterial({ color: 0xe8c15a, roughness: .7, emissive: 0x6b4f12, emissiveIntensity: 0.6 }));
  const ends = new THREE.Group(); ends.position.set(-0.15, -0.02, 0.14); neck.add(ends);
  for (const [i, a] of [[0, 0.12], [1, -0.18]]) {
    const e = mesh(new THREE.BoxGeometry(0.1, 0.36, 0.03), endMat, -i * 0.07, -0.17, 0.02 * i, ends); e.rotation.z = a;
    mesh(new THREE.BoxGeometry(0.11, 0.04, 0.035), fringeMat, -i * 0.07 + Math.sin(a) * 0.18, -0.36, 0.02 * i, ends);
  }

  // head
  const head = node('head');
  const skull = mesh(jitter(sph(0.3, 40, 28), 0.012, R), headM, 0, 0, 0, head); skull.scale.set(1.02, 0.93, 0.95);
  for (const s of [-1, 1]) { // cheek ruffs
    for (let k = 0; k < 2; k++) { const c = mesh(new THREE.ConeGeometry(0.055, 0.15, 6), plain, s * (0.255 + k * 0.01), -0.1 - k * 0.06, 0.0 - k * 0.03, head); c.rotation.set(0, 0, s * (-1.95 + k * 0.3)); }
  }
  for (let k = 0; k < 3; k++) { const c = mesh(new THREE.ConeGeometry(0.03, 0.09, 5), plain, (k - 1) * 0.045, 0.265, -0.06, head); c.rotation.set(-0.5, 0, (k - 1) * -0.4); } // crown tuft
  const snout = mesh(sph(1, 18, 12), muzzle, 0, -0.09, 0.24, head); snout.scale.set(0.12, 0.09, 0.15);
  const chinM = mesh(sph(1, 14, 10), chin, 0, -0.16, 0.2, head); chinM.scale.set(0.1, 0.05, 0.09);
  mesh(sph(0.032, 12, 8), M(new THREE.MeshStandardMaterial({ color: 0x07070c, roughness: 0.25 })), 0, -0.05, 0.375, head).scale.set(1.25, 0.85, 1);
  const smile = mesh(new THREE.TorusGeometry(0.03, 0.006, 4, 10, Math.PI), M(new THREE.MeshBasicMaterial({ color: 0x0a0a16 })), 0, -0.14, 0.355, head); smile.rotation.z = Math.PI;
  const eyes = [];
  const irisM = M(new THREE.MeshStandardMaterial({ color: 0xe08a1e, emissive: 0xb85e10, emissiveIntensity: 0.9, roughness: 0.25 }));
  const pupilM = M(new THREE.MeshStandardMaterial({ color: 0x120804, roughness: 0.2 }));
  const hiM = M(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const rimM = M(new THREE.MeshStandardMaterial({ color: 0x0a0d22, roughness: 1 }));
  for (const s of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(s * 0.115, 0.02, 0.235); e.rotation.y = s * 0.38; head.add(e);
    mesh(sph(0.088, 18, 14), rimM, 0, 0, -0.012, e).scale.set(1.08, 1.08, 0.55);
    mesh(sph(0.08, 20, 16), irisM, 0, 0, 0, e).scale.set(1, 1.02, 0.6);
    mesh(sph(0.046, 14, 10), pupilM, 0, -0.004, 0.034, e).scale.set(1, 1.1, 0.5);
    mesh(sph(0.02, 8, 6), hiM, s * -0.022, 0.03, 0.05, e);
    mesh(sph(0.009, 6, 4), hiM, s * 0.02, -0.025, 0.05, e);
    eyes.push(e);
  }
  const ears = [];
  for (const s of [-1, 1]) {
    const ear = new THREE.Group(); ear.position.set(s * 0.15, 0.17, -0.02); ear.rotation.set(-0.08, 0, -s * 0.33); head.add(ear);
    const outer = mesh(earGeo(0.25, 0.32, 0.05), plain, 0, 0, 0, ear);
    const inner = mesh(earGeo(0.16, 0.22, 0.02), cream, 0, 0.035, 0.03, ear);
    for (let k = 0; k < 3; k++) { const f = mesh(new THREE.ConeGeometry(0.016, 0.09, 4), cream, (k - 1) * 0.035, 0.03, 0.05, ear); f.rotation.set(0.5, 0, (k - 1) * -0.3); }
    ears.push(ear);
  }

  // legs
  const legs = {};
  for (const id of ['fl', 'fr', 'hl', 'hr']) {
    const leg = node(id); const hind = id[0] === 'h';
    if (hind) { const th = mesh(jitter(sph(1, 14, 10), 0.06, R), bodyM, 0, -0.05, 0.02, leg); th.scale.set(0.11, 0.17, 0.16); }
    mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.36, 10), plain, 0, -0.2, 0, leg);
    const p = mesh(sph(1, 12, 8), paw, 0, -0.39, 0.025, leg); p.scale.set(0.07, 0.045, 0.085);
    legs[id] = leg;
  }

  // tail: 6 fluffy segments, the last one fading into the glowing tip
  const tail = node('tail');
  const segs = []; let parent = tail;
  const radii = [0.08, 0.11, 0.14, 0.16, 0.165, 0.15];
  const gradMap = tailGradient();
  const gradM = M(new THREE.MeshStandardMaterial({ map: gradMap, emissive: 0xffffff, emissiveMap: gradMap, emissiveIntensity: 0.7, roughness: 1 }));
  radii.forEach((r, i) => {
    const s = new THREE.Group(); s.position.z = i === 0 ? 0 : -0.14; parent.add(s); segs.push(s); parent = s;
    const last = i === radii.length - 1;
    const geo = jitter(sph(1, 16, 12), 0.08, R); geo.rotateX(-Math.PI / 2); // pole -> -z so the gradient runs along the tail
    const m = mesh(geo, last ? gradM : tailM, 0, 0, -0.08, s); m.scale.set(r, r, 0.17);
    for (let k = 0; k < (i > 1 ? 5 : 2); k++) { // fur tufts
      const a = k / 5 * Math.PI * 2 + i, tf = mesh(new THREE.ConeGeometry(r * 0.3, r * 0.6, 5), last ? gradM : plain, Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75, -0.09, s);
      tf.rotation.set(0, 0, a - Math.PI / 2); tf.rotateX(-0.5); // point outward, swept back
    }
  });
  // the glowing tip (fur lit from within)
  const tipG = new THREE.Group(); tipG.position.z = -0.21; segs[segs.length - 1].add(tipG);
  const tipMat = M(new THREE.MeshStandardMaterial({ color: 0xfff0c4, emissive: 0xffc04a, emissiveIntensity: 2.2, roughness: 0.6 }));
  const tipGeo = jitter(sph(1, 16, 12), 0.12, R);
  const tip = mesh(tipGeo, tipMat, 0, 0, -0.04, tipG); tip.scale.set(0.12, 0.12, 0.17);
  for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; const f = mesh(new THREE.ConeGeometry(0.04, 0.16, 4), tipMat, Math.cos(a) * 0.06, Math.sin(a) * 0.06, -0.12, tipG); f.rotation.set(0, 0, a - Math.PI / 2); f.rotateX(-0.9); }
  const tipHalo = glowSprite(1.0, 0xffcc66, 0.9); tipHalo.material.userData.keepGlow = true; tipHalo.position.z = -0.07; tipG.add(tipHalo);
  const tipHalo2 = glowSprite(0.42, 0xfff3d0, 0.9); tipHalo2.material.userData.keepGlow = true; tipHalo2.position.z = -0.07; tipG.add(tipHalo2);
  const tipLight = new THREE.PointLight(0xffc46a, 2.5, 4, 1.6); tipLight.position.z = -0.1; tipG.add(tipLight);

  // little ball of light, used when she travels between islands
  const orb = new THREE.Group(); orb.visible = false; root.add(orb);
  const orbCore = mesh(new THREE.IcosahedronGeometry(0.3, 2), M(new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffe39a, emissiveIntensity: 2.4 })), 0, 0, 0, orb);
  const orbHalo = glowSprite(3.2, 0xffe6a0, 0.95); orbHalo.material.userData.keepGlow = true; orb.add(orbHalo);

  root.traverse(o => { if (o.isMesh) o.userData.nova = true; });

  // ---------- animation state ----------
  const w = { stand: 0, sit: 1, curl: 0 }, want = { stand: 0, sit: 1, curl: 0 };
  const A = { walk: 0, walkPhase: 0, look: null, lookAmt: 0, tilt: 0, tiltT: 0, blinkT: 2, blink: 0, earT: [3, 5], ear: [0, 0], glow: 1, nightLight: 0, yaw: 0, pitch: 0 };
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const R2 = rng(4242);
  function setPose(name) { for (const k in want) want[k] = k === name ? 1 : 0; }
  function blendNode(name, out) {
    for (let i = 0; i < 6; i++) out[i] = P.stand[name][i] * w.stand + P.sit[name][i] * w.sit + P.curl[name][i] * w.curl;
    return out;
  }
  const buf = [0, 0, 0, 0, 0, 0];
  function update(t, dt, { camera, moving = false, speed = 0 } = {}) {
    // ease pose weights
    const k = Math.min(1, dt * 2.4);
    for (const n in w) w[n] += (want[n] - w[n]) * k;
    const sum = w.stand + w.sit + w.curl; for (const n in w) w[n] /= sum;
    A.walk += ((moving ? 1 : 0) - A.walk) * Math.min(1, dt * 6);
    A.walkPhase += dt * (4 + speed * 7) * (moving ? 1 : 0.0);
    const breath = Math.sin(t * (w.curl > 0.5 ? 1.3 : 2.1));
    for (const name of ['torso', 'neck', 'head', 'fl', 'fr', 'hl', 'hr', 'tail']) {
      const b = blendNode(name, buf), n = nodes[name];
      n.position.set(b[0], b[1], b[2]); n.rotation.set(b[3], b[4], b[5]);
    }
    const ts = TORSO_SCALE; for (let i = 0; i < 3; i++) torso.scale.setComponent(i, ts.stand[i] * w.stand + ts.sit[i] * w.sit + ts.curl[i] * w.curl);
    nodes.tail.scale.setScalar(1 + 0.3 * w.curl);
    torso.scale.y *= 1 + breath * 0.025; torso.scale.x *= 1 + breath * 0.018;
    nodes.head.position.y += breath * 0.006;
    // walk cycle (trot): diagonal pairs swing together
    const wk = A.walk * w.stand, ph = A.walkPhase;
    legs.fl.rotation.x += Math.sin(ph) * 0.55 * wk; legs.hr.rotation.x += Math.sin(ph) * 0.5 * wk;
    legs.fr.rotation.x += Math.sin(ph + Math.PI) * 0.55 * wk; legs.hl.rotation.x += Math.sin(ph + Math.PI) * 0.5 * wk;
    rig.position.y = Math.abs(Math.sin(ph)) * 0.035 * wk;
    torso.rotation.z += Math.sin(ph) * 0.03 * wk;
    // tail: sway (lazy when sitting, bouncy when walking, a slow drift asleep)
    const sway = w.curl > 0.5 ? 0.04 : 0.16 + 0.1 * wk;
    segs.forEach((s, i) => {
      s.rotation.x = P.stand.bendX[i] * w.stand + P.sit.bendX[i] * w.sit + P.curl.bendX[i] * w.curl + Math.sin(t * 5 + i * 0.6) * 0.05 * wk;
      s.rotation.y = P.stand.bendY[i] * w.stand + P.sit.bendY[i] * w.sit + P.curl.bendY[i] * w.curl + Math.sin(t * (1.6 + wk * 3) - i * 0.55) * sway * (0.4 + i * 0.12);
    });
    // head: look at a point (world), with a curious tilt now and then
    let yaw = 0, pitch = 0;
    if (A.look && w.curl < 0.6) {
      nodes.head.parent.worldToLocal(tmp.copy(A.look)); tmp.sub(nodes.head.position);
      yaw = THREE.MathUtils.clamp(Math.atan2(tmp.x, tmp.z), -1.0, 1.0);
      pitch = THREE.MathUtils.clamp(-Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)), -0.5, 0.45);
      if (Math.abs(Math.atan2(tmp.x, tmp.z)) > 1.9) { yaw = 0; pitch = 0; } // too far behind: don't break her neck
    } else { yaw = Math.sin(t * 0.37) * 0.35 * (1 - w.curl); pitch = Math.sin(t * 0.23) * 0.08; }
    A.yaw += (yaw - A.yaw) * Math.min(1, dt * 3); A.pitch += (pitch - A.pitch) * Math.min(1, dt * 3);
    A.tiltT -= dt; if (A.tiltT < 0) { A.tiltT = 3 + R2() * 6; A.tilt = R2() < 0.55 ? (R2() < 0.5 ? -1 : 1) * (0.22 + R2() * 0.18) : 0; }
    const curious = 1 - w.curl;
    nodes.head.rotation.y += A.yaw * curious; nodes.head.rotation.x += A.pitch * curious;
    nodes.head.rotation.z += (nodes.head.userData.tilt = (nodes.head.userData.tilt || 0) + (A.tilt - (nodes.head.userData.tilt || 0)) * Math.min(1, dt * 2.5)) * curious;
    nodes.neck.rotation.y = A.yaw * 0.4 * curious;
    // blink (eyes closed while curled up asleep)
    A.blinkT -= dt; if (A.blinkT < 0) { A.blinkT = 2 + R2() * 4; A.blink = 0.16; }
    A.blink = Math.max(0, A.blink - dt);
    const closed = Math.max(A.blink > 0 ? Math.sin(A.blink / 0.16 * Math.PI) : 0, THREE.MathUtils.smoothstep(w.curl, 0.5, 0.9));
    eyes.forEach(e => { e.scale.y = Math.max(0.08, 1 - closed * 0.92); });
    // ear twitches
    for (let i = 0; i < 2; i++) {
      A.earT[i] -= dt; if (A.earT[i] < 0) { A.earT[i] = 2.5 + R2() * 6; A.ear[i] = 0.35; }
      A.ear[i] = Math.max(0, A.ear[i] - dt);
      const tw = A.ear[i] > 0 ? Math.sin(A.ear[i] / 0.35 * Math.PI * 2) * 0.35 : 0;
      const s = i ? 1 : -1;
      ears[i].rotation.set(-0.08 + tw * 0.4 - w.curl * 0.4, s * 0.3 + tw * s * 0.5, -s * (0.33 + w.curl * 0.1));
    }
    ends.rotation.x = -nodes.neck.rotation.x * (1 - w.curl) + wk * (0.3 + Math.sin(t * 9) * 0.1) + Math.sin(t * 1.4) * 0.04;
    // glow: stronger at night; a soft night-light while she sleeps
    A.nightLight += ((w.curl > 0.6 ? 1 : 0) - A.nightLight) * Math.min(1, dt * 0.8);
    const g = (0.5 + 0.6 * DAY.night) * (1 - 0.3 * A.nightLight);
    const pulse = 1 + Math.sin(t * (A.nightLight > 0.5 ? 1.3 : 2.6)) * 0.08;
    tipMat.emissiveIntensity = 2.2 * g * pulse; gradM.emissiveIntensity = 0.75 * g * pulse;
    tipHalo.material.opacity = 0.75 * g * pulse; tipHalo2.material.opacity = 0.8 * Math.min(1, g * 1.1); tipHalo.scale.setScalar(0.9 + 0.5 * DAY.night);
    tipLight.intensity = 2.6 * g * pulse * (0.4 + 0.6 * DAY.night);
    const hp = 1 + Math.sin(t * 2.4) * 0.1;
    heartMat.emissiveIntensity = (1.6 + 1.6 * DAY.night) * hp * (1 - 0.4 * A.nightLight); heartHalo.material.opacity = 0.65 * g * hp * (1 - 0.6 * w.curl);
    if (coreLight) coreLight.intensity = 1.6 * g * hp * (0.4 + 0.6 * DAY.night) * (1 - 0.7 * w.curl);
    orbHalo.material.opacity = 0.95; orbCore.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
  }
  root.userData = { rig, orb, nodes, setPose, weights: w };
  const api = { root, rig, orb, update, setPose, weights: w, anim: A, tipWorld: v => tipG.getWorldPosition(v), materials: mats };
  return api;
}

// =====================================================================
// Outdoors: wander, sit with Lorenz, curl up at night, hop between islands
// as a ball of light (along the gold threads).
// =====================================================================
export function novaBrain(nova, { scene, islands, hearth, lorenz, avoidHearth = [], pond, lorenzBed, scale = 1.3, flat = () => false, feast = null }) {
  const R = rng(1111);
  const root = nova.root; root.scale.setScalar(scale);
  let isl = hearth; isl.group.add(root);
  const pos = root.position; pos.set(1.6, 0.02, 2.2);
  let heading = -0.6, target = null, pause = 2, mode = 'idle', why = 'Looking around the Hearth';
  let travel = null, goal = hearth, lastOrder = -1e9, roamT = 40, stayT = 0;
  const ray = new THREE.Raycaster(); const down = new THREE.Vector3(0, -1, 0);
  const o = new THREE.Vector3(), q = new THREE.Vector3();
  const meshCache = new Map();
  const meshesOf = g => { if (!meshCache.has(g) || meshCache.get(g).t < performance.now() - 15000) { const l = []; g.traverse(m => { if (m.isMesh && !m.userData.nova && !m.userData.lorenz && !(m.material && m.material.transparent)) l.push(m); }); meshCache.set(g, { l, t: performance.now() }); } return meshCache.get(g).l; };
  // free spot test (island-local x,z): nothing standing there, not in water, inside the island
  function freeAt(I, x, z) {
    if (Math.hypot(x, z) > I.r * 0.78) return false;
    if (I === hearth) {
      if (avoidHearth.some(a => Math.hypot(x - a.x, z - a.z) < a.r + 0.35)) return false;
      if (Math.hypot(x - pond.x, z - pond.z) < pond.r + 0.55) return false;
    }
    I.group.updateMatrixWorld();
    o.set(x, 8, z); I.group.localToWorld(o); down.set(0, -1, 0).transformDirection(I.group.matrixWorld); ray.set(o, down); ray.far = 12;   // "down" is the island's own -y (on the planet it points at the centre)
    const h = ray.intersectObjects(meshesOf(I.group), false)[0];
    if (!h) return false;
    q.copy(h.point); I.group.worldToLocal(q);
    return q.y < 0.16;
  }
  function pathFree(I, x0, z0, x1, z1) { for (let k = 1; k <= 8; k++) { const f = k / 8; if (!freeAt(I, x0 + (x1 - x0) * f, z0 + (z1 - z0) * f)) return false; } return true; }
  function pickSpot(I, near = null, tries = 24) {
    for (let k = 0; k < tries; k++) {
      let x, z;
      if (near) { const a = R() * Math.PI * 2, r = 0.9 + R() * 0.4; x = near.x + Math.cos(a) * r; z = near.z + Math.sin(a) * r; }
      else { const a = R() * Math.PI * 2, r = Math.sqrt(R()) * I.r * 0.7; x = Math.cos(a) * r; z = Math.sin(a) * r; }
      if (freeAt(I, x, z) && (I !== isl || pathFree(I, pos.x, pos.z, x, z))) return new THREE.Vector3(x, 0, z);
    }
    return null;
  }
  const lorenzLocal = () => lorenz.position; // Lorenz lives in the Hearth group too
  const feastOn = () => !!(feast && feast.active && feast.active());
  const feastSeat = () => feast && feast.seat && feast.seat();
  function goToFeastSeat() {
    const seat = feastSeat(); if (!seat || isl !== hearth) return false;
    target = new THREE.Vector3(seat.x, 0, seat.z);
    mode = 'toFeast'; why = 'Going to sit down with Lorenz for Thanksgiving';
    return true;
  }
  function sitAtFeast() {
    const seat = feastSeat(); if (!seat) return;
    pos.set(seat.x, seat.y ?? 0.52, seat.z);
    heading = seat.heading ?? heading;
    mode = 'feast'; why = FEAST_WHY; pause = 1e9; target = null;
  }
  function nextActivity() {
    const night = DAY.night > 0.6;
    if (feastOn() && !night) { if (goToFeastSeat()) return; }
    if (isl === hearth && night) {
      const spot = lorenzBed.clone();
      if (freeAt(hearth, spot.x, spot.z) && pathFree(hearth, pos.x, pos.z, spot.x, spot.z)) { target = spot; mode = 'toBed'; why = 'Heading to bed next to Lorenz'; return; }
      const s2 = pickSpot(hearth, lorenzBed) || pickSpot(hearth); if (s2) { lorenzBed.copy(s2); target = s2; mode = 'toBed'; why = 'Heading to bed'; return; }
    }
    if (isl === hearth && R() < 0.38) {
      const L = lorenzLocal();
      const inPond = Math.hypot(L.x - pond.x, L.z - pond.z) < pond.r;
      const s = !inPond && pickSpot(hearth, L, 16);
      if (s) { target = s; mode = 'toLorenz'; why = 'Going to sit with Lorenz'; return; }
    }
    target = pickSpot(isl); mode = target ? 'walk' : 'idle';
    why = isl === hearth ? 'Wandering around the Hearth' : `Exploring ${isl.data.name}`;
    if (!target) pause = 2;
  }
  function startTravel(dest) {
    if (dest === isl || travel) return;
    const from = root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.6, 0));
    travel = { t: 0, phase: 'leave', from, dest, spot: null };
    why = `Flying to ${dest.data.name} as a ball of light`;
  }
  function tick(t, dt, { camera } = {}) {
    // orders from the visitor (visit / home) win; otherwise she roams a little by day
    if (goal !== isl && !travel) startTravel(goal);
    if (!travel && t - lastOrder > 90) {
      roamT -= dt;
      if (isl !== hearth) { stayT -= dt; if (stayT < 0 || DAY.night > 0.6 || feastOn()) goal = hearth; }
      else if (roamT < 0 && !feastOn()) { roamT = 50 + R() * 60; if (DAY.night < 0.4 && R() < 0.5) { const others = islands.filter(i => i !== hearth); goal = others[Math.floor(R() * others.length)]; stayT = 25 + R() * 30; } }
    }
    if (travel) return doTravel(t, dt);
    let moving = false, speed = 0;
    const night = DAY.night > 0.6;
    if (night && isl === hearth && mode !== 'toBed' && mode !== 'sleep') { pause = 0; target = null; nextActivity(); }
    if (!night && mode === 'sleep') { mode = 'idle'; pause = 1.2; why = 'Waking up and stretching'; }
    if (feastOn() && !night && isl === hearth && mode !== 'toFeast' && mode !== 'feast' && !travel) { pause = 0; target = null; goToFeastSeat(); }
    if (!feastOn() && (mode === 'feast' || mode === 'toFeast')) { mode = 'idle'; pause = 0.6; target = null; why = 'Leaving the harvest table'; pos.y = 0.02; }
    if (pause > 0 && mode !== 'feast') pause -= dt;
    else if (mode === 'feast') { const seat = feastSeat(); if (seat) { pos.x = seat.x; pos.z = seat.z; pos.y = seat.y ?? 0.52; heading = seat.heading ?? heading; } }
    else if (!target) nextActivity();
    else {
      const dx = target.x - pos.x, dz = target.z - pos.z, d = Math.hypot(dx, dz);
      if (d < 0.08) {
        target = null;
        if (mode === 'toBed') { mode = 'sleep'; why = 'Curled up asleep next to Lorenz, tail on night-light mode'; pause = 1e9; }
        else if (mode === 'toFeast') sitAtFeast();
        else if (mode === 'toLorenz') { mode = 'withLorenz'; pause = 7 + R() * 8; why = 'Sitting with Lorenz'; }
        else { mode = 'idle'; pause = 3 + R() * 6; why = isl === hearth ? 'Sitting on the Hearth, watching' : `Looking around ${isl.data.name}`; }
      } else {
        const want = Math.atan2(dx, dz); let diff = want - heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        heading += diff * Math.min(1, dt * 4);
        if (Math.abs(diff) < 1.2) { speed = Math.min(0.85, d * 1.5 + 0.2); const st = speed * dt / scale * 1.3; pos.x += Math.sin(heading) * Math.min(st, d); pos.z += Math.cos(heading) * Math.min(st, d); moving = true; }
      }
    }
    if (mode === 'withLorenz' && pause > 0) { // face roughly the same way as Lorenz, beside him
      const L = lorenzLocal(); const want = Math.atan2(L.x - pos.x, L.z - pos.z) - 0.9; let diff = want - heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); heading += diff * Math.min(1, dt * 2);
    }
    root.rotation.y = heading;
    pos.y = 0.02;
    nova.setPose(moving ? 'stand' : mode === 'sleep' ? 'curl' : 'sit');
    // what she looks at
    let look = null;
    const lw = lorenz.localToWorld(new THREE.Vector3(0, 0.6 / (lorenz.scale.y || 1), 0));
    const me = root.getWorldPosition(new THREE.Vector3());
    if (camera && camera.position.distanceTo(me) < 9 && !moving) look = camera.position.clone();
    else if (isl === hearth && lw.distanceTo(me) < 5) look = lw;
    else if (moving && target) { look = isl.group.localToWorld(target.clone().setY(0.8)); }
    nova.anim.look = look;
    nova.update(t, dt, { camera, moving, speed });
    return { moving };
  }
  function doTravel(t, dt) {
    const T = travel; T.t += dt;
    const dur = { leave: 0.7, arrive: 0.8 };
    if (T.phase === 'leave') {
      const k = Math.min(1, T.t / dur.leave);
      nova.rig.scale.setScalar(Math.max(0.001, 1 - k)); nova.orb.visible = true; nova.orb.position.set(0, 0.6, 0); nova.orb.scale.setScalar(0.2 + 0.8 * k);
      nova.update(t, dt, {});
      if (k >= 1) {
        T.spot = pickSpot(T.dest, null, 40) || new THREE.Vector3(0, 0, 1.5);
        scene.attach(root); T.phase = 'fly'; T.t = 0; nova.rig.visible = false;
        T.p0 = root.position.clone();
        T.flyDur = THREE.MathUtils.clamp(T.p0.distanceTo(T.dest.group.position) / (flat() ? 40 : 16), 1.4, flat() ? 9 : 5);
      }
      return { moving: false };
    }
    if (T.phase === 'fly') {
      const k = Math.min(1, T.t / T.flyDur), e = k * k * (3 - 2 * k);
      const p1 = T.dest.group.localToWorld(T.spot.clone()).multiplyScalar(1);
      if (flat()) {   // in the flat realm: a plain arc through the air, higher for longer hops
        const L = T.p0.distanceTo(p1); root.position.lerpVectors(T.p0, p1, e); root.position.y += Math.sin(Math.PI * e) * (6 + 0.08 * L); root.quaternion.identity();
        nova.orb.position.set(0, 0.6 + Math.sin(T.t * 6) * 0.05, 0); nova.update(t, dt, {});
        if (k >= 1) { isl = T.dest; isl.group.attach(root); pos.copy(T.spot).setY(0.02); root.rotation.set(0, heading, 0); root.scale.setScalar(scale); T.phase = 'arrive'; T.t = 0; nova.rig.visible = true; }
        return { moving: false };
      }
      // arc around the planet: blend direction about the centre, lift in the middle
      const l0 = T.p0.length(), l1 = p1.length(), q = new THREE.Quaternion().setFromUnitVectors(T.p0.clone().divideScalar(l0), p1.clone().divideScalar(l1));
      const dir = T.p0.clone().divideScalar(l0).applyQuaternion(new THREE.Quaternion().slerp(q, e));
      root.position.copy(dir).multiplyScalar(l0 + (l1 - l0) * e + Math.sin(Math.PI * e) * (4 + 0.12 * T.p0.distanceTo(p1)));
      root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      nova.orb.position.set(0, 0.6 + Math.sin(T.t * 6) * 0.05, 0);
      nova.update(t, dt, {});
      if (k >= 1) {
        isl = T.dest; isl.group.attach(root); pos.copy(T.spot).setY(0.02); root.rotation.set(0, heading, 0); root.scale.setScalar(scale);
        T.phase = 'arrive'; T.t = 0; nova.rig.visible = true;
      }
      return { moving: false };
    }
    const k = Math.min(1, T.t / dur.arrive);
    nova.rig.scale.setScalar(Math.max(0.001, k)); nova.orb.scale.setScalar(Math.max(0.001, 1 - k)); nova.setPose('sit');
    nova.update(t, dt, {});
    if (k >= 1) { nova.orb.visible = false; travel = null; target = null; if (feastOn() && isl === hearth) sitAtFeast(); else { mode = 'idle'; pause = 2 + R() * 2; why = isl === hearth ? 'Back home on the Hearth' : `Just arrived on ${isl.data.name}`; } }
    return { moving: false };
  }
  return {
    tick,
    goTo(I, t) { if (I) { goal = I; lastOrder = t ?? 0; } },
    get island() { return isl; },
    get status() { return why; },
    get mode() { return travel ? 'travel' : mode; },
    get goal() { return goal; },
    worldPos(v = new THREE.Vector3()) { return root.getWorldPosition(v); },
    teleport(I, spot) { if (travel) travel = null; nova.orb.visible = false; nova.rig.visible = true; nova.rig.scale.setScalar(1); isl = I; goal = I; I.group.add(root); root.rotation.set(0, heading, 0); root.scale.setScalar(scale); pos.copy(spot || pickSpot(I, null, 40) || new THREE.Vector3(0, 0, 1)).setY(0.02); target = null; mode = 'idle'; pause = 3; },
    seatNow() { if (travel) travel = null; nova.orb.visible = false; nova.rig.visible = true; nova.rig.scale.setScalar(1); isl = hearth; goal = hearth; hearth.group.add(root); root.scale.setScalar(scale); sitAtFeast(); root.rotation.set(0, heading, 0); },
    freeAt,
  };
}

// =====================================================================
// Indoors: Nova on the Window Seat. Watches visitors, looks out at the sky,
// curls up on the cushion at night.
// =====================================================================
export function novaIndoors(nova, { parent, x, y, z, ry = 0, scale = 0.36 }) {
  const root = nova.root; parent.add(root); root.position.set(x, y, z); root.rotation.y = ry; root.scale.setScalar(scale);
  let why = 'Sitting on the Window Seat';
  return {
    tick(t, dt, { camera } = {}) {
      const night = DAY.night > 0.6;
      nova.setPose(night ? 'curl' : 'sit');
      const me = root.getWorldPosition(new THREE.Vector3());
      const near = camera && camera.position.distanceTo(me) < 3.6;
      // look at the visitor, or now and then out of the round window behind her
      const outside = Math.sin(t * 0.13) > 0.55;
      nova.anim.look = near ? camera.position.clone() : outside ? root.localToWorld(new THREE.Vector3(1.6, 3.5, -0.6)) : null;
      why = night ? 'Curled up on the Window Seat cushion, tail glowing like a night-light' : near ? 'Saying hi to you from the Window Seat' : 'Watching the sky from the Window Seat';
      nova.update(t, dt, { camera });
    },
    get status() { return why; },
    root,
  };
}

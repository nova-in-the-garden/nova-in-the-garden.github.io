// Nova's Arcade: a giant hollow tree on its own island (exterior) and the
// walk-in hall of cabinet bays inside it (interior, its own small scene).
// Everything about the games comes from data/arcade.json: wings are the
// treehouse rooms on the tree's branches, and every wing has numbered bays.
// Adding a game or a wing = editing that file (see games/README.md).
import * as THREE from 'three';
import { rng, rule90, mat, glow, mesh, jitter, glowSprite, glowTexture, canvasTexture, mergeStatic } from './util.js';
import { DAY } from './daylight.js';
import { makeNova } from './novabody.js';

const UP = new THREE.Vector3(0, 1, 0);
// a tapered cylinder from a to b (radius r0 at a, r1 at b)
function limb(a, b, r0, r1, material, parent, seg = 7) {
  const d = new THREE.Vector3().subVectors(b, a); const len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, seg, 2), material);
  m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(UP, d.normalize()); parent.add(m); return m;
}
// points along a sagging string between a and b
function sag(a, b, drop, n, out) {
  for (let i = 0; i <= n; i++) { const k = i / n; out.push(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k - Math.sin(k * Math.PI) * drop, a.z + (b.z - a.z) * k); }
}
function archShape(w, h, sh = new THREE.Shape(), hole = false) {
  // w = width, h = straight side height, half circle on top
  const r = w / 2; const p = hole ? new THREE.Path() : sh;
  p.moveTo(-r, 0); p.lineTo(-r, h); p.absarc(0, h, r, Math.PI, 0, true); p.lineTo(r, 0); p.lineTo(-r, 0);
  return p;
}
export const arcadeColor = c => new THREE.Color(c || '#e8c15a');

// =====================================================================
// Exterior: the giant tree
// =====================================================================
export function buildArcadeTree(parent, data, { rot = 0 } = {}) {
  const g = new THREE.Group(); g.rotation.y = rot; parent.add(g);
  const R = rng(1190);
  const barkTex = canvasTexture(128, 256, (c, w, h) => {
    c.fillStyle = '#5b3b25'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { const x = R() * w; c.strokeStyle = R() < 0.5 ? 'rgba(30,16,8,.55)' : 'rgba(140,96,60,.35)'; c.lineWidth = 1 + R() * 3; c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + (R() - .5) * 18, h / 3, x + (R() - .5) * 18, 2 * h / 3, x + (R() - .5) * 10, h); c.stroke(); }
    for (let i = 0; i < 6; i++) { const x = R() * w, y = R() * h; c.fillStyle = 'rgba(25,12,6,.7)'; c.beginPath(); c.ellipse(x, y, 4 + R() * 4, 7 + R() * 6, 0, 0, 7); c.fill(); }
  });
  barkTex.wrapS = barkTex.wrapT = THREE.RepeatWrapping; barkTex.repeat.set(5, 2);
  const bark = new THREE.MeshStandardMaterial({ map: barkTex, roughness: 1, flatShading: true });
  const barkDark = mat(0x3e2818), wood = mat(0x6b4426), woodLight = mat(0x8a5a34), gold = mat(0xe8c15a, { metalness: .45, roughness: .4 }), red = mat(0xb32d35), navy = mat(0x1c2550), stone = mat(0x6d6680);

  // ---- trunk: a lathe with a flared foot, slightly lumpy
  const prof = [[0.01, -0.6], [3.9, -0.6], [3.75, 0.05], [3.35, 0.6], [3.15, 1.6], [3.0, 3.2], [2.85, 5], [2.7, 7], [2.85, 8.6], [3.3, 9.7], [3.0, 10.6], [0.01, 11.0]].map(([r, y]) => new THREE.Vector2(r, y));
  mesh(jitter(new THREE.LatheGeometry(prof, 22), 0.16, R), bark, 0, 0, 0, g);
  // roots spread out on the sides and back (the front stays clear for the door)
  for (const a of [0.85, -0.85, 1.65, -1.65, 2.45, -2.45, 3.14]) {
    const d = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)); const L = 5.6 + R() * 1.6;
    limb(d.clone().multiplyScalar(2.9).setY(1.3), d.clone().multiplyScalar(L).setY(-0.25), 0.85, 0.12, bark, g);
  }
  // ---- limbs, the crown, and gold leaves
  const crown = [];
  const limbAngles = [0.45, 1.7, 2.9, 4.1, 5.35];
  limbAngles.forEach((a, i) => {
    const d = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const p0 = d.clone().multiplyScalar(1.4).setY(9.2), p1 = d.clone().multiplyScalar(6.3).setY(12.6 + (i % 2) * 1.2), p2 = d.clone().multiplyScalar(8.8).setY(14.6 + (i % 3) * 0.6);
    limb(p0, p1, 1.15, 0.55, bark, g); limb(p1, p2, 0.55, 0.22, bark, g);
    crown.push([p1.x, p1.y + 1.2, p1.z, 3.1], [p2.x, p2.y + 0.6, p2.z, 2.7]);
  });
  limb(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0.4, 16, -0.3), 1.3, 0.4, bark, g);
  crown.push([0.4, 17.4, -0.3, 3.8], [3.2, 16.6, 2.4, 3.0], [-3.4, 16.4, 2.0, 3.0], [-2.6, 16.8, -3.2, 3.2], [2.8, 16.2, -3.0, 3.0], [0, 15.4, 4.6, 2.6]);
  const leafCols = [0xd9a032, 0xe8b84a, 0xc98428, 0xb8651e, 0xe0a83a];
  const leafMats = leafCols.map(c => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.8, emissive: 0x7a4a08, emissiveIntensity: 0.35 }));
  crown.forEach(([x, y, z, r], i) => {
    const b = mesh(jitter(new THREE.IcosahedronGeometry(r, 1), r * 0.22, R), leafMats[i % leafMats.length], x, y, z, g); b.scale.y = 0.72;
  });
  // shimmering gold leaves on the crown surface
  const leafGeo = new THREE.PlaneGeometry(0.42, 0.42); leafGeo.rotateZ(Math.PI / 4);
  const goldLeafMat = new THREE.MeshStandardMaterial({ color: 0xffd76a, emissive: 0xffb830, emissiveIntensity: 1.1, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.3 });
  const NL = 340, leaves = new THREE.InstancedMesh(leafGeo, goldLeafMat, NL);
  { const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    for (let i = 0; i < NL; i++) { const [x, y, z, r] = crown[i % crown.length]; const u = R() * 2 - 1, th = R() * Math.PI * 2, rr = Math.sqrt(1 - u * u); p.set(x + Math.cos(th) * rr * r * 1.02, y + u * r * 0.74, z + Math.sin(th) * rr * r * 1.02); e.set(R() * 3, R() * 3, R() * 3); q.setFromEuler(e); s.setScalar(0.7 + R() * 0.7); M.compose(p, q, s); leaves.setMatrixAt(i, M); } }
  g.add(leaves);
  // a few leaves drifting down around the tree (animated)
  const NF = 22, falling = new THREE.InstancedMesh(leafGeo, goldLeafMat, NF); falling.userData.dynamic = true; g.add(falling);
  const fall = Array.from({ length: NF }, () => ({ a: R() * Math.PI * 2, r: 4 + R() * 7, y0: 6 + R() * 10, sp: 0.25 + R() * 0.35, ph: R() * 10 }));

  // ---- the doorway: a glowing arch with the hall showing through
  const DW = 2.0, DH = 1.75, DZ = 3.05, DEPTH = 0.62;
  const doorGrp = new THREE.Group(); doorGrp.userData.dynamic = true; g.add(doorGrp);
  {
    const ring = archShape(DW + 0.5, DH, new THREE.Shape()); ring.holes.push(archShape(DW, DH, null, true));
    const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: DEPTH, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1, curveSegments: 20 }), woodLight);
    frame.position.set(0, 0, DZ); doorGrp.add(frame);
    const trim = new THREE.Mesh(new THREE.TorusGeometry(DW / 2 + 0.25, 0.05, 5, 24, Math.PI), gold); trim.position.set(0, DH, DZ + DEPTH + 0.06); doorGrp.add(trim);
    // glowing inside view (painted hall with cabinets)
    const inTex = canvasTexture(256, 340, (c, w, h) => {
      const bg = c.createRadialGradient(w / 2, h * 0.55, 10, w / 2, h * 0.5, h * 0.7); bg.addColorStop(0, '#ffe6a0'); bg.addColorStop(0.35, '#d98a3a'); bg.addColorStop(1, '#3a160c'); c.fillStyle = bg; c.fillRect(0, 0, w, h);
      c.fillStyle = '#7a2a1c'; c.beginPath(); c.moveTo(w * 0.42, h * 0.62); c.lineTo(w * 0.58, h * 0.62); c.lineTo(w * 0.8, h); c.lineTo(w * 0.2, h); c.fill(); // red runner
      const cab = (x, y, s, scr) => { c.fillStyle = '#1a0e14'; c.fillRect(x, y, 30 * s, 70 * s); c.fillStyle = scr; c.fillRect(x + 5 * s, y + 12 * s, 20 * s, 16 * s); c.fillStyle = '#ffcf5a'; c.fillRect(x + 3 * s, y + 3 * s, 24 * s, 6 * s); };
      cab(18, 150, 1.6, '#6fe0ff'); cab(70, 170, 1.15, '#ff6aa0'); cab(w - 66, 150, 1.6, '#9bff7a'); cab(w - 104, 170, 1.15, '#ffd34a');
      for (let i = 0; i < 9; i++) { c.fillStyle = '#fff4c0'; c.beginPath(); c.arc(20 + i * 27, 60 + Math.sin(i / 8 * Math.PI) * 26, 4, 0, 7); c.fill(); }
    });
    inTex.repeat.set(1 / DW, 1 / (DH + DW / 2)); inTex.offset.set(0.5, 0);
    const inner = new THREE.Mesh(new THREE.ShapeGeometry(archShape(DW, DH, new THREE.Shape()), 20), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: inTex, emissiveIntensity: 1.25 }));
    inner.position.set(0, 0.01, DZ + 0.32); doorGrp.add(inner);
    // open wooden doors with gold studs and a red band
    for (const s of [-1, 1]) {
      const hinge = new THREE.Group(); hinge.position.set(s * DW / 2, 0, DZ + DEPTH); doorGrp.add(hinge);
      hinge.rotation.y = s < 0 ? -1.2 : 1.2;
      const leaf = mesh(new THREE.BoxGeometry(DW / 2, DH + 0.7, 0.1), wood, -s * DW / 4, (DH + 0.7) / 2, 0, hinge);
      mesh(new THREE.BoxGeometry(DW / 2 + 0.01, 0.12, 0.12), red, -s * DW / 4, 1.0, 0, hinge);
      for (let k = 0; k < 3; k++) mesh(new THREE.SphereGeometry(0.035, 6, 4), gold, -s * (0.15 + k * 0.33), 1.0, 0.07, hinge);
      mesh(new THREE.TorusGeometry(0.09, 0.02, 4, 12), gold, -s * (DW / 2 - 0.15), 1.25, 0.07, hinge);
      leaf.userData.arcadeDoor = true;
    }
    frame.userData.arcadeDoor = inner.userData.arcadeDoor = true;
  }
  // ---- marquee: NOVA'S ARCADE in gold, red frame, chasing bulbs
  const MY = DH + DW / 2 + 1.05, MZ = 3.35;
  const marquee = new THREE.Group(); marquee.position.set(0, MY, MZ); marquee.userData.dynamic = true; g.add(marquee);
  const bulbOn = new THREE.MeshStandardMaterial({ color: 0xfff1c0, emissive: 0xffd77a, emissiveIntensity: 2.4 }); bulbOn.userData.anim = true;
  const bulbOff = new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffb84a, emissiveIntensity: 0.7 }); bulbOff.userData.anim = true;
  const bulbs = [];
  {
    const tex = canvasTexture(512, 200, (c, w, h) => {
      c.fillStyle = '#24130a'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#3a1f10'; for (let i = 0; i < 6; i++) c.fillRect(0, i * 34 + 4, w, 2);
      c.strokeStyle = '#c8323a'; c.lineWidth = 10; c.strokeRect(14, 14, w - 28, h - 28);
      c.strokeStyle = '#e8c15a'; c.lineWidth = 3; c.strokeRect(24, 24, w - 48, h - 48);
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = '#ffcf5a'; c.shadowBlur = 18; c.fillStyle = '#ffe08a';
      c.font = 'bold 66px Georgia, serif'; c.fillText("NOVA'S", w / 2, 70); c.font = 'bold 74px Georgia, serif'; c.fillText('ARCADE', w / 2, 140);
      c.shadowBlur = 0; c.fillStyle = '#e8c15a';
      const tri = rule90(4); for (const sx of [56, w - 84]) tri.forEach((row, ry) => row.forEach((v, cx) => v && c.fillRect(sx + cx * 6, 84 + ry * 6, 5, 5)));
    });
    const bw = 3.5, bh = 1.37;
    const board = mesh(new THREE.BoxGeometry(bw, bh, 0.16), [wood, wood, wood, wood, new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.7 }), wood], 0, 0, 0, marquee);
    board.userData.arcadeDoor = true;
    mesh(new THREE.BoxGeometry(bw + 0.24, 0.12, 0.24), red, 0, bh / 2 + 0.06, 0, marquee); mesh(new THREE.BoxGeometry(bw + 0.24, 0.12, 0.24), red, 0, -bh / 2 - 0.06, 0, marquee);
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.14, 0.14, 0.5), barkDark, s * 1.1, -0.2, -0.3, marquee);
    const bg = new THREE.SphereGeometry(0.055, 6, 4);
    const per = (bw + bh) * 2, n = 30;
    for (let i = 0; i < n; i++) {
      let d = i / n * per, x, y;
      if (d < bw) { x = -bw / 2 + d; y = bh / 2 + 0.13; } else if ((d -= bw) < bh) { x = bw / 2 + 0.13; y = bh / 2 - d; } else if ((d -= bh) < bw) { x = bw / 2 - d; y = -bh / 2 - 0.13; } else { d -= bw; x = -bw / 2 - 0.13; y = -bh / 2 + d; }
      bulbs.push(mesh(bg, i % 2 ? bulbOn : bulbOff, x, y, 0.13, marquee));
    }
  }
  // ---- treehouse rooms on the branches: one per wing after the trunk hall
  const ext = data.wings.slice(1);
  const TH_ANG = [-1.2, 1.2, -2.15, 2.15, 2.95, -0.35, 0.35, -2.75];
  const windows = [];
  const bulbPts = [], bulbCols = [];
  const pushBulbs = (arr, warm = 0) => { for (let i = 0; i < arr.length; i += 3) { bulbPts.push(arr[i], arr[i + 1], arr[i + 2]); const red_ = (i / 3 + warm) % 5 === 0; bulbCols.push(1, red_ ? 0.45 : 0.82, red_ ? 0.4 : 0.45); } };
  ext.forEach((w, k) => {
    const a = TH_ANG[k % TH_ANG.length] + Math.floor(k / TH_ANG.length) * 0.4, rad = 5.7 + (k % 2) * 0.4, h = 6.2 + (k % 2) * 1.5 + Math.floor(k / 2) * 0.7;
    const d = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const th = new THREE.Group(); th.position.copy(d.clone().multiplyScalar(rad)).setY(h); th.rotation.y = a; g.add(th);
    th.userData.wing = w.id;
    limb(d.clone().multiplyScalar(2.3).setY(h - 2.0), d.clone().multiplyScalar(rad).setY(h - 0.15), 0.55, 0.3, bark, g);
    limb(d.clone().multiplyScalar(2.6).setY(h - 0.9), d.clone().multiplyScalar(rad - 0.8).setY(h - 0.15), 0.3, 0.18, bark, g);
    mesh(new THREE.CylinderGeometry(1.6, 1.5, 0.18, 14), wood, 0, -0.09, 0, th);
    const rail = mesh(new THREE.TorusGeometry(1.52, 0.04, 4, 28), woodLight, 0, 0.55, 0, th); rail.rotation.x = Math.PI / 2;
    for (let i = 0; i < 12; i++) { const b = i / 12 * Math.PI * 2; if (Math.abs(Math.sin(b / 2)) < 0.14) continue; mesh(new THREE.BoxGeometry(0.06, 0.55, 0.06), woodLight, Math.sin(b) * 1.52, 0.27, Math.cos(b) * 1.52, th); }
    const roofCol = new THREE.Color(w.roof || '#2f5a52');
    mesh(new THREE.CylinderGeometry(0.95, 1.0, 1.3, 12), woodLight, 0, 0.65, -0.15, th);
    mesh(new THREE.SphereGeometry(1.1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(roofCol.getHex()), 0, 1.3, -0.15, th);
    const rim = mesh(new THREE.TorusGeometry(1.08, 0.05, 4, 24), gold, 0, 1.32, -0.15, th); rim.rotation.x = Math.PI / 2;
    mesh(new THREE.ConeGeometry(0.1, 0.4, 6), gold, 0, 2.55, -0.15, th);
    mesh(new THREE.SphereGeometry(0.09, 8, 6), glow(0xffd77a, 1.8), 0, 2.8, -0.15, th);
    for (const s of [-1, 1]) {
      const win = mesh(new THREE.ShapeGeometry(archShape(0.32, 0.3, new THREE.Shape()), 8), new THREE.MeshStandardMaterial({ color: 0xffc070, emissive: 0xffb050, emissiveIntensity: 1.6 }), s * 0.42, 0.45, 0.83, th);
      win.rotation.y = s * 0.4; win.material.userData.anim = true; win.userData.dynamic = true; windows.push(win);
    }
    mesh(new THREE.BoxGeometry(0.36, 0.7, 0.05), mat(0x4a2e18), 0, 0.35, 0.86, th);
    // the wing's name on a little hanging sign
    const sign = canvasTexture(256, 64, (c, W, H) => { c.fillStyle = '#24130a'; c.fillRect(0, 0, W, H); c.strokeStyle = w.color || '#e8c15a'; c.lineWidth = 6; c.strokeRect(3, 3, W - 6, H - 6); c.fillStyle = '#ffe08a'; c.font = 'bold 30px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(w.name, W / 2, H / 2 + 2); });
    mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshStandardMaterial({ map: sign, emissive: 0xffffff, emissiveMap: sign, emissiveIntensity: 0.55, side: THREE.DoubleSide }), 0, -0.5, 1.62, th);
    for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 3), barkDark, s * 0.6, -0.2, 1.62, th);
    // a lantern hanging off the platform
    const lp = new THREE.Vector3(1.25, -0.6, 0.7); mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 3), barkDark, lp.x, lp.y + 0.35, lp.z, th);
    mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.3, 8), glow(0xffc96a, 1.8), lp.x, lp.y, lp.z, th);
    // string lights from the roof to the trunk
    th.updateMatrixWorld(true); g.updateMatrixWorld(true);
    const roofTop = g.worldToLocal(th.localToWorld(new THREE.Vector3(0, 1.4, -0.15)));
    const pts = []; sag(roofTop, d.clone().multiplyScalar(2.9).setY(h + 2.4), 0.6, 9, pts); pushBulbs(pts, k);
    const railPts = []; for (let i = 0; i <= 16; i++) { const b = i / 16 * Math.PI * 2; railPts.push(...g.worldToLocal(th.localToWorld(new THREE.Vector3(Math.sin(b) * 1.52, 0.6 + 0.04 * Math.sin(i * 2), Math.cos(b) * 1.52))).toArray()); } pushBulbs(railPts, k + 2);
  });
  // ---- more string lights: around the doorway, from the marquee up into the limbs, and garlands
  {
    const arch = []; for (let i = 0; i <= 18; i++) { const b = Math.PI - i / 18 * Math.PI; arch.push(Math.cos(b) * (DW / 2 + 0.38), DH + Math.sin(b) * (DW / 2 + 0.38), DZ + DEPTH + 0.1); }
    for (let i = 1; i <= 4; i++) { arch.push(-(DW / 2 + 0.38), DH - i * 0.42, DZ + DEPTH + 0.1, DW / 2 + 0.38, DH - i * 0.42, DZ + DEPTH + 0.1); }
    pushBulbs(arch, 1);
    const s1 = []; sag(new THREE.Vector3(-1.9, MY + 0.6, MZ), new THREE.Vector3(-5.5, 11.6, 3.2), 1.0, 12, s1); sag(new THREE.Vector3(1.9, MY + 0.6, MZ), new THREE.Vector3(5.6, 11.8, 3.4), 1.0, 12, s1); pushBulbs(s1, 3);
    const s2 = []; for (let i = 0; i < limbAngles.length; i++) { const a0 = limbAngles[i], a1 = limbAngles[(i + 1) % limbAngles.length]; sag(new THREE.Vector3(Math.sin(a0) * 6.2, 12.2, Math.cos(a0) * 6.2), new THREE.Vector3(Math.sin(a1) * 6.2, 12.2, Math.cos(a1) * 6.2), 1.3, 14, s2); } pushBulbs(s2, 0);
    const s3 = []; for (let i = 0; i < 26; i++) { const b = i / 26 * Math.PI * 2; s3.push(Math.sin(b) * 3.35, 9.2 + Math.sin(b * 3) * 0.25, Math.cos(b) * 3.35); } pushBulbs(s3, 2);
  }
  const bulbGeo = new THREE.BufferGeometry(); bulbGeo.setAttribute('position', new THREE.Float32BufferAttribute(bulbPts, 3)); bulbGeo.setAttribute('color', new THREE.Float32BufferAttribute(bulbCols, 3));
  const lights = new THREE.Points(bulbGeo, new THREE.PointsMaterial({ size: 0.55, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 1 }));
  g.add(lights);
  const bulbDots = new THREE.Points(bulbGeo, new THREE.PointsMaterial({ size: 0.12, color: 0xfff2c8, transparent: true, depthWrite: false }));
  g.add(bulbDots);

  // ---- ground: stepping stones, lanterns, red mushrooms, a couple of hanging lanterns
  for (let i = 0; i < 6; i++) { const z = 4.4 + i * 1.25, x = Math.sin(i * 1.7) * 0.3; mesh(jitter(new THREE.CylinderGeometry(0.55 - i * 0.02, 0.6, 0.08, 7), 0.05, R), stone, x, 0.02, z, g); }
  const lamps = [];
  for (const s of [-1, 1]) {
    const lg = new THREE.Group(); lg.position.set(s * 1.9, 0, 6.2); g.add(lg);
    mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.9, 6), mat(0x1b1b24), 0, 0.95, 0, lg);
    const lb = mesh(new THREE.BoxGeometry(0.36, 0.42, 0.36), new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffd77a, emissiveIntensity: 2.0 }), 0, 2.05, 0, lg); lb.material.userData.anim = true; lb.userData.dynamic = true; lamps.push(lb);
    mesh(new THREE.ConeGeometry(0.34, 0.26, 4), red, 0, 2.38, 0, lg).rotation.y = Math.PI / 4;
    const hs = glowSprite(2.6, 0xffd77a, 0.75); hs.position.y = 2.05; lg.add(hs);
  }
  const shroomCap = new THREE.MeshStandardMaterial({ color: 0xc8323a, emissive: 0x8a1018, emissiveIntensity: 0.5, flatShading: true }), shroomStem = mat(0xeadfc8);
  for (let i = 0; i < 9; i++) { const a = (i % 2 ? 1 : -1) * (0.9 + R() * 2), r = 3.9 + R() * 2.4; const x = Math.sin(a) * r, z = Math.cos(a) * r; const s = 0.6 + R() * 0.7; mesh(new THREE.CylinderGeometry(0.06 * s, 0.08 * s, 0.3 * s, 6), shroomStem, x, 0.15 * s, z, g); mesh(new THREE.SphereGeometry(0.2 * s, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), shroomCap, x, 0.28 * s, z, g); }
  for (const [a, h] of [[0.9, 8.2], [-0.95, 8.0], [2.3, 10.4], [-2.4, 10.1]]) {
    const p = new THREE.Vector3(Math.sin(a) * 4.3, h, Math.cos(a) * 4.3);
    mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.9, 3), barkDark, p.x, p.y + 0.55, p.z, g);
    mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.36, 8), glow(0xffc96a, 1.9), p.x, p.y, p.z, g);
    const s = glowSprite(1.8, 0xffc070, 0.6); s.position.copy(p); g.add(s);
  }
  const bush = [mat(0x2c5a34), mat(0x3a6a3a), mat(0x24482c)];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + R() * 0.3; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.45) continue; // keep the path clear
    const r = 9.5 + R() * 3.2, s = 0.5 + R() * 0.6;
    const b = mesh(jitter(new THREE.IcosahedronGeometry(s, 0), s * 0.2, R), bush[i % 3], Math.sin(a) * r, s * 0.55, Math.cos(a) * r, g); b.scale.y = 0.75;
    if (i % 3 === 0) mesh(new THREE.SphereGeometry(0.07, 6, 4), glow(i % 2 ? 0xd2343c : 0xf2cd62, 1.2), Math.sin(a) * r + s * 0.4, s * 0.9, Math.cos(a) * r, g);
  }
  // (no real PointLight here: one more scene light would cost every lit fragment in the world; the emissive door + halo carry the glow)
  const halo = glowSprite(6, 0xffcf7a, 0.7); halo.material.userData.anim = true; halo.position.set(0, 1.5, DZ + DEPTH + 0.3); g.add(halo);

  mergeStatic(g);
  const M4 = new THREE.Matrix4(), Q4 = new THREE.Quaternion(), E4 = new THREE.Euler(), P4 = new THREE.Vector3(), S4 = new THREE.Vector3(1, 1, 1);
  function update(t, dt) {
    const gl = DAY.glow, w = DAY.window;
    const chase = Math.floor(t * 3) & 1;
    bulbOn.emissiveIntensity = (chase ? 2.4 : 0.7) * gl + 0.25; bulbOff.emissiveIntensity = (chase ? 0.7 : 2.4) * gl + 0.25;
    const f = 0.9 + 0.1 * Math.sin(t * 7.1) * Math.sin(t * 2.9 + 1);
    windows.forEach((m, i) => { m.material.emissiveIntensity = (1.4 + 0.25 * Math.sin(t * (1.3 + i * 0.21) + i)) * w; });
    lamps.forEach(m => { m.material.emissiveIntensity = 2.2 * f * gl; });
    halo.material.opacity = 0.75 * f * DAY.halo;
    for (let i = 0; i < NF; i++) {
      const L = fall[i]; const k = ((t * L.sp * 0.12 + L.ph) % 1);
      const y = L.y0 * (1 - k), a = L.a + t * 0.05 + Math.sin(t * 0.6 + L.ph) * 0.3;
      P4.set(Math.sin(a) * L.r, Math.max(0.05, y), Math.cos(a) * L.r); E4.set(t * L.sp * 3 + L.ph, t * L.sp * 2, L.ph); Q4.setFromEuler(E4); S4.setScalar(y < 0.2 ? 0.0001 : 0.9); M4.compose(P4, Q4, S4); falling.setMatrixAt(i, M4);
    }
    falling.instanceMatrix.needsUpdate = true;
  }
  const doorWorld = () => g.localToWorld(new THREE.Vector3(0, 1.3, DZ + DEPTH));
  const doorFront = d => g.localToWorld(new THREE.Vector3(0, 1.7, DZ + DEPTH + d));
  const viewPoint = () => ({ pos: g.localToWorld(new THREE.Vector3(11, 10, 33)), target: g.localToWorld(new THREE.Vector3(0, 8, 0)) });
  return { group: g, update, doorWorld, doorFront, viewPoint };
}

// =====================================================================
// Interior: the hall of cabinet bays (meters)
// =====================================================================
const WALL_X = 3.4, WALL_H = 2.5, BAY_W = 1.75, CAB_X = WALL_X - 0.45, WALK_X = 1.9, EYE = 1.55;
const PART_HALF = 1.15, FOYER = 2.0;

export function arcadeLayout(data) {
  // wing i runs from z0 (near the entrance) to z1 (further in), -z is "deeper"
  let z = 0; const wings = [], bays = [];
  const games = data.games || [], soon = data.coming_soon || [];
  data.wings.forEach((w, wi) => {
    const per = Math.max(1, Math.ceil(w.bays / 2)), len = per * BAY_W + FOYER + 1.3;
    const W = { ...w, index: wi, z0: z, z1: z - len, len, bays: [] };
    for (let b = 1; b <= w.bays; b++) {
      const side = b % 2 ? -1 : 1, idx = Math.floor((b - 1) / 2);
      const bz = z - FOYER - (idx + 0.5) * BAY_W;
      const game = games.find(gm => gm.wing === w.id && gm.bay === b) || null;
      const teaser = game ? null : soon.find(s => s.wing === w.id && s.bay === b) || null;
      const B = { key: `${w.id}:${b}`, wing: w.id, wingName: w.name, bay: b, side, z: bz, x: side * CAB_X, game, teaser };
      W.bays.push(B); bays.push(B);
    }
    wings.push(W); z = W.z1 - 0.3;
  });
  return { wings, bays, zEnd: wings.length ? wings[wings.length - 1].z1 : -6 };
}

function woodTex(base, seed, rep = [1, 1], lines = 'v') {
  const R = rng(seed);
  const t = canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { const p = R() * (lines === 'v' ? w : h); c.strokeStyle = R() < 0.5 ? 'rgba(20,10,4,.35)' : 'rgba(160,110,70,.18)'; c.lineWidth = 1 + R() * 2.5; c.beginPath(); if (lines === 'v') { c.moveTo(p, 0); c.bezierCurveTo(p + (R() - .5) * 20, h / 3, p + (R() - .5) * 20, 2 * h / 3, p, h); } else { c.moveTo(0, p); c.lineTo(w, p + (R() - .5) * 6); } c.stroke(); }
    if (lines === 'h') for (let i = 0; i < 8; i++) { c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, i * 32, w, 2); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); return t;
}
function signTexture(text, color = '#e8c15a', sub = '', w = 512, h = 128) {
  return canvasTexture(w, h, (c, W, H) => {
    c.fillStyle = '#1c0f08'; c.fillRect(0, 0, W, H); c.strokeStyle = color; c.lineWidth = 8; c.strokeRect(6, 6, W - 12, H - 12);
    c.strokeStyle = '#e8c15a'; c.lineWidth = 2; c.strokeRect(16, 16, W - 32, H - 32);
    c.fillStyle = '#ffe08a'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = '#ffb84a'; c.shadowBlur = 12;
    c.font = `bold ${sub ? 46 : 54}px Georgia, serif`; c.fillText(text, W / 2, sub ? H * 0.4 : H / 2 + 2);
    if (sub) { c.shadowBlur = 0; c.fillStyle = '#c8b890'; c.font = '26px Georgia, serif'; c.fillText(sub, W / 2, H * 0.74); }
  });
}
function marqueeTexture(title, color) {
  return canvasTexture(256, 72, (c, W, H) => {
    const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#1a1030'); gr.addColorStop(1, '#0a0618'); c.fillStyle = gr; c.fillRect(0, 0, W, H);
    c.fillStyle = color; c.fillRect(0, 0, W, 6); c.fillRect(0, H - 6, W, 6);
    c.fillStyle = '#c8323a'; c.fillRect(0, 6, W, 3); c.fillRect(0, H - 9, W, 3);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = color; c.shadowBlur = 10; c.fillStyle = '#fff1c0';
    let fs = 34; c.font = `bold ${fs}px "Trebuchet MS", Verdana, sans-serif`; while (c.measureText(title.toUpperCase()).width > W - 20 && fs > 14) { fs -= 2; c.font = `bold ${fs}px "Trebuchet MS", Verdana, sans-serif`; }
    c.fillText(title.toUpperCase(), W / 2, H / 2 + 1);
  });
}

export function createArcade({ renderer, data, onExit, onPlay, onWing, onSoon }) {
  const L = arcadeLayout(data);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x120a08); scene.fog = new THREE.Fog(0x120a08, 14, 34);
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 120); camera.rotation.order = 'YXZ';
  const state = { active: false, keys: new Set(), joy: { x: 0, y: 0 }, yaw: 0, pitch: -0.05, eye: EYE, wing: null };
  const pos = new THREE.Vector3(0, 0, -1);
  const shell = new THREE.Group(); scene.add(shell);
  const updaters = [];
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: woodTex('#5a3a22', 3, [3, 1]), roughness: 0.95 }),
    vault: new THREE.MeshStandardMaterial({ map: woodTex('#3b2416', 5, [6, 2], 'v'), roughness: 1, side: THREE.BackSide }),
    floor: new THREE.MeshStandardMaterial({ map: woodTex('#4a2e1a', 7, [2, 6], 'h'), roughness: 0.85 }),
    rib: mat(0x2e1c10), gold: mat(0xe8c15a, { metalness: .5, roughness: .35 }), red: mat(0xb32d35), dark: mat(0x161018),
    cab: mat(0x2a3470), cabSide: mat(0x1a2050), black: mat(0x0a0a10), chrome: mat(0xc8c8d8, { metalness: .7, roughness: .3 }),
  };
  // red runner with a gold Rule 90 border
  const runnerTex = canvasTexture(64, 256, (c, w, h) => {
    c.fillStyle = '#7a1c22'; c.fillRect(0, 0, w, h); c.fillStyle = '#e8c15a'; c.fillRect(3, 0, 3, h); c.fillRect(w - 6, 0, 3, h);
    const tri = rule90(8); for (let k = 0; k < 2; k++) tri.forEach((row, ry) => row.forEach((v, cx) => { if (v) { c.fillStyle = 'rgba(232,193,90,.55)'; c.fillRect(17 + cx * 2, k * 128 + 40 + ry * 3, 2, 2); } }));
  });
  runnerTex.wrapS = runnerTex.wrapT = THREE.RepeatWrapping;

  // ---- hall shell, one section per wing
  const zStart = 0.0, zEnd = L.zEnd;
  const totalLen = zStart - zEnd;
  {
    const fl = mesh(new THREE.PlaneGeometry(WALL_X * 2, totalLen + 0.4), M.floor, 0, 0, (zStart + zEnd) / 2, shell); fl.rotation.x = -Math.PI / 2;
    M.floor.map.repeat.set(2, totalLen / 2.2);
    runnerTex.repeat.set(1, totalLen / 3);
    const ru = mesh(new THREE.PlaneGeometry(1.4, totalLen), new THREE.MeshStandardMaterial({ map: runnerTex, roughness: 1 }), 0, 0.006, (zStart + zEnd) / 2, shell); ru.rotation.x = -Math.PI / 2;
    M.wall.map.repeat.set(totalLen / 2.5, 1);
    for (const s of [-1, 1]) { const w = mesh(new THREE.PlaneGeometry(totalLen, WALL_H), M.wall, s * WALL_X, WALL_H / 2, (zStart + zEnd) / 2, shell); w.rotation.y = -s * Math.PI / 2; }
    const v = mesh(new THREE.CylinderGeometry(WALL_X, WALL_X, totalLen, 28, 1, true, -Math.PI / 2, Math.PI), M.vault, 0, WALL_H, (zStart + zEnd) / 2, shell); v.rotation.x = Math.PI / 2;
    M.vault.map.repeat.set(4, totalLen / 3);
  }
  const ribGeo = new THREE.TorusGeometry(WALL_X - 0.04, 0.09, 5, 24, Math.PI);
  const pillarGeo = new THREE.BoxGeometry(0.22, WALL_H, 0.3);
  function rib(z) { mesh(ribGeo, M.rib, 0, WALL_H, z, shell); for (const s of [-1, 1]) mesh(pillarGeo, M.rib, s * (WALL_X - 0.1), WALL_H / 2, z, shell); }
  // cross walls: entrance (with the way out), between wings (an arch), and the far end
  function crossWall(z, hole, face = 1) {
    const sh = new THREE.Shape(); sh.moveTo(-WALL_X, 0); sh.lineTo(-WALL_X, WALL_H); sh.absarc(0, WALL_H, WALL_X, Math.PI, 0, true); sh.lineTo(WALL_X, 0); sh.lineTo(-WALL_X, 0);
    if (hole) sh.holes.push(archShape(hole.w, hole.h, null, true));
    const m = mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: false, curveSegments: 24 }), M.wall, 0, 0, z - 0.15, shell);
    if (hole) { const tr = mesh(new THREE.TorusGeometry(hole.w / 2 + 0.06, 0.07, 5, 20, Math.PI), M.gold, 0, hole.h, z + face * 0.17, shell); }
    return m;
  }
  const exitMeshes = [];
  {
    // entrance wall: the doorway shows the night garden outside
    crossWall(zStart + 0.15, { w: 1.9, h: 1.75 }, -1);
    const outside = canvasTexture(128, 160, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0a1030'); gr.addColorStop(0.65, '#1a1a48'); gr.addColorStop(0.66, '#22402c'); gr.addColorStop(1, '#16301e'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) { c.fillStyle = i % 5 ? '#ffffff' : '#ffd970'; c.fillRect(Math.random() * w, Math.random() * h * 0.6, 1.5, 1.5); }
      c.fillStyle = '#ffd77a'; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(16 + i * 24, 92 + (i % 2) * 6, 2.5, 0, 7); c.fill(); }
    });
    const outM = new THREE.MeshBasicMaterial({ map: outside });
    const op = mesh(new THREE.PlaneGeometry(2.2, 3.0), outM, 0, 1.4, zStart + 0.45, shell); op.rotation.y = Math.PI; op.userData.exit = true; exitMeshes.push(op);
    const mat2 = mesh(new THREE.BoxGeometry(2.0, 0.02, 0.6), M.red, 0, 0.01, zStart - 0.4, shell);
    const es = mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshStandardMaterial({ map: signTexture('⟵ WAY OUT', '#c8323a'), emissive: 0xffffff, emissiveMap: signTexture('⟵ WAY OUT', '#c8323a'), emissiveIntensity: 0.6 }), 0, 3.05, zStart - 0.02, shell);
    es.rotation.y = Math.PI; es.userData.exit = true; exitMeshes.push(es);
  }
  const lights = [];
  L.wings.forEach((w, wi) => {
    // ribs at bay boundaries
    const per = Math.max(1, Math.ceil(w.bays.length / 2));
    for (let i = 0; i <= per; i++) rib(w.z0 - FOYER - i * BAY_W);
    // a banner with the wing's name where the wing starts
    const tx = signTexture(w.name, w.color || '#e8c15a', w.tagline || '');
    const ban = mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshStandardMaterial({ map: tx, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: 0.55, side: THREE.DoubleSide }), 0, 3.85, w.z0 - 0.9, shell);
    for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.3, 3), M.rib, s * 1.15, 4.8, w.z0 - 0.9, shell);
    // warm light per wing + a string of bulbs under the vault
    const Lp = new THREE.PointLight(0xffc684, 20, 0, 1.6); Lp.position.set(0, 3.3, (w.z0 + w.z1) / 2); scene.add(Lp); lights.push(Lp);
    // partition to the next wing (an arch), or the end wall with a sign
    if (wi < L.wings.length - 1) {
      crossWall(w.z1 - 0.15, { w: PART_HALF * 2 + 0.3, h: 2.1 });
      const nx = L.wings[wi + 1];
      for (const f of [1, -1]) { const tex = signTexture(f > 0 ? `${nx.name} ›` : `‹ ${w.name}`, (f > 0 ? nx.color : w.color) || '#e8c15a', '', 512, 110); const s = mesh(new THREE.PlaneGeometry(2.2, 0.48), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.6 }), 0, 3.6, w.z1 + f * 0.02 + (f > 0 ? 0 : -0.3), shell); if (f < 0) s.rotation.y = Math.PI; }
    } else {
      crossWall(w.z1 - 0.15, null);
      const tex = signTexture('More wings growing…', '#c8323a', 'new games will appear on new branches', 512, 128);
      mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.6 }), 0, 1.5, w.z1 + 0.02, shell);
      // a big glowing Rule 90 mural
      const rows = rule90(16), cells = []; rows.forEach((r, ry) => r.forEach((v, cx) => v && cells.push([cx - 15, ry])));
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.085, 0.085, 0.03), glow(0xf2cd62, 1.4), cells.length);
      const m4 = new THREE.Matrix4(); cells.forEach(([cx, ry], i) => { m4.makeTranslation(cx * 0.1, 4.0 - ry * 0.1 * 0.87 * 1.1, w.z1 + 0.03); im.setMatrixAt(i, m4); }); shell.add(im);
    }
  });
  // string lights along the vault
  {
    const pts = [], cols = [];
    for (const s of [-1, 1]) { const arr = []; for (let z = zStart - 0.4; z > zEnd + 0.4; z -= 2.2) sag(new THREE.Vector3(s * 1.7, 4.25, z), new THREE.Vector3(s * 1.7, 4.25, z - 2.2), 0.35, 6, arr); for (let i = 0; i < arr.length; i += 3) { pts.push(arr[i], arr[i + 1], arr[i + 2]); const r = (i / 3) % 6 === 0; cols.push(1, r ? 0.4 : 0.82, r ? 0.38 : 0.45); } }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    shell.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.32, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    shell.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.05, color: 0xfff2c8 })));
  }
  scene.add(new THREE.HemisphereLight(0xffd8b0, 0x2a1408, 1.0));
  mergeStatic(shell);

  // ---- cabinets
  const screenGeo = new THREE.PlaneGeometry(0.58, 0.48);
  const cabinets = [];
  function buildCabinet(B) {
    const grp = new THREE.Group(); grp.position.set(B.x, 0, B.z); grp.rotation.y = B.side < 0 ? Math.PI / 2 : -Math.PI / 2; scene.add(grp);
    const color = B.game?.color || '#e8c15a';
    const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), emissive: new THREE.Color(color), emissiveIntensity: 0.35, roughness: 0.6 });
    // body, side art, control panel, coin door, kick plate
    mesh(new THREE.BoxGeometry(0.74, 1.7, 0.66), M.cab, 0, 0.85, -0.02, grp);
    for (const s of [-1, 1]) { mesh(new THREE.BoxGeometry(0.04, 1.86, 0.74), M.cabSide, s * 0.39, 0.93, 0, grp); mesh(new THREE.BoxGeometry(0.045, 0.08, 0.74), accent, s * 0.39, 1.55, 0.0, grp); mesh(new THREE.BoxGeometry(0.045, 0.9, 0.06), accent, s * 0.39, 0.6, 0.36, grp); }
    const panel = mesh(new THREE.BoxGeometry(0.76, 0.07, 0.34), M.black, 0, 0.98, 0.42, grp); panel.rotation.x = 0.32;
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 6), M.chrome, -0.16, 1.07, 0.42, grp);
    mesh(new THREE.SphereGeometry(0.035, 8, 6), M.red, -0.16, 1.14, 0.42, grp);
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10), glow(0xe8c15a, 1.2), 0.08, 1.03, 0.44, grp);
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10), glow(0xd2343c, 1.2), 0.18, 1.03, 0.4, grp);
    mesh(new THREE.BoxGeometry(0.3, 0.32, 0.02), M.dark, 0, 0.45, 0.32, grp);
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.04, 0.07, 0.01), glow(0xd2343c, 1.0), s * 0.07, 0.5, 0.335, grp);
    mesh(new THREE.BoxGeometry(0.76, 0.08, 0.7), M.gold, 0, 0.04, 0, grp);
    // screen (live attract picture) with bezel
    const sc = document.createElement('canvas'); sc.width = 160; sc.height = 132; const sctx = sc.getContext('2d');
    const stex = new THREE.CanvasTexture(sc); stex.colorSpace = THREE.SRGBColorSpace; stex.magFilter = THREE.NearestFilter; stex.minFilter = THREE.LinearFilter; stex.generateMipmaps = false;
    const bez = mesh(new THREE.BoxGeometry(0.68, 0.58, 0.04), M.black, 0, 1.33, 0.31, grp); bez.rotation.x = -0.16;
    const screen = mesh(screenGeo, new THREE.MeshBasicMaterial({ map: stex, toneMapped: false }), 0, 1.33, 0.334, grp); screen.rotation.x = -0.16;
    // marquee
    const mq = marqueeTexture(B.game ? B.game.title : (B.teaser ? B.teaser.title : 'Coming soon'), color);
    mesh(new THREE.BoxGeometry(0.76, 0.24, 0.24), M.cab, 0, 1.76, 0.2, grp);
    const mqm = mesh(new THREE.PlaneGeometry(0.72, 0.2), new THREE.MeshStandardMaterial({ map: mq, emissive: 0xffffff, emissiveMap: mq, emissiveIntensity: B.game ? 1.0 : 0.35 }), 0, 1.76, 0.322, grp);
    const glowS = glowSprite(1.1, new THREE.Color(color).getHex(), B.game ? 0.35 : 0.12); glowS.position.set(0, 1.35, 0.5); grp.add(glowS);
    grp.traverse(o => { if (o.isMesh) o.userData.bay = B.key; });
    mergeStatic(grp);
    const C = { B, grp, sc, sctx, stex, screen, preview: null, lastDraw: -1 };
    drawIdle(C, 0); cabinets.push(C);
    return C;
  }
  function buildEmptyBay(B) {
    // an open plinth waiting for a future game
    const grp = new THREE.Group(); grp.position.set(B.x, 0, B.z); grp.rotation.y = B.side < 0 ? Math.PI / 2 : -Math.PI / 2; scene.add(grp);
    mesh(new THREE.BoxGeometry(0.86, 0.06, 0.78), M.dark, 0, 0.03, 0, grp);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.8, 1.86, 0.7)), new THREE.LineBasicMaterial({ color: 0xe8c15a, transparent: true, opacity: 0.28 })); outline.position.set(0, 0.96, 0); grp.add(outline);
    const tex = canvasTexture(256, 160, (c, W, H) => {
      c.fillStyle = '#140c0a'; c.fillRect(0, 0, W, H); c.strokeStyle = '#e8c15a'; c.lineWidth = 4; c.setLineDash([10, 8]); c.strokeRect(8, 8, W - 16, H - 16); c.setLineDash([]);
      c.textAlign = 'center'; c.fillStyle = '#c8b890'; c.font = '22px Georgia, serif'; c.fillText(`Bay ${B.bay}`, W / 2, 42);
      c.fillStyle = '#ffe08a'; c.font = 'bold 30px Georgia, serif'; c.fillText(B.teaser ? B.teaser.title : 'Coming soon', W / 2, 86, W - 30);
      c.fillStyle = '#8a90b0'; c.font = 'italic 19px Georgia, serif'; c.fillText(B.teaser ? 'coming soon' : 'a new game will live here', W / 2, 124, W - 30);
    });
    const sign = mesh(new THREE.PlaneGeometry(0.62, 0.39), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.45 }), 0, 1.2, 0.0, grp);
    mesh(new THREE.CylinderGeometry(0.015, 0.02, 1.0, 6), M.gold, 0, 0.5, -0.02, grp);
    grp.traverse(o => { if (o.isMesh) o.userData.bay = B.key; });
    return { B, grp, sign };
  }
  function drawIdle(C, t) {
    const c = C.sctx, W = C.sc.width, H = C.sc.height;
    c.fillStyle = '#05070f'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#f6d36a'; c.font = 'bold 18px monospace'; c.textAlign = 'center'; c.fillText(C.B.game.title.toUpperCase(), W / 2, H / 2 - 6, W - 10);
    if (Math.floor(t * 2) % 2 === 0) { c.fillStyle = '#9be37e'; c.font = '12px monospace'; c.fillText('PRESS START', W / 2, H / 2 + 18); }
    C.stex.needsUpdate = true;
  }
  const empty = [];
  L.bays.forEach(B => { if (B.game) buildCabinet(B); else empty.push(buildEmptyBay(B)); });

  // ---- Nova, playing at the first game's cabinet
  const nova = makeNova({ lights: 'tail' });
  const firstCab = cabinets[0];
  let novaWhy = 'Hanging out in the Arcade';
  const novaRoot = nova.root;
  if (firstCab) {
    const B = firstCab.B;
    novaRoot.position.set(B.side * (CAB_X - 0.95), 0, B.z - 0.72); novaRoot.rotation.y = B.side < 0 ? -Math.PI / 2 + 0.6 : Math.PI / 2 - 0.6; novaRoot.scale.setScalar(0.5);
    scene.add(novaRoot); novaRoot.traverse(o => { if (o.isMesh) o.userData.novaPick = true; });
  }
  const _sv = new THREE.Vector3();
  updaters.push((t, dt) => {
    if (!firstCab || !state.active) return;
    nova.setPose('sit');
    const me = novaRoot.getWorldPosition(_sv);
    const near = camera.position.distanceTo(me) < 2.6;
    const scr = firstCab.screen.getWorldPosition(new THREE.Vector3());
    nova.anim.look = near && Math.sin(t * 0.4) > -0.3 ? camera.position.clone() : scr;
    novaWhy = near ? `Saying hi from in front of ${firstCab.B.game.title}` : `Watching the ${firstCab.B.game.title} attract screen`;
    nova.update(t, dt, { camera });
  });

  // ---- live attract screens (only the near ones, a few times a second)
  async function loadPreviews() {
    for (const C of cabinets) {
      if (C.preview || C.loading) continue; C.loading = true;
      try { const mod = await import(new URL(C.B.game.module, document.baseURI).href); if (typeof mod.preview === 'function') C.preview = mod.preview; } catch (e) { console.warn('arcade: could not load', C.B.game.module, e); }
    }
  }
  let screenT = 0;
  updaters.push((t, dt) => {
    if (!state.active) return;
    screenT += dt; if (screenT < 0.1) return; screenT = 0;
    for (const C of cabinets) {
      const d = Math.abs(C.B.z - pos.z);
      if (d > 9) continue;
      if (C.preview) { C.preview(C.sctx, C.sc.width, C.sc.height, t); C.stex.needsUpdate = true; } else drawIdle(C, t);
    }
  });

  // ---- walking
  const KEYMAP = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', KeyD: 'r', ArrowLeft: 'tl', ArrowRight: 'tr', KeyQ: 'tl', KeyE: 'tr' };
  const isBlocked = () => state.blocked?.();
  addEventListener('keydown', e => { if (!state.active || isBlocked() || e.target.closest?.('input,textarea')) return; const k = KEYMAP[e.code]; if (k) { state.keys.add(k); e.preventDefault(); } });
  addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) state.keys.delete(k); });
  addEventListener('blur', () => state.keys.clear());
  const partitions = L.wings.slice(0, -1).map(w => w.z1 - 0.15);
  const RAD = 0.3;
  function resolve(p, prev) {
    p.x = THREE.MathUtils.clamp(p.x, -WALK_X, WALK_X);
    p.z = THREE.MathUtils.clamp(p.z, zEnd + 0.45, zStart - 0.45);
    for (const zp of partitions) {
      if (Math.abs(p.z - zp) < 0.15 + RAD && Math.abs(p.x) > PART_HALF - RAD) {
        if (Math.abs(prev.z - zp) >= 0.15 + RAD - 1e-3) {             // came from the side: stop at the wall...
          const push = Math.abs(p.z - prev.z); p.z = prev.z;
          // ...and slide toward the archway, so walking at the wall funnels you through instead of sticking
          const room = Math.abs(p.x) - (PART_HALF - RAD - 0.02);
          if (room > 0) p.x -= Math.sign(p.x) * Math.min(room, push * 1.2);
        }
        else p.x = Math.sign(p.x) * (PART_HALF - RAD);           // inside the archway: stay in it
      }
    }
  }
  const wingAt = z => (L.wings.find(w => z <= w.z0 + 0.01 && z > w.z1 - 0.3) || L.wings[L.wings.length - 1]);
  function checkWing() { const w = wingAt(pos.z); if (w && w.id !== state.wing) { state.wing = w.id; onWing?.(w.id, w.name); } }
  function applyCam() { camera.position.set(pos.x, state.eye, pos.z); camera.rotation.set(state.pitch, state.yaw, 0); }
  function goto(wingId) {
    const w = L.wings.find(x => x.id === wingId) || L.wings[0];
    // stand in the foyer, turned toward the wing's first game (if it has one) so a cabinet is in view
    const portrait = innerWidth < innerHeight, first = w.bays.find(b => b.game);
    pos.set(first ? -first.side * 0.9 : 0, 0, w.z0 - 0.6);
    state.yaw = first ? Math.atan2(-(first.x - pos.x), -(first.z - pos.z)) + first.side * (portrait ? 0.22 : 0.55) : 0;
    state.pitch = portrait ? -0.1 : -0.04; state.eye = EYE; applyCam(); checkWing();
  }
  function lookAtBay(key) {
    const B = L.bays.find(b => b.key === key || b.game?.id === key); if (!B) return;
    pos.set(B.side * 0.55, 0, B.z); state.eye = 1.45;
    const tgt = new THREE.Vector3(B.x, 1.3, B.z); const d = tgt.sub(new THREE.Vector3(pos.x, state.eye, pos.z));
    state.yaw = Math.atan2(-d.x, -d.z); state.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); applyCam(); checkWing();
  }
  const canvas = renderer.domElement; const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  const drags = new Map();
  canvas.addEventListener('pointerdown', e => { if (!state.active || isBlocked()) return; drags.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY }); try { canvas.setPointerCapture?.(e.pointerId); } catch { } });
  canvas.addEventListener('pointermove', e => {
    if (!state.active || isBlocked()) return;
    const d = drags.get(e.pointerId);
    if (d) { const k = e.pointerType === 'touch' ? 0.006 : 0.0045; state.yaw += (e.clientX - d.x) * k; state.pitch += (e.clientY - d.y) * k; state.pitch = THREE.MathUtils.clamp(state.pitch, -1.2, 1.0); d.x = e.clientX; d.y = e.clientY; return; }
    if (e.pointerType === 'mouse') { const now = performance.now(); if (now - (state.lastHover || 0) > 60) { state.lastHover = now; hover(e.clientX, e.clientY); } }
  });
  const end = e => { const d = drags.get(e.pointerId); drags.delete(e.pointerId); if (!state.active || !d || e.type === 'pointercancel') return; if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 7) pickAt(e.clientX, e.clientY); };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  const tip = document.getElementById('house-tip');
  function hit(x, y) {
    ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(scene.children, true).find(h => h.object.isMesh && !(h.object.material?.transparent && !h.object.userData.bay && !h.object.userData.exit));
    return h && (h.object.userData.bay || h.object.userData.exit || h.object.userData.novaPick) ? h : null;
  }
  const bayOf = key => L.bays.find(b => b.key === key);
  function hover(x, y) {
    const h = hit(x, y); canvas.style.cursor = h ? 'pointer' : 'grab';
    if (!tip) return;
    if (!h) { tip.hidden = true; return; }
    const B = h.object.userData.bay && bayOf(h.object.userData.bay);
    tip.textContent = B ? (B.game ? `▶ Play ${B.game.title}` : `Bay ${B.bay} · ${B.teaser ? B.teaser.title + ' (coming soon)' : 'coming soon'}`) : h.object.userData.exit ? '⟵ Go back outside' : 'Nova 🦊';
    tip.style.left = x + 14 + 'px'; tip.style.top = y + 12 + 'px'; tip.hidden = false;
  }
  function pickAt(x, y) {
    const h = hit(x, y); if (!h) return null;
    if (tip) tip.hidden = true;
    if (h.object.userData.exit) { onExit?.(); return 'exit'; }
    if (h.object.userData.novaPick) { onNova?.(); return 'nova'; }
    const B = bayOf(h.object.userData.bay);
    if (B?.game) { onPlay?.(B.game); return B.game.id; }
    if (B) { onSoon?.(B); return B.key; }
    return null;
  }
  let onNova = null;
  // touch joystick
  const joy = document.getElementById('arcade-joy'); const knob = joy?.querySelector('i');
  if (joy) {
    let jid = null, cx = 0, cy = 0;
    joy.addEventListener('pointerdown', e => { jid = e.pointerId; const r = joy.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; try { joy.setPointerCapture(e.pointerId); } catch { } move(e); e.preventDefault(); });
    const move = e => { if (e.pointerId !== jid) return; let dx = (e.clientX - cx) / 44, dy = (e.clientY - cy) / 44; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } state.joy.x = dx; state.joy.y = dy; knob.style.transform = `translate(${dx * 34}px,${dy * 34}px)`; };
    joy.addEventListener('pointermove', move);
    const up = e => { if (e.pointerId !== jid) return; jid = null; state.joy.x = state.joy.y = 0; knob.style.transform = ''; };
    joy.addEventListener('pointerup', up); joy.addEventListener('pointercancel', up);
  }
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), prev = new THREE.Vector3();
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
      prev.copy(pos); const sp = 2.6 * dt; pos.addScaledVector(fwd, mf * sp).addScaledVector(right, mr * sp); resolve(pos, prev);
      state.eye += (EYE - state.eye) * Math.min(1, dt * 2);
    }
    applyCam(); checkWing();
  }
  function setActive(on, wingId) {
    state.active = on; state.keys.clear(); state.joy.x = state.joy.y = 0; drags.clear(); if (tip) tip.hidden = true;
    if (on) { state.wing = null; goto(wingId); loadPreviews(); }
  }
  function screenPos(key) {
    const C = cabinets.find(c => c.B.key === key || c.B.game?.id === key); const E = C ? null : empty.find(e => e.B.key === key);
    const o = C ? C.screen : E?.sign; if (!o) return null;
    const v = o.getWorldPosition(new THREE.Vector3()).project(camera);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, inFront: v.z < 1 };
  }
  function daylight(st) { const p = st.pal; lights.forEach(l => { l.intensity = 20 * (0.85 + 0.15 * p.night); }); }
  function resize() { camera.aspect = innerWidth / innerHeight; camera.fov = innerWidth < innerHeight ? 78 : 70; camera.updateProjectionMatrix(); }
  resize();
  return {
    scene, camera, update, setActive, goto, lookAtBay, pickAt, screenPos, daylight, resize, state, pos, layout: L, cabinets,
    set onNova(fn) { onNova = fn; },
    get novaStatus() { return novaWhy; },
  };
}

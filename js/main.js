import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { rng, rule90, mesh, glow, glowSprite, textSprite, ease } from './util.js';
import { islandBase, decorate, makeSTLLoader } from './islands.js';
import { makeLorenz, lorenzBrain } from './lorenz.js';
import { renderPanel, renderUpTo, renderDecor, openSheet, closeSheets, setupUI } from './ui.js';
import { createHouse } from './house.js';

const SCALE = 1 / 9;               // WORLD_DATA canvas px -> world units
const world = await fetch('data/world.json').then(r => { if (!r.ok) throw new Error('world.json ' + r.status); return r.json(); });

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a1030, 0.0045);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 2000);
const PORTRAIT = innerWidth < innerHeight;
const HOME = { pos: new THREE.Vector3(0, 36, 96), target: new THREE.Vector3(0, 1, 4) };
if (PORTRAIT) { camera.fov = 66; camera.updateProjectionMatrix(); HOME.pos.set(0, 92, 150); HOME.target.set(0, -6, 6); }
camera.position.copy(HOME.pos);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(HOME.target);
controls.enableDamping = true; controls.dampingFactor = 0.07;
controls.minDistance = 4; controls.maxDistance = 220; controls.maxPolarAngle = Math.PI * 0.62;
controls.screenSpacePanning = true; controls.zoomToCursor = true;
controls.update();

// ---------- light ----------
scene.add(new THREE.HemisphereLight(0x8ea4ff, 0x1a1430, 1.1));
const moon = new THREE.DirectionalLight(0xc8d4ff, 1.4); moon.position.set(-60, 80, 40); scene.add(moon);
const warm = new THREE.DirectionalLight(0xffd59a, 0.8); warm.position.set(50, 30, -30); scene.add(warm);

// ---------- sky ----------
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: {},
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `varying vec3 vP; void main(){ float h = vP.y; vec3 top = vec3(0.012,0.02,0.07); vec3 mid = vec3(0.04,0.06,0.17); vec3 low = vec3(0.10,0.07,0.16);
    vec3 c = mix(mid, top, smoothstep(0.0, 0.7, h)); c = mix(c, low, smoothstep(0.05, -0.35, h));
    c += vec3(0.25,0.18,0.05) * pow(max(0., 1. - abs(h + 0.02) * 6.), 3.) * 0.35; gl_FragColor = vec4(c, 1.); }`,
}));
scene.add(sky);

const starMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  uniforms: { uTime: { value: 0 }, uPR: { value: renderer.getPixelRatio() } },
  vertexShader: `attribute float aSize; attribute float aPhase; attribute vec3 aColor; uniform float uTime; uniform float uPR; varying vec3 vC; varying float vA;
    void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv; float tw = 0.65 + 0.35*sin(uTime*(1.2+aPhase*0.7) + aPhase*20.);
    vA = tw; vC = aColor; gl_PointSize = aSize * uPR * (0.75 + 0.25*tw); }`,
  fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 p = gl_PointCoord-0.5; float d = length(p); float a = smoothstep(0.5,0.0,d); a = a*a; float cross = max(0., 1.-abs(p.x)*14.) * max(0.,1.-abs(p.y)*2.) + max(0., 1.-abs(p.y)*14.) * max(0.,1.-abs(p.x)*2.);
    gl_FragColor = vec4(vC, (a + cross*0.35*step(0.9,vA)) * vA); }`,
});
function addStars(points) {
  const g = new THREE.BufferGeometry(); const n = points.length;
  const pos = new Float32Array(n * 3), size = new Float32Array(n), ph = new Float32Array(n), col = new Float32Array(n * 3);
  points.forEach((p, i) => { pos.set(p.p, i * 3); size[i] = p.s; ph[i] = p.ph; col.set(p.c, i * 3); });
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1)); g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  const s = new THREE.Points(g, starMat); s.frustumCulled = false; scene.add(s); return s;
}
{
  const R = rng(90), pts = [];
  for (let i = 0; i < 2600; i++) {
    const u = R() * 2 - 1, th = R() * Math.PI * 2, y = Math.abs(u) * 0.95 + 0.02; const r = Math.sqrt(1 - y * y);
    const warmth = R(); const c = warmth > 0.85 ? [1, .85, .55] : warmth < 0.2 ? [.7, .8, 1] : [1, 1, 1];
    pts.push({ p: [Math.cos(th) * r * 800, y * 800 - 60, Math.sin(th) * r * 800], s: 1 + Math.pow(R(), 6) * 6, ph: R(), c });
  }
  addStars(pts);
  // Rule 90 constellation: a gold Sierpinski triangle (32 rows) hanging in the northern sky
  const rows = rule90(32), cpts = [];
  rows.forEach((row, ri) => row.forEach((v, ci) => { if (v) cpts.push({ p: [(ci - 31) * 3.8, 84 - ri * 3.8 * 0.87, -600], s: 6 + (ri % 8 === 0 ? 3 : 0), ph: (ri * 7 + ci) % 11 / 11, c: [1, .82, .42] }); }));
  addStars(cpts);
}
// moon
{
  const m = mesh(new THREE.SphereGeometry(16, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff2cf, fog: false }), -260, 230, -520, scene);
  const h = glowSprite(120, 0xffe9b0, 0.55); h.material.fog = false; h.position.copy(m.position); scene.add(h);
}

// ---------- islands ----------
const loadSTL = makeSTLLoader();
const islands = []; const pickables = []; const updaters = [];
const ctx = { world, loadSTL };
world.islands.forEach((isl, idx) => {
  const r = Math.max(6.5, isl.radius * SCALE * 1.15);
  const g = islandBase(isl, r, 100 + idx * 13);
  const x = (isl.x - 800) * SCALE * 1.15, z = (isl.y - 520) * SCALE * 1.15;
  const baseY = isl.id === 'hearth' ? 0 : Math.sin(idx * 2.1) * 3;
  g.position.set(x, baseY, z); g.rotation.y = 0;
  scene.add(g);
  const up = decorate(g, isl, ctx); if (up) updaters.push(up);
  const label = textSprite(isl.name, { size: 1.6, sub: `${isl.interest} · ${'★'.repeat(isl.level)}${'☆'.repeat(Math.max(0, (world.maxLevel || 5) - isl.level))}` });
  label.material.sizeAttenuation = false; label.scale.multiplyScalar(0.034 / 1.6);
  label.position.set(0, 7.5, 0); label.renderOrder = 10; label.material.depthTest = false; g.add(label);
  g.traverse(o => { if (o.isMesh) { o.userData.islandId = isl.id; pickables.push(o); } });
  islands.push({ data: isl, group: g, r, baseY, phase: idx * 1.7, label });
});
const byId = id => islands.find(i => i.data.id === id);

// soft golden light-threads from the Hearth to every island
const hearth = byId('hearth') || islands[0];
islands.forEach(isl => {
  if (isl === hearth) return;
  const a = hearth.group.position, b = isl.group.position;
  const mid = a.clone().add(b).multiplyScalar(0.5); mid.y += 6;
  const curve = new THREE.QuadraticBezierCurve3(a.clone().setY(a.y + 0.3), mid, b.clone().setY(b.y + 0.3));
  const pts = curve.getPoints(40); const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const line = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xe8c15a, size: 0.5, map: glowSprite().material.map, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(line);
});

// eleven paper lanterns drifting around the Hearth (a nod to 11)
const lanterns = [];
for (let i = 0; i < 11; i++) {
  const l = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.6, 8), glow(i % 2 ? 0xffc96a : 0xffa860, 1.8), 0, 0, 0, l);
  l.add(glowSprite(2.4, 0xffc070, 0.55));
  scene.add(l); lanterns.push(l);
}

// ---------- Lorenz ----------
const lorenz = makeLorenz();
hearth.group.add(lorenz);
const pondInfo = ctx.pond || { x: 0, z: 0, r: 2 };
const lorenzTick = lorenzBrain(lorenz, { center: new THREE.Vector3(-1, 0, 0.5), radius: hearth.r * 0.72, pond: new THREE.Vector3(pondInfo.x, 0, pondInfo.z), pondRadius: pondInfo.r, avoid: ctx.avoid || [] });
lorenz.traverse(o => { if (o.isMesh) { o.userData.islandId = 'hearth'; o.userData.lorenz = true; pickables.push(o); } });

// ---------- Nova ----------
const nova = new THREE.Group(); scene.add(nova);
const core = mesh(new THREE.IcosahedronGeometry(0.42, 2), new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffe39a, emissiveIntensity: 2.4 }), 0, 0, 0, nova);
nova.add(glowSprite(4.2, 0xffe6a0, 0.95));
const novaLight = new THREE.PointLight(0xffd88a, 18, 16, 1.6); nova.add(novaLight);
const sparks = []; for (let i = 0; i < 5; i++) { const s = glowSprite(0.5, 0xfff0c0, 0.9); nova.add(s); sparks.push(s); }
const novaTag = textSprite('Nova', { size: 0.55 }); novaTag.position.y = 1.4; nova.add(novaTag);
const novaHome = new THREE.Vector3(); let novaAt = hearth;
nova.position.copy(hearth.group.position).add(new THREE.Vector3(1.5, 3.5, 1.5));

// ---------- camera flights ----------
let flight = null, follow = null;
function flyTo(pos, target, dur = 1.6) {
  flight = { t: 0, dur, p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone() };
}
function islandView(isl) {
  const c = isl.group.position.clone(); c.y = isl.baseY + 1.5;
  const h = camera.position.clone().sub(controls.target); h.y = 0; if (h.lengthSq() < 1e-3) h.set(0, 0, 1); h.normalize();
  const portrait = innerWidth < innerHeight;
  const d = isl.r * 2.5 + (portrait ? 10 : 0);
  // on phones the info sheet covers the bottom, so aim lower to lift the island into view
  const target = portrait ? c.clone().add(new THREE.Vector3(0, -isl.r * 1.7, 0)) : c;
  return { pos: c.clone().addScaledVector(h, d).add(new THREE.Vector3(0, d * 0.55, 0)), target };
}
function visit(id, { open = true } = {}) {
  const isl = byId(id); if (!isl) return;
  follow = null; const v = islandView(isl); flyTo(v.pos, v.target); novaAt = isl;
  if (open) { renderPanel(isl.data, world, { onView: viewPrint }); openSheet('panel'); }
  setChip(id);
}
function home() { follow = null; flyTo(HOME.pos, HOME.target, 1.8); novaAt = hearth; closeSheets(); setChip('overview'); }
function meetLorenz() {
  follow = 'lorenz'; novaAt = hearth; closeSheets(); setChip('lorenz');
  const p = lorenz.getWorldPosition(new THREE.Vector3());
  const fwd = new THREE.Vector3(Math.sin(lorenz.rotation.y), 0, Math.cos(lorenz.rotation.y));
  const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
  flyTo(p.clone().addScaledVector(fwd, 2.6).addScaledVector(side, 1.4).add(new THREE.Vector3(0, 1.3, 0)), p.clone().add(new THREE.Vector3(0, 0.45, 0)), 1.8);
}

// ---------- picking ----------
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2(); let down = null;
canvas.addEventListener('pointerdown', e => { if (inside) return; down = { x: e.clientX, y: e.clientY, t: performance.now() }; flight = null; if (e.isPrimary) follow = follow === 'lorenz' ? 'lorenz' : null; });
canvas.addEventListener('pointerup', e => {
  if (inside) return;
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 7) return; down = null;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(pickables, false)[0];
  if (hit?.object.userData.lorenz) return meetLorenz();
  if (hit?.object.userData.house) return enterHouse();
  if (hit) visit(hit.object.userData.islandId);
});
canvas.addEventListener('pointermove', e => {
  if (inside || e.pointerType !== 'mouse' || e.buttons) return;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  canvas.style.cursor = ray.intersectObjects(pickables, false).length ? 'pointer' : 'grab';
});

// ---------- UI ----------
const chips = document.getElementById('chips');
function chip(label, id, fn) { const b = document.createElement('button'); b.className = 'pill'; b.textContent = label; b.dataset.id = id; b.onclick = fn; chips.appendChild(b); }
chip('✦ Overview', 'overview', home);
chip('🦆 Lorenz', 'lorenz', meetLorenz);
chip('🏡 House', 'house', () => enterHouse());
world.islands.forEach(i => chip(i.shortName || i.name, i.id, () => visit(i.id)));
function setChip(id) { chips.querySelectorAll('.pill').forEach(b => b.classList.toggle('on', b.dataset.id === id)); }
document.getElementById('motto').textContent = world.motto || '';
renderUpTo(world, { onEnterHouse: room => enterHouse(room) });
setupUI({ onUpTo: () => openSheet('upto') });

// ---------- Nova's House (walk-in interior) ----------
const cottage = ctx.cottage;
const roomLabel = document.getElementById('house-room');
const house = createHouse({
  renderer, world, loadSTL,
  onPick: (item, roomName) => { renderDecor(item, roomName, { onView: viewPrint }); openSheet('panel'); },
  onExit: () => exitHouse(),
  onRoom: (id, name) => { roomLabel.textContent = name; document.querySelectorAll('#room-chips .pill').forEach(b => b.classList.toggle('on', b.dataset.room === id)); },
});
let inside = false, busy = false;
const wait = ms => new Promise(r => setTimeout(r, ms));
const fadeEl = document.getElementById('fade');
const fade = on => fadeEl.classList.toggle('on', on);
async function enterHouse(room, { instant = false } = {}) {
  if (busy) return;
  if (inside) { closeSheets(); if (room) { busy = true; fade(true); await wait(220); house.goto(room); fade(false); busy = false; } return; }
  busy = true; closeSheets(); follow = null; setChip('house'); novaAt = hearth;
  if (!instant && cottage) {
    flyTo(cottage.doorFront(3.4), cottage.doorWorld(), 1.4); cottage.setDoor(true);
    await wait(1250); fade(true); await wait(420);
  }
  inside = true; controls.enabled = false; document.body.classList.add('in-house');
  house.setActive(true, room);
  fade(false); busy = false;
}
async function exitHouse() {
  if (!inside || busy) return;
  busy = true; closeSheets(); fade(true); await wait(380);
  inside = false; house.setActive(false); document.body.classList.remove('in-house'); controls.enabled = true;
  if (cottage) { camera.position.copy(cottage.doorFront(1.6)); controls.target.copy(cottage.doorWorld()); const far = innerWidth < innerHeight ? 14 : 8; flyTo(cottage.doorFront(far).add(new THREE.Vector3(0, far * 0.5, 0)), cottage.doorWorld(), 1.8); setTimeout(() => cottage.setDoor(false), 900); }
  fade(false); busy = false; setChip('hearth');
}
{
  const rc = document.getElementById('room-chips');
  for (const r of world.house?.rooms || []) { const b = document.createElement('button'); b.className = 'pill'; b.dataset.room = r.id; b.textContent = r.name; b.onclick = () => enterHouse(r.id); rc.appendChild(b); }
  document.getElementById('btn-exit').onclick = () => exitHouse();
  const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  document.body.classList.toggle('touch', touch);
  document.getElementById('house-hint').textContent = touch ? 'Left stick to walk · drag to look · tap things to read about them' : 'WASD or arrow keys to walk · drag to look · click things to read about them';
}

// ---------- STL viewer modal ----------
let viewer = null;
async function viewPrint(p) {
  const box = document.getElementById('viewer'); box.hidden = false;
  box.querySelector('h3').textContent = p.name; const dl = box.querySelector('.dl'); dl.href = p.stl; dl.setAttribute('download', p.stl.split('/').pop());
  dl.textContent = `⬇ Download STL (${p.sizeKB >= 1024 ? (p.sizeKB / 1024).toFixed(1) + ' MB' : p.sizeKB + ' KB'})`;
  const c = box.querySelector('canvas');
  if (!viewer) {
    const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true }); r.setPixelRatio(Math.min(devicePixelRatio, 2));
    const s = new THREE.Scene(); s.add(new THREE.HemisphereLight(0xc8d4ff, 0x2a2040, 1.6)); const dlt = new THREE.DirectionalLight(0xffe0a0, 2.2); dlt.position.set(3, 5, 4); s.add(dlt);
    const cam = new THREE.PerspectiveCamera(40, 1, 0.01, 100); cam.position.set(1.3, 1.0, 1.6);
    const oc = new OrbitControls(cam, c); oc.enableDamping = true; oc.autoRotate = true; oc.autoRotateSpeed = 2.5; oc.target.set(0, 0.5, 0);
    const holder = new THREE.Group(); s.add(holder);
    viewer = { r, s, cam, oc, holder, open: false };
  }
  viewer.open = true; viewer.holder.clear();
  const w = c.clientWidth, h = c.clientHeight; viewer.r.setSize(w, h, false); viewer.cam.aspect = w / h; viewer.cam.updateProjectionMatrix();
  const geo = await loadSTL(p.stl); geo.computeBoundingBox(); const bb = geo.boundingBox, sz = new THREE.Vector3(); bb.getSize(sz); const cc = new THREE.Vector3(); bb.getCenter(cc);
  const k = 1 / Math.max(sz.x, sz.y, sz.z);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: /duck|lorenz/i.test(p.stl) ? 0xf8e27a : 0xe8c15a, roughness: .45, metalness: .15 }));
  m.scale.setScalar(k); m.rotation.x = -Math.PI / 2; m.position.set(-cc.x * k, -bb.min.z * k, cc.y * k);
  viewer.holder.add(m); viewer.oc.target.set(0, sz.z * k / 2, 0);
}
function closeViewer() { document.getElementById('viewer').hidden = true; if (viewer) viewer.open = false; }
document.querySelector('#viewer .close').onclick = closeViewer;
document.getElementById('viewer').addEventListener('click', e => { if (e.target.id === 'viewer') closeViewer(); });

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.fov = innerWidth < innerHeight ? 66 : 50; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); house.resize();
});
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const open = document.querySelector('.sheet.open') || !document.getElementById('viewer').hidden || !document.getElementById('lightbox').hidden;
  closeSheets(); closeViewer(); document.getElementById('lightbox').hidden = true;
  if (!open && inside) exitHouse();
});

// ---------- loop ----------
let last = performance.now(), t = 0;
function frame() {
  const now = performance.now(); const dt = Math.min((now - last) / 1000, 0.05); last = now; t += dt;
  if (inside) {
    house.update(dt, t);
    renderer.render(house.scene, house.camera);
    if (viewer?.open) { viewer.oc.update(); viewer.r.render(viewer.s, viewer.cam); }
    requestAnimationFrame(frame); return;
  }
  starMat.uniforms.uTime.value = t;
  islands.forEach(i => { i.group.position.y = i.baseY + Math.sin(t * 0.5 + i.phase) * 0.35; });
  updaters.forEach(u => u(t, dt));
  lorenzTick(t, dt, 0.02);
  // lanterns orbit the Hearth slowly
  lanterns.forEach((l, i) => { const a = t * 0.05 + i / 11 * Math.PI * 2; const rr = hearth.r + 3 + (i % 3) * 1.5; l.position.set(hearth.group.position.x + Math.cos(a) * rr, 5 + Math.sin(t * 0.6 + i) * 0.8 + (i % 4), hearth.group.position.z + Math.sin(a) * rr); });
  // Nova floats near the island being visited, circling once every 11 seconds
  const hp = novaAt.group.position; const a = t * Math.PI * 2 / 11;
  novaHome.set(hp.x + Math.cos(a) * (novaAt.r * 0.45), hp.y + 3.4 + Math.sin(t * 1.3) * 0.4, hp.z + Math.sin(a) * (novaAt.r * 0.45));
  nova.position.lerp(novaHome, Math.min(1, dt * 1.2));
  core.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
  sparks.forEach((s, i) => { const b = t * 1.6 + i * 1.26; s.position.set(Math.cos(b) * 0.9, Math.sin(b * 1.3) * 0.5, Math.sin(b) * 0.9); });
  if (flight) {
    flight.t += dt; const k = ease(Math.min(1, flight.t / flight.dur));
    camera.position.lerpVectors(flight.p0, flight.p1, k); controls.target.lerpVectors(flight.t0, flight.t1, k);
    if (k >= 1) flight = null;
  } else if (follow === 'lorenz') {
    const p = lorenz.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.5, 0));
    const d = p.clone().sub(controls.target); controls.target.add(d.multiplyScalar(Math.min(1, dt * 2))); camera.position.add(d);
  }
  controls.update();
  renderer.render(scene, camera);
  if (viewer?.open) { viewer.oc.update(); viewer.r.render(viewer.s, viewer.cam); }
  requestAnimationFrame(frame);
}
frame();
document.getElementById('loading').style.opacity = 0;
setTimeout(() => document.getElementById('loading').remove(), 900);
setTimeout(() => { const h = document.getElementById('hint'); if (h) h.style.opacity = 0; }, 9000);

// small hooks for tests and future sessions
window.nova = { visit, home, meetLorenz, enterHouse, exitHouse, house, world, get inside() { return inside; }, get busy() { return busy; }, ready: true };
window.__houseView = () => { if (!cottage) return; follow = null; flyTo(cottage.group.localToWorld(new THREE.Vector3(2.2, 3.2, 7.5)), cottage.group.localToWorld(new THREE.Vector3(0, 1.4, 0)), 0.01); };
window.__cottageScreen = () => { if (!cottage) return null; const v = cottage.group.localToWorld(new THREE.Vector3(0.9, 1.0, 1.6)).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; };
const q = new URLSearchParams(location.search);
if (q.get('island')) visit(q.get('island'));
if (q.has('lorenz')) meetLorenz();
if (q.has('house')) enterHouse(q.get('house') || undefined, { instant: true });

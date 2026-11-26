import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { rng, rule90, mesh, glow, glowSprite, textSprite, ease } from './util.js';
import { placeBase, decorate, makeSTLLoader, GRASS } from './islands.js';
import { createPlanet } from './planet.js';
import { createRealm, createFlatWalker } from './realm.js';
import { makeLorenz, lorenzBrain } from './lorenz.js';
import { makeNova, novaBrain } from './novabody.js';
import { NEEDS, initNeeds, tickNeeds, makeNeedsBubble } from './needs.js';
import { renderPanel, renderUpTo, renderDecor, renderNova, renderArcadePanel, renderStudioBox, openSheet, closeSheets, setupUI } from './ui.js';
import { createRadio } from './radio.js';
import { openLightbox, lightboxState } from './lightbox.js';
import { createHouse } from './house.js';
import { makeClock, skyState, collectGlows, DAY } from './daylight.js';
import { setHolidayNow, feastStage, feastSitting, ymd, season, christmasOn, christmasStage } from './holiday.js';
import { createWeather } from './weather.js';
import { applyPalette } from './seasons.js';
import { skyDir, fmtTime, REF } from './sun.js';
import { setupSkyClock } from './skyclock.js';
import { buildArcadeTree, createArcade } from './arcade.js';
import { createArcadePlayer } from './arcadeplayer.js';
import { createPostcardMaker } from './postcard.js';
import { createScopeView } from './scopeview.js';
import { createCafe } from './cafe.js';
import { createGiftShop } from './giftshop.js';
import { createVisitorCounter, visitorChip } from './visitors.js';
import { createWall } from './wall.js';
import { createMuseum } from './museum.js';
import { createGfx, addRim, contactShadow } from './gfx.js';
import { createGrass } from './grass.js';
import { createLife } from './life.js';
import { createInteract } from './interact.js';

const SCALE = 1 / 9;               // WORLD_DATA island radius px -> world units
const world = await fetch('data/world.json').then(r => { if (!r.ok) throw new Error('world.json ' + r.status); return r.json(); });
// Nova's Arcade (data/arcade.json): optional, the world still loads without it
const arcadeData = await fetch('data/arcade.json').then(r => (r.ok ? r.json() : null)).catch(() => null);
// Exoplanet postcards (data/postcards.json, real NASA Exoplanet Archive values): optional too
const postcardData = await fetch('data/postcards.json').then(r => (r.ok ? r.json() : null)).catch(() => null);

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
const gfx = createGfx(renderer, scene);   // quality tier, soft shadows, bloom, material detail (js/gfx.js)
renderer.setSize(innerWidth, innerHeight);
scene.fog = new THREE.FogExp2(0x0a1030, 0.0045);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 2000);
const PORTRAIT = innerWidth < innerHeight;
// Nova's tiny planet (js/planet.js, data/planet.json): every island sits on one small round world
const planet = createPlanet(world.planet || { radius: 44 });
const PR = planet.R;
scene.add(planet.group);
const Y = new THREE.Vector3(0, 1, 0);
// the overview: the whole planet from a little above, like the sketch
const HOME = { pos: new THREE.Vector3(0, 0.46, 0.89).normalize().multiplyScalar(PR * 3.0), target: new THREE.Vector3(0, 0, 0) };
if (PORTRAIT) { camera.fov = 66; camera.updateProjectionMatrix(); HOME.pos.setLength(PR * 4.1); HOME.target.set(0, -PR * 0.32, 0); }
camera.position.copy(HOME.pos);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(HOME.target);
controls.enableDamping = true; controls.dampingFactor = 0.07;
controls.minDistance = 3; controls.maxDistance = PR * 7; controls.maxPolarAngle = Math.PI;
controls.screenSpacePanning = true; controls.zoomToCursor = true;
controls.update();
// OrbitControls caches "which way is up" when it is made; on a planet up changes with where you look
function setUp(u) {
  camera.up.copy(u);
  controls._quat.setFromUnitVectors(camera.up, Y); controls._quatInverse.copy(controls._quat).invert();
}

// ---------- light ----------
const hemi = new THREE.HemisphereLight(0x8ea4ff, 0x1a1430, 1.1); scene.add(hemi);
const moon = new THREE.DirectionalLight(0xc8d4ff, 1.4); moon.position.set(-60, 80, 40); scene.add(moon);
const warm = new THREE.DirectionalLight(0xffd59a, 0.8); warm.position.set(50, 30, -30); scene.add(warm);
const sunLight = new THREE.DirectionalLight(0xfff2dc, 0); sunLight.position.set(0, 80, -60); scene.add(sunLight);
// lights are defined in "sky space" (up = Y) and turned each frame to match the ground under the camera
const LBASE = { moon: moon.position.clone(), warm: warm.position.clone(), sun: sunLight.position.clone() };

// ---------- sky ----------
// The sky is one shader driven by the time of day (js/daylight.js). With the
// night uniforms it is exactly the original Night and Gold sky.
const v3 = a => new THREE.Vector3(...a);
const skyU = {
  uTop: { value: v3([0.012, 0.02, 0.07]) }, uDeep: { value: v3([0.10, 0.07, 0.16]) }, uMid: { value: v3([0.04, 0.06, 0.17]) }, uLow: { value: v3([0.10, 0.07, 0.16]) }, uBand: { value: v3([0.0875, 0.063, 0.0175]) },
  uSunDir: { value: new THREE.Vector3(0, -1, 0) }, uSunCol: { value: v3([1, 0.8, 0.5]) }, uSunGlow: { value: 0 }, uTwi: { value: 0 },
  uCloud: { value: 0 }, uCloudCol: { value: v3([1, 1, 1]) }, uTime: { value: 0 }, uSpace: { value: 0 }, uRays: { value: 0 }, uNight: { value: 0 },
};
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform vec3 uTop, uMid, uLow, uDeep, uBand, uSunDir, uSunCol, uCloudCol; uniform float uSunGlow, uTwi, uCloud, uTime, uSpace, uRays, uNight; varying vec3 vP;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
    float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 4; i++){ v += a*noise(p); p = p*2.03 + vec2(1.7, 9.2); a *= .5; } return v; }
    void main(){ vec3 d = normalize(vP); float h = d.y;
    vec3 c = mix(uMid, uTop, smoothstep(0.0, 0.7, h)); c = mix(c, uLow, smoothstep(0.05, -0.35, h)); c = mix(c, uDeep, smoothstep(-0.25, -0.75, h));
    c += uBand * pow(max(0., 1. - abs(h + 0.02) * 6.), 3.);
    float sd = max(0., dot(d, uSunDir));
    vec2 hz = normalize(d.xz + 1e-5), sz = normalize(uSunDir.xz + 1e-5);
    float toward = max(0., dot(hz, sz));
    c += uBand * 2.2 * pow(toward, 3.) * pow(max(0., 1. - abs(h - 0.03) * 3.), 2.) * uTwi;
    c += uSunCol * (pow(sd, 6.) * 0.22 + pow(sd, 60.) * 0.7) * uSunGlow;
    // golden hour: soft sunbeams fanning out from a low sun (periodic in angle, so no seam)
    if (uRays > 0.01 && h > -0.05) {
      vec3 sr = normalize(cross(uSunDir, vec3(0., 1., 0.)) + vec3(1e-4, 0., 0.)), su = cross(sr, uSunDir);
      vec3 off = d - uSunDir * dot(d, uSunDir); float ang = atan(dot(off, su), dot(off, sr));
      float dist = acos(clamp(dot(d, uSunDir), -1., 1.));
      float beams = smoothstep(0.42, 0.85, noise(vec2(cos(ang), sin(ang)) * 4.5 + vec2(uTime * 0.03, -uTime * 0.02)));
      float fall = exp(-dist * 1.6) * smoothstep(0.12, 0.3, dist) * smoothstep(-0.05, 0.06, h);
      c += uSunCol * beams * fall * uRays * 0.2 * (1. - smoothstep(0.7, 0.95, uCloud));
    }
    // a high, thin cirrus layer drifting the other way, above the puffy clouds
    if (h > 0.0) {
      vec2 cu = d.xz / (h + 0.35) * vec2(0.55, 2.3) + vec2(-uTime * 0.004, uTime * 0.0012);
      float cn = fbm(cu * 1.3 + 11.);
      float ca = smoothstep(0.56, 0.86, cn) * (0.22 + 0.45 * uCloud) * smoothstep(0.03, 0.3, h) * (1. - uSpace);
      vec3 ccol = mix(uCloudCol, uSunCol, 0.3 * uTwi) * 0.92;
      c = mix(c, ccol, ca * 0.5);
    }
    // a shooting star now and then on clear nights
    if (uNight > 0.3 && h > 0.12) {
      float per = 9.0, sid = floor(uTime / per), f = mod(uTime, per);
      if (hash(vec2(sid, 3.1)) > 0.4 && f < 1.1) {
        vec2 A = (vec2(hash(vec2(sid, 1.)), hash(vec2(sid, 2.))) - 0.5) * 1.4;
        vec2 dir = normalize(vec2(hash(vec2(sid, 5.)) - 0.5, hash(vec2(sid, 6.)) - 0.5));
        vec2 q = d.xz / (h + 0.25);
        vec2 P = A + dir * f * 0.8, T = P - dir * 0.22;
        vec2 pa = q - T, ba = P - T; float k = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.);
        float ln = length(pa - ba * k);
        c += vec3(1., 0.93, 0.75) * smoothstep(0.007, 0.0, ln) * k * (1. - f / 1.1) * (uNight - 0.3) * 2.2 * (1. - uCloud);
      }
    }
    if (uCloud > 0.01 && h > 0.0) {
      vec2 uv = d.xz / (h + 0.14) * 1.3 + vec2(uTime * 0.006, uTime * 0.002);
      float n = fbm(uv);
      float a = smoothstep(0.46, 0.74, n) * uCloud * smoothstep(0.0, 0.16, h);
      vec3 cc = uCloudCol * (0.8 + 0.28 * fbm(uv * 2.1 + 3.)) + uSunCol * pow(sd, 5.) * 0.35 * uSunGlow;
      c = mix(c, cc, a);
    }
    c = mix(c, vec3(0.006, 0.01, 0.035) + uSunCol * pow(sd, 40.) * 0.25 * uSunGlow, uSpace);   // out in space, high above the planet
    gl_FragColor = vec4(c, 1.); }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat);
// the whole sky (dome, stars, Rule 90 constellation, sun, moon) rides with the camera and is
// tilted so its zenith is "up" for whoever stands on the planet below
const skyGroup = new THREE.Group(); scene.add(skyGroup); skyGroup.add(sky);
const qSky = new THREE.Quaternion(), focusUp = new THREE.Vector3(0, 1, 0);

const starMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  uniforms: { uTime: { value: 0 }, uPR: { value: renderer.getPixelRatio() }, uFade: { value: 1 } },
  vertexShader: `attribute float aSize; attribute float aPhase; attribute vec3 aColor; uniform float uTime; uniform float uPR; varying vec3 vC; varying float vA;
    void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv; float tw = 0.65 + 0.35*sin(uTime*(1.2+aPhase*0.7) + aPhase*20.);
    vA = tw; vC = aColor; gl_PointSize = aSize * uPR * (0.75 + 0.25*tw); }`,
  fragmentShader: `uniform float uFade; varying vec3 vC; varying float vA; void main(){ vec2 p = gl_PointCoord-0.5; float d = length(p); float a = smoothstep(0.5,0.0,d); a = a*a; float cross = max(0., 1.-abs(p.x)*14.) * max(0.,1.-abs(p.y)*2.) + max(0., 1.-abs(p.y)*14.) * max(0.,1.-abs(p.x)*2.);
    gl_FragColor = vec4(vC, (a + cross*0.35*step(0.9,vA)) * vA * uFade); }`,
});
let spaceStars = null;
const spaceStarMat = starMat.clone(); spaceStarMat.uniforms.uFade.value = 0;
function addStars(points, material = starMat) {
  const g = new THREE.BufferGeometry(); const n = points.length;
  const pos = new Float32Array(n * 3), size = new Float32Array(n), ph = new Float32Array(n), col = new Float32Array(n * 3);
  points.forEach((p, i) => { pos.set(p.p, i * 3); size[i] = p.s; ph[i] = p.ph; col.set(p.c, i * 3); });
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1)); g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  const s = new THREE.Points(g, material); s.frustumCulled = false; skyGroup.add(s); return s;
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
  // stars all the way round, seen from orbit (they fade in with uSpace)
  const spts = [];
  for (let i = 0; i < 1400; i++) {
    const u = R() * 2 - 1, th = R() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    spts.push({ p: [Math.cos(th) * r * 820, u * 820, Math.sin(th) * r * 820], s: 1 + Math.pow(R(), 5) * 5, ph: R(), c: R() > 0.8 ? [1, .85, .6] : [.85, .9, 1] });
  }
  spaceStars = addStars(spts, spaceStarMat);
}
// moon (lit by the real sun direction, so its phase is right) and the sun
const moonU = { uSunDir: skyU.uSunDir, uAlpha: { value: 1 } };
const moonMesh = mesh(new THREE.SphereGeometry(16, 24, 16), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, fog: false, uniforms: moonU,
  vertexShader: 'varying vec3 vN; void main(){ vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform vec3 uSunDir; uniform float uAlpha; varying vec3 vN; void main(){ float l = smoothstep(-0.06, 0.12, dot(normalize(vN), uSunDir));
    vec3 c = mix(vec3(0.10, 0.12, 0.22), vec3(1.0, 0.95, 0.81), l); gl_FragColor = vec4(c, uAlpha * mix(0.35, 1., l)); }`,
}), -260, 230, -520, skyGroup);
moonMesh.renderOrder = -1;
const moonHalo = glowSprite(120, 0xffe9b0, 0.55); moonHalo.material.fog = false; moonHalo.material.userData.anim = true; moonHalo.position.copy(moonMesh.position); skyGroup.add(moonHalo);
const sunDisk = mesh(new THREE.SphereGeometry(22, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff2d0, fog: false, transparent: true, depthWrite: false }), 0, -800, 0, skyGroup);
const sunHalo = glowSprite(260, 0xffd890, 0.7); sunHalo.material.fog = false; sunHalo.material.userData.anim = true; skyGroup.add(sunHalo);
const sunHalo2 = glowSprite(90, 0xfff4dc, 0.9); sunHalo2.material.fog = false; sunHalo2.material.userData.anim = true; skyGroup.add(sunHalo2);
sunDisk.renderOrder = moonHalo.renderOrder = sunHalo.renderOrder = sunHalo2.renderOrder = -1;

// ---------- islands ----------
const loadSTL = makeSTLLoader();
const islands = []; const pickables = []; const updaters = [];

const ctx = { world, loadSTL, home: null, postcards: postcardData, pickables: null };   // home: null = places face their own "front" (local +z)
ctx.pickables = pickables;
const xray = [];   // labels drawn through everything; hidden when the planet is in the way
// put a place group on the planet: built at the origin, then moved to its lat/lon with up = ground normal
function setOnPlanet(id, g, r, solidsFromData) {
  g.updateMatrixWorld(true);
  const pl = planet.place(id, r);
  // walk blockers: anything standing taller than knee height on the place (in local coords)
  const local = [];
  for (const c of g.children) {
    if (c.isSprite || c.userData.pad || c.userData.noSolid) continue;
    const bb = new THREE.Box3().setFromObject(c); if (bb.isEmpty()) continue;
    const sz = bb.getSize(new THREE.Vector3()), cen = bb.getCenter(new THREE.Vector3());
    if (sz.y < 0.9 || bb.min.y > 1.2) continue;
    const rad = Math.max(sz.x, sz.z) / 2 * 0.8; if (rad < 0.25 || rad > 6.5) continue;
    local.push([cen.x, cen.z, rad]);
  }
  for (const sd of solidsFromData || []) local.push(sd);
  g.position.copy(pl.pos); g.quaternion.copy(pl.quat); g.updateMatrixWorld(true);
  for (const [x, z, rr] of local) planet.addSolid(g.localToWorld(new THREE.Vector3(x, 0, z)), rr);
  pl.localSolids = local;
  return pl;
}
world.islands.forEach((isl, idx) => {
  const r = Math.max(6.5, isl.radius * SCALE * 1.15);
  const g = placeBase(isl, r);
  scene.add(g);
  const up = decorate(g, isl, ctx); if (up) updaters.push(up);
  if (isl.id === 'hearth' && ctx.cottage) {   // the cottage gets exact blockers so you can walk up to the door
    const cg = ctx.cottage.group; cg.userData.noSolid = true; cg.updateMatrixWorld(true);
    ctx.cottageSolids = [[0, 0, 2.0], [2.5, -0.5, 1.0], [2.5, 1.0, 0.75]].map(([x, z, rr]) => { const v = cg.localToWorld(new THREE.Vector3(x, 0, z)); return [v.x, v.z, rr * cg.scale.x]; });
  }
  const pl = setOnPlanet(isl.id, g, r, [...(world.planet?.places?.[isl.id]?.solid || []), ...(isl.id === 'hearth' ? ctx.cottageSolids || [] : [])]);
  const label = textSprite(isl.name, { size: 1.6, sub: `${isl.interest} · ${'★'.repeat(isl.level)}${'☆'.repeat(Math.max(0, (world.maxLevel || 5) - isl.level))}` });
  label.material.sizeAttenuation = false; label.scale.multiplyScalar(0.034 / 1.6);
  label.position.set(0, 7.5, 0); label.renderOrder = 10; label.material.depthTest = false; g.add(label);
  g.traverse(o => { if (o.isMesh) { o.userData.islandId = isl.id; pickables.push(o); } });
  islands.push({ data: isl, group: g, r, baseY: 0, phase: idx * 1.7, label, place: pl });
});
const byId = id => islands.find(i => i.data.id === id);

// ---------- Pixel Studio: radio + clickable paintings (js/studio.js, js/radio.js, js/lightbox.js) ----------
const studio = ctx.studio || null;
const radio = createRadio(world.radio, { onChange: st => studio?.setRadio(st) });
ctx.radioLevel = () => radio.level();
const paintings = world.studio?.paintings || [];
function openPainting(id) { const i = typeof id === 'number' ? id : paintings.findIndex(p => p.id === id); if (i >= 0) openLightbox(paintings, i); return i >= 0; }
// the radio stops when you leave the studio, go inside, or open a game
function leaveStudio(reason) { if (radio.state.on) radio.off(reason); }

// ---------- Nova's Arcade: a giant hollow tree on its own island (js/arcade.js) ----------
let arcadeExt = null;
if (arcadeData?.wings?.length) {
  const A = arcadeData.island || {};
  const r = Math.max(6.5, (A.radius || 120) * SCALE * 1.15);
  const data = { id: 'arcade', name: arcadeData.name || "Nova's Arcade", shortName: 'Arcade', interest: 'games I build', level: 1, artifacts: [], arcade: true };
  const g = placeBase(data, r); scene.add(g);
  // the doorway faces the place's front (local +z); data/planet.json yaw turns it
  arcadeExt = buildArcadeTree(g, arcadeData, { rot: 0 });
  var arcadePlace = setOnPlanet('arcade', g, r, world.planet?.places?.arcade?.solid || [[0, 0, 4.4]]);
  updaters.push(arcadeExt.update);
  const nGames = (arcadeData.games || []).length, nBays = arcadeData.wings.reduce((s, w) => s + (w.bays || 0), 0);
  const label = textSprite(data.name, { size: 1.6, sub: `${nGames} game${nGames === 1 ? '' : 's'} · ${nBays} bays · ${arcadeData.wings.length} wings` });
  label.material.sizeAttenuation = false; label.scale.multiplyScalar(0.034 / 1.6);
  label.position.set(0, 22, 0); label.renderOrder = 10; label.material.depthTest = false; g.add(label);
  g.traverse(o => { if (o.isMesh) { o.userData.islandId = 'arcade'; pickables.push(o); } });
  islands.push({ data, group: g, r, baseY: 0, phase: 4.2, label, place: arcadePlace });
}

const hearth = byId('hearth') || islands[0];
// the planet's ground, gold paths, lanterns, trees, flowers, fireflies and moons
planet.build({ grass: GRASS });
// ---------- the Realm (js/realm.js): the same places laid out flat on one big ground-level world ----------
// The tiny planet is the map you see from space; tapping a place lands you here.
const realm = createRealm(world.planet || {}, islands.map(i => ({ id: i.data.id, r: i.r, name: i.data.name, short: i.data.shortName })), { grass: GRASS });
const grass = createGrass(realm, { density: gfx.T.grass, reach: gfx.T.grass >= 1 ? 42 : 28 });   // swaying blades near you (js/grass.js)
realm.group.add(grass.group); gfx.onTier(T => grass.setTier(T));
const life = createLife(realm, { amount: gfx.T.life }); realm.group.add(life.group); gfx.onTier(T => { life.amount = T.life; });   // butterflies + birds (js/life.js)
scene.add(realm.group);
pickables.push(...realm.pickables);
for (const i of islands) {
  const rp = realm.places.get(i.data.id);
  i.planetPose = { pos: i.group.position.clone(), quat: i.group.quaternion.clone() };
  i.realmPose = { pos: rp.pos.clone(), quat: rp.quat.clone() };
  realm.addSolids(i.data.id, i.place.localSolids || []);
}
let inRealm = false;
const UP = p => (inRealm ? Y.clone() : p.clone().normalize());       // "up" at a point: plain Y on flat ground, away from the centre on the planet
const placeUp = isl => (inRealm ? Y.clone() : isl.place.n.clone());
islands.forEach(i => i.group.traverse(o => { if (o.isSprite && o.material.depthTest === false) xray.push(o); }));
// eleven paper lanterns drifting around the Hearth (a nod to 11)
const lanterns = [];
for (let i = 0; i < 11; i++) {
  const l = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.6, 8), glow(i % 2 ? 0xffc96a : 0xffa860, 1.8), 0, 0, 0, l);
  l.add(glowSprite(2.4, 0xffc070, 0.55));
  hearth.group.add(l); lanterns.push(l);
}

// ---------- Lorenz ----------
const lorenz = makeLorenz();
hearth.group.add(lorenz);
const pondInfo = ctx.pond || { x: 0, z: 0, r: 2 };
const pondV = new THREE.Vector3(pondInfo.x, 0, pondInfo.z);
// Two pillows on the pond shore, a fox-length apart, so they never curl up inside each other.
const shoreA = Math.atan2(0.5 - pondInfo.z, -1 - pondInfo.x);
const lorenzBed = new THREE.Vector3(pondInfo.x + Math.cos(shoreA - 0.55) * (pondInfo.r + 0.7), 0, pondInfo.z + Math.sin(shoreA - 0.55) * (pondInfo.r + 0.7));
const novaBed = new THREE.Vector3(pondInfo.x + Math.cos(shoreA + 0.55) * (pondInfo.r + 1.15), 0, pondInfo.z + Math.sin(shoreA + 0.55) * (pondInfo.r + 1.15));
const FRIEND_SEP = 2.5;
const novaBody = makeNova({ lights: 'both' });
const lorenzTick = lorenzBrain(lorenz, { center: new THREE.Vector3(-1, 0, 0.5), radius: hearth.r * 0.72, pond: new THREE.Vector3(pondInfo.x, 0, pondInfo.z), pondRadius: pondInfo.r, avoid: ctx.avoid || [], sleepy: () => DAY.night > 0.6, swimChance: () => 0.3 + 0.35 * DAY.day, feast: { active: () => feastSitting(), seat: () => ctx.feast && ctx.feast.lorenzSeat }, bed: lorenzBed, clearOf: () => novaBody.root.position, minSep: FRIEND_SEP });
lorenz.traverse(o => { if (o.isMesh) { o.userData.islandId = 'hearth'; o.userData.lorenz = true; pickables.push(o); } });

// ---------- Nova ----------
// Nova's body (js/novabody.js): a small midnight-blue fox with a glowing tail tip.
// She wanders the islands, sits with Lorenz, curls up in her own bed at night and
// travels between islands as her old ball of light.
const novaBrainT = novaBrain(novaBody, { scene, islands, hearth, lorenz, avoidHearth: ctx.avoid || [], pond: { x: pondInfo.x, z: pondInfo.z, r: pondInfo.r }, lorenzBed: novaBed, scale: 1.3, flat: () => inRealm, feast: { active: () => feastSitting(), seat: () => ctx.feast && ctx.feast.novaSeat } });
function keepFriendsApart() {
  if (inside || inArcade || novaBrainT.island !== hearth) return;
  if (novaBrainT.mode === 'feast' || novaBrainT.mode === 'travel') return;
  const seat = ctx.feast && ctx.feast.lorenzSeat;
  if (seat && feastSitting() && Math.hypot(lorenz.position.x - seat.x, lorenz.position.z - seat.z) < 0.35) return;
  // a few passes with a hair of margin: the pond clamps below can undo part of a push
  for (let pass = 0; pass < 3; pass++) if (!separateOnce(FRIEND_SEP + 0.06)) break;
}
function separateOnce(SEP) {
  const np = novaBody.root.position, lp = lorenz.position;
  const dx = np.x - lp.x, dz = np.z - lp.z, d = Math.hypot(dx, dz);
  if (d >= SEP - 0.04 || d < 1e-5) return false;
  const ux = dx / d, uz = dz / d;
  const lorenzInPond = Math.hypot(lp.x - pondInfo.x, lp.z - pondInfo.z) < pondInfo.r * 0.9;
  if (lorenzInPond) { np.x += ux * (SEP - d); np.z += uz * (SEP - d); }
  else {
    const push = (SEP - d) / 2;
    np.x += ux * push; np.z += uz * push;
    lp.x -= ux * push; lp.z -= uz * push;
    const pd = Math.hypot(lp.x - pondInfo.x, lp.z - pondInfo.z);
    if (pd < pondInfo.r + 0.4) {
      const s = (pondInfo.r + 0.4) / (pd || 1e-4);
      lp.x = pondInfo.x + (lp.x - pondInfo.x) * s;
      lp.z = pondInfo.z + (lp.z - pondInfo.z) * s;
    }
  }
  const nd = Math.hypot(np.x - pondInfo.x, np.z - pondInfo.z);
  if (nd < pondInfo.r + 0.55) {
    const s = (pondInfo.r + 0.55) / (nd || 1e-4);
    np.x = pondInfo.x + (np.x - pondInfo.x) * s;
    np.z = pondInfo.z + (np.z - pondInfo.z) * s;
  }
  return true;
}
novaBody.root.traverse(o => { if (o.isMesh) { o.userData.novaPick = true; pickables.push(o); } });
let toastFn = () => {};
const interact = createInteract({
  scene, camera, renderer, realm, novaBody, novaBrain: novaBrainT, lorenz, gfx,
  inRealm: () => inRealm, toast: (m) => toastFn(m),
});
// character polish (js/gfx.js): a soft gold rim on both silhouettes, and a contact shadow under each
addRim(novaBody.root, 1); addRim(lorenz, 0.8);
contactShadow(novaBody.rig, 0.55, 0.4);
const lorenzBlob = contactShadow(lorenz, 1.35, 0.38);
// name tag: constant on-screen size, lives in the scene (not inside her scaled body),
// fades out up close so it can never fill the screen (the old "huge tag after leaving the house" bug)
const novaTag = textSprite('Nova', { size: 0.55 });
novaTag.material.sizeAttenuation = false; novaTag.scale.multiplyScalar(0.026 / 0.55); novaTag.renderOrder = 9; scene.add(novaTag);
// mood bubble above the name tag (js/needs.js): shows her real meters; absent if data/needs.json can't be read
const needsBubble = makeNeedsBubble(); needsBubble.sprite.renderOrder = 9; scene.add(needsBubble.sprite);
initNeeds();
let novaAt = hearth;
const _np = new THREE.Vector3(), _nu = new THREE.Vector3();
function placeNovaTag(dt) {
  novaBrainT.worldPos(_np); _np.addScaledVector(inRealm ? _nu.copy(Y) : _nu.copy(_np).normalize(), 2.15);   // "up" is away from the planet's centre
  novaTag.position.lerp(_np, novaTag.userData.ok ? Math.min(1, dt * 10) : 1); novaTag.userData.ok = true;
  const d = camera.position.distanceTo(_np);
  const a = THREE.MathUtils.smoothstep(d, 3, 6) * (1 - THREE.MathUtils.smoothstep(d, 70, 110)) * (flight ? 0.6 : 1) * (!inRealm && planet.hidden(camera.position, _np) ? 0 : 1);
  novaTag.material.opacity = a; novaTag.visible = a > 0.02;
  needsBubble.place(novaTag.position, novaTag.scale.y, a * (inRealm ? 1 : 1 - THREE.MathUtils.smoothstep(d, 30, 55)));   // from orbit the bubble sat on top of the Hearth's name tag
}

// ---------- camera flights ----------
let flight = null, follow = null;
// flights go around the planet, not through it: directions are slerped and the
// radius gets a bump on long hops; the camera's up turns smoothly to the new ground
const _fa = new THREE.Vector3(), _fb = new THREE.Vector3(), _fq = new THREE.Quaternion();
function upFor(target) { return !inRealm && target.length() > PR * 0.5 ? target.clone().normalize() : Y.clone(); }
function flyTo(pos, target, dur = 1.6, up = upFor(target)) {
  if (walker.active) stopWalking({ fly: false });
  const p0 = camera.position.clone(), ang = p0.angleTo(pos);
  if (inRealm) { realm.prewarm(pos.x, pos.z); const L = p0.distanceTo(pos); flight = { flat: true, t: 0, dur: L > 120 ? Math.max(dur, Math.min(4.5, L / 90)) : dur, p0, t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), u0: Y.clone(), u1: Y.clone(), bump: L > 60 ? Math.min(90, L * 0.18) : 0 }; }
  else flight = { t: 0, dur, p0, t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), u0: camera.up.clone(), u1: up.clone().normalize(), bump: ang > 0.35 ? PR * 0.3 * ang : 0 };
  if (dur <= 0.02) { flight.t = dur; stepFlight(0); }
}
function slerpV(a, b, k, out) {   // spherical blend of two points about the planet centre
  const la = a.length(), lb = b.length();
  if (la < 1 || lb < 1) return out.lerpVectors(a, b, k);
  _fa.copy(a).divideScalar(la); _fb.copy(b).divideScalar(lb);
  _fq.setFromUnitVectors(_fa, _fb); const q = new THREE.Quaternion().slerp(_fq, k);
  return out.copy(_fa).applyQuaternion(q).multiplyScalar(la + (lb - la) * k);
}
function stepFlight(dt) {
  flight.t += dt; const k = ease(Math.min(1, flight.t / flight.dur));
  if (flight.flat) {   // flat realm: straight glide, lifted in the middle of long hops
    camera.position.lerpVectors(flight.p0, flight.p1, k); camera.position.y += flight.bump * Math.sin(Math.PI * k);
    controls.target.lerpVectors(flight.t0, flight.t1, k); setUp(Y);
    if (k >= 1) flight = null; return;
  }
  slerpV(flight.p0, flight.p1, k, camera.position);
  if (flight.bump) camera.position.addScaledVector(_fa.copy(camera.position).normalize(), flight.bump * Math.sin(Math.PI * k));
  slerpV(flight.t0, flight.t1, k, controls.target);
  const u = flight.u0.clone().lerp(flight.u1, k); setUp(u.lengthSq() > 1e-4 ? u.normalize() : flight.u1);
  if (k >= 1) { setUp(flight.u1); flight = null; }
}
function islandView(isl) {
  const portrait = innerWidth < innerHeight;
  const d = isl.r * 2.5 + (portrait ? 10 : 0);
  // on phones the info sheet covers the bottom, so aim lower to lift the island into view
  const target = isl.group.localToWorld(new THREE.Vector3(0, portrait ? -isl.r * 1.2 : 1.5, 0));
  return { pos: isl.group.localToWorld(new THREE.Vector3(0, d * (inRealm ? 0.36 : 0.55), d)), target, up: placeUp(isl) };   // on the ground, a lower, eye-ish view
}
// from space, landing on a place: switch to the realm with the camera high above it, then glide down
function landAt(isl, { high = true } = {}) {
  if (inRealm || !isl) return false;
  setRealm(true);
  const c = isl.group.position;
  camera.position.set(c.x, c.y + (high ? 95 : 30), c.z + (high ? 70 : 24)); controls.target.copy(c); setUp(Y);
  realm.prewarm(c.x, c.z); return true;
}
function visit(id, { open = true, instant = false } = {}) {
  const isl = byId(id); if (!isl) return;
  if (id !== 'pixelStudio') leaveStudio('left the studio');
  const landed = landAt(isl);
  if (landed && novaBrainT.island !== isl) novaBrainT.teleport(isl);   // Nova comes down with you
  follow = null; skyFocus = null; const v = isl.data.arcade && arcadeExt ? arcadeView() : id === 'pixelStudio' && studio ? studio.viewPoint(innerWidth < innerHeight) : id === 'automataLawn' && ctx.lawn?.viewPoint ? lawnView(isl) : islandView(isl); flyTo(v.pos, v.target, instant ? 0.01 : landed ? 2.4 : 1.6, placeUp(isl)); novaAt = isl; novaBrainT.goTo(isl, t);
  if (open) openPanel(id);
  setChip(id);
  if (ctx.lawn) ctx.lawn.setActive(id === 'automataLawn');
  if (ctx.fryer) ctx.fryer.setActive(false);
}
function lawnView(isl) {
  const p = ctx.lawn.viewPoint();
  isl.group.updateMatrixWorld(true);
  return { pos: isl.group.localToWorld(p.from.clone()), target: isl.group.localToWorld(p.at.clone()), up: placeUp(isl) };
}
function openPanel(id) {
  const isl = byId(id); if (!isl) return;
  if (isl.data.arcade) renderArcadePanel(arcadeData, { onEnter: () => enterArcade(), onPlay: gm => enterArcade(undefined, { game: gm.id }), onWing: w => enterArcade(w) });
  else { renderPanel(isl.data, world, { onView: viewPrint }); if (id === 'pixelStudio' && studio) renderStudioBox(world, { radio, onPainting: i => openPainting(i) }); if (id === 'starDock') postcardButton(); if (id === 'cornerCup') cafeButton();
    if (id === 'giftShop' && giftShop) panelButton('gs-open-btn', `<button class="pill gold">🎁 Browse the shelves</button><p style="margin:6px 0 0;color:var(--muted);font-size:13px">${giftShop.data.shelves.reduce((n, x) => n + x.items.length, 0)} free downloads: crochet charts, 3D-printer files, songs, pictures and postcards. Or tap the shop.</p>`, () => openGiftShop());
    if (id === 'pixelStudio' && museum) panelButton('mu-open-btn', `<button class="pill gold">🏛️ Visit the museum</button><p style="margin:6px 0 0;color:var(--muted);font-size:13px">${museum.rooms.length} rooms with a plaque for every piece, including the Rule 90 Room. Or tap the museum's gold columns.</p>`, () => openMuseum()); }
  openSheet('panel');
}
function arcadeView() {
  const v = arcadeExt.viewPoint();
  if (innerWidth < innerHeight) { v.pos.lerp(v.target, -0.6); v.target.addScaledVector(placeUp(byId('arcade')), -9); }
  return v;
}
function home() {
  if (inRealm) return backToSpace();
  leaveStudio('left the studio'); follow = null; skyFocus = null; flyTo(HOME.pos, HOME.target, 2, Y); novaAt = hearth; novaBrainT.goTo(hearth, t); closeSheets(); setChip('overview'); }
function meetLorenz() {
  landAt(hearth);
  leaveStudio('left the studio'); follow = 'lorenz'; novaAt = hearth; novaBrainT.goTo(hearth, t); closeSheets(); setChip('lorenz');
  // worked out in the Hearth's own frame (up = the ground normal there)
  const L = lorenz.position, a = lorenz.rotation.y, H = hearth.group;
  const fwd = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), side = new THREE.Vector3(fwd.z, 0, -fwd.x);
  const from = L.clone().addScaledVector(fwd, 2.6).addScaledVector(side, 1.4); from.y += 1.3;
  flyTo(H.localToWorld(from), H.localToWorld(L.clone().setY(L.y + 0.45)), 1.8, placeUp(hearth));
}

function novaDoing() { return inArcade ? arcade.novaStatus : inside ? house.novaStatus : novaBrainT.status + (novaBrainT.mode === 'travel' ? '' : ` (on ${novaBrainT.island.data.name})`); }
function showNova() { renderNova(world, { doing: novaDoing(), onJournal: () => openSheet('upto') }); openSheet('panel'); }
function meetNova({ panel = true } = {}) {
  if (!inRealm) landAt(novaBrainT.mode === 'travel' ? novaBrainT.goal : novaBrainT.island);
  follow = 'nova'; setChip('nova');
  const p = novaBrainT.worldPos(new THREE.Vector3()), up = UP(p);
  const h = camera.position.clone().sub(p); h.addScaledVector(up, -h.dot(up)); if (h.lengthSq() < 1e-3) h.set(1, 0, 0).cross(up); h.setLength(4.2);
  flyTo(p.clone().add(h).addScaledVector(up, 1.9), p.clone().addScaledVector(up, 0.75), 1.6, up);
  if (panel) showNova(); else closeSheets();
}

// ---------- picking ----------
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2(); let down = null;
const terrainMesh = planet.group.getObjectByName('terrain');
// the first thing under the pointer, unless the planet's ground is in front of it
const shown = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
function pickHit() {
  const hit = ray.intersectObjects(pickables, false).find(h => shown(h.object)); if (!hit) return null;
  if (inRealm) return hit;
  const g = ray.intersectObject(terrainMesh, true)[0];
  return g && g.distance < hit.distance - 0.3 ? null : hit;
}
canvas.addEventListener('pointerdown', e => { if (inside || inArcade) return; down = { x: e.clientX, y: e.clientY, t: performance.now() }; flight = null; if (e.isPrimary) follow = (follow === 'lorenz' || follow === 'nova') ? follow : null; });
canvas.addEventListener('pointerup', e => {
  if (inside || inArcade) return;
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 7) return; down = null;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const hit = pickHit();
  // from space, tapping anything on a place lands you there (doors and paintings work once you're down)
  if (hit && !inRealm && !hit.object.userData.novaPick && !hit.object.userData.lorenz && hit.object.userData.islandId) return visit(hit.object.userData.islandId);
  if (hit?.object.userData.painting) return openPainting(hit.object.userData.painting);
  if (hit?.object.userData.radio) { radio.toggle(); if (!radio.state.on) radio.show(); return; }
  if (hit?.object.userData.novaPick) {
    if (!inRealm) meetNova({ panel: false });
    interact.petNova();
    return;
  }
  if (hit?.object.userData.lorenz) return meetLorenz();
  if (hit?.object.userData.house) return enterHouse();
  if (hit?.object.userData.arcadeDoor) return enterArcade();
  if (hit?.object.userData.postcards) return openPostcards();
  if (inRealm && hasAncestor(hit?.object, o => o.userData.cafe)) return openCafe();
  if (inRealm && hit?.object.userData.giftshop) return openGiftShop();
  if (inRealm && hit?.object.userData.visits) return visitorUI.open();
  if (inRealm && hit?.object.userData.wall) return openWall();
  if (inRealm && hit?.object.userData.museum) return openMuseum();
  if (hit?.object.userData.fryer) return openFryer({ walk: walker.active });
  if (hit?.object.userData.signpost) return signpostTravel(hit.object.userData.signpost);
  if (hit && walker.active) { openPanel(hit.object.userData.islandId); setChip(hit.object.userData.islandId); return; }   // walking: read about it, stay on foot
  if (hit) visit(hit.object.userData.islandId);
});
canvas.addEventListener('pointermove', e => {
  if (inside || inArcade || e.pointerType !== 'mouse' || e.buttons) return;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  canvas.style.cursor = pickHit() ? 'pointer' : 'grab';
});

// ---------- UI ----------
const chips = document.getElementById('chips');
function chip(label, id, fn) { const b = document.createElement('button'); b.className = 'pill'; b.textContent = label; b.dataset.id = id; b.onclick = fn; chips.appendChild(b); }
chip('✦ Overview', 'overview', home);
chip('🦊 Nova', 'nova', () => meetNova());
chip('🦆 Lorenz', 'lorenz', meetLorenz);
chip('🏡 House', 'house', () => enterHouse());
chip('🚶 Walk', 'walk', () => (walker.active ? stopWalking() : startWalking()));
if (arcadeExt) chip('🕹️ Arcade', 'arcade', () => visit('arcade'));
world.islands.forEach(i => chip(i.shortName || i.name, i.id, () => visit(i.id)));
function setChip(id) { chips.querySelectorAll('.pill').forEach(b => b.classList.toggle('on', b.dataset.id === id)); }
document.getElementById('motto').textContent = world.motto || '';
renderUpTo(world, { onEnterHouse: room => enterHouse(room) });
setupUI({ onUpTo: () => openSheet('upto') });

// ---------- walking in the realm (js/realm.js createFlatWalker) ----------
const walker = createFlatWalker(realm, camera, canvas, { joy: document.getElementById('walk-joy') });
let skyFocus = null;
function walkStartFor(focus) {   // a spot just in front of a place, facing into it
  const isl = focus || hearth;
  const p = isl.group.localToWorld(new THREE.Vector3(0, 0, isl.r * 1.0 + (isl.data.arcade ? 2 : 1.5)));
  return { pos: p, look: isl.group.localToWorld(new THREE.Vector3(0, 0, 0)) };
}
// from space: the place nearest the middle of the view
function placeInView() {
  const d = controls.target.length() > PR * 0.5 ? controls.target.clone().normalize() : camera.position.clone().normalize();
  let best = hearth, bd = -2; for (const i of islands) { const k = i.place.n.dot(d); if (k > bd) { bd = k; best = i; } } return best;
}
function startWalking(at) {
  if (inside || inArcade || (busy && !at)) return;
  let s = at;
  if (!inRealm) { const isl = placeInView(); landAt(isl, { high: false }); if (!at) s = walkStartFor(isl); }
  flight = null; follow = null; skyFocus = null; closeSheets();
  if (!s) {   // looking at something: start on the ground there, facing the way the camera faced
    const g = controls.target.clone(); g.y = 0; s = { pos: g, look: g.clone().add(controls.target.clone().sub(camera.position).setY(0)) };
  }
  walker.enter(s.pos, s.look); controls.enabled = false;
  document.body.classList.add('walking'); setChip('walk');
  const b = chips.querySelector('[data-id=walk]'); if (b) b.textContent = '✋ Stop walking';
}
function stopWalking({ fly = true } = {}) {
  if (!walker.active) return;
  walker.exit(); controls.enabled = !(inside || inArcade);
  document.body.classList.remove('walking');
  const b = chips.querySelector('[data-id=walk]'); if (b) b.textContent = '🚶 Walk';
  const f = walker.f.clone(), c = camera.position.clone();
  controls.target.copy(c).addScaledVector(f, 3); controls.target.y = realm.heightAt(controls.target.x, controls.target.z) + 1; setUp(Y);
  if (fly) { flyTo(c.clone().addScaledVector(f, -10).add(new THREE.Vector3(0, 7, 0)), controls.target.clone(), 1.2, Y); setChip(''); }
}
// walk straight in through a door
function doorCheck() {
  if (!walker.active || busy) return;
  const me = camera.position;
  if (cottage && hearth.group.visible && me.distanceTo(cottage.doorWorld()) < 1.6) { stopWalking({ fly: false }); walkResume = 'house'; enterHouse(); }
  else if (arcadeExt && byId('arcade').group.visible && me.distanceTo(arcadeExt.doorWorld()) < 1.9) { stopWalking({ fly: false }); walkResume = 'arcade'; enterArcade(); }
}
// signposts: tap a board to skip the walk (on foot you arrive on foot; otherwise the camera flies there)
async function signpostTravel(id) {
  const isl = byId(id); if (!isl || busy) return;
  if (!walker.active) return visit(id);
  busy = true; fade(true); await wait(380);
  walker.enter(walkStartFor(isl).pos, walkStartFor(isl).look); novaAt = isl; novaBrainT.teleport(isl);
  realm.prewarm(isl.group.position.x, isl.group.position.z);
  fade(false); busy = false; toast(`Arrived at ${isl.data.name}`);
}
let walkResume = null;
addEventListener('keydown', e => {
  if (walker.active || inside || inArcade || busy || /input|textarea|select/i.test(e.target.tagName)) return;
  if (postcards?.isOpen || player.isOpen || lightboxState().open) return;
  if (['w', 'W', 'ArrowUp'].includes(e.key)) { startWalking(); walker.state.keys.add(e.key.toLowerCase()); }
});
{
  const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  document.getElementById('walk-hint').textContent = touch ? 'Left stick to walk · drag to look · follow the gold roads · tap a signpost to travel' : 'WASD or arrows to walk · Q/E or drag to turn · Shift to run · follow the gold roads · Esc to stop walking';
}
// ---------- between space and the realm ----------
function setRealm(on) {
  if (on === inRealm) return; inRealm = on;
  if (!on && walker.active) stopWalking({ fly: false });
  flight = null;
  for (const i of islands) { const P = on ? i.realmPose : i.planetPose; i.group.position.copy(P.pos); i.group.quaternion.copy(P.quat); i.group.visible = true; i.group.updateMatrixWorld(true); }
  planet.group.visible = !on; realm.group.visible = on;
  if (novaBrainT.mode === 'travel') novaBrainT.teleport(novaBrainT.goal);
  novaTag.userData.ok = false;
  document.body.classList.toggle('in-realm', on);
  if (!on && ctx.lawn) ctx.lawn.setActive(false);
  if (!on && ctx.fryer) ctx.fryer.setActive(false);
  controls.maxPolarAngle = on ? Math.PI * 0.47 : Math.PI; controls.maxDistance = on ? 420 : PR * 7;
  camera.far = on ? 3200 : 2000; camera.updateProjectionMatrix();
  const ov = chips.querySelector('[data-id=overview]'); if (ov) { ov.textContent = on ? 'Back to space' : '✦ Overview'; ov.classList.toggle('space', on); }
  setUp(Y);
}
// "Back to space": leave the realm and rise back up to the tiny planet
function backToSpace() {
  if (!inRealm) return home();
  leaveStudio('left the studio'); closeSheets(); follow = null; skyFocus = null;
  const at = islands.reduce((b, i) => (i.group.position.distanceTo(camera.position) < b.group.position.distanceTo(camera.position) ? i : b), hearth);
  setRealm(false);
  camera.position.copy(at.place.n).multiplyScalar(PR * 1.35); controls.target.copy(at.place.n).multiplyScalar(PR); setUp(at.place.n);
  flyTo(HOME.pos, HOME.target, 2.2, Y); novaAt = hearth; novaBrainT.goTo(hearth, t); setChip('overview');
}
document.getElementById('btn-space').onclick = () => backToSpace();

// ---------- Nova's House (walk-in interior) ----------
const cottage = ctx.cottage;
const roomLabel = document.getElementById('house-room');
const scopeView = createScopeView();   // "look through the telescope" in the Window Seat
const house = createHouse({
  renderer, world, loadSTL, skyMaterial: skyMat,
  onPick: (item, roomName) => { if (item.view === 'scope') { closeSheets(); return scopeView.open(item); } if (item.view === 'postcards' && postcards) { closeSheets(); return postcards.open(item.planet); } renderDecor(item, roomName, { onView: viewPrint }); openSheet('panel'); },
  onExit: () => exitHouse(),
  onNova: () => showNova(),
  onRoom: (id, name) => { roomLabel.textContent = name; document.querySelectorAll('#room-chips .pill').forEach(b => b.classList.toggle('on', b.dataset.room === id));
    const rc = document.getElementById('room-chips'), on = rc.querySelector('.pill.on'); if (on && rc.scrollWidth > rc.clientWidth) rc.scrollLeft = on.offsetLeft - (rc.clientWidth - on.offsetWidth) / 2; },   // keep the lit chip in view on phones
});
let inside = false, busy = false;
const wait = ms => new Promise(r => setTimeout(r, ms));
const fadeEl = document.getElementById('fade');
const fade = on => fadeEl.classList.toggle('on', on);
async function enterHouse(room, { instant = false } = {}) {
  if (busy) return;
  if (inside) { closeSheets(); if (room) { busy = true; fade(true); await wait(220); house.goto(room); fade(false); busy = false; } return; }
  if (walker.active) { stopWalking({ fly: false }); walkResume = 'house'; }
  landAt(hearth, { high: false });
  if (ctx.fryer) ctx.fryer.setActive(false);
  busy = true; leaveStudio('went inside'); closeSheets(); follow = null; setChip('house'); novaAt = hearth;
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
  const up = placeUp(hearth);
  if (cottage && walkResume === 'house') { walkResume = null; startWalking({ pos: cottage.doorFront(2.6), look: cottage.doorFront(8) }); setTimeout(() => cottage.setDoor(false), 900); }
  else if (cottage) { camera.position.copy(cottage.doorFront(1.6)); controls.target.copy(cottage.doorWorld()); setUp(up); const far = innerWidth < innerHeight ? 14 : 8; flyTo(cottage.doorFront(far).addScaledVector(up, far * 0.5), cottage.doorWorld(), 1.8, up); setTimeout(() => cottage.setDoor(false), 900); }
  fade(false); busy = false; if (!walker.active) setChip('hearth');
}
{
  const rc = document.getElementById('room-chips');
  for (const r of world.house?.rooms || []) { const b = document.createElement('button'); b.className = 'pill'; b.dataset.room = r.id; b.textContent = r.name; b.onclick = () => enterHouse(r.id); rc.appendChild(b); }
  // spots inside a room (e.g. the Crochet Corner in the Art Corner)
  for (const sp of world.house?.spots || []) { const b = document.createElement('button'); b.className = 'pill'; b.dataset.spot = sp.id; b.textContent = sp.name; b.onclick = () => enterHouse(sp.id); rc.appendChild(b); }
  document.getElementById('btn-exit').onclick = () => exitHouse();
  const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  document.body.classList.toggle('touch', touch);
  document.getElementById('house-hint').textContent = touch ? 'Left stick to walk · drag to look · tap things to read about them' : 'WASD or arrow keys to walk · drag to look · click things to read about them';
}

// ---------- Nova's Arcade (walk-in hall + full-screen games) ----------
const toastEl = document.getElementById('toast');
let toastT = 0;
function toast(msg) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { toastEl.hidden = true; }, 2600); }
toastFn = toast;
let inArcade = false, loopStopped = false;
const arcadeScores = {};
const player = createArcadePlayer({
  onOpen: () => { leaveStudio('game opened'); closeSheets(); },
  onClose: () => { resumeLoop(); },
  onScore: (g, s) => { arcadeScores[g.id] = s; },
});
const arcade = arcadeData ? createArcade({
  renderer, data: arcadeData,
  onExit: () => exitArcade(),
  onPlay: g => openGame(g.id),
  onWing: (id, name) => { document.getElementById('arcade-wing').textContent = name; document.querySelectorAll('#wing-chips [data-wing]').forEach(b => b.classList.toggle('on', b.dataset.wing === id)); },
  onSoon: B => toast(B.teaser ? `Bay ${B.bay}: ${B.teaser.title} is coming soon. ${B.teaser.note || ''}` : `Bay ${B.bay} in the ${B.wingName} is waiting for a new game.`),
}) : null;
if (arcade) { arcade.onNova = () => showNova(); arcade.state.blocked = () => player.isOpen; }
function openGame(id) {
  const g = (arcadeData?.games || []).find(x => x.id === id); if (!g) return false;
  if (inArcade) arcade.lookAtBay(g.id);
  player.open(g); return true;
}
async function enterArcade(wing, { instant = false, game } = {}) {
  if (!arcade || busy) return;
  if (inArcade) { closeSheets(); if (wing) arcade.goto(wing); if (game) openGame(game); return; }
  if (inside) { await exitHouse(); await wait(50); }
  if (walker.active) { stopWalking({ fly: false }); walkResume = 'arcade'; }
  landAt(byId('arcade'), { high: false });
  if (ctx.fryer) ctx.fryer.setActive(false);
  busy = true; leaveStudio('went to the arcade'); closeSheets(); follow = null; setChip('arcade');
  const isl = byId('arcade'); if (isl) novaAt = isl;
  if (!instant && arcadeExt) { flyTo(arcadeExt.doorFront(3.2), arcadeExt.doorWorld(), 1.5); await wait(1350); fade(true); await wait(420); }
  inArcade = true; controls.enabled = false; document.body.classList.add('in-arcade');
  arcade.setActive(true, wing);
  fade(false); busy = false;
  if (game) openGame(game);
}
async function exitArcade() {
  if (!inArcade || busy) return;
  if (player.isOpen) player.close();
  busy = true; closeSheets(); fade(true); await wait(380);
  inArcade = false; arcade.setActive(false); document.body.classList.remove('in-arcade'); controls.enabled = true;
  const up = byId('arcade') ? placeUp(byId('arcade')) : Y;
  if (arcadeExt && walkResume === 'arcade') { walkResume = null; startWalking({ pos: arcadeExt.doorFront(3), look: arcadeExt.doorFront(9) }); }
  else if (arcadeExt) { camera.position.copy(arcadeExt.doorFront(1.6)); controls.target.copy(arcadeExt.doorWorld()); setUp(up); const far = innerWidth < innerHeight ? 22 : 13; flyTo(arcadeExt.doorFront(far).addScaledVector(up, far * 0.45), arcadeExt.doorWorld().addScaledVector(up, 2.5), 1.8, up); }
  fade(false); busy = false; if (!walker.active) setChip('arcade');
}
// ---------- Exoplanet Postcard Maker: a kiosk on Star Dock (js/postcard.js) ----------
const postcards = postcardData ? createPostcardMaker(postcardData, { onOpen: () => { leaveStudio('opened the postcards'); closeSheets(); }, onClose: () => resumeLoop() }) : null;
const hasAncestor = (o, f) => { for (; o; o = o.parent) if (f(o)) return true; return false; };
// ---------- The Gift Shop (free downloads) and the Pixel Studio Museum ----------
const overlayHooks = what => ({ onOpen: () => { leaveStudio('opened the ' + what); closeSheets(); walker.state?.keys?.clear?.(); }, onClose: () => resumeLoop() });
const giftShop = createGiftShop(world.giftshop, overlayHooks('gift shop'));
const museum = createMuseum(world.museum, { song: world.radio?.tracks?.find(t => t.id === 'rule90-sings'), ...overlayHooks('museum') });
const visitors = createVisitorCounter(), visitorUI = visitorChip(visitors);
visitors.onChange(st => ctx.visitorBoard?.draw(st));
const wall = createWall({ ...overlayHooks('visitor wall'), onNotes: (n, o) => ctx.corkWall?.setNotes(n, o) });
function openWall() { if (inArcade || inside) return false; wall.open(); return true; }
function openFryer({ instant = false, walk = false } = {}) {
  if (!ctx.fryer || inArcade || inside) return false;
  landAt(hearth, { high: false });
  follow = null;
  closeSheets();
  ctx.fryer.setActive(true);
  setChip('hearth');
  if (!walk) {
    const p = ctx.fryer.viewPoint();
    hearth.group.updateMatrixWorld(true);
    flyTo(hearth.group.localToWorld(p.from.clone()), hearth.group.localToWorld(p.at.clone()), instant ? 0.01 : 1.2, placeUp(hearth));
  }
  return true;
}
function openGiftShop(shelf) { if (!giftShop || inArcade || inside) return false; giftShop.open(shelf); return true; }
function openMuseum(room) { if (!museum || inArcade || inside) return false; museum.open(room); return true; }
function panelButton(cls, html, onclick) {
  const body = document.querySelector('#panel .sheet-body'); if (!body || body.querySelector('.' + cls)) return;
  const box = document.createElement('div'); box.className = 'studio-box ' + cls; box.innerHTML = html;
  box.querySelector('button').onclick = onclick; const h = body.querySelector('h2'); h ? h.after(box) : body.prepend(box);
}
// ---------- The Corner Cafe: the coffee-making game (js/cafe.js) ----------
const cafe = createCafe({ onOpen: () => { leaveStudio('opened the cafe'); closeSheets(); walker.state?.keys?.clear?.(); }, onClose: () => resumeLoop() });
function openCafe() { if (inArcade || inside) return false; cafe.open(); return true; }
function cafeButton() {
  const body = document.querySelector('#panel .sheet-body'); if (!body || body.querySelector('.cafe-open-btn')) return;
  const box = document.createElement('div'); box.className = 'studio-box cafe-open-btn';
  box.innerHTML = `<button class="pill gold">☕ Step behind the coffee bar</button><p style="margin:6px 0 0;color:var(--muted);font-size:13px">Make drinks for Lorenz and friends: cup, espresso, milk, syrup, topping, serve. Or tap the cafe.</p>`;
  box.querySelector('button').onclick = () => openCafe(); const h = body.querySelector('h2'); h ? h.after(box) : body.prepend(box);
}
function postcardButton() {
  if (!postcards) return; const body = document.querySelector('#panel .sheet-body'); if (!body || body.querySelector('.pc-open-btn')) return;
  const box = document.createElement('div'); box.className = 'studio-box pc-open-btn';
  box.innerHTML = `<button class="pill gold">🪐 Open the Postcard Maker</button><p style="margin:6px 0 0;color:var(--muted);font-size:13px">${postcardData.planets.length} real exoplanets, painted from NASA Exoplanet Archive numbers. Or tap the postcard rack.</p>`;
  box.querySelector('button').onclick = () => openPostcards(); const h = body.querySelector('h2'); h ? h.after(box) : body.prepend(box);
}
function openPostcards(id) { if (!postcards || inArcade) return false;   // works from the house too (the Kitchen fridge postcard)
  postcards.open(id); return true; }
function resumeLoop() { if (loopStopped) { loopStopped = false; last = performance.now(); requestAnimationFrame(frame); } }
if (arcade) {
  const wc = document.getElementById('wing-chips');
  for (const g of arcadeData.games || []) { const b = document.createElement('button'); b.className = 'pill gold'; b.dataset.game = g.id; b.textContent = '▶ ' + g.title; b.onclick = () => openGame(g.id); wc.appendChild(b); }
  for (const w of arcade.layout.wings) { const b = document.createElement('button'); b.className = 'pill'; b.dataset.wing = w.id; b.textContent = w.name; b.onclick = () => enterArcade(w.id); wc.appendChild(b); }
  document.getElementById('btn-arcade-exit').onclick = () => exitArcade();
  const touch = document.body.classList.contains('touch');
  document.getElementById('arcade-hint').textContent = touch ? 'Left stick to walk · drag to look · tap a cabinet to play' : 'WASD or arrow keys to walk · drag to look · click a cabinet to play';
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
  camera.aspect = innerWidth / innerHeight; camera.fov = innerWidth < innerHeight ? 66 : 50; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); gfx.resize(); house.resize(); arcade?.resize();
});
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (lightboxState().open) return;   // the viewer handles its own Esc
  if (postcards?.isOpen) return;    // so does the postcard maker
  const open = document.querySelector('.sheet.open') || !document.getElementById('viewer').hidden;
  closeSheets(); closeViewer();
  if (!open && inside) exitHouse();
  if (!open && inArcade) exitArcade();
  if (!open && walker.active) stopWalking();
});

// ---------- time of day ----------
// The world follows the real sun at the reference point (REF in js/sun.js),
// in Central time. ?time=HH:MM, ?phase=dawn|day|golden|dusk|night, and ?date=YYYY-MM-DD preview a moment.
const clock = makeClock();
setHolidayNow(() => clock.now());
const weather = createWeather(scene);
weather.setFromDate(clock.now(), { live: clock.live, dateOverride: !!clock.dateOverride });
let worldSig = '';
function applyWorldDate(now, force = false) {
  const name = season(now);
  const sig = `${ymd(now).key}|${name}|${weather.state.kind}|${weather.state.source}`;
  if (!force && sig === worldSig) return;
  worldSig = sig;
  const pal = applyPalette(name, { weatherKind: weather.state.kind });
  realm.setSeason?.(name, pal, { weatherKind: weather.state.kind }); grass.reset();
  planet.setSeason?.(name);
  skyClock.setWorld?.(name, weather.state);
}
const applyGlow = collectGlows(scene, o => !!o.userData.nova);
const _d = [0, 0, 0], _m = [0, 0, 0];
const fogC = new THREE.Color(), tmpC = new THREE.Color();
let sky0 = null;
// the sky dome, sun and moon ride along with the camera so they never show parallax
function placeSkyBodies() {
  skyGroup.position.copy(camera.position); skyGroup.quaternion.copy(qSky);
  sunDisk.position.set(_d[0] * 780, _d[1] * 780, _d[2] * 780); sunHalo.position.copy(sunDisk.position); sunHalo2.position.copy(sunDisk.position);
  moonMesh.position.set(_m[0] * 600, _m[1] * 600, _m[2] * 600); moonHalo.position.copy(moonMesh.position);
  // lights live in sky space too
  moon.position.copy(LBASE.moon).applyQuaternion(qSky); warm.position.copy(LBASE.warm).applyQuaternion(qSky);
  sunLight.position.copy(LBASE.sun).applyQuaternion(qSky); hemi.position.copy(Y).applyQuaternion(qSky);
}
// which way is "up" for the sky: the walker's ground, the place being looked at, or plain Y in orbit
const _fu = new THREE.Vector3(), _lw = new THREE.Vector3();
let fogBase = 0.0045;
const mapCtx = document.getElementById('minimap').getContext('2d'); let mapT = 0;
const _cf = new THREE.Vector3();
let realmOcc = [], occT = 0;
function realmFrame(dt) {
  focusUp.copy(Y); qSky.identity();
  skyU.uSpace.value = 0; spaceStarMat.uniforms.uFade.value = 0; spaceStars.visible = false;
  scene.fog.density = fogBase * 1.35;
  const c = camera.position;
  if ((occT -= dt) <= 0) { occT = 2; realmOcc = []; for (const i of islands) if (i.group.visible) i.group.traverse(o => { if (o.userData.museum && !o.parent?.userData.museum) { o.getWorldPosition(_lw); realmOcc.push({ x: _lw.x, z: _lw.z, r: 5 }); } }); }   // the museum annex stands off to the side of the studio
  grass.snow = realm.snow; grass.update(t, c); life.weather = weather.state.kind; life.update(t, dt, c);
  realm.update(t, dt, c, { occluders: realmOcc, placeVisible: (id, near) => { const i = byId(id); if (i) i.group.visible = near; } });
  for (const o of xray) { o.getWorldPosition(_lw); o.visible = c.distanceTo(_lw) < (walker.active ? 28 : 16); }
  if ((mapT += dt) > 0.05) { mapT = 0; camera.getWorldDirection(_cf); realm.drawMap(mapCtx, 300, 300, c, Math.atan2(_cf.x, -_cf.z), 0.55); }
}
// Print Shop models load only once you're near the shop (saves ~7 MB on first load)
function lazyPrintCheck() {
  const L = ctx.lazyPrints; if (!L || L.loaded || !L.group.visible) return;
  if (camera.position.distanceTo(L.group.getWorldPosition(_lw)) < (inRealm ? 60 : 28)) L.load();
}
function planetFrame(dt) {
  lazyPrintCheck();
  if (inRealm) return realmFrame(dt);
  if (walker.active) _fu.copy(walker.n);
  else if (skyFocus) _fu.copy(skyFocus);
  else if (controls.target.length() > PR * 0.5 && camera.position.length() < PR * 2) _fu.copy(controls.target).normalize();
  else _fu.copy(Y);
  focusUp.lerp(_fu, flight || walker.active || skyFocus ? 1 : Math.min(1, dt * 3)).normalize();
  qSky.setFromUnitVectors(Y, focusUp);
  // high above the planet the sky turns to deep space; fog thins out
  const alt = camera.position.length() - PR;
  const space = THREE.MathUtils.smoothstep(alt, 22, 75);
  skyU.uSpace.value = space * 0.92; spaceStarMat.uniforms.uFade.value = space; spaceStars.visible = space > 0.01;
  scene.fog.density = fogBase * (1 - 0.82 * THREE.MathUtils.smoothstep(alt, 8, 60));
  // labels drawn on top of everything hide when the planet is between them and you
  planet.cull(camera.position);
  // places round the far side of the planet are skipped entirely (big draw-call saver)
  const D = camera.position.length(), horizon = Math.acos(Math.min(1, (PR - 1.5) / D));
  _fa.copy(camera.position).divideScalar(D);
  for (const i of islands) {
    const gam = Math.acos(THREE.MathUtils.clamp(_fa.dot(i.place.n), -1, 1)) - i.place.alpha * 1.15;
    const H = i.data.arcade ? 26 : 14;
    i.group.visible = gam < horizon + Math.acos(PR / (PR + H));
  }
  // and on the ground, far places' name tags step back so the view isn't cluttered
  for (const o of xray) { o.getWorldPosition(_lw); o.visible = !planet.hidden(camera.position, _lw, 2.5) && (alt > 26 ? o.parent !== cottage?.group : camera.position.distanceTo(_lw) < 42); }   // from orbit the cottage's own sign would cover its roof
}
function applySky(date) {
  const st = skyState(date), p = st.pal; sky0 = st;
  skyU.uTop.value.set(...p.top); skyU.uMid.value.set(...p.mid); skyU.uLow.value.set(...p.low); skyU.uDeep.value.set(...p.deep); skyU.uBand.value.set(...p.band);
  skyU.uCloud.value = p.cloud; skyU.uCloudCol.value.set(...p.cloudCol);
  const el = st.sun.elevation;
  skyDir(el, st.sun.azimuth, _d); skyU.uSunDir.value.set(..._d);
  tmpC.setHex(p.sunCol); skyU.uSunCol.value.set(tmpC.r ** 0.4545, tmpC.g ** 0.4545, tmpC.b ** 0.4545);
  skyU.uSunGlow.value = THREE.MathUtils.smoothstep(el, -9, 3) * (1 - 0.45 * THREE.MathUtils.clamp(el / 12, 0, 1));
  skyU.uTwi.value = Math.max(0, 1 - Math.abs(el + 3) / 9);
  skyU.uRays.value = THREE.MathUtils.smoothstep(el, -1.5, 2) * (1 - THREE.MathUtils.smoothstep(el, 7, 15)); skyU.uNight.value = p.stars;
  starMat.uniforms.uFade.value = p.stars;
  // sun disk + halos
  const sunUp = THREE.MathUtils.smoothstep(el, -2.5, 1.5);
  placeSkyBodies();
  const low = THREE.MathUtils.clamp(el / 12, 0, 1);
  sunDisk.material.color.setHex(0xff9a52).lerp(tmpC.setHex(0xfff1cc), low); sunDisk.material.opacity = sunUp; sunDisk.visible = sunUp > 0.001;
  sunHalo.material.color.setHex(0xff9858).lerp(tmpC.setHex(0xffe6b0), low); sunHalo.material.opacity = (0.75 - 0.64 * low) * sunUp; sunHalo2.material.opacity = (0.9 - 0.72 * low) * sunUp; sunHalo2.scale.setScalar(90 - 35 * low);
  // moon: real position and phase; fainter by day
  skyDir(st.moon.elevation, st.moon.azimuth, _m);
  placeSkyBodies();
  const moonUp = THREE.MathUtils.smoothstep(st.moon.elevation, -2, 2);
  moonU.uAlpha.value = moonUp * (0.45 + 0.55 * p.night); moonMesh.visible = moonUp > 0.001;
  moonHalo.material.opacity = 0.55 * moonUp * p.night * (0.25 + 0.75 * st.moon.illum);
  // lights and fog
  hemi.color.setHex(p.hemi); hemi.groundColor.setHex(p.ground); hemi.intensity = p.hemiI * (gfx.T.shadow ? 0.86 : 1);   // with real shadows, a touch less fill so they read
  moon.intensity = p.moonI; warm.intensity = p.warmI;
  sunLight.color.setHex(p.sunCol); sunLight.intensity = p.sunI * THREE.MathUtils.smoothstep(el, -1, 4); LBASE.sun.set(_d[0] * 100, Math.max(_d[1], 0.05) * 100, _d[2] * 100); sunLight.position.copy(LBASE.sun).applyQuaternion(qSky);
  scene.fog.color.setHex(p.fog); fogBase = p.fogD; scene.fog.density = p.fogD; renderer.toneMappingExposure = p.exposure;
  weather.applySky(p, skyU, scene.fog, d => { fogBase = d; });
  applyWorldDate(date);
  DAY.glow = p.glow; DAY.halo = p.halo; DAY.night = p.night; DAY.day = p.day; DAY.window = 0.3 + 0.7 * Math.max(p.night, 1 - p.day * 0.85);
  applyGlow(p.glow, p.halo);
  house.daylight?.(st, _d, _m);
  arcade?.daylight?.(st);
  document.body.dataset.sky = st.phase.id;
  skyClock.update(st, clock);
  return st;
}
const skyClock = setupSkyClock({ clock, onChange: () => { skyDirty = true; } });
let shownMin = null, lastSky = 0, skyDirty = false, lastTick = performance.now();
function skyTick(now, force = false) {
  const target = clock.minutes;
  const sdt = Math.min(1, (now - lastTick) / 1000); lastTick = now;
  if (shownMin === null) shownMin = target;
  let diff = target - shownMin; if (diff > 720) diff -= 1440; if (diff < -720) diff += 1440;
  const tweening = Math.abs(diff) > 0.4;
  if (tweening) shownMin = ((shownMin + (Math.abs(diff) < 2 ? diff : diff * Math.min(1, sdt * 4))) + 1440) % 1440;
  else shownMin = target;
  if (tweening || force || skyDirty || now - lastSky > 20000) { lastSky = now; skyDirty = false; applySky(clock.live && !tweening ? new Date() : clock.at(shownMin)); }
}
skyTick(performance.now(), true);

// ---------- shadows: the key light's shadow box follows what you're looking at (Realm only) ----------
const _sf = new THREE.Vector3(), _sc = new THREE.Vector3(), _wsky = new THREE.Color(), _wblue = new THREE.Color(0x2a5a9a);
let prepT = 0;
function shadowFrame(dt) {
  const nowMs = performance.now(); if (nowMs > prepT) { prepT = nowMs + 1000; gfx.prep(scene); }   // new meshes (tiles, holiday props) pick up shadows + detail
  gfx.tick(t, _wsky.copy(scene.fog.color).lerp(hemi.color, 0.35).lerp(_wblue, 0.45).multiplyScalar(0.5 + 0.35 * DAY.day));
  gfx.pickKey(sunLight, moon, inRealm);
  renderer.shadowMap.autoUpdate = inRealm && !!gfx.key;
  if (!gfx.key) return;
  let want;
  if (walker.active || camera.position.distanceTo(controls.target) > 70) {
    camera.getWorldDirection(_sc); _sc.y = 0; _sc.normalize();
    _sf.copy(camera.position).addScaledVector(_sc, 22); want = 48;
  } else { _sf.copy(controls.target); want = camera.position.distanceTo(controls.target) * 1.7 + 6; }
  if (inRealm) _sf.y = realm.heightAt(_sf.x, _sf.z);
  gfx.placeShadow(_sf, inRealm ? (gfx.key === moon ? 0.55 : 0.85) : 0, want);
}
// ---------- loop ----------
let last = performance.now(), t = 0;
function frame() {
  const now = performance.now(); const rawDt = Math.min((now - last) / 1000, 0.25), dt = Math.min(rawDt, 0.05); last = now; t += dt;
  gfx.watch(rawDt, !document.hidden);
  if (player.isOpen || postcards?.isOpen || cafe.isOpen || giftShop?.isOpen || museum?.isOpen || wall.isOpen) { loopStopped = true; return; } // the 3D world sleeps while a game or the postcard maker is open
  skyTick(now); skyU.uTime.value = t; tickNeeds(dt);
  weather.tick(dt, camera);
  if (inArcade) {
    arcade.update(dt, t);
    skyU.uSpace.value = 0;
    renderer.render(arcade.scene, arcade.camera);
    requestAnimationFrame(frame); return;
  }
  if (inside) {
    house.update(dt, t); skyU.uSpace.value = 0;
    renderer.render(house.scene, house.camera);
    if (viewer?.open) { viewer.oc.update(); viewer.r.render(viewer.s, viewer.cam); }
    requestAnimationFrame(frame); return;
  }
  starMat.uniforms.uTime.value = spaceStarMat.uniforms.uTime.value = t;
  updaters.forEach(u => u(t, dt));
  if (!inRealm) planet.update(t, dt);
  lorenzTick(t, dt, 0.02);
  // lanterns circle the Hearth slowly (in the Hearth's own frame, so they float "up" from its ground)
  lanterns.forEach((l, i) => { const a = t * 0.05 + i / 11 * Math.PI * 2; const rr = hearth.r + 3 + (i % 3) * 1.5; l.position.set(Math.cos(a) * rr, 5 + Math.sin(t * 0.6 + i) * 0.8 + (i % 4), Math.sin(a) * rr); });
  // Nova: a fox now (js/novabody.js)
  novaBrainT.tick(t, dt, { camera });
  keepFriendsApart();
  lorenzBlob.visible = Math.hypot(lorenz.position.x - pondInfo.x, lorenz.position.z - pondInfo.z) > pondInfo.r * 0.92;
  if (walker.active) { walker.update(rawDt); doorCheck(); }
  else {
    if (flight) stepFlight(dt);
    else if (follow === 'lorenz' || follow === 'nova') {
      const p = (follow === 'lorenz' ? lorenz.getWorldPosition(new THREE.Vector3()) : novaBrainT.worldPos(new THREE.Vector3()));
      p.addScaledVector(inRealm ? _fb.copy(Y) : _fb.copy(p).normalize(), follow === 'lorenz' ? 0.5 : 0.75);
      const d = p.clone().sub(controls.target); controls.target.add(d.multiplyScalar(Math.min(1, dt * 2))); camera.position.add(d);
    }
    controls.update();
    // never sink under the ground
    if (inRealm) { const gy = realm.heightAt(camera.position.x, camera.position.z) + 0.7; if (camera.position.y < gy) camera.position.y = gy; }
    else { const cd = camera.position.length(), gmin = planet.groundR(_fa.copy(camera.position).divideScalar(cd)) + 0.7; if (cd < gmin) camera.position.setLength(gmin); }
  }
  planetFrame(dt);
  placeSkyBodies(); placeNovaTag(dt); interact.tick(t, dt);
  shadowFrame(dt);
  renderer.render(scene, camera); window.__rinfo = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  gfx.afterRender(DAY.night, DAY.day);
  if (viewer?.open) { viewer.oc.update(); viewer.r.render(viewer.s, viewer.cam); }
  requestAnimationFrame(frame);
}
frame();
document.getElementById('loading').style.opacity = 0;
setTimeout(() => document.getElementById('loading').remove(), 900);
setTimeout(() => { const h = document.getElementById('hint'); if (h) h.style.opacity = 0; }, 9000);

// small hooks for tests and future sessions
window.nova = { needs: NEEDS, visit, home, meetLorenz, meetNova, showNova, novaBody, novaBrain: novaBrainT, novaTag, play: interact, get doing() { return novaDoing(); }, enterHouse, exitHouse, house, world, clock, get sky() { return sky0 && { phase: sky0.phase.id, name: sky0.phase.name, elevation: +sky0.sun.elevation.toFixed(2), azimuth: +sky0.sun.azimuth.toFixed(1), sunrise: fmtTime(sky0.times.sunrise), sunset: fmtTime(sky0.times.sunset), dawn: fmtTime(sky0.times.dawn), dusk: fmtTime(sky0.times.dusk), moon: { el: +sky0.moon.elevation.toFixed(1), illum: +sky0.moon.illum.toFixed(2) }, shown: fmtTime(sky0.date), date: ymd(sky0.date).key, live: clock.live, dateOverride: !!clock.dateOverride }; }, feast: { get stage() { return feastStage(clock.now()); }, get sitting() { return feastSitting(clock.now()); }, get seats() { return ctx.feast && { nova: ctx.feast.novaSeat, lorenz: ctx.feast.lorenzSeat }; }, seatNow() { novaBrainT.seatNow(); lorenzTick.seatNow?.(); } }, get season() { return season(clock.now()); }, christmas: { get on() { return christmasOn(clock.now()); }, get stage() { return christmasStage(clock.now()); }, get tree() { return ctx.christmas?.tree?.group || null; } }, weather: { get state() { return weather.state; }, place: weather.place }, friends: { get gap() { const n = novaBody.root.position, l = lorenz.position; return Math.hypot(n.x - l.x, n.z - l.z); }, get beds() { return { nova: { x: novaBed.x, z: novaBed.z }, lorenz: { x: lorenzBed.x, z: lorenzBed.z } }; } }, get lawn() { return ctx.lawn; }, get fryer() { return ctx.fryer; }, ref: REF, get inside() { return inside; }, get busy() { return busy; }, enterArcade, exitArcade, openGame, arcade, arcadeData, player, arcadeScores, get inArcade() { return inArcade; }, get loopStopped() { return loopStopped; }, studio, radio, openPainting, get lightbox() { return lightboxState(); }, postcards, openPostcards, cafe, openCafe, giftShop, openGiftShop, museum, openMuseum, visitors, visitorUI, wall, openWall, scopeView, planet, realm, get inRealm() { return inRealm; }, backToSpace, setRealm, landAt: id => landAt(byId(id)), signpostTravel, walker, startWalking, stopWalking, get walking() { return walker.active; }, walkTo: id => { const isl = byId(id); if (!isl) return; landAt(isl, { high: false }); startWalking(walkStartFor(isl)); }, gfx, ready: true };
window.__renderer = renderer; window.__scene = scene;
window.__camPos = () => camera.position.clone();
window.__flying = () => !!flight;
window.__cottageDoor = () => cottage ? { door: cottage.doorWorld(), from: cottage.doorFront(5) } : null;
// test helper: look from near the Hearth toward a point in the sky (azimuth, elevation in degrees)
window.__lookSky = (az, el = 8) => {
  landAt(hearth, { high: false }); follow = null; const n = placeUp(hearth); skyFocus = n; const q = new THREE.Quaternion().setFromUnitVectors(Y, n);
  const d = new THREE.Vector3(...skyDir(el, az)), hz = new THREE.Vector3(d.x, 0, d.z);
  const from = hearth.group.position.clone().addScaledVector(n, 14).addScaledVector(hz.applyQuaternion(q), -30);
  flyTo(from, from.clone().add(d.multiplyScalar(60).applyQuaternion(q)).addScaledVector(n, -8), 0.01, n);
};
// test helper: stand in front of Nova (dist, height, sideways offset; angle in radians around her)
window.__novaView = (dist = 3.2, h = 1.2, ang = 0, at = 0.65) => { follow = null; const r = novaBody.root; const P = r.parent; P.updateMatrixWorld(true); const p = r.getWorldPosition(new THREE.Vector3()); const a = r.rotation.y + ang; const f = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).transformDirection(P.matrixWorld), up = new THREE.Vector3(0, 1, 0).transformDirection(P.matrixWorld); flyTo(p.clone().addScaledVector(f, dist).addScaledVector(up, h), p.clone().addScaledVector(up, at), 0.01, up); };
window.__houseView = () => { if (!cottage) return; landAt(hearth, { high: false }); follow = null; flyTo(cottage.group.localToWorld(new THREE.Vector3(2.2, 3.2, 7.5)), cottage.group.localToWorld(new THREE.Vector3(0, 1.4, 0)), 0.01); };
window.__feastView = (dur = 0.01, from = [3.6, 2.45, 3.5], at = [0, 0.95, 0]) => { const f = ctx.feast; if (!f?.group) return; landAt(hearth, { high: false }); follow = null; f.group.updateMatrixWorld(true); flyTo(f.group.localToWorld(new THREE.Vector3(from[0], from[1], from[2])), f.group.localToWorld(new THREE.Vector3(at[0], at[1], at[2])), dur); };
window.__hearthView = (dur = 0.01, from = [-0.4, 2.45, 7.2], at = [1.0, 1.3, -2.0]) => { landAt(hearth, { high: false }); follow = null; hearth.group.updateMatrixWorld(true); flyTo(hearth.group.localToWorld(new THREE.Vector3(from[0], from[1], from[2])), hearth.group.localToWorld(new THREE.Vector3(at[0], at[1], at[2])), dur); };
window.__cottageView = (dur = 0.01, dist = 3.4) => { if (!ctx.cottage) return; landAt(hearth, { high: false }); follow = null; const at = ctx.cottage.doorWorld(); const from = ctx.cottage.doorFront(dist); flyTo(from, at, dur); };

window.__lawnView = (dur = 0.01, from, at) => { const isl = byId('automataLawn'); if (!isl || !ctx.lawn) return; landAt(isl, { high: false }); follow = null; const p = ctx.lawn.viewPoint(); const f = from ? new THREE.Vector3(from[0], from[1], from[2]) : p.from; const a = at ? new THREE.Vector3(at[0], at[1], at[2]) : p.at; isl.group.updateMatrixWorld(true); flyTo(isl.group.localToWorld(f), isl.group.localToWorld(a), dur, placeUp(isl)); ctx.lawn.setActive(true); };
window.__fryerView = (which = 'idle', dur = 0.01) => { if (!ctx.fryer) return; landAt(hearth, { high: false }); follow = null; const p = which === 'flight' ? ctx.fryer.flightView() : which === 'land' ? ctx.fryer.landView() : ctx.fryer.viewPoint(); hearth.group.updateMatrixWorld(true); flyTo(hearth.group.localToWorld(p.from.clone()), hearth.group.localToWorld(p.at.clone()), dur, placeUp(hearth)); ctx.fryer.setActive(true); };
window.__fryerScreen = () => { const g = ctx.fryer?.group; if (!g) return null; g.updateMatrixWorld(true); return toScreen(g.localToWorld(new THREE.Vector3(0, 1.0, 0))); };
window.__pick = (x, y) => { ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); const h = pickHit(); return h ? { ...h.object.userData, d: +h.distance.toFixed(2), type: h.object.type } : null; };
window.__arcadeView = (dur = 0.01) => { if (!arcadeExt) return; landAt(byId('arcade'), { high: false }); follow = null; const v = arcadeView(); flyTo(v.pos, v.target, dur); };
window.__arcadeDoorScreen = () => { if (!arcadeExt) return null; const v = arcadeExt.doorWorld().project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; };
window.__cottageScreen = () => { if (!cottage) return null; const v = cottage.group.localToWorld(new THREE.Vector3(0.9, 1.0, 1.6)).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; };
const toScreen = v => { if (!v) return null; v.project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, front: v.z < 1 }; };
window.__studioView = (dur = 0.01) => { if (!studio) return; landAt(byId('pixelStudio'), { high: false }); follow = null; const v = studio.viewPoint(innerWidth < innerHeight); flyTo(v.pos, v.target, dur); };
window.__radioScreen = () => studio ? toScreen(studio.radioWorld()) : null;
window.__kioskScreen = () => { const isl = byId('starDock'); let k = null; isl?.group.traverse(o => { if (!k && o.isGroup && o.userData.postcards) k = o; }); return k ? toScreen(k.localToWorld(new THREE.Vector3(0, 1.4, 0))) : null; };
window.__kioskView = (dur = 0.01) => { const isl = byId('starDock'); let k = null; isl?.group.traverse(o => { if (!k && o.isGroup && o.userData.postcards) k = o; }); if (!k) return; landAt(isl, { high: false }); follow = null; const c = k.localToWorld(new THREE.Vector3(0, 1.5, 0)); flyTo(k.localToWorld(new THREE.Vector3(0, 3.2, 7.5)), c, dur); };
window.__tagWorld = (id, tag) => { const i = byId(id); let m = null; i?.group.traverse(o => { if (!m && o.isMesh && o.userData[tag] && o.geometry?.type === 'BoxGeometry') m = o; }); if (!m) return null; m.updateMatrixWorld(true); const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()); let f = new THREE.Vector3(0, 0, 1); let g = m.parent; while (g && !g.userData.museum && !g.userData.giftshop) g = g.parent; const top = (function up(o) { return o.parent && o.parent.userData[tag] ? up(o.parent) : o; })(m); f.applyQuaternion(top.getWorldQuaternion(new THREE.Quaternion())); return { x: c.x, y: c.y, z: c.z, fx: f.x, fz: f.z }; };
window.__tagScreen = (id, tag) => { const i = byId(id); let m = null; i?.group.traverse(o => { if (!m && o.isMesh && o.userData[tag] && o.geometry?.type === 'BoxGeometry') m = o; }); if (!m) return null; m.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(m), c = b.getCenter(new THREE.Vector3()); return toScreen(c); };
window.__hearthThing = (which, screen) => { const t = which === 'wall' ? ctx.corkWall?.group : ctx.visitorBoard?.group; if (!t) return null; t.updateMatrixWorld(true); const c = t.localToWorld(new THREE.Vector3(0, 1.55, 0.06)), f = t.localToWorld(new THREE.Vector3(0, 1.55, 1)).sub(c); return screen ? toScreen(c) : { x: c.x, y: c.y, z: c.z, fx: f.x, fy: f.y, fz: f.z }; };
window.__placeScreen = id => { const i = byId(id); return i ? toScreen(i.group.localToWorld(new THREE.Vector3(0, 1, 0))) : null; };
window.__paintingScreen = id => studio ? toScreen(studio.paintingWorld(id)) : null;
const q = new URLSearchParams(location.search);
if (q.get('island')) visit(q.get('island'), { instant: true });
if (q.has('lorenz')) meetLorenz();
if (q.has('studio')) visit('pixelStudio', { instant: true });
if (q.get('painting')) openPainting(q.get('painting'));
if (q.has('postcard') || q.get('planet')) { visit('starDock', { open: false, instant: true }); openPostcards(q.get('planet') || undefined); }
if (q.has('wall')) { visit('hearth', { open: false, instant: true }); openWall(); }
if (q.has('giftshop')) { visit('giftShop', { open: false, instant: true }); const v = q.get('giftshop'); openGiftShop(v && v !== '1' ? v : undefined); }
if (q.has('museum')) { visit('pixelStudio', { open: false, instant: true }); const v = q.get('museum'); openMuseum(v && v !== '1' ? v : undefined); }
if (q.has('cafe')) { visit('cornerCup', { open: false, instant: true }); openCafe(); }
if (q.has('nova')) meetNova({ panel: q.get('nova') !== 'quiet' });
if (q.has('house')) enterHouse(q.get('house') || undefined, { instant: true });
if (q.has('arcade') || q.get('game')) { const w = q.get('arcade'); enterArcade(w && w !== '1' ? w : undefined, { instant: true, game: q.get('game') || undefined }); }
if (q.has('lawn')) visit('automataLawn', { instant: true });
if (q.has('fryer')) { visit('hearth', { open: false, instant: true }); openFryer({ instant: true }); }
// test hook: far-place name tags (drawn through everything) that land on a building's face on screen
window.__farLabelsOver = (id, tag) => {
  const i = byId(id); if (!i || !inRealm) return null; let top = null;
  i.group.traverse(o => { if (!top && o.userData[tag] && !o.parent?.userData[tag]) top = o; });
  if (!top) return null; const box = new THREE.Box3().setFromObject(top), r = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
  for (let k = 0; k < 8; k++) { const v = new THREE.Vector3(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z).project(camera); r.x0 = Math.min(r.x0, v.x); r.x1 = Math.max(r.x1, v.x); r.y0 = Math.min(r.y0, v.y); r.y1 = Math.max(r.y1, v.y); }
  const over = [];
  for (const [pid, p] of realm.places) { if (p.near || !p.lab || !p.lab.visible || !p.landmark.visible) continue; const v = p.lab.getWorldPosition(new THREE.Vector3()).project(camera); if (v.z < 1 && v.x > r.x0 && v.x < r.x1 && v.y > r.y0 && v.y < r.y1) over.push(pid); }
  return { over, rect: r };
};

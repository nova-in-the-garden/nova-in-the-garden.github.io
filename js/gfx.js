// Graphics quality: tiers, soft shadows, bloom, and the little procedural "hand-painted"
// detail that every material in the outdoor world gets.
//
// Tiers: high (desktop), medium (good phones / small laptops), low (everything else).
// ?quality=low|medium|high forces one; otherwise we guess from the device and step down
// on our own if frames get slow (never back up within a visit).
import * as THREE from 'three';
import { UnrealBloomPass } from './bloom.js';

const TIERS = {
  high:   { dpr: 2,    shadow: 2048, shadowR: 48, bloom: true,  grass: 1,    detail: 2, life: 1 },
  medium: { dpr: 1.5,  shadow: 1024, shadowR: 36, bloom: false, grass: 0.45, detail: 1, life: 0.6 },
  low:    { dpr: 1,    shadow: 0,    shadowR: 0,  bloom: false, grass: 0,    detail: 0, life: 0.3 },
};
const ORDER = ['low', 'medium', 'high'];

function guessTier() {
  const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
  if (touch) return cores >= 6 && mem >= 4 ? 'medium' : 'low';   // Safari has no deviceMemory (reads as 4)
  return cores >= 6 ? 'high' : 'medium';
}

// ---------- procedural detail: world-space value noise mixed into diffuse colour ----------
const NOISE = `
float gfxH(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gfxN(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gfxH(i), gfxH(i + vec3(1,0,0)), f.x), mix(gfxH(i + vec3(0,1,0)), gfxH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(gfxH(i + vec3(0,0,1)), gfxH(i + vec3(1,0,1)), f.x), mix(gfxH(i + vec3(0,1,1)), gfxH(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;
// kinds: ground (big patches + clover + speckle), wood (grain along y), stone, roof (shingle rows), soft (gentle, for foliage/props)
const DETAIL = {
  ground: `float gd = length(vViewPosition);
    float big = gfxN(vGfxW * 0.045), mid = gfxN(vGfxW * 0.33 + 7.1), fine = gfxN(vGfxW * 2.7 + 3.3);
    float fineK = 1.0 - smoothstep(18.0, 70.0, gd);
    vec3 gtint = mix(vec3(0.86, 0.95, 0.80), vec3(1.10, 1.05, 0.88), big);
    diffuseColor.rgb *= gtint * (0.90 + 0.20 * mid) * (1.0 + (fine - 0.5) * 0.22 * fineK);`,
  wood: `float gd = length(vViewPosition); vec3 q = vGfxW; float grain = gfxN(vec3(q.x * 9.0, q.y * 0.9, q.z * 9.0)) * 0.6 + gfxN(q * 3.1) * 0.4;
    diffuseColor.rgb *= 0.88 + 0.24 * grain * (1.0 - smoothstep(15.0, 60.0, gd) * 0.6);`,
  stone: `float gd = length(vViewPosition); float s = gfxN(vGfxW * 1.7) * 0.55 + gfxN(vGfxW * 6.0) * 0.45;
    diffuseColor.rgb *= 0.86 + 0.26 * s * (1.0 - smoothstep(15.0, 60.0, gd) * 0.5);`,
  roof: `float gd = length(vViewPosition); float row = fract(vGfxW.y * 4.2); float off = floor(vGfxW.y * 4.2);
    float tile = fract((vGfxW.x + vGfxW.z) * 2.4 + off * 0.5);
    float edge = smoothstep(0.0, 0.12, row) * (0.75 + 0.25 * smoothstep(0.0, 0.06, tile) * smoothstep(1.0, 0.94, tile));
    float k = 1.0 - smoothstep(14.0, 45.0, gd);
    diffuseColor.rgb *= mix(1.0, (0.78 + 0.22 * edge) * (0.92 + 0.16 * gfxN(vec3(off, floor((vGfxW.x + vGfxW.z) * 2.4 + off * 0.5), 0.0) * 3.7)), k);`,
  soft: `float gd = length(vViewPosition); float s = gfxN(vGfxW * 1.3) * 0.6 + gfxN(vGfxW * 4.5) * 0.4;
    diffuseColor.rgb *= 0.92 + 0.16 * s * (1.0 - smoothstep(15.0, 60.0, gd) * 0.6);`,
};
export function addDetail(m, kind = 'soft') {
  if (!m || m.userData.gfxDetail || !DETAIL[kind]) return m;
  if (!(m.isMeshLambertMaterial || m.isMeshStandardMaterial || m.isMeshPhongMaterial)) return m;
  m.userData.gfxDetail = kind;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGfxW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 gfxW4 = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          gfxW4 = instanceMatrix * gfxW4;
        #endif
        vGfxW = (modelMatrix * gfxW4).xyz;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGfxW;' + NOISE)
      .replace('#include <color_fragment>', '#include <color_fragment>\n{' + DETAIL[kind] + '}');
  };
  const pk = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => (pk ? pk() : '') + '|gfx-' + kind;
  m.needsUpdate = true;
  return m;
}
// ---------- water: moving ripples (perturbed normals catch the sun/moon) + a fresnel sky sheen ----------
const W = { uWTime: { value: 0 }, uWSky: { value: new THREE.Color(0x1a2a4a) } };
export function waterify(m, amp = 0.16) {
  if (!m || m.userData.gfxWater || !m.isMeshStandardMaterial) return m;
  m.userData.gfxWater = true; m.userData.gfxDetail = 'water';
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, W);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGfxW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vGfxW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGfxW; uniform float uWTime; uniform vec3 uWSky;')
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        { vec2 p = vGfxW.xz; float t = uWTime;
          vec2 g = vec2(cos(p.x * 1.7 + t * 1.3 + p.y * 0.6), cos(p.y * 1.9 - t * 1.1 + p.x * 0.4)) * 0.5
                 + vec2(cos(p.x * 4.3 - t * 2.1 + p.y * 2.2), cos(p.y * 3.7 + t * 1.7 - p.x * 1.3)) * 0.25
                 + vec2(cos(p.x * 9.1 + t * 3.1 - p.y * 4.0), cos(p.y * 8.3 - t * 2.6 + p.x * 3.3)) * 0.1;
          float fade = 1.0 - smoothstep(25.0, 90.0, length(vViewPosition));
          vec3 wn = normalize(vec3(-g.x * ${amp.toFixed(3)} * fade, 1.0, -g.y * ${amp.toFixed(3)} * fade));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz); }`)
      .replace('#include <opaque_fragment>', `{ float fr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 4.0);
          outgoingLight = mix(outgoingLight, uWSky, 0.04 + 0.4 * fr); }
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'nova-water-' + amp;
  m.needsUpdate = true;
  return m;
}
// guess a detail kind from a material's colour (browns = wood, greys = stone, greens = soft)
// ---------- character polish: a soft gold rim on the silhouette, and a contact shadow blob ----------
export const RIM = { uRimCol: { value: new THREE.Color(0, 0, 0) } };
export function addRim(root, amt = 1) {
  root.traverse(o => {
    if (!o.isMesh) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!m || m.userData.gfxRim || !(m.isMeshStandardMaterial || m.isMeshLambertMaterial)) continue;
      m.userData.gfxRim = amt;
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => {
        prev?.call(m, sh, r);
        sh.uniforms.uRimCol = RIM.uRimCol;
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uRimCol;')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          { float rimF = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
            totalEmissiveRadiance += uRimCol * ${amt.toFixed(2)} * pow(rimF, 3.0); }`);
      };
      const pk = m.customProgramCacheKey?.bind(m);
      m.customProgramCacheKey = () => (pk ? pk() : '') + '|rim';
      m.needsUpdate = true;
    }
  });
}
let blobTex = null;
export function contactShadow(root, r = 0.5, opacity = 0.42) {
  if (!blobTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity, depthWrite: false, color: 0x05060c, polygonOffset: true, polygonOffsetFactor: -4 }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.renderOrder = 1; m.userData.noShadow = true; m.userData.contact = true; m.raycast = () => {};
  m.name = 'contact-shadow'; root.add(m); return m;
}

function kindFor(m) {
  if (m.userData.gfxKind) return m.userData.gfxKind;
  const c = m.color; if (!c || m.vertexColors) return 'soft';
  const hsl = {}; c.getHSL(hsl);
  if (hsl.s < 0.16) return 'stone';
  if (hsl.h > 0.03 && hsl.h < 0.12 && hsl.l < 0.42 && hsl.s < 0.7) return 'wood';
  return 'soft';
}

export function createGfx(renderer, scene) {
  const q = new URLSearchParams(location.search).get('quality');
  const forced = TIERS[q] ? q : null;
  let tier = forced || sessionStorage.getItem('nova.gfx') || guessTier();
  if (!TIERS[tier]) tier = 'medium';
  let T = TIERS[tier];
  const listeners = [];

  renderer.setPixelRatio(Math.min(devicePixelRatio, T.dpr));
  renderer.shadowMap.enabled = true;          // stays on; lights decide whether they cast
  renderer.shadowMap.type = THREE.PCFShadowMap;

  // ---------- shadows: one key light (sun by day, moon by night) casts, around what you look at ----------
  let key = null;
  const focus = new THREE.Vector3(), _d = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
  function setupShadow(light) {
    const s = light.shadow, R = T.shadowR || 40;
    s.mapSize.set(T.shadow || 512, T.shadow || 512);
    s.camera.left = -R; s.camera.right = R; s.camera.top = R; s.camera.bottom = -R; s.camera.near = 1; s.camera.far = 320;
    s.camera.updateProjectionMatrix();
    s.bias = -0.0004; s.normalBias = 0.05; s.radius = 2.5;
    if (s.map) { s.map.dispose(); s.map = null; }
    if (!light.target.parent) scene.add(light.target);
  }
  function pickKey(sun, moon, on) {
    const want = !T.shadow || !on ? null : (sun.intensity >= moon.intensity * 0.6 && sun.intensity > 0.05 ? sun : moon);
    if (want === key) return;
    if (key) key.castShadow = false;
    key = want;
    if (key) { setupShadow(key); curR = 0; key.castShadow = true; }
  }
  // put the key light's shadow box over `at`, snapped to whole shadow texels so edges don't crawl
  let curR = 0;
  function placeShadow(at, strength = 1, want = 0) {
    if (!key) return;
    const RR = Math.max(12, Math.min(T.shadowR, Math.ceil((want || T.shadowR) / 6) * 6));
    if (RR !== curR) { curR = RR; const c = key.shadow.camera; c.left = -RR; c.right = RR; c.top = RR; c.bottom = -RR; c.updateProjectionMatrix(); }
    _d.copy(key.position).normalize();     // main.js sets the light's position (a direction from the origin) every frame
    const tex = (2 * curR) / (T.shadow || 1024);
    _r.crossVectors(_d, THREE.Object3D.DEFAULT_UP); if (_r.lengthSq() < 1e-6) _r.set(1, 0, 0); _r.normalize(); _u.crossVectors(_r, _d);
    const a = Math.round(at.dot(_r) / tex) * tex, b = Math.round(at.dot(_u) / tex) * tex, c = at.dot(_d);
    focus.copy(_r).multiplyScalar(a).addScaledVector(_u, b).addScaledVector(_d, c);
    key.target.position.copy(focus); key.position.copy(focus).addScaledVector(_d, 160);
    key.target.updateMatrixWorld(); key.shadow.intensity = strength;
  }

  // ---------- bloom (high tier): copy what's on screen, add a soft glow from its brightest bits ----------
  let bloom = null, fbTex = null;
  const fb = { texture: null };
  function setupBloom() {
    if (!T.bloom) { bloom?.dispose(); bloom = null; fbTex?.dispose(); fbTex = null; return; }
    const w = renderer.domElement.width, h = renderer.domElement.height;
    if (!bloom) { bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.4, 0.5, 0.8); bloom.overlay = true; bloom.renderToScreen = true; }
    bloom.setSize(w, h);
    fbTex?.dispose(); fbTex = new THREE.FramebufferTexture(w, h); fb.texture = fbTex;
  }
  setupBloom();
  const _v2 = new THREE.Vector2();
  const _rimDay = new THREE.Color(0xffe3a8), _rimNight = new THREE.Color(0xffc45a);
  function afterRender(night = 0, day = 1) {
    RIM.uRimCol.value.copy(_rimDay).lerp(_rimNight, night).multiplyScalar(T.detail >= 1 ? 0.07 + 0.16 * night : 0);
    if (!bloom) return;
    const w = renderer.domElement.width, h = renderer.domElement.height;
    if (fbTex.image.width !== w || fbTex.image.height !== h) setupBloom();
    renderer.copyFramebufferToTexture(fbTex, _v2.set(0, 0));
    bloom.strength = 0.08 + 0.37 * night; bloom.threshold = 0.99 - 0.09 * night;   // by day only near-white bits glow, so the bright sky round a low sun doesn't wash out bloom.radius = 0.45;
    bloom.render(renderer, null, fb, 0, false);
  }

  // ---------- tag meshes for shadows + detail (cheap; new meshes are picked up as they appear) ----------
  const NO_DETAIL = /nova|lorenz|needs|label|sign|tag/i;
  function prep(root, { detail = true, ground = false } = {}) {
    root.traverse(o => {
      if (o.userData.gfx || !(o.isMesh || o.isInstancedMesh)) return;
      o.userData.gfx = 1;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      const lit = ms.some(m => m && (m.isMeshLambertMaterial || m.isMeshStandardMaterial || m.isMeshPhongMaterial));
      const clear = ms.every(m => m && !m.transparent && m.visible !== false && !(m.blending > 1) && !(m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) * (m.emissiveIntensity ?? 1) > 0.9));
      if (!lit) return;
      let skip = false; for (let p = o; p; p = p.parent) if (p.userData.noShadow) { skip = true; break; }
      if (skip) return;
      o.receiveShadow = true;
      const bs = o.geometry?.boundingSphere || (o.geometry?.computeBoundingSphere(), o.geometry?.boundingSphere);
      o.castShadow = clear && !ground && !o.userData.ground && !o.userData.water && !(bs && bs.radius > 120 && !o.isInstancedMesh);
      if (o.userData.water) { for (const m of ms) waterify(m); return; }
      if (!detail || T.detail < 1) return;
      let named = false; for (let p = o; p; p = p.parent) if (NO_DETAIL.test(p.name || '') || p.userData.noDetail) { named = true; break; }
      if (named) return;
      for (const m of ms) if (m && !m.map && !m.userData.gfxDetail && !(m.emissiveIntensity > 1.2)) addDetail(m, ground || o.userData.ground ? 'ground' : kindFor(m));
    });
  }

  // ---------- auto step-down ----------
  let ema = 16, slowFor = 0, warm = 0;
  function watch(rawDt, active = true) {
    if (forced || !active || rawDt > 0.2) return;
    warm += rawDt; if (warm < 5) return;
    ema += (rawDt * 1000 - ema) * 0.05;
    const limit = tier === 'high' ? 30 : tier === 'medium' ? 40 : Infinity;
    slowFor = ema > limit ? slowFor + rawDt : 0;
    if (slowFor > 4) { const i = ORDER.indexOf(tier); if (i > 0) setTier(ORDER[i - 1], true); }
  }
  function setTier(t, auto = false) {
    if (!TIERS[t] || t === tier) return;
    tier = t; T = TIERS[t]; slowFor = 0; warm = 0; ema = 16;
    if (auto) { try { sessionStorage.setItem('nova.gfx', t); } catch {} console.info('[gfx] frames were slow, stepping down to', t); }
    renderer.setPixelRatio(Math.min(devicePixelRatio, T.dpr));
    renderer.setSize(innerWidth, innerHeight);
    if (key) { const k = key; k.castShadow = false; key = null; if (T.shadow) { key = k; setupShadow(k); curR = 0; k.castShadow = true; } }
    setupBloom();
    listeners.forEach(f => f(T, tier));
  }
  function tick(t, skyCol) { W.uWTime.value = t; if (skyCol) W.uWSky.value.copy(skyCol); }
  return {
    tick,
    get tier() { return tier; }, get T() { return T; }, forced: !!forced, TIERS,
    pickKey, placeShadow, afterRender, prep, watch, setTier, onTier: f => listeners.push(f), resize: setupBloom,
    get key() { return key; },
  };
}

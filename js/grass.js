// Swaying grass blades around wherever you are in the Realm (instanced, built in small
// chunks as you move, shaded with the ground colour underneath so it blends in).
// Density and reach come from the graphics tier (js/gfx.js); low tier has none.
import * as THREE from 'three';
import { rng } from './util.js';

const CH = 12;   // chunk size (world units)
export function createGrass(realm, { density = 1, reach = 40 } = {}) {
  const group = new THREE.Group(); group.name = 'grass'; group.userData.noDetail = true;
  const uTime = { value: 0 }, uCam = { value: new THREE.Vector3() }, uReach = { value: reach }, uSnow = { value: 0 };
  // one blade: a tapered strip, 3 triangles, uv.y = height along the blade
  const geo = new THREE.BufferGeometry();
  const W = 0.042, H = 0.4;
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-W, 0, 0, W, 0, 0, -W * 0.7, H * 0.45, 0.01, W * 0.7, H * 0.45, 0.01, 0.01, H, 0.04], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 0.45, 1, 0.45, 0.5, 1], 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  geo.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  // little flower heads riding on some blade tips (uv.y = 1 everywhere, so they sway like a tip)
  const fgeo = new THREE.OctahedronGeometry(0.055, 0).scale(1, 0.6, 1).translate(0.01, H + 0.02, 0.04);
  fgeo.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(fgeo.attributes.position.count * 2).fill(1), 2));
  const FLOWERS = [0xf2cd62, 0xf4ece0, 0xc8323a, 0x9a7ae0, 0xe8a0c0, 0xffd27a];
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uTime, uCam, uReach, uSnow });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      uniform float uTime, uReach, uSnow; uniform vec3 uCam; varying float vGH;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 gip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      float gfar = 1.0 - smoothstep(uReach * 0.62, uReach, distance(gip.xz, uCam.xz));
      float gh = uv.y; vGH = gh;
      transformed *= vec3(1.0, gfar * (1.0 - 0.6 * uSnow), 1.0);
      float gw = sin(uTime * 1.6 + gip.x * 0.23 + gip.z * 0.31) * 0.6 + sin(uTime * 2.7 + gip.x * 0.9) * 0.25;
      vec3 gwind = vec3(gw * 0.13, 0.0, gw * 0.07) * gh * gh;
      // wind in world space: undo the blade's own spin
      transformed += (inverse(mat3(instanceMatrix)) * gwind);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGH; uniform float uSnow;')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n      normal = normalize(vNormal);   // both faces lit like the ground')
      .replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb *= mix(0.55, 1.18, vGH);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 1.0), uSnow * 0.7 * vGH);`);
  };
  mat.customProgramCacheKey = () => 'nova-grass';
  const chunks = new Map(), queue = [];
  const key = (i, j) => i * 100003 + j;
  const col = new THREE.Color(), Mx = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), V = new THREE.Vector3(), E = new THREE.Euler();
  const N = 13;   // sample grid per chunk (1 unit apart)
  function build(i, j) {
    const x0 = i * CH, z0 = j * CH, step = CH / (N - 1);
    const hs = new Float32Array(N * N), ok = new Float32Array(N * N), cs = new Float32Array(N * N * 3);
    let any = false;
    for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
      const x = x0 + a * step, z = z0 + b * step, k = a * N + b;
      const y = realm.terrain(x, z); hs[k] = y;
      ok[k] = realm.grassOK(x, z, y);
      if (ok[k] > 0) { any = true; realm.groundColorAt(x, z, y, col); cs[k * 3] = col.r; cs[k * 3 + 1] = col.g; cs[k * 3 + 2] = col.b; }
    }
    if (!any) return null;
    const R = rng(9000 + (i * 7919 + j * 104729) % 100000);
    const n = Math.round(CH * CH * 13 * density);
    const im = new THREE.InstancedMesh(geo, mat, n);
    let c = 0; const heads = [];
    for (let q = 0; q < n; q++) {
      const fx = R() * (N - 1), fz = R() * (N - 1), a = Math.min(N - 2, Math.floor(fx)), b = Math.min(N - 2, Math.floor(fz)), u = fx - a, v = fz - b;
      const k00 = a * N + b, k10 = (a + 1) * N + b, k01 = a * N + b + 1, k11 = (a + 1) * N + b + 1;
      const okv = ok[k00] * (1 - u) * (1 - v) + ok[k10] * u * (1 - v) + ok[k01] * (1 - u) * v + ok[k11] * u * v;
      if (R() > okv) continue;
      const y = hs[k00] * (1 - u) * (1 - v) + hs[k10] * u * (1 - v) + hs[k01] * (1 - u) * v + hs[k11] * u * v;
      const tall = 0.5 + R() * 0.6 + (R() < 0.06 ? 0.5 : 0);
      E.set((R() - 0.5) * 0.35, R() * Math.PI * 2, (R() - 0.5) * 0.35); Q.setFromEuler(E);
      V.set(x0 + fx * step, y - 0.03, z0 + fz * step); S.set(0.8 + R() * 0.6, tall, 1);
      Mx.compose(V, Q, S); im.setMatrixAt(c, Mx);
      const kk = ok[k00] ? k00 : ok[k10] ? k10 : ok[k01] ? k01 : k11;
      col.setRGB(cs[kk * 3], cs[kk * 3 + 1], cs[kk * 3 + 2]).offsetHSL((R() - 0.5) * 0.03, 0.04 + R() * 0.08, (R() - 0.4) * 0.07);
      im.setColorAt(c, col); c++;
      if (R() < 0.018) heads.push([Mx.clone(), FLOWERS[Math.floor(R() * FLOWERS.length)]]);
    }
    if (!c) { im.dispose(); return null; }
    if (heads.length) {
      const fm = new THREE.InstancedMesh(fgeo, mat, heads.length);
      heads.forEach(([m, h], k) => { fm.setMatrixAt(k, m); fm.setColorAt(k, col.setHex(h).multiplyScalar(0.85)); });
      fm.computeBoundingSphere(); fm.receiveShadow = true; fm.userData.gfx = 1; im.add(fm); im.userData.heads = fm;
    }
    im.count = c; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere(); im.receiveShadow = true; im.castShadow = false; im.userData.gfx = 1;
    group.add(im); return im;
  }
  let lastI = 1e9, lastJ = 1e9;
  function update(t, cam) {
    uTime.value = t; uCam.value.copy(cam);
    if (density <= 0) { group.visible = false; return; }
    group.visible = uSnow.value < 0.75;
    const ci = Math.floor(cam.x / CH), cj = Math.floor(cam.z / CH), rr = Math.ceil(reach / CH) + 1;
    if (ci !== lastI || cj !== lastJ) {
      lastI = ci; lastJ = cj; queue.length = 0;
      for (let a = -rr; a <= rr; a++) for (let b = -rr; b <= rr; b++) {
        const i = ci + a, j = cj + b, d = Math.hypot((i + 0.5) * CH - cam.x, (j + 0.5) * CH - cam.z);
        if (d < reach + CH && !chunks.has(key(i, j))) queue.push([d, i, j]);
      }
      queue.sort((p, q) => q[0] - p[0]);   // nearest last (popped first)
      for (const [k, m] of chunks) { if (!m) { continue; } const s = m.boundingSphere.center; if (Math.hypot(s.x - cam.x, s.z - cam.z) > reach + CH * 3) { group.remove(m); m.userData.heads?.dispose(); m.dispose(); chunks.delete(k); } }
    }
    for (let n = 0; n < 2 && queue.length; n++) { const [, i, j] = queue.pop(); chunks.set(key(i, j), build(i, j)); }
    for (const m of chunks.values()) if (m) { const s = m.boundingSphere.center; m.visible = Math.hypot(s.x - cam.x, s.z - cam.z) < reach + CH; }
  }
  function prewarm(cam) { update(0, cam); while (queue.length) { const [, i, j] = queue.pop(); chunks.set(key(i, j), build(i, j)); } }
  function reset() { for (const m of chunks.values()) if (m) { group.remove(m); m.userData.heads?.dispose(); m.dispose(); } chunks.clear(); lastI = lastJ = 1e9; }
  function setTier({ grass = 0, shadowR }) { density = grass; reach = grass >= 1 ? 42 : 28; uReach.value = reach; reset(); }
  return { group, update, prewarm, reset, setTier, set snow(v) { uSnow.value = v; }, get count() { let n = 0; for (const m of chunks.values()) if (m) n += m.count; return n; } };
}

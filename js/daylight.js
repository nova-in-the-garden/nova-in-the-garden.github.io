// Time of day for Nova's world: turns the sun's elevation into a palette
// (sky, light, fog, glow) and works out what time the world should show.
import * as THREE from 'three';
import { REF, sunPosition, moonPosition, sunTimes, zonedParts, zonedDate } from './sun.js';

// ---------- palette keyframes, by sun elevation (degrees) ----------
// Sky colours are display values (the sky shader writes them straight out).
// The night key is exactly the original Night and Gold sky.
const KEYS = [
  { el: -18, deep: [0.10, 0.07, 0.16], top: [0.012, 0.02, 0.07], mid: [0.04, 0.06, 0.17], low: [0.10, 0.07, 0.16], band: [0.0875, 0.063, 0.0175], cloud: 0, cloudCol: [0.3, 0.3, 0.4], stars: 1,
    hemi: 0x8ea4ff, ground: 0x1a1430, hemiI: 1.1, moonI: 1.4, warmI: 0.8, sunCol: 0xff9a50, sunI: 0, fog: 0x0a1030, fogD: 0.0045, glow: 1, halo: 1, exposure: 1.15 },
  { el: -10, deep: [0.12, 0.08, 0.20], top: [0.02, 0.04, 0.13], mid: [0.08, 0.10, 0.27], low: [0.26, 0.14, 0.27], band: [0.22, 0.10, 0.08], cloud: 0.12, cloudCol: [0.22, 0.16, 0.30], stars: 0.75,
    hemi: 0x8c98ff, ground: 0x221838, hemiI: 1.1, moonI: 1.2, warmI: 0.8, sunCol: 0xff8a50, sunI: 0, fog: 0x1a1a44, fogD: 0.0042, glow: 1, halo: 1, exposure: 1.15 },
  { el: -3, deep: [0.30, 0.17, 0.32], top: [0.10, 0.15, 0.38], mid: [0.44, 0.32, 0.54], low: [0.98, 0.56, 0.42], band: [0.62, 0.30, 0.12], cloud: 0.45, cloudCol: [0.98, 0.58, 0.56], stars: 0.22,
    hemi: 0xc9a6d8, ground: 0x4a3050, hemiI: 1.3, moonI: 0.6, warmI: 0.7, sunCol: 0xff7a48, sunI: 0.5, fog: 0x6a4a72, fogD: 0.0036, glow: 0.85, halo: 0.85, exposure: 1.1 },
  { el: 3, deep: [0.58, 0.40, 0.42], top: [0.30, 0.43, 0.72], mid: [0.82, 0.66, 0.62], low: [1.0, 0.78, 0.50], band: [0.55, 0.32, 0.12], cloud: 0.6, cloudCol: [1.0, 0.80, 0.60], stars: 0,
    hemi: 0xffd2b0, ground: 0x6a4a50, hemiI: 1.65, moonI: 0.15, warmI: 0.6, sunCol: 0xffa860, sunI: 3.2, fog: 0xc89a82, fogD: 0.0030, glow: 0.6, halo: 0.55, exposure: 1.05 },
  { el: 10, deep: [0.62, 0.70, 0.84], top: [0.30, 0.52, 0.86], mid: [0.62, 0.77, 0.94], low: [0.96, 0.91, 0.80], band: [0.18, 0.14, 0.08], cloud: 0.65, cloudCol: [1.0, 0.97, 0.92], stars: 0,
    hemi: 0xd4e2ff, ground: 0x7a6c5a, hemiI: 1.8, moonI: 0, warmI: 0.35, sunCol: 0xffe6c0, sunI: 2.8, fog: 0xb8cce4, fogD: 0.0028, glow: 0.4, halo: 0.3, exposure: 1.0 },
  { el: 35, deep: [0.60, 0.72, 0.88], top: [0.26, 0.50, 0.88], mid: [0.58, 0.76, 0.95], low: [0.95, 0.92, 0.84], band: [0.12, 0.10, 0.06], cloud: 0.6, cloudCol: [1.0, 0.99, 0.96], stars: 0,
    hemi: 0xdbe6ff, ground: 0x80725e, hemiI: 1.9, moonI: 0, warmI: 0.3, sunCol: 0xfff2dc, sunI: 3.0, fog: 0xb4cae6, fogD: 0.0026, glow: 0.35, halo: 0.25, exposure: 1.0 },
];
const lerp = (a, b, k) => a + (b - a) * k;
const lerp3 = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
const cA = new THREE.Color(), cB = new THREE.Color();
const lerpHex = (a, b, k) => cA.setHex(a).lerp(cB.setHex(b), k).getHex();

export function palette(el, morning) {
  let i = 0; while (i < KEYS.length - 2 && el > KEYS[i + 1].el) i++;
  const A = KEYS[i], B = KEYS[i + 1];
  let k = THREE.MathUtils.clamp((el - A.el) / (B.el - A.el), 0, 1); k = k * k * (3 - 2 * k);
  const out = {};
  for (const key of Object.keys(A)) {
    const a = A[key], b = B[key];
    out[key] = Array.isArray(a) ? lerp3(a, b, k) : (['hemi', 'ground', 'sunCol', 'fog'].includes(key) ? lerpHex(a, b, k) : lerp(a, b, k));
  }
  // dawn is a little pinker and cooler, dusk a little more orange
  const tw = Math.max(0, 1 - Math.abs(el + 2) / 9);
  if (tw > 0) {
    const tint = morning ? [0.97, 0.9, 1.08] : [1.04, 0.97, 0.88];
    out.low = out.low.map((v, j) => Math.min(1, v * lerp(1, tint[j], tw)));
    out.band = out.band.map((v, j) => v * lerp(1, tint[j], tw));
    out.cloudCol = out.cloudCol.map((v, j) => Math.min(1, v * lerp(1, tint[j], tw)));
  }
  out.night = THREE.MathUtils.clamp((-el - 2) / 12, 0, 1);        // 0 by day .. 1 when properly dark
  out.day = THREE.MathUtils.clamp((el + 2) / 10, 0, 1);            // 0 at night .. 1 in daylight
  return out;
}

export function phaseName(el, morning) {
  if (el < -12) return { id: 'night', name: 'Night' };
  if (el < -6) return { id: morning ? 'dawn' : 'dusk', name: morning ? 'First light' : 'Last light' };
  if (el < -0.833) return { id: morning ? 'dawn' : 'dusk', name: morning ? 'Dawn' : 'Dusk' };
  if (el < 6) return { id: 'golden', name: 'Golden hour' };
  return { id: 'day', name: 'Day' };
}

// ---------- which moment the world shows ----------
// live (default), ?time=HH:MM (Central), ?phase=dawn|day|golden|dusk|night, or the slider.
export function makeClock() {
  const q = new URLSearchParams(location.search);
  let override = null; // minutes after local midnight (Central), or null for live
  const today = () => { const z = zonedParts(new Date()); return z; };
  const atMinutes = m => { const z = today(); return zonedDate(z.y, z.mo, z.d, Math.floor(m / 60), Math.round(m % 60)); };
  const minutesOf = d => { const z = zonedParts(d); return z.h * 60 + z.mi + z.s / 60; };
  function phaseMinutes(p) {
    const t = sunTimes(new Date());
    const mid = (a, b) => new Date((a.getTime() + b.getTime()) / 2);
    const goldenEve = new Date(t.sunset.getTime() - 25 * 60000);
    const m = { dawn: t.dawn && t.sunrise && mid(t.dawn, t.sunrise), day: new Date(t.noon.getTime() - 90 * 60000), noon: t.noon,
      golden: goldenEve, dusk: t.sunset && t.dusk && mid(t.sunset, t.dusk), night: new Date(t.noon.getTime() + 11 * 3600000) }[p];
    return m ? minutesOf(m) : null;
  }
  const tq = q.get('time'), pq = q.get('phase');
  if (tq && /^\d{1,2}:\d{2}$/.test(tq)) { const [h, mi] = tq.split(':').map(Number); if (h < 24 && mi < 60) override = h * 60 + mi; }
  else if (pq) override = phaseMinutes(pq.toLowerCase());
  return {
    get live() { return override === null; },
    get minutes() { return override ?? minutesOf(new Date()); },
    set(m) { override = m === null ? null : ((m % 1440) + 1440) % 1440; },
    phaseMinutes,
    at: atMinutes,
    now() { return override === null ? new Date() : atMinutes(override); },
  };
}

export function skyState(date) {
  const sun = sunPosition(date), moon = moonPosition(date), times = sunTimes(date);
  const morning = date.getTime() < times.noon.getTime();
  return { date, sun, moon, times, morning, phase: phaseName(sun.elevation, morning), pal: palette(sun.elevation, morning) };
}

// ---------- glow bookkeeping ----------
// Remember the "night" strength of every glowing material under a root, so
// the whole set can be dimmed by day. Animated ones (flicker) are skipped;
// their own updaters multiply by the same factor.
export function collectGlows(root, skip = () => false) {
  const emissive = new Map(), halos = new Map();
  root.traverse(o => {
    if (skip(o)) return;
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) {
      if (m.userData.anim || m.userData.keepGlow) continue;
      if (m.emissive && m.emissiveIntensity > 0.25 && m.emissive.getHex() !== 0 && !emissive.has(m)) emissive.set(m, m.emissiveIntensity);
      if ((m.isSpriteMaterial || m.isPointsMaterial) && m.blending === THREE.AdditiveBlending && !halos.has(m)) halos.set(m, m.opacity);
    }
  });
  return (glow, halo) => { emissive.forEach((v, m) => { m.emissiveIntensity = v * glow; }); halos.forEach((v, m) => { m.opacity = v * halo; }); };
}

export { REF };

// Shared, read by animated things (cottage windows, porch lantern, Lorenz).
export const DAY = { glow: 1, halo: 1, night: 1, day: 0, window: 1 };

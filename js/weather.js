// Weather for Nova's Garden. Live readings come from Open-Meteo (no API key)
// at the same generic Central-US point the sky already uses (REF in sun.js:
// 38.6°N, 90.2°W, near St. Louis — deliberately not anyone's home). Previews
// with ?date=, failed requests, and Playwright all use a deterministic
// climate fallback. ?weather=rain|snow|clear (also cloud, fog) always wins.
import * as THREE from 'three';
import { REF } from './sun.js';
import { season, ymd } from './holiday.js';

const KINDS = new Set(['rain', 'snow', 'clear', 'cloud', 'fog']);

export function parseWeatherQuery() {
  const raw = new URLSearchParams(location.search).get('weather');
  if (!raw) return null;
  const k = raw.toLowerCase().trim();
  if (k === 'cloudy') return 'cloud';
  return KINDS.has(k) ? k : null;
}

export function kindFromWmo(code, cloud = 0, snowfall = 0) {
  const c = +code;
  if (c === 45 || c === 48) return 'fog';
  if (snowfall > 0 || (c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82) || (c >= 95 && c <= 99)) return 'rain';
  if (c === 2 || c === 3 || cloud >= 70) return 'cloud';
  return 'clear';
}

function hash32(n) {
  let x = (n >>> 0) + 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return (x ^ (x >>> 15)) >>> 0;
}

// A stylized climate for REF: winters often cloudy, with some snow; springs
// and summers bring more rain; autumn is the clearest. The same date always
// gets the same kind, so ?date= previews stay honest and offline-safe.
export function fallbackWeather(date) {
  const z = ymd(date), s = season(date);
  const u = hash32(z.y * 10000 + z.mo * 100 + z.d) / 0xffffffff;
  let kind = 'clear', clouds = 0.28;
  if (s === 'winter') {
    if (u < 0.18) { kind = 'snow'; clouds = 0.88; }
    else if (u < 0.30) { kind = 'fog'; clouds = 0.72; }
    else if (u < 0.58) { kind = 'cloud'; clouds = 0.82; }
    else if (u < 0.70) { kind = 'rain'; clouds = 0.86; }
    else { kind = 'clear'; clouds = 0.28; }
  } else if (s === 'spring') {
    if (u < 0.24) { kind = 'rain'; clouds = 0.86; }
    else if (u < 0.30) { kind = 'fog'; clouds = 0.7; }
    else if (u < 0.55) { kind = 'cloud'; clouds = 0.7; }
    else { kind = 'clear'; clouds = 0.3; }
  } else if (s === 'summer') {
    if (u < 0.16) { kind = 'rain'; clouds = 0.8; }
    else if (u < 0.38) { kind = 'cloud'; clouds = 0.6; }
    else { kind = 'clear'; clouds = 0.22; }
  } else {
    if (u < 0.16) { kind = 'rain'; clouds = 0.8; }
    else if (u < 0.22) { kind = 'fog'; clouds = 0.68; }
    else if (u < 0.48) { kind = 'cloud'; clouds = 0.65; }
    else { kind = 'clear'; clouds = 0.26; }
  }
  return {
    kind, clouds,
    precip: (kind === 'rain' || kind === 'snow') ? 0.7 : 0,
    source: 'fallback',
  };
}

function applyOverride(kind, base) {
  const clouds = kind === 'clear' ? 0.12 : kind === 'cloud' ? 0.78 : kind === 'fog' ? 0.7 : 0.88;
  return { ...base, kind, clouds, precip: (kind === 'rain' || kind === 'snow') ? 0.85 : 0, source: 'override' };
}

const OPEN_METEO = `https://api.open-meteo.com/v1/forecast?latitude=${REF.lat}&longitude=${REF.lon}&current=weather_code,cloud_cover,precipitation,snowfall,visibility&timezone=America%2FChicago`;

export const WEATHER_PLACE = {
  lat: REF.lat,
  lon: REF.lon,
  tz: REF.tz,
  // Same generic Central-US point the sky already uses; not a home address.
  label: 'generic Central US (near St. Louis)',
};

function makeParticles(scene) {
  const N_SNOW = 700, N_RAIN = 500;
  const snowGeo = new THREE.BufferGeometry();
  const snowPos = new Float32Array(N_SNOW * 3);
  const snowVel = new Float32Array(N_SNOW);
  for (let i = 0; i < N_SNOW; i++) {
    snowPos[i * 3] = (Math.random() - 0.5) * 36;
    snowPos[i * 3 + 1] = Math.random() * 22;
    snowPos[i * 3 + 2] = (Math.random() - 0.5) * 36;
    snowVel[i] = 0.9 + Math.random() * 0.7;
  }
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snowMat = new THREE.PointsMaterial({
    color: 0xf4f7fb, size: 0.11, transparent: true, opacity: 0.9,
    depthWrite: false, sizeAttenuation: true,
  });
  const snow = new THREE.Points(snowGeo, snowMat);
  snow.frustumCulled = false; snow.visible = false; snow.renderOrder = 6;
  scene.add(snow);

  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(N_RAIN * 6);
  const rainVel = new Float32Array(N_RAIN);
  for (let i = 0; i < N_RAIN; i++) {
    const x = (Math.random() - 0.5) * 36, y = Math.random() * 22, z = (Math.random() - 0.5) * 36;
    rainPos[i * 6] = x; rainPos[i * 6 + 1] = y; rainPos[i * 6 + 2] = z;
    rainPos[i * 6 + 3] = x; rainPos[i * 6 + 4] = y - 0.55; rainPos[i * 6 + 5] = z;
    rainVel[i] = 14 + Math.random() * 8;
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.LineBasicMaterial({
    color: 0x9eb4d0, transparent: true, opacity: 0.45, depthWrite: false,
  });
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false; rain.visible = false; rain.renderOrder = 6;
  scene.add(rain);

  const origin = new THREE.Vector3();
  function wrap(px, py, pz, i, pos, stride, h, fall) {
    let x = px, y = py - fall, z = pz;
    if (y < -2) y += 22;
    const dx = x - origin.x, dz = z - origin.z;
    if (dx > 18) x -= 36; else if (dx < -18) x += 36;
    if (dz > 18) z -= 36; else if (dz < -18) z += 36;
    pos[i * stride] = x; pos[i * stride + 1] = y; pos[i * stride + 2] = z;
    return [x, y, z];
  }

  return {
    snow, rain,
    tick(dt, cam, kind) {
      if (!cam) return;
      origin.set(cam.position.x, cam.position.y, cam.position.z);
      snow.visible = kind === 'snow';
      rain.visible = kind === 'rain';
      if (kind === 'snow') {
        snow.position.set(origin.x, origin.y, origin.z);
        // Keep points in a box around the origin (local to the Points object).
        const a = snowGeo.attributes.position, arr = a.array;
        for (let i = 0; i < N_SNOW; i++) {
          let x = arr[i * 3] + Math.sin(i + origin.x) * 0.15 * dt;
          let y = arr[i * 3 + 1] - snowVel[i] * dt * 1.6;
          let z = arr[i * 3 + 2] + Math.cos(i + origin.z) * 0.12 * dt;
          if (y < -4) y += 22;
          if (x > 18) x -= 36; else if (x < -18) x += 36;
          if (z > 18) z -= 36; else if (z < -18) z += 36;
          arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
        }
        a.needsUpdate = true;
      } else if (kind === 'rain') {
        rain.position.set(origin.x, origin.y, origin.z);
        const a = rainGeo.attributes.position, arr = a.array;
        for (let i = 0; i < N_RAIN; i++) {
          let x = arr[i * 6], y = arr[i * 6 + 1] - rainVel[i] * dt, z = arr[i * 6 + 2];
          if (y < -4) y += 22;
          if (x > 18) x -= 36; else if (x < -18) x += 36;
          if (z > 18) z -= 36; else if (z < -18) z += 36;
          arr[i * 6] = x; arr[i * 6 + 1] = y; arr[i * 6 + 2] = z;
          arr[i * 6 + 3] = x + 0.08; arr[i * 6 + 4] = y - 0.55; arr[i * 6 + 5] = z;
        }
        a.needsUpdate = true;
      }
    },
  };
}

export function createWeather(scene) {
  let override = parseWeatherQuery();
  let state = applyOverride(override || 'clear', fallbackWeather(new Date()));
  if (!override) state = { ...fallbackWeather(new Date()), source: 'fallback' };
  const parts = makeParticles(scene);
  let fetched = false, inflight = false;

  function adopt(next) { state = next; }

  function setFromDate(date, { live = false, dateOverride = false } = {}) {
    if (override) { adopt(applyOverride(override, fallbackWeather(date))); return; }
    adopt({ ...fallbackWeather(date), source: 'fallback' });
    if (!live || dateOverride || fetched || inflight) return;
    if (typeof navigator !== 'undefined' && navigator.webdriver) return;
    inflight = true;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    fetch(OPEN_METEO, { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('meteo')))
      .then(j => {
        const c = j.current || {};
        const kind = kindFromWmo(c.weather_code, c.cloud_cover, c.snowfall);
        adopt({
          kind,
          clouds: Math.max(0, Math.min(1, (c.cloud_cover || 0) / 100)),
          precip: c.precipitation || 0,
          visibility: c.visibility,
          wmo: c.weather_code,
          source: 'live',
        });
        fetched = true;
      })
      .catch(() => { /* keep the fallback */ })
      .finally(() => { clearTimeout(t); inflight = false; });
  }

  function applySky(p, skyU, sceneFog, setFogBase) {
    const extra = state.kind === 'clear' ? 0 : state.kind === 'cloud' ? 0.35 : 0.5;
    skyU.uCloud.value = Math.min(1, Math.max(p.cloud, state.clouds) + extra * 0.2);
    if (state.kind === 'fog') {
      const d = Math.max(p.fogD * 2.4, 0.011);
      setFogBase(d);
      sceneFog.density = d;
      sceneFog.color.lerp(new THREE.Color(0xc4ccd6), 0.55);
    } else if (state.kind === 'rain' || state.kind === 'snow') {
      const d = Math.max(p.fogD * 1.35, 0.004);
      setFogBase(d);
      sceneFog.density = d;
      if (state.kind === 'snow') sceneFog.color.lerp(new THREE.Color(0xd8dee8), 0.35);
    }
  }

  function setKind(kind) {
    if (kind && !KINDS.has(kind)) return state.kind;
    override = kind || null;
    if (override) adopt(applyOverride(override, fallbackWeather(new Date())));
    else adopt({ ...fallbackWeather(new Date()), source: 'fallback' });
    return state.kind;
  }
  return {
    get state() { return state; },
    get override() { return override; },
    place: WEATHER_PLACE,
    setFromDate,
    setKind,
    applySky,
    tick(dt, cam) { parts.tick(dt, cam, state.kind); },
  };
}

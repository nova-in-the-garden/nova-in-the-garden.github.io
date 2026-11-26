// Interactive play in the Realm: pet Nova, feed the birds, and (later) a snowball fight.
// Taps are distinguished from camera drags by the caller (pointer movement ≤ 7 px).
import * as THREE from 'three';
import { canvasTexture } from './util.js';
import { WALL_API_URL } from './config.js';

function heartTexture() {
  return canvasTexture(64, 64, (g, w, h) => {
    const x = w / 2, y = 8, s = 48;
    g.save();
    g.shadowColor = 'rgba(80,0,20,.55)'; g.shadowBlur = 6;
    g.beginPath();
    g.moveTo(x, y + s * 0.3);
    g.bezierCurveTo(x, y, x - s / 2, y, x - s / 2, y + s * 0.3);
    g.bezierCurveTo(x - s / 2, y + s * 0.62, x, y + s * 0.85, x, y + s);
    g.bezierCurveTo(x, y + s * 0.85, x + s / 2, y + s * 0.62, x + s / 2, y + s * 0.3);
    g.bezierCurveTo(x + s / 2, y, x, y, x, y + s * 0.3);
    g.closePath();
    g.fillStyle = '#ff4d73';
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = '#ff8aa0';
    g.beginPath();
    g.ellipse(x - 9, y + 16, 6, 4, -0.5, 0, Math.PI * 2);
    g.fill();
    g.restore();
  });
}

export function createInteract({
  scene, camera, renderer, realm, novaBody, novaBrain, lorenz, gfx, life,
  hearth, pond = null, weatherKind = () => 'clear',
  inRealm = () => false, toast = () => {},
}) {
  const group = new THREE.Group(); group.name = 'play'; group.userData.noDetail = true;
  scene.add(group);

  const hud = document.getElementById('play-hud');
  const hintEl = document.getElementById('play-hint');
  const countEl = document.getElementById('play-count');

  const api = WALL_API_URL ? WALL_API_URL.replace(/\/$/, '') : '';
  const pets = { total: 0, today: 0, todayDate: '', ready: false, localBurst: 0 };
  const hearts = [];
  const heartMap = heartTexture(); heartMap.needsUpdate = true; heartMap.premultiplyAlpha = false;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  function heartBudget() {
    const life = gfx?.T?.life ?? 1;
    return life >= 0.99 ? 7 : life >= 0.5 ? 5 : 3;
  }

  function spawnHearts(origin, n) {
    const N = Math.min(n, heartBudget());
    const toward = tmp2.copy(camera.position).sub(origin); toward.y = 0;
    if (toward.lengthSq() < 1e-6) toward.set(0, 0, 1);
    toward.normalize().multiplyScalar(0.45);
    for (let i = 0; i < N; i++) {
      const mat = new THREE.SpriteMaterial({
        map: heartMap, color: 0xffffff, transparent: true, depthTest: false, depthWrite: false,
        opacity: 0, toneMapped: false, sizeAttenuation: true,
      });
      const s = new THREE.Sprite(mat);
      s.renderOrder = 20;
      s.frustumCulled = false;
      s.position.copy(origin).add(toward);
      s.position.x += (Math.random() - 0.5) * 0.4;
      s.position.z += (Math.random() - 0.5) * 0.4;
      s.position.y += 0.35 + Math.random() * 0.2;
      s.scale.setScalar(0.38 + Math.random() * 0.12);
      s.userData = {
        vx: (Math.random() - 0.5) * 0.45,
        vy: 0.55 + Math.random() * 0.35,
        vz: (Math.random() - 0.5) * 0.45,
        life: 1.4 + Math.random() * 0.4,
        age: -i * 0.03,
      };
      group.add(s); hearts.push(s);
    }
  }

  function tickHearts(dt) {
    for (let i = hearts.length - 1; i >= 0; i--) {
      const s = hearts[i], u = s.userData;
      u.age += dt;
      if (u.age < 0) continue;
      s.position.x += u.vx * dt;
      s.position.y += u.vy * dt;
      s.position.z += u.vz * dt;
      u.vy += 0.15 * dt;
      const k = Math.max(0, 1 - u.age / u.life);
      const fadeIn = Math.min(1, Math.max(0, u.age) / 0.08);
      const fadeOut = u.age > u.life - 0.3 ? Math.max(0, (u.life - u.age) / 0.3) : 1;
      s.material.opacity = fadeIn * fadeOut;
      s.scale.setScalar((0.36 + (1 - k) * 0.14) * (0.92 + 0.08 * Math.sin(u.age * 8)));
      if (k <= 0) { group.remove(s); s.material.dispose(); hearts.splice(i, 1); }
    }
  }

  function renderHud() {
    if (!hud) return;
    const show = inRealm();
    hud.hidden = !show;
    if (countEl) {
      const n = pets.total;
      countEl.textContent = n ? `♥ ${n}` : '♥';
      countEl.title = pets.ready
        ? `${n} all-time pets · ${pets.today} today`
        : 'Pet counts load when the wall is reachable';
    }
    if (hintEl) {
      const snow = weatherKind() === 'snow';
      hintEl.textContent = snow
        ? 'Tap Nova to pet her · drag to look around'
        : 'Tap Nova to pet her · tap the grass to feed the birds · drag to look around';
    }
  }

  async function refreshCounts() {
    if (!api) return;
    try {
      const r = await fetch(api + '/pets', { credentials: 'omit' });
      const j = await r.json();
      if (!r.ok) return;
      pets.total = j.total || 0;
      pets.today = j.today_count || 0;
      pets.todayDate = j.today || '';
      pets.ready = true;
      renderHud();
    } catch { /* keep the last known count */ }
  }

  async function recordPet() {
    if (!api) return { counted: false };
    try {
      const r = await fetch(api + '/pet', { method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' }, body: '{}' });
      const j = await r.json().catch(() => ({}));
      if (typeof j.total === 'number') {
        pets.total = j.total;
        pets.today = j.today_count || pets.today;
        pets.todayDate = j.today || pets.todayDate;
        pets.ready = true;
        renderHud();
      }
      return { counted: !!j.counted, ...j };
    } catch {
      return { counted: false };
    }
  }

  function novaWorld(out = tmp) {
    const r = novaBody.root;
    r.updateMatrixWorld(true);
    return r.getWorldPosition(out);
  }

  function petNova({ cameraLook = true, record = true } = {}) {
    const origin = novaWorld(new THREE.Vector3());
    origin.y += 0.72 * (novaBody.root.scale.y || 1);
    const look = cameraLook ? camera.position.clone() : null;
    novaBody.pet(look);
    spawnHearts(origin, heartBudget());
    pets.localBurst += 1;
    if (record) recordPet();
    renderHud();
    return { at: origin, petT: novaBody.anim.petT };
  }

  function projectNova() {
    const v = novaWorld(new THREE.Vector3());
    v.y += 0.55;
    v.project(camera);
    return {
      x: (v.x * 0.5 + 0.5) * innerWidth,
      y: (-v.y * 0.5 + 0.5) * innerHeight,
      visible: v.z > -1 && v.z < 1,
    };
  }


  // ----- feed the birds -----
  const seeds = [];
  let seedSeq = 1;
  let lastPtr = null, lastPtrT = 0;
  const grainGeo = new THREE.SphereGeometry(0.045, 6, 4);
  const grainMats = [
    new THREE.MeshLambertMaterial({ color: 0xc4a056 }),
    new THREE.MeshLambertMaterial({ color: 0x8a6a32 }),
    new THREE.MeshLambertMaterial({ color: 0xddc07a }),
  ];
  function seedCap() {
    const a = gfx?.T?.life ?? 1;
    return a >= 0.99 ? 6 : a >= 0.5 ? 4 : 3;
  }
  function grainBudget() {
    const a = gfx?.T?.life ?? 1;
    return a >= 0.99 ? 8 : a >= 0.5 ? 6 : 4;
  }
  function inPond(x, z) {
    if (!pond || !hearth?.group) return false;
    const w = hearth.group.localToWorld(new THREE.Vector3(pond.x, 0, pond.z));
    return Math.hypot(x - w.x, z - w.z) < (pond.r + 0.6);
  }
  function canDropAt(x, z) {
    if (weatherKind() === 'snow' || weatherKind() === 'rain' || weatherKind() === 'storm') return false;
    if (inPond(x, z)) return false;
    if (realm.riverDist && realm.riverDist(x, z, 4) < 1.6) return false;
    return true;
  }
  function makePile(at) {
    const g = new THREE.Group(); g.position.copy(at);
    const n = grainBudget();
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(grainGeo, grainMats[i % grainMats.length]);
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const r = 0.04 + Math.random() * 0.1;
      m.position.set(Math.cos(a) * r, 0.03 + (i % 3) * 0.02, Math.sin(a) * r);
      m.scale.setScalar(0.7 + Math.random() * 0.8);
      m.castShadow = false; g.add(m);
    }
    group.add(g);
    return g;
  }
  function evictOldest() {
    const s = seeds.shift();
    if (!s) return;
    life?.removeSeed(s.id);
    group.remove(s.mesh); s.mesh.traverse(o => { if (o.geometry && o.geometry !== grainGeo) o.geometry.dispose(); });
  }
  function dropSeed(point) {
    const x = point.x, z = point.z, y = point.y ?? realm.heightAt(x, z);
    if (!canDropAt(x, z)) return null;
    // click near landed birds: flush them instead of adding another pile
    if (life?.landedNear(x, z, 3.2)) {
      const n = life.startle(x, z, 5.5);
      return { startled: n, seed: null };
    }
    while (seeds.length >= seedCap()) evictOldest();
    const id = seedSeq++;
    const mesh = makePile(new THREE.Vector3(x, y, z));
    const s = { id, x, y, z, mesh, age: 0, life: 16 + Math.random() * 5 };
    seeds.push(s);
    const fed = life?.feed({ id, x, y, z }) || { assigned: 0 };
    s.assigned = fed.assigned || 0;
    return { startled: 0, seed: s };
  }
  function startleAt(x, z, r) { return life?.startle(x, z, r) || 0; }
  function tickSeeds(dt) {
    for (let i = seeds.length - 1; i >= 0; i--) {
      const s = seeds[i]; s.age += dt;
      const live = life?.seeds.find(x => x.id === s.id);
      const eaten = live && live.pecks > 10;
      const u = Math.max(0, 1 - s.age / s.life);
      if (s.age > s.life - 1.2 || eaten) {
        const fade = eaten ? Math.max(0, 1 - (s.age - (s._eat0 ?? (s._eat0 = s.age))) / 0.8) : Math.max(0, (s.life - s.age) / 1.2);
        s.mesh.scale.setScalar(Math.max(0.01, fade));
        if (fade <= 0.02) { life?.removeSeed(s.id); group.remove(s.mesh); seeds.splice(i, 1); }
      }
    }
  }
  function pointerMove(world, now) {
    if (!world || !inRealm()) { lastPtr = world; lastPtrT = now; return 0; }
    if (lastPtr) {
      const dt = Math.max(0.016, (now - lastPtrT) / 1000);
      const speed = Math.hypot(world.x - lastPtr.x, world.z - lastPtr.z) / dt;
      // a fast swipe near pecking birds flushes them (camera orbit close-up included)
      if (speed > 14 && life?.landedNear(world.x, world.z, 6)) {
        lastPtr = world; lastPtrT = now;
        return life.startle(world.x, world.z, 6);
      }
    }
    lastPtr = world; lastPtrT = now;
    return 0;
  }

  refreshCounts();
  renderHud();

  return {
    group,
    pets,
    petNova,
    projectNova,
    dropSeed,
    startleAt,
    pointerMove,
    canDropAt,
    refreshCounts,
    renderHud,
    tick(t, dt) { tickHearts(dt); tickSeeds(dt); renderHud(); },
    get petting() { return (novaBody.anim?.petT || 0) > 0; },
    get heartCount() { return hearts.length; },
    get seeds() { return seeds; },
    get seedCap() { return seedCap(); },
  };
}

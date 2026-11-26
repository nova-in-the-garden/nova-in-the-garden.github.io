// Interactive play in the Realm: pet Nova (and, later, feed the birds / snowball fight).
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
  scene, camera, renderer, realm, novaBody, novaBrain, lorenz, gfx,
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
      hintEl.textContent = 'Tap Nova to pet her · drag to look around';
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

  refreshCounts();
  renderHud();

  return {
    group,
    pets,
    petNova,
    projectNova,
    refreshCounts,
    renderHud,
    tick(t, dt) { tickHearts(dt); renderHud(); },
    get petting() { return (novaBody.anim?.petT || 0) > 0; },
    get heartCount() { return hearts.length; },
  };
}

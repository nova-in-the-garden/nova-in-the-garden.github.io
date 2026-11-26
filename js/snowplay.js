// Snow day play: throw snowballs (Lorenz throws back), and build a snowman at the Hearth.
import * as THREE from 'three';
import { mesh, mat, canvasTexture } from './util.js';
import { DAY } from './daylight.js';

const GRAV = 18;
const SNOWMAN_LOCAL = { x: -7.0, z: 5.2 };
const STAGES = ['plot', 'base', 'body', 'head', 'nose', 'scarf'];

function flakeTex() {
  return canvasTexture(32, 32, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(w / 2, h / 2, 10, 0, Math.PI * 2); g.fill();
  });
}

export function createSnowPlay({ scene, camera, realm, hearth, lorenz, gfx, inRealm = () => false, weatherKind = () => 'clear' }) {
  const group = new THREE.Group(); group.name = 'snowplay'; hearth.group.add(group);
  group.position.set(SNOWMAN_LOCAL.x, 0, SNOWMAN_LOCAL.z);
  const worldBalls = new THREE.Group(); worldBalls.name = 'snowballs'; scene.add(worldBalls);

  const snow = mat(0xf3f7fb, { roughness: 0.92, flatShading: true });
  const coal = mat(0x1a1a1e, { roughness: 0.7 });
  const carrot = mat(0xe07a2a, { roughness: 0.55 });
  const pickables = [];

  const parts = { plot: null, base: null, body: null, head: null, face: null, nose: null, scarf: null, arms: null };
  // face the yard / typical camera (from +x,+z)
  group.rotation.y = 0.7;
  // a packed-snow pad with a ring of lumps — a "build here" spot, not a melted pancake
  const plot = new THREE.Group(); group.add(plot); parts.plot = plot;
  const pad = mesh(new THREE.CircleGeometry(0.72, 20), mat(0xe4ebf2, { roughness: 0.96, flatShading: true }), 0, 0.02, 0, plot);
  pad.rotation.x = -Math.PI / 2;
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    const lump = mesh(new THREE.SphereGeometry(0.07 + (i % 2) * 0.03, 7, 5), snow, Math.cos(a) * 0.64, 0.045, Math.sin(a) * 0.64, plot);
    lump.scale.set(1.1, 0.5, 1.1);
  }
  parts.base = mesh(new THREE.SphereGeometry(0.72, 14, 12), snow, 0, 0.55, 0, group);
  parts.body = mesh(new THREE.SphereGeometry(0.5, 14, 12), snow, 0, 1.38, 0, group);
  parts.head = mesh(new THREE.SphereGeometry(0.34, 14, 12), snow, 0, 2.04, 0, group);
  const twig = mat(0x5a3a22, { roughness: 0.9, flatShading: true });
  const arms = new THREE.Group(); group.add(arms); parts.arms = arms;
  // body is at (0, 1.38, 0), r=0.5; plant each stick inside that surface and angle it out
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.28, 1.50, 0.05);
    arm.rotation.z = -s * (Math.PI / 2 - 0.22);
    arms.add(arm);
    mesh(new THREE.CylinderGeometry(0.018, 0.032, 0.82, 5), twig, 0, 0.41, 0, arm);
  }
  const face = new THREE.Group(); face.position.set(0, 2.04, 0); group.add(face); parts.face = face;
  mesh(new THREE.SphereGeometry(0.035, 8, 6), coal, -0.11, 0.06, 0.28, face);
  mesh(new THREE.SphereGeometry(0.035, 8, 6), coal, 0.11, 0.06, 0.28, face);
  for (let i = -2; i <= 2; i++) mesh(new THREE.SphereGeometry(0.022, 6, 4), coal, i * 0.05, -0.1, 0.29, face);
  parts.nose = mesh(new THREE.ConeGeometry(0.055, 0.28, 8), carrot, 0, 2.00, 0.42, group);
  parts.nose.rotation.x = Math.PI / 2;
  const scarf = new THREE.Group(); scarf.position.set(0, 1.76, 0); group.add(scarf); parts.scarf = scarf;
  const stripe = canvasTexture(256, 32, (g, w, h) => {
    for (let i = 0; i < 11; i++) { g.fillStyle = i % 2 ? '#e8c15a' : '#c62f37'; g.fillRect(i * w / 11, 0, w / 11 + 1, h); }
  });
  const sm = new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.9, side: THREE.DoubleSide });
  const wrap = mesh(new THREE.TorusGeometry(0.40, 0.085, 6, 18), sm, 0, 0, 0, scarf);
  wrap.rotation.x = Math.PI / 2 + 0.12;
  for (const [sx, rot, zoff] of [[0.22, 0.22, 0.14], [0.34, -0.4, 0.04]]) {
    const end = mesh(new THREE.BoxGeometry(0.13, 0.62, 0.05), sm, sx, -0.32, zoff, scarf);
    end.rotation.z = rot;
  }

  let stage = 0;
  function showStage() {
    const vis = {
      plot: stage === 0, base: stage >= 1, body: stage >= 2, head: stage >= 3,
      face: stage >= 3, arms: stage >= 2, nose: stage >= 4, scarf: stage >= 5,
    };
    for (const [k, v] of Object.entries(vis)) if (parts[k]) parts[k].visible = v;
  }
  showStage();
  group.traverse(o => { if (o.isMesh) { o.userData.snowman = true; pickables.push(o); } });

  function build() {
    if (stage >= 5) return stage;
    stage += 1; showStage();
    return stage;
  }

  // ----- snowballs -----
  const balls = [];
  const bits = [];
  const ballGeo = new THREE.SphereGeometry(0.22, 10, 8);
  const splatGeo = new THREE.CircleGeometry(0.55, 12);
  const bitGeo = new THREE.SphereGeometry(0.05, 6, 4);
  const flake = flakeTex();
  const score = { you: 0, lorenz: 0 };
  let lorenzCooldown = 0, pendingThrow = 0, visitorFlash = 0;
  const _w = new THREE.Vector3(), _l = new THREE.Vector3(), _f = new THREE.Vector3();

  function ballBudget() {
    const a = gfx?.T?.life ?? 1;
    return a >= 0.99 ? 6 : a >= 0.5 ? 4 : 3;
  }

  function spawnBall(from, vel, who) {
    while (balls.length >= ballBudget()) {
      const b = balls.shift(); worldBalls.remove(b.mesh);
    }
    const m = new THREE.Mesh(ballGeo, snow.clone());
    m.position.copy(from); worldBalls.add(m);
    balls.push({ mesh: m, v: vel.clone(), who, t: 0, live: true });
    return balls[balls.length - 1];
  }

  function splat(at, heading = null) {
    const n = gfx?.T?.life >= 0.5 ? 7 : 4;
    const disc = new THREE.Mesh(splatGeo, new THREE.MeshBasicMaterial({ color: 0xf5f8fc, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2; disc.position.copy(at); disc.position.y = realm.heightAt(at.x, at.z) + 0.02;
    worldBalls.add(disc);
    bits.push({ mesh: disc, t: 0, life: 1.4, splat: true });
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(bitGeo, snow);
      m.position.copy(at);
      const a = Math.random() * 6.28;
      worldBalls.add(m);
      bits.push({
        mesh: m, t: 0, life: 0.55 + Math.random() * 0.3,
        v: new THREE.Vector3(Math.cos(a) * (1.5 + Math.random()), 2 + Math.random() * 2, Math.sin(a) * (1.5 + Math.random())),
      });
    }
  }

  function throwAt(target, { who = 'you' } = {}) {
    if (weatherKind() !== 'snow' || !inRealm()) return null;
    const from = who === 'you'
      ? camera.position.clone().addScaledVector(_f.copy(target).sub(camera.position).setY(0).normalize(), 0.7).setY(camera.position.y - 0.25)
      : lorenz.getWorldPosition(_l).add(new THREE.Vector3(0, 0.7, 0));
    const to = target.clone();
    const dx = to.x - from.x, dz = to.z - from.z, dy = to.y - from.y;
    const dist = Math.hypot(dx, dz);
    const T = Math.max(0.55, Math.min(1.35, 0.5 + dist * 0.07));
    const vel = new THREE.Vector3(dx / T, dy / T + 0.5 * GRAV * T, dz / T);
    const ball = spawnBall(from, vel, who);
    if (who === 'you') pendingThrow = 0.7 + Math.random() * 0.7;
    return ball;
  }
  function throwAtLorenz() {
    lorenz.updateMatrixWorld(true);
    const t = lorenz.getWorldPosition(new THREE.Vector3());
    t.y += 0.55;
    return throwAt(t);
  }
  function throwAtGround(x, z) {
    const t = new THREE.Vector3(x, realm.heightAt(x, z), z);
    return throwAt(t);
  }

  const clumps = [];
  function bonkLorenz() {
    lorenz.userData.bonkT = 0.7;
    score.you += 1;
    const c = new THREE.Mesh(bitGeo, mat(0xd8dee6, { roughness: 1, flatShading: true }));
    const s = 0.42; // Lorenz root scale
    c.position.set((Math.random() - 0.5) * 0.55 / s, 1.5 + Math.random() * 0.45, 0.35 + Math.random() * 0.25);
    const s0 = (0.9 + Math.random() * 0.4); c.scale.setScalar(s0); c.userData.s0 = s0;
    lorenz.add(c);
    clumps.push({ mesh: c, t: 0, life: 1.6 });
  }
  function bonkVisitor() {
    score.lorenz += 1;
    visitorFlash = 0.55;
  }

  function tickBits(dt) {
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i]; b.t += dt;
      const k = Math.max(0, 1 - b.t / b.life);
      if (b.splat) {
        b.mesh.material.opacity = k;
        b.mesh.scale.setScalar(1 + (1 - k) * 0.5);
      } else {
        b.v.y -= GRAV * dt; b.mesh.position.addScaledVector(b.v, dt);
        const gy = realm.heightAt(b.mesh.position.x, b.mesh.position.z);
        if (b.mesh.position.y < gy) { b.mesh.position.y = gy; b.v.y *= -0.25; b.v.x *= 0.6; b.v.z *= 0.6; }
        b.mesh.scale.setScalar(Math.max(0.01, k));
      }
      if (k <= 0) { worldBalls.remove(b.mesh); bits.splice(i, 1); }
    }
  }

  function tickBalls(dt) {
    lorenz.updateMatrixWorld(true);
    const L = lorenz.getWorldPosition(_l);
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i]; if (!b.live) continue;
      b.t += dt; b.v.y -= GRAV * dt;
      b.mesh.position.addScaledVector(b.v, dt);
      // don't fill the lens with a ball that just left the camera
      b.mesh.visible = b.who !== 'you' || (b.t > 0.2 && b.mesh.position.distanceTo(camera.position) > 1.5);
      const p = b.mesh.position;
      const gy = realm.heightAt(p.x, p.z);
      let hit = null;
      if (p.y <= gy + 0.08) { p.y = gy + 0.02; hit = 'ground'; }
      if (b.who === 'you' && p.distanceTo(L) < 0.85) hit = 'lorenz';
      if (b.who === 'lorenz' && p.distanceTo(camera.position) < 1.3) hit = 'you';
      if (hit) {
        splat(p);
        if (hit === 'lorenz') bonkLorenz();
        if (hit === 'you') bonkVisitor();
        worldBalls.remove(b.mesh); balls.splice(i, 1);
      } else if (b.t > 3.5) { worldBalls.remove(b.mesh); balls.splice(i, 1); }
    }
  }

  function maybeLorenzThrow(dt) {
    lorenzCooldown = Math.max(0, lorenzCooldown - dt);
    if (DAY.night > 0.6) return;
    if (pendingThrow > 0) {
      pendingThrow -= dt;
      if (pendingThrow <= 0 && lorenzCooldown <= 0 && Math.random() < 0.75) {
        const aim = camera.position.clone();
        aim.y -= 0.3; aim.x += (Math.random() - 0.5) * 1.4; aim.z += (Math.random() - 0.5) * 1.4;
        throwAt(aim, { who: 'lorenz' });
        lorenzCooldown = 2.2;
      }
    }
  }

  const flashEl = (() => {
    let el = document.getElementById('snow-flash');
    if (!el) { el = document.createElement('div'); el.id = 'snow-flash'; document.body.appendChild(el); }
    return el;
  })();

  function tick(t, dt) {
    const on = weatherKind() === 'snow' && inRealm();
    group.visible = on;
    worldBalls.visible = on;
    if (!on) { flashEl.style.opacity = '0'; return; }
    tickBalls(dt); tickBits(dt); maybeLorenzThrow(dt);
    for (let i = clumps.length - 1; i >= 0; i--) {
      const c = clumps[i]; c.t += dt;
      const k = Math.max(0, 1 - c.t / c.life);
      c.mesh.scale.setScalar(Math.max(0.01, c.mesh.userData.s0 * k));
      if (k <= 0) { lorenz.remove(c.mesh); clumps.splice(i, 1); }
    }
    if (visitorFlash > 0) { visitorFlash = Math.max(0, visitorFlash - dt); flashEl.style.opacity = String(Math.min(0.7, visitorFlash * 1.4)); }
    else flashEl.style.opacity = '0';
    const sc = document.getElementById('play-score');
    if (sc) {
      sc.hidden = false;
      sc.textContent = `You ${score.you} — Lorenz ${score.lorenz}`;
    }
  }

  function setActive(v) { group.visible = !!v; }

  return {
    group, pickables, throwAt, throwAtLorenz, throwAtGround, build, tick, setActive, score,
    get stage() { return stage; },
    get stageName() { return STAGES[stage] || 'scarf'; },
    get throwing() { return balls.length; },
    get splatCount() { return bits.length; },
    reset() { stage = 0; showStage(); score.you = score.lorenz = 0; },
    local: SNOWMAN_LOCAL,
  };
}

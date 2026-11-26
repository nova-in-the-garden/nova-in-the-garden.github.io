// Don't Try This at Home: a cartoony propane turkey fryer at the Hearth.
// A frozen turkey in ~350°F oil is a real Thanksgiving hazard: ice flashes
// to steam and expands about 1,700 times, which can boil the oil over,
// start a fireball, and send the turkey flying. This is a cartoon of that,
// plus a thawed turkey that fries calmly. Never try this at home.
import * as THREE from 'three';
import { mat, glow, mesh, canvasTexture, glowSprite } from './util.js';

export const FRYER_POS = { x: 6.4, z: 7.2 };
export const SAFETY_URL = 'https://www.nfpa.org/education-and-research/home-fire-safety/thanksgiving';

const LOWER = 1.55;
const SIZZLE = 0.7;
const LAUNCH_AT = LOWER + SIZZLE + 0.12;
const FLIGHT = 2.2;
const G = 8;                  // gravity, units/s² — a readable arc, not an orbit
const HOOK_Y = 1.40;          // hanging in the pot mouth, so the default view clearly shows it
const OIL_Y = 0.92;           // oil surface in the pot
const RIM_Y = 1.08;
const COOK_DUR = 3.2;

function hud() {
  let el = document.getElementById('fryer-hud');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'fryer-hud';
  el.innerHTML = `
    <h3>Don't Try This at Home</h3>
    <p class="fryer-lead">A frozen turkey is full of ice. Ice hitting oil at about 350°F flashes into steam and expands about 1,700 times. The steam can blast the oil out of the pot; if that oil hits the burner, you get a fireball, and the turkey can go flying. This is a cartoon of a real Thanksgiving hazard.</p>
    <p class="fryer-status" data-k="status">The oil is hot. The hook is ready.</p>
    <div class="fryer-btns">
      <button type="button" class="pill warn" data-a="frozen">Drop a frozen turkey</button>
      <button type="button" class="pill" data-a="thawed">Fry a thawed one</button>
      <button type="button" class="pill" data-a="reset">Reset</button>
    </div>
    <div class="fryer-land">
      <span>If it flies, land</span>
      <label><input type="radio" name="fryer-land" value="roof" checked> on the roof</label>
      <label><input type="radio" name="fryer-land" value="pond"> in the pond</label>
    </div>
    <p class="fryer-hint">Never fry a frozen or wet turkey. <a href="${SAFETY_URL}" target="_blank" rel="noopener noreferrer">NFPA Thanksgiving safety</a> — they recommend skipping oil turkey fryers altogether.</p>
  `;
  document.body.appendChild(el);
  return el;
}

function plaqueTex() {
  return canvasTexture(512, 420, (c, W, H) => {
    c.fillStyle = '#1a1420'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#e8c15a'; c.lineWidth = 10; c.strokeRect(10, 10, W - 20, H - 20);
    c.strokeStyle = '#c8323a'; c.lineWidth = 4; c.strokeRect(22, 22, W - 44, H - 44);
    c.fillStyle = '#c8323a';
    c.font = 'italic 700 36px Georgia, serif';
    c.textAlign = 'center'; c.textBaseline = 'top';
    c.fillText("Don't Try This at Home", W / 2, 40);
    c.fillStyle = '#f4efe6';
    c.font = '26px Georgia, serif';
    const body = 'Ice in a frozen turkey flashes to steam in 350°F oil and expands about 1,700×. The oil can boil over and catch fire. Cartoon only — never do this.';
    const words = body.split(' '), lines = []; let line = '';
    for (const wd of words) {
      const t = line ? line + ' ' + wd : wd;
      if (c.measureText(t).width > W * 0.82) { lines.push(line); line = wd; } else line = t;
    }
    if (line) lines.push(line);
    let y = 100;
    for (const ln of lines) { c.fillText(ln, W / 2, y); y += 36; }
    c.fillStyle = '#e8c15a';
    c.font = 'italic 22px Georgia, serif';
    c.fillText('A propane pot · 350°F oil', W / 2, H - 58);
  });
}

function makeTurkey(kind) {
  const t = new THREE.Group();
  t.userData.kind = kind;
  const frost = kind === 'frozen';
  const skin = frost
    ? mat(0xc5d4e4, { roughness: 0.28, metalness: 0.12, emissive: 0x6a8aaa, emissiveIntensity: 0.28 })
    : mat(0xd4a07a, { roughness: 0.7 });
  const drumC = frost ? 0x9ab8d4 : 0xc48458;
  const body = mesh(new THREE.SphereGeometry(0.24, 10, 8), skin, 0, 0.1, 0, t);
  body.scale.set(1.2, 0.9, 1.0);
  body.userData.part = 'body';
  const head = mesh(new THREE.SphereGeometry(0.11, 8, 6), skin, 0, 0.24, 0.2, t);
  head.userData.part = 'head';
  for (const s of [-1, 1]) {
    const drum = mesh(new THREE.SphereGeometry(0.09, 8, 6), mat(drumC, { roughness: frost ? 0.28 : 0.7 }), s * 0.22, 0.02, -0.16, t);
    drum.scale.set(0.7, 0.7, 1.3);
    drum.userData.part = 'drum';
  }
  // a little hook ring on top, so it can hang
  mesh(new THREE.TorusGeometry(0.05, 0.013, 6, 10), mat(0x8a8e98, { metalness: 0.6, roughness: 0.35 }), 0, 0.34, 0, t).rotation.x = Math.PI / 2;
  if (frost) {
    // ice crystals and a soft frost halo
    for (let i = 0; i < 7; i++) {
      const a = i * 0.95, y = -0.02 + (i % 3) * 0.08;
      const cr = mesh(new THREE.OctahedronGeometry(0.045, 0), glow(0xd8f0ff, 1.2), Math.cos(a) * 0.22, y + 0.12, Math.sin(a) * 0.18, t);
      cr.rotation.set(a, i, a * 0.4);
      cr.userData.part = 'ice';
    }
    const halo = glowSprite(0.45, 0xc8e4f8, 0.28); halo.position.set(0, 0.1, 0); halo.raycast = () => {}; t.add(halo);
    t.userData.halo = halo;
  }
  return t;
}

function paintTurkey(t, look) {
  // look: frozen | raw | golden | sooty
  const skins = {
    frozen: { skin: 0xc5d4e4, drum: 0xa8b8c8, em: 0x6a8aaa, ei: 0.28, rough: 0.28 },
    raw:    { skin: 0xd4a07a, drum: 0xc48458, em: 0x000000, ei: 0, rough: 0.7 },
    golden: { skin: 0xc88840, drum: 0xb56c30, em: 0x3a1a08, ei: 0.15, rough: 0.65 },
    sooty:  { skin: 0x8e6a48, drum: 0x7a5538, em: 0x3a2010, ei: 0.12, rough: 0.8 },
  };
  const L = skins[look] || skins.raw;
  t.traverse(o => {
    if (!o.isMesh || !o.material || !o.material.color) return;
    if (o.userData.part === 'ice') { o.visible = look === 'frozen'; return; }
    if (o.userData.part === 'drum') {
      o.material.color.setHex(L.drum);
    } else if (o.userData.part === 'body' || o.userData.part === 'head') {
      o.material.color.setHex(L.skin);
      if ('emissive' in o.material) { o.material.emissive.setHex(L.em); o.material.emissiveIntensity = L.ei; }
      o.material.roughness = L.rough;
    }
  });
  if (t.userData.halo) t.userData.halo.visible = look === 'frozen';
}

function makeHudBinder(api) {
  const el = hud();
  el.querySelector('[data-a="frozen"]').addEventListener('click', () => api.start('frozen'));
  el.querySelector('[data-a="thawed"]').addEventListener('click', () => api.start('thawed'));
  el.querySelector('[data-a="reset"]').addEventListener('click', () => api.reset());
  el.querySelectorAll('input[name="fryer-land"]').forEach(r => {
    r.addEventListener('change', () => { if (r.checked) api.preferLand(r.value); });
  });
  return el;
}

export function buildFryer(parent, ctx) {
  const g = new THREE.Group();
  g.position.set(FRYER_POS.x, 0, FRYER_POS.z);
  parent.add(g);

  const steel = mat(0x6a7078, { metalness: 0.55, roughness: 0.4 });
  const dark = mat(0x2a2c32, { metalness: 0.4, roughness: 0.55 });
  const rust = mat(0x4a3a32, { roughness: 0.7 });
  const alum = mat(0xb8bec8, { metalness: 0.65, roughness: 0.35 });

  // packed-dirt pad, slightly lifted so it doesn't z-fight the grass
  const pad = mesh(new THREE.CylinderGeometry(1.15, 1.2, 0.06, 16), mat(0x5a5348, { roughness: 1 }), 0, 0.03, 0, g);

  // three-legged burner stand
  const stand = new THREE.Group(); g.add(stand);
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3 + 0.3;
    const leg = mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.55, 6), dark, Math.cos(a) * 0.42, 0.28, Math.sin(a) * 0.42, stand);
    leg.rotation.z = Math.cos(a) * 0.22; leg.rotation.x = -Math.sin(a) * 0.22;
  }
  mesh(new THREE.TorusGeometry(0.32, 0.03, 8, 20), steel, 0, 0.52, 0, stand).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.1, 16), dark, 0, 0.48, 0, stand);   // burner plate
  const burner = mesh(new THREE.TorusGeometry(0.14, 0.025, 6, 16), mat(0x1a1a20, { metalness: 0.5, roughness: 0.4 }), 0, 0.54, 0, stand);
  burner.rotation.x = Math.PI / 2;

  // little propane flames under the pot (always on, this is a hot pot)
  const flames = [];
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI * 2 / 8;
    const f = mesh(new THREE.ConeGeometry(0.04, 0.16, 5), glow(i % 2 ? 0xffc14a : 0xff7a2a, 1.8), Math.cos(a) * 0.12, 0.64, Math.sin(a) * 0.12, stand);
    f.raycast = () => {};
    flames.push(f);
  }
  const flameGlow = glowSprite(1.15, 0xff9a3a, 0.55); flameGlow.position.set(0, 0.7, 0); flameGlow.raycast = () => {}; g.add(flameGlow);

  // the pot
  const pot = new THREE.Group(); pot.position.y = 0.55; g.add(pot);
  mesh(new THREE.CylinderGeometry(0.48, 0.44, 0.08, 20), alum, 0, 0.04, 0, pot);          // base
  mesh(new THREE.CylinderGeometry(0.50, 0.48, 0.58, 20, 1, true), alum, 0, 0.35, 0, pot); // wall (open)
  mesh(new THREE.TorusGeometry(0.50, 0.03, 6, 20), steel, 0, 0.64, 0, pot).rotation.x = Math.PI / 2; // rim
  // inner wall so the pot reads as a vessel from above
  mesh(new THREE.CylinderGeometry(0.46, 0.44, 0.56, 20, 1, true), mat(0x8a9098, { metalness: 0.5, roughness: 0.4, side: THREE.BackSide }), 0, 0.35, 0, pot);
  const oil = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 20), mat(0xc9a024, { roughness: 0.25, metalness: 0.2, emissive: 0x6a4a08, emissiveIntensity: 0.35 }), 0, 0.37, 0, pot);
  const oilFoam = mesh(new THREE.CylinderGeometry(0.46, 0.44, 0.12, 16), mat(0xe8d080, { roughness: 0.4, transparent: true, opacity: 0, emissive: 0xffcc66, emissiveIntensity: 0.4 }), 0, 0.5, 0, pot);
  oilFoam.visible = false;
  // two little handles
  for (const s of [-1, 1]) {
    const h = mesh(new THREE.TorusGeometry(0.08, 0.018, 6, 10, Math.PI), steel, s * 0.52, 0.5, 0, pot);
    h.rotation.z = s * Math.PI / 2; h.rotation.y = Math.PI / 2;
  }

  // propane tank, east of the pot (away from the harvest table)
  const tank = new THREE.Group(); tank.position.set(0.95, 0, -0.15); g.add(tank);
  mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.7, 14), mat(0xd8dce4, { metalness: 0.4, roughness: 0.45 }), 0, 0.42, 0, tank);
  mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 14), mat(0x2a2c32, { metalness: 0.5, roughness: 0.4 }), 0, 0.08, 0, tank);
  mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), steel, 0, 0.82, 0, tank);
  mesh(new THREE.BoxGeometry(0.08, 0.05, 0.04), rust, 0.06, 0.86, 0, tank);
  // hose to the burner
  const hose = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.85, 6), mat(0x1a1a20), -0.4, 0.28, 0.05, tank);
  hose.rotation.z = Math.PI / 2.4;

  // hoist: a post north of the pot with an arm and a hook
  const hoist = new THREE.Group(); hoist.position.set(0, 0, -0.55); g.add(hoist);
  mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.35, 8), dark, 0, 1.18, 0, hoist);
  const arm = mesh(new THREE.BoxGeometry(0.07, 0.07, 0.7), steel, 0, 2.32, 0.32, hoist);
  const cable = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.9, 5), mat(0x2a2a30), 0, 1.85, 0.62, hoist);
  const hook = mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 10, Math.PI * 1.4), steel, 0, 1.38, 0.62, hoist);
  hook.rotation.x = Math.PI / 2; hook.rotation.z = 0.4;

  // warning plaque, east of the tank, facing the open southeast yard (and the default camera)
  const sign = new THREE.Group(); sign.position.set(-0.7, 0, 1.15); sign.rotation.y = 0.55; g.add(sign);
  mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 8), rust, 0, 0.45, 0, sign);
  const ptex = plaqueTex();
  const pmat = new THREE.MeshBasicMaterial({ map: ptex, side: THREE.DoubleSide }); pmat.userData.keepGlow = true;
  mesh(new THREE.PlaneGeometry(1.05, 0.86), pmat, 0, 1.32, 0.03, sign);
  mesh(new THREE.BoxGeometry(1.11, 0.92, 0.05), mat(0x1a1420), 0, 1.32, 0, sign);

  // particle pools
  const oilMat = mat(0xc9a024, { roughness: 0.3, emissive: 0x8a6a10, emissiveIntensity: 0.45 });
  const drops = [];
  for (let i = 0; i < 48; i++) {
    const d = mesh(new THREE.SphereGeometry(0.05, 6, 5), oilMat, 0, 0, 0, g);
    d.visible = false; d.raycast = () => {};
    drops.push({ m: d, vx: 0, vy: 0, vz: 0, life: 0, age: 0 });
  }
  const steams = [];
  for (let i = 0; i < 18; i++) {
    const s = glowSprite(0.5, 0xe8eef6, 0); s.position.set(0, 0, 0); s.visible = false; s.raycast = () => {}; g.add(s);
    steams.push({ m: s, vx: 0, vy: 0, vz: 0, life: 0, age: 0, scale: 0.5 });
  }
  const smokes = [];
  for (let i = 0; i < 14; i++) {
    const s = glowSprite(0.6, 0x6a6a72, 0); s.position.set(0, 0, 0); s.visible = false; s.raycast = () => {};
    // smoke is attached later to the flying turkey or the land point; start hidden on g
    g.add(s);
    smokes.push({ m: s, vx: 0, vy: 0, vz: 0, life: 0, age: 0, scale: 0.6 });
  }

  // fireball column: stacked additive sprites + a few glow cones, plus a point light
  const fireG = new THREE.Group(); fireG.position.set(0, RIM_Y, 0); fireG.visible = false; g.add(fireG);
  const fireSprites = [];
  for (let i = 0; i < 6; i++) {
    const s = glowSprite(1.2 + i * 0.35, i % 2 ? 0xffe08a : 0xff6a20, 0.85);
    s.position.set((i % 2 ? 0.05 : -0.04), 0.3 + i * 0.45, (i % 3 ? 0.03 : -0.02));
    s.raycast = () => {}; fireG.add(s); fireSprites.push(s);
  }
  const fireCore = mesh(new THREE.SphereGeometry(0.38, 8, 6), glow(0xffc14a, 2.2), 0, 0.55, 0, fireG);
  fireCore.raycast = () => {}; fireCore.scale.set(1, 1.6, 1);
  const fireLight = new THREE.PointLight(0xff9a3a, 0, 9, 2); fireLight.position.set(0, 1.0, 0); fireG.add(fireLight);

  // boil-over puddle around the stand (appears after erupt)
  const puddle = mesh(new THREE.CircleGeometry(0.2, 16), mat(0xa07818, { roughness: 0.35, transparent: true, opacity: 0.0, emissive: 0x5a3a08, emissiveIntensity: 0.3 }), 0, 0.045, 0, g);
  puddle.rotation.x = -Math.PI / 2; puddle.visible = false; puddle.raycast = () => {};
  const puddleFlames = [];
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI * 2 / 6 + 0.2;
    const f = mesh(new THREE.ConeGeometry(0.05, 0.18, 5), glow(0xff8a2a, 1.6), Math.cos(a) * 0.55, 0.14, Math.sin(a) * 0.55, g);
    f.visible = false; f.raycast = () => {};
    puddleFlames.push(f);
  }

  // splash rings for a pond landing (parented to hearth, placed later)
  const splash = new THREE.Group(); splash.visible = false; parent.add(splash);
  const ringMat = mat(0xb8d0e8, { roughness: 0.25, transparent: true, opacity: 0.5, emissive: 0x4a70a0, emissiveIntensity: 0.2 });
  const rings = [0.25, 0.4, 0.55].map((r, i) => {
    const m = mesh(new THREE.TorusGeometry(r, 0.03, 5, 18), ringMat, 0, 0.06 + i * 0.01, 0, splash);
    m.rotation.x = Math.PI / 2; m.raycast = () => {};
    return m;
  });

  // two turkeys: one frozen (default on the hook), one thawed (hidden until that run)
  const frozen = makeTurkey('frozen'); frozen.position.set(0, HOOK_Y, 0.07); g.add(frozen);
  const thawed = makeTurkey('thawed'); thawed.visible = false; thawed.position.set(0, HOOK_Y, 0.07); g.add(thawed);
  paintTurkey(thawed, 'raw');

  // puddle-side landing smoke lives in hearth space so a roof/pond turkey can trail
  const landSmokeAt = new THREE.Vector3();

  const st = {
    phase: 'idle',      // idle | lowering | sizzle | erupt | flight | landed | frying | cooked
    kind: 'frozen',
    land: 'roof',
    prefer: 'roof',
    age: 0,
    launch: null,       // { x0,y0,z0, vx,vy,vz, t0 }
    landPt: new THREE.Vector3(),
    fireAge: -1,
    puddle: 0,
    cooked: 0,
  };
  let status = 'The oil is hot. The hook is ready.';

  const setStatus = (msg) => {
    status = msg;
    const el = document.getElementById('fryer-hud');
    const n = el?.querySelector('[data-k="status"]');
    if (n) n.textContent = msg;
  };

  const bird = () => (st.kind === 'thawed' ? thawed : frozen);
  const other = () => (st.kind === 'thawed' ? frozen : thawed);

  const placeOnHook = (y) => {
    const b = bird();
    b.visible = true;
    b.position.set(0, y, 0.07);
    b.rotation.set(0, 0, 0);
    other().visible = false;
  };

  const cableTo = (turkeyY) => {
    // cable runs from the arm (y 2.32) down to the hook ring (turkeyY + 0.28)
    const top = 2.32, bot = turkeyY + 0.34;
    const len = Math.max(0.08, top - bot);
    cable.position.set(0, top - len / 2, 0.62);
    cable.scale.set(1, len / 0.9, 1);
    hook.position.set(0, bot, 0.62);
  };

  const spawnDrop = (x, y, z, vx, vy, vz, life = 1.4) => {
    const d = drops.find(p => p.life <= 0);
    if (!d) return;
    d.m.visible = true; d.m.position.set(x, y, z); d.m.scale.setScalar(0.7 + Math.random() * 0.7);
    d.vx = vx; d.vy = vy; d.vz = vz; d.life = life; d.age = 0;
  };
  const spawnSteam = (x, y, z, vy = 0.6, life = 1.1, scale = 0.55) => {
    const d = steams.find(p => p.life <= 0);
    if (!d) return;
    d.m.visible = true; d.m.position.set(x, y, z); d.m.material.opacity = 0.55;
    d.vx = (Math.random() - 0.5) * 0.15; d.vy = vy; d.vz = (Math.random() - 0.5) * 0.15;
    d.life = life; d.age = 0; d.scale = scale; d.m.scale.setScalar(scale);
  };
  const spawnSmoke = (x, y, z, life = 1.6) => {
    const d = smokes.find(p => p.life <= 0);
    if (!d) return;
    // smoke is in fryer-local space; for a landed turkey we pass fryer-local coords
    d.m.visible = true; d.m.position.set(x, y, z); d.m.material.opacity = 0.5; d.m.material.color.setHex(0x6a6a72);
    d.vx = (Math.random() - 0.5) * 0.12; d.vy = 0.35 + Math.random() * 0.2; d.vz = (Math.random() - 0.5) * 0.12;
    d.life = life; d.age = 0; d.scale = 0.45 + Math.random() * 0.25; d.m.scale.setScalar(d.scale);
  };

  const landPoint = (where) => {
    parent.updateMatrixWorld(true);
    if (where === 'pond') {
      const p = ctx.pond || { x: -3.2, z: 2.6 };
      return new THREE.Vector3(p.x + 0.45, 0.16, p.z + 0.25);
    }
    const c = ctx.cottage?.group;
    if (!c) return new THREE.Vector3(-5.1, 5.3, -4.7);
    parent.updateMatrixWorld(true);
    c.updateMatrixWorld(true);
    // right-hand slope, near the front gable, a little down from the ridge
    // so it reads from the yard and isn't balanced on the gold cap
    const w = c.localToWorld(new THREE.Vector3(0.52, 3.26, 0.95));
    return parent.worldToLocal(w);
  };

  const fryerWorld = (lx, ly, lz, out = new THREE.Vector3()) => {
    g.updateMatrixWorld(true);
    return g.localToWorld(out.set(lx, ly, lz));
  };

  const toLocal = (hearthPt, out = new THREE.Vector3()) => {
    g.updateMatrixWorld(true);
    return g.worldToLocal(out.copy(hearthPt));
  };

  const beginLaunch = () => {
    const b = bird();
    const p0 = new THREE.Vector3();
    b.getWorldPosition(p0);
    parent.updateMatrixWorld(true);
    const start = parent.worldToLocal(p0.clone());
    st.landPt.copy(landPoint(st.land));
    const dest = st.landPt;
    const T = FLIGHT;
    const vx = (dest.x - start.x) / T;
    const vz = (dest.z - start.z) / T;
    const vy = (dest.y - start.y + 0.5 * G * T * T) / T;
    st.launch = { x0: start.x, y0: start.y, z0: start.z, vx, vy, vz, t0: st.age };
    // reparent the turkey to the hearth so the arc is in hearth space
    parent.add(b);
    b.position.copy(start);
  };

  const eruptBurst = () => {
    for (let i = 0; i < 36; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.2 + Math.random() * 2.4;
      spawnDrop((Math.random() - 0.5) * 0.2, RIM_Y + 0.05, (Math.random() - 0.5) * 0.2,
        Math.cos(a) * sp, 2.2 + Math.random() * 3.2, Math.sin(a) * sp, 1.1 + Math.random() * 0.7);
    }
    for (let i = 0; i < 10; i++) spawnSteam((Math.random() - 0.5) * 0.3, RIM_Y, (Math.random() - 0.5) * 0.3, 1.4 + Math.random(), 1.2, 0.7);
    fireG.visible = true; st.fireAge = 0;
    oilFoam.visible = true; oilFoam.material.opacity = 0.9; oilFoam.position.y = 0.62; oilFoam.scale.set(1.05, 1.6, 1.05);
    puddle.visible = true; st.puddle = 0.01;
    puddleFlames.forEach(f => { f.visible = true; });
  };

  const resetVisuals = () => {
    drops.forEach(d => { d.life = 0; d.m.visible = false; d.m.position.set(0, 0, 0); });
    steams.forEach(d => { d.life = 0; d.m.visible = false; d.m.material.opacity = 0; });
    smokes.forEach(d => { d.life = 0; d.m.visible = false; d.m.material.opacity = 0; });
    fireG.visible = false; st.fireAge = -1; fireLight.intensity = 0;
    oilFoam.visible = false; oilFoam.material.opacity = 0; oilFoam.scale.set(1, 1, 1); oilFoam.position.y = 0.5;
    oil.scale.set(1, 1, 1); oil.position.y = 0.37;
    puddle.visible = false; puddle.scale.setScalar(1); puddle.material.opacity = 0;
    puddleFlames.forEach(f => { f.visible = false; });
    splash.visible = false;
    // put both turkeys back on the hook group, hidden as needed
    if (frozen.parent !== g) g.add(frozen);
    if (thawed.parent !== g) g.add(thawed);
    frozen.visible = true; thawed.visible = false;
    paintTurkey(frozen, 'frozen');
    paintTurkey(thawed, 'raw');
    frozen.position.set(0, HOOK_Y, 0.07); frozen.rotation.set(0, 0, 0); frozen.scale.setScalar(1);
    thawed.position.set(0, HOOK_Y, 0.07); thawed.rotation.set(0, 0, 0); thawed.scale.setScalar(1);
    cableTo(HOOK_Y);
    st.phase = 'idle'; st.kind = 'frozen'; st.age = 0; st.launch = null; st.cooked = 0;
    setStatus('The oil is hot. The hook is ready.');
  };

  const start = (kind = 'frozen', opts = {}) => {
    if (st.phase !== 'idle' && st.phase !== 'cooked' && st.phase !== 'landed') {
      // already mid-run: restart cleanly first
      resetVisuals();
    }
    if (st.phase === 'cooked' || st.phase === 'landed') resetVisuals();
    st.kind = kind === 'thawed' ? 'thawed' : 'frozen';
    st.land = opts.land || st.prefer || 'roof';
    st.prefer = st.land;
    st.age = 0;
    st.phase = 'lowering';
    st.landPt.copy(landPoint(st.land));
    if (st.kind === 'thawed') {
      frozen.visible = false; thawed.visible = true;
      paintTurkey(thawed, 'raw');
      placeOnHook(HOOK_Y);
      setStatus('Lowering a thawed turkey. Slowly does it.');
    } else {
      thawed.visible = false; frozen.visible = true;
      paintTurkey(frozen, 'frozen');
      placeOnHook(HOOK_Y);
      setStatus('Lowering a frozen turkey. This is a bad idea.');
    }
    const el = document.getElementById('fryer-hud');
    el?.querySelectorAll('input[name="fryer-land"]').forEach(r => { r.checked = r.value === st.land; });
  };

  const reset = () => { resetVisuals(); };

  const preferLand = (v) => { st.prefer = v === 'pond' ? 'pond' : 'roof'; };

  // jump the sim to a named moment (for tests and screenshots)
  const snap = (phase, opts = {}) => {
    const kind = opts.kind || 'frozen';
    const land = opts.land || st.prefer || 'roof';
    resetVisuals();
    if (phase === 'idle' || !phase) return;
    start(kind, { land });
    const targets = {
      lowering: LOWER * 0.55,
      sizzle: LOWER + SIZZLE * 0.5,
      erupt: LAUNCH_AT + 0.07,
      air: LAUNCH_AT + FLIGHT * 0.48,
      landed: LAUNCH_AT + FLIGHT + 0.4,
      frying: LOWER + 1.2,
      cooked: LOWER + COOK_DUR + 0.2,
    };
    const tEnd = targets[phase];
    if (tEnd == null) return;
    advance(tEnd);
  };

  const advance = (seconds, step = 1 / 60) => {
    let left = Math.max(0, seconds);
    const t0 = performance.now() / 1000;
    while (left > 1e-6) {
      const dt = Math.min(step, left);
      tick(t0 + (seconds - left), dt);
      left -= dt;
    }
  };

  let accSteam = 0, accSmoke = 0;

  function tick(t, dt) {
    if (!dt || dt < 0) return;
    if (dt > 0.08) dt = 0.08;          // keep the sim steady if a tab hitch happens
    // idle flames always flicker
    flames.forEach((f, i) => {
      const s = 0.85 + 0.25 * Math.sin(t * 14 + i * 1.7) + 0.1 * Math.sin(t * 27 + i);
      f.scale.set(s, 0.8 + 0.5 * s, s);
    });
    flameGlow.material.opacity = 0.4 + 0.2 * (0.5 + 0.5 * Math.sin(t * 11));
    oil.position.y = 0.37 + (st.phase === 'erupt' ? 0.08 : 0.012 * Math.sin(t * 3.2));

    if (st.phase !== 'idle') st.age += dt;

    const b = bird();

    if (st.phase === 'lowering') {
      const u = Math.min(1, st.age / LOWER);
      const ease = u * u * (3 - 2 * u);
      const y = HOOK_Y + (OIL_Y + 0.12 - HOOK_Y) * ease;
      placeOnHook(y);
      cableTo(y);
      if (u >= 1) {
        if (st.kind === 'thawed') {
          st.phase = 'frying';
          setStatus('Frying calmly. The turkey was thawed, so the oil stays in the pot.');
        } else {
          st.phase = 'sizzle';
          setStatus('The ice is hitting the oil…');
        }
      }
    } else if (st.phase === 'sizzle') {
      placeOnHook(OIL_Y + 0.1);
      cableTo(OIL_Y + 0.1);
      accSteam += dt;
      if (accSteam > 0.08) { accSteam = 0; spawnSteam((Math.random() - 0.5) * 0.2, RIM_Y, (Math.random() - 0.5) * 0.2, 0.7, 0.8, 0.4); }
      if (st.age >= LAUNCH_AT) {
        st.phase = 'erupt';
        eruptBurst();
        beginLaunch();
        cableTo(HOOK_Y);               // hook swings empty
        hook.position.set(0, 1.38, 0.62);
        cable.position.set(0, 1.85, 0.62); cable.scale.set(1, 1, 1);
        setStatus('Steam burst! The oil is boiling over.');
      }
    } else if (st.phase === 'frying') {
      placeOnHook(OIL_Y + 0.1);
      cableTo(OIL_Y + 0.1);
      accSteam += dt;
      if (accSteam > 0.16) { accSteam = 0; spawnSteam((Math.random() - 0.5) * 0.15, RIM_Y, (Math.random() - 0.5) * 0.15, 0.45, 0.9, 0.35); }
      const u = Math.min(1, (st.age - LOWER) / COOK_DUR);
      // lerp raw → golden
      const skin = new THREE.Color(0xd4a07a).lerp(new THREE.Color(0xc88840), u);
      const drum = new THREE.Color(0xc48458).lerp(new THREE.Color(0xb56c30), u);
      b.traverse(o => {
        if (o.userData.part === 'body' || o.userData.part === 'head') o.material?.color?.copy(skin);
        if (o.userData.part === 'drum') o.material?.color?.copy(drum);
      });
      if (u >= 1) {
        st.phase = 'cooked';
        paintTurkey(b, 'golden');
        setStatus('Golden, and still in the pot. Thawed was the right call.');
      }
    } else if (st.phase === 'erupt' || st.phase === 'flight') {
      const tau = st.age - (st.launch?.t0 ?? LAUNCH_AT);
      if (tau >= 0 && st.launch) {
        const x = st.launch.x0 + st.launch.vx * tau;
        const y = st.launch.y0 + st.launch.vy * tau - 0.5 * G * tau * tau;
        const z = st.launch.z0 + st.launch.vz * tau;
        if (b.parent !== parent) parent.add(b);
        b.position.set(x, y, z);
        b.rotation.x += 5.2 * dt;
        b.rotation.z += 3.1 * dt;
        b.rotation.y += 1.4 * dt;
        if (tau > 0.15) { paintTurkey(b, 'sooty'); b.scale.setScalar(1.35); }
        st.phase = 'flight';
        if (tau >= FLIGHT) {
          st.phase = 'landed';
          b.position.copy(st.landPt);
          b.rotation.set(1.15, 0.4, 0.6);   // flopped on its side, still a whole cartoon bird
          paintTurkey(b, 'sooty');
          landSmokeAt.copy(st.landPt);
          if (st.land === 'pond') {
            splash.position.set(st.landPt.x, 0, st.landPt.z);
            splash.visible = true;
            rings.forEach((m, i) => { m.scale.setScalar(0.4); m.material.opacity = 0.55; });
            setStatus('It landed in the pond, a bit sooty, and still smoking.');
          } else {
            setStatus('It landed on the cottage roof, a bit sooty, and still smoking.');
          }
        } else if (tau > 0.25 && st.phase === 'flight') {
          setStatus('There it goes — a ballistic turkey.');
        }
      }
    } else if (st.phase === 'landed') {
      if (st.land === 'pond') {
        b.position.y = st.landPt.y + Math.sin(t * 2.4) * 0.04;
        rings.forEach((m, i) => {
          const s = 0.6 + (st.age - (st.launch?.t0 ?? 0) - FLIGHT) * (0.5 + i * 0.15);
          m.scale.setScalar(Math.min(2.4, s));
          m.material.opacity = Math.max(0, 0.5 - s * 0.18);
        });
      }
      accSmoke += dt;
      if (accSmoke > 0.18) {
        accSmoke = 0;
        // smoke in fryer-local, from the landed turkey
        const lp = toLocal(b.parent === parent ? b.position : parent.localToWorld(b.position.clone()));
        // if turkey is already in hearth space, b.position is hearth-local
        const fx = b.parent === g ? b.position.x : (b.position.x - FRYER_POS.x);
        const fy = b.parent === g ? b.position.y : b.position.y;
        const fz = b.parent === g ? b.position.z : (b.position.z - FRYER_POS.z);
        spawnSmoke(fx, fy + 0.2, fz, 1.8);
      }
    } else if (st.phase === 'cooked') {
      accSteam += dt;
      if (accSteam > 0.28) { accSteam = 0; spawnSteam((Math.random() - 0.5) * 0.12, RIM_Y, (Math.random() - 0.5) * 0.12, 0.35, 0.8, 0.3); }
    }

    // fireball animation
    if (st.fireAge >= 0) {
      st.fireAge += dt;
      const u = st.fireAge;
      const peak = 0.35;
      const inten = u < peak ? u / peak : Math.max(0, 1 - (u - peak) / 1.15);
      fireLight.intensity = 9 * inten;
      fireG.scale.set(1 + 0.35 * inten, 0.7 + 1.8 * inten, 1 + 0.35 * inten);
      fireSprites.forEach((s, i) => { s.material.opacity = 0.9 * inten; s.position.y = 0.25 + i * 0.45 * (0.7 + inten); });
      fireCore.material.emissiveIntensity = 1.2 + 2.2 * inten;
      fireCore.scale.set(0.7 + inten, 0.6 + 1.4 * inten, 0.7 + inten);
      if (u > 1.6) { fireG.visible = false; fireLight.intensity = 0; st.fireAge = -1; }
    }

    // oil foam settles after the burst
    if (oilFoam.visible) {
      oilFoam.material.opacity = Math.max(0, oilFoam.material.opacity - dt * 0.35);
      oilFoam.position.y = Math.max(0.42, oilFoam.position.y - dt * 0.15);
      if (oilFoam.material.opacity <= 0.02) oilFoam.visible = false;
    }

    // puddle grows, then sits there until reset (with little flames)
    if (puddle.visible) {
      st.puddle = Math.min(1, st.puddle + dt * 1.4);
      puddle.scale.setScalar(1 + st.puddle * 3.2);
      puddle.material.opacity = 0.85 * Math.min(1, st.puddle * 2);
      puddleFlames.forEach((f, i) => {
        const s = 0.7 + 0.4 * Math.sin(t * 13 + i);
        f.scale.set(s, 0.7 + 0.6 * s, s);
        f.position.y = 0.12 + 0.04 * s;
      });
    }

    // integrate particles (fryer-local)
    const stepPart = (arr, gravity, fade, grow) => {
      for (const d of arr) {
        if (d.life <= 0) { if (d.m.visible) d.m.visible = false; continue; }
        d.age += dt; d.life -= dt;
        d.vy -= gravity * dt;
        d.m.position.x += d.vx * dt; d.m.position.y += d.vy * dt; d.m.position.z += d.vz * dt;
        if (d.m.position.y < 0.06 && gravity > 0) { d.m.position.y = 0.06; d.vy *= -0.15; d.vx *= 0.5; d.vz *= 0.5; }
        const k = Math.max(0, d.life / (d.life + d.age));
        if (d.m.material && 'opacity' in d.m.material) d.m.material.opacity = fade * Math.min(1, d.life * 2) * (0.4 + 0.6 * k);
        if (grow) d.m.scale.setScalar(d.scale * (1 + d.age * grow));
        if (d.life <= 0) d.m.visible = false;
      }
    };
    stepPart(drops, 14, 1, 0);
    stepPart(steams, -0.05, 0.55, 0.8);
    stepPart(smokes, -0.08, 0.5, 0.9);
  }

  makeHudBinder({ start, reset, preferLand });

  g.traverse(o => { if (o.isMesh) o.userData.fryer = true; });

  const viewPoint = () => ({
    from: new THREE.Vector3(FRYER_POS.x + 3.9, 2.55, FRYER_POS.z + 3.35),
    at: new THREE.Vector3(FRYER_POS.x - 0.15, 1.4, FRYER_POS.z + 0.1),
  });
  // a wider side view that can see the fryer, a mid-arc turkey, and the house
  const flightView = () => {
    const dest = (st.landPt && st.landPt.lengthSq() > 0) ? st.landPt.clone() : landPoint(st.land || st.prefer);
    const mid = new THREE.Vector3(
      FRYER_POS.x * 0.5 + dest.x * 0.5,
      7.0,
      FRYER_POS.z * 0.5 + dest.z * 0.5
    );
    return { from: new THREE.Vector3(mid.x + 5.0, mid.y - 0.8, mid.z + 8.8), at: mid };
  };
  const landView = () => {
    const at = (st.landPt && st.landPt.lengthSq() > 0) ? st.landPt.clone() : landPoint(st.land || st.prefer);
    if ((st.land || st.prefer) === 'pond') {
      return { from: new THREE.Vector3(at.x + 2.4, 2.3, at.z + 2.8), at: new THREE.Vector3(at.x, 0.5, at.z) };
    }
    return { from: new THREE.Vector3(at.x + 3.8, at.y + 1.6, at.z + 4.2), at: new THREE.Vector3(at.x, at.y + 0.1, at.z) };
  };

  const turkeyState = () => {
    const b = bird();
    b.updateMatrixWorld(true);
    parent.updateMatrixWorld(true);
    const p = parent.worldToLocal(b.getWorldPosition(new THREE.Vector3()));
    return { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), phase: st.phase, kind: st.kind, land: st.land, visible: b.visible };
  };

  resetVisuals();

  const api = {
    group: g,
    tick,
    start,
    reset,
    snap,
    advance,
    preferLand,
    viewPoint,
    flightView,
    landView,
    setActive(on) { document.body.classList.toggle('at-fryer', !!on); },
    get active() { return document.body.classList.contains('at-fryer'); },
    get phase() { return st.phase; },
    get kind() { return st.kind; },
    get land() { return st.land; },
    get status() { return status; },
    get turkey() { return turkeyState(); },
    safetyUrl: SAFETY_URL,
    pos: FRYER_POS,
  };
  return api;
}

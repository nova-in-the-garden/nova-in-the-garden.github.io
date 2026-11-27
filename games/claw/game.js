// HONEST CLAW: a physics-only merchandiser for Nova's Arcade.
// The grip strength is constant. Prizes slip or stay based on contact, friction,
// shape and center of mass — there is no payout bank and no weak-claw mode.
//
// Arcade contract (games/README.md): create(host), preview(ctx,w,h,t), plus fill /
// hold / pointer / resize for a 3D canvas.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export const meta = { id: 'claw', title: 'Honest Claw', mode: '3d' };

const STEP = 1 / 120;
const MAX_SUB = 4;
const GRIP = 10;              // constant motor torque. Never reduced after pickup.
const CLOSE_SPEED = -2.8;     // rad/s; negative closes (tips inward, past vertical)
const OPEN_SPEED = 3.0;
const MOVE_SPEED = 0.42;      // m/s of the carriage
const DROP_SPEED = 0.5;       // cable pay-out
const LIFT_SPEED = 0.18;
const CABLE_MIN = 0.16;
const HOOK_MIN = 0.155;       // hook stays above the felt so fingertips clear the floor
const CABLE_MAX = 0.625;      // RAIL_Y - HOOK_MIN
const CABLE_TRAVEL = 0.22;    // length while moving over the chute
const BIN = 0.78;             // inner width/depth
const WALL_H = 0.7;
const FLOOR_Y = 0;
const RAIL_Y = 0.78;
const CHUTE = { x: -0.26, z: 0.26, s: 0.17 }; // hole in the near-left corner
const BETSON = 'https://www.betson.com/wp-content/uploads/wpallimport/files/service-manuals/grab-n-win-42-merchandiser-crane-ice-service-manual.pdf';
const SHELF_KEY = 'nova.arcade.claw.shelf';

const TYPES = [
  { id: 'fox',     name: 'Mini Nova',    emoji: '🦊', mass: 0.085, friction: 0.55 },
  { id: 'lorenz',  name: 'Mini Lorenz',  emoji: '🐥', mass: 0.07,  friction: 0.5  },
  { id: 'turkey',  name: 'Turkey',       emoji: '🦃', mass: 0.15,  friction: 0.62 },
  { id: 'glider',  name: 'Glider',       emoji: '✈️', mass: 0.035, friction: 0.4  },
  { id: 'snowman', name: 'Snowman',      emoji: '⛄', mass: 0.11,  friction: 0.58 },
  { id: 'acorn',   name: 'Acorn',        emoji: '🌰', mass: 0.09,  friction: 0.7  },
  { id: 'heart',   name: 'Heart plush',  emoji: '💗', mass: 0.055, friction: 0.52 },
  { id: 'star',    name: 'Star plush',   emoji: '⭐', mass: 0.045, friction: 0.48 },
];

const G_WALL = 1, G_PRIZE = 2, G_CLAW = 4, G_PRONG = 8, G_SENSOR = 16;

function loadShelf() {
  try { return JSON.parse(localStorage.getItem(SHELF_KEY) || '[]').filter(e => e && e.id); } catch { return []; }
}
function saveShelf(list) {
  try { localStorage.setItem(SHELF_KEY, JSON.stringify(list.slice(-24))); } catch { /* private mode */ }
}

function makeMat(color, { rough = 0.7, metal = 0.1, flat = true, emissive = 0, em = 0, trans = false, opac = 1 } = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: rough, metalness: metal, flatShading: flat,
    emissive, emissiveIntensity: em, transparent: trans, opacity: opac,
  });
}

// ---------------------------------------------------------------- prize meshes + shapes
function stripeTex() {
  const c = document.createElement('canvas'); c.width = 8; c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = '#c8323a'; g.fillRect(0, 0, 8, 16);
  g.fillStyle = '#e8c15a'; g.fillRect(0, 6, 8, 5);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  return tex;
}
function addEyes(group, y, z, spread, size, { amber = false } = {}) {
  const iris = amber
    ? makeMat(0xe08a1e, { rough: 0.25, emissive: 0xb85e10, em: 0.85, flat: false })
    : makeMat(0x0b0b10, { rough: 0.15, flat: false });
  const pupil = makeMat(0x120804, { rough: 0.2, flat: false });
  const hi = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const s of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(s * spread, y, z); group.add(e);
    e.add(new THREE.Mesh(new THREE.SphereGeometry(size, 8, 6), iris));
    if (amber) {
      const pb = new THREE.Mesh(new THREE.SphereGeometry(size * 0.48, 6, 5), pupil);
      pb.position.z = size * 0.55; e.add(pb);
    }
    const h = new THREE.Mesh(new THREE.SphereGeometry(size * 0.22, 5, 4), hi);
    h.position.set(size * 0.28, size * 0.28, size * 0.82); e.add(h);
  }
}
function addScarf(group, y, z, r, tube) {
  const mat = new THREE.MeshStandardMaterial({
    map: stripeTex(), roughness: 0.9, metalness: 0, flatShading: true, side: THREE.DoubleSide,
  });
  const wrap = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 16), mat);
  wrap.position.set(0, y, z); wrap.rotation.x = Math.PI / 2; wrap.scale.z = 0.72; group.add(wrap);
  const end = new THREE.Mesh(new THREE.BoxGeometry(tube * 1.6, tube * 5.5, tube * 1.2), mat);
  end.position.set(r * 0.55, y - tube * 2.4, z + r * 0.35); group.add(end);
}

function addPrizeVisual(type, group) {
  // Visual-only details. Physics shapes stay in prizeShapes() so grab feel is unchanged.
  if (type === 'fox') {
    // Mini Nova: midnight-blue fur, amber eyes, gold forehead + freckles, striped scarf, glowing tail tip.
    const fur = makeMat(0x1b2452, { rough: 0.85, emissive: 0x0a1238, em: 0.45 });
    const cream = makeMat(0xe9d2a6, { rough: 0.8, emissive: 0x3a2a10, em: 0.25 });
    const gold = makeMat(0xe8c15a, { rough: 0.45, emissive: 0x7a4a08, em: 0.55 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), fur);
    body.scale.set(1, 0.85, 1.25); group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), fur);
    head.position.set(0, 0.028, 0.04); group.add(head);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), cream);
    chest.position.set(0, -0.004, 0.03); chest.scale.set(1, 0.8, 0.7); group.add(chest);
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), makeMat(0x2a3670, { rough: 0.8 }));
    muzzle.position.set(0, 0.02, 0.068); muzzle.scale.set(1.1, 0.7, 0.8); group.add(muzzle);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 5), makeMat(0x07070c, { rough: 0.3 }));
    nose.position.set(0, 0.02, 0.08); group.add(nose);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.028, 6), fur);
      ear.position.set(s * 0.018, 0.052, 0.032); group.add(ear);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.016, 6), cream);
      inner.position.set(s * 0.018, 0.048, 0.036); group.add(inner);
    }
    // Rule-90-ish gold triangle on the forehead
    const mark = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.016, 3), gold);
    mark.position.set(0, 0.042, 0.06); mark.rotation.x = -0.9; group.add(mark);
    for (const [x, y, z] of [[-0.012, 0.028, 0.066], [0.012, 0.028, 0.066], [0.0, 0.022, 0.07], [-0.008, 0.034, 0.064], [0.008, 0.034, 0.064]]) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.0024, 5, 4), gold);
      f.position.set(x, y, z); group.add(f);
    }
    addEyes(group, 0.034, 0.066, 0.012, 0.006, { amber: true });
    addScarf(group, 0.012, 0.04, 0.022, 0.006);
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), fur);
    tail.position.set(0, 0.01, -0.06); tail.scale.set(0.7, 0.7, 1.6); group.add(tail);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 6), makeMat(0xfff0c4, { rough: 0.5, emissive: 0xffc04a, em: 1.4, flat: false }));
    tip.position.set(0, 0.01, -0.082); group.add(tip);
  } else if (type === 'lorenz') {
    // Mini Lorenz: yellow duck, peach bill, orange feet, red-and-gold scarf.
    const down = makeMat(0xffea6e, { rough: 0.8, emissive: 0x6a5200, em: 0.35 });
    const light = makeMat(0xfff4a0, { rough: 0.8, emissive: 0x6a5200, em: 0.25 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), down);
    body.scale.set(1, 0.95, 1.15); group.add(body);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), light);
    belly.position.set(0, -0.006, 0.02); group.add(belly);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), makeMat(0xfff4a0, { rough: 0.8, emissive: 0x6a5200, em: 0.3 }));
    head.position.set(0, 0.03, 0.032); group.add(head);
    const bill = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), makeMat(0xf6a88a, { rough: 0.55 }));
    bill.scale.set(1.0, 0.55, 1.15); bill.position.set(0, 0.024, 0.058); group.add(bill);
    addEyes(group, 0.04, 0.054, 0.012, 0.0055);
    addScarf(group, 0.014, 0.03, 0.024, 0.007);
    for (const s of [-1, 1]) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.006, 0.022), makeMat(0xf39233, { rough: 0.6 }));
      foot.position.set(s * 0.018, -0.04, 0.012); group.add(foot);
    }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.022, 6), light);
    tail.rotation.x = -1.1; tail.position.set(0, 0.012, -0.05); group.add(tail);
  } else if (type === 'turkey') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), makeMat(0x7a4a22, { rough: 0.8 }));
    body.scale.set(1.05, 0.9, 1.15); group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), makeMat(0x3a2a18, { rough: 0.7 }));
    head.position.set(0, 0.04, 0.04); group.add(head);
    const wattle = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 5), makeMat(0xc8323a, { rough: 0.6 }));
    wattle.position.set(0, 0.024, 0.055); wattle.scale.set(0.7, 1.3, 0.7); group.add(wattle);
    const snood = new THREE.Mesh(new THREE.SphereGeometry(0.005, 5, 4), makeMat(0xc8323a));
    snood.position.set(0, 0.05, 0.054); group.add(snood);
    addEyes(group, 0.046, 0.054, 0.008, 0.004);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.016, 5), makeMat(0xf08a2a, { rough: 0.5 }));
    beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.036, 0.06); group.add(beak);
    // tail fan
    const cols = [0xb8651e, 0xc45c22, 0xd4a017, 0x7a3a12, 0xa33b1a];
    for (let i = 0; i < 7; i++) {
      const a = (i - 3) * 0.28;
      const feather = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.07, 0.004), makeMat(cols[i % cols.length], { rough: 0.7 }));
      feather.position.set(Math.sin(a) * 0.03, 0.03 + Math.cos(a) * 0.01, -0.055);
      feather.rotation.set(-0.9, 0, a); group.add(feather);
    }
  } else if (type === 'glider') {
    const mat = makeMat(0x7adf7a, { rough: 0.55 });
    const edge = makeMat(0x3e8f4a, { rough: 0.5 });
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.04), mat);
    group.add(wing);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.09), mat);
    nose.position.z = 0.01; group.add(nose);
    const cabin = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), makeMat(0x1a3a4a, { rough: 0.4, trans: true, opac: 0.85, flat: false }));
    cabin.position.set(0, 0.01, 0.02); group.add(cabin);
    const tailfin = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.028, 0.018), edge);
    tailfin.position.set(0, 0.016, -0.028); group.add(tailfin);
  } else if (type === 'snowman') {
    const snow = makeMat(0xf4f7ff, { rough: 0.85 });
    const a = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), snow);
    a.position.y = -0.01; group.add(a);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), snow);
    b.position.y = 0.046; group.add(b);
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), snow);
    c.position.y = 0.09; group.add(c);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.02, 6), makeMat(0xf08a2a, { rough: 0.55 }));
    nose.rotation.x = Math.PI / 2; nose.position.set(0, 0.088, 0.028); group.add(nose);
    addEyes(group, 0.094, 0.018, 0.008, 0.004);
    addScarf(group, 0.068, 0, 0.02, 0.006);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.006, 12), makeMat(0x1a1520, { rough: 0.7 }));
    brim.position.y = 0.108; group.add(brim);
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.024, 10), makeMat(0x1a1520, { rough: 0.7 }));
    hat.position.y = 0.122; group.add(hat);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.003, 6, 12), makeMat(0xe8c15a, { rough: 0.5, metal: 0.3 }));
    band.position.y = 0.112; band.rotation.x = Math.PI / 2; group.add(band);
  } else if (type === 'acorn') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), makeMat(0x5a3a16, { rough: 0.85 }));
    cap.position.y = 0.01; group.add(cap);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 6, 12), makeMat(0x4a2e10, { rough: 0.8 }));
    rim.position.y = 0.01; rim.rotation.x = Math.PI / 2; group.add(rim);
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), makeMat(0xb8742a, { rough: 0.7 }));
    nut.scale.set(1, 1.15, 1); nut.position.y = -0.01; group.add(nut);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.016, 6), makeMat(0x3a2a14, { rough: 0.8 }));
    stem.position.y = 0.03; stem.rotation.z = 0.35; group.add(stem);
  } else if (type === 'heart') {
    const mat = makeMat(0xd41c3e, { rough: 0.55, emissive: 0x5a0810, em: 0.25 });
    for (const s of [-1, 1]) {
      const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), mat);
      lobe.position.set(s * 0.018, 0.012, 0); group.add(lobe);
    }
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.05, 8), mat);
    tip.rotation.x = Math.PI; tip.position.y = -0.022; group.add(tip);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 5), makeMat(0xffc0c8, { rough: 0.3, trans: true, opac: 0.7, flat: false }));
    shine.position.set(-0.016, 0.022, 0.018); group.add(shine);
  } else if (type === 'star') {
    // Chubby 5-point star lying in XZ so it still reads as a star when the
    // flat physics pancake rests on the felt.
    const mat = makeMat(0xffd76a, { rough: 0.4, metal: 0.25, emissive: 0xffb830, em: 0.4 });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), mat);
    group.add(core);
    const dir = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5 + Math.PI / 10;
      const arm = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.05, 5), mat);
      dir.set(Math.cos(a), 0, Math.sin(a));
      arm.position.copy(dir).multiplyScalar(0.024);
      arm.quaternion.setFromUnitVectors(up, dir);
      group.add(arm);
    }
  }
}

function prizeShapes(type) {
  // cannon shapes + local offsets. Offsets should keep COM interesting (fox tail, snowman base).
  if (type === 'fox') return [
    { sh: new CANNON.Sphere(0.045), o: new CANNON.Vec3(0, 0, 0.005) },
    { sh: new CANNON.Sphere(0.03), o: new CANNON.Vec3(0, 0.025, 0.04) },
    { sh: new CANNON.Sphere(0.016), o: new CANNON.Vec3(0, 0.01, -0.06) },
  ];
  if (type === 'lorenz') return [
    { sh: new CANNON.Sphere(0.042), o: new CANNON.Vec3(0, 0, 0) },
    { sh: new CANNON.Sphere(0.028), o: new CANNON.Vec3(0, 0.03, 0.03) },
  ];
  if (type === 'turkey') return [
    { sh: new CANNON.Sphere(0.05), o: new CANNON.Vec3(0, 0, 0.01) },
    { sh: new CANNON.Box(new CANNON.Vec3(0.05, 0.03, 0.012)), o: new CANNON.Vec3(0, 0.02, -0.055) },
  ];
  if (type === 'glider') return [
    { sh: new CANNON.Box(new CANNON.Vec3(0.06, 0.008, 0.022)), o: new CANNON.Vec3(0, 0, 0) },
    { sh: new CANNON.Box(new CANNON.Vec3(0.02, 0.008, 0.045)), o: new CANNON.Vec3(0, 0, 0.01) },
  ];
  if (type === 'snowman') return [
    { sh: new CANNON.Sphere(0.042), o: new CANNON.Vec3(0, -0.01, 0) },
    { sh: new CANNON.Sphere(0.03), o: new CANNON.Vec3(0, 0.046, 0) },
    { sh: new CANNON.Sphere(0.022), o: new CANNON.Vec3(0, 0.09, 0) },
  ];
  if (type === 'acorn') return [
    { sh: new CANNON.Sphere(0.03), o: new CANNON.Vec3(0, -0.005, 0) },
  ];
  if (type === 'heart') return [
    { sh: new CANNON.Sphere(0.028), o: new CANNON.Vec3(-0.018, 0.012, 0) },
    { sh: new CANNON.Sphere(0.028), o: new CANNON.Vec3(0.018, 0.012, 0) },
    { sh: new CANNON.Sphere(0.024), o: new CANNON.Vec3(0, -0.02, 0) },
  ];
  // star: flat-ish so it is awkward to pinch
  return [
    { sh: new CANNON.Cylinder(0.04, 0.04, 0.02, 8), o: new CANNON.Vec3(0, 0, 0) },
  ];
}

export function create(host) {
  const self = { fill: true };
  let canvas, renderer, scene, camera, world, raf = 0, paused = false, acc = 0, last = 0;
  let onScore = () => {};
  let state = 'settle', stateT = 0, plays = 0, wins = 0;
  let held = { left: 0, right: 0, up: 0, down: 0 };
  let drag = null, stick = null;
  let cable = CABLE_TRAVEL, carriage, clawHead, prongs = [], cableEq, prizes = [], shelf = loadShelf();
  let hud, statusEl, shelfEl, cardEl, stickKnob;
  let lights = {};
  const aim = new THREE.Vector3(0, RAIL_Y, 0);
  const tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3();

  // materials
  const wallMat = new CANNON.Material('wall');
  const clawMat = new CANNON.Material('claw');
  const prizeMats = {};
  TYPES.forEach(t => { prizeMats[t.id] = new CANNON.Material('p-' + t.id); });

  function syncMesh(mesh, body) {
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
  }

  function quality() {
    const T = window.nova?.gfx?.T;
    return { dpr: T?.dpr || 1.5, shadows: !!(T && T.shadow), tier: window.nova?.gfx?.tier || 'medium' };
  }

  function setupRenderer() {
    const Q = quality();
    renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.tier !== 'low', alpha: false, powerPreference: 'high-performance' });
    renderer.setClearColor(0x0a0e18, 1);
    renderer.shadowMap.enabled = Q.shadows;
    if (Q.shadows) renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  function setupWorld() {
    world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.allowSleep = true;
    world.solver.iterations = 20;
    world.defaultContactMaterial.friction = 0.4;
    world.defaultContactMaterial.restitution = 0.02;
    const addCM = (a, b, friction, restitution = 0.02) => {
      world.addContactMaterial(new CANNON.ContactMaterial(a, b, { friction, restitution, contactEquationStiffness: 1e7, frictionEquationStiffness: 1e7 }));
    };
    TYPES.forEach(t => {
      addCM(clawMat, prizeMats[t.id], Math.min(1.6, t.friction + 0.7));
      addCM(wallMat, prizeMats[t.id], t.friction * 0.7);
      TYPES.forEach(u => addCM(prizeMats[t.id], prizeMats[u.id], 0.45));
    });
    addCM(clawMat, wallMat, 0.2);
  }

  function boxBody(sx, sy, sz, x, y, z, { mass = 0, mat = wallMat, group = G_WALL, mask = G_PRIZE | G_CLAW | G_PRONG } = {}) {
    const b = new CANNON.Body({ mass, material: mat, type: mass ? CANNON.Body.DYNAMIC : CANNON.Body.STATIC });
    b.addShape(new CANNON.Box(new CANNON.Vec3(sx, sy, sz)));
    b.position.set(x, y, z);
    b.collisionFilterGroup = group; b.collisionFilterMask = mask;
    world.addBody(b); return b;
  }

  function setupScene() {
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a0e18, 2.4, 5.5);
    camera = new THREE.PerspectiveCamera(42, 1, 0.05, 12);
    placeCamera('overview');

    scene.add(new THREE.AmbientLight(0x8890b0, 0.55));
    const hemi = new THREE.HemisphereLight(0xc8d4ff, 0x3a2a18, 0.45); scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff0d0, 1.05);
    key.position.set(0.6, 1.8, 1.1); key.castShadow = quality().shadows;
    if (key.castShadow) { key.shadow.mapSize.set(1024, 1024); key.shadow.camera.near = 0.2; key.shadow.camera.far = 5; key.shadow.camera.left = -1.2; key.shadow.camera.right = 1.2; key.shadow.camera.top = 1.2; key.shadow.camera.bottom = -1.2; }
    scene.add(key); lights.key = key;
    const lamp = new THREE.PointLight(0xffd76a, 0.7, 2.5);
    lamp.position.set(0, 0.95, 0); scene.add(lamp);

    // booth around the glass
    const wood = makeMat(0x5b3b25, { rough: 0.9 });
    const gold = makeMat(0xe8c15a, { rough: 0.4, metal: 0.45, emissive: 0x7a4a08, em: 0.2 });
    const dark = makeMat(0x1a1520, { rough: 0.8 });
    const glass = makeMat(0x9fd4e8, { rough: 0.05, metal: 0.1, trans: true, opac: 0.18, flat: false });

    const hw = BIN / 2 + 0.05, hh = WALL_H / 2 + 0.04;
    // pedestal
    const ped = new THREE.Mesh(new THREE.BoxGeometry(BIN + 0.28, 0.16, BIN + 0.28), wood);
    ped.position.set(0, -0.11, 0); ped.castShadow = ped.receiveShadow = true; scene.add(ped);
    // back + side walls (visual, thicker wood)
    const back = new THREE.Mesh(new THREE.BoxGeometry(BIN + 0.16, WALL_H + 0.12, 0.05), wood);
    back.position.set(0, hh, -BIN / 2 - 0.05); back.castShadow = true; scene.add(back);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.05, WALL_H + 0.12, BIN + 0.16), wood);
      side.position.set(s * (BIN / 2 + 0.05), hh, 0); side.castShadow = true; scene.add(side);
    }
    // glass front (visual only) and corner posts so the cabinet reads as a box
    const front = new THREE.Mesh(new THREE.BoxGeometry(BIN + 0.08, WALL_H + 0.04, 0.012), glass);
    front.position.set(0, hh, BIN / 2 + 0.03); scene.add(front);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, WALL_H + 0.16, 0.04), gold);
      post.position.set(s * (BIN / 2 + 0.04), hh + 0.02, BIN / 2 + 0.03); scene.add(post);
    }
    // gold frame
    const frame = new THREE.Mesh(new THREE.BoxGeometry(BIN + 0.18, 0.04, 0.04), gold);
    frame.position.set(0, WALL_H + 0.1, BIN / 2 + 0.02); scene.add(frame);
    const marquee = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.06), gold);
    marquee.position.set(0, WALL_H + 0.2, BIN / 2 + 0.04); scene.add(marquee);
    // sign text as a canvas texture
    const c = document.createElement('canvas'); c.width = 512; c.height = 96;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#3a1c10'; ctx.fillRect(0, 0, 512, 96);
    ctx.fillStyle = '#ffe08a'; ctx.font = 'bold 48px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('HONEST CLAW', 256, 50);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.09), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) }));
    sign.position.set(0, WALL_H + 0.2, BIN / 2 + 0.072); scene.add(sign);

    // felt floor (raised above the pedestal so it actually shows)
    const floor = new THREE.Mesh(new THREE.BoxGeometry(BIN - 0.01, 0.02, BIN - 0.01), makeMat(0x1d3a4a, { rough: 0.9 }));
    floor.position.set(0, 0.01, 0); floor.receiveShadow = true; scene.add(floor);
    // chute: a dark well with a gold frame (not a solid gold plate)
    const well = new THREE.Mesh(new THREE.BoxGeometry(CHUTE.s, 0.04, CHUTE.s), makeMat(0x07080e));
    well.position.set(CHUTE.x, 0.0, CHUTE.z); scene.add(well);
    const rimW = 0.012, rimH = 0.016, s = CHUTE.s;
    for (const [dx, dz, sx, sz] of [
      [0, (s + rimW) / 2, s / 2 + rimW, rimW / 2],
      [0, -(s + rimW) / 2, s / 2 + rimW, rimW / 2],
      [(s + rimW) / 2, 0, rimW / 2, s / 2],
      [-(s + rimW) / 2, 0, rimW / 2, s / 2],
    ]) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(sx * 2, rimH, sz * 2), gold);
      rim.position.set(CHUTE.x + dx, 0.018, CHUTE.z + dz); scene.add(rim);
    }
    // cut the lip with… just a darker inner already. Fine.
    const tray = new THREE.Mesh(new THREE.BoxGeometry(CHUTE.s + 0.05, 0.12, CHUTE.s + 0.05), dark);
    tray.position.set(CHUTE.x, -0.1, CHUTE.z); scene.add(tray);

    // rails above
    for (const z of [-BIN / 2 + 0.04, BIN / 2 - 0.04]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(BIN - 0.04, 0.016, 0.016), gold);
      rail.position.set(0, RAIL_Y + 0.02, z); scene.add(rail);
    }

    // --- physics walls / floor with a hole ---
    const T = 0.04, inn = BIN / 2;
    // floor as four slabs around the chute; top of each slab is y = 0.02 (matches the felt)
    const fy = 0, fh = 0.02;
    const hs = CHUTE.s / 2, cx = CHUTE.x, cz = CHUTE.z;
    const overlap = 0.015;
    const zBack = (-inn + (cz - hs + overlap)) / 2, dBack = (cz - hs + overlap) - (-inn);
    if (dBack > 0.02) boxBody(inn, fh, dBack / 2, 0, fy, zBack);
    const zFront = ((cz + hs - overlap) + inn) / 2, dFront = inn - (cz + hs - overlap);
    if (dFront > 0.02) boxBody(inn, fh, dFront / 2, 0, fy, zFront);
    const xLeft = (-inn + (cx - hs + overlap)) / 2, wLeft = (cx - hs + overlap) - (-inn);
    if (wLeft > 0.02) boxBody(wLeft / 2, fh, hs + overlap, xLeft, fy, cz);
    const xRight = ((cx + hs - overlap) + inn) / 2, wRight = inn - (cx + hs - overlap);
    if (wRight > 0.02) boxBody(wRight / 2, fh, hs + overlap, xRight, fy, cz);

    // walls
    boxBody(inn + T, WALL_H / 2, T / 2, 0, WALL_H / 2, -inn - T / 2); // back
    boxBody(T / 2, WALL_H / 2, inn + T, -inn - T / 2, WALL_H / 2, 0); // left
    boxBody(T / 2, WALL_H / 2, inn + T, inn + T / 2, WALL_H / 2, 0); // right
    boxBody(inn + T, WALL_H / 2, T / 2, 0, WALL_H / 2, inn + T / 2); // front (inside the glass)

    // chute catcher (below the hole) + sensor
    boxBody(hs + 0.03, 0.01, hs + 0.03, cx, -0.18, cz); // bottom
    boxBody(0.01, 0.08, hs + 0.03, cx - hs - 0.02, -0.1, cz);
    boxBody(0.01, 0.08, hs + 0.03, cx + hs + 0.02, -0.1, cz);
    boxBody(hs + 0.03, 0.08, 0.01, cx, -0.1, cz - hs - 0.02);
    boxBody(hs + 0.03, 0.08, 0.01, cx, -0.1, cz + hs + 0.02);

    const sensor = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, collisionResponse: false });
    sensor.addShape(new CANNON.Box(new CANNON.Vec3(hs * 0.9, 0.06, hs * 0.9)));
    sensor.position.set(cx, -0.08, cz);
    sensor.collisionFilterGroup = G_SENSOR; sensor.collisionFilterMask = G_PRIZE;
    sensor.isSensor = true;
    world.addBody(sensor);
    self._sensor = sensor;
  }

  function setupClaw() {
    // kinematic carriage on the rails
    carriage = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
    carriage.position.set(0.08, RAIL_Y, -0.05);
    world.addBody(carriage);
    aim.copy(carriage.position);

    const carMesh = new THREE.Group(); scene.add(carMesh);
    const house = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.08), makeMat(0xc8323a, { metal: 0.3, rough: 0.4 }));
    carMesh.add(house);
    self._carMesh = carMesh;

    // claw head hangs from the carriage like a pendulum: kinematic, so it can sway
    // when the carriage moves but it never somersaults. Prongs stay dynamic on hinges.
    clawHead = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: clawMat });
    clawHead.addShape(new CANNON.Sphere(0.028), new CANNON.Vec3(0, -0.03, 0));
    clawHead.position.set(carriage.position.x, RAIL_Y - CABLE_TRAVEL, carriage.position.z);
    clawHead.collisionFilterGroup = G_CLAW; clawHead.collisionFilterMask = G_WALL; // kinematic head must not plow the pile
    world.addBody(clawHead);
    cableEq = null; // hang is integrated in stepHang()
    cable = CABLE_TRAVEL;
    self._hang = { x: clawHead.position.x, z: clawHead.position.z, vx: 0, vz: 0 };

    const headMesh = new THREE.Group(); scene.add(headMesh);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), makeMat(0xe8c15a, { metal: 0.6, rough: 0.3 }));
    bulb.position.y = -0.03; headMesh.add(bulb);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 8, 12), makeMat(0xd4a84b, { metal: 0.7, rough: 0.3 }));
    ring.position.y = -0.005; headMesh.add(ring);
    headMesh.traverse(o => { if (o.isMesh) { o.renderOrder = 3; o.material.depthWrite = true; } });
    self._headMesh = headMesh;
    // cable visual
    const cableGeo = new THREE.BufferGeometry();
    const cableMat = new THREE.LineBasicMaterial({ color: 0xc0c4d0 });
    const cableLine = new THREE.Line(cableGeo, cableMat); scene.add(cableLine);
    self._cableLine = cableLine;

    // three hinged prongs with a fingertip curl
    prongs = [];
    const prongMat = makeMat(0xd0d5e0, { metal: 0.7, rough: 0.35, flat: false });
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3 + Math.PI / 6;
      // cannon-es qY(a) sends local +X to (cos a, 0, -sin a) and +Z to (sin a, 0, cos a).
      // hinge axisA and the "outward" radial must match that convention or prongs flip over the head.
      const radial = new CANNON.Vec3(Math.cos(a), 0, -Math.sin(a));
      const axis = new CANNON.Vec3(Math.sin(a), 0, Math.cos(a));
      // Fingers are scaled to the plushies (~4–5 cm radius): long enough to wrap
      // under a prize, short enough that the tips stay above the felt.
      const pivotA = new CANNON.Vec3(radial.x * 0.018, -0.035, radial.z * 0.018);

      const body = new CANNON.Body({ mass: 0.025, material: clawMat, linearDamping: 0.28, angularDamping: 0.75 });
      // long finger along local -Y; local +X is radially outward; curl at the tip goes inward (-X)
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.007, 0.046, 0.008)), new CANNON.Vec3(0, -0.046, 0));
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.022, 0.009, 0.01)), new CANNON.Vec3(-0.024, -0.098, 0));
      // small upward lip so a scooped prize has a basket to sit in
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.006, 0.012, 0.009)), new CANNON.Vec3(-0.042, -0.086, 0));
      const open = 0.55; // radians from vertical, tip outward
      const pos = new CANNON.Vec3().copy(clawHead.position).vadd(pivotA);
      body.position.copy(pos);
      // qY(a) then qZ(open): tip at (0,-L,0) swings toward +X (outward)
      const qY = new CANNON.Quaternion(); qY.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), a);
      const qOpen = new CANNON.Quaternion(); qOpen.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), open);
      body.quaternion.copy(qY).mult(qOpen, body.quaternion);
      body.collisionFilterGroup = G_PRONG; body.collisionFilterMask = G_PRIZE | G_WALL;
      world.addBody(body);

      const hinge = new CANNON.HingeConstraint(clawHead, body, {
        pivotA, pivotB: new CANNON.Vec3(0, 0, 0),
        axisA: axis, axisB: new CANNON.Vec3(0, 0, 1),
        maxForce: 1e6,
      });
      hinge.enableMotor();
      hinge.setMotorMaxForce(GRIP);
      hinge.setMotorSpeed(0);
      world.addConstraint(hinge);

      const mesh = new THREE.Group(); scene.add(mesh);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.012, 0.092, 8), prongMat);
      arm.position.y = -0.046; arm.castShadow = true; arm.renderOrder = 3; mesh.add(arm);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.018, 0.022), prongMat);
      tip.position.set(-0.024, -0.098, 0); tip.castShadow = true; tip.renderOrder = 3; mesh.add(tip);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.024, 0.02), prongMat);
      lip.position.set(-0.042, -0.086, 0); lip.castShadow = true; lip.renderOrder = 3; mesh.add(lip);
      mesh.renderOrder = 3;

      prongs.push({ body, hinge, mesh, axis, radial, a, pivotA });
    }
  }

  function spawnPrize(type, x, y, z, settle = true) {
    const def = TYPES.find(t => t.id === type) || TYPES[0];
    const body = new CANNON.Body({
      mass: def.mass, material: prizeMats[def.id],
      linearDamping: 0.12, angularDamping: 0.12, allowSleep: true, sleepSpeedLimit: 0.12,
    });
    for (const { sh, o } of prizeShapes(type)) body.addShape(sh, o);
    body.position.set(x, y, z);
    if (type === 'star' || type === 'glider' || type === 'heart') {
      body.quaternion.setFromEuler(0, Math.random() * Math.PI, 0);
    } else {
      body.quaternion.setFromEuler(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.5);
    }
    body.collisionFilterGroup = G_PRIZE; body.collisionFilterMask = G_PRIZE | G_WALL | G_CLAW | G_PRONG | G_SENSOR;
    body.prizeType = type; body.won = false;
    world.addBody(body);
    const mesh = new THREE.Group();
    addPrizeVisual(type, mesh);
    mesh.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.renderOrder = 0;
      // Push prize surfaces slightly back so a wing can't paint over the claw.
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => { if (m) { m.polygonOffset = true; m.polygonOffsetFactor = 1; m.polygonOffsetUnits = 2; } });
    });
    scene.add(mesh);
    const p = { type, def, body, mesh };
    prizes.push(p);
    return p;
  }

  function fillBin() {
    // one of each type — 8 prizes, 8 types — a snug but not packed pile
    const spots = [
      [0.10, 0.18, -0.02, 'fox'], [-0.10, 0.18, -0.14, 'lorenz'], [0.16, 0.20, -0.16, 'turkey'],
      [-0.16, 0.16, 0.06, 'glider'], [0.02, 0.22, -0.18, 'snowman'], [0.16, 0.16, 0.10, 'acorn'],
      [-0.04, 0.18, 0.12, 'heart'], [0.08, 0.18, 0.16, 'star'],
    ];
    for (const [x, y, z, t] of spots) spawnPrize(t, x, y, z);
  }

  function placeCamera(kind) {
    if (!camera) return;
    const claw = clawHead ? clawHead.position : { x: 0, y: 0.4, z: 0 };
    if (kind === 'grip') {
      // Stay in front of the glass so the shot never ends up inside a wall.
      camera.position.set(0.12, 0.58, 0.92);
      camera.lookAt(claw.x, Math.max(0.06, claw.y - 0.02), claw.z);
    } else if (kind === 'chute') {
      camera.position.set(CHUTE.x + 0.22, 0.42, CHUTE.z + 0.55);
      camera.lookAt(CHUTE.x, 0.03, CHUTE.z);
    } else {
      camera.position.set(0.0, 0.78, 1.42);
      camera.lookAt(0, 0.18, 0.02);
    }
  }

  function buildHud() {
    hud = document.createElement('div'); hud.className = 'claw-hud';
    hud.innerHTML = `
      <div class="label">Honest: <strong>constant grip</strong></div>
      <button class="info-btn" type="button" aria-label="About this claw">i</button>
      <div class="card">
        <p>This claw never weakens its grip. Whether a prize stays or slips is only physics: contact, friction, shape and center of mass.</p>
        <p>Real arcade machines often use a weaker “retaining” strength after the pickup, and some keep the claw weak until a prize is “due” in a virtual payout bank. Here is an <a href="${BETSON}" target="_blank" rel="noopener">operator manual</a> that describes that auto-percentaging.</p>
        <p>Free play. No coins, no rigging.</p>
      </div>
      <div class="status"></div>
      <div class="shelf" aria-label="Prizes you have won"></div>
      <button class="drop-btn" type="button">DROP</button>
      <div class="stick" aria-label="Move claw"><i></i></div>`;
    canvas.parentElement.appendChild(hud);
    statusEl = hud.querySelector('.status');
    shelfEl = hud.querySelector('.shelf');
    cardEl = hud.querySelector('.card');
    stickKnob = hud.querySelector('.stick i');
    hud.querySelector('.info-btn').addEventListener('pointerdown', e => { e.stopPropagation(); cardEl.classList.toggle('open'); });
    hud.querySelector('.drop-btn').addEventListener('pointerdown', e => { e.stopPropagation(); drop(); });
    const st = hud.querySelector('.stick');
    st.addEventListener('pointerdown', e => {
      e.stopPropagation(); e.preventDefault();
      const r = st.getBoundingClientRect();
      stick = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2, r: r.width / 2 };
      try { st.setPointerCapture(e.pointerId); } catch { }
      moveStick(e);
    });
    st.addEventListener('pointermove', e => { if (stick && e.pointerId === stick.id) moveStick(e); });
    const endStick = e => {
      if (!stick || e.pointerId !== stick.id) return;
      stick = null; held.left = held.right = held.up = held.down = 0;
      if (stickKnob) stickKnob.style.transform = '';
    };
    st.addEventListener('pointerup', endStick); st.addEventListener('pointercancel', endStick);
    renderShelf();
  }

  function moveStick(e) {
    const dx = e.clientX - stick.cx, dy = e.clientY - stick.cy;
    const m = Math.hypot(dx, dy) || 1, k = Math.min(1, m / (stick.r * 0.7));
    const nx = dx / m * k, ny = dy / m * k;
    if (stickKnob) stickKnob.style.transform = `translate(${nx * 28}px,${ny * 28}px)`;
    // screen up is -z in the cabinet (into the bin)
    held.right = Math.max(0, nx); held.left = Math.max(0, -nx);
    held.down = Math.max(0, ny); held.up = Math.max(0, -ny);
  }

  function renderShelf() {
    const last = shelf.slice(-8);
    shelfEl.innerHTML = last.length
      ? last.map(e => `<span class="won" title="${e.name}">${e.emoji || '🎁'}</span>`).join('')
      : '';
  }

  function setStatus(s) { if (statusEl) statusEl.textContent = s; }

  function canMove() { return state === 'ready'; }

  function drop() {
    if (state !== 'ready') return;
    state = 'drop'; stateT = 0; plays += 1;
    host.sfx?.('tick');
    setStatus('Dropping…');
    prongs.forEach(p => p.body.wakeUp());
    clawHead.wakeUp();
    prizes.forEach(p => { if (!p.body.won) p.body.wakeUp(); });
  }

  function prongAngle(p) {
    // Signed angle from vertical: + outward (open), − inward (curled under).
    const down = new CANNON.Vec3();
    p.body.vectorToWorldFrame(new CANNON.Vec3(0, -1, 0), down);
    const out = p.radial;
    return Math.atan2(down.x * out.x + down.z * out.z, -down.y);
  }
  // Commanded angle. The motor always uses the same max force (GRIP) and only
  // chases this target — that is the constant honest grip.
  let gripTarget = 0.55;
  const GRIP_OPEN = 0.62;
  const GRIP_CLOSED = 0.16; // slightly open: inward curls make a basket, not a scissor
  function setGrip(mode) {
    if (mode === 'open') gripTarget = GRIP_OPEN;
    else if (mode === 'close') gripTarget = GRIP_CLOSED;
    // 'hold' keeps the current target
  }
  function poseProng(p, ang) {
    const qY = new CANNON.Quaternion(); qY.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), p.a);
    const qA = new CANNON.Quaternion(); qA.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), ang);
    const qLocal = new CANNON.Quaternion(); qY.mult(qA, qLocal);
    const qWorld = new CANNON.Quaternion();
    clawHead.quaternion.mult(qLocal, qWorld);
    const pivot = new CANNON.Vec3();
    clawHead.pointToWorldFrame(p.pivotA, pivot);
    p.body.position.copy(pivot);
    p.body.quaternion.copy(qWorld);
    p.body.velocity.set(0, 0, 0);
    p.body.angularVelocity.set(0, 0, 0);
  }
  function driveProngs() {
    // cannon-es motor: axisB·ω_prong = −targetVelocity, and +ω around local Z opens.
    // So targetVelocity = −ω_desired.
    for (const p of prongs) {
      p.hinge.setMotorMaxForce(GRIP);
      let ang = prongAngle(p);
      if (Math.abs(ang) > 1.2) { poseProng(p, gripTarget); ang = gripTarget; }
      const err = gripTarget - ang;
      const omega = Math.max(-4, Math.min(4, err * 10));
      p.hinge.setMotorSpeed(-omega);
    }
  }
  function clampAim() {
    const lim = BIN / 2 - 0.13;
    aim.x = Math.max(-lim, Math.min(lim, aim.x));
    aim.z = Math.max(-lim, Math.min(lim, aim.z));
  }
  function attachProngs() {
    // Re-seat a prong only if it has slipped off the kinematic hook. Rewriting
    // the pose every frame was wiping closing spin and breaking contacts.
    for (const p of prongs) {
      let ang = prongAngle(p);
      if (!Number.isFinite(ang) || Math.abs(ang) > 1.2) {
        poseProng(p, gripTarget);
        p.body.velocity.copy(clawHead.velocity);
        continue;
      }
      const pivot = new CANNON.Vec3();
      clawHead.pointToWorldFrame(p.pivotA, pivot);
      if (p.body.position.distanceTo(pivot) < 0.01) continue;
      const av = p.body.angularVelocity.clone();
      poseProng(p, Math.max(-0.45, Math.min(0.75, ang)));
      p.body.velocity.copy(clawHead.velocity);
      p.body.angularVelocity.copy(av);
    }
  }
  function containPrizes() {
    for (const p of prizes) {
      if (p.body.won) continue;
      const { x, y, z } = p.body.position;
      if (Math.abs(x) > 0.7 || Math.abs(z) > 0.7 || y < -0.6 || y > 1.4) {
        p.body.velocity.set(0, 0, 0); p.body.angularVelocity.set(0, 0, 0);
        p.body.position.set((Math.random() - 0.5) * 0.3, 0.4, -0.05 - Math.random() * 0.15);
        p.body.wakeUp();
      }
    }
  }
  function nearbyHookStop() {
    let stop = HOOK_MIN;
    const hx = clawHead.position.x, hz = clawHead.position.z;
    for (const pr of prizes) {
      if (pr.body.won) continue;
      const dx = pr.body.position.x - hx, dz = pr.body.position.z - hz;
      if (dx * dx + dz * dz > 0.08 * 0.08) continue;
      stop = Math.max(stop, Math.min(0.32, pr.body.position.y + 0.10));
    }
    return stop;
  }
  function clawTouchesPrize() {
    const isProng = b => prongs.some(p => p.body === b);
    for (let i = 0; i < world.contacts.length; i++) {
      const c = world.contacts[i];
      const clawish = c.bi === clawHead || c.bj === clawHead || isProng(c.bi) || isProng(c.bj);
      const prize = c.bi.prizeType || c.bj.prizeType;
      if (clawish && prize) return true;
    }
    return false;
  }

  function inChute(body) {
    const x = body.position.x, y = body.position.y, z = body.position.z;
    const hs = CHUTE.s / 2;
    return Math.abs(x - CHUTE.x) < hs && Math.abs(z - CHUTE.z) < hs && y < 0.04;
  }

  function award(p) {
    if (p.body.won) return;
    p.body.won = true;
    wins += 1;
    shelf.push({ id: p.type, name: p.def.name, emoji: p.def.emoji, t: Date.now() });
    saveShelf(shelf);
    renderShelf();
    host.sfx?.('nest');
    onScore({ score: wins, plays, state: 'win', final: false, best: wins });
    // sparkles
    burst(p.body.position);
  }

  let spark = [];
  function burst(pos) {
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 5), makeMat(0xffd76a, { emissive: 0xffb830, em: 1 }));
      m.position.set(pos.x, pos.y + 0.05, pos.z);
      m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6);
      m.userData.life = 0.7; scene.add(m); spark.push(m);
    }
  }
  function tickSpark(dt) {
    for (let i = spark.length - 1; i >= 0; i--) {
      const m = spark[i]; m.userData.life -= dt; m.userData.v.y -= 1.2 * dt;
      m.position.addScaledVector(m.userData.v, dt);
      m.material.opacity = Math.max(0, m.userData.life / 0.7); m.material.transparent = true;
      if (m.userData.life <= 0) { scene.remove(m); m.geometry.dispose(); spark.splice(i, 1); }
    }
  }

  function removePrize(p) {
    world.removeBody(p.body); scene.remove(p.mesh); prizes = prizes.filter(x => x !== p);
  }

  function refillIfNeeded() {
    const live = prizes.filter(p => !p.body.won && p.body.position.y > -0.05);
    if (live.length >= 8) return;
    const missing = TYPES.filter(d => !live.some(p => p.type === d.id));
    const t = (missing[0] || TYPES[Math.floor(Math.random() * TYPES.length)]).id;
    // drop in the back half so it doesn't fall in the chute
    const x = (Math.random() - 0.5) * 0.4, z = -0.05 - Math.random() * 0.2;
    spawnPrize(t, x, 0.55, z);
  }


  function stepHang(dt) {
    // 2-D pendulum in XZ, length = cable. Spring pulls the hook toward vertical hang;
    // the head stays roughly upright, tilting only a little along the cable.
    const hang = self._hang;
    const tx = carriage.position.x, tz = carriage.position.z;
    const k = 18, damp = 4.5;
    hang.vx += ((tx - hang.x) * k - hang.vx * damp) * dt;
    hang.vz += ((tz - hang.z) * k - hang.vz * damp) * dt;
    hang.x += hang.vx * dt;
    hang.z += hang.vz * dt;
    const dx = hang.x - tx, dz = hang.z - tz;
    const maxOff = Math.max(0.01, cable * 0.35);
    const off = Math.hypot(dx, dz);
    if (off > maxOff) { hang.x = tx + dx / off * maxOff; hang.z = tz + dz / off * maxOff; hang.vx *= 0.5; hang.vz *= 0.5; }
    const dx2 = hang.x - tx, dz2 = hang.z - tz;
    const hyRaw = carriage.position.y - Math.sqrt(Math.max(1e-6, cable * cable - dx2 * dx2 - dz2 * dz2));
    const hy = Math.max(HOOK_MIN, hyRaw);
    hang.hy = hy;
    const prev = clawHead.position;
    clawHead.velocity.set((hang.x - prev.x) / Math.max(dt, 1e-4), (hy - prev.y) / Math.max(dt, 1e-4), (hang.z - prev.z) / Math.max(dt, 1e-4));
    clawHead.angularVelocity.set(0, 0, 0);
    // Position is snapped in settleHang() *after* world.step, otherwise the
    // kinematic integrator would apply velocity a second time and the hook
    // would punch through the felt.
  }
  function settleHang() {
    const hang = self._hang;
    const hy = hang.hy != null ? hang.hy : clawHead.position.y;
    clawHead.position.set(hang.x, hy, hang.z);
    const tx = carriage.position.x, tz = carriage.position.z;
    const dirx = tx - hang.x, diry = carriage.position.y - hy, dirz = tz - hang.z;
    const up = new CANNON.Vec3(dirx, diry, dirz); up.normalize();
    const q = clawHead.quaternion;
    const axis = new CANNON.Vec3().copy(new CANNON.Vec3(0, 1, 0)).cross(up, new CANNON.Vec3());
    const sin = axis.length();
    if (sin < 1e-5) q.set(0, 0, 0, 1);
    else {
      axis.scale(1 / sin, axis);
      const ang = Math.acos(Math.min(1, Math.max(-1, up.y)));
      q.setFromAxisAngle(axis, ang);
    }
    clawHead.quaternion.copy(q);
  }

  function stepLogic(dt) {
    stateT += dt;
    if (state === 'close') setGrip('close');
    if (state === 'open' || (state === 'ready' && stateT < 0.5) || state === 'settle') setGrip('open');
    if (state === 'ready' && stateT >= 0.5) setGrip('hold');
    if (state === 'lift' || state === 'return') setGrip('close');

    // move carriage in ready (and a little during return is scripted)
    if (canMove()) {
      const ix = (held.right || 0) - (held.left || 0);
      const iz = (held.down || 0) - (held.up || 0);
      const L = Math.hypot(ix, iz) || 1;
      const vx = (ix / L) * MOVE_SPEED * Math.min(1, Math.abs(ix) + Math.abs(iz) > 0 ? 1 : 0);
      const vz = (iz / L) * MOVE_SPEED * (ix || iz ? 1 : 0);
      const lim = BIN / 2 - 0.12;
      aim.x = Math.max(-lim, Math.min(lim, aim.x + vx * dt));
      aim.z = Math.max(-lim, Math.min(lim, aim.z + vz * dt));
    }
    if (state === 'return') {
      const tx = CHUTE.x, tz = CHUTE.z;
      const dx = tx - aim.x, dz = tz - aim.z, d = Math.hypot(dx, dz);
      const step = MOVE_SPEED * 0.9 * dt;
      if (d < step || d < 0.01) { aim.x = tx; aim.z = tz; }
      else { aim.x += dx / d * step; aim.z += dz / d * step; }
    }
    clampAim();
    const prev = carriage.position;
    const px = prev.x, pz = prev.z;
    carriage.position.x = aim.x; carriage.position.y = RAIL_Y; carriage.position.z = aim.z;
    carriage.velocity.set((aim.x - px) / Math.max(dt, 1e-4), 0, (aim.z - pz) / Math.max(dt, 1e-4));
    stepHang(dt);

    if (state === 'settle') {
      setStatus('Prizes settling…');
      if (stateT > 1.15) { state = 'ready'; stateT = 0; setStatus('Move, then drop'); setGrip('open'); }
    } else if (state === 'ready') {
      if (stateT > 0.5) setGrip('hold'); // stop opening, hold open
    } else if (state === 'drop') {
      cable = Math.min(CABLE_MAX, cable + DROP_SPEED * dt);
      // Stop at the felt, at max cable, or just above a prize under the hook
      // so taller plushies get wrapped instead of shoved. The head itself no
      // longer collides with prizes (it is kinematic and would plow them).
      const y = clawHead.position.y;
      const atFloor = y <= HOOK_MIN + 0.008 && stateT > 0.35;
      const metPile = stateT > 0.35 && y <= nearbyHookStop() + 0.01;
      if (cable >= CABLE_MAX - 0.001 || atFloor || metPile || stateT > 2.0) {
        state = 'close'; stateT = 0; setGrip('close'); setStatus('Closing…'); host.sfx?.('blip');
      }
    } else if (state === 'close') {
      if (stateT > 1.2) { state = 'lift'; stateT = 0; setGrip('close'); setStatus('Lifting…'); }
    } else if (state === 'lift') {
      cable = Math.max(CABLE_TRAVEL, cable - LIFT_SPEED * dt);
      if (cable <= CABLE_TRAVEL + 0.001) { state = 'return'; stateT = 0; setStatus('To the chute…'); }
    } else if (state === 'return') {
      const d = Math.hypot(aim.x - CHUTE.x, aim.z - CHUTE.z);
      if (d < 0.02 && stateT > 0.15) { state = 'open'; stateT = 0; setGrip('open'); setStatus('Opening…'); }
    } else if (state === 'open') {
      if (stateT > 0.7) {
        // did anything land in the chute?
        const caught = prizes.filter(p => !p.body.won && inChute(p.body));
        if (caught.length) {
          state = 'win'; stateT = 0; setStatus('You won ' + caught.map(p => p.def.name).join(', ') + '!');
          caught.forEach(award);
          host.sfx?.('clear');
        } else {
          state = 'miss'; stateT = 0; setStatus('It slipped — try again');
          host.sfx?.('hit');
        }
      }
    } else if (state === 'win' || state === 'miss') {
      if (stateT > 1.15) {
        prizes.filter(p => p.body.won || p.body.position.y < -0.25).forEach(removePrize);
        refillIfNeeded();
        // go back to a ready hover over the pile
        aim.x = 0.08; aim.z = -0.05;
        setGrip('hold');
        state = 'ready'; stateT = 0; setStatus('Move, then drop');
      }
    }

    driveProngs();
    // Open fingers would sweep the pile on the way down and knock the target
    // aside. They only collide with prizes while closing and carrying.
    const grabPhase = state === 'close' || state === 'lift' || state === 'return';
    const mask = grabPhase ? (G_PRIZE | G_WALL) : G_WALL;
    for (const p of prongs) p.body.collisionFilterMask = mask;
    clawHead.collisionFilterMask = mask;

    // accidental roll-in still counts (honest physics)
    if (state !== 'win') {
      for (const p of prizes) if (!p.body.won && p.body.position.y < -0.04 && inChute(p.body)) {
        award(p); setStatus('It rolled in! You won ' + p.def.name);
      }
    }
  }

  function step(dt) {
    stepLogic(dt);
    attachProngs();
    world.step(STEP, dt, MAX_SUB);
    settleHang();
    attachProngs();
    containPrizes();
    // sync visuals
    self._carMesh.position.copy(carriage.position);
    syncMesh(self._headMesh, clawHead);
    for (const p of prongs) syncMesh(p.mesh, p.body);
    for (const p of prizes) syncMesh(p.mesh, p.body);
    const a = carriage.position, b = clawHead.position;
    self._cableLine.geometry.setFromPoints([new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)]);
    tickSpark(dt);
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = now; return; }
    if (!last) last = now;
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    acc += dt;
    while (acc >= STEP) { step(STEP); acc -= STEP; }
    renderer.render(scene, camera);
  }

  function resize(w, h) {
    if (!camera || !renderer) return;
    camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  // -------- debug / tests --------
  function snapshot() {
    return {
      state, cable: +cable.toFixed(3),
      claw: { x: +clawHead.position.x.toFixed(3), y: +clawHead.position.y.toFixed(3), z: +clawHead.position.z.toFixed(3) },
      aim: { x: +aim.x.toFixed(3), z: +aim.z.toFixed(3) },
      plays, wins,
      prizes: prizes.map(p => ({ type: p.type, x: +p.body.position.x.toFixed(3), y: +p.body.position.y.toFixed(3), z: +p.body.position.z.toFixed(3), won: !!p.body.won })),
      shelf: shelf.length, grip: GRIP, gripTarget: +gripTarget.toFixed(3),
    };
  }

  function runSeconds(sec) {
    const n = Math.ceil(sec / STEP);
    for (let i = 0; i < n; i++) step(STEP);
  }

  function simulate(n = 40, { skill = 0.02, seed = 1 } = {}) {
    const wasPaused = paused; paused = true;
    // skill = standard deviation of aim error in meters (0 = perfect aim at a prize top).
    let s = seed;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
    const gauss = () => {
      let u = 1 - rnd(), v = rnd();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    // remember shelf and reset counters for the trial batch
    const wins0 = wins, plays0 = plays;
    let w = 0, pcount = 0;
    for (let i = 0; i < n; i++) {
      // wait until ready
      let guard = 0;
      while (state !== 'ready' && guard++ < 800) runSeconds(0.05);
      if (state !== 'ready') break;
      const live = prizes.filter(pr => !pr.body.won && pr.body.position.y > 0.02);
      if (!live.length) { refillIfNeeded(); runSeconds(1.5); continue; }
      // A skilled player aims at the least-crowded prize in reach.
      const isolation = pr => {
        let n = 0;
        for (const o of live) {
          if (o === pr) continue;
          const dx = o.body.position.x - pr.body.position.x, dz = o.body.position.z - pr.body.position.z;
          if (dx * dx + dz * dz < 0.13 * 0.13) n += 1;
        }
        return n;
      };
      const ranked = live.slice().sort((a, b) => isolation(a) - isolation(b) || a.body.position.y - b.body.position.y);
      const pickN = Math.max(1, Math.min(3, ranked.length));
      const target = ranked[Math.floor(rnd() * pickN)];
      aim.x = target.body.position.x + gauss() * skill;
      aim.z = target.body.position.z + gauss() * skill;
      const lim = BIN / 2 - 0.12;
      aim.x = Math.max(-lim, Math.min(lim, aim.x));
      aim.z = Math.max(-lim, Math.min(lim, aim.z));
      const before = wins;
      drop();
      guard = 0;
      while (state !== 'ready' && guard++ < 1200) runSeconds(0.05);
      pcount += 1;
      if (wins > before) w += 1;
    }
    paused = wasPaused; last = 0;
    return { tries: pcount, wins: w, rate: pcount ? +(w / pcount).toFixed(3) : 0, skill, plays, totalWins: wins, deltaPlays: plays - plays0, deltaWins: wins - wins0 };
  }

  self.init = c => {
    canvas = c;
    setupRenderer(); setupWorld(); setupScene(); setupClaw(); fillBin(); buildHud();
    const r = canvas.parentElement.getBoundingClientRect();
    const cap = quality().dpr, dpr = Math.min(window.devicePixelRatio || 1, cap);
    resize(Math.max(1, Math.floor(r.width * dpr)), Math.max(1, Math.floor(r.height * dpr)));
    // pre-settle a bit so the first frame isn't a rain of toys
    runSeconds(0.8);
    renderer.render(scene, camera);
  };
  self.start = () => { paused = false; last = 0; if (!raf) raf = requestAnimationFrame(loop); host.sfx?.('start'); };
  self.pause = () => { paused = true; };
  self.resume = () => { paused = false; last = 0; };
  self.destroy = () => {
    cancelAnimationFrame(raf); raf = 0;
    hud?.remove();
    renderer?.dispose();
    scene?.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const m = o.material; if (m.map) m.map.dispose(); m.dispose?.(); } });
    world = scene = camera = renderer = null;
  };
  self.onScore = fn => { onScore = fn; };
  self.press = a => { if (a === 'a' || a === 'tap') drop(); };
  self.hold = (a, down) => {
    if (a === 'left' || a === 'right' || a === 'up' || a === 'down') held[a] = down ? 1 : 0;
  };
  self.pointer = (type, loc) => {
    if (type === 'down') {
      if (state === 'ready') drag = { x: loc.x, y: loc.y, ax: aim.x, az: aim.z, w: loc.w, h: loc.h };
      return;
    }
    if (type === 'move' && drag) {
      // drag in screen space: right = +x, up = -z (into the cabinet)
      const sx = (loc.x - drag.x) / drag.w * 1.3;
      const sz = (loc.y - drag.y) / drag.h * 1.3;
      const lim = BIN / 2 - 0.12;
      aim.x = Math.max(-lim, Math.min(lim, drag.ax + sx));
      aim.z = Math.max(-lim, Math.min(lim, drag.az + sz));
      return;
    }
    if (type === 'up' || type === 'cancel') drag = null;
  };
  self.resize = resize;
  Object.defineProperty(self, 'paused', { get() { return paused; } });
  self.debug = {
    get state() { return state; },
    snap: snapshot,
    lookAt(x, y, z) {
      if (!camera) return;
      camera.position.set(x + 0.10, y + 0.08, z + 0.16);
      camera.lookAt(x, y + 0.02, z);
    },
    placeCamera,
    drop, runSeconds, simulate,
    moveTo(x, z) { aim.x = x; aim.z = z; },
    overPrize(type) {
      const p = prizes.find(pr => pr.type === type && !pr.body.won);
      if (!p) return null;
      aim.x = p.body.position.x; aim.z = p.body.position.z; clampAim(); return snapshot();
    },
    get GRIP() { return GRIP; },
    get wins() { return wins; },
    get plays() { return plays; },
    get prizes() { return prizes; },
    putInChute(type) {
      const p = prizes.find(pr => pr.type === type && !pr.body.won) || prizes.find(pr => !pr.body.won);
      if (!p) return null;
      p.body.velocity.set(0, 0, 0); p.body.angularVelocity.set(0, 0, 0);
      p.body.position.set(CHUTE.x, 0.02, CHUTE.z); p.body.wakeUp();
      return snapshot();
    },
    showWin(type) {
      const p = prizes.find(pr => pr.type === type && !pr.body.won) || prizes.find(pr => !pr.body.won);
      if (!p) return null;
      p.body.type = CANNON.Body.KINEMATIC;
      p.body.velocity.set(0, 0, 0); p.body.angularVelocity.set(0, 0, 0);
      p.body.position.set(CHUTE.x, 0.04, CHUTE.z);
      setStatus('You won ' + p.def.name + '!');
      placeCamera('chute');
      return snapshot();
    },
    diag() {
      const tipLocal = new CANNON.Vec3(-0.016, -0.096, 0);
      const tips = prongs.map(p => {
        const w = new CANNON.Vec3();
        p.body.pointToWorldFrame(tipLocal, w);
        return { x: +w.x.toFixed(3), y: +w.y.toFixed(3), z: +w.z.toFixed(3), ang: +prongAngle(p).toFixed(3) };
      });
      return { ...snapshot(), tips, touching: clawTouchesPrize() };
    },
  };
  return self;
}

export function preview(ctx, w, h, t) {
  ctx.fillStyle = '#1a1520'; ctx.fillRect(0, 0, w, h);
  // cabinet
  ctx.fillStyle = '#5b3b25'; ctx.fillRect(w * 0.12, h * 0.18, w * 0.76, h * 0.7);
  ctx.fillStyle = 'rgba(160,210,230,.25)'; ctx.fillRect(w * 0.18, h * 0.28, w * 0.64, h * 0.48);
  ctx.fillStyle = '#e8c15a'; ctx.fillRect(w * 0.16, h * 0.18, w * 0.68, h * 0.08);
  ctx.fillStyle = '#3a1c10'; ctx.font = 'bold ' + Math.floor(h * 0.055) + 'px sans-serif';
  ctx.textAlign = 'center'; ctx.fillText('HONEST CLAW', w / 2, h * 0.235);
  // prizes
  const em = ['🦊', '🐥', '🦃', '⛄', '⭐', '💗'];
  for (let i = 0; i < 6; i++) {
    const x = w * (0.28 + (i % 3) * 0.18), y = h * (0.55 + Math.floor(i / 3) * 0.12 + Math.sin(t * 2 + i) * 0.01);
    ctx.font = Math.floor(h * 0.1) + 'px sans-serif'; ctx.fillText(em[i], x, y);
  }
  // claw
  const cx = w * (0.5 + Math.sin(t) * 0.12), cy = h * (0.34 + Math.abs(Math.sin(t * 1.4)) * 0.08);
  ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, h * 0.26); ctx.lineTo(cx, cy); ctx.stroke();
  ctx.strokeStyle = '#e8c15a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx - 10, cy + 16); ctx.lineTo(cx, cy); ctx.lineTo(cx + 10, cy + 16); ctx.stroke();
  ctx.fillStyle = '#9fe8a0'; ctx.font = 'bold ' + Math.floor(h * 0.045) + 'px sans-serif';
  ctx.fillText('constant grip', w / 2, h * 0.92);
}

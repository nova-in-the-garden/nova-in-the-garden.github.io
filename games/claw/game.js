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
const GRIP = 2.4;             // constant motor force (N·m-ish). Never reduced after pickup.
const CLOSE_SPEED = 2.6;      // rad/s inward
const OPEN_SPEED = -3.2;
const MOVE_SPEED = 0.42;      // m/s of the carriage
const DROP_SPEED = 0.55;      // cable pay-out
const LIFT_SPEED = 0.38;
const CABLE_MIN = 0.16;
const CABLE_MAX = 0.58;
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
function addPrizeVisual(type, group) {
  const R = (a, b) => a + (b - a) * Math.random();
  if (type === 'fox') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), makeMat(0xe07a32));
    body.scale.set(1, 0.85, 1.25); group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), makeMat(0xe07a32));
    head.position.set(0, 0.028, 0.04); group.add(head);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), makeMat(0xfff3e0));
    chest.position.set(0, -0.004, 0.03); chest.scale.set(1, 0.8, 0.7); group.add(chest);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.028, 6), makeMat(0xe07a32));
      ear.position.set(s * 0.018, 0.052, 0.032); group.add(ear);
    }
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), makeMat(0xe07a32));
    tail.position.set(0, 0.01, -0.06); tail.scale.set(0.7, 0.7, 1.6); group.add(tail);
  } else if (type === 'lorenz') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), makeMat(0xf2d14a));
    body.scale.set(1, 0.95, 1.15); group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), makeMat(0xf7dc5c));
    head.position.set(0, 0.03, 0.032); group.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.024, 6), makeMat(0xf08a2a, { rough: 0.5 }));
    beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.026, 0.056); group.add(beak);
    for (const s of [-1, 1]) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.006, 0.02), makeMat(0xf08a2a));
      foot.position.set(s * 0.018, -0.04, 0.01); group.add(foot);
    }
  } else if (type === 'turkey') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), makeMat(0x7a4a22));
    body.scale.set(1.05, 0.9, 1.15); group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), makeMat(0x3a2a18));
    head.position.set(0, 0.04, 0.04); group.add(head);
    const wattle = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 5), makeMat(0xc8323a));
    wattle.position.set(0, 0.024, 0.055); wattle.scale.set(0.7, 1.3, 0.7); group.add(wattle);
  } else if (type === 'glider') {
    const mat = makeMat(0x7adf7a, { rough: 0.55 });
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.04), mat);
    group.add(wing);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.09), mat);
    nose.position.z = 0.01; group.add(nose);
  } else if (type === 'snowman') {
    const a = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), makeMat(0xf4f7ff, { rough: 0.85 }));
    a.position.y = -0.01; group.add(a);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), makeMat(0xf4f7ff, { rough: 0.85 }));
    b.position.y = 0.046; group.add(b);
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), makeMat(0xf4f7ff, { rough: 0.85 }));
    c.position.y = 0.09; group.add(c);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.02, 6), makeMat(0xf08a2a));
    nose.rotation.x = Math.PI / 2; nose.position.set(0, 0.088, 0.028); group.add(nose);
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.006, 6, 10), makeMat(0xc8323a));
    scarf.position.y = 0.068; scarf.rotation.x = Math.PI / 2; group.add(scarf);
  } else if (type === 'acorn') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), makeMat(0x5a3a16));
    cap.position.y = 0.01; group.add(cap);
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), makeMat(0xb8742a));
    nut.scale.set(1, 1.15, 1); nut.position.y = -0.01; group.add(nut);
  } else if (type === 'heart') {
    const mat = makeMat(0xe85a7a, { rough: 0.65 });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), mat);
      p.position.set(s * 0.018, 0.012, 0); group.add(p);
    }
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.05, 8), mat);
    tip.rotation.x = Math.PI; tip.position.y = -0.022; group.add(tip);
  } else if (type === 'star') {
    const mat = makeMat(0xffd76a, { rough: 0.5, metal: 0.2, emissive: 0xffb830, em: 0.25 });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), mat);
    group.add(core);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5 + Math.PI / 2;
      const arm = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.04, 5), mat);
      arm.position.set(Math.cos(a) * 0.02, Math.sin(a) * 0.02, 0);
      arm.rotation.z = a - Math.PI / 2; group.add(arm);
    }
  }
}

// turkey tail was left incomplete in the fox branch — build turkey properly here if the typo path ran
function finishTurkey(group) {
  if (group.children.length > 4) return;
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.075, 0.09, 9, 1, false, 0, Math.PI), makeMat(0xb8651e));
  tail.rotation.x = Math.PI / 2; tail.position.set(0, 0.02, -0.05); group.add(tail);
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
    if (Q.shadows) renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
      addCM(clawMat, prizeMats[t.id], Math.min(0.95, t.friction + 0.25));
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
    const ped = new THREE.Mesh(new THREE.BoxGeometry(BIN + 0.22, 0.18, BIN + 0.22), wood);
    ped.position.set(0, -0.09, 0); ped.castShadow = ped.receiveShadow = true; scene.add(ped);
    // back + side walls (visual, thicker wood)
    const back = new THREE.Mesh(new THREE.BoxGeometry(BIN + 0.16, WALL_H + 0.12, 0.05), wood);
    back.position.set(0, hh, -BIN / 2 - 0.05); back.castShadow = true; scene.add(back);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.05, WALL_H + 0.12, BIN + 0.16), wood);
      side.position.set(s * (BIN / 2 + 0.05), hh, 0); side.castShadow = true; scene.add(side);
    }
    // glass front (visual only)
    const front = new THREE.Mesh(new THREE.BoxGeometry(BIN + 0.1, WALL_H + 0.04, 0.012), glass);
    front.position.set(0, hh, BIN / 2 + 0.02); scene.add(front);
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

    // floor visual
    const floor = new THREE.Mesh(new THREE.BoxGeometry(BIN, 0.03, BIN), makeMat(0x2a3048, { rough: 0.85 }));
    floor.position.set(0, -0.015, 0); floor.receiveShadow = true; scene.add(floor);
    // chute hole visual
    const hole = new THREE.Mesh(new THREE.BoxGeometry(CHUTE.s, 0.04, CHUTE.s), makeMat(0x0a0e18));
    hole.position.set(CHUTE.x, 0.001, CHUTE.z); scene.add(hole);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(CHUTE.s + 0.03, 0.02, CHUTE.s + 0.03), gold);
    lip.position.set(CHUTE.x, 0.008, CHUTE.z); scene.add(lip);
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
    boxBody(inn + T, T / 2, (BIN - CHUTE.s) / 4, 0, -T / 2, -inn / 2 - 0.02); // back half of floor
    // floor as four slabs around the chute
    const hs = CHUTE.s / 2, cx = CHUTE.x, cz = CHUTE.z;
    // back slab (covers z < cz - hs)
    const zBack = (-inn + (cz - hs)) / 2, dBack = (cz - hs) - (-inn);
    if (dBack > 0.02) boxBody(inn, T / 2, dBack / 2, 0, -T / 2, zBack);
    // front slab to the right of chute (z > cz+hs is small) and left/right of hole
    const zFront = ((cz + hs) + inn) / 2, dFront = inn - (cz + hs);
    if (dFront > 0.02) boxBody(inn, T / 2, dFront / 2, 0, -T / 2, zFront);
    // left of hole (x < cx-hs), in the z-band of the hole
    const xLeft = (-inn + (cx - hs)) / 2, wLeft = (cx - hs) - (-inn);
    if (wLeft > 0.02) boxBody(wLeft / 2, T / 2, hs + 0.01, xLeft, -T / 2, cz);
    // right of hole
    const xRight = ((cx + hs) + inn) / 2, wRight = inn - (cx + hs);
    if (wRight > 0.02) boxBody(wRight / 2, T / 2, hs + 0.01, xRight, -T / 2, cz);

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

    // claw head (hook at origin, body hangs below)
    clawHead = new CANNON.Body({ mass: 0.14, material: clawMat, linearDamping: 0.25, angularDamping: 0.85 });
    clawHead.addShape(new CANNON.Sphere(0.028), new CANNON.Vec3(0, -0.03, 0));
    clawHead.position.set(carriage.position.x, RAIL_Y - CABLE_TRAVEL, carriage.position.z);
    clawHead.collisionFilterGroup = G_CLAW; clawHead.collisionFilterMask = G_PRIZE | G_WALL;
    world.addBody(clawHead);

    cableEq = new CANNON.DistanceConstraint(carriage, clawHead, CABLE_TRAVEL, 1e5);
    world.addConstraint(cableEq);
    cable = CABLE_TRAVEL;

    const headMesh = new THREE.Group(); scene.add(headMesh);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), makeMat(0xe8c15a, { metal: 0.6, rough: 0.3 }));
    bulb.position.y = -0.03; headMesh.add(bulb);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 8, 12), makeMat(0xd4a84b, { metal: 0.7, rough: 0.3 }));
    ring.position.y = -0.005; headMesh.add(ring);
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
      const radial = new CANNON.Vec3(Math.cos(a), 0, Math.sin(a));
      const axis = new CANNON.Vec3(-Math.sin(a), 0, Math.cos(a));
      const pivotA = new CANNON.Vec3(radial.x * 0.022, -0.04, radial.z * 0.022);

      const body = new CANNON.Body({ mass: 0.045, material: clawMat, linearDamping: 0.15, angularDamping: 0.4 });
      // long finger
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.008, 0.07, 0.01)), new CANNON.Vec3(0, -0.07, 0));
      // inward curl at the tip
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.008, 0.012, 0.018)), new CANNON.Vec3(0.012, -0.145, 0));
      // place so the hinge sits at pivotA on the head, prong hanging down and a bit out
      const q = new CANNON.Quaternion();
      q.setFromEuler(0, -a, 0); // local +X will face radially? we'll set world transform
      // Better: align prong local +X with radial, local +Y up. Then curl in +X is inward? curl is in +X of prong — we want inward (toward center), which is -radial if prong hangs below.
      // We'll orient each prong so its local +X is -radial (inward) and +Y is world up at start, then rotate slightly open.
      const open = 0.55; // radians from vertical, outward
      const xAxis = new CANNON.Vec3(-radial.x, 0, -radial.z); // inward
      const zAxis = axis;
      const yAxis = new CANNON.Vec3();
      zAxis.cross(xAxis, yAxis); // should be up-ish
      // start orientation: rotate around axis by `open` so tips move outward
      const pos = new CANNON.Vec3().copy(clawHead.position).vadd(pivotA);
      body.position.copy(pos);
      const qY = new CANNON.Quaternion(); qY.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -a);
      const qOpen = new CANNON.Quaternion(); qOpen.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), open);
      body.quaternion.copy(qY).mult(qOpen, body.quaternion);
      body.collisionFilterGroup = G_PRONG; body.collisionFilterMask = G_PRIZE | G_WALL;
      world.addBody(body);

      // hinge: pivotA on head, pivotB at prong origin (top of finger)
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
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.14, 0.02), prongMat);
      arm.position.y = -0.07; arm.castShadow = true; mesh.add(arm);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.024, 0.036), prongMat);
      tip.position.set(0.012, -0.145, 0); tip.castShadow = true; mesh.add(tip);

      prongs.push({ body, hinge, mesh, axis, radial, a });
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
    body.quaternion.setFromEuler(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.5);
    body.collisionFilterGroup = G_PRIZE; body.collisionFilterMask = G_PRIZE | G_WALL | G_CLAW | G_PRONG | G_SENSOR;
    body.prizeType = type; body.won = false;
    world.addBody(body);
    const mesh = new THREE.Group();
    addPrizeVisual(type, mesh);
    if (type === 'turkey') finishTurkey(mesh);
    mesh.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(mesh);
    const p = { type, def, body, mesh };
    prizes.push(p);
    return p;
  }

  function fillBin() {
    // a snug but not packed pile, slightly jittered
    const spots = [
      [0.12, 0.18, 0.02, 'fox'], [-0.08, 0.2, -0.12, 'lorenz'], [0.18, 0.22, -0.16, 'turkey'],
      [-0.16, 0.16, 0.08, 'glider'], [0.02, 0.24, -0.2, 'snowman'], [0.2, 0.16, 0.14, 'acorn'],
      [-0.02, 0.18, 0.16, 'heart'], [0.1, 0.2, 0.2, 'star'],
      [-0.2, 0.18, -0.06, 'fox'], [0.0, 0.28, 0.0, 'lorenz'],
    ];
    for (const [x, y, z, t] of spots) spawnPrize(t, x, y, z);
  }

  function placeCamera(kind) {
    if (!camera) return;
    if (kind === 'grip') camera.position.set(0.15, 0.72, 0.85);
    else if (kind === 'chute') camera.position.set(-0.15, 0.55, 0.95);
    else camera.position.set(0.15, 0.85, 1.25);
    camera.lookAt(kind === 'chute' ? new THREE.Vector3(CHUTE.x, 0.05, CHUTE.z) : new THREE.Vector3(0, 0.2, 0));
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
      : `<span class="won" title="Your prize shelf is empty" style="opacity:.5">—</span>`;
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

  function setGrip(speed) {
    // speed 0 = hold at current angle with the SAME max force (honest).
    for (const p of prongs) { p.hinge.setMotorMaxForce(GRIP); p.hinge.setMotorSpeed(speed); }
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
    const live = prizes.filter(p => !p.body.won && p.body.position.y > -0.05).length;
    if (live >= 8) return;
    const t = TYPES[Math.floor(Math.random() * TYPES.length)].id;
    // drop in the back half so it doesn't fall in the chute
    const x = (Math.random() - 0.5) * 0.4, z = -0.05 - Math.random() * 0.2;
    spawnPrize(t, x, 0.55, z);
  }

  function stepLogic(dt) {
    stateT += dt;
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
    const prev = carriage.position;
    const px = prev.x, pz = prev.z;
    carriage.position.x = aim.x; carriage.position.y = RAIL_Y; carriage.position.z = aim.z;
    carriage.velocity.set((aim.x - px) / Math.max(dt, 1e-4), 0, (aim.z - pz) / Math.max(dt, 1e-4));
    cableEq.distance = cable;

    if (state === 'settle') {
      setStatus('Prizes settling…');
      if (stateT > 2.2) { state = 'ready'; stateT = 0; setStatus('Move, then drop'); setGrip(OPEN_SPEED); }
    } else if (state === 'ready') {
      if (stateT > 0.5) setGrip(0); // stop opening, hold open
    } else if (state === 'drop') {
      cable = Math.min(CABLE_MAX, cable + DROP_SPEED * dt);
      // stop a little above the floor, or after a moment at max
      const y = clawHead.position.y;
      if (cable >= CABLE_MAX - 0.001 || (y < 0.13 && stateT > 0.35) || stateT > 1.35) {
        state = 'close'; stateT = 0; setGrip(CLOSE_SPEED); setStatus('Closing…'); host.sfx?.('blip');
      }
    } else if (state === 'close') {
      if (stateT > 0.55) { setGrip(0); state = 'lift'; stateT = 0; setStatus('Lifting…'); }
    } else if (state === 'lift') {
      cable = Math.max(CABLE_TRAVEL, cable - LIFT_SPEED * dt);
      if (cable <= CABLE_TRAVEL + 0.001) { state = 'return'; stateT = 0; setStatus('To the chute…'); }
    } else if (state === 'return') {
      const d = Math.hypot(aim.x - CHUTE.x, aim.z - CHUTE.z);
      if (d < 0.02 && stateT > 0.15) { state = 'open'; stateT = 0; setGrip(OPEN_SPEED); setStatus('Opening…'); }
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
        setGrip(0);
        state = 'ready'; stateT = 0; setStatus('Move, then drop');
      }
    }

    // accidental roll-in still counts (honest physics)
    if (state !== 'win') {
      for (const p of prizes) if (!p.body.won && p.body.position.y < -0.04 && inChute(p.body)) {
        award(p); setStatus('It rolled in! You won ' + p.def.name);
      }
    }
  }

  function step(dt) {
    world.step(STEP, dt, MAX_SUB);
    stepLogic(dt);
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
      shelf: shelf.length, grip: GRIP,
    };
  }

  function runSeconds(sec) {
    const n = Math.ceil(sec / STEP);
    for (let i = 0; i < n; i++) step(STEP);
  }

  function simulate(n = 40, { skill = 0.02, seed = 1 } = {}) {
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
      const target = live[Math.floor(rnd() * live.length)];
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
    return { tries: pcount, wins: w, rate: pcount ? w / pcount : 0, skill, plays, totalWins: wins, deltaPlays: plays - plays0, deltaWins: wins - wins0 };
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
    placeCamera,
    drop, runSeconds, simulate,
    moveTo(x, z) { aim.x = x; aim.z = z; },
    overPrize(type) {
      const p = prizes.find(pr => pr.type === type && !pr.body.won);
      if (!p) return null;
      aim.x = p.body.position.x; aim.z = p.body.position.z; return snapshot();
    },
    get GRIP() { return GRIP; },
    get wins() { return wins; },
    get plays() { return plays; },
    get prizes() { return prizes; },
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

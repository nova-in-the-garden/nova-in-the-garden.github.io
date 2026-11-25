// Christmas decorations for the Hearth cottage and the Rule 90 tree.
// Night and Gold (navy, red, gold). Visibility is driven by christmasStage().
import * as THREE from 'three';
import { mat, mesh, glow, glowSprite, rng, canvasTexture } from './util.js';
import { trackSnowCap } from './seasons.js';

function wreath() {
  const g = new THREE.Group(); g.userData.kind = 'wreath';
  const green = mat(0x1a4a30), gold = mat(0xe8c15a, { metalness: 0.4, roughness: 0.4, emissive: 0x3a2a08, emissiveIntensity: 0.35 });
  const red = mat(0xc62f37, { emissive: 0x400810, emissiveIntensity: 0.35 });
  // torus in the door's XY plane, sitting just off the front face
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.038, 8, 20), green);
  g.add(ring);
  for (let i = 0; i < 11; i++) {
    const a = i / 11 * Math.PI * 2;
    const berry = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), i % 3 === 0 ? gold : red);
    berry.position.set(Math.cos(a) * 0.16, Math.sin(a) * 0.16, 0.03);
    g.add(berry);
  }
  // a small gold bow at the bottom
  const bow = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), gold);
  bow.scale.set(1.4, 0.7, 0.6); bow.position.set(0, -0.18, 0.04); g.add(bow);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.012), gold);
  tail.position.set(0, -0.26, 0.04); g.add(tail);
  return g;
}

function stocking(color, cuff = 0xf4ece0) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.16, 3, 8), mat(color, { roughness: 0.85 }));
  body.position.y = -0.14; g.add(body);
  const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.08, 3, 8), mat(color, { roughness: 0.85 }));
  foot.rotation.z = Math.PI / 2; foot.position.set(0.07, -0.24, 0); g.add(foot);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.05, 8), mat(cuff));
  band.position.y = -0.01; g.add(band);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 4, 10, Math.PI), mat(0xe8c15a, { metalness: 0.5, roughness: 0.4 }));
  hook.rotation.x = Math.PI; hook.position.y = 0.03; g.add(hook);
  return g;
}

function stringLights(parent, points) {
  const g = new THREE.Group(); parent.add(g);
  const gold = glow(0xf2cd62, 1.6), red = glow(0xc62f37, 1.2);
  const bulbs = [];
  points.forEach((p, i) => {
    const b = mesh(new THREE.SphereGeometry(0.035, 6, 5), i % 2 ? red : gold, p[0], p[1], p[2], g);
    bulbs.push(b);
  });
  // a thin dark wire along the same points
  if (points.length > 1) {
    const arr = [];
    points.forEach(p => arr.push(p[0], p[1], p[2]));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x1a1a22 }));
    g.add(line);
  }
  return { group: g, tick(t) { bulbs.forEach((b, i) => b.scale.setScalar(0.85 + 0.3 * (0.5 + 0.5 * Math.sin(t * 2.3 + i * 1.7)))); } };
}

function cookies() {
  const g = new THREE.Group();
  const plate = mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.04, 20), mat(0xf4ece0), 0, 0.03, 0, g);
  mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.012, 20), mat(0xe8d8c0), 0, 0.052, 0, g);
  const dough = mat(0xc48a48), cream = mat(0xf4ece0), chip = mat(0x3a2414);
  for (const [x, z, typ] of [[-0.11, 0.08, 'oreo'], [0.12, 0.04, 'chip'], [-0.02, -0.13, 'oreo']]) {
    if (typ === 'oreo') {
      mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 12), mat(0x2a1a14), x, 0.08, z, g);
      mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.02, 12), cream, x, 0.10, z, g);
      mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 12), mat(0x2a1a14), x, 0.125, z, g);
    } else {
      mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 12), dough, x, 0.09, z, g);
      for (let i = 0; i < 5; i++) {
        const a = i * 1.3;
        mesh(new THREE.SphereGeometry(0.02, 6, 5), chip, x + Math.cos(a) * 0.05, 0.12, z + Math.sin(a) * 0.05, g);
      }
    }
  }
  // a glass of milk, large enough to read from the Hearth path
  mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.20, 12), new THREE.MeshStandardMaterial({ color: 0xdce8f4, transparent: true, opacity: 0.5, roughness: 0.15 }), 0.26, 0.16, -0.18, g);
  mesh(new THREE.CylinderGeometry(0.068, 0.06, 0.15, 12), mat(0xf8f4ea), 0.26, 0.13, -0.18, g);
  const cardTex = canvasTexture(256, 160, (ctx, w, h) => {
    ctx.fillStyle = '#1a1a22'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#e8c15a'; ctx.lineWidth = 10; ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = '#e8c15a'; ctx.font = '700 44px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('For Santa', w / 2, h / 2);
  });
  const card = mesh(new THREE.PlaneGeometry(0.28, 0.18), new THREE.MeshBasicMaterial({ map: cardTex }), -0.28, 0.16, 0.02, g);
  card.rotation.x = -0.15;
  g.userData.kind = 'cookies';
  return g;
}

function gifts() {
  const g = new THREE.Group();
  const wraps = [
    // Out in front of the tree (yard / +z, a little west) so the Hearth camera sees them,
    // clear of the lowest cone (radius ~2.2).
    { c: 0x1a1a22, r: 0xe8c15a, s: [0.50, 0.34, 0.42], p: [-1.15, 0.18, 2.40] },
    { c: 0x8b1e2b, r: 0xe8c15a, s: [0.42, 0.30, 0.36], p: [-0.25, 0.16, 2.60] },
    { c: 0xe8c15a, r: 0x8b1e2b, s: [0.34, 0.26, 0.32], p: [0.55, 0.14, 2.45] },
    { c: 0x1a1a22, r: 0xc62f37, s: [0.30, 0.24, 0.30], p: [-0.75, 0.13, 2.90] },
    { c: 0x8b1e2b, r: 0xe8c15a, s: [0.38, 0.28, 0.32], p: [0.20, 0.15, 2.95] },
  ];
  wraps.forEach(w => {
    const box = new THREE.Group(); box.position.set(...w.p); g.add(box);
    mesh(new THREE.BoxGeometry(...w.s), mat(w.c, { roughness: 0.7 }), 0, 0, 0, box);
    // ribbon cross
    mesh(new THREE.BoxGeometry(w.s[0] + 0.01, w.s[1] + 0.012, 0.04), mat(w.r), 0, 0, 0, box);
    mesh(new THREE.BoxGeometry(0.04, w.s[1] + 0.012, w.s[2] + 0.01), mat(w.r), 0, 0, 0, box);
    const bow = mesh(new THREE.SphereGeometry(0.045, 6, 5), mat(w.r, { emissive: w.r, emissiveIntensity: 0.2 }), 0, w.s[1] / 2 + 0.03, 0, box);
    bow.scale.set(1.3, 0.6, 0.8);
  });
  g.userData.kind = 'gifts';
  return g;
}

// Attach wreath, stockings and eave lights to the cottage. Local cottage
// coordinates (the group is later scaled 1.5). Door swings with the wreath.
export function decorateCottage(house) {
  const door = house.door;
  const wr = wreath();
  // door-local: the slab is dW wide (0.66), centered at x = dW/2
  wr.position.set(0.33, 0.62, 0.06);
  door.add(wr);

  const stockings = new THREE.Group();
  house.group.add(stockings);
  // hang from the porch canopy's front edge, between the posts
  const dx = -0.85, B = 0.3, D = 3.0, pz = D / 2 + 0.5;
  const colors = [0x1a1a22, 0xc62f37, 0xe8c15a];
  colors.forEach((c, i) => {
    const s = stocking(c);
    s.scale.setScalar(0.88);
    // hang in the porch opening, clearly under the canopy (not sitting on the roof)
    s.position.set(dx - 0.22 + i * 0.22, B + 1.16, pz + 0.30);
    stockings.add(s);
  });

  const eaveZ = D / 2 + 0.04, eaveY = 0.3 + 1.8 - 0.02;
  const pts = [];
  for (let i = 0; i <= 11; i++) pts.push([-1.7 + i * (3.4 / 11), eaveY + Math.sin(i * 0.7) * 0.04, eaveZ]);
  const lights = stringLights(house.group, pts);

  const capL = new THREE.Group(); house.group.add(capL);
  // a light snow dusting along the two roof slabs and the ridge
  const rise = 1.4, top = 0.3 + 1.8, over = 0.35, W = 3.6, half = W / 2 + over;
  const snowM = mat(0xeef2f6);
  mesh(new THREE.BoxGeometry(0.22, 0.06, 3.9), snowM, 0, top + rise + 0.08, 0, capL);
  for (const s of [-1, 1]) {
    const slab = new THREE.Group(); slab.position.set(s * half / 2, (top + rise + (top - over * Math.tan(Math.atan2(rise, W / 2)))) / 2 + 0.06, 0);
    slab.rotation.z = -s * Math.atan2(rise, W / 2); capL.add(slab);
    mesh(new THREE.BoxGeometry(Math.hypot(half, rise) * 0.92, 0.05, 3.5), snowM, 0, 0.08, 0, slab);
  }
  trackSnowCap(capL);

  return {
    wreath: wr, stockings, lights: lights.group,
    setStage(stage) {
      const on = stage !== 'off';
      wr.visible = on; stockings.visible = on; lights.group.visible = on;
    },
    tick(t) { if (lights.group.visible) lights.tick(t); },
  };
}

export function decorateTree(treeGroup) {
  const cookieG = cookies(); cookieG.position.set(-1.55, 0, 2.75); treeGroup.add(cookieG);
  const giftG = gifts(); treeGroup.add(giftG);
  // a soft snow cap under the star, plus smaller caps on lower layers
  const caps = new THREE.Group(); treeGroup.add(caps);
  const snowM = mat(0xeef2f6);
  const H = 4.2, layers = 5, base = 1.9;
  for (let i = 0; i < layers; i++) {
    const r = (base * (1 - i / layers) + 0.3) * 0.55;
    const y = 0.7 + i * (H / layers) * 0.85 + 1.35;
    const cap = mesh(new THREE.SphereGeometry(r, 8, 5), snowM, 0, y, 0, caps);
    cap.scale.set(1, 0.32, 1);
  }
  trackSnowCap(caps);
  cookieG.visible = false; giftG.visible = false;
  return {
    cookies: cookieG, gifts: giftG,
    setStage(stage) {
      treeGroup.visible = stage !== 'off';
      cookieG.visible = stage === 'eve';
      giftG.visible = stage === 'day';
    },
  };
}

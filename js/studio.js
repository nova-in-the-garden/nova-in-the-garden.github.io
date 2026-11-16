// Pixel Studio, made interactive (2026-11-16):
//  - a curved gallery wall + easels, every painting clickable (opens the lightbox, js/lightbox.js)
//  - a cathedral radio you can click on/off that plays Nova's songs (js/radio.js)
// Everything comes from world.studio (data/studio.json) and world.radio (data/radio.json).
import * as THREE from 'three';
import { rule90, mat, glow, mesh, glowSprite, glowTexture, textSprite, canvasTexture } from './util.js';
import { DAY } from './daylight.js';

const WALL_R = 7.3, PANEL_W = 2.25, PANEL_H = 3.75, PANEL_D = 0.22;

// fit an image of aspect w/h into a box
function fit(w, h, bw, bh) { const a = (w || 1) / (h || 1); return a > bw / bh ? [bw, bw / a] : [bh * a, bh]; }

export function buildStudio(g, isl, ctx) {
  const P = ctx.world.studio?.paintings || [], R = ctx.world.radio;
  const S = new THREE.Group(); g.add(S);
  // turn the studio so the gallery's open side faces the usual camera spot
  if (ctx.home) { g.updateMatrixWorld(true); const p = g.getWorldPosition(new THREE.Vector3()); S.rotation.y = Math.atan2(ctx.home.x - p.x, ctx.home.z - p.z); }
  const loader = new THREE.TextureLoader();
  const paintingMeshes = [];
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xc99a2e, metalness: 0.75, roughness: 0.32, emissive: 0x3a2808, emissiveIntensity: 0.6 });
  frameMat.userData.keepGlow = true;
  function hang(parent, p, bw, bh, y, z = 0) {
    const [w, h] = fit(p.w, p.h, bw, bh);
    const frame = mesh(new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.07), frameMat, 0, y, z, parent);
    const tex = loader.load(p.texture || p.src); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    if (p.pixel) { tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; }
    const pic = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), 0, y, z + 0.041, parent);
    pic.material.color.setScalar(0.92);
    for (const m of [frame, pic]) { m.userData.painting = p.id; paintingMeshes.push(m); }
    return { w, h, pic };
  }

  // ---- gallery wall: one panel per wall painting, on an arc behind the easels
  const wallP = P.filter(p => p.place === 'wall'), easelP = P.filter(p => p.place === 'easel');
  const wood = mat(0x1c2142, { roughness: 0.75 }), trim = mat(0xc99a2e, { metalness: 0.6, roughness: 0.35 });
  const n = wallP.length, step = n > 1 ? Math.min(0.36, 3.3 / (n - 1)) : 0;   // ~20° apart, spread up to ~190°
  const lights = [];
  wallP.forEach((p, i) => {
    const a = (i - (n - 1) / 2) * step;
    const panel = new THREE.Group(); panel.position.set(Math.sin(a) * WALL_R, 0, -Math.cos(a) * WALL_R); panel.rotation.y = -a; S.add(panel);
    mesh(new THREE.BoxGeometry(PANEL_W, PANEL_H, PANEL_D), wood, 0, PANEL_H / 2, -PANEL_D / 2, panel);
    mesh(new THREE.BoxGeometry(PANEL_W + 0.12, 0.12, PANEL_D + 0.1), trim, 0, PANEL_H, -PANEL_D / 2, panel);
    mesh(new THREE.BoxGeometry(PANEL_W + 0.06, 0.18, PANEL_D + 0.06), trim, 0, 0.09, -PANEL_D / 2, panel);
    hang(panel, p, PANEL_W - 0.45, 1.75, 2.35, 0.02);
    // a little brass picture light with a soft pool of light (stronger at night)
    mesh(new THREE.BoxGeometry(0.5, 0.06, 0.12), trim, 0, 3.42, 0.12, panel);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.6), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffd890, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending }));
    pool.material.userData.anim = true; pool.raycast = () => {}; pool.position.set(0, 2.9, 0.09); panel.add(pool); lights.push(pool);
    // gold Rule 90 plaque under each painting
    if (i % 2 === 0) mesh(new THREE.BoxGeometry(0.34, 0.08, 0.02), trim, 0, 1.12, 0.02, panel);
  });

  // ---- easels: an arc in front of the wall
  const ne = easelP.length;
  easelP.forEach((p, i) => {
    const a = ne > 1 ? (i - (ne - 1) / 2) * 0.62 : 0;
    const e = new THREE.Group(); e.position.set(Math.sin(a) * 3.6, 0, -Math.cos(a) * 3.6 + 2.1); e.rotation.y = -a * 0.7; S.add(e);
    const w0 = mat(0x7a5532);
    for (const s of [-1, 1]) { const l = mesh(new THREE.BoxGeometry(0.1, 2.5, 0.1), w0, s * 0.72, 1.25, 0, e); l.rotation.z = s * 0.08; }
    mesh(new THREE.BoxGeometry(0.1, 2.2, 0.1), w0, 0, 1.1, -0.45, e).rotation.x = -0.25;
    mesh(new THREE.BoxGeometry(1.7, 0.08, 0.16), w0, 0, 0.98, 0.06, e);
    const big = i === 0;
    hang(e, p, big ? 2.3 : 1.6, big ? 1.5 : 1.3, 1.78, 0.06);
  });

  // ---- the radio: a little cathedral radio on a round table, Night and Gold with red knobs
  const radio = new THREE.Group(); radio.position.set(4.6, 0, 3.3); radio.rotation.y = Math.atan2(-4.6, 8.5 - 3.3); S.add(radio);
  const radioMeshes = [];
  const tbl = mat(0x2a1a14);
  mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.08, 18), tbl, 0, 0.9, 0, radio);
  mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.9, 8), tbl, 0, 0.45, 0, radio);
  mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.06, 14), tbl, 0, 0.03, 0, radio);
  const body = new THREE.Group(); body.position.y = 0.94; radio.add(body);
  const walnut = new THREE.MeshStandardMaterial({ color: 0x5a3220, roughness: 0.45, metalness: 0.05 });
  mesh(new THREE.BoxGeometry(1.25, 0.95, 0.62), walnut, 0, 0.475, 0, body);
  const archShape = new THREE.Shape(); archShape.absarc(0, 0, 0.625, 0, Math.PI, false); archShape.lineTo(0.625, 0);
  const archGeo = new THREE.ExtrudeGeometry(archShape, { depth: 0.62, bevelEnabled: false, curveSegments: 20 }); archGeo.translate(0, 0, -0.31);
  mesh(archGeo, walnut, 0, 0.95, 0, body);
  // gold Sierpinski fretwork over the speaker (arched), glows with the music
  const fretTex = canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#14100c'; c.fillRect(0, 0, w, h);
    const rows = rule90(32); const cs = w / 64; c.fillStyle = '#f2cd62';
    rows.forEach((row, y) => row.forEach((v, x) => { if (v) c.fillRect(x * cs + 0.5, y * 6.4 + 34, cs - 1, 5.4); }));
    c.strokeStyle = '#f2cd62'; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
  });
  const fretMat = new THREE.MeshStandardMaterial({ map: fretTex, emissiveMap: fretTex, emissive: 0xffc860, emissiveIntensity: 0.05, roughness: 0.6 });
  fretMat.userData.anim = true;
  const fretShape = new THREE.Shape(); fretShape.moveTo(-0.42, 0); fretShape.lineTo(0.42, 0); fretShape.lineTo(0.42, 0.55); fretShape.absarc(0, 0.55, 0.42, 0, Math.PI, false); fretShape.lineTo(-0.42, 0);
  const fretGeo = new THREE.ShapeGeometry(fretShape, 16);
  { const pos = fretGeo.attributes.position, uv = fretGeo.attributes.uv; for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + 0.42) / 0.84, pos.getY(i) / 0.97); }
  const fret = mesh(fretGeo, fretMat, 0, 0.38, 0.312, body);
  const archRim = mesh(new THREE.TorusGeometry(0.44, 0.03, 6, 24, Math.PI), trim, 0, 0.93, 0.315, body);
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.06, 0.55, 0.04), trim, s * 0.44, 0.655, 0.315, body);
  // the dial window shows the station and the song; amber when on
  const dialC = document.createElement('canvas'); dialC.width = 512; dialC.height = 96;
  const dialTex = new THREE.CanvasTexture(dialC); dialTex.colorSpace = THREE.SRGBColorSpace;
  const dialMat = new THREE.MeshStandardMaterial({ map: dialTex, emissiveMap: dialTex, emissive: 0xffffff, emissiveIntensity: 0.15, roughness: 0.5 });
  dialMat.userData.anim = true;
  const dial = mesh(new THREE.PlaneGeometry(0.9, 0.17), dialMat, 0, 0.27, 0.312, body);
  const needle = mesh(new THREE.BoxGeometry(0.012, 0.15, 0.01), glow(0xd2343c, 1.4), -0.3, 0.27, 0.32, body); needle.material.userData.anim = true;
  function drawDial(on, title, station) {
    const c = dialC.getContext('2d'), w = 512, h = 96;
    c.fillStyle = on ? '#2a1a08' : '#120d08'; c.fillRect(0, 0, w, h);
    c.strokeStyle = on ? '#f2cd62' : '#6b5420'; c.lineWidth = 4; c.strokeRect(2, 2, w - 4, h - 4);
    c.fillStyle = on ? '#f6dc8c' : '#7a6640'; c.font = '600 22px Georgia, serif'; c.textAlign = 'left'; c.fillText(station || 'Nova FM', 14, 30);
    for (let i = 0; i <= 20; i++) { c.fillRect(250 + i * 12, 14, 2, i % 5 ? 8 : 16); }
    c.font = '600 30px Georgia, serif'; c.fillStyle = on ? '#ffe6a0' : '#5a4a2e'; c.textAlign = 'center';
    c.fillText(on ? (title || '') : 'off · click to play', w / 2, 76);
    dialTex.needsUpdate = true;
  }
  drawDial(false, '', R?.station);
  // knobs (red accents) and a power lamp
  const knobMat = new THREE.MeshStandardMaterial({ color: 0xb8262e, roughness: 0.35, metalness: 0.2 });
  const knobs = [-0.32, 0, 0.32].map(x => { const k = mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.07, 14), knobMat, x, 0.1, 0.33, body); k.rotation.x = Math.PI / 2; mesh(new THREE.BoxGeometry(0.012, 0.05, 0.012), trim, 0, 0.04, 0.03, k).rotation.x = -Math.PI / 2; return k; });
  const lamp = mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3a1010, emissive: 0xff4040, emissiveIntensity: 0, roughness: 0.4 }), 0.52, 0.86, 0.3, body); lamp.material.userData.anim = true;
  mesh(new THREE.BoxGeometry(1.3, 0.06, 0.66), trim, 0, 0.0, 0, body);
  const halo = glowSprite(2.6, 0xffcf7a, 0); halo.material.userData.anim = true; halo.raycast = () => {}; halo.position.set(0, 0.7, 0.5); body.add(halo);
  const label = textSprite('♪ Nova FM', { size: 0.34 }); label.position.set(0, 3.05, 0); radio.add(label);
  radio.traverse(o => { if (o.isMesh) { o.userData.radio = true; radioMeshes.push(o); } });
  // floating notes rise from the speaker while it plays
  const notes = []; for (let i = 0; i < 8; i++) { const s = textSprite(i % 3 ? '♪' : '♫', { size: 0.42, bg: 'rgba(0,0,0,0)' }); s.material.opacity = 0; s.material.userData.anim = true; s.raycast = () => {}; radio.add(s); notes.push(s); }

  let on = false, lvl = 0, onAmt = 0, knobSpin = 0;
  function setRadio(state) {
    on = !!state.on; drawDial(on, state.title, R?.station);
    knobs[0].rotation.y = on ? -1.2 : 0; knobSpin = (state.index || 0) * 0.9;
    label.material.opacity = on ? 0.35 : 1;
  }
  function update(t, dt, level = 0) {
    lvl += ((on ? level : 0) - lvl) * Math.min(1, dt * 12);
    onAmt += ((on ? 1 : 0) - onAmt) * Math.min(1, dt * 4);
    const night = DAY.night;
    lights.forEach(l => { l.material.opacity = 0.12 + 0.5 * night; });
    fretMat.emissiveIntensity = 0.05 + onAmt * (0.35 + 1.6 * lvl);
    dialMat.emissiveIntensity = 0.15 + onAmt * 0.85;
    lamp.material.emissiveIntensity = onAmt * 2.2;
    needle.position.x = -0.3 + (knobSpin % 3.6) / 3.6 * 0.6 * onAmt;
    knobs[2].rotation.y = knobSpin;
    halo.material.opacity = onAmt * (0.25 + 0.5 * lvl) * (0.5 + 0.5 * night);
    body.scale.setScalar(1 + onAmt * lvl * 0.025);
    notes.forEach((s, i) => { const p = (t * 0.28 + i / notes.length) % 1; s.position.set(Math.sin(p * 5 + i * 1.7) * 0.45, 1.5 + p * 2.6, 0.2 + Math.cos(i) * 0.3); s.material.opacity = onAmt * Math.sin(p * Math.PI) * 0.95; });
  }
  // a good look at the studio: the wall and easels, the radio in the front-right corner
  function viewPoint(portrait) {
    const pos = S.localToWorld(new THREE.Vector3(portrait ? 0.6 : 0.8, portrait ? 13 : 7.2, portrait ? 20 : 13.5));
    const target = S.localToWorld(new THREE.Vector3(0.6, portrait ? -2.5 : 1.4, -1.6));
    return { pos, target };
  }
  const radioWorld = () => radio.localToWorld(new THREE.Vector3(0, 1.4, 0.3));
  const paintingWorld = id => { const m = paintingMeshes.find(x => x.userData.painting === id && x.geometry.type === 'PlaneGeometry'); return m ? m.getWorldPosition(new THREE.Vector3()) : null; };
  return { group: S, update, setRadio, viewPoint, radioWorld, paintingWorld, paintingMeshes, radioMeshes };
}

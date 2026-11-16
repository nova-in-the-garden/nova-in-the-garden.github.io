import * as THREE from 'three';

// deterministic random so the world looks the same every visit
export function rng(seed = 11) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Rule 90: cell = left XOR right. Returns rows of 0/1, width 2*rows-1, single seed.
export function rule90(rows) {
  const w = rows * 2 - 1, out = [];
  let row = new Array(w).fill(0); row[rows - 1] = 1;
  for (let r = 0; r < rows; r++) {
    out.push(row);
    const nx = new Array(w).fill(0);
    for (let i = 0; i < w; i++) nx[i] = (row[i - 1] || 0) ^ (row[i + 1] || 0);
    row = nx;
  }
  return out;
}

export const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0, ...opts });
export const glow = (color, intensity = 1.6) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });

export function mesh(geo, material, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, material); m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}

// jitter vertices for a hand-made low-poly look (keeps seams closed)
export function jitter(geo, amt, rand) {
  geo = geo.index ? geo : geo; const p = geo.attributes.position; const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!map.has(k)) map.set(k, [(rand() - .5) * amt, (rand() - .5) * amt, (rand() - .5) * amt]);
    const d = map.get(k); p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
  }
  geo.computeVertexNormals(); return geo;
}

let glowTex;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,250,225,1)'); grd.addColorStop(.25, 'rgba(246,220,140,.55)'); grd.addColorStop(1, 'rgba(232,193,90,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c); glowTex.colorSpace = THREE.SRGBColorSpace; return glowTex;
}
export function glowSprite(scale = 1, color = 0xffffff, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(scale); return s;
}

export function textSprite(text, { size = 1, color = '#f6dc8c', sub = '', bg = 'rgba(10,15,36,0.72)' } = {}) {
  const c = document.createElement('canvas'); const g = c.getContext('2d');
  const fs = 56, sfs = 30; g.font = `600 ${fs}px Georgia, serif`;
  const w1 = g.measureText(text).width; g.font = `${sfs}px system-ui, sans-serif`; const w2 = sub ? g.measureText(sub).width : 0;
  c.width = Math.ceil(Math.max(w1, w2) + 60); c.height = sub ? 120 : 84;
  g.fillStyle = bg; const r = 30; g.beginPath(); g.roundRect(2, 2, c.width - 4, c.height - 4, r); g.fill();
  g.strokeStyle = 'rgba(232,193,90,.6)'; g.lineWidth = 3; g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color; g.font = `600 ${fs}px Georgia, serif`;
  g.fillText(text, c.width / 2, sub ? 46 : c.height / 2 + 2);
  if (sub) { g.fillStyle = '#aab0c8'; g.font = `${sfs}px system-ui, sans-serif`; g.fillText(sub, c.width / 2, 92); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(size * c.width / c.height, size, 1); return s;
}

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// Merge every static mesh under `root` that shares the same look into one mesh,
// so a detailed model costs a handful of draw calls instead of hundreds.
// Meshes (or their ancestors) with userData.dynamic / exit / decorId are left alone.
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map(), victims = [];
  const skip = o => { for (let p = o; p && p !== root; p = p.parent) if (p.userData.dynamic || p.userData.exit || p.userData.decorId) return true; return false; };
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || skip(o)) return;
    const m = o.material;
    if (m.transparent || !o.geometry.attributes.normal) return;
    const key = [m.type, m.color?.getHex(), m.emissive?.getHex(), m.emissiveIntensity, m.map?.uuid, m.side, m.flatShading, m.roughness, m.metalness, m.visible].join('|');
    if (!groups.has(key)) groups.set(key, { mat: m, parts: [], flags: {} });
    const gr = groups.get(key);
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    gr.parts.push(g); Object.assign(gr.flags, o.userData); victims.push(o);
  });
  let merged = 0;
  for (const { mat, parts, flags } of groups.values()) {
    if (parts.length < 2) { parts.forEach(p => p.dispose()); continue; }
    const n = parts.reduce((s, g) => s + g.attributes.position.count, 0);
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let k = 0;
    for (const g of parts) {
      pos.set(g.attributes.position.array, k * 3); nor.set(g.attributes.normal.array, k * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, k * 2);
      k += g.attributes.position.count; g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    const mm = new THREE.Mesh(geo, mat); mm.userData = { ...flags, merged: true }; root.add(mm); merged++;
  }
  // remove originals that were merged (only those whose group really merged)
  for (const o of victims) {
    const m = o.material;
    const key = [m.type, m.color?.getHex(), m.emissive?.getHex(), m.emissiveIntensity, m.map?.uuid, m.side, m.flatShading, m.roughness, m.metalness, m.visible].join('|');
    if (groups.get(key).parts.length >= 2) o.removeFromParent();
  }
  return merged;
}

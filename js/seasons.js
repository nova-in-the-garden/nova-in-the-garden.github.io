// Seasonal palettes and cheap retints. Applied once when the Central-time
// date (or a ?date= preview) changes, never every frame.
import * as THREE from 'three';

export const PALETTES = {
  spring: {
    foliage: 0x3d8a48, foliage2: 0x5aa85a, foliage3: 0x2f6a3e,
    grassShift: 0xd8f0c8, far: 0x4a8a50, snow: 0, blossoms: true,
  },
  summer: {
    foliage: 0x1f4a35, foliage2: 0x24553c, foliage3: 0x1a3e2c,
    grassShift: 0xffffff, far: 0x35603f, snow: 0, blossoms: false,
  },
  autumn: {
    foliage: 0xb45a1e, foliage2: 0xc48a28, foliage3: 0xa03018,
    grassShift: 0xe4c888, far: 0x6a5a30, snow: 0, blossoms: false,
  },
  winter: {
    foliage: 0x1a3a30, foliage2: 0x243f34, foliage3: 0x163028,
    grassShift: 0xc8d4dc, far: 0xb8c4cc, snow: 0.72, blossoms: false,
  },
};

const foliage = [], grass = [], blossoms = [], snowCaps = [];

export function trackFoliage(mat, role = 'foliage') {
  mat.userData.seasonRole = role;
  if (!mat.userData.seasonBase) mat.userData.seasonBase = mat.color.getHex();
  foliage.push(mat);
  return mat;
}

export function trackGrass(mat) {
  if (!mat.userData.seasonBase) mat.userData.seasonBase = mat.color.getHex();
  grass.push(mat);
  return mat;
}

export function trackBlossoms(obj) { blossoms.push(obj); return obj; }
export function trackSnowCap(obj) { snowCaps.push(obj); return obj; }

const _c = new THREE.Color(), _b = new THREE.Color();

export function applyPalette(name, { weatherKind } = {}) {
  const pal = PALETTES[name] || PALETTES.summer;
  const snowy = pal.snow > 0 || weatherKind === 'snow';
  for (const m of foliage) {
    const role = m.userData.seasonRole;
    const hex = role === 'foliage2' ? pal.foliage2 : role === 'foliage3' ? pal.foliage3 : pal.foliage;
    m.color.setHex(hex);
  }
  for (const m of grass) {
    _b.setHex(m.userData.seasonBase);
    if (name === 'summer') m.color.copy(_b);
    else if (name === 'winter') m.color.copy(_b).lerp(_c.setHex(0xd8e2e8), 0.72);
    else if (name === 'autumn') m.color.copy(_b).lerp(_c.setHex(0xc4a050), 0.45);
    else m.color.copy(_b).lerp(_c.setHex(0x8ad060), 0.28);
  }
  for (const o of blossoms) o.visible = !!pal.blossoms;
  for (const o of snowCaps) o.visible = snowy;
  return pal;
}

export { foliage as _foliage, grass as _grass, blossoms as _blossoms, snowCaps as _snowCaps };

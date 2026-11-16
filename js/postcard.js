// Exoplanet Postcard Maker (Star Dock). Data: data/postcards.json (real NASA Exoplanet Archive values).
// paintFront / paintBack draw a 1800x1200 postcard into any 2D canvas; createPostcardMaker() is the overlay UI.
// Physically informed: star colour from its temperature, star size from its radius and the orbit,
// how many suns, sister planets at their real closest-approach sizes, rocky / ocean / gas / lava look
// from radius and temperature. Rock and air colours, clouds and terrain shapes are artistic license.

export const CARD_W = 1800, CARD_H = 1200;
const AU_PER_RSUN = 0.00465047, AU_PER_REARTH = 4.26352e-5, LY_PER_PC = 3.26156;
const SUN_DEG = 0.533, MOON_DEG = 0.518, FOV = 64;        // the painted sky spans 64° across
const GOLD = '#e8c15a', GOLD2 = '#f6dc8c', INK = '#070b1c', IVORY = '#efe6d2';
const SERIF = 'Georgia, "DejaVu Serif", "Times New Roman", serif';

// ---------- small helpers ----------
function rng(seedStr) { let h = 1779033703; for (const c of seedStr) h = Math.imul(h ^ c.charCodeAt(0), 3432918353), h = (h << 13) | (h >>> 19); let a = h >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (c1, c2, k) => c1.map((v, i) => Math.round(v + (c2[i] - v) * k));
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const has = v => v !== null && v !== undefined && !Number.isNaN(v);
// blackbody colour for a temperature (Tanner Helland's fit), as seen by eye
export function starRGB(teff) {
  if (!has(teff)) return [200, 215, 255];
  const t = clamp(teff, 1000, 40000) / 100; let r, g, b;
  r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [r, g, b].map(v => Math.round(clamp(v, 0, 255)));
}

// ---------- what the data says about the view (used by front, back and tests) ----------
export function analyse(p) {
  const R = p.pl_rade, M = p.pl_bmasse, T = p.pl_eqt;
  let kind;
  if (has(R) ? R >= 6 : has(M) && M >= 50) kind = 'giant';
  else if (has(R) && R >= 2.0) kind = 'subneptune';
  else kind = 'rocky';
  let climate = !has(T) ? 'unknown' : T >= 1200 ? 'lava' : T >= 330 ? 'scorched' : T >= 200 ? 'temperate' : 'icy';
  if (kind === 'giant') climate = !has(T) ? 'cold' : T >= 2000 ? 'ultrahot' : T >= 1000 ? 'hot' : T >= 450 ? 'warm' : 'cold';
  const starDeg = has(p.st_rad) && has(p.pl_orbsmax) ? 2 * Math.atan(p.st_rad * AU_PER_RSUN / p.pl_orbsmax) * 180 / Math.PI : null;
  // likely tidally locked: very short orbits around small stars (an inference, said as "probably")
  const locked = has(p.pl_orbper) && (p.pl_orbper < 10 || (has(p.st_teff) && p.st_teff < 4000 && p.pl_orbper < 40)) && !(p.pl_orbeccen > 0.3);
  const sibs = (p.siblings || []).filter(s => has(s.a_au) && has(p.pl_orbsmax)).map(s => {
    const d = Math.abs(s.a_au - p.pl_orbsmax); const r = has(s.radius_re) ? s.radius_re : null;
    const deg = r && d > 0 ? 2 * Math.atan(r * AU_PER_REARTH / d) * 180 / Math.PI : null;
    return { ...s, closest_au: d, deg, inner: s.a_au < p.pl_orbsmax };
  });
  const sibsNoOrbit = (p.siblings || []).filter(s => !has(s.a_au));
  const lightYears = has(p.sy_dist) ? p.sy_dist * LY_PER_PC : null;
  const pulsar = /^PSR/.test(p.hostname);
  return { kind, climate, starDeg, locked, sibs, sibsNoOrbit, lightYears, pulsar, suns: p.sy_snum || 1, circumbinary: p.cb_flag === 1, color: starRGB(p.st_teff) };
}

// ---------- friendly facts for the back ----------
const nf = (v, d = 1) => Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 });
function sig(v) { const a = Math.abs(v); return a >= 100 ? nf(v, 0) : a >= 10 ? nf(v, 1) : a >= 1 ? nf(v, 1) : nf(v, 2); }
export function facts(p, A = analyse(p)) {
  const out = [];
  const P = p.pl_orbper;
  if (!has(P)) out.push('How long a year lasts here: unknown.');
  else if (P < 1) out.push(`A year here lasts just ${nf(P * 24, 1)} hours.`);
  else if (P < 400) out.push(`A year here lasts ${sig(P)} days.`);
  else out.push(`A year here lasts ${nf(P / 365.25, 2)} Earth years (${nf(P, 0)} days).`);
  if (has(A.lightYears)) out.push(A.lightYears < 10 ? `Light from home takes ${nf(A.lightYears, 1)} years to get here.` : `Light from home takes about ${nf(A.lightYears, 0)} years to get here.`);
  else out.push('Distance from home: unknown.');
  const star = A.pulsar ? 'Your sun is a pulsar: the spinning core of a dead star.' : has(p.st_teff) ? `Your sun${p.st_spectype ? ` (type ${p.st_spectype})` : ''} glows at ${nf(p.st_teff, 0)} K; ours is 5,772 K.` : 'Your sun\u2019s temperature: unknown.';
  out.push(star + (has(A.starDeg) ? ` It looks ${A.starDeg / SUN_DEG >= 1.15 ? nf(A.starDeg / SUN_DEG, 1) + ' times as wide as' : A.starDeg / SUN_DEG <= 0.87 ? nf(A.starDeg / SUN_DEG, 2) + ' times as wide as' : 'about as wide as'} the Sun from Earth.` : ''));
  if (A.circumbinary) out.push('You have two suns: this planet circles both stars of a binary.');
  else if (A.suns > 1) out.push(`This system has ${A.suns} stars: ${A.suns === 2 ? 'a second sun shines' : 'more suns shine'} far off in the sky.`);
  const R = p.pl_rade, est = p.pl_rade_calc ? '*' : '';
  if (has(R)) out.push(R >= 6 ? `It is ${nf(R / 11.209, 2)} times as wide as Jupiter (${nf(R, 1)} Earths)${est}.` : `It is ${nf(R, 2)} times as wide as Earth${est}.`);
  else out.push('Its size: unknown.');
  if (has(p.pl_bmasse)) { const msini = /sin/i.test(p.pl_bmassprov || ''); const m = p.pl_bmasse; out.push(`It weighs ${msini ? 'at least ' : ''}${m >= 100 ? nf(m / 317.8, 2) + ' Jupiters' : sig(m) + ' Earths'}${p.pl_bmasse_calc ? '*' : ''}.`); }
  else out.push('Its weight: unknown.');
  if (has(p.pl_eqt)) { const c = p.pl_eqt - 273.15, f = c * 9 / 5 + 32; out.push(`Its "no-air" temperature is about ${nf(p.pl_eqt, 0)} K (${nf(c, 0)} °C / ${nf(f, 0)} °F)${p.pl_eqt_calc ? '*' : ''}.`); }
  else out.push('Its temperature: unknown.');
  if (has(p.pl_insol)) out.push(p.pl_insol >= 2 ? `It gets ${nf(p.pl_insol, 0)} times the sunlight Earth does.` : `It gets ${nf(p.pl_insol, 2)} times the sunlight Earth does.`);
  if (A.locked) out.push('It is probably tidally locked: one side always faces the sun, so the sun never moves in its sky.');
  const big = A.sibs.filter(s => s.deg).sort((a, b) => b.deg - a.deg)[0];
  if (A.sibs.length + A.sibsNoOrbit.length) out.push(`${A.sibs.length + A.sibsNoOrbit.length} sister planet${A.sibs.length + A.sibsNoOrbit.length > 1 ? 's' : ''} share${A.sibs.length + A.sibsNoOrbit.length > 1 ? '' : 's'} this sun.` + (big ? ` At its closest, ${big.letter} looks ${big.deg / MOON_DEG >= 0.8 ? nf(big.deg / MOON_DEG, 1) + ' times as wide as' : nf(big.deg / MOON_DEG * 100, 0) + '% as wide as'} our Moon.` : ''));
  if (has(p.disc_year)) out.push(`Found in ${p.disc_year}${p.discoverymethod ? ` by the ${p.discoverymethod.toLowerCase()} method` : ''}.`);
  return out;
}
export function novaNote(p, A = analyse(p)) {
  const mood = {
    'rocky:temperate': 'I keep imagining standing on that shore, wondering if the puddles are water.',
    'rocky:icy': 'Bring a scarf. Lorenz would slide on this ice for hours.',
    'rocky:scorched': 'Too hot for a picnic, but the light would be gorgeous.',
    'rocky:lava': 'The ground glows here. I painted it as lava because that much heat melts rock.',
    'rocky:unknown': 'Nobody knows its temperature yet, so I painted a guess.',
    'subneptune:temperate': 'Nobody knows if there is an ocean under that haze. I painted one, hopefully.',
    'subneptune:icy': 'Thick air, cold light. I painted a hazy sea, but that part is my imagination.',
    'subneptune:scorched': 'A steamy, hazy world. The sea is my guess.',
    'giant:cold': 'There is no ground on a giant planet, so this is the view from the cloud tops.',
    'giant:warm': 'No ground here, only warm cloud tops as far as you can see.',
    'giant:hot': 'A hot Jupiter: no ground, just glowing clouds and a sun that fills the sky.',
    'giant:ultrahot': 'Hotter than lava. The clouds themselves glow.',
  }[`${A.kind}:${A.climate}`] || 'I painted this from the numbers, plus a little imagination.';
  return `${p.why} ${mood}`;
}

// ---------- painting ----------
function text(ctx, s, x, y, { size = 40, color = GOLD, weight = 'normal', style = 'normal', align = 'left', font = SERIF, base = 'alphabetic', shadow = 0, spacing = 0 } = {}) {
  ctx.save(); ctx.font = `${style} ${weight} ${size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base;
  if (spacing) ctx.letterSpacing = `${spacing}px`;
  if (shadow) { ctx.shadowColor = 'rgba(0,0,0,.75)'; ctx.shadowBlur = shadow; ctx.shadowOffsetY = shadow / 3; }
  ctx.fillText(s, x, y); ctx.restore();
}
function wrap(ctx, s, maxW) {
  const words = String(s).split(/\s+/), lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line); return lines;
}
function para(ctx, s, x, y, maxW, lh, opts) {
  ctx.save(); ctx.font = `${opts.style || 'normal'} ${opts.weight || 'normal'} ${opts.size}px ${opts.font || SERIF}`;
  const lines = wrap(ctx, s, maxW); ctx.restore();
  lines.forEach((l, i) => text(ctx, l, x, y + i * lh, opts)); return y + lines.length * lh;
}
function ridge(r, w, base, amp, rough, n = 9) {
  let pts = [base, base]; let a = amp;
  for (let k = 0; k < n; k++) { const np = []; for (let i = 0; i < pts.length - 1; i++) { np.push(pts[i], (pts[i] + pts[i + 1]) / 2 + (r() - 0.5) * a); } np.push(pts[pts.length - 1]); pts = np; a *= rough; }
  return pts.map((y, i) => [i / (pts.length - 1) * w, y]);
}
function fillRidge(ctx, pts, H, fill) { ctx.beginPath(); ctx.moveTo(0, H); pts.forEach(([x, y]) => ctx.lineTo(x, y)); ctx.lineTo(pts[pts.length - 1][0], H); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
function glowDisk(ctx, x, y, r, col, glow, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r + glow);
  g.addColorStop(0, rgb(mix(col, [255, 255, 255], 0.7), alpha)); g.addColorStop(r / (r + glow), rgb(col, alpha * 0.95)); g.addColorStop(Math.min(1, r / (r + glow) + 0.02), rgb(col, alpha * 0.35)); g.addColorStop(1, rgb(col, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r + glow, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = rgb(mix(col, [255, 255, 255], 0.55), alpha); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
function planetDisk(ctx, x, y, r, base, lightDir, rand) {
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = rgb(mix(base, [10, 12, 30], 0.75)); ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  const g = ctx.createRadialGradient(x + lightDir[0] * r * 0.6, y + lightDir[1] * r * 0.6, r * 0.1, x, y, r * 1.25);
  g.addColorStop(0, rgb(mix(base, [255, 255, 255], 0.25))); g.addColorStop(0.55, rgb(base, 0.85)); g.addColorStop(1, rgb(base, 0));
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  if (r > 10) for (let i = 0; i < 5; i++) { ctx.fillStyle = rgb(mix(base, [0, 0, 0], 0.3), 0.18); ctx.fillRect(x - r, y - r + rand() * 2 * r, 2 * r, r * 0.08 * (1 + rand())); }
  // night side
  const sh = ctx.createLinearGradient(x + lightDir[0] * r, y + lightDir[1] * r, x - lightDir[0] * r, y - lightDir[1] * r);
  sh.addColorStop(0, 'rgba(0,0,10,0)'); sh.addColorStop(0.55, 'rgba(0,0,10,0.1)'); sh.addColorStop(0.75, 'rgba(0,0,10,0.85)'); sh.addColorStop(1, 'rgba(0,0,10,0.95)');
  ctx.fillStyle = sh; ctx.fillRect(x - r, y - r, 2 * r, 2 * r); ctx.restore();
}

export function paintFront(ctx, p, { W = CARD_W, H = CARD_H, date = new Date() } = {}) {
  const A = analyse(p), r = rng(p.id), sc = A.color;
  ctx.save(); ctx.clearRect(0, 0, W, H);
  const B = 34;                                // card border
  ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H);
  const SX = B, SY = B, SW = W - 2 * B, SH = H - 2 * B;
  ctx.save(); ctx.beginPath(); ctx.roundRect(SX, SY, SW, SH, 14); ctx.clip(); ctx.translate(SX, SY);
  const pxPerDeg = SW / FOV;
  const horizon = SH * (A.kind === 'giant' ? 0.66 : 0.64);
  const ins = has(p.pl_insol) ? p.pl_insol : has(p.pl_eqt) ? Math.pow(p.pl_eqt / 255, 4) : 1;
  const bright = clamp(0.28 + 0.16 * Math.log10(ins + 0.01) + 0.25, 0.12, 0.95);   // how lit the scene is
  // ---- sky
  const thick = A.kind !== 'rocky';
  const top = [6, 9, 26], mid = mix([20, 22, 60], sc, 0.25 + bright * 0.2), low = mix(mix([60, 40, 70], sc, 0.6), [255, 255, 255], thick ? 0.12 : 0.02);
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, rgb(top)); sky.addColorStop(0.55, rgb(mix(top, mid, 0.6 + bright * 0.3))); sky.addColorStop(1, rgb(mix(mid, low, 0.55 + bright * 0.35)));
  ctx.fillStyle = sky; ctx.fillRect(0, 0, SW, SH);
  // stars (fewer in a bright or hazy sky)
  const nStars = Math.round(520 * (1.1 - bright) * (thick ? 0.55 : 1));
  for (let i = 0; i < nStars; i++) { const x = r() * SW, y = Math.pow(r(), 1.4) * horizon * 0.95; const s = r() < 0.06 ? 2.4 : r() * 1.5 + 0.4; ctx.fillStyle = `rgba(255,${235 + r() * 20 | 0},${200 + r() * 55 | 0},${(0.25 + r() * 0.7) * (1 - y / horizon * 0.7)})`; ctx.fillRect(x, y, s, s); }
  // a tiny gold Rule 90 asterism, Nova's signature in every sky
  { const ox = SW * (0.06 + r() * 0.12), oy = horizon * (0.1 + r() * 0.1), s = 7; let row = [1]; for (let k = 0; k < 8; k++) { row.forEach((v, j) => { if (v) { ctx.fillStyle = 'rgba(246,220,140,.75)'; ctx.fillRect(ox + (j - k) * s, oy + k * s, 2.2, 2.2); } }); const nx = []; for (let j = 0; j <= row.length; j++) nx.push(((row[j - 1] || 0) ^ (row[j] || 0))); row = nx; } }
  // ---- suns
  const starPx = has(A.starDeg) ? A.starDeg * pxPerDeg : 14;
  const sunR = Math.max(A.pulsar ? 2 : 3, starPx / 2);
  const sunX = SW * (0.62 + r() * 0.12);
  let sunY = A.locked ? horizon - sunR * 0.35 : horizon - Math.max(sunR * 1.25, SH * 0.2);
  if (sunR > SH * 0.42) sunY = horizon + sunR * 0.15;          // a sun bigger than the sky: its arc rises over the horizon
  const lightDir = [1, 0.4]; // from left planets toward the sun (painted on the right)
  // sister planets (closest-approach sizes), placed on an arc across the sky
  const sibs = A.sibs.slice().sort((a, b) => (b.deg || 0) - (a.deg || 0));
  sibs.forEach((s, i) => {
    const px = s.deg ? s.deg * pxPerDeg : 0; const rr = px / 2;
    const x = SW * (0.08 + (i + 0.5) / Math.max(1, sibs.length) * 0.5) + (r() - 0.5) * 60; const y = horizon * (0.18 + r() * 0.45);
    const tint = s.radius_re >= 6 ? [214, 180, 130] : s.radius_re >= 2 ? [150, 180, 210] : mix([170, 140, 120], sc, 0.2);
    const ld = [(sunX - x), (sunY - y)]; const l = Math.hypot(...ld) || 1;
    if (rr >= 2.5) { planetDisk(ctx, x, y, rr, tint, [ld[0] / l, ld[1] / l], r); if (rr > 4) text(ctx, s.letter, x, y - rr - 10, { size: 22, color: 'rgba(246,220,140,.75)', align: 'center', style: 'italic' }); }
    else { glowDisk(ctx, x, y, 2.2, mix(tint, [255, 255, 255], 0.5), 9, 0.9); text(ctx, s.letter, x + 8, y - 8, { size: 20, color: 'rgba(246,220,140,.6)', style: 'italic' }); }
  });
  // far companions in multi-star systems (not circumbinary): brilliant points
  if (A.suns > 1 && !A.circumbinary) for (let k = 1; k < A.suns; k++) { const x = SW * (0.18 + r() * 0.3), y = horizon * (0.2 + r() * 0.3); glowDisk(ctx, x, y, 3.5, [255, 236, 200], 26, 0.95); ctx.strokeStyle = 'rgba(255,240,210,.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 30, y); ctx.lineTo(x + 30, y); ctx.moveTo(x, y - 30); ctx.lineTo(x, y + 30); ctx.stroke(); }
  // the sun(s)
  const glowR = sunR * (A.pulsar ? 6 : 1.4) + 60 + bright * 140;
  const halo = ctx.createRadialGradient(sunX, sunY, sunR * 0.5, sunX, sunY, sunR + glowR * 3);
  halo.addColorStop(0, rgb(sc, 0.55)); halo.addColorStop(0.35, rgb(sc, 0.18 + bright * 0.1)); halo.addColorStop(1, rgb(sc, 0));
  ctx.fillStyle = halo; ctx.fillRect(0, 0, SW, SH);
  if (A.circumbinary) { const c2 = mix(sc, [255, 140, 70], 0.45); glowDisk(ctx, sunX - sunR * 2.6 - 40, sunY + sunR * 0.4 + 10, Math.max(2.5, sunR * 0.6), c2, 30 + sunR * 0.8); }
  if (A.pulsar) {
    ctx.save(); ctx.translate(sunX, sunY); ctx.rotate(-0.5); const bg = ctx.createLinearGradient(0, -420, 0, 420);
    bg.addColorStop(0, 'rgba(170,200,255,0)'); bg.addColorStop(0.5, 'rgba(190,215,255,.4)'); bg.addColorStop(1, 'rgba(170,200,255,0)');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(-40, -420); ctx.lineTo(40, -420); ctx.lineTo(3, 0); ctx.lineTo(40, 420); ctx.lineTo(-40, 420); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  glowDisk(ctx, sunX, sunY, sunR, sc, Math.min(220, 14 + sunR * 0.5), 1);
  // ---- ground / sea / clouds
  const lit = mix(sc, [255, 255, 255], 0.15);
  const shade = k => mix([8, 10, 24], mix([40, 34, 50], lit, 0.45), k * (0.35 + bright * 0.65));
  if (A.kind === 'giant') {
    const hot = A.climate === 'ultrahot' || A.climate === 'hot';
    const cloudBase = A.climate === 'ultrahot' ? [255, 140, 60] : A.climate === 'hot' ? [200, 110, 70] : A.climate === 'warm' ? [190, 160, 120] : [170, 175, 190];
    for (let band = 0; band < 7; band++) {
      const y0 = horizon - 20 + band * (SH - horizon + 60) / 6, k = band / 6;
      const c = mix(mix(cloudBase, [15, 12, 30], A.climate === 'ultrahot' ? 0.08 + k * 0.3 : hot ? 0.2 + k * 0.4 : 0.3 + k * 0.45), lit, 0.18 * (1 - k));
      const pts = ridge(r, SW, y0, 40 + band * 14, 0.5, 7).map(([x, y]) => [x, y + Math.sin(x / (120 + band * 50) + band) * (8 + band * 5)]);
      fillRidge(ctx, pts, SH, rgb(c));
      // cloud puffs along the band's top edge, lit from the sun's side
      const n = 9 + band * 3, pr = 46 + band * 30;
      for (let i = 0; i < n; i++) {
        const x = (i + r() * 0.8) / n * SW, y = y0 + Math.sin(x / (120 + band * 50) + band) * (8 + band * 5) + (r() - 0.3) * pr * 0.4, rr = pr * (0.6 + r() * 0.7);
        const g = ctx.createRadialGradient(x + rr * 0.35 * Math.sign(sunX - x), y - rr * 0.4, rr * 0.1, x, y, rr);
        g.addColorStop(0, rgb(mix(c, mix(lit, [255, 255, 255], 0.3), 0.3 * (1 - k * 0.6)), 0.9)); g.addColorStop(0.6, rgb(c, 0.85)); g.addColorStop(1, rgb(c, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
      }
      if (hot) for (let i = 0; i < 8 + band * 3; i++) { const x = r() * SW, y = y0 + 20 + r() * 40; ctx.strokeStyle = `rgba(255,${A.climate === 'ultrahot' ? 200 : 140},70,${0.15 + 0.2 * k})`; ctx.lineWidth = 2 + k * 4; ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + 60, y - 10, x + 140, y + 12, x + 220 + k * 160, y); ctx.stroke(); }
    }
    if (hot) { const g = ctx.createLinearGradient(0, horizon, 0, SH); g.addColorStop(0, 'rgba(255,120,40,.0)'); g.addColorStop(1, `rgba(255,${A.climate === 'ultrahot' ? 170 : 90},40,.28)`); ctx.fillStyle = g; ctx.fillRect(0, horizon - 40, SW, SH); }
  } else if (A.kind === 'subneptune') {
    // a hazy sea (whether there is liquid at all is unknown: artistic)
    const haze = ctx.createLinearGradient(0, horizon - 160, 0, horizon + 20); haze.addColorStop(0, rgb(low, 0)); haze.addColorStop(1, rgb(mix(low, [255, 255, 255], 0.2), 0.6));
    ctx.fillStyle = haze; ctx.fillRect(0, horizon - 160, SW, 180);
    const sea = ctx.createLinearGradient(0, horizon, 0, SH); sea.addColorStop(0, rgb(mix(mix([30, 60, 90], sc, 0.3), [255, 255, 255], 0.1))); sea.addColorStop(1, rgb([6, 12, 28]));
    ctx.fillStyle = sea; ctx.fillRect(0, horizon, SW, SH - horizon);
    for (let i = 0; i < 260; i++) { const y = horizon + Math.pow(r(), 1.6) * (SH - horizon); const near = (y - horizon) / (SH - horizon); const x = sunX + (r() - 0.5) * (40 + near * 520) * (1 + sunR / 200); ctx.fillStyle = rgb(mix(sc, [255, 255, 255], 0.6), 0.25 + 0.5 * (1 - near)); ctx.fillRect(x, y, 6 + near * 50, 1.5 + near * 3); }
    for (let i = 0; i < 90; i++) { const y = horizon + 6 + r() * (SH - horizon); const near = (y - horizon) / (SH - horizon); ctx.strokeStyle = rgb(mix([120, 150, 190], lit, 0.3), 0.08 + near * 0.12); ctx.lineWidth = 1 + near * 2; ctx.beginPath(); const x = r() * SW; ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 40 + near * 80, y - 6 - near * 6, x + 80 + near * 160, y); ctx.stroke(); }
  } else {
    const c = A.climate;
    const pal = c === 'icy' ? [[150, 175, 205], [205, 222, 240]] : c === 'lava' ? [[34, 22, 22], [60, 38, 34]] : c === 'scorched' ? [[120, 70, 45], [170, 105, 60]] : c === 'temperate' ? [[70, 70, 80], [110, 98, 90]] : [[80, 76, 90], [120, 110, 112]];
    const layers = 4;
    for (let L = 0; L < layers; L++) {
      const k = L / (layers - 1); const base = horizon + k * (SH - horizon) * 0.55 - (L === 0 ? 20 : 0);
      const amp = L === 0 ? 260 : 160 - L * 20; const pts = ridge(r, SW, base, amp, c === 'icy' ? 0.5 : 0.58, 9);
      const col = mix(mix(pal[0], pal[1], k), [8, 10, 24], 0.55 - k * 0.15 - bright * 0.25);
      fillRidge(ctx, pts, SH, rgb(col));
      // rim light on the sun side
      ctx.strokeStyle = rgb(mix(lit, [255, 255, 255], 0.2), 0.12 + bright * 0.35 * (1 - k * 0.5)); ctx.lineWidth = 2.5 - k; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
      if (c === 'lava' && L > 0) for (let i = 0; i < 26 + L * 12; i++) {   // glowing cracks
        let x = r() * SW, y = base + 40 + r() * (SH - base); ctx.strokeStyle = `rgba(255,${120 + r() * 80 | 0},40,${0.5 + r() * 0.4})`; ctx.lineWidth = 1 + r() * (1.5 + L); ctx.shadowColor = 'rgba(255,110,30,.9)'; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.moveTo(x, y); for (let s = 0; s < 6; s++) { x += (r() - 0.5) * 90; y += (r() - 0.3) * 30; ctx.lineTo(x, y); } ctx.stroke(); ctx.shadowBlur = 0;
      }
    }
    if (c === 'temperate') {   // a still pool reflecting the sun (water is a hope, not a measurement)
      const px = Math.min(SW - 260, sunX + 30), py = SH * 0.8, pw = 440, ph = 60;
      ctx.save(); ctx.beginPath(); ctx.ellipse(px, py, pw / 2, ph / 2, 0, 0, Math.PI * 2); ctx.clip();
      const wg = ctx.createLinearGradient(0, py - ph / 2, 0, py + ph / 2); wg.addColorStop(0, rgb(mix(mid, low, 0.5))); wg.addColorStop(1, rgb(mix(top, mid, 0.5))); ctx.fillStyle = wg; ctx.fillRect(px - pw / 2, py - ph / 2, pw, ph);
      for (let i = 0; i < 40; i++) { ctx.fillStyle = rgb(mix(sc, [255, 255, 255], 0.5), 0.5); ctx.fillRect(px - 30 + (r() - 0.5) * 90, py - ph / 2 + r() * ph, 30 + r() * 40, 2); }
      ctx.restore();
    }
    if (c === 'icy') for (let i = 0; i < 160; i++) { const x = r() * SW, y = horizon + 40 + r() * (SH - horizon); ctx.fillStyle = rgb(mix(sc, [255, 255, 255], 0.7), 0.3 + r() * 0.5); ctx.fillRect(x, y, 2, 2); }
    if (c === 'lava') { const g = ctx.createLinearGradient(0, horizon - 120, 0, horizon + 60); g.addColorStop(0, 'rgba(255,90,30,0)'); g.addColorStop(1, 'rgba(255,100,40,.35)'); ctx.fillStyle = g; ctx.fillRect(0, horizon - 120, SW, 180); }
  }
  // a little silhouette for scale: Nova's flag (a tiny gold pennant) on the near ground
  if (A.kind !== 'giant' && A.kind !== 'subneptune') { const fx = SW * 0.9, fy = SH * 0.93; ctx.strokeStyle = 'rgba(232,193,90,.9)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 90); ctx.stroke(); ctx.fillStyle = 'rgba(200,50,58,.95)'; ctx.beginPath(); ctx.moveTo(fx, fy - 90); ctx.lineTo(fx + 46, fy - 78); ctx.lineTo(fx, fy - 64); ctx.fill(); }
  // vignette + grain
  const vg = ctx.createRadialGradient(SW / 2, SH * 0.55, SH * 0.35, SW / 2, SH * 0.55, SW * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(3,4,14,.55)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, SW, SH);
  for (let i = 0; i < 2600; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.05)'; ctx.fillRect(r() * SW, r() * SH, 2, 2); }
  ctx.restore();
  // ---- frame, lettering, stamp, postmark
  ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(SX - 12, SY - 12, SW + 24, SH + 24, 20); ctx.stroke();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(232,193,90,.6)'; ctx.beginPath(); ctx.roundRect(SX + 10, SY + 10, SW - 20, SH - 20, 10); ctx.stroke();
  const lx = SX + 70, ly = SY + SH - 70;
  text(ctx, 'Greetings from', lx, ly - 150, { size: 64, style: 'italic', color: GOLD2, shadow: 18 });
  let size = 150; ctx.save(); ctx.font = `bold ${size}px ${SERIF}`; while (ctx.measureText(p.name).width > SW * 0.78 && size > 70) { size -= 6; ctx.font = `bold ${size}px ${SERIF}`; } ctx.restore();
  ctx.save(); ctx.font = `bold ${size}px ${SERIF}`; ctx.lineJoin = 'round'; ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(7,11,28,.85)'; ctx.strokeText(p.name, lx, ly - 22);
  const tg = ctx.createLinearGradient(0, ly - 22 - size, 0, ly - 22); tg.addColorStop(0, '#fff2c4'); tg.addColorStop(0.5, GOLD2); tg.addColorStop(1, '#c99a2e'); ctx.fillStyle = tg; ctx.fillText(p.name, lx, ly - 22); ctx.restore();
  const sub = [p.hostname + (A.suns > 1 ? (A.circumbinary ? ' · two suns' : ` · ${A.suns}-star system`) : ''), has(A.lightYears) ? `${nf(A.lightYears, A.lightYears < 10 ? 1 : 0)} light-years from home` : 'distance unknown'].join('  ·  ');
  text(ctx, sub.toUpperCase(), lx + 4, ly + 30, { size: 30, color: IVORY, spacing: 3, shadow: 12 });
  drawStamp(ctx, SX + SW - 70 - 230, SY + 60, 230, 270, p, A, r);
  drawPostmark(ctx, SX + SW - 70 - 300, SY + 150, date);
  ctx.restore();
  return A;
}
function drawStamp(ctx, x, y, w, h, p, A, r) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(0.03);
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 16;
  ctx.fillStyle = IVORY; ctx.beginPath();                 // perforated edge
  const t = 9; ctx.rect(0, 0, w, h); ctx.fill(); ctx.shadowBlur = 0;
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = t; i < w; i += 2 * t) { ctx.beginPath(); ctx.arc(i, 0, t / 2, 0, 7); ctx.arc(i, h, t / 2, 0, 7); ctx.fill(); }
  for (let j = t; j < h; j += 2 * t) { ctx.beginPath(); ctx.arc(0, j, t / 2, 0, 7); ctx.arc(w, j, t / 2, 0, 7); ctx.fill(); }
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#0f1733'; ctx.fillRect(14, 14, w - 28, h - 28);
  const cx = w / 2, cy = h * 0.43, sr = 38;
  const g = ctx.createRadialGradient(cx + 30, cy - 20, 4, cx + 30, cy - 20, 120); g.addColorStop(0, rgb(A.color, 0.9)); g.addColorStop(1, rgb(A.color, 0)); ctx.fillStyle = g; ctx.fillRect(14, 14, w - 28, h - 28);
  ctx.fillStyle = rgb(mix(A.color, [255, 255, 255], 0.5)); ctx.beginPath(); ctx.arc(cx + 34, cy - 24, 20, 0, 7); ctx.fill();
  const pc = A.kind === 'giant' ? [214, 170, 120] : A.climate === 'icy' ? [190, 210, 235] : A.climate === 'lava' ? [200, 80, 40] : A.kind === 'subneptune' ? [110, 160, 200] : [160, 130, 110];
  ctx.fillStyle = rgb(pc); ctx.beginPath(); ctx.arc(cx - 16, cy + 18, sr, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(5,6,20,.55)'; ctx.beginPath(); ctx.arc(cx - 26, cy + 26, sr, 0, 7); ctx.fill();
  ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.strokeRect(20, 20, w - 40, h - 40);
  text(ctx, 'STAR DOCK POST', cx, h - 54, { size: 19, color: GOLD, align: 'center', weight: 'bold', spacing: 1 });
  text(ctx, '11\u00a2', 30, 56, { size: 32, color: GOLD2, weight: 'bold' });
  text(ctx, p.pl_letter ? p.hostname.slice(0, 14) : '', cx, h - 30, { size: 15, color: 'rgba(239,230,210,.8)', align: 'center' });
  ctx.restore();
}
function drawPostmark(ctx, x, y, date) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.18); ctx.strokeStyle = 'rgba(200,50,58,.85)'; ctx.fillStyle = 'rgba(200,50,58,.85)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(0, 0, 92, 0, 7); ctx.stroke(); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 70, 0, 7); ctx.stroke();
  const d = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  text(ctx, d, 0, 8, { size: 21, color: 'rgba(200,50,58,.9)', align: 'center', weight: 'bold' });
  ctx.font = `bold 18px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const arcText = (s, rad, center, bottom) => {   // letters along the ring, upright, reading left to right
    const ws = [...s].map(ch => ctx.measureText(ch).width + 3), span = ws.reduce((a, b) => a + b, 0) / rad;
    let a = bottom ? center + span / 2 : center - span / 2;
    [...s].forEach((ch, i) => { const step = ws[i] / rad; const m = bottom ? a - step / 2 : a + step / 2;
      ctx.save(); ctx.translate(Math.sin(m) * rad, -Math.cos(m) * rad); ctx.rotate(bottom ? m - Math.PI : m); ctx.fillText(ch, 0, 0); ctx.restore();
      a = bottom ? a - step : a + step; });
  };
  arcText('STAR DOCK', 80, 0, false); arcText('NOVA\u2019S GARDEN', 80, Math.PI, true);
  ctx.lineWidth = 3.5; for (let k = 0; k < 4; k++) { ctx.beginPath(); for (let i = 0; i <= 26; i++) { const xx = -104 - i * 8, yy = -36 + k * 24 + Math.sin(i / 3) * 7; i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); } ctx.stroke(); }
  ctx.restore();
}

export function paintBack(ctx, p, meta, { W = CARD_W, H = CARD_H, to = '', message = '', date = new Date() } = {}) {
  const A = analyse(p), r = rng(p.id + 'back');
  ctx.save(); ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0f1733'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 3000; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.06)'; ctx.fillRect(r() * W, r() * H, 2, 2); }
  ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(22, 22, W - 44, H - 44, 20); ctx.stroke();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(232,193,90,.5)'; ctx.beginPath(); ctx.roundRect(40, 40, W - 80, H - 80, 12); ctx.stroke();
  const div = W * 0.6;
  ctx.strokeStyle = 'rgba(232,193,90,.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(div, 110); ctx.lineTo(div, H - 150); ctx.stroke();
  text(ctx, 'POST CARD', W / 2, 92, { size: 34, color: GOLD, align: 'center', weight: 'bold', spacing: 12 });
  // left: facts and notes
  const L = 90, LW = div - L - 60; let y = 160;
  text(ctx, `Postcard from ${p.name}`, L, y, { size: 46, color: GOLD2, style: 'italic' }); y += 26;
  const F = facts(p, A); let fs = 27, lh = 36;
  const fit = () => { ctx.save(); ctx.font = `${fs}px ${SERIF}`; const n = F.reduce((s, f) => s + wrap(ctx, f, LW - 34).length, 0); ctx.restore(); return n * lh; };
  const budget = message ? 520 : 610; while (fit() > budget && fs > 19) { fs -= 1; lh = Math.round(fs * 1.3); }
  y += 30;
  for (const f of F) { text(ctx, '✦', L, y, { size: fs * 0.8, color: GOLD }); y = para(ctx, f, L + 34, y, LW - 34, lh, { size: fs, color: IVORY }) + 6; }
  y += 14;
  ctx.strokeStyle = 'rgba(232,193,90,.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(L, y - 8); ctx.lineTo(div - 60, y - 8); ctx.stroke(); y += 30;
  const noteSize = Math.max(22, fs);
  y = para(ctx, novaNote(p, A), L, y, LW, Math.round(noteSize * 1.32), { size: noteSize, color: GOLD2, style: 'italic' });
  text(ctx, '\u2014 Nova', L + LW - 10, y + 6, { size: noteSize + 4, color: GOLD, style: 'italic', align: 'right' }); y += 40;
  if (message) { y = para(ctx, `\u201C${message}\u201D`, L, y + 6, LW, Math.round(noteSize * 1.32), { size: noteSize, color: IVORY, style: 'italic' }); }
  // right: stamp box + address
  const RX = div + 60, RW = W - RX - 90;
  ctx.strokeStyle = 'rgba(232,193,90,.7)'; ctx.setLineDash([8, 7]); ctx.lineWidth = 2; ctx.strokeRect(W - 90 - 190, 110, 190, 220); ctx.setLineDash([]);
  drawStamp(ctx, W - 90 - 178, 122, 166, 196, p, A, r);
  drawPostmark(ctx, W - 90 - 250, 230, date);
  const addrY = 520, gap = 92; const lines = [to ? `To: ${to}` : 'To: a friend on Earth', 'Planet Earth', 'The Solar System', 'Orion Arm, Milky Way'];
  lines.forEach((s, i) => { const yy = addrY + i * gap; ctx.strokeStyle = 'rgba(232,193,90,.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(RX, yy + 14); ctx.lineTo(RX + RW, yy + 14); ctx.stroke();
    let sz = i === 0 ? 40 : 34; ctx.save(); ctx.font = `italic ${sz}px ${SERIF}`; while (ctx.measureText(s).width > RW && sz > 18) { sz -= 2; ctx.font = `italic ${sz}px ${SERIF}`; } ctx.restore();
    text(ctx, s, RX + 6, yy, { size: sz, color: i === 0 ? GOLD2 : IVORY, style: 'italic' }); });
  text(ctx, `Delivery time at light speed: ${has(A.lightYears) ? nf(A.lightYears, A.lightYears < 10 ? 1 : 0) + ' years' : 'unknown'}`, RX + 6, addrY + 4 * gap + 10, { size: 22, color: 'rgba(239,230,210,.75)' });
  // footer: credit
  const q = meta?.queried ? new Date(meta.queried).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  text(ctx, `Data: NASA Exoplanet Archive, Planetary Systems Composite Parameters${q ? ` (queried ${q})` : ''}. exoplanetarchive.ipac.caltech.edu`, W / 2, H - 104, { size: 21, color: 'rgba(239,230,210,.8)', align: 'center' });
  const est = F.some(f => f.includes('*')) ? '* estimated by the archive from other measurements.  ' : '';
  text(ctx, `${est}"No-air" temperature = equilibrium temperature. The sky is painted from these numbers; rock, sea and cloud colours are Nova's imagination.`, W / 2, H - 72, { size: 18, color: 'rgba(170,176,200,.85)', align: 'center' });
  text(ctx, 'nova-in-the-garden.github.io  ·  Star Dock', W / 2, H - 46, { size: 18, color: 'rgba(232,193,90,.7)', align: 'center' });
  ctx.restore();
}

// ---------- the overlay ----------
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DRAFT = 'nova.postcard.draft';
export function createPostcardMaker(data, { onOpen, onClose } = {}) {
  const planets = data?.planets || [];
  const el = document.createElement('div'); el.id = 'postcards'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Exoplanet Postcard Maker');
  const kindLabel = p => { const A = analyse(p); return A.kind === 'giant' ? `gas giant, ${A.climate}` : A.kind === 'subneptune' ? 'sub-Neptune' : `rocky, ${A.climate}`; };
  el.innerHTML = `<div class="pc-bar"><h2>🪐 Exoplanet Postcard Maker</h2><span class="pc-sub">${planets.length} real planets · NASA Exoplanet Archive</span><button class="pc-x" aria-label="Close (Esc)">×</button></div>
    <div class="pc-body">
      <aside class="pc-pick"><input class="pc-search" type="search" placeholder="Search planets…" aria-label="Search planets"><select class="pc-select" aria-label="Choose a planet">${planets.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>
        <ul class="pc-list">${planets.map(p => `<li><button data-id="${esc(p.id)}"><b>${esc(p.name)}</b><span>${has(p.sy_dist) ? nf(p.sy_dist * LY_PER_PC, p.sy_dist * LY_PER_PC < 10 ? 1 : 0) + ' ly · ' : ''}${esc(kindLabel(p))}</span></button></li>`).join('')}</ul></aside>
      <main class="pc-main">
        <div class="pc-card" tabindex="0" role="button" aria-label="Postcard. Click or tap to flip"><div class="pc-flip"><canvas class="pc-front" width="${CARD_W}" height="${CARD_H}"></canvas><canvas class="pc-back" width="${CARD_W}" height="${CARD_H}"></canvas></div></div>
        <p class="pc-hint">Click or tap the card to flip it over.</p>
        <div class="pc-fields"><label>To <input class="pc-to" maxlength="40" placeholder="a friend on Earth"></label><label>Your message <textarea class="pc-msg" maxlength="180" rows="2" placeholder="Wish you were here!"></textarea></label><p class="pc-local">Your words stay on this device. Nothing is sent anywhere.</p></div>
        <div class="pc-actions"><button class="pill gold pc-flipbtn">⟲ Flip</button><button class="pill pc-dl-front">⬇ Front PNG</button><button class="pill pc-dl-back">⬇ Back PNG</button><button class="pill pc-share">↗ Share</button><button class="pill pc-copy">🔗 Copy link</button></div>
        <p class="pc-status" aria-live="polite"></p>
      </main>
    </div>`;
  document.body.appendChild(el);
  const $ = s => el.querySelector(s);
  const front = $('.pc-front'), back = $('.pc-back'), card = $('.pc-card');
  let cur = null, flipped = false, open = false, renderT = 0;
  try { const d = JSON.parse(localStorage.getItem(DRAFT) || '{}'); $('.pc-to').value = d.to || ''; $('.pc-msg').value = d.message || ''; } catch { /* ignore */ }
  const draft = () => ({ to: $('.pc-to').value.trim(), message: $('.pc-msg').value.trim() });
  function paint() {
    if (!cur) return; const t0 = performance.now();
    paintFront(front.getContext('2d'), cur); paintBack(back.getContext('2d'), cur, data, draft());
    renderT = performance.now() - t0;
  }
  function select(id) {
    cur = planets.find(p => p.id === id) || planets[0]; if (!cur) return;
    el.querySelectorAll('.pc-list [data-id]').forEach(b => { const on = b.dataset.id === cur.id; b.classList.toggle('on', on); if (on && open) b.scrollIntoView({ block: 'nearest' }); });
    $('.pc-select').value = cur.id; setFlip(false); paint(); status('');
  }
  function setFlip(f) { flipped = f; card.classList.toggle('flipped', f); card.setAttribute('aria-label', f ? 'Postcard back. Click or tap to flip' : 'Postcard front. Click or tap to flip'); }
  function status(s) { $('.pc-status').textContent = s; }
  const link = () => `${location.origin}${location.pathname}?planet=${encodeURIComponent(cur.id)}`;
  const fileName = side => `postcard-${cur.id}-${side}.png`;
  const blobOf = c => new Promise(res => c.toBlob(res, 'image/png'));
  async function download(side) {
    const b = await blobOf(side === 'front' ? front : back); const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = fileName(side); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    status(`Saved ${fileName(side)} (${CARD_W}×${CARD_H}).`);
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(link()); status('Link copied: ' + link()); }
    catch { status('Copy this link: ' + link()); }
  }
  async function share() {
    try {
      const file = new File([await blobOf(front)], fileName('front'), { type: 'image/png' });
      const payload = { title: `Greetings from ${cur.name}`, text: `A postcard from ${cur.name}, painted by Nova from real NASA data.`, url: link() };
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ ...payload, files: [file] }); status('Shared!'); return; }
      if (navigator.share) { await navigator.share(payload); status('Shared!'); return; }
    } catch (e) { if (e?.name === 'AbortError') return; }
    copyLink();
  }
  card.onclick = () => setFlip(!flipped);
  card.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFlip(!flipped); } };
  $('.pc-flipbtn').onclick = () => setFlip(!flipped);
  $('.pc-dl-front').onclick = () => download('front'); $('.pc-dl-back').onclick = () => download('back');
  $('.pc-share').onclick = share; $('.pc-copy').onclick = copyLink;
  $('.pc-x').onclick = () => close();
  el.querySelectorAll('.pc-list [data-id]').forEach(b => b.onclick = () => select(b.dataset.id));
  $('.pc-select').onchange = e => select(e.target.value);
  $('.pc-search').oninput = e => { const q = e.target.value.toLowerCase(); el.querySelectorAll('.pc-list li').forEach(li => { li.hidden = q && !li.textContent.toLowerCase().includes(q); }); };
  let typing = 0;
  for (const f of [$('.pc-to'), $('.pc-msg')]) f.oninput = () => { localStorage.setItem(DRAFT, JSON.stringify(draft())); clearTimeout(typing); typing = setTimeout(() => { paintBack(back.getContext('2d'), cur, data, draft()); if (!flipped) setFlip(true); }, 250); };
  addEventListener('keydown', e => {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    if (e.target.closest?.('#postcards input, #postcards textarea, #postcards select')) { e.stopImmediatePropagation(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { const i = planets.indexOf(cur) + (e.key === 'ArrowDown' ? 1 : -1); select(planets[(i + planets.length) % planets.length].id); e.preventDefault(); }
    else if (e.key === 'f' || e.key === 'F') setFlip(!flipped);
    e.stopImmediatePropagation();
  }, true);
  function openMaker(id) {
    open = true; el.hidden = false; document.body.classList.add('pc-open'); onOpen?.();
    select(id || cur?.id || 'trappist-1-e'); $('.pc-x').focus({ preventScroll: true });
  }
  function close() { if (!open) return; open = false; el.hidden = true; document.body.classList.remove('pc-open'); onClose?.(); }
  return { open: openMaker, close, select, get isOpen() { return open; }, get current() { return cur; }, get flipped() { return flipped; }, get renderMs() { return renderT; }, planets, front, back, paint };
}

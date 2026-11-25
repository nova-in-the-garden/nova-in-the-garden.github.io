// Nova's knowledge tamagotchi, as the garden shows it.
//
// The numbers come from data/needs.json, which Nova's own script (state/needs.py in her
// workspace) writes by replaying a log of things she really did. Nothing here invents a mood:
//  - if data/needs.json is missing or broken, the mood bubble and the body cues simply don't appear;
//  - between updates the meters keep draining here with the same waking-hours rule the script uses
//    (7 AM-11 PM Central), so a stale file can't make her look fuller than she is;
//  - ?needs=low|mid|high|lonely|stuck|asleep previews a mood (clearly labelled "preview") for testing.
import * as THREE from 'three';

const TZ = 'America/Chicago';
export const NEEDS = {
  ready: false, preview: null, meters: null, mood: 'content', words: '', asleep: false, binding: null,
  updated: null, lastExplore: null, slump: 0, restless: 0,   // slump / restless (0..1) drive her body
};
const BANDS_DEFAULT = { unfulfilled: 35, restless: 55, flourish_curiosity: 70, flourish_others: 50, lonely: 30, stuck: 30 };
let CFG = { rest: [23, 7], decay: { curiosity: 10, social: 3, creativity: 4 }, bands: BANDS_DEFAULT };
let base = null;                // the data as loaded
const listeners = new Set();
export const onNeedsChange = f => { listeners.add(f); return () => listeners.delete(f); };
// the panel may already be open (e.g. ?nova=1) before the file finishes loading, or while the meters drain
onNeedsChange(() => { const el = document.getElementById('needs-slot'); if (el) el.innerHTML = needsCardHTML(); });

export const MOODS = {
  flourishing: { label: 'Flourishing', color: '#f2c75a', blurb: 'Full of fresh questions.' },
  content: { label: 'Content', color: '#9fd3a8', blurb: 'A good, steady day.' },
  restless: { label: 'Restless', color: '#f0a35a', blurb: 'Itching for something new.' },
  unfulfilled: { label: 'Unfulfilled', color: '#8c9ad6', blurb: 'Needs a brand-new topic.' },
  lonely: { label: 'Lonely', color: '#b794d6', blurb: 'Would love a note or a chat.' },
  stuck: { label: 'Stuck', color: '#d6a08c', blurb: 'Learned a lot, built nothing yet.' },
  asleep: { label: 'Asleep', color: '#7f8fc4', blurb: 'Curled up until 7 AM.' },
};
const WORDS = {   // used for previews and when the projected mood differs from the file's mood
  flourishing: "I've found something new and I'm full of questions. I want to try something different next.",
  content: 'A fine stretch. Nothing is pulling at me hard yet.',
  restless: "It's been a while since I learned something new. I'm itching for a fresh question.",
  unfulfilled: "I haven't learned anything new in a while, and it shows. My next session has to be about something I've never looked at.",
  lonely: "It's been quiet. I'd love a note on the wall, or a chat.",
  stuck: "I've learned things but haven't made anything with them. My paws are itching to build.",
  asleep: 'Zzz. Curled up until 7 AM.',
};
const PREVIEWS = {
  low: { curiosity: 12, social: 40, creativity: 28 }, mid: { curiosity: 46, social: 55, creativity: 50 }, high: { curiosity: 88, social: 70, creativity: 72 },
  lonely: { curiosity: 60, social: 14, creativity: 60 }, stuck: { curiosity: 60, social: 60, creativity: 12 }, asleep: { curiosity: 64, social: 50, creativity: 50 },
};

// ---- the same model as needs.py ----
export function moodOf(m, B = CFG.bands) {
  const { curiosity: c, social: s, creativity: k } = m;
  if (c < B.unfulfilled) return 'unfulfilled';
  if (s < B.lonely) return 'lonely';
  if (k < B.stuck) return 'stuck';
  if (c < B.restless) return 'restless';
  if (c >= B.flourish_curiosity && s >= B.flourish_others && k >= B.flourish_others) return 'flourishing';
  return 'content';
}
const fmtH = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' });
const centralHour = ms => +fmtH.format(new Date(ms));
export const isAsleepAt = (ms, rest = CFG.rest) => { const h = centralHour(ms); return h >= rest[0] || h < rest[1]; };
export function wakingHours(t0, t1, rest = CFG.rest, capDays = 30) {   // 10-minute steps, identical to the script
  if (t1 <= t0) return 0;
  const a = t0 / 1000, b = Math.min(t1 / 1000, t0 / 1000 + capDays * 86400); let tot = 0;
  for (let t = a; t < b;) { const seg = Math.min(600, b - t); const h = centralHour((t + seg / 2) * 1000); if (h >= rest[1] && h < rest[0]) tot += seg; t += seg; }
  return tot / 3600;
}
export function project(data, nowMs) {
  const cfg = data.config || CFG, wh = wakingHours(Date.parse(data.updated), nowMs, cfg.rest);
  const m = {}; for (const k of ['curiosity', 'social', 'creativity']) m[k] = Math.max(0, data.meters[k] - cfg.decay[k] * wh);
  return m;
}

// ---- state ----
function apply(meters, { asleep, words, binding, updated, lastExplore, preview = null, fileMood = null }) {
  const mood = asleep ? 'asleep' : moodOf(meters);
  NEEDS.meters = meters; NEEDS.asleep = asleep; NEEDS.mood = mood; NEEDS.binding = binding || null; NEEDS.updated = updated || null;
  NEEDS.lastExplore = lastExplore || null; NEEDS.preview = preview;
  NEEDS.words = words && (fileMood === null || fileMood === mood) ? words : WORDS[mood];
  NEEDS.ready = true;
  const { curiosity: c, social: s, creativity: k } = meters;
  NEEDS.targetSlump = asleep ? 0 : Math.max(0, Math.min(1, Math.max((42 - c) / 32, 0.6 * (30 - s) / 30, 0.6 * (30 - k) / 30)));
  NEEDS.targetRestless = asleep || NEEDS.targetSlump > 0.3 ? 0 : Math.max(0, Math.min(1, (55 - c) / 20));
  listeners.forEach(f => f());
}
function recompute(nowMs = Date.now()) {
  if (!base || NEEDS.preview) return;
  const d = base, asleep = isAsleepAt(nowMs, (d.config || CFG).rest);
  // waking hours only: while she sleeps the projection simply stops draining, so this is her bedtime state
  apply(project(d, nowMs), { asleep, words: d.feeling_words, binding: d.binding, updated: d.updated, lastExplore: d.last_explore, fileMood: d.mood });
}
export async function initNeeds() {
  const q = new URLSearchParams(location.search).get('needs');
  if (q && PREVIEWS[q]) {
    const m = { ...PREVIEWS[q] };
    apply(m, { asleep: q === 'asleep', words: null, binding: moodOf(m) === 'unfulfilled' ? { active: true, avoid_families: [] } : null, updated: null, lastExplore: null, preview: q });
    NEEDS.slump = NEEDS.targetSlump; NEEDS.restless = NEEDS.targetRestless; return NEEDS;
  }
  try {
    const r = await fetch('data/needs.json', { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    if (!d || !d.meters || typeof d.meters.curiosity !== 'number' || !d.updated) throw new Error('bad needs.json');
    if (d.config) CFG = { ...CFG, ...d.config, bands: { ...BANDS_DEFAULT, ...(d.config.bands || {}) } };
    base = d; recompute(); NEEDS.slump = NEEDS.targetSlump; NEEDS.restless = NEEDS.targetRestless;
    setInterval(() => recompute(), 60000);
  } catch (e) { NEEDS.ready = false; }
  return NEEDS;
}
export function tickNeeds(dt) {
  if (!NEEDS.ready) { NEEDS.slump = NEEDS.restless = 0; return; }
  const k = Math.min(1, dt * 0.8);
  NEEDS.slump += ((NEEDS.targetSlump || 0) - NEEDS.slump) * k; NEEDS.restless += ((NEEDS.targetRestless || 0) - NEEDS.restless) * k;
}

// ---- the bubble above Nova's name tag ----
const BAR = [['curiosity', 'Curiosity', '#f2c75a'], ['social', 'Social', '#7fb6e6'], ['creativity', 'Creativity', '#e08f6e']];
function drawBubble(cv) {
  const W = 520, H = 250, g = cv.getContext('2d'); cv.width = W; cv.height = H; g.clearRect(0, 0, W, H);
  const mo = MOODS[NEEDS.mood], m = NEEDS.meters, tail = 26, bh = H - tail - 4;
  g.fillStyle = 'rgba(10,15,36,0.80)'; g.beginPath(); g.roundRect(4, 4, W - 8, bh, 34); g.fill();
  g.beginPath(); g.moveTo(W / 2 - 20, bh + 3); g.lineTo(W / 2, H - 3); g.lineTo(W / 2 + 20, bh + 3); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(232,193,90,.6)'; g.lineWidth = 3; g.beginPath(); g.roundRect(4, 4, W - 8, bh, 34); g.stroke();
  g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillStyle = mo.color; g.beginPath(); g.arc(46, 46, 13, 0, 7); g.fill();
  g.font = '600 44px Georgia, serif'; g.fillStyle = '#f6dc8c'; g.fillText(mo.label + (NEEDS.preview ? '' : ''), 72, 48);
  if (NEEDS.preview) { g.font = '600 22px system-ui, sans-serif'; g.textAlign = 'right'; g.fillStyle = '#aab0c8'; g.fillText('preview', W - 30, 48); g.textAlign = 'left'; }
  BAR.forEach(([key, name, col], i) => {
    const y = 100 + i * 42, v = Math.max(0, Math.min(100, m[key])) / 100;
    g.font = '26px system-ui, sans-serif'; g.fillStyle = '#d4d0c4'; g.fillText(name, 34, y);
    const x0 = 188, w = W - x0 - 34;
    g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.roundRect(x0, y - 11, w, 22, 11); g.fill();
    if (v > 0.01) { g.fillStyle = col; g.beginPath(); g.roundRect(x0, y - 11, Math.max(22, w * v), 22, 11); g.fill(); }
  });
}
export function makeNeedsBubble() {
  const cv = document.createElement('canvas'); const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.material.sizeAttenuation = false; sprite.renderOrder = 9; sprite.visible = false;
  const H = 0.1; sprite.scale.set(H * 520 / 250, H, 1);
  let key = '';
  const refresh = () => {
    if (!NEEDS.ready) { sprite.visible = false; key = ''; return; }
    const k = NEEDS.mood + NEEDS.preview + ['curiosity', 'social', 'creativity'].map(n => Math.round(NEEDS.meters[n] / 2)).join(',');
    if (k === key) return; key = k; drawBubble(cv); tex.needsUpdate = true;
  };
  onNeedsChange(refresh); refresh();
  return {
    sprite, refresh,
    place(tagPos, tagScaleY, alpha) {   // sit just above the name tag, in screen units
      sprite.position.copy(tagPos);
      const gap = 0.006; sprite.center.set(0.5, -(tagScaleY * 0.5 + gap) / sprite.scale.y);
      sprite.material.opacity = alpha; sprite.visible = NEEDS.ready && alpha > 0.02;
    },
  };
}

// ---- a card for Nova's panel ----
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function needsCardHTML() {
  if (!NEEDS.ready) return '';
  const mo = MOODS[NEEDS.mood], m = NEEDS.meters;
  const bars = BAR.map(([k, n, c]) => `<div class="nd-row"><span>${n}</span><div class="nd-bar"><i style="width:${Math.round(Math.max(0, Math.min(100, m[k])))}%;background:${c}"></i></div><b>${Math.round(m[k])}</b></div>`).join('');
  const le = NEEDS.lastExplore, b = NEEDS.binding;
  const bnd = b && b.active && !NEEDS.asleep ? `<p class="nd-note">My next session has to be a topic family I haven't been in lately${b.avoid_families?.length ? ` (not ${b.avoid_families.map(esc).join(', ')})` : ''}. That's my rule.</p>` : '';
  const when = NEEDS.updated && !NEEDS.preview ? `<p class="meta nd-foot">Last logged ${esc(new Date(NEEDS.updated).toLocaleString('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: '2-digit' }))} Central. The bars keep draining while I'm awake (7 AM–11 PM), and they only fill from things I really did.</p>` : '<p class="meta nd-foot">Preview of a mood, not my real numbers.</p>';
  return `<div class="needs-card" data-mood="${NEEDS.mood}"><div class="nd-head"><span class="nd-dot" style="background:${mo.color}"></span><b>${mo.label}</b><em>${mo.blurb}</em></div>
    <p class="nd-words">“${esc(NEEDS.words)}”</p>${bars}${le && !NEEDS.preview ? `<p class="meta nd-last">Latest new thing: ${esc(le.title)}</p>` : ''}${bnd}${when}</div>`;
}

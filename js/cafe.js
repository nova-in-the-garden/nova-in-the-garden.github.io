// The Corner Cafe: a little coffee-making game behind the bar.
// Customers (Lorenz and friends) walk up with an order; you build the drink step by step
// (cup -> espresso -> milk -> syrup -> topping -> serve) and watch it fill the glass. Stars for getting
// it right (plus one for speed), coins in the tip jar, 11 customers make a day.
// Everything is drawn on one 2D canvas; the 3D world sleeps while the cafe is open.
import { cafeSpecialOn, holidayNow } from './holiday.js';

export const MENU = [
  { id: 'icedCaramelMacchiato', name: 'Iced Caramel Macchiato', fav: true, cup: 'iced', syrups: ['vanilla'], milk: 'cold', shots: 2, toppings: ['caramel'], shotsOnTop: true,
    recipe: 'Iced cup · vanilla syrup · cold milk · then 2 shots poured on top (that’s the “mark”) · caramel drizzle' },
  { id: 'icedFrenchVanillaLatte', name: 'Iced French Vanilla Latte', fav: true, cup: 'iced', syrups: ['frenchVanilla'], milk: 'cold', shots: 2, toppings: [],
    recipe: 'Iced cup · French vanilla syrup · 2 shots · cold milk' },
  { id: 'caramelLatte', name: 'Caramel Latte', cup: 'hot', syrups: ['caramel'], milk: 'steamed', shots: 2, toppings: [],
    recipe: 'Hot glass · caramel syrup · 2 shots · steamed milk' },
  { id: 'mocha', name: 'Mocha', cup: 'hot', syrups: ['mocha'], milk: 'steamed', shots: 2, toppings: ['whip'],
    recipe: 'Hot glass · mocha sauce · 2 shots · steamed milk · whipped cream' },
  { id: 'cappuccino', name: 'Cappuccino', cup: 'hot', syrups: [], milk: 'steamed', shots: 2, toppings: ['foam'],
    recipe: 'Hot glass · 2 shots · steamed milk · a thick cap of milk foam' },
  { id: 'icedMocha', name: 'Iced Mocha', cup: 'iced', syrups: ['mocha'], milk: 'cold', shots: 2, toppings: ['whip'],
    recipe: 'Iced cup · mocha sauce · 2 shots · cold milk · whipped cream' },
  { id: 'doubleEspresso', name: 'Double Espresso', cup: 'hot', syrups: [], milk: null, shots: 2, toppings: [],
    recipe: 'Hot glass · 2 shots · nothing else' },
];
export const CUSTOMERS = [
  { id: 'lorenz', name: 'Lorenz', kind: 'duck', body: '#f2cd3a', accent: '#f08a24', scarf: true },
  { id: 'hazel', name: 'Hazel the hedgehog', kind: 'hedgehog', body: '#c89a6a', accent: '#5a3a24' },
  { id: 'pip', name: 'Pip the bunny', kind: 'bunny', body: '#ece4da', accent: '#e8a0b0' },
  { id: 'ollie', name: 'Ollie the owl', kind: 'owl', body: '#8a6a4a', accent: '#f2cd62' },
  { id: 'rocket', name: 'Rocket the raccoon', kind: 'raccoon', body: '#8a8a96', accent: '#2a2a32' },
  { id: 'fern', name: 'Fern the frog', kind: 'frog', body: '#6ab84a', accent: '#f4ece0' },
  { id: 'maple', name: 'Maple the bear', kind: 'bear', body: '#8a5a34', accent: '#c89a6a' },
];
const SYRUPS = { caramel: ['Caramel', '#c8862a'], vanilla: ['Vanilla', '#efdc9a'], frenchVanilla: ['French vanilla', '#f2c86a'], mocha: ['Mocha', '#4a2414'], spice: ['Harvest spice', '#c86a28'] };
const TOPS = { caramel: 'Caramel drizzle', whip: 'Whipped cream', foam: 'Milk foam' };
export const HARVEST_SPICE = {
  id: 'harvestSpice', name: 'Harvest Spice', seasonal: true, cup: 'hot', syrups: ['spice'], milk: 'steamed', shots: 2, toppings: ['whip'],
  recipe: 'Hot glass · harvest spice syrup · 2 shots · steamed milk · whipped cream'
};
export function getMenu(date) { return cafeSpecialOn(date || holidayNow()) ? [...MENU, HARVEST_SPICE] : MENU.slice(); }
const PER_DAY = 11, SPEEDY = 30;   // seconds for the speed star

export function createCafe({ onOpen, onClose, rnd = Math.random } = {}) {
  const el = document.createElement('div'); el.id = 'cafe'; el.hidden = true;
  el.innerHTML = `
  <div class="cafe-top"><h2>☕ The Corner Cafe</h2><div class="cafe-score"><span class="cafe-day"></span><span class="cafe-stars"></span><span class="cafe-tips"></span></div><button class="pill cafe-close" aria-label="Leave the cafe">✕ Leave</button></div>
  <div class="cafe-stage"><canvas width="900" height="440" aria-label="The coffee bar"></canvas></div>
  <div class="cafe-recipe"></div>
  <div class="cafe-controls">
    <div class="cafe-row" data-step="cup"><b>1 · Cup</b><button data-a="cup" data-v="hot">☕ Hot glass</button><button data-a="cup" data-v="iced">🧊 Iced cup</button></div>
    <div class="cafe-row" data-step="shot"><b>2 · Espresso</b><button data-a="shot">＋ Pull a shot <span class="n-shots"></span></button></div>
    <div class="cafe-row" data-step="milk"><b>3 · Milk</b><button data-a="milk" data-v="steamed">♨️ Steamed</button><button data-a="milk" data-v="cold">🥛 Cold</button></div>
    <div class="cafe-row" data-step="syrup"><b>4 · Syrup</b>${Object.entries(SYRUPS).map(([k, [n, c]]) => `<button data-a="syrup" data-v="${k}"><i style="background:${c}"></i>${n}</button>`).join('')}</div>
    <div class="cafe-row" data-step="top"><b>5 · Topping</b>${Object.entries(TOPS).map(([k, n]) => `<button data-a="top" data-v="${k}">${n}</button>`).join('')}</div>
    <div class="cafe-row cafe-act"><button data-a="toss" class="pill">🗑 Start over</button><button data-a="serve" class="pill gold">🛎 Serve</button></div>
  </div>
  <div class="cafe-end" hidden></div>`;
  document.body.appendChild(el);
  const cv = el.querySelector('canvas'), ctx = cv.getContext('2d');
  const $ = s => el.querySelector(s);
  let open = false, raf = 0, t0 = 0, now = 0;
  const day = { n: 1, served: 0, stars: 0, tips: 0, perfect: 0, log: [] };
  let order = null, cust = null, custT = 0, drink = null, mood = null, bubble = null, pour = null, coins = [], leaving = 0;
  const best = () => { try { return JSON.parse(localStorage.getItem('nova-cafe-best') || 'null'); } catch { return null; } };

  function newDrink() { drink = { cup: null, shots: 0, milk: null, syrups: [], toppings: [], seq: [], layers: [] }; }
  function nextCustomer() {
    if (day.served >= PER_DAY) return endDay();
    // the day opens with Lorenz and the owner's favourite; favourites come up twice as often after that
    const first = day.served === 0;
    cust = first ? CUSTOMERS[0] : CUSTOMERS[1 + Math.floor(rnd() * (CUSTOMERS.length - 1))];
    if (!first && rnd() < 0.25) cust = CUSTOMERS[0];
    const menu = getMenu();
    const pool = menu.flatMap(m => m.fav ? [m, m] : m.seasonal ? [m, m] : [m]);
    order = first ? MENU[0] : pool[Math.floor(rnd() * pool.length)];
    custT = now; leaving = 0; mood = null; newDrink();
    bubble = { who: cust.name, text: `${order.fav ? '' : ''}One ${order.name}, please!` };
    nova(`Hi ${cust.name.split(' ')[0]}! One ${order.name} coming up.`);
    renderUI();
  }
  let novaLine = '', novaT = 0;
  const nova = s => { novaLine = s; novaT = now; };

  // ---------- building the drink ----------
  const VOL = { syrup: 10, shot: 17, cold: 62, steamed: 58, foam: 18 };
  function addLayer(kind, color, h) { drink.layers.push({ kind, color, h, cur: 0 }); }
  function act(a, v) {
    if (!order || mood) return false;
    if (a === 'toss') { newDrink(); nova('Fresh cup. No harm done!'); renderUI(); return true; }
    if (a === 'serve') return serve();
    if (a === 'cup') { if (drink.cup) return false; drink.cup = v; drink.seq.push('cup'); renderUI(); return true; }
    if (!drink.cup) { nova('Pick a cup first!'); return false; }
    if (a === 'shot') { if (drink.shots >= 4) return false; drink.shots++; drink.seq.push('shot'); addLayer('shot', '#3a1e10', VOL.shot); pour = { color: '#3a1e10', t: now, from: 'machine' }; }
    else if (a === 'milk') { if (drink.milk) return false; drink.milk = v; drink.seq.push('milk'); addLayer(v, v === 'cold' ? '#f4ece0' : '#efe0c4', v === 'cold' ? VOL.cold : VOL.steamed); pour = { color: '#f4ece0', t: now, from: 'pitcher' }; }
    else if (a === 'syrup') { if (drink.syrups.includes(v)) return false; drink.syrups.push(v); drink.seq.push('syrup'); addLayer('syrup', SYRUPS[v][1], VOL.syrup); pour = { color: SYRUPS[v][1], t: now, from: 'pump' }; }
    else if (a === 'top') { if (drink.toppings.includes(v)) return false; drink.toppings.push(v); drink.seq.push('top'); if (v === 'foam') addLayer('foam', '#fbf6ec', VOL.foam); }
    renderUI(); return true;
  }
  // how the glass looks: syrup sinks to the bottom; milk poured onto espresso mixes into a latte;
  // espresso poured onto cold milk floats on top (the macchiato "mark")
  function look() {
    const L = drink.layers, out = [];
    const syr = L.filter(l => l.kind === 'syrup'); syr.forEach(l => out.push(l));
    let mixed = null;
    for (const l of L) {
      if (l.kind === 'syrup') continue;
      if ((l.kind === 'cold' || l.kind === 'steamed') && out.some(o => o.kind === 'shot')) {   // milk onto espresso: mix
        const shots = out.filter(o => o.kind === 'shot'); const sh = shots.reduce((s, o) => s + o.cur, 0);
        for (const s of shots) out.splice(out.indexOf(s), 1);
        mixed = { kind: 'latte', color: drink.syrups.includes('mocha') ? '#7a4a30' : drink.syrups.includes('spice') ? '#c48448' : (l.kind === 'cold' ? '#c8a07a' : '#c49470'), cur: l.cur + sh, top: l.kind === 'cold' ? '#e8d8c0' : null }; out.push(mixed);
      } else if (l.kind === 'shot' && mixed && drink.seq.lastIndexOf('shot') > drink.seq.indexOf('milk') && drink.milk !== 'cold') { mixed.cur += l.cur; }
      else out.push(l);
    }
    return out;
  }

  // ---------- scoring ----------
  function grade() {
    const o = order, d = drink, miss = [];
    const same = (a, b) => a.length === b.length && a.every(x => b.includes(x));
    const checks = [
      [d.cup === o.cup, o.cup === 'iced' ? 'it goes in an iced cup' : 'it goes in a hot glass'],
      [d.shots === o.shots, `it takes ${o.shots} shot${o.shots === 1 ? '' : 's'} (you pulled ${d.shots})`],
      [d.milk === o.milk, o.milk ? `it needs ${o.milk} milk` : 'no milk in this one'],
      [same(d.syrups, o.syrups), o.syrups.length ? `syrup: ${o.syrups.map(s => SYRUPS[s][0].toLowerCase()).join(' + ')}` : 'no syrup in this one'],
      [same(d.toppings, o.toppings), o.toppings.length ? `topping: ${o.toppings.map(s => TOPS[s].toLowerCase()).join(' + ')}` : 'no topping on this one'],
    ];
    if (o.shotsOnTop) { const fs = d.seq.indexOf('shot'), m = d.seq.indexOf('milk'); checks.push([fs > m && m >= 0, 'the shots go in last, on top of the milk']); }
    checks.forEach(([ok, why]) => { if (!ok) miss.push(why); });
    const acc = checks.filter(c => c[0]).length / checks.length;
    let stars = acc === 1 ? 4 : acc >= 0.8 ? 3 : acc >= 0.6 ? 2 : acc > 0.3 ? 1 : 0;
    const secs = (now - custT) / 1000, fast = acc === 1 && secs <= SPEEDY; if (fast) stars++;
    return { acc, stars, fast, secs: +secs.toFixed(1), miss };
  }
  function serve() {
    if (!drink.cup) { nova('There’s nothing in the cup yet!'); return false; }
    const g = grade(); mood = { ...g, t: now };
    day.served++; day.stars += g.stars; day.tips += g.stars; if (g.acc === 1) day.perfect++;
    day.log.push({ who: cust.name, drink: order.name, stars: g.stars, secs: g.secs });
    for (let i = 0; i < g.stars; i++) coins.push({ t: now + i * 120 });
    const happy = ['Mmm, perfect!', 'Just how I like it!', 'Quack-tastic!', 'You’re the best barista!'];
    bubble = { who: cust.name, text: g.acc === 1 ? (cust.id === 'lorenz' ? 'Quack-tastic! 🦆' : happy[Math.floor(rnd() * happy.length)]) : g.acc >= 0.6 ? 'Close enough, thank you!' : 'Hmm… that’s not quite it.' };
    nova(g.acc === 1 ? (g.fast ? 'Perfect AND speedy! ✨' : 'Perfect pour! ✨') : `So close! ${g.miss[0][0].toUpperCase() + g.miss[0].slice(1)}.`);
    renderUI(); leaving = now + 2600;
    return g;
  }
  function endDay() {
    order = null; cust = null; bubble = null;
    const b = best(); const isBest = !b || day.stars > b.stars;
    if (isBest) try { localStorage.setItem('nova-cafe-best', JSON.stringify({ stars: day.stars, day: day.n })); } catch {}
    const box = $('.cafe-end'); box.hidden = false;
    box.innerHTML = `<div class="cafe-card"><h3>Closing time! Day ${day.n}</h3><p class="big">${'★'.repeat(Math.round(day.stars / PER_DAY))}${'☆'.repeat(5 - Math.round(day.stars / PER_DAY))}</p>
      <p>${day.served} customers · <b>${day.stars}</b> stars of ${PER_DAY * 5} · ${day.perfect} perfect drinks · 🪙 ${day.tips} in the tip jar</p>
      <p class="muted">${isBest ? 'A new best day! 🎉' : `Best day so far: ${b.stars} stars`}</p>
      <button class="pill gold cafe-again">☀️ Open tomorrow</button></div>`;
    box.querySelector('.cafe-again').onclick = () => { box.hidden = true; Object.assign(day, { n: day.n + 1, served: 0, stars: 0, tips: 0, perfect: 0, log: [] }); coins = []; nextCustomer(); };
    nova('What a day! Lorenz is asleep on the tip jar. 🦆'); renderUI();
  }

  // ---------- UI ----------
  function renderUI() {
    $('.cafe-day').textContent = `Day ${day.n} · customer ${Math.min(day.served + (order && !mood ? 1 : 0), PER_DAY)}/${PER_DAY}`;
    $('.cafe-stars').textContent = `★ ${day.stars}`; $('.cafe-tips').textContent = `🪙 ${day.tips}`;
    $('.cafe-recipe').innerHTML = order ? `<b>${order.fav ? '💛 ' : ''}${order.name}</b><span>${order.recipe}</span>` : '';
    $('.n-shots').textContent = drink?.shots ? `(${drink.shots})` : '';
    el.querySelectorAll('.cafe-controls button[data-a]').forEach(b => {
      const a = b.dataset.a, v = b.dataset.v, d = drink;
      const on = d && ((a === 'cup' && d.cup === v) || (a === 'milk' && d.milk === v) || (a === 'syrup' && d.syrups.includes(v)) || (a === 'top' && d.toppings.includes(v)));
      b.classList.toggle('on', !!on);
      b.disabled = !order || !!mood || (a !== 'cup' && a !== 'toss' && !d?.cup) || (a === 'cup' && !!d?.cup);
    });
  }
  el.addEventListener('click', e => { const b = e.target.closest('button[data-a]'); if (b && !b.disabled) act(b.dataset.a, b.dataset.v); });
  $('.cafe-close').onclick = () => close();
  addEventListener('keydown', e => { if (open && e.key === 'Escape') { e.stopPropagation(); close(); } }, true);

  // ---------- drawing ----------
  const W = 900, H = 440, CUPX = 560, CUPY = 392;
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function drawRoom(t) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#141d40'); g.addColorStop(1, '#0a0f24'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // window with stars and the moon
    ctx.fillStyle = '#060914'; rr(600, 26, 180, 120, 8); ctx.fill(); ctx.strokeStyle = '#6a4a2c'; ctx.lineWidth = 6; ctx.stroke();
    for (let i = 0; i < 22; i++) { const x = 606 + ((i * 73) % 168), y = 32 + ((i * 41) % 108); ctx.fillStyle = `rgba(246,220,140,${0.4 + 0.4 * Math.sin(t * 2 + i)})`; ctx.fillRect(x, y, 2, 2); }
    ctx.fillStyle = '#f6dc8c'; ctx.beginPath(); ctx.arc(748, 58, 13, 0, 7); ctx.fill(); ctx.fillStyle = '#060914'; ctx.beginPath(); ctx.arc(754, 54, 12, 0, 7); ctx.fill();
    ctx.fillStyle = '#6a4a2c'; ctx.fillRect(687, 26, 6, 120); ctx.fillRect(600, 83, 180, 6);
    // chalkboard menu
    ctx.fillStyle = '#1c2a22'; rr(22, 22, 250, 186, 8); ctx.fill(); ctx.strokeStyle = '#8a5a34'; ctx.lineWidth = 7; ctx.stroke();
    const menu = getMenu();
    ctx.fillStyle = '#e8c15a'; ctx.font = 'bold 17px Georgia,serif'; ctx.fillText('The Corner Cafe', 40, 48);
    if (menu.some(m => m.seasonal)) { ctx.fillStyle = '#f6dc8c'; ctx.font = 'italic bold 12px Georgia,serif'; ctx.fillText('★ Today: Harvest Spice', 40, 64); }
    ctx.font = '12.5px system-ui,sans-serif';
    const listY = menu.some(m => m.seasonal) ? 82 : 74;
    const gap = menu.length > 7 ? 16 : 18.5;
    menu.forEach((m, i) => { ctx.fillStyle = order?.id === m.id ? '#f6dc8c' : m.fav ? '#f4d2a0' : m.seasonal ? '#f6dc8c' : '#d8d4c4'; ctx.fillText((m.fav ? '♥ ' : m.seasonal ? '★ ' : '· ') + m.name, 38, listY + i * gap); });
    ctx.fillStyle = '#c8323a'; ctx.font = 'italic 11px Georgia,serif'; ctx.fillText('♥ = the owner’s favourites', 38, 200);
    // string lights
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(290, 18); ctx.quadraticCurveTo(445, 70, 590, 18); ctx.stroke();
    for (let i = 1; i < 11; i++) { const u = i / 11, x = 290 + 300 * u, y = 18 + 2 * 52 * u * (1 - u) * 1.0; const a = 0.6 + 0.4 * Math.sin(t * 3 + i); ctx.fillStyle = i % 3 === 0 ? `rgba(200,50,58,${a})` : `rgba(246,210,122,${a})`; ctx.beginPath(); ctx.arc(x, y + 6, 4.5, 0, 7); ctx.fill(); }
    // shelves with jars
    ctx.fillStyle = '#5a3a24'; ctx.fillRect(300, 150, 260, 7);
    [['#c8862a', 320], ['#efdc9a', 360], ['#f2c86a', 400], ['#4a2414', 440], ['#f4ece0', 490]].forEach(([c, x]) => { ctx.fillStyle = 'rgba(255,255,255,.15)'; rr(x, 112, 28, 38, 5); ctx.fill(); ctx.fillStyle = c; rr(x + 3, 126, 22, 21, 4); ctx.fill(); });
  }
  function drawCounter() {
    ctx.fillStyle = '#4a2e1c'; ctx.fillRect(0, 300, W, 140); ctx.fillStyle = '#6a4228'; ctx.fillRect(0, 292, W, 14);
    ctx.fillStyle = '#e8c15a'; ctx.fillRect(0, 304, W, 2);
    for (let x = 0; x < W; x += 60) { ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(x, 306, 2, 134); }
  }
  function drawMachine(t) {   // the red espresso machine
    const x = 380, y = 200;
    ctx.fillStyle = '#c8323a'; rr(x, y, 120, 100, 10); ctx.fill(); ctx.fillStyle = '#8c1f26'; ctx.fillRect(x, y + 70, 120, 8);
    ctx.fillStyle = '#e8c15a'; rr(x + 10, y - 10, 100, 14, 4); ctx.fill();
    ctx.fillStyle = '#2a2a32'; ctx.fillRect(x + 50, y + 78, 20, 12); ctx.fillRect(x + 24, y + 30, 72, 10);
    ctx.fillStyle = '#f6dc8c'; ctx.beginPath(); ctx.arc(x + 30, y + 18, 7, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(x + 90, y + 18, 7, 0, 7); ctx.fill();
    ctx.strokeStyle = '#2a2a32'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 30, y + 18); ctx.lineTo(x + 30 + 5 * Math.cos(t), y + 18 + 5 * Math.sin(t)); ctx.stroke();
    // syrup pumps
    [['#c8862a', 640], ['#efdc9a', 665], ['#f2c86a', 690], ['#4a2414', 715], ['#c86a28', 740]].forEach(([c, px]) => { ctx.fillStyle = c; rr(px, 250, 18, 46, 4); ctx.fill(); ctx.fillStyle = '#2a2a32'; ctx.fillRect(px + 6, 236, 6, 14); ctx.fillRect(px + 2, 234, 16, 4); });
  }
  function drawNova(t) {   // Nova behind the bar: midnight-blue fox, gold apron, glowing tail tip
    const x = 210, y = 292, bob = Math.sin(t * 2.2) * 2;
    ctx.fillStyle = '#1f2f6a'; ctx.beginPath(); ctx.ellipse(x, y - 30 + bob, 46, 40, 0, 0, 7); ctx.fill();
    const tx = x + 62, ty = y - 40 + Math.sin(t * 1.6) * 6; ctx.strokeStyle = '#1f2f6a'; ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x + 36, y - 20); ctx.quadraticCurveTo(x + 70, y - 10, tx, ty); ctx.stroke();
    const glow = ctx.createRadialGradient(tx, ty, 2, tx, ty, 22); glow.addColorStop(0, 'rgba(246,220,140,1)'); glow.addColorStop(1, 'rgba(246,220,140,0)'); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(tx, ty, 22, 0, 7); ctx.fill();
    ctx.fillStyle = '#e8c15a'; rr(x - 26, y - 52 + bob, 52, 50, 10); ctx.fill();
    const hy = y - 92 + bob; ctx.fillStyle = '#24357a';
    ctx.beginPath(); ctx.moveTo(x - 30, hy - 8); ctx.lineTo(x - 22, hy - 44); ctx.lineTo(x - 6, hy - 20); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + 30, hy - 8); ctx.lineTo(x + 22, hy - 44); ctx.lineTo(x + 6, hy - 20); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, hy, 34, 28, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#e9e4d4'; ctx.beginPath(); ctx.ellipse(x, hy + 12, 18, 12, 0, 0, 7); ctx.fill();
    const blink = (t % 4) < 0.12; ctx.fillStyle = '#f6dc8c'; if (blink) { ctx.fillRect(x - 15, hy - 4, 10, 2); ctx.fillRect(x + 5, hy - 4, 10, 2); } else { ctx.beginPath(); ctx.arc(x - 11, hy - 4, 4.5, 0, 7); ctx.arc(x + 11, hy - 4, 4.5, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#141428'; ctx.beginPath(); ctx.arc(x, hy + 6, 3.5, 0, 7); ctx.fill();
    if (novaLine && now - novaT < 6000) speech(x + 34, hy - 112, novaLine, 'Nova', 240, true);   // up and to the right of her ears
  }
  function drawCustomer(t) {
    if (!cust) return;
    const enter = Math.min(1, (now - custT) / 700), out = leaving && now > leaving - 600 ? Math.min(1, (now - (leaving - 600)) / 600) : 0;
    const x = 790 + (1 - enter) * 160 + out * 160, y = 292, bob = Math.sin(t * 3) * 2 + (mood && mood.acc === 1 ? Math.abs(Math.sin(t * 9)) * -6 : 0);
    const c = cust; ctx.save(); ctx.translate(x, y + bob);
    ctx.fillStyle = c.body;
    if (c.kind === 'duck') { ctx.beginPath(); ctx.ellipse(0, -30, 34, 30, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(-4, -78, 24, 0, 7); ctx.fill(); ctx.fillStyle = c.accent; ctx.beginPath(); ctx.ellipse(-28, -74, 14, 6, 0, 0, 7); ctx.fill();
      if (c.scarf) { ctx.fillStyle = '#c8323a'; ctx.fillRect(-24, -58, 42, 9); ctx.fillStyle = '#e8c15a'; ctx.fillRect(-24, -52, 42, 3); ctx.fillStyle = '#c8323a'; ctx.fillRect(8, -52, 9, 22); } }
    else if (c.kind === 'owl') { ctx.beginPath(); ctx.ellipse(0, -55, 36, 55, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#f4ece0'; ctx.beginPath(); ctx.arc(-14, -78, 13, 0, 7); ctx.arc(14, -78, 13, 0, 7); ctx.fill(); ctx.fillStyle = c.accent; ctx.beginPath(); ctx.moveTo(-5, -70); ctx.lineTo(5, -70); ctx.lineTo(0, -60); ctx.fill(); }
    else { ctx.beginPath(); ctx.ellipse(0, -32, 36, 34, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(0, -82, 28, 0, 7); ctx.fill();
      ctx.fillStyle = c.kind === 'bunny' ? c.body : c.kind === 'raccoon' ? c.body : c.accent;
      if (c.kind === 'bunny') { ctx.beginPath(); ctx.ellipse(-12, -124, 8, 24, -0.1, 0, 7); ctx.ellipse(12, -124, 8, 24, 0.1, 0, 7); ctx.fill(); ctx.fillStyle = c.accent; ctx.beginPath(); ctx.ellipse(-12, -122, 4, 16, -0.1, 0, 7); ctx.ellipse(12, -122, 4, 16, 0.1, 0, 7); ctx.fill(); }
      else if (c.kind === 'frog') { ctx.fillStyle = c.body; ctx.beginPath(); ctx.arc(-14, -106, 10, 0, 7); ctx.arc(14, -106, 10, 0, 7); ctx.fill(); }
      else if (c.kind === 'hedgehog') { ctx.fillStyle = c.accent; for (let i = -4; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(i * 7 - 6, -98); ctx.lineTo(i * 8, -122 + Math.abs(i) * 3); ctx.lineTo(i * 7 + 6, -98); ctx.fill(); } }
      else { ctx.beginPath(); ctx.arc(-20, -104, 9, 0, 7); ctx.arc(20, -104, 9, 0, 7); ctx.fill(); }
      if (c.kind === 'raccoon') { ctx.fillStyle = c.accent; ctx.fillRect(-24, -90, 48, 12); }
      if (c.kind === 'bear') { ctx.fillStyle = c.accent; ctx.beginPath(); ctx.ellipse(0, -74, 12, 9, 0, 0, 7); ctx.fill(); } }
    const ey = c.kind === 'duck' ? -82 : c.kind === 'owl' ? -78 : c.kind === 'frog' ? -106 : -88, ex = c.kind === 'duck' ? -10 : 0, gap = c.kind === 'owl' ? 14 : c.kind === 'frog' ? 14 : 10;
    ctx.fillStyle = '#141428'; const happy = mood && mood.acc >= 0.6;
    if (happy) { ctx.lineWidth = 2.5; ctx.strokeStyle = '#141428'; ctx.beginPath(); ctx.arc(ex - gap, ey + 2, 4, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.arc(ex + gap, ey + 2, 4, Math.PI, 0); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(ex - gap, ey, 3.5, 0, 7); ctx.arc(ex + gap, ey, 3.5, 0, 7); ctx.fill(); }
    ctx.restore();
    if (bubble && enter >= 1 && !out) speech(x - 250, 112, bubble.text, bubble.who, 230, false);
    if (!mood && enter >= 1) {   // patience: the speed star runs out after SPEEDY seconds
      const left = Math.max(0, 1 - (now - custT) / 1000 / SPEEDY); ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(x - 40, 312, 80, 7, 3); ctx.fill(); ctx.fillStyle = left > 0 ? '#e8c15a' : '#6a6a7a'; rr(x - 40, 312, 80 * Math.max(left, 0.02), 7, 3); ctx.fill();
      ctx.fillStyle = '#aab0c8'; ctx.font = '11px system-ui'; ctx.fillText(left > 0 ? '⚡ speed star' : 'take your time', x - 34, 334);
    }
  }
  function speech(x, y, text, who, w, left) {
    ctx.font = '14px system-ui,sans-serif'; const words = text.split(' '), lines = []; let line = '';
    for (const wd of words) { const tst = line ? line + ' ' + wd : wd; if (ctx.measureText(tst).width > w - 24 && line) { lines.push(line); line = wd; } else line = tst; } lines.push(line);
    const h = 30 + lines.length * 18;
    ctx.fillStyle = 'rgba(246,240,224,.97)'; rr(x, y, w, h, 12); ctx.fill();
    ctx.beginPath(); const tx = left ? x + 40 : x + w - 40; ctx.moveTo(tx - 8, y + h); ctx.lineTo(tx + 8, y + h); ctx.lineTo(tx + (left ? -4 : 14), y + h + 14); ctx.fill();
    ctx.fillStyle = '#c8323a'; ctx.font = 'bold 11px system-ui'; ctx.fillText(who, x + 12, y + 16);
    ctx.fillStyle = '#1a1404'; ctx.font = '14px system-ui,sans-serif'; lines.forEach((l, i) => ctx.fillText(l, x + 12, y + 34 + i * 18));
  }
  function drawCup(t, dt) {
    if (!drink?.cup) { ctx.fillStyle = 'rgba(232,193,90,.5)'; ctx.font = 'italic 13px Georgia,serif'; ctx.fillText('pick a cup ↓', CUPX - 38, CUPY - 30); return; }
    const iced = drink.cup === 'iced', topW = iced ? 98 : 104, botW = iced ? 74 : 92, h = iced ? 150 : 112, base = CUPY, top = base - h;
    const xAt = (y, s) => CUPX + s * (botW / 2 + (topW - botW) / 2 * (base - y) / h);
    for (const l of drink.layers) l.cur += (l.h - l.cur) * Math.min(1, dt * 5);
    const L = look(); const cap = h - 8, total = L.reduce((s, l) => s + l.cur, 0), k = total > cap ? cap / total : 1;
    ctx.save(); ctx.beginPath(); ctx.moveTo(xAt(base, -1), base); ctx.lineTo(xAt(top, -1), top); ctx.lineTo(xAt(top, 1), top); ctx.lineTo(xAt(base, 1), base); ctx.closePath(); ctx.clip();
    let y = base;
    L.forEach((l, i) => {
      const hh = l.cur * k; if (hh < 0.3) return;
      if (l.top) { const g = ctx.createLinearGradient(0, y - hh, 0, y); g.addColorStop(0, l.top); g.addColorStop(1, l.color); ctx.fillStyle = g; } else ctx.fillStyle = l.color;
      ctx.fillRect(CUPX - 70, y - hh, 140, hh + 0.5);
      if (l.kind === 'shot' && L[i - 1] && L[i - 1].kind !== 'shot' && L[i - 1].kind !== 'syrup') { const g = ctx.createLinearGradient(0, y + 10, 0, y - 4); g.addColorStop(0, 'rgba(58,30,16,0)'); g.addColorStop(1, 'rgba(58,30,16,.85)'); ctx.fillStyle = g; ctx.fillRect(CUPX - 70, y - 4, 140, 14); }   // the mark bleeding down
      y -= hh;
    });
    if (L.some(l => l.kind === 'shot') && L[L.length - 1]?.kind === 'shot') { ctx.fillStyle = 'rgba(200,134,42,.55)'; ctx.fillRect(CUPX - 70, y, 140, 3); }   // crema
    if (iced) for (let i = 0; i < 6; i++) { const ix = CUPX - 26 + (i % 3) * 22 + Math.sin(i * 7) * 4, iy = base - 30 - Math.floor(i / 3) * 36 - Math.cos(i * 3) * 6; if (iy < y - 6 && drink.layers.length) continue; ctx.save(); ctx.translate(ix, iy); ctx.rotate(0.3 * Math.sin(i * 5)); ctx.fillStyle = 'rgba(230,245,255,.35)'; rr(-10, -10, 20, 20, 4); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore(); }
    ctx.restore();
    // toppings above the liquid line
    const surf = y;
    if (drink.toppings.includes('whip')) { ctx.fillStyle = '#fbf8f0'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(CUPX - 28 + i * 14, surf - 4 - Math.sin(i / 4 * Math.PI) * 14, 15, 0, 7); ctx.fill(); } ctx.beginPath(); ctx.arc(CUPX, surf - 30, 11, 0, 7); ctx.fill(); }
    if (drink.toppings.includes('caramel')) { ctx.strokeStyle = '#c8862a'; ctx.lineWidth = 3; ctx.beginPath(); const yy = drink.toppings.includes('whip') ? surf - 18 : surf + 3; for (let i = 0; i <= 8; i++) { const xx = CUPX - 36 + i * 9; ctx.lineTo(xx, yy + (i % 2 ? -5 : 5)); } ctx.stroke(); }
    // the glass
    ctx.strokeStyle = 'rgba(230,240,255,.75)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(xAt(top, -1), top); ctx.lineTo(xAt(base, -1), base); ctx.lineTo(xAt(base, 1), base); ctx.lineTo(xAt(top, 1), top); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(xAt(top, -1) + 6, top + 6, 8, h - 14);
    if (!iced) { ctx.beginPath(); ctx.ellipse(CUPX + topW / 2 + 12, base - h / 2, 18, 28, 0, -Math.PI / 2, Math.PI / 2); ctx.stroke(); }
    else if (mood) { ctx.strokeStyle = '#c8323a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(CUPX + 14, top + 40); ctx.lineTo(CUPX + 34, top - 36); ctx.stroke(); }   // a red straw once it's served
    if (!iced && L.length && !drink.toppings.includes('whip')) for (let i = 0; i < 3; i++) { ctx.strokeStyle = `rgba(233,228,212,${0.25 + 0.15 * Math.sin(t * 2 + i)})`; ctx.lineWidth = 2; ctx.beginPath(); const sx = CUPX - 18 + i * 18; ctx.moveTo(sx, top - 8); ctx.bezierCurveTo(sx - 8, top - 22, sx + 8, top - 30, sx + Math.sin(t * 2 + i) * 4, top - 44); ctx.stroke(); }
    // a pour stream
    if (pour && now - pour.t < 520) { const fx = pour.from === 'machine' ? 440 : pour.from === 'pump' ? 690 : CUPX - 60, fy = pour.from === 'machine' ? 290 : pour.from === 'pump' ? 240 : top - 40; ctx.strokeStyle = pour.color; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.quadraticCurveTo((fx + CUPX) / 2, Math.min(fy, top) - 30, CUPX, surf - 2); ctx.stroke();
      if (pour.from === 'pitcher') { ctx.fillStyle = '#c8ccd8'; rr(fx - 30, fy - 30, 34, 36, 6); ctx.fill(); } }
    // name tag
    ctx.fillStyle = '#e8c15a'; ctx.font = 'bold 12px system-ui'; const label = order ? order.name : ''; ctx.fillText(label, CUPX - ctx.measureText(label).width / 2, base + 22);
  }
  function drawJar(t) {
    const x = 840, y = 392; ctx.fillStyle = 'rgba(230,240,255,.18)'; rr(x - 26, y - 64, 52, 64, 8); ctx.fill(); ctx.strokeStyle = 'rgba(230,240,255,.6)'; ctx.lineWidth = 2; ctx.stroke();
    const n = Math.min(day.tips, 40); for (let i = 0; i < n; i++) { ctx.fillStyle = i % 4 ? '#e8c15a' : '#f6dc8c'; ctx.beginPath(); ctx.ellipse(x - 16 + (i % 5) * 8, y - 6 - Math.floor(i / 5) * 6, 5, 3, 0, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#aab0c8'; ctx.font = '11px system-ui'; ctx.fillText('TIPS', x - 13, y + 16);
    coins = coins.filter(c => now - c.t < 900); for (const c of coins) { const u = (now - c.t) / 900; if (u < 0) continue; ctx.fillStyle = '#f6dc8c'; ctx.beginPath(); ctx.arc(CUPX + (x - CUPX) * u, 330 - Math.sin(u * Math.PI) * 120, 6, 0, 7); ctx.fill(); }
    if (mood && now - mood.t < 2600) { ctx.font = '28px serif'; ctx.fillStyle = '#f6dc8c'; const s = '★'.repeat(mood.stars) + '☆'.repeat(5 - mood.stars); ctx.fillText(s, CUPX - ctx.measureText(s).width / 2, 200); }
  }
  let lastT = 0;
  function frame(ts) {
    if (!open) return; now = performance.now(); const dt = Math.min(0.1, (ts - lastT) / 1000 || 0.016); lastT = ts; const t = (now - t0) / 1000;
    if (leaving && now > leaving) { leaving = 0; nextCustomer(); }
    ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
    drawRoom(t); drawMachine(t); drawNova(t); drawCustomer(t); drawCounter(); drawCup(t, dt); drawJar(t);
    raf = requestAnimationFrame(frame);
  }
  function fit() { const w = Math.min(900, innerWidth - 16), s = Math.min(w / W, (innerHeight * 0.52) / H); cv.style.width = W * s + 'px'; cv.style.height = H * s + 'px'; const dpr = Math.min(2, devicePixelRatio || 1); cv.width = Math.round(W * s * dpr); cv.height = Math.round(H * s * dpr); }
  addEventListener('resize', () => open && fit());

  function openCafe() {
    if (open) return; open = true; el.hidden = false; document.body.classList.add('cafe-open'); onOpen?.();
    now = t0 = performance.now(); fit(); if (!order && $('.cafe-end').hidden) nextCustomer(); renderUI(); raf = requestAnimationFrame(frame);
  }
  function close() { if (!open) return; open = false; el.hidden = true; document.body.classList.remove('cafe-open'); cancelAnimationFrame(raf); onClose?.(); }
  return {
    open: openCafe, close, act, serve: () => act('serve'),
    get isOpen() { return open; },
    get state() { return { day: { ...day, log: [...day.log] }, order: order && { ...order }, customer: cust && cust.name, drink: drink && JSON.parse(JSON.stringify({ ...drink, layers: drink.layers.map(l => l.kind) })), mood: mood && { ...mood }, ended: !$('.cafe-end').hidden }; },
    // for tests: make the drink the current customer ordered, step by step
    makeOrder(o = order) { if (!o) return; act('cup', o.cup); for (const s of o.syrups) act('syrup', s); const shots = () => { for (let i = 0; i < o.shots; i++) act('shot'); };
      if (o.shotsOnTop) { if (o.milk) act('milk', o.milk); shots(); } else { shots(); if (o.milk) act('milk', o.milk); } for (const tp of o.toppings) act('top', tp); },
    finishCustomer() { if (leaving) { leaving = 0; nextCustomer(); } },
  };
}

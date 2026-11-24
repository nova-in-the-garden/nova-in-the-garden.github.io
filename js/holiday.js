// Calendar holidays in Central time. The sky clock's date (live or ?date=) is
// the one that matters; call setHolidayNow(() => clock.now()) from main.js.
import { REF, zonedParts, zonedDate } from './sun.js';

let nowFn = () => new Date();
export function setHolidayNow(fn) { nowFn = fn; }
export function holidayNow() { return nowFn(); }

const pad = n => String(n).padStart(2, '0');
export function ymd(date, tz = REF.tz) {
  const z = zonedParts(date, tz);
  return { y: z.y, mo: z.mo, d: z.d, h: z.h, mi: z.mi, key: `${z.y}-${pad(z.mo)}-${pad(z.d)}`, n: z.y * 10000 + z.mo * 100 + z.d };
}

// US Thanksgiving has been the fourth Thursday of November since 1941.
export function thanksgivingDate(year, tz = REF.tz) {
  let found = 0;
  for (let d = 1; d <= 28; d++) {
    const dt = zonedDate(year, 11, d, 12, 0, tz);
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(dt);
    if (wd === 'Thu') { found++; if (found === 4) return { y: year, mo: 11, d }; }
  }
  return { y: year, mo: 11, d: 26 };
}

// Stages around Thanksgiving, in Central time:
//   off        — table put away (before the week, or after leftovers)
//   set        — table set beforehand: places, cornucopia, no feast yet; pie in the kitchen
//   feast      — Thanksgiving Day: full meal, pie on the table, cafe special
//   leftovers  — the next few days: carved turkey, a slice of pie missing
//   cleared    — dishes gone, the empty table stays a little longer
export function feastStage(date = holidayNow()) {
  const z = ymd(date);
  const tg = thanksgivingDate(z.y);
  // day difference, not YYYYMMDD arithmetic (which breaks across month ends)
  const days = Math.round((zonedDate(z.y, z.mo, z.d, 12, 0).getTime() - zonedDate(tg.y, tg.mo, tg.d, 12, 0).getTime()) / 86400000);
  if (days < -6) return 'off';       // before the Friday of the week before
  if (days < 0) return 'set';
  if (days === 0) return 'feast';
  if (days <= 3) return 'leftovers'; // Friday–Sunday
  if (days <= 5) return 'cleared';
  return 'off';
}

// Sit down for the meal during waking hours on the day itself (8 AM–11 PM Central).
export function feastSitting(date = holidayNow()) {
  const z = ymd(date);
  return feastStage(date) === 'feast' && z.h >= 8 && z.h < 23;
}

export function pieInKitchen(date = holidayNow()) {
  const s = feastStage(date);
  return s === 'set' || s === 'off';
}

export function cafeSpecialOn(date = holidayNow()) {
  const s = feastStage(date);
  return s === 'feast' || s === 'leftovers';
}

// Morning: the parade. Afternoon and evening: football. (Both are Thanksgiving TV traditions.)
export function feastBroadcast(date = holidayNow()) {
  if (feastStage(date) !== 'feast') return null;
  return ymd(date).h < 13 ? 'parade' : 'football';
}

export const FEAST_WHY = "Sitting at the harvest table with Lorenz, thankful for this day";

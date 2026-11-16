// Sun and moon for Nova's sky. Self-contained (no network): NOAA solar
// calculator equations for the sun, a low-precision lunar theory for the moon.
// Accuracy: sun ~1 minute for rise/set, moon ~1 degree. Plenty for a sky.

// The reference point for "when the sun is out". A generic spot in the US
// Central time zone (deliberately not anyone's home). Change it here.
export const REF = { lat: 38.6, lon: -90.2, tz: 'America/Chicago', tzLabel: 'CT' };

const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const sin = x => Math.sin(x * RAD), cos = x => Math.cos(x * RAD), tan = x => Math.tan(x * RAD);
const mod = (a, n) => ((a % n) + n) % n;
const julian = date => date.getTime() / 86400000 + 2440587.5;

// NOAA: equation of time (minutes) and solar declination (deg) for a moment.
function solarCore(date) {
  const T = (julian(date) - 2451545) / 36525;
  const L0 = mod(280.46646 + T * (36000.76983 + T * 0.0003032), 360);
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = sin(M) * (1.914602 - T * (0.004817 + 0.000014 * T)) + sin(2 * M) * (0.019993 - 0.000101 * T) + sin(3 * M) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * sin(omega);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * cos(omega);
  const decl = Math.asin(sin(eps) * sin(lambda)) * DEG;
  const y = tan(eps / 2) ** 2;
  const eot = 4 * DEG * (y * sin(2 * L0) - 2 * e * sin(M) + 4 * e * y * sin(M) * cos(2 * L0) - 0.5 * y * y * sin(4 * L0) - 1.25 * e * e * sin(2 * M));
  return { decl, eot };
}

// Sun elevation (deg, with atmospheric refraction) and azimuth (deg clockwise from north).
export function sunPosition(date, lat = REF.lat, lon = REF.lon) {
  const { decl, eot } = solarCore(date);
  const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60 + date.getUTCMilliseconds() / 60000;
  const tst = mod(utcMin + eot + 4 * lon, 1440);
  const ha = tst / 4 < 0 ? tst / 4 + 180 : tst / 4 - 180;
  const cz = Math.min(1, Math.max(-1, sin(lat) * sin(decl) + cos(lat) * cos(decl) * cos(ha)));
  const zen = Math.acos(cz) * DEG, el = 90 - zen;
  let refr = 0; // NOAA refraction approximation (deg)
  if (el < 85) {
    const te = tan(el);
    refr = el > 5 ? 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5 : el > -0.575 ? 1735 + el * (-518.2 + el * (103.4 + el * (-12.79 + el * 0.711))) : -20.772 / te;
    refr /= 3600;
  }
  const azDen = cos(lat) * Math.sin(zen * RAD);
  let az;
  if (Math.abs(azDen) > 1e-6) {
    let a = (sin(lat) * cz - sin(decl)) / azDen; a = Math.min(1, Math.max(-1, a));
    az = 180 - Math.acos(a) * DEG; if (ha > 0) az = -az;
  } else az = lat > 0 ? 180 : 0;
  return { elevation: el + refr, azimuth: mod(az, 360) };
}

// Calendar date (Y, M, D) of a moment in a time zone.
export function zonedParts(date, tz = REF.tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date).map(x => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}
// minutes the zone is ahead of UTC at a moment (CST = -360, CDT = -300)
export function zoneOffset(date, tz = REF.tz) {
  const z = zonedParts(date, tz);
  return Math.round((Date.UTC(z.y, z.mo - 1, z.d, z.h, z.mi, z.s) - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}
// The moment when the zone's wall clock reads y-mo-d h:mi.
export function zonedDate(y, mo, d, h, mi, tz = REF.tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let t = guess - zoneOffset(new Date(guess), tz) * 60000;
  t = guess - zoneOffset(new Date(t), tz) * 60000;
  return new Date(t);
}

// Sun events for the calendar day containing `date` (in the reference zone).
// Times are Date objects (or null for polar day/night).
function eventUTC(y, mo, d, lat, lon, zenith, rising) {
  // NOAA: iterate twice, recomputing EoT and declination at the event itself
  let t = new Date(Date.UTC(y, mo - 1, d, 12) - lon / 15 * 3600000);
  for (let k = 0; k < 3; k++) {
    const { decl, eot } = solarCore(t);
    const c = cos(zenith) / (cos(lat) * cos(decl)) - tan(lat) * tan(decl);
    if (c < -1 || c > 1) return null;
    const ha = Math.acos(c) * DEG * (rising ? 1 : -1);
    const min = 720 - 4 * (lon + ha) - eot;
    t = new Date(Date.UTC(y, mo - 1, d) + min * 60000);
  }
  return t;
}
export function sunTimes(date, lat = REF.lat, lon = REF.lon, tz = REF.tz) {
  const z = zonedParts(date, tz);
  // the UTC calendar day that holds local noon is the right one for these longitudes
  const noonGuess = zonedDate(z.y, z.mo, z.d, 12, 0, tz);
  const u = new Date(noonGuess.getTime()); const Y = u.getUTCFullYear(), M = u.getUTCMonth() + 1, D = u.getUTCDate();
  const { eot } = solarCore(noonGuess);
  return {
    dawn: eventUTC(Y, M, D, lat, lon, 96, true),       // civil twilight begins
    sunrise: eventUTC(Y, M, D, lat, lon, 90.833, true),
    noon: new Date(Date.UTC(Y, M - 1, D) + (720 - 4 * lon - eot) * 60000),
    sunset: eventUTC(Y, M, D, lat, lon, 90.833, false),
    dusk: eventUTC(Y, M, D, lat, lon, 96, false),       // civil twilight ends
  };
}

// Moon: position (deg) and phase. Low-precision (after Meeus / suncalc).
export function moonPosition(date, lat = REF.lat, lon = REF.lon) {
  const d = julian(date) - 2451545;
  const L = RAD * (218.316 + 13.176396 * d), M = RAD * (134.963 + 13.064993 * d), F = RAD * (93.272 + 13.229350 * d);
  const l = L + RAD * 6.289 * Math.sin(M), b = RAD * 5.128 * Math.sin(F), e = RAD * 23.4397;
  const ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
  const dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
  const lst = RAD * (280.16 + 360.9856235 * d) + RAD * lon; const H = lst - ra, phi = RAD * lat;
  let el = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)); // from south
  const elD = el * DEG; const refr = elD > -1 ? 1.02 / Math.tan(RAD * (elD + 10.3 / (elD + 5.11))) / 60 : 0;
  // phase from the sun-moon elongation
  const s = solarCore(date); const T = (julian(date) - 2451545) / 36525;
  const sunL = RAD * (mod(280.46646 + 36000.76983 * T, 360) + sin(357.52911 + 35999.05029 * T) * 1.9146);
  const elong = Math.acos(Math.cos(b) * Math.cos(l - sunL));
  const waxing = mod((l - sunL) * DEG, 360) < 180;
  void s;
  return { elevation: elD + refr, azimuth: mod(az * DEG + 180, 360), illum: (1 - Math.cos(elong)) / 2, waxing, age: mod((l - sunL) * DEG, 360) / 360 };
}

// Direction vector in Nova's world for (elevation, azimuth).
// Compass: the overview camera looks SOUTH, so south = -z, north = +z, east = -x, west = +x.
export function skyDir(el, az, out = [0, 0, 0]) {
  const ce = cos(el); out[0] = -sin(az) * ce; out[1] = sin(el); out[2] = cos(az) * ce; return out;
}

export const fmtTime = (d, tz = REF.tz) => d ? new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(d) : '—';

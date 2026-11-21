const { TZ } = require('./config');

const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false });

const localDate = (iso) => dateFmt.format(new Date(iso));          // YYYY-MM-DD in app timezone
const localHour = (iso) => Number(hourFmt.format(new Date(iso))) % 24;
const todayLocal = () => localDate(new Date().toISOString());
const nowIso = () => new Date().toISOString();

// Normalise phone numbers: "p:+91 98765-43210" -> "9876543210"
function normalizePhone(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length < 8 || d.length > 15) return null;
  return d;
}

// Start of a local (app timezone) day as a UTC ISO string, e.g. dayStartIso('2026-10-05')
function tzOffsetMs(date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date);
  const g = (t) => Number(parts.find((x) => x.type === t).value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(date.getTime() / 1000) * 1000;
}
const dayStartIso = (ymd) => { const n = Date.parse(ymd + 'T00:00:00Z'); return new Date(n - tzOffsetMs(new Date(n))).toISOString(); };
const nextDayIso = (ymd) => dayStartIso(new Date(Date.parse(ymd + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10));
const fmtDur = (sec) => { sec = Math.max(0, Math.round(sec || 0)); const m = Math.floor(sec / 60), s = sec % 60; return m ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`; };

// ---- reversible (AES-256-GCM) copy of a password, so the admin can read it in Admin -> Executives.
// Login itself still uses the bcrypt hash. The key comes from PASSWORD_KEY (or JWT_SECRET) in server/.env — keep that value unchanged.
const crypto = require('crypto');
const { JWT_SECRET } = require('./config');
const pwKey = () => crypto.createHash('sha256').update(`pw:${process.env.PASSWORD_KEY || JWT_SECRET}`).digest();
function encryptSecret(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', pwKey(), iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return `${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
}
function decryptSecret(blob) {
  try {
    if (!blob) return null;
    const [iv, tag, enc] = String(blob).split('.').map((x) => Buffer.from(x, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', pwKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch { return null; }
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { encryptSecret, decryptSecret, dayStartIso, nextDayIso, fmtDur, localDate, localHour, todayLocal, nowIso, normalizePhone, wrap };

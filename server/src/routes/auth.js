const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sign, requireAuth } = require('../auth');
const { wrap, nowIso, encryptSecret } = require('../util');
const { logActivity } = require('../activity');

const crypto = require('crypto');
const { JWT_SECRET, OTP_MODE, OTP_FOR_ADMIN, OTP_TTL_MIN, OTP_EVERY_LOGIN } = require('../config');
const { sendOtpSms } = require('../sms');
const { requireAdmin } = require('../auth');
const { markActive } = require('../attendance');
const { distributeFresh } = require('../inbox');

const sha = (v) => crypto.createHash('sha256').update(`${JWT_SECRET}:${v}`).digest('hex');
const deviceLabel = (req) => String(req.headers['user-agent'] || 'Unknown device').slice(0, 250);
const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().replace('::ffff:', '').slice(0, 64);

// Finishes a successful sign-in (password ok + device verified)
async function finishLogin(req, res, user, panel) {
  await db.run('UPDATE users SET last_login_at=? WHERE id=?', [nowIso(), user.id]);
  await logActivity(req, 'LOGIN', `Signed in to the ${panel} panel`, { user });
  if (user.role === 'executive') {          // signing in = present today -> fresh clients are shared out
    await markActive(user.id);
    distributeFresh().catch((e) => console.warn('distribution failed:', e.message));
  }
  res.json({ token: sign(user), user: { id: user.id, name: user.name, phone: user.phone, role: user.role } });
}

// Two separate panels: panel = 'admin' (admin login page) or 'executive' (executive login page).
// A PC / browser / phone must pass an OTP once (first time). After that: mobile number + password only.
router.post('/login', wrap(async (req, res) => {
  const phone = String(req.body.phone || '').replace(/\D/g, '');
  const panel = req.body.panel === 'admin' ? 'admin' : 'executive';
  const user = await db.one('SELECT * FROM users WHERE phone=?', [phone]);
  if (!user || !bcrypt.compareSync(String(req.body.password || ''), user.password_hash)) {
    if (user) await logActivity(req, 'LOGIN_FAILED', 'Wrong password entered', { user });
    return res.status(401).json({ message: 'Wrong mobile number or password' });
  }
  if (!user.active) return res.status(403).json({ message: 'Your account is disabled. Contact admin.' });
  if (user.role !== panel) {
    return res.status(403).json({ message: user.role === 'admin'
      ? 'This is an admin account. Please use the Admin login page.'
      : 'This is an executive account. Please use the Executive login page.' });
  }

  const needOtp = user.role === 'executive' || OTP_FOR_ADMIN;
  if (!needOtp) return finishLogin(req, res, user, panel);

  const deviceId = String(req.body.device_id || '');
  if (deviceId.length < 16) return res.status(400).json({ message: 'Please refresh the page (or update the app) and try again' });
  const dev = sha(deviceId);
  const known = await db.one('SELECT id FROM trusted_devices WHERE user_id=? AND device_hash=?', [user.id, dev]);
  if (known && !OTP_EVERY_LOGIN) {
    await db.run('UPDATE trusted_devices SET last_used_at=?, ip=? WHERE id=?', [nowIso(), ipOf(req), known.id]);
    return finishLogin(req, res, user, panel);
  }

  // New device -> OTP
  const { c: recent } = await db.one('SELECT COUNT(*) c FROM login_otps WHERE user_id=? AND created_at > ?', [user.id, new Date(Date.now() - 3600_000).toISOString()]);
  if (recent >= 8) return res.status(429).json({ message: 'Too many OTP requests. Try again after an hour or ask the admin.' });
  const last = await db.one('SELECT created_at FROM login_otps WHERE user_id=? ORDER BY id DESC LIMIT 1', [user.id]);
  if (last && Date.now() - Date.parse(last.created_at) < 30_000) {
    const wait = Math.ceil((30_000 - (Date.now() - Date.parse(last.created_at))) / 1000);
    return res.status(429).json({ message: `An OTP was just sent. Please wait ${wait} seconds before asking for a new one.` });
  }
  const code = String(crypto.randomInt(100000, 1000000));
  const toAdmin = OTP_MODE === 'admin' || OTP_MODE === 'both';
  const bySms = OTP_MODE === 'sms' || OTP_MODE === 'both';
  await db.run("UPDATE login_otps SET used=1, status='EXPIRED', code_plain=NULL WHERE user_id=? AND used=0", [user.id]);   // only the newest OTP works
  const info = await db.run(
    'INSERT INTO login_otps (user_id, user_name, user_role, user_phone, device_hash, device_label, code_hash, code_plain, status, expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [user.id, user.name, user.role, user.phone, dev, deviceLabel(req), sha(code), toAdmin ? code : null, 'PENDING', new Date(Date.now() + OTP_TTL_MIN * 60_000).toISOString()]
  );
  let sent = false;
  if (bySms) {
    try { await sendOtpSms(phone, code); sent = true; } catch (e) { console.warn('OTP SMS failed:', e.message); if (!toAdmin) return res.status(502).json({ message: 'Could not send the OTP SMS. Contact admin.' }); }
  }
  if (!bySms) console.log(`\n[OTP] ${user.name} (${phone}) -> ${code}   (valid ${OTP_TTL_MIN} min)\n`);
  await logActivity(req, 'OTP_REQUESTED', `Login OTP requested from a new device${sent ? ' (sent by SMS)' : ' (shown to admin)'}`, { user, details: { device: deviceLabel(req) } });
  res.status(202).json({ otp_required: true, challenge_id: info.insertId, via: sent ? 'sms' : 'admin', ttl_min: OTP_TTL_MIN });
}));

router.post('/verify-otp', wrap(async (req, res) => {
  const otp = await db.one('SELECT * FROM login_otps WHERE id=?', [Number(req.body.challenge_id) || 0]);
  const deviceId = String(req.body.device_id || '');
  if (!otp || otp.used || deviceId.length < 16 || otp.device_hash !== sha(deviceId)) return res.status(400).json({ message: 'OTP expired. Sign in again to get a new one.' });
  if (Date.parse(otp.expires_at) < Date.now()) {
    await db.run("UPDATE login_otps SET status='EXPIRED', code_plain=NULL WHERE id=?", [otp.id]);
    return res.status(400).json({ message: 'OTP expired. Sign in again to get a new one.' });
  }
  if (otp.attempts >= 5) {
    await db.run("UPDATE login_otps SET status='FAILED', code_plain=NULL WHERE id=?", [otp.id]);
    return res.status(429).json({ message: 'Too many wrong attempts. Sign in again to get a new OTP.' });
  }
  const user = await db.one('SELECT * FROM users WHERE id=?', [otp.user_id]);
  if (!user || !user.active) return res.status(403).json({ message: 'Your account is disabled. Contact admin.' });
  if (otp.code_hash !== sha(String(req.body.code || '').replace(/\D/g, ''))) {
    await db.run('UPDATE login_otps SET attempts=attempts+1 WHERE id=?', [otp.id]);
    await logActivity(req, 'LOGIN_FAILED', 'Wrong OTP entered', { user });
    return res.status(400).json({ message: `Wrong OTP (${4 - otp.attempts} tries left)` });
  }
  await db.run("UPDATE login_otps SET used=1, status='VERIFIED', verified_at=?, code_plain=NULL WHERE id=?", [nowIso(), otp.id]);
  await db.run(`INSERT INTO trusted_devices (user_id, device_hash, label, ip, last_used_at) VALUES (?,?,?,?,?)
    ON DUPLICATE KEY UPDATE last_used_at=VALUES(last_used_at), ip=VALUES(ip)`, [user.id, otp.device_hash, deviceLabel(req), ipOf(req), nowIso()]);
  await logActivity(req, 'DEVICE_TRUSTED', 'OTP verified — this device will not ask for an OTP again', { user, details: { device: deviceLabel(req) } });
  return finishLogin(req, res, user, user.role);
}));

// Admin (OTP_MODE=admin): OTPs waiting to be told to the executives
router.get('/otp/pending', requireAuth, requireAdmin, wrap(async (req, res) => {
  res.json(await db.all(`SELECT o.id, o.user_id, o.user_name, o.code_plain AS code, o.status, o.expires_at, o.created_at, o.device_label, u.name, u.phone
    FROM login_otps o JOIN users u ON u.id=o.user_id
    WHERE o.used=0 AND o.code_plain IS NOT NULL AND o.expires_at > ? ORDER BY o.id DESC LIMIT 30`, [nowIso()]));
}));

router.post('/logout', requireAuth, wrap(async (req, res) => {
  await logActivity(req, 'LOGOUT', 'Signed out');
  res.json({ ok: true });
}));

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

router.post('/change-password', requireAuth, wrap(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ message: 'New password must be at least 6 characters' });
  const u = await db.one('SELECT * FROM users WHERE id=?', [req.user.id]);
  if (!bcrypt.compareSync(String(oldPassword || ''), u.password_hash)) return res.status(400).json({ message: 'Current password is wrong' });
  await db.run('UPDATE users SET password_hash=?, password_enc=? WHERE id=?', [bcrypt.hashSync(newPassword, 10), encryptSecret(newPassword), u.id]);
  await logActivity(req, 'PASSWORD_CHANGED', 'Changed own password');
  res.json({ ok: true });
}));

// Change the mobile number used to sign in (needs the current password)
router.post('/change-phone', requireAuth, wrap(async (req, res) => {
  const phone = String(req.body.phone || '').replace(/\D/g, '');
  if (phone.length < 8 || phone.length > 15) return res.status(400).json({ message: 'Enter a valid mobile number' });
  const u = await db.one('SELECT * FROM users WHERE id=?', [req.user.id]);
  if (!bcrypt.compareSync(String(req.body.password || ''), u.password_hash)) return res.status(400).json({ message: 'Current password is wrong' });
  if (phone === u.phone) return res.status(400).json({ message: 'This is already your login number' });
  if (await db.one('SELECT 1 x FROM users WHERE phone=? AND id<>?', [phone, u.id])) return res.status(409).json({ message: 'This mobile number is already used by another user' });
  await db.run('UPDATE users SET phone=? WHERE id=?', [phone, u.id]);
  await logActivity(req, 'PHONE_CHANGED', `Changed login number ${u.phone} → ${phone}`);
  res.json({ user: { id: u.id, name: u.name, phone, role: u.role } });
}));

module.exports = router;

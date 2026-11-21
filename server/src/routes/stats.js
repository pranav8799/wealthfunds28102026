const router = require('express').Router();
const db = require('../db');
const { requireAdmin } = require('../auth');
const { wrap, nowIso, localDate, localHour, todayLocal } = require('../util');
const { MIN_CALLS, DAY_START_HOUR, DAY_END_HOUR } = require('../config');

const CONNECTED = ['INTERESTED', 'NOT_INTERESTED', 'CALLBACK', 'TRIAL', 'FOLLOWUP', 'DONE_SOLD'];

async function callsBetween(fromDate, toDate, executiveId) {
  const w = ['c.ended_at IS NOT NULL'], p = [];
  if (executiveId) { w.push('c.executive_id=?'); p.push(executiveId); }
  w.push('c.started_at >= ?'); p.push(new Date(Date.parse(fromDate) - 86400000).toISOString());
  w.push('c.started_at <= ?'); p.push(new Date(Date.parse(toDate) + 2 * 86400000).toISOString());
  return (await db.all(`SELECT c.*, u.name AS executive_name FROM calls c JOIN users u ON u.id=c.executive_id WHERE ${w.join(' AND ')}`, p))
    .filter((c) => { const d = localDate(c.started_at); return d >= fromDate && d <= toDate; });
}

const addDays = (ymd, n) => new Date(Date.parse(ymd + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const scopeExec = (req) => (req.user.role === 'admin' ? (Number(req.query.executive) || null) : req.user.id);

router.get('/overview', wrap(async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const L = await db.one(`SELECT
      COUNT(*) total,
      SUM(call_count=0) uncalled,
      SUM(call_count>0 AND call_count<? AND status!='NOT_INTERESTED' AND status!='DONE_SOLD' AND account_status!='OPENED') pending_calls,
      SUM(call_count>=?) reached_min,
      SUM(status='INTERESTED') interested,
      SUM(status='NOT_INTERESTED') not_interested,
      SUM(status='CALLBACK') callback,
      SUM(status='TRIAL') trial,
      SUM(status='FOLLOWUP') followup,
      SUM(status='DONE_SOLD') done_sold,
      SUM(status='TRIAL' AND trial_ends_at IS NOT NULL AND trial_ends_at >= NOW(3)) active,
      SUM(trial_ends_at IS NOT NULL AND trial_ends_at < NOW(3) AND status NOT IN ('DONE_SOLD','NOT_INTERESTED')) not_active,
      SUM(status='NO_ANSWER') no_answer,
      SUM(group_joined=1) group_joined,
      SUM(webinar_status='ATTENDED') webinar_attended,
      SUM(account_status='OPENED') accounts_opened,
      SUM(account_status='IN_PROGRESS') accounts_progress,
      SUM(status IN ('TRIAL','FOLLOWUP') AND trial_ends_at IS NOT NULL AND trial_ends_at < NOW(3)) trial_expired,
      SUM(status IN ('TRIAL','FOLLOWUP') AND trial_ends_at IS NOT NULL AND trial_ends_at BETWEEN NOW(3) AND DATE_ADD(NOW(3), INTERVAL 2 DAY)) trial_ending
    FROM leads ${isAdmin ? '' : 'WHERE executive_id = ?'}`, [MIN_CALLS, MIN_CALLS, ...(isAdmin ? [] : [req.user.id])]);
  for (const k of Object.keys(L)) L[k] = L[k] || 0;

  const today = todayLocal();
  const exId = isAdmin ? null : req.user.id;
  const weekCalls = await callsBetween(addDays(today, -6), today, exId);
  const todays = weekCalls.filter((c) => localDate(c.started_at) === today);
  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i);
    const day = weekCalls.filter((c) => localDate(c.started_at) === d);
    trend.push({ date: d, calls: day.length, connected: day.filter((c) => CONNECTED.includes(c.outcome)).length });
  }
  const calls = {
    today: todays.length,
    connected_today: todays.filter((c) => CONNECTED.includes(c.outcome)).length,
    talk_sec_today: todays.reduce((s, c) => s + c.duration_sec, 0),
    trend,
  };

  const fw = exId ? 'AND l.executive_id=?' : '';
  // Callbacks + follow-ups: overdue first, then today, then near future
  const followups = await db.all(`SELECT l.id,l.name,l.mobile,l.followup_at,l.call_count,l.status,u.name executive_name FROM leads l
    LEFT JOIN users u ON u.id=l.executive_id
    WHERE l.status IN ('CALLBACK','FOLLOWUP') AND l.followup_at IS NOT NULL AND l.followup_at <= ?
    ${fw}
    ORDER BY l.followup_at LIMIT 12`, [new Date(Date.parse(today) + 2 * 86400000).toISOString(), ...(exId ? [exId] : [])]);
  const followupsDue = (await db.one(`SELECT COUNT(*) c FROM leads l WHERE l.status IN ('CALLBACK','FOLLOWUP') AND l.followup_at <= ? ${fw}`,
    [nowIso(), ...(exId ? [exId] : [])])).c;

  // Trial expiry alerts
  const trialsEnding = await db.all(`SELECT l.id,l.name,l.mobile,l.trial_ends_at,l.trial_days,l.status,u.name executive_name FROM leads l
    LEFT JOIN users u ON u.id=l.executive_id
    WHERE l.status IN ('TRIAL','FOLLOWUP') AND l.trial_ends_at IS NOT NULL
      AND l.trial_ends_at BETWEEN NOW(3) AND DATE_ADD(NOW(3), INTERVAL 2 DAY) ${fw}
    ORDER BY l.trial_ends_at LIMIT 8`, ...(exId ? [[exId]] : [[]]));
  const trialsExpired = await db.all(`SELECT l.id,l.name,l.mobile,l.trial_ends_at,l.trial_days,l.status,u.name executive_name FROM leads l
    LEFT JOIN users u ON u.id=l.executive_id
    WHERE l.status IN ('TRIAL','FOLLOWUP') AND l.trial_ends_at IS NOT NULL AND l.trial_ends_at < NOW(3) ${fw}
    ORDER BY l.trial_ends_at DESC LIMIT 8`, ...(exId ? [[exId]] : [[]]));

  let leaderboard = [];
  if (isAdmin) {
    leaderboard = (await db.all("SELECT id,name FROM users WHERE role='executive' AND active=1")).map((u) => {
      const mine = todays.filter((c) => c.executive_id === u.id);
      return { id: u.id, name: u.name, calls: mine.length, connected: mine.filter((c) => CONNECTED.includes(c.outcome)).length,
        talk_sec: mine.reduce((s, c) => s + c.duration_sec, 0) };
    }).sort((a, b) => b.calls - a.calls);
  }
  const queue = isAdmin ? 0 : (await db.one(`SELECT COUNT(*) c FROM leads WHERE call_count < ? AND status NOT IN ('NOT_INTERESTED','DONE_SOLD') AND account_status != 'OPENED'
      AND (executive_id IS NULL OR executive_id = ?) AND NOT (status IN ('CALLBACK','FOLLOWUP') AND followup_at > ?)`, [MIN_CALLS, req.user.id, nowIso()])).c;
  const recent = isAdmin ? await db.all(`SELECT id,user_name,user_role,action,summary,created_at FROM activity_log WHERE action<>'LOGIN_FAILED' ORDER BY created_at DESC, id DESC LIMIT 10`) : [];
  const mine = await db.one(`SELECT COUNT(*) leads, SUM(account_status='OPENED') accounts, SUM(status='DONE_SOLD') sold FROM leads WHERE executive_id=?`, [req.user.id]);
  res.json({
    leads: L, calls, followups, followupsDue,
    trialsEnding, trialsExpired,
    leaderboard, queue, recent,
    mine: { leads: mine.leads || 0, accounts: mine.accounts || 0, sold: mine.sold || 0 },
    minCalls: MIN_CALLS,
  });
}));

// Calls per executive per hour (default 10:00 - 18:00) for one day
router.get('/hourly', wrap(async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : todayLocal();
  const hours = [];
  for (let h = DAY_START_HOUR; h < DAY_END_HOUR; h++) hours.push(h);
  const calls = await callsBetween(date, date, scopeExec(req));
  const users = req.user.role === 'admin'
    ? await db.all("SELECT id,name FROM users WHERE role='executive' AND active=1 ORDER BY name")
    : [{ id: req.user.id, name: req.user.name }];
  const executives = users.map((u) => {
    const mine = calls.filter((c) => c.executive_id === u.id);
    return { id: u.id, name: u.name, counts: hours.map((h) => mine.filter((c) => localHour(c.started_at) === h).length), total: mine.length };
  });
  const outside = calls.filter((c) => { const h = localHour(c.started_at); return h < DAY_START_HOUR || h >= DAY_END_HOUR; }).length;
  res.json({ date, hours, labels: hours.map((h) => `${h}-${h + 1}`), executives, totals: hours.map((h, i) => executives.reduce((s, e) => s + e.counts[i], 0)), outside });
}));

router.get('/daily', wrap(async (req, res) => {
  const days = Math.min(60, Math.max(3, Number(req.query.days) || 14));
  const today = todayLocal();
  const from = addDays(today, -(days - 1));
  const calls = await callsBetween(from, today, scopeExec(req));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    const day = calls.filter((c) => localDate(c.started_at) === d);
    out.push({ date: d, calls: day.length, connected: day.filter((c) => CONNECTED.includes(c.outcome)).length,
      talk_min: Math.round(day.reduce((s, c) => s + c.duration_sec, 0) / 60) });
  }
  res.json(out);
}));

router.get('/executives', requireAdmin, wrap(async (req, res) => {
  const today = todayLocal();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : today;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : today;
  const calls = await callsBetween(from, to, null);
  const rows = await Promise.all((await db.all("SELECT id,name,phone,active FROM users WHERE role='executive' ORDER BY name")).map(async (u) => {
    const mine = calls.filter((c) => c.executive_id === u.id);
    const talk = mine.reduce((s, c) => s + c.duration_sec, 0);
    const count = (o) => mine.filter((c) => c.outcome === o).length;
    const owned = await db.one(`SELECT COUNT(*) leads, SUM(account_status='OPENED') accounts, SUM(group_joined=1) \`groups\`,
        SUM(webinar_status='ATTENDED') webinars FROM leads WHERE executive_id=?`, [u.id]);
    return { ...u, calls: mine.length, connected: mine.filter((c) => CONNECTED.includes(c.outcome)).length,
      talk_sec: talk, avg_sec: mine.length ? Math.round(talk / mine.length) : 0,
      interested: count('INTERESTED'), not_interested: count('NOT_INTERESTED'), callback: count('CALLBACK'), no_answer: count('NO_ANSWER'),
      leads: owned.leads || 0, accounts: owned.accounts || 0, groups: owned.groups || 0, webinars: owned.webinars || 0 };
  }));
  res.json({ from, to, rows });
}));

module.exports = router;

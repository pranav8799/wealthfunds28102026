export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}
export function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
export const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const ymd = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
export const toLocalInput = (d) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 16);
};
export const label = (v) => String(v || '').replace(/_/g, ' ');

export const CHART_COLORS = ['#12b886', '#3b82f6', '#e8a83c', '#8b5cf6', '#e5484d', '#06b6d4', '#64748b', '#ec4899'];

export const OUTCOMES = [
  { value: 'INTERESTED', label: 'Interested', icon: '✓', cls: 'border-signal-green bg-signal-greenTint text-signal-greenDark' },
  { value: 'NOT_INTERESTED', label: 'Not interested', icon: '✕', cls: 'border-coral bg-coral-tint text-coral' },
  { value: 'CALLBACK', label: 'Callback', icon: '↻', cls: 'border-amber bg-amber-tint text-amber-dark' },
  { value: 'TRIAL', label: 'Trial', icon: '⏱', cls: 'border-sky bg-sky-tint text-sky' },
  { value: 'FOLLOWUP', label: 'Follow-up', icon: '📋', cls: 'border-violet-500 bg-violet-50 text-violet-700' },
  { value: 'DONE_SOLD', label: 'Done', icon: '★', cls: 'border-emerald-600 bg-emerald-50 text-emerald-800' },
  { value: 'NO_ANSWER', label: 'No answer / busy', icon: '○', cls: 'border-ink-500 bg-surface-2 text-ink-700' },
];

// All client status sections (tabs / filters) — short labels for single-row chips
export const STATUSES = [
  { value: 'INTERESTED', label: 'Interested', icon: '✓', tone: 'green' },
  { value: 'NOT_INTERESTED', label: 'Not Int.', icon: '✕', tone: 'coral' },
  { value: 'CALLBACK', label: 'Callback', icon: '↻', tone: 'amber' },
  { value: 'TRIAL', label: 'Trial', icon: '⏱', tone: 'sky' },
  { value: 'FOLLOWUP', label: 'Follow-up', icon: '📋', tone: 'violet' },
  { value: 'ACTIVE', label: 'Active', icon: '●', tone: 'green' },
  { value: 'NOT_ACTIVE', label: 'Not Active', icon: '○', tone: 'slate' },
  { value: 'DONE_SOLD', label: 'Done', icon: '★', tone: 'emerald' },
];

export const TRIAL_PRESETS = [2, 3, 5, 8];

export const STATUS_META = {
  NEW: { label: 'New', icon: '•', cls: 'border-ink-400 bg-surface-2 text-ink-600' },
  INTERESTED: { label: 'Interested', icon: '✓', cls: 'border-signal-green bg-signal-greenTint text-signal-greenDark' },
  NOT_INTERESTED: { label: 'Not Interested', icon: '✕', cls: 'border-coral bg-coral-tint text-coral' },
  CALLBACK: { label: 'Callback', icon: '↻', cls: 'border-amber bg-amber-tint text-amber-dark' },
  TRIAL: { label: 'Trial', icon: '⏱', cls: 'border-sky bg-sky-tint text-sky' },
  FOLLOWUP: { label: 'Follow-up', icon: '📋', cls: 'border-violet-500 bg-violet-50 text-violet-700' },
  ACTIVE: { label: 'Active', icon: '●', cls: 'border-signal-green bg-signal-greenTint text-signal-greenDark' },
  NOT_ACTIVE: { label: 'Not Active', icon: '○', cls: 'border-ink-400 bg-surface-2 text-ink-500' },
  DONE_SOLD: { label: 'Done', icon: '★', cls: 'border-emerald-600 bg-emerald-50 text-emerald-800' },
  NO_ANSWER: { label: 'No Answer', icon: '○', cls: 'border-ink-400 bg-surface-2 text-ink-600' },
};

// Demo / trial state of a client: Active (running, with time left) or Not active (finished)
export function trialInfo(c) {
  if (!c || !c.trial_ends_at) return null;
  const end = Date.parse(c.trial_ends_at); const ms = end - Date.now();
  const abs = Math.abs(ms), d = Math.floor(abs / 86400000), h = Math.floor((abs % 86400000) / 3600000), m = Math.floor((abs % 3600000) / 60000);
  const span = d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  const demo = c.trial_count > 1 ? `Demo #${c.trial_count}` : 'Demo';
  const ends = new Date(end).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
  if (c.status === 'DONE_SOLD') return { state: 'DONE', demo, ends, line: `${demo} · bought` };
  return ms >= 0
    ? { state: 'ACTIVE', demo, ends, left: `${span} left`, soon: ms <= 2 * 86400000, line: `${demo} ends ${ends}` }
    : { state: 'NOT_ACTIVE', demo, ends, left: `ended ${span} ago`, soon: false, line: `${demo} ended ${ends}` };
}

export const WEBINAR = ['PENDING', 'REGISTERED', 'ATTENDED', 'NOT_ATTENDED'];
export const ACCOUNT = ['NOT_OPENED', 'IN_PROGRESS', 'OPENED'];

// Activity log: label + colour per action (matches server/src/activity.js)
export const ACTION_META = {
  LOGIN: { label: 'Signed in', tone: 'bg-surface-2 text-ink-500', icon: '→' },
  LOGIN_FAILED: { label: 'Failed sign-in', tone: 'bg-coral-tint text-coral', icon: '!' },
  PHONE_CHANGED: { label: 'Login number changed', tone: 'bg-surface-2 text-ink-500', icon: '📱' },
  LOGOUT: { label: 'Signed out', tone: 'bg-surface-2 text-ink-500', icon: '←' },
  PASSWORD_CHANGED: { label: 'Password changed', tone: 'bg-surface-2 text-ink-500', icon: '🔑' },
  CALL_START: { label: 'Call started', tone: 'bg-sky-tint text-sky', icon: '📞' },
  CALL_HANGUP: { label: 'Call ended', tone: 'bg-sky-tint text-sky', icon: '📴' },
  CALL_CANCELLED: { label: 'Call cancelled', tone: 'bg-amber-tint text-amber-dark', icon: '✕' },
  CALL_SAVED: { label: 'Call result saved', tone: 'bg-signal-greenTint text-signal-greenDark', icon: '✓' },
  CLIENT_TAKEOVER: { label: 'Took over client', tone: 'bg-amber-tint text-amber-dark', icon: '⇄' },
  CLIENT_CREATED: { label: 'Client added', tone: 'bg-signal-greenTint text-signal-greenDark', icon: '+' },
  CLIENT_UPDATED: { label: 'Client updated', tone: 'bg-surface-2 text-ink-700', icon: '✎' },
  REMARK_UPDATED: { label: 'Remark edited', tone: 'bg-surface-2 text-ink-700', icon: '✎' },
  CLIENT_ASSIGNED: { label: 'Client assigned', tone: 'bg-amber-tint text-amber-dark', icon: '⇄' },
  CLIENT_DELETED: { label: 'Client deleted', tone: 'bg-coral-tint text-coral', icon: '🗑' },
  CLIENT_SHARED: { label: 'Client shared', tone: 'bg-sky-tint text-sky', icon: '⇄' },
  INBOX_DISTRIBUTED: { label: 'Fresh clients distributed', tone: 'bg-signal-greenTint text-signal-greenDark', icon: '⇉' },
  ATTENDANCE_SET: { label: 'Attendance changed', tone: 'bg-amber-tint text-amber-dark', icon: '🗓' },
  OTP_REQUESTED: { label: 'Login OTP requested', tone: 'bg-surface-2 text-ink-500', icon: '🔐' },
  DEVICE_TRUSTED: { label: 'New device verified', tone: 'bg-signal-greenTint text-signal-greenDark', icon: '✓' },
  DEVICE_REVOKED: { label: 'Devices removed', tone: 'bg-coral-tint text-coral', icon: '✕' },
  IMPORT: { label: 'Leads imported', tone: 'bg-signal-greenTint text-signal-greenDark', icon: '⬆' },
  USER_CREATED: { label: 'User created', tone: 'bg-surface-2 text-ink-700', icon: '+' },
  USER_UPDATED: { label: 'User updated', tone: 'bg-surface-2 text-ink-700', icon: '✎' },
  SETTINGS_UPDATED: { label: 'Settings changed', tone: 'bg-surface-2 text-ink-700', icon: '⚙' },
};
export const ACTION_GROUPS = [
  ['calls', 'Calls'], ['clients', 'Client changes'], ['login', 'Sign-ins'], ['admin', 'Admin actions'],
];

// Random id of THIS browser / PC. The server remembers (after an OTP) which ids are verified for a user.
export function getDeviceId() {
  try {
    let id = localStorage.getItem('crm_device');
    if (!id || id.length < 16) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}-${Math.random()}`).replace(/[^a-z0-9-]/gi, '');
      localStorage.setItem('crm_device', id);
    }
    return id;
  } catch { return 'no-storage-' + navigator.userAgent.length + '-' + Math.random().toString(36).slice(2, 12); }
}

// Phone / tablet browsers can open the dial pad directly; a PC cannot.
export const isMobileDevice = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

// ---- WhatsApp message after a call ---------------------------------------------------------------------------------
// Fills {name} {executive} {zoom_link} {group_link} {callback_time}. A paragraph whose value is empty (e.g. an executive who has
// not saved his Zoom link yet) is left out completely instead of being sent half-empty.
export function renderTemplate(tpl, vars) {
  const out = [];
  for (const para of String(tpl || '').split(/\n{2,}/)) {
    let drop = false;
    const txt = para.replace(/\{(\w+)\}/g, (m, k) => {
      if (!(k in vars)) return m;
      if (vars[k] === '' || vars[k] == null) { drop = true; return ''; }
      return vars[k];
    });
    if (!drop) out.push(txt.trim());
  }
  return out.join('\n\n').trim();
}
// wa.me link that opens WhatsApp (app on mobile, WhatsApp Web / desktop on PC) with the message ready to send
export function waUrl(mobile, text) {
  let d = String(mobile || '').replace(/\D/g, '');
  if (d.length === 10) d = `91${d}`;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

// Every WhatsApp message carries the group-join link (admin can switch this off). Added only when the text has no {group_link} yet.
export function withGroupLink(tplText, groupLink, on = true) {
  const t = String(tplText || '');
  if (!on || !groupLink || t.includes('{group_link}')) return t;
  return `${t.trimEnd()}\n\nJoin our WhatsApp group:\n{group_link}`;
}

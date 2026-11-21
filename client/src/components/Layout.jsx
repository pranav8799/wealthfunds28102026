import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/Auth';
import { useDialer } from '../context/Dialer';
import { useToast } from '../context/Toast';
import { Modal, PhoneIcon } from './ui';
import { isMobileDevice } from '../utils';
import api, { errMsg } from '../api';

const I = ({ d }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d={d} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const ICONS = {
  overview: 'M3 3h8v8H3zM13 3h8v5h-8zM13 12h8v9h-8zM3 15h8v6H3z',
  clients: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  call: 'M22 16.92v3a2 2 0 01-2.18 2 19.8 19.8 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.8 19.8 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z',
  history: 'M12 8v4l3 3M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8M3 3v5h5',
  analytics: 'M3 3v18h18M18 17V9M13 17V5M8 17v-4',
  team: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M11 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z',
  attendance: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM9 16l2 2 4-4',
  chat: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  phone: 'M12 18h.01M8 2h8a2 2 0 012 2v16a2 2 0 01-2 2H8a2 2 0 01-2-2V4a2 2 0 012-2z',
};

const NAV = {
  admin: [
    { to: '/admin', label: 'Dashboard', icon: 'overview', end: true },
    { to: '/admin/clients', label: 'All Clients', icon: 'clients' },
    { to: '/admin/inbox', label: 'Fresh Inbox', icon: 'inbox' },
    { to: '/admin/attendance', label: 'Attendance', icon: 'attendance' },
    { to: '/admin/executives', label: 'Executives', icon: 'team' },
    { to: '/admin/whatsapp', label: 'WhatsApp Messages', icon: 'chat' },
    { to: '/admin/activity', label: 'Activity Log', icon: 'activity' },
    { to: '/admin/calls', label: 'Call Logs', icon: 'history' },
    { to: '/admin/analytics', label: 'Analytics', icon: 'analytics' },
  ],
  executive: [
    { to: '/executive/inbox', label: 'Inbox', icon: 'inbox', badge: true },
    { to: '/executive/dashboard', label: 'My Dashboard', icon: 'overview' },
    { to: '/executive/call-desk', label: 'Call Desk', icon: 'call' },
    { to: '/executive/phone', label: 'Phone Mode', icon: 'phone' },
    { to: '/executive/clients', label: 'All Clients', icon: 'clients' },
    { to: '/executive/attendance', label: 'My Attendance', icon: 'attendance' },
    { to: '/executive/calls', label: 'My Calls', icon: 'history' },
    { to: '/executive/activity', label: 'My Activity', icon: 'activity' },
  ],
};

// Top bar: callbacks that are due and demos (trials) that end soon / have just ended. Refreshes every minute, pops a message when something new appears.
function AlertBar({ base }) {
  const toast = useToast();
  const [a, setA] = useState(null);
  const prev = useState({ cur: null })[0];
  useEffect(() => {
    const get = () => api.get('/leads/alerts/summary').then((r) => {
      setA(r.data);
      const p = prev.cur;
      if (p) {
        if (r.data.trial_ending > p.trial_ending) toast(`⏱ ${r.data.trial_ending - p.trial_ending} demo(s) ending within 24 hours`);
        if (r.data.trial_over > p.trial_over) toast(`○ ${r.data.trial_over - p.trial_over} demo(s) just ended — follow up now`);
        if (r.data.callbacks_due > p.callbacks_due) toast(`↻ ${r.data.callbacks_due - p.callbacks_due} callback(s) are due`);
      }
      prev.cur = r.data;
    }).catch(() => {});
    get();
    const t = setInterval(get, 60000);
    return () => clearInterval(t);
  }, [toast, prev]);
  if (!a || (!a.callbacks_due && !a.trial_ending && !a.trial_over)) return null;
  const chip = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold';
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber/40 bg-amber-tint px-3 py-2">
      <span className="text-xs font-extrabold uppercase tracking-wider text-amber-dark">Alerts</span>
      {a.callbacks_due > 0 && <NavLink to={`${base}/clients?followup=due`} className={`${chip} bg-white text-amber-dark hover:brightness-95`}>↻ {a.callbacks_due} callback{a.callbacks_due > 1 ? 's' : ''} due</NavLink>}
      {a.trial_ending > 0 && <NavLink to={`${base}/clients?status=TRIAL_ENDING`} className={`${chip} bg-white text-sky hover:brightness-95`}>⏱ {a.trial_ending} demo{a.trial_ending > 1 ? 's' : ''} ending soon{a.ending?.[0] ? ` — ${a.ending[0].name}` : ''}</NavLink>}
      {a.trial_over > 0 && <NavLink to={`${base}/clients?status=TRIAL_EXPIRED`} className={`${chip} bg-white text-coral hover:brightness-95`}>○ {a.trial_over} demo{a.trial_over > 1 ? 's' : ''} ended — follow up</NavLink>}
    </div>
  );
}

function Shell({ panel }) {
  const { user, logout } = useAuth();
  const { call } = useDialer();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState(false);   // false | 'phone' | 'zoom'
  const [fresh, setFresh] = useState(0);
  useEffect(() => setOpen(false), [location.pathname]);
  // Number of fresh clients waiting in the executive's Inbox (sidebar badge)
  useEffect(() => {
    if (panel !== 'executive') return undefined;
    const get = () => api.get('/inbox/count').then((r) => setFresh(r.data.fresh)).catch(() => {});
    get();
    const t = setInterval(get, 60000);
    return () => clearInterval(t);
  }, [panel, location.pathname]);
  const admin = panel === 'admin';
  const items = NAV[panel];
  const navigate = useNavigate();
  const onMobile = isMobileDevice();
  const onPhonePage = location.pathname.endsWith('/phone');
  const [phoneOnline, setPhoneOnline] = useState(false);

  // MOBILE: whichever CRM page is open on the phone, when the executive presses Call on the PC the phone opens
  // Phone Mode by itself (that page then receives the number and opens the dial pad).
  useEffect(() => {
    if (admin || !onMobile || onPhonePage) return undefined;
    let stop = false;
    const check = () => api.get('/phone/pending').then((r) => { if (!stop && r.data.pending) navigate('/executive/phone'); }).catch(() => {});
    check();
    const t = setInterval(check, 1500);
    const onShow = () => { if (!document.hidden) check(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { stop = true; clearInterval(t); document.removeEventListener('visibilitychange', onShow); };
  }, [admin, onMobile, onPhonePage, navigate]);

  // PC: small green dot on the Call button = the executive's phone is connected
  useEffect(() => {
    if (admin || onMobile) return undefined;
    const get = () => api.get('/phone/status').then((r) => setPhoneOnline(r.data.phoneOnline)).catch(() => {});
    get();
    const t = setInterval(get, 5000);
    return () => clearInterval(t);
  }, [admin, onMobile]);

  // Small Call button in the navbar: phone -> Phone Mode (dial pad); PC -> Call Desk
  const callBtn = !admin && (
    <NavLink to={onMobile ? '/executive/phone' : '/executive/call-desk'}
      title={onMobile ? 'Phone Mode — calls from your PC open here' : phoneOnline ? 'Call Desk — your phone is connected' : 'Call Desk — phone not connected'}
      className="inline-flex items-center gap-1.5 rounded-md bg-signal-green px-3 py-1.5 text-[13px] font-bold text-ink-950 shadow-sm hover:brightness-110">
      <PhoneIcon size={15} /> Call
      {!onMobile && <span className={`h-2 w-2 rounded-full ${phoneOnline ? 'bg-white' : 'bg-ink-950/30'}`} />}
    </NavLink>
  );
  const pill = admin ? 'bg-amber/20 text-amber' : 'bg-signal-green/20 text-signal-green';

  return (
    <div className="flex min-h-screen flex-col bg-surface-0 lg:flex-row">
      <div className="sticky top-0 z-30 flex items-center gap-3 bg-ink-950 px-4 py-3.5 text-white lg:hidden">
        <button aria-label="Open menu" onClick={() => setOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-ink-800">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
        <div className="flex h-[26px] w-[26px] items-center justify-center rounded-sm bg-signal-green font-display text-[13px] font-extrabold text-ink-950">W</div>
        <span className="font-display text-[15px] font-bold">{admin ? 'Admin Panel' : 'Executive Panel'}</span>
        {callBtn && <div className="ml-auto">{callBtn}</div>}
      </div>

      {open && <div className="fixed inset-0 z-40 bg-ink-950/60 lg:hidden" onClick={() => setOpen(false)} />}

      <aside className={`fixed inset-y-0 left-0 z-50 flex h-screen w-[248px] flex-shrink-0 flex-col bg-ink-950 px-4 py-6 text-ink-100 transition-transform duration-200 lg:sticky lg:top-0 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="mb-7 flex items-center justify-between px-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-[30px] w-[30px] items-center justify-center rounded-sm bg-signal-green font-display font-extrabold text-ink-950">W</div>
            <div className="leading-tight"><div className="font-display text-base font-bold text-white">WealthFund</div><div className="text-[11px] text-ink-300">Calling CRM</div></div>
          </div>
          <button aria-label="Close menu" onClick={() => setOpen(false)} className="h-8 w-8 rounded-md text-ink-300 hover:bg-ink-800 lg:hidden">✕</button>
        </div>
        <div className={`mx-2 mb-5 rounded-md px-3 py-1.5 text-center text-[11px] font-extrabold uppercase tracking-widest ${pill}`}>{admin ? 'Admin Panel' : 'Executive Panel'}</div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end}
              className={({ isActive }) => `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-ink-800 text-white' : 'text-ink-300 hover:bg-ink-800/60 hover:text-white'}`}>
              <I d={ICONS[it.icon]} />{it.label}
              {it.badge && fresh > 0 && <span className="mono-num ml-auto rounded-full bg-signal-green px-2 py-0.5 text-[11px] font-bold text-white">{fresh}</span>}
            </NavLink>
          ))}
        </nav>

        {!admin && call && !call.hangup_at && (
          <div className="mb-3 rounded-md bg-signal-green/15 px-3 py-2 text-xs font-semibold text-signal-green">● Call in progress — {call.lead_name}</div>
        )}

        <div className="mt-2 border-t border-ink-700 pt-4">
          <div className="mb-2 flex items-center gap-2.5 px-2 py-2">
            <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-ink-700 text-sm font-bold text-white">{user.name.charAt(0).toUpperCase()}</div>
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-semibold text-white">{user.name}</div>
              <div className="text-xs text-ink-300">{admin ? 'Administrator' : 'Executive'}</div>
            </div>
          </div>
          <button className="mb-2 w-full rounded-md px-3 py-2 text-left text-[13px] font-medium text-ink-300 hover:bg-ink-800 hover:text-white" onClick={() => setPw('phone')}>Account settings</button>
          {!admin && <button className="mb-2 w-full rounded-md px-3 py-2 text-left text-[13px] font-medium text-ink-300 hover:bg-ink-800 hover:text-white" onClick={() => setPw('zoom')}>🎥 My Zoom link (add / edit)</button>}
          <button className="flex w-full items-center gap-2.5 rounded-md border border-ink-700 px-3 py-2.5 text-[13.5px] font-semibold text-coral hover:bg-coral/10" onClick={logout}>
            <I d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />Sign out
          </button>
        </div>
      </aside>

      <main className="mx-auto w-full min-w-0 max-w-[1400px] flex-1 px-4 py-6 sm:px-7 lg:px-10 lg:py-9">
        {callBtn && <div className="-mt-3 mb-4 hidden items-center justify-end lg:flex">{callBtn}</div>}
        <AlertBar base={admin ? '/admin' : '/executive'} />
        <Outlet />
      </main>
      {pw && <AccountModal initialTab={pw} onClose={() => setPw(false)} />}
    </div>
  );
}

export const AdminLayout = () => <Shell panel="admin" />;
export const ExecutiveLayout = () => <Shell panel="executive" />;

// Change the login mobile number and/or the password (both need the current password)
function AccountModal({ onClose, initialTab = 'phone' }) {
  const toast = useToast();
  const { user, updateUser } = useAuth();
  const [tab, setTab] = useState(initialTab);
  const [zoom, setZoom] = useState('');
  useEffect(() => { if (user.role === 'executive') api.get('/whatsapp/templates').then((r) => setZoom(r.data.vars.zoom_link || '')).catch(() => {}); }, [user.role]);
  const [phone, setPhone] = useState('');
  const [cur, setCur] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault(); setErr('');
    setBusy(true);
    try {
      if (tab === 'zoom') {
        await api.put('/whatsapp/my-zoom', { zoom_link: zoom });
        toast(zoom.trim() ? 'Zoom link saved — it goes in your WhatsApp messages' : 'Zoom link removed');
      } else if (tab === 'phone') {
        const { data } = await api.post('/auth/change-phone', { phone, password: cur });
        updateUser(data.user); toast('Login number changed — use the new number next time');
      } else {
        if (newPw !== newPw2) { setErr('New passwords do not match'); setBusy(false); return; }
        await api.post('/auth/change-password', { oldPassword: cur, newPassword: newPw });
        toast('Password changed');
      }
      onClose();
    } catch (e2) { setErr(errMsg(e2)); setBusy(false); }
  }
  const Tab = ({ k, children }) => (
    <button type="button" onClick={() => { setTab(k); setErr(''); }} className={`flex-1 rounded-sm px-3 py-2 text-sm font-semibold transition ${tab === k ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-500'}`}>{children}</button>
  );
  return (
    <Modal title="Account settings" onClose={onClose}>
      <div className="mb-4 flex rounded-md bg-surface-2 p-1"><Tab k="phone">Login number</Tab><Tab k="password">Password</Tab>{user.role === 'executive' && <Tab k="zoom">Zoom link</Tab>}</div>
      <form onSubmit={submit} className="space-y-4">
        {tab === 'zoom' ? (
          <div>
            <label className="label">Your Zoom meeting link</label>
            <input className="input" value={zoom} onChange={(e) => setZoom(e.target.value)} placeholder="https://zoom.us/j/…" />
            <p className="mt-1 text-xs text-ink-300">Sent to your Interested clients in the WhatsApp message. Every executive has his own link.</p>
          </div>
        ) : tab === 'phone' ? (
          <>
            <div className="rounded-md bg-surface-0 px-3 py-2 text-sm text-ink-500">Current login number: <b className="mono-num text-ink-900">{user.phone}</b></div>
            <div><label className="label">New mobile number</label><input className="input" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" required /></div>
          </>
        ) : (
          <>
            <div><label className="label">New password (min 6)</label><input type="password" className="input" value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={6} autoComplete="new-password" /></div>
            <div><label className="label">Confirm new password</label><input type="password" className="input" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} required minLength={6} autoComplete="new-password" /></div>
          </>
        )}
        {tab !== 'zoom' && <div><label className="label">Current password</label><input type="password" className="input" value={cur} onChange={(e) => setCur(e.target.value)} required autoComplete="current-password" /></div>}
        {err && <div className="rounded-md bg-coral-tint px-3 py-2 text-sm text-coral">{err}</div>}
        <button className="btn-dark w-full" disabled={busy}>{busy ? 'Saving…' : tab === 'zoom' ? 'Save Zoom link' : tab === 'phone' ? 'Change login number' : 'Update password'}</button>
      </form>
    </Modal>
  );
}

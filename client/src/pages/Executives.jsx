import { useEffect, useState, useCallback } from 'react';
import api, { errMsg } from '../api';
import { useAuth } from '../context/Auth';
import { Link } from 'react-router-dom';
import { useToast } from '../context/Toast';
import { PageHeader, Modal, Spinner, Empty } from '../components/ui';
import { fmtDateTime } from '../utils';

export default function Executives() {
  const { user, base } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState(null);
  const [edit, setEdit] = useState(null); // {} = new, user = reset
  const [devs, setDevs] = useState(null);  // user whose verified devices are shown
  const [pw, setPw] = useState(null);      // user whose stored password is shown
  const load = useCallback(() => api.get('/users').then((r) => setUsers(r.data)).catch((e) => toast(errMsg(e), 'err')), [toast]);
  useEffect(() => { load(); }, [load]);

  async function toggle(u) {
    try { await api.put(`/users/${u.id}`, { active: !u.active }); load(); } catch (e) { toast(errMsg(e), 'err'); }
  }

  return (
    <>
      <PageHeader title="Executives" subtitle="Create logins for your calling team.">
        <button className="btn-dark" onClick={() => setEdit({})}>＋ Add executive</button>
      </PageHeader>
      <OtpRequests />
      <section className="card overflow-hidden">
        {!users ? <Spinner /> : users.length === 0 ? <Empty>No users yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead><tr>{['Name', 'Mobile (login)', 'Role', 'Zoom link', 'Status', 'Devices', 'Last sign-in', 'Last activity', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="td whitespace-nowrap font-semibold">{u.name}</td>
                    <td className="td mono-num">{u.phone}</td>
                    <td className="td capitalize">{u.role}</td>
                    <td className="td max-w-[160px]">{u.role === 'executive' ? (u.zoom_link ? <a className="block truncate text-signal-greenDark underline" href={u.zoom_link} target="_blank" rel="noreferrer" title={u.zoom_link}>{u.zoom_link.replace(/^https?:\/\//, '')}</a> : <span className="text-amber-dark">not set</span>) : '—'}</td>
                    <td className="td"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${u.active ? 'bg-signal-greenTint text-signal-greenDark' : 'bg-coral-tint text-coral'}`}>{u.active ? 'Active' : 'Disabled'}</span></td>
                    <td className="td whitespace-nowrap"><button className="underline hover:text-signal-greenDark" onClick={() => setDevs(u)} title="Verified PCs / browsers">{u.devices} verified</button></td>
                    <td className="td whitespace-nowrap">{fmtDateTime(u.last_login_at)}</td>
                    <td className="td whitespace-nowrap">{fmtDateTime(u.last_activity_at)}</td>
                    <td className="td whitespace-nowrap">
                      <Link to={`${base}/activity?user=${u.id}`} className="btn-ghost !px-3 !py-1.5">Activity</Link>{' '}
                      <button className="btn-ghost !px-3 !py-1.5" onClick={() => setPw(u)} title="Show the saved password">🔑 Password</button>{' '}
                      <button className="btn-ghost !px-3 !py-1.5" onClick={() => setEdit(u)}>Edit / reset password</button>{' '}
                      {u.id !== user.id && <button className="btn-ghost !px-3 !py-1.5" onClick={() => toggle(u)}>{u.active ? 'Disable' : 'Enable'}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {pw && <PasswordModal u={pw} onClose={() => setPw(null)} />}
      {devs && <DevicesModal u={devs} onClose={() => { setDevs(null); load(); }} />}
      {edit && <UserModal u={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); }} />}
    </>
  );
}

// Admin only: the password is stored AES-encrypted (login uses the bcrypt hash). Every view is written to the Activity Log.
function PasswordModal({ u, onClose }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => { api.get(`/users/${u.id}/password`).then((r) => setState({ pw: r.data.password, msg: r.data.message })).catch((e) => setState({ err: errMsg(e) })); }, [u.id]);
  return (
    <Modal title={`${u.name} — password`} onClose={onClose}>
      {state.loading ? <Spinner /> : state.err ? <div className="rounded-md bg-coral-tint px-3 py-2 text-sm text-coral">{state.err}</div> : state.pw ? (
        <div className="space-y-2">
          <div className="text-xs text-ink-500">Login mobile: <b className="mono-num">{u.phone}</b></div>
          <div className="mono-num select-all rounded-md bg-surface-0 px-4 py-3 text-center font-display text-2xl font-bold tracking-wider">{state.pw}</div>
          <p className="text-xs text-ink-300">This view is recorded in the Activity Log.</p>
        </div>
      ) : <div className="rounded-md bg-amber-tint px-3 py-2 text-sm text-amber-dark">{state.msg || 'Password not stored yet.'}</div>}
    </Modal>
  );
}

function UserModal({ u, onClose, onDone }) {
  const toast = useToast();
  const isNew = !u.id;
  const [name, setName] = useState(u.name || '');
  const [phone, setPhone] = useState(u.phone || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(u.role || 'executive');
  const [zoom, setZoom] = useState(u.zoom_link || '');
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault(); setErr('');
    try {
      if (isNew) await api.post('/users', { name, phone, password, role, zoom_link: zoom });
      else await api.put(`/users/${u.id}`, { name, zoom_link: zoom, ...(phone !== u.phone ? { phone } : {}), ...(password ? { password } : {}) });
      toast(isNew ? 'Executive added' : 'Saved'); onDone();
    } catch (e2) { setErr(errMsg(e2)); }
  }
  return (
    <Modal title={isNew ? 'Add executive' : 'Edit user'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div><label className="label">Mobile number (used to login)</label><input className="input" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} required /></div>
        {isNew && (
          <div><label className="label">Role</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value)}><option value="executive">Executive</option><option value="admin">Admin</option></select>
          </div>
        )}
        {(isNew ? role === 'executive' : u.role === 'executive') && (
          <div><label className="label">Zoom link of this executive</label>
            <input className="input" value={zoom} onChange={(e) => setZoom(e.target.value)} placeholder="https://zoom.us/j/…" />
            <p className="mt-1 text-xs text-ink-300">Sent in his WhatsApp message to Interested clients. The executive can also set it himself (Account settings → Zoom link).</p></div>
        )}
        <div><label className="label">{isNew ? 'Password (min 6)' : 'New password (leave empty to keep)'}</label>
          <input className="input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} required={isNew} minLength={isNew ? 6 : undefined} autoComplete="new-password" /></div>
        {err && <div className="rounded-md bg-coral-tint px-3 py-2 text-sm text-coral">{err}</div>}
        <button className="btn-dark w-full">{isNew ? 'Create' : 'Save'}</button>
      </form>
    </Modal>
  );
}

// Login OTPs waiting to be told to the executives (OTP_MODE=admin). Refreshes by itself.
function OtpRequests() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    const get = () => api.get('/auth/otp/pending').then((r) => setRows(r.data)).catch(() => {});
    get();
    const t = setInterval(get, 4000);
    return () => clearInterval(t);
  }, []);
  if (!rows.length) return (
    <section className="card mb-5 px-5 py-3 text-sm text-ink-500">🔐 <b>Login OTPs</b> — none waiting. When an executive signs in from a new computer, the OTP appears here for you to tell him.</section>
  );
  return (
    <section className="mb-5 rounded-lg border-2 border-amber bg-amber-tint p-4">
      <div className="mb-2 text-sm font-bold text-amber-dark">🔐 Login OTP requests — tell the executive this code</div>
      <ul className="divide-y divide-amber/30">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-5 gap-y-1 py-2">
            <div className="min-w-[160px]"><div className="font-semibold">{r.name}</div><div className="mono-num text-xs text-ink-500">{r.phone}</div></div>
            <div className="mono-num font-display text-3xl font-bold tracking-[0.25em] text-ink-950">{r.code}</div>
            <div className="min-w-0 flex-1 truncate text-xs text-ink-500" title={r.device_label}>{r.device_label}</div>
            <div className="whitespace-nowrap text-xs text-ink-500">valid until {fmtDateTime(r.expires_at)}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DevicesModal({ u, onClose }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const load = useCallback(() => api.get(`/users/${u.id}/devices`).then((r) => setRows(r.data)).catch((e) => toast(errMsg(e), 'err')), [u.id, toast]);
  useEffect(() => { load(); }, [load]);
  async function remove(id) {
    try { await api.delete(`/users/${u.id}/devices`, { params: id ? { device: id } : {} }); toast('Removed — OTP will be asked again on the next sign-in'); load(); }
    catch (e) { toast(errMsg(e), 'err'); }
  }
  return (
    <Modal title={`${u.name} — verified devices`} onClose={onClose} wide>
      {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No verified device. The next sign-in will ask for an OTP.</Empty> : (
        <ul className="divide-y divide-border-subtle">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold" title={r.label}>{r.label}</div>
                <div className="text-xs text-ink-500">Verified {fmtDateTime(r.created_at)} · last used {fmtDateTime(r.last_used_at)} · IP {r.ip || '—'}</div>
              </div>
              <button className="btn-ghost !px-3 !py-1.5" onClick={() => remove(r.id)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      {rows && rows.length > 1 && <button className="btn-red mt-4 w-full" onClick={() => remove(0)}>Remove all devices</button>}
      <p className="mt-3 text-xs text-ink-300">After a device is removed, the executive must enter a new OTP the next time he signs in from that PC. Resetting his password removes all devices too.</p>
    </Modal>
  );
}

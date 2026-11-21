import { useEffect, useState, useCallback } from 'react';
import api, { errMsg } from '../api';
import { useAuth } from '../context/Auth';
import { useDialer } from '../context/Dialer';
import { useToast } from '../context/Toast';
import { PageHeader, Kpi, Badge, CallCount, Pagination, PhoneIcon, Spinner, Empty, Modal, ConfirmModal } from '../components/ui';
import LeadDrawer from '../components/LeadDrawer';
import ImportModal from '../components/ImportModal';
import ShareModal from '../components/ShareModal';
import { useSearchParams } from 'react-router-dom';
import { label, WEBINAR, ACCOUNT, STATUSES as STATUS_TABS, STATUS_META, trialInfo, fmtDateTime } from '../utils';

const LIMIT = 20;
// Why a client of ANOTHER executive is visible in my "All Clients"
const poolTag = (c, days) => (c.pool_reason === 'CALLBACK' ? 'Call back' : c.pool_reason === 'NO_ANSWER' ? 'Not pickup' : c.pool_reason === 'NOT_INTERESTED' ? 'Not interested' : c.pool_reason ? `${days}-day return` : '');

// Callback / follow-up date and the demo (trial) state: Active with time left, or Not active
function DueCell({ c }) {
  const t = trialInfo(c);
  const due = (c.status === 'CALLBACK' || c.status === 'FOLLOWUP') && c.followup_at;
  if (!t && !due) return <span className="text-[#a9b0c6]">—</span>;
  const overdue = due && Date.parse(c.followup_at) < Date.now();
  return (
    <div className="space-y-1 text-xs">
      {due && (
        <div className={`font-semibold ${overdue ? 'text-coral' : 'text-ink-700'}`} title={c.status === 'CALLBACK' ? 'Call back on' : 'Follow-up on'}>
          {c.status === 'CALLBACK' ? '↻' : '📋'} {fmtDateTime(c.followup_at)}{overdue && ' · due'}
        </div>
      )}
      {t && t.state !== 'DONE' && (
        <div className="flex flex-wrap items-center gap-1" title={t.line}>
          <span className={`rounded-full px-2 py-0.5 font-bold ${t.state === 'ACTIVE' ? (t.soon ? 'bg-amber-tint text-amber-dark' : 'bg-signal-greenTint text-signal-greenDark') : 'bg-surface-2 text-ink-500'}`}>
            {t.state === 'ACTIVE' ? '● Active' : '○ Not active'}
          </span>
          <span className="text-ink-500">{t.demo} · {t.left}</span>
          <span className="w-full text-ink-300">{t.state === 'ACTIVE' ? 'ends' : 'ended'} {t.ends}</span>
        </div>
      )}
    </div>
  );
}

export default function Clients() {
  const { user, isAdmin } = useAuth();
  const { startCall, tick } = useDialer();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [minCalls, setMinCalls] = useState(6);
  const [poolDays, setPoolDays] = useState(10);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [execs, setExecs] = useState([]);
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState(null);
  const [sharing, setSharing] = useState(null);
  const [deleting, setDeleting] = useState(null); // a client, or 'bulk'
  const [picked, setPicked] = useState([]);
  const [assignTo, setAssignTo] = useState('');
  const [sp] = useSearchParams();   // links from the alert bar: ?status=TRIAL_ENDING  ?followup=due
  const [f, setF] = useState({ search: '', status: sp.get('status') || '', executive: '', calls: '', webinar: '', account: '', group: '', scope: '', sort: 'smart', followup: sp.get('followup') || '' });
  const [q, setQ] = useState('');
  useEffect(() => { // alert-bar links change the URL while this page is open
    if (sp.get('status') || sp.get('followup')) { setF((x) => ({ ...x, status: sp.get('status') || '', followup: sp.get('followup') || '' })); setPage(1); }
  }, [sp]);

  useEffect(() => { api.get('/users').then((r) => setExecs(r.data.filter((u) => u.active && u.role === 'executive'))); }, []);
  useEffect(() => { const t = setTimeout(() => { setF((x) => ({ ...x, search: q })); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // sort 'smart' (default): callbacks / follow-ups due today come first, date-wise — the server also sorts Callback / Trial views by date
      const params = { ...f, page, limit: LIMIT };
      const { data } = await api.get('/leads', { params });
      setRows(data.data); setTotal(data.total); setMinCalls(data.minCalls); setPoolDays(data.poolDays || 10); setPicked([]);
    } catch (e) { toast(errMsg(e), 'err'); }
    finally { setLoading(false); }
  }, [f, page, toast]);
  useEffect(() => { load(); }, [load, tick]);

  const setFilter = (k, v) => { setF((x) => ({ ...x, [k]: v })); setPage(1); };
  const notMine = (c) => !isAdmin && c.executive_id !== user.id;          // another executive's client shown from the shared pool
  // Done/Sold is view-only for executives; also lock opened accounts of others
  const locked = (c) =>
    (!isAdmin && c.status === 'DONE_SOLD') ||
    (c.account_status === 'OPENED' && c.executive_id && c.executive_id !== user.id && !isAdmin) ||
    notMine(c);

  async function patch(c, body) {
    try { await api.patch(`/leads/${c.id}`, body); load(); } catch (e) { toast(errMsg(e), 'err'); }
  }

  const CallBtn = ({ c }) => (isAdmin ? null :
    <button className="btn-green !px-3 !py-2" disabled={locked(c) && !notMine(c)} title={notMine(c) ? `${c.executive_name || 'Another executive'}'s client (${poolTag(c, poolDays)}) — calling takes it over` : locked(c) ? `Account opened — ${c.executive_name}'s client` : 'Call'} onClick={() => startCall(c)}>
      <PhoneIcon /> Call
    </button>
  );
  async function take(c) {
    try { await api.post(`/leads/${c.id}/take`); toast(`${c.name} is now yours — see it in your Inbox`); load(); } catch (e) { toast(errMsg(e), 'err'); }
  }
  const TakeBtn = ({ c }) => (notMine(c) ?
    <button className="btn-dark !px-3 !py-2" title={`Take ${c.name} from ${c.executive_name || 'the pool'} — it becomes yours (no call)`} onClick={() => take(c)}>✋ Take</button> : null);
  async function bulkAssign() {
    try {
      await api.post('/leads/bulk-assign', { ids: picked, executive_id: assignTo === 'none' ? null : Number(assignTo) });
      toast(`${picked.length} client(s) updated`); setAssignTo(''); load();
    } catch (e) { toast(errMsg(e), 'err'); }
  }
  const allPicked = rows.length > 0 && rows.every((r) => picked.includes(r.id));
  const togglePick = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const Actions = ({ c }) => (
    <div className="flex items-center gap-1.5">
      {!notMine(c) && <button className="rounded-md border border-border-strong bg-white px-2.5 py-1.5 text-xs font-bold text-ink-800 hover:bg-surface-2 disabled:opacity-40" disabled={locked(c)} title="Edit client" onClick={() => setEditing(c)}>✎ Edit</button>}
      {c.executive_id === user.id && c.account_status !== 'OPENED' && <button className="rounded-md border border-border-strong bg-white px-2.5 py-1.5 text-xs font-bold text-ink-800 hover:bg-surface-2" title="Share with another executive" onClick={() => setSharing(c)}>⇄ Share</button>}
      {(isAdmin || (c.executive_id === user.id && c.account_status !== 'OPENED')) && <button className="rounded-md border border-coral/40 bg-white px-2.5 py-1.5 text-xs font-bold text-coral hover:bg-coral-tint" title="Delete client" onClick={() => setDeleting(c)}>🗑 Delete</button>}
    </div>
  );
  const sel = 'rounded-md border border-border-subtle bg-white px-2 py-1.5 text-xs font-semibold outline-none focus:border-signal-green disabled:opacity-50';

  return (
    <>
      <PageHeader title="All Clients" subtitle="Every lead, with call progress, group, webinar and account status.">
        <button className="btn-ghost" onClick={() => setAdding(true)}>＋ Add client</button>
        {isAdmin && <button className="btn-green" onClick={() => setImporting(true)}>⬆ Import</button>}
      </PageHeader>

      <section className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Kpi label="Matching clients" value={total} />
        <Kpi label="This page" value={rows.length} />
        <Kpi label="Min. calls per client" value={minCalls} />
      </section>

      <section className="card overflow-hidden">
        {/* Status chips — single row, compact */}
        <div className="flex flex-nowrap items-center gap-1 overflow-x-auto border-b border-border-subtle px-3 py-2">
          <button type="button" onClick={() => setFilter('status', '')}
            className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-bold transition ${!f.status ? 'border-ink-800 bg-ink-800 text-white' : 'border-border-subtle bg-white text-ink-600 hover:border-border-strong'}`}>
            All
          </button>
          {STATUS_TABS.map((s) => (
            <button type="button" key={s.value} title={s.label} onClick={() => setFilter('status', f.status === s.value ? '' : s.value)}
              className={`inline-flex shrink-0 items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] font-bold transition ${f.status === s.value ? 'border-ink-800 bg-ink-800 text-white' : 'border-border-subtle bg-white text-ink-600 hover:border-border-strong'}`}>
              <span aria-hidden className="text-[10px]">{s.icon}</span> {s.label}
            </button>
          ))}
          <button type="button" title="Trial ending within 2 days" onClick={() => setFilter('status', f.status === 'TRIAL_ENDING' ? '' : 'TRIAL_ENDING')}
            className={`inline-flex shrink-0 items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] font-bold transition ${f.status === 'TRIAL_ENDING' ? 'border-amber bg-amber-tint text-amber-dark' : 'border-border-subtle bg-white text-ink-600 hover:border-border-strong'}`}>
            ⏱ Ending
          </button>
          <button type="button" title="Trial already expired" onClick={() => setFilter('status', f.status === 'TRIAL_EXPIRED' ? '' : 'TRIAL_EXPIRED')}
            className={`inline-flex shrink-0 items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] font-bold transition ${f.status === 'TRIAL_EXPIRED' ? 'border-coral bg-coral-tint text-coral' : 'border-border-subtle bg-white text-ink-600 hover:border-border-strong'}`}>
            ⏱ Expired
          </button>
        </div>

        {/* Compact filters — search + essential only */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-3 py-2">
          <input className="input !py-1.5 min-w-[180px] flex-1" placeholder="Search name, mobile, executive, ID…" value={q} onChange={(e) => setQ(e.target.value)} />
          {!isAdmin && (
            <select className="input !py-1.5 !w-auto" value={f.scope} onChange={(e) => setFilter('scope', e.target.value)}>
              <option value="">Whose: all</option>
              <option value="mine">Only mine</option>
              <option value="pool">Shared pool</option>
            </select>
          )}
          {isAdmin && (
            <select className="input !py-1.5 !w-auto" value={f.executive} onChange={(e) => setFilter('executive', e.target.value)}>
              <option value="">All executives</option>
              <option value="mine">My clients</option>
              <option value="unassigned">Unassigned</option>
              {execs.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
          <select className="input !py-1.5 !w-auto" value={f.followup || ''} onChange={(e) => setFilter('followup', e.target.value)}>
            <option value="">Callbacks: any</option>
            <option value="overdue">Overdue</option>
            <option value="today">Today</option>
            <option value="due">Due now</option>
            <option value="upcoming">Coming days</option>
          </select>
          <select className="input !py-1.5 !w-auto" value={f.sort || 'smart'} onChange={(e) => setFilter('sort', e.target.value)}>
            <option value="smart">Due callbacks first</option>
            <option value="newest">Newest</option>
            <option value="callback">Callback date</option>
            <option value="trial">Trial expiry</option>
            <option value="name">Name A–Z</option>
            <option value="calls">Most calls</option>
          </select>
        </div>

        {picked.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle bg-signal-greenTint px-4 py-2.5 text-sm">
            <b>{picked.length} selected</b>
            {isAdmin && <>
            <select className="rounded-md border border-border-subtle bg-white px-2 py-1.5 text-xs font-semibold" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
              <option value="">Assign to…</option><option value="none">Unassign</option>
              {execs.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <button className="btn-dark !px-3 !py-1.5" disabled={!assignTo} onClick={bulkAssign}>Apply</button>
            </>}
            <button className="btn-ghost !px-3 !py-1.5" onClick={() => setPicked([])}>Clear</button>
            <button className="btn-red ml-auto !px-3 !py-1.5" onClick={() => setDeleting('bulk')}>🗑 Delete selected</button>
          </div>
        )}

        {loading ? <Spinner /> : rows.length === 0 ? <Empty>No clients match. {isAdmin && 'Use the Import button to add clients.'}</Empty> : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block [&_.td]:!px-3 [&_.th]:!px-3">
              <table className="w-full border-collapse">
                <thead>
                  <tr>{<th className="th w-8"><input type="checkbox" aria-label="Select all" checked={allPicked} onChange={() => setPicked(allPicked ? [] : rows.map((r) => r.id))} /></th>}{['Client name', 'Mobile', 'Status', 'Callback / Demo', 'Executive', 'Remark', 'Calls', 'Group', 'Webinar', 'Account', 'Actions'].map((h) => <th key={h} className={`th ${h === 'Actions' ? 'sticky right-0 shadow-[-6px_0_8px_-6px_rgba(16,24,43,0.18)]' : ''}`}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className="hover:bg-surface-0/60">
                      {<td className="td"><input type="checkbox" aria-label={`Select ${c.name}`} checked={picked.includes(c.id)} onChange={() => togglePick(c.id)} /></td>}
                      <td className="td whitespace-nowrap"><button className="font-semibold text-ink-950 hover:text-signal-greenDark hover:underline" onClick={() => setOpen(c.id)}>{c.name}</button></td>
                      <td className="td mono-num whitespace-nowrap">{c.mobile}</td>
                      <td className="td whitespace-nowrap"><Badge value={c.status} /></td>
                      <td className="td whitespace-nowrap"><DueCell c={c} /></td>
                      <td className="td whitespace-nowrap">{c.executive_name ? <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-ink-500">{c.executive_name}</span> : <span className="text-[#a9b0c6]">Unassigned</span>}{notMine(c) && <span className="ml-1.5 rounded-full bg-amber-tint px-2 py-0.5 text-[11px] font-bold text-amber-dark">{poolTag(c, poolDays)}</span>}</td>
                      <td className="td max-w-[170px]"><div className="truncate" title={c.remark}>{c.remark || <span className="text-[#a9b0c6]">—</span>}</div></td>
                      <td className="td"><CallCount count={c.call_count} min={minCalls} /></td>
                      <td className="td">
                        <select className={sel} disabled={locked(c)} value={c.group_joined ? '1' : '0'} onChange={(e) => patch(c, { group_joined: e.target.value === '1' })}>
                          <option value="0">No</option><option value="1">Joined</option>
                        </select>
                      </td>
                      <td className="td">
                        <select className={sel} disabled={locked(c)} value={c.webinar_status} onChange={(e) => patch(c, { webinar_status: e.target.value })}>
                          {WEBINAR.map((w) => <option key={w} value={w}>{label(w)}</option>)}
                        </select>
                      </td>
                      <td className="td">
                        <select className={sel} disabled={locked(c)} value={c.account_status} onChange={(e) => patch(c, { account_status: e.target.value })}>
                          {ACCOUNT.map((w) => <option key={w} value={w}>{label(w)}</option>)}
                        </select>
                      </td>
                      <td className="td sticky right-0 whitespace-nowrap bg-white shadow-[-6px_0_8px_-6px_rgba(16,24,43,0.18)]"><div className="flex items-center gap-1.5"><CallBtn c={c} /><TakeBtn c={c} /><Actions c={c} /></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-border-subtle md:hidden">
              {rows.map((c) => (
                <li key={c.id} className="space-y-2.5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <button className="min-w-0 text-left" onClick={() => setOpen(c.id)}>
                      <div className="truncate font-semibold">{c.name}</div>
                      <div className="mono-num text-sm text-ink-500">{c.mobile}</div>
                    </button>
                    <div className="flex items-center gap-1.5"><CallBtn c={c} /><TakeBtn c={c} /></div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge value={c.status} />
                    <Badge value={c.account_status} />
                    <span className="text-xs text-ink-500">{c.executive_name || 'Unassigned'}</span>
                    {notMine(c) && <span className="rounded-full bg-amber-tint px-2 py-0.5 text-[11px] font-bold text-amber-dark">{poolTag(c, poolDays)}</span>}
                  </div>
                  <DueCell c={c} />
                  <CallCount count={c.call_count} min={minCalls} />
                  {c.remark && <p className="line-clamp-2 text-[13px] text-ink-700">{c.remark}</p>}
                  <Actions c={c} />
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <Badge value={c.group_joined ? 'YES' : 'NO'} /> <span className="text-ink-300">group</span>
                    <Badge value={c.webinar_status} /> <span className="text-ink-300">webinar</span>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={page} total={total} limit={LIMIT} onPage={setPage} />
          </>
        )}
      </section>

      {open && <LeadDrawer leadId={open} onClose={() => setOpen(null)} onChanged={load} />}
      {sharing && <ShareModal lead={sharing} onClose={() => setSharing(null)} onDone={() => { setSharing(null); load(); }} />}
      {editing && <EditClient c={editing} isAdmin={isAdmin} execs={execs} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />}
      {deleting && (
        <ConfirmModal danger title={deleting === 'bulk' ? `Delete ${picked.length} clients?` : 'Delete client?'} confirmText="Delete"
          message={deleting === 'bulk' ? `${picked.length} selected clients and all their call history will be permanently deleted. This cannot be undone.`
            : `${deleting.name} (${deleting.mobile}) and all ${deleting.call_count} call(s) of history will be permanently deleted. This cannot be undone.`}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              if (deleting === 'bulk') await api.post('/leads/bulk-delete', { ids: picked });
              else await api.delete(`/leads/${deleting.id}`);
              toast(deleting === 'bulk' ? `${picked.length} clients deleted` : 'Client deleted');
              setDeleting(null); load();
            } catch (e) { toast(errMsg(e), 'err'); setDeleting(null); }
          }} />
      )}
      {importing && <ImportModal onClose={() => setImporting(false)} onImported={load} />}
      {adding && <AddClient onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
    </>
  );
}

function AddClient({ onClose, onDone }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault(); setErr('');
    try { await api.post('/leads', { name, mobile }); toast('Client added'); onDone(); }
    catch (e2) { setErr(errMsg(e2)); }
  }
  return (
    <Modal title="Add client" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div><label className="label">Client name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div><label className="label">Mobile number</label><input className="input" inputMode="numeric" value={mobile} onChange={(e) => setMobile(e.target.value)} required /></div>
        {err && <div className="rounded-md bg-coral-tint px-3 py-2 text-sm text-coral">{err}</div>}
        <button className="btn-dark w-full">Add client</button>
      </form>
    </Modal>
  );
}

function EditClient({ c, isAdmin, execs, onClose, onDone }) {
  const toast = useToast();
  const [name, setName] = useState(c.name);
  const [mobile, setMobile] = useState(c.mobile);
  const [remark, setRemark] = useState(c.remark || '');
  const [exec, setExec] = useState(c.executive_id || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    const body = {};
    if (name.trim() !== c.name) body.name = name;
    if (remark !== (c.remark || '')) body.remark = remark;
    if (isAdmin) {
      if (mobile !== c.mobile) body.mobile = mobile;
      if (String(exec) !== String(c.executive_id || '')) body.executive_id = exec ? Number(exec) : null;
    }
    if (!Object.keys(body).length) { onClose(); return; }
    try { await api.patch(`/leads/${c.id}`, body); toast('Client updated'); onDone(); }
    catch (e2) { setErr(errMsg(e2)); setBusy(false); }
  }
  return (
    <Modal title="Edit client" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div><label className="label">Client name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div>
          <label className="label">Mobile number</label>
          <input className="input" inputMode="numeric" value={mobile} onChange={(e) => setMobile(e.target.value)} disabled={!isAdmin} required />
          {!isAdmin && <p className="mt-1 text-xs text-ink-300">Only admin can change the mobile number.</p>}
        </div>
        {isAdmin && (
          <div><label className="label">Executive</label>
            <select className="input" value={exec} onChange={(e) => setExec(e.target.value)}>
              <option value="">Unassigned</option>{execs.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}
        <div><label className="label">Remark</label><textarea className="input min-h-[90px]" value={remark} onChange={(e) => setRemark(e.target.value)} /></div>
        {err && <div className="rounded-md bg-coral-tint px-3 py-2 text-sm text-coral">{err}</div>}
        <div className="flex gap-2"><button type="button" className="btn-ghost flex-1" onClick={onClose}>Cancel</button><button className="btn-dark flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
      </form>
    </Modal>
  );
}

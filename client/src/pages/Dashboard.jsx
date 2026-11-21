import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import api, { errMsg } from '../api';
import { useAuth } from '../context/Auth';
import { useDialer } from '../context/Dialer';
import { useToast } from '../context/Toast';
import { PageHeader, Kpi, Spinner, Empty, PhoneIcon } from '../components/ui';
import { fmtDuration, fmtDateTime, ACTION_META } from '../utils';

// Admin sees the whole company; an executive sees only his own numbers.
export default function Dashboard() {
  const { user, isAdmin, base } = useAuth();
  const { tick, startCall } = useDialer();
  const toast = useToast();
  const [d, setD] = useState(null);

  useEffect(() => {
    api.get('/stats/overview').then((r) => setD(r.data)).catch((e) => toast(errMsg(e), 'err'));
  }, [tick, toast]);

  if (!d) return <Spinner />;
  const L = d.leads;
  const funnel = [
    { label: isAdmin ? 'Total leads' : 'My clients', v: L.total, c: 'bg-ink-600' },
    { label: 'Called at least once', v: L.total - L.uncalled, c: 'bg-sky' },
    { label: 'Interested', v: L.interested, c: 'bg-amber' },
    { label: 'Joined WhatsApp group', v: L.group_joined, c: 'bg-[#8b5cf6]' },
    { label: 'Webinar attended', v: L.webinar_attended, c: 'bg-[#06b6d4]' },
    { label: 'Account opened', v: L.accounts_opened, c: 'bg-signal-green' },
  ];
  const max = Math.max(1, L.total);

  return (
    <>
      <PageHeader title={`Hello, ${user.name.split(' ')[0]} 👋`} subtitle={isAdmin ? "Here's how your team and your leads are doing." : "Here's your calling day at a glance."}>
        {!isAdmin && <Link to={`${base}/call-desk`} className="btn-green"><PhoneIcon /> Start calling</Link>}
      </PageHeader>

      {isAdmin ? (
        <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi label="Total clients" value={L.total} />
          <Kpi label="Not called yet" value={L.uncalled} tone="amber" hint={`${L.pending_calls} more need ${d.minCalls}+ calls`} />
          <Kpi label="Calls today (team)" value={d.calls.today} hint={`${d.calls.connected_today} connected · ${fmtDuration(d.calls.talk_sec_today)} talk`} />
          <Kpi label="Follow-ups due" value={d.followupsDue} tone={d.followupsDue ? 'red' : undefined} />
          <Kpi label="Interested" value={L.interested} tone="green" />
          <Kpi label="Trial" value={L.trial} hint={`${L.trial_ending || 0} ending · ${L.trial_expired || 0} expired`} />
          <Kpi label="Done" value={L.done_sold} tone="green" />
          <Kpi label="Accounts opened" value={L.accounts_opened} tone="green" hint={`${L.accounts_progress} in progress`} />
        </section>
      ) : (
        <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi label="My calls today" value={d.calls.today} hint={`${d.calls.connected_today} connected · ${fmtDuration(d.calls.talk_sec_today)} talk`} />
          <Kpi label="Waiting in my queue" value={d.queue} tone="amber" hint="clients that still need calls" />
          <Kpi label="Follow-ups due" value={d.followupsDue} tone={d.followupsDue ? 'red' : undefined} />
          <Kpi label="My clients" value={L.total} />
          <Kpi label="Interested" value={L.interested} tone="green" />
          <Kpi label="Trial" value={L.trial} hint={`${L.trial_ending || 0} ending · ${L.trial_expired || 0} expired`} />
          <Kpi label="Done" value={L.done_sold} tone="green" />
          <Kpi label="Accounts opened" value={L.accounts_opened} tone="green" hint={`${L.accounts_progress} in progress`} />
        </section>
      )}

      {/* Trial & callback alerts */}
      {((d.trialsEnding && d.trialsEnding.length) || (d.trialsExpired && d.trialsExpired.length)) ? (
        <section className="mb-6 grid gap-4 lg:grid-cols-2">
          {d.trialsEnding?.length > 0 && (
            <div className="card border-amber bg-amber-tint/30 p-4">
              <h3 className="mb-2 text-sm font-bold text-amber-dark">⏱ Trial Ending</h3>
              <ul className="space-y-1.5 text-sm">
                {d.trialsEnding.map((t) => (
                  <li key={t.id} className="flex justify-between gap-2">
                    <span className="font-medium">{t.name}</span>
                    <span className="mono-num text-xs text-ink-500">{fmtDateTime(t.trial_ends_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {d.trialsExpired?.length > 0 && (
            <div className="card border-coral bg-coral-tint/30 p-4">
              <h3 className="mb-2 text-sm font-bold text-coral">⏱ Trial Expired</h3>
              <ul className="space-y-1.5 text-sm">
                {d.trialsExpired.map((t) => (
                  <li key={t.id} className="flex justify-between gap-2">
                    <span className="font-medium">{t.name}</span>
                    <span className="mono-num text-xs text-ink-500">{fmtDateTime(t.trial_ends_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ) : null}

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h3 className="mb-4 text-base font-bold">{isAdmin ? 'Client journey' : 'My client journey'}</h3>
          <div className="space-y-3">
            {funnel.map((f) => (
              <div key={f.label}>
                <div className="mb-1 flex justify-between text-[13px]"><span className="font-medium text-ink-700">{f.label}</span><span className="mono-num font-bold">{f.v}</span></div>
                <div className="h-2.5 overflow-hidden rounded-full bg-surface-2"><div className={`h-full rounded-full ${f.c}`} style={{ width: `${(f.v / max) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <h3 className="mb-4 text-base font-bold">Calls — last 7 days</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={d.calls.trend.map((t) => ({ ...t, day: t.date.slice(5) }))} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid stroke="#e2e5f0" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#8892b0' }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#8892b0' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e5f0', fontSize: 13 }} />
                <Line type="monotone" dataKey="calls" name="Calls" stroke="#10182b" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="connected" name="Connected" stroke="#12b886" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="border-b border-border-subtle px-5 py-4"><h3 className="text-base font-bold">Call-back follow-ups</h3></div>
          {d.followups.length === 0 ? <Empty>No follow-ups due. 🎉</Empty> : (
            <ul className="divide-y divide-border-subtle">
              {d.followups.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{f.name}</div>
                    <div className="text-xs text-ink-300">{fmtDateTime(f.followup_at)}{isAdmin && f.executive_name ? ` · ${f.executive_name}` : ''}</div>
                  </div>
                  {!isAdmin && <button className="btn-green !px-3 !py-2" onClick={() => startCall({ id: f.id, mobile: f.mobile, name: f.name })}><PhoneIcon /> Call</button>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {isAdmin ? (
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
              <h3 className="text-base font-bold">Live activity</h3>
              <Link to={`${base}/activity`} className="text-xs font-bold text-signal-greenDark hover:underline">View all →</Link>
            </div>
            {d.recent.length === 0 ? <Empty>No activity yet.</Empty> : (
              <ul className="divide-y divide-border-subtle">
                {d.recent.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 px-5 py-2.5">
                    <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] ${(ACTION_META[a.action] || {}).tone}`}>{(ACTION_META[a.action] || {}).icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] text-ink-800"><b>{a.user_name}</b> · {a.summary}</div>
                      <div className="text-[11px] text-ink-300">{fmtDateTime(a.created_at)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <section className="card p-5">
            <h3 className="mb-4 text-base font-bold">Today's progress</h3>
            <div className="grid grid-cols-2 gap-4">
              <Kpi label="Calls made" value={d.calls.today} />
              <Kpi label="Talk time" value={fmtDuration(d.calls.talk_sec_today)} />
            </div>
            <Link to={`${base}/activity`} className="btn-ghost mt-4 w-full">See my activity log →</Link>
          </section>
        )}
      </div>
      {isAdmin && d.leaderboard.length > 0 && (
        <section className="card mt-6 overflow-hidden">
          <div className="border-b border-border-subtle px-5 py-4"><h3 className="text-base font-bold">Today's leaderboard</h3></div>
          <ul className="divide-y divide-border-subtle">
            {d.leaderboard.map((e, i) => (
              <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                <span className="mono-num w-5 text-sm font-bold text-ink-300">{i + 1}</span>
                <Link to={`${base}/activity?user=${e.id}`} className="flex-1 truncate text-sm font-semibold hover:underline">{e.name}</Link>
                <span className="text-xs text-ink-300">{fmtDuration(e.talk_sec)}</span>
                <span className="mono-num rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-bold">{e.calls} calls</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

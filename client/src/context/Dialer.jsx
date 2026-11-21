import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import api, { errMsg } from '../api';
import { useAuth } from './Auth';
import { useToast } from './Toast';
import { Modal, PhoneIcon } from '../components/ui';
import { fmtClock, fmtDuration, fmtDateTime, OUTCOMES, WEBINAR, ACCOUNT, TRIAL_PRESETS, label, toLocalInput, isMobileDevice, renderTemplate, waUrl, withGroupLink } from '../utils';

const DialerCtx = createContext(null);
export const useDialer = () => useContext(DialerCtx);

// Opens this device's own dial pad with the number ready (works on a mobile phone).
function openPhoneDialer(mobile) {
  const a = document.createElement('a');
  a.href = `tel:${mobile}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function DialerProvider({ children }) {
  const { user } = useAuth();
  const toast = useToast();
  const [call, setCall] = useState(null);
  const [skew, setSkew] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [tick, setTick] = useState(0); // increases after every saved call so pages can refresh
  const [busy, setBusy] = useState(false);
  const [ownedPrompt, setOwnedPrompt] = useState(null);
  const [saved, setSaved] = useState(null);
  const [phoneOnline, setPhoneOnline] = useState(false);
  const nextRef = useRef(null);
  const onMobile = isMobileDevice();
  // The "Phone mode" page (opened on the mobile) must stay clear: call pop-ups belong to the PC session.
  const onPhonePage = useLocation().pathname.endsWith('/phone');

  // Resume an unfinished call after a page refresh
  useEffect(() => {
    if (!user || user.role !== 'executive' || onPhonePage) { setCall(null); return; }
    api.get('/calls/active').then((r) => {
      if (r.data.call) { setSkew(Date.parse(r.data.serverNow) - Date.now()); setCall(r.data.call); }
    }).catch(() => {});
  }, [user, onPhonePage]);

  useEffect(() => {
    if (!call || call.hangup_at) return undefined;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [call]);

  // On a PC: while a call is running, (1) check whether the executive's phone is connected and
  // (2) watch the call on the server — the phone reports "dialing" (timer restarts) and "call finished"
  // (timer stops) and then the "Call ended" pop-up opens here by itself.
  useEffect(() => {
    if (!call || call.hangup_at || onMobile) return undefined;
    const check = () => {
      api.get('/phone/status').then((r) => setPhoneOnline(r.data.phoneOnline)).catch(() => {});
      api.get('/calls/active').then((r) => {
        const c = r.data.call;
        if (!c || c.id !== call.id) return;
        if (c.hangup_at || c.started_at !== call.started_at) { setSkew(Date.parse(r.data.serverNow) - Date.now()); setCall(c); }
      }).catch(() => {});
    };
    check();
    const t = setInterval(check, 1000);
    return () => clearInterval(t);
  }, [call, onMobile]);

  const elapsed = call
    ? ((call.hangup_at ? Date.parse(call.hangup_at) : now + skew) - Date.parse(call.started_at)) / 1000
    : 0;

  const sendToPhone = useCallback(async (c) => {
    try {
      const { data } = await api.post('/phone/dial', { number: c.lead_mobile, name: c.lead_name });
      setPhoneOnline(data.phoneOnline);
      return data.phoneOnline;
    } catch { return false; }
  }, []);

  const begin = useCallback((data, opts = {}, dial = true) => {
    setSkew(Date.parse(data.serverNow) - Date.now());
    setNow(Date.now());
    setCall(data.call);
    nextRef.current = opts.onNext || null;
    if (dial && !data.call.hangup_at) {
      if (onMobile) openPhoneDialer(data.call.lead_mobile);   // phone: dial pad opens right away
      else sendToPhone(data.call);                              // PC: number is pushed to the executive's phone
    }
  }, [onMobile, sendToPhone]);

  const startCall = useCallback(async (lead, opts = {}) => {
    if (busy) return;
    if (call) { toast('Finish your current call first', 'err'); return; }
    // a client from the shared pool belongs to another executive: ask before taking it over
    if (lead.pool_reason && !opts.takeover) {
      const why = lead.pool_reason === 'CALLBACK' ? 'asked for a call back' : lead.pool_reason === 'NO_ANSWER' ? 'did not pick up' : lead.pool_reason === 'NOT_INTERESTED' ? 'was marked Not interested' : 'is Interested but has not opened an account in time';
      setOwnedPrompt({ lead, opts, message: `${lead.name} ${why} (${lead.executive_name || 'another executive'}'s client).` });
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post('/calls/start', { lead_id: lead.id, takeover: !!opts.takeover });
      begin(data, opts);
    } catch (e) {
      const d = e.response?.data;
      if (e.response?.status === 409 && d?.code === 'OWNED') setOwnedPrompt({ lead, opts, message: d.message });
      else if (e.response?.status === 409 && d?.code === 'OPEN_CALL') begin(d, opts, false);
      else toast(errMsg(e), 'err');
    } finally { setBusy(false); }
  }, [busy, call, toast, begin]);

  const hangup = async () => {
    try {
      const { data } = await api.post(`/calls/${call.id}/hangup`);
      setCall((c) => ({ ...c, hangup_at: data.hangup_at }));
    } catch (e) { toast(errMsg(e), 'err'); }
  };

  const cancelCall = async () => {
    try { await api.delete(`/calls/${call.id}`); setCall(null); toast('Call cancelled (not counted)'); }
    catch (e) { toast(errMsg(e), 'err'); }
  };

  // wa = { w: the WhatsApp window opened during the click, url } - sent to the client as soon as the call result is saved.
  // If the browser blocked the window, the "Call saved" pop-up shows a Send WhatsApp button instead.
  const save = async (form, wa) => {
    const { data } = await api.post(`/calls/${call.id}/end`, form);
    let blocked = null;
    if (wa) {
      try { if (wa.w && !wa.w.closed) wa.w.location.href = wa.url; else blocked = wa.url; } catch { blocked = wa.url; }
    }
    const info = { name: call.lead_name, duration: data.duration, count: data.call_count, wa: blocked };
    setCall(null);
    setTick((t) => t + 1);
    if (nextRef.current || blocked) setSaved(info);
    else if (data.auto_callback) toast(`Call saved — no result entered, so ${call.lead_name} is now in Call back (tomorrow 11:00)`);
    else toast(wa ? `Call saved — WhatsApp message opened for ${call.lead_name}` : `Call saved — ${fmtDuration(info.duration)} · call ${info.count}`);
  };

  return (
    <DialerCtx.Provider value={{ startCall, call, tick, busy }}>
      {children}

      {ownedPrompt && (
        <Modal title="Client already contacted" onClose={() => setOwnedPrompt(null)}>
          <p className="text-sm text-ink-700">{ownedPrompt.message}</p>
          <p className="mt-2 text-xs text-ink-300">If you take over, this client becomes yours. Earlier call history stays visible.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setOwnedPrompt(null)}>Cancel</button>
            <button className="btn-green" onClick={() => { const p = ownedPrompt; setOwnedPrompt(null); startCall(p.lead, { ...p.opts, takeover: true }); }}>
              <PhoneIcon /> Take over &amp; call
            </button>
          </div>
        </Modal>
      )}

      {call && !call.hangup_at && (
        <Modal dismissible={false}>
          <div className="flex flex-col items-center py-2 text-center">
            <div className="relative mb-8 mt-3 flex h-20 w-20 items-center justify-center rounded-full bg-signal-greenTint text-signal-greenDark ring-pulse">
              <PhoneIcon size={30} />
            </div>
            <div className="text-xs font-bold uppercase tracking-wider text-signal-greenDark">{elapsed < 3 ? 'Dialing…' : 'On call'}</div>
            <h2 className="mt-1 text-2xl font-bold">{call.lead_name}</h2>
            <div className="mono-num mt-1 text-lg font-semibold text-ink-500">{call.lead_mobile}</div>
            <div className="mono-num my-5 font-display text-5xl font-bold tracking-tight text-ink-950">{fmtClock(elapsed)}</div>

            {!onMobile && <PhoneHandoff call={call} online={phoneOnline} onResend={() => sendToPhone(call).then((ok) => toast(ok ? 'Sent to your phone' : 'Phone not connected', ok ? undefined : 'err'))} />}

            <button className="btn-red mt-4 w-full !py-3.5 text-base" onClick={hangup}>
              <span className="rotate-[135deg]"><PhoneIcon size={18} /></span> End call
            </button>
            <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-ink-300">
              {onMobile && <button className="underline hover:text-ink-700" onClick={() => openPhoneDialer(call.lead_mobile)}>Dial pad didn't open? Dial again</button>}
              {elapsed <= 5 && <button className="underline hover:text-coral" onClick={cancelCall}>Wrong click? Cancel</button>}
            </div>
          </div>
        </Modal>
      )}

      {call && call.hangup_at && <WrapUp key={call.id} call={call} duration={elapsed} onSave={save} />}

      {saved && (
        <Modal title="Call saved" onClose={() => { setSaved(null); nextRef.current = null; }}>
          <p className="text-sm text-ink-700"><b>{saved.name}</b> — {fmtDuration(saved.duration)} · call #{saved.count}</p>
          {saved.wa && (
            <a href={saved.wa} target="_blank" rel="noreferrer" className="btn-green mt-4 w-full !py-3" onClick={() => { /* keep the pop-up so "Call next" is still possible */ }}>
              💬 Send WhatsApp message to {saved.name}
            </a>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => { setSaved(null); nextRef.current = null; }}>Close</button>
            {nextRef.current && <button className="btn-green" onClick={() => { const n = nextRef.current; setSaved(null); nextRef.current = null; n?.(); }}>Call next client ▶</button>}
          </div>
        </Modal>
      )}
    </DialerCtx.Provider>
  );
}

// PC → phone: the number is pushed to the executive's phone (Phone Mode page, signed in with the same login).
function PhoneHandoff({ call, online, onResend }) {
  const [info, setInfo] = useState(null);
  useEffect(() => { api.get('/phone/info').then((r) => setInfo(r.data)).catch(() => {}); }, []);
  const url = info ? (['localhost', '127.0.0.1'].includes(location.hostname) ? info.urls[0] || location.origin : location.origin) : '';

  if (online) {
    return (
      <div className="w-full rounded-md bg-signal-greenTint px-4 py-3 text-left">
        <div className="text-sm font-bold text-signal-greenDark">📱 Number sent to your phone</div>
        <p className="mt-0.5 text-xs text-ink-700">Your phone's dial pad opens with {call.lead_mobile} (if not, tap <b>Call now</b> on the phone). When the call is over, the <b>Call ended</b> pop-up appears here automatically with the duration.</p>
        <button className="mt-1.5 text-xs font-semibold text-signal-greenDark underline" onClick={onResend}>Send again</button>
      </div>
    );
  }
  return (
    <div className="w-full rounded-md border border-amber bg-amber-tint px-4 py-3 text-left">
      <div className="text-sm font-bold text-amber-dark">📱 Waiting for your phone…</div>
      <p className="mt-0.5 text-xs text-ink-700">
        On your phone open <b className="break-all">{url ? `${url}/executive/phone` : 'the CRM → Phone Mode'}</b> and sign in with the same login. The number <b>{call.lead_mobile}</b> will appear there within a second (it waits for you for 90 seconds).
      </p>
      <button className="mt-1.5 text-xs font-semibold text-amber-dark underline" onClick={onResend}>Send again</button>
    </div>
  );
}

// After the call. Everything here is OPTIONAL — the executive can close it any time (✕ / Esc / Skip).
function WrapUp({ call, duration, onSave }) {
  const tomorrow = new Date(Date.now() + 86400000); tomorrow.setHours(11, 0, 0, 0);
  const [outcome, setOutcome] = useState('');
  const [remark, setRemark] = useState('');
  const [followup, setFollowup] = useState(toLocalInput(tomorrow));
  const [trialDays, setTrialDays] = useState(3);
  const [customDays, setCustomDays] = useState('');
  const [trialEnd, setTrialEnd] = useState('');      // optional: pick the trial end date & time instead of a number of days
  const [review, setReview] = useState('');          // optional: follow-up date during the trial (default = when the trial ends)
  const [group, setGroup] = useState(!!call.group_joined);
  const [webinar, setWebinar] = useState(call.webinar_status);
  const [account, setAccount] = useState(call.account_status);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  // WhatsApp message to the client, chosen by the call result
  const [tpl, setTpl] = useState(null);               // { templates, vars }
  const [sendWa, setSendWa] = useState(true);
  const [msg, setMsg] = useState('');
  const [msgEdited, setMsgEdited] = useState(false);
  const [zoom, setZoom] = useState('');
  const toast = useToast();
  useEffect(() => { setMsgEdited(false); }, [outcome]);   // another result = the matching message again
  useEffect(() => { api.get('/whatsapp/templates').then((r) => setTpl(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    if (msgEdited) return;
    if (!tpl || !outcome) { setMsg(''); return; }
    // Map new outcomes to closest existing WA templates when dedicated ones are missing
    const tplKey = (outcome === 'TRIAL' || outcome === 'FOLLOWUP' || outcome === 'DONE_SOLD') ? 'INTERESTED' : outcome;
    const cb = followup && !Number.isNaN(Date.parse(followup)) ? fmtDateTime(new Date(followup).toISOString()) : 'the time we agreed';
    setMsg(renderTemplate(withGroupLink(tpl.templates[tplKey] || tpl.templates.INTERESTED || '', tpl.vars.group_link, tpl.group_all !== false), { ...tpl.vars, name: call.lead_name, callback_time: cb }));
  }, [tpl, outcome, followup, msgEdited, call.lead_name]);
  async function saveZoom() {
    try {
      await api.put('/whatsapp/my-zoom', { zoom_link: zoom });
      setTpl((t) => ({ ...t, vars: { ...t.vars, zoom_link: zoom.trim() } })); setMsgEdited(false); toast('Zoom link saved');
    } catch (e2) { toast(errMsg(e2), 'err'); }
  }

  async function push(form, wa) {
    setErr(''); setSaving(true);
    try { await onSave(form, wa); } catch (e2) { try { wa?.w?.close(); } catch { /* ignore */ } setErr(errMsg(e2)); setSaving(false); }
  }
  // Skip = save the call (time is still counted) without any details
  const skip = () => { if (!saving) push({}); };

  function submit(e) {
    e.preventDefault();
    const form = { group_joined: group, webinar_status: webinar, account_status: account };
    if (outcome) form.outcome = outcome;
    if (remark.trim()) form.remark = remark.trim();
    if (outcome === 'CALLBACK' || outcome === 'FOLLOWUP') {
      form.followup_at = new Date(followup).toISOString();
    }
    if (outcome === 'TRIAL') {
      if (trialEnd) {
        if (Date.parse(trialEnd) <= Date.now() + 60000) { setErr('The trial end date must be in the future'); return; }
        form.trial_ends_at = new Date(trialEnd).toISOString();
      } else {
        const days = customDays ? Number(customDays) : trialDays;
        if (!days || days < 1 || days > 90) { setErr('Enter a valid trial duration (1–90 days)'); return; }
        form.trial_days = days;
      }
      if (review) form.followup_at = new Date(review).toISOString();
    }
    let wa = null;
    if (outcome && sendWa && msg.trim()) {
      // the window must be opened right here (inside the click) or the browser blocks it; it is pointed to WhatsApp after the save
      let w = null;
      try { w = window.open('', '_blank'); } catch { /* blocked: the "Call saved" pop-up gets a button */ }
      wa = { w, url: waUrl(call.lead_mobile, msg.trim()) };
    }
    push(form, wa);
  }

  return (
    <Modal title="Call ended" onClose={skip} backdropClose={false}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center justify-between rounded-md bg-surface-0 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate font-bold">{call.lead_name}</div>
            <div className="mono-num text-sm text-ink-500">{call.lead_mobile}</div>
          </div>
          <div className="text-right">
            <div className="label !mb-0.5">🔒 Call duration</div>
            <div className="mono-num font-display text-2xl font-bold text-ink-950">{fmtClock(duration)}</div>
          </div>
        </div>
        <p className="text-xs text-ink-300">Optional — fill only what you need, or close this window. The call and its duration are already counted. <b>If the client gave no response and you select nothing, a fresh client goes into Call back automatically.</b></p>

        <div>
          <span className="label">What did the client say? <span className="normal-case">(optional)</span></span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {OUTCOMES.filter((o) => o.value !== 'TRIAL').map((o) => {
              // Trial is not a separate button any more: it is an option that appears only after "Interested"
              const on = outcome === o.value || (o.value === 'INTERESTED' && outcome === 'TRIAL');
              return (
                <button type="button" key={o.value} onClick={() => setOutcome(on ? '' : o.value)}
                  className={`rounded-md border-2 px-2.5 py-2 text-sm font-bold transition ${on ? o.cls : 'border-border-subtle bg-white text-ink-500 hover:border-border-strong'}`}>
                  <span className="mr-1">{o.icon}</span>{o.label}
                </button>
              );
            })}
          </div>
        </div>

        {(outcome === 'INTERESTED' || outcome === 'TRIAL') && (
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-sky bg-sky-tint/40 px-3 py-2.5 text-sm font-bold text-sky">
            <input type="checkbox" checked={outcome === 'TRIAL'} onChange={(e) => setOutcome(e.target.checked ? 'TRIAL' : 'INTERESTED')} />
            ⏱ Also give a Trial / Demo to this client <span className="font-normal text-ink-500">(optional)</span>
          </label>
        )}

        {(outcome === 'CALLBACK' || outcome === 'FOLLOWUP') && (
          <div>
            <label className="label" htmlFor="fu">{outcome === 'CALLBACK' ? 'Callback date & time' : 'Follow-up date & time'}</label>
            <input id="fu" type="datetime-local" className="input" value={followup} onChange={(e) => setFollowup(e.target.value)} required />
          </div>
        )}

        {outcome === 'TRIAL' && (() => {
          const days = customDays ? Number(customDays) : trialDays;
          const endsAt = trialEnd ? new Date(trialEnd) : (days >= 1 && days <= 90 ? new Date(Date.now() + days * 86400000) : null);
          return (
            <div className="space-y-3 rounded-md border border-sky bg-sky-tint/40 p-3">
              <div>
                <label className="label !mb-1">Demo / trial length</label>
                <div className="flex flex-wrap gap-2">
                  {TRIAL_PRESETS.map((d) => (
                    <button type="button" key={d} onClick={() => { setTrialDays(d); setCustomDays(''); setTrialEnd(''); }}
                      className={`rounded-md border-2 px-3 py-1.5 text-sm font-bold ${!trialEnd && !customDays && trialDays === d ? 'border-sky bg-sky-tint text-sky' : 'border-border-subtle bg-white text-ink-600'}`}>
                      {d} days
                    </button>
                  ))}
                  <input type="number" min={1} max={90} placeholder="Other days" className="input !w-28 !py-1.5"
                    value={customDays} onChange={(e) => { setCustomDays(e.target.value); setTrialEnd(''); }} />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="tr-end">…or pick the end date &amp; time</label>
                <input id="tr-end" type="datetime-local" className="input" value={trialEnd} onChange={(e) => { setTrialEnd(e.target.value); if (e.target.value) setCustomDays(''); }} />
              </div>
              {endsAt && (
                <div className="rounded-md bg-white px-3 py-2 text-sm">
                  <span className="rounded-full bg-signal-greenTint px-2 py-0.5 text-xs font-bold text-signal-greenDark">● Active</span>{' '}
                  until <b>{fmtDateTime(endsAt.toISOString())}</b>. After that the client becomes <b>Not active</b> and moves to <b>Follow-up</b>.
                </div>
              )}
              <div>
                <label className="label" htmlFor="fu-trial">Follow-up date during the trial <span className="normal-case">(optional)</span></label>
                <input id="fu-trial" type="datetime-local" className="input" value={review} onChange={(e) => setReview(e.target.value)} />
                <p className="mt-1 text-[11px] text-ink-400">Leave empty = follow-up when the trial ends. A "trial ending" alert is shown to you automatically. Account is activated only after Done (purchase).</p>
              </div>
            </div>
          );
        })()}

        {outcome === 'DONE_SOLD' && (
          <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            ★ Purchase confirmed. Client moves to <b>Done</b> and the account is activated. Executives can view but not edit Done clients.
          </p>
        )}

        <div>
          <label className="label" htmlFor="remark">Remark <span className="normal-case">(optional)</span></label>
          {call.lead_remark && <p className="mb-1.5 rounded-md bg-surface-0 px-3 py-2 text-xs text-ink-500"><b>Earlier remark:</b> {call.lead_remark}</p>}
          <textarea id="remark" className="input min-h-[80px] resize-y" value={remark} onChange={(e) => setRemark(e.target.value)}
            placeholder={call.lead_remark ? 'Add a new remark only if something changed…' : 'Type what the client said…'} />
        </div>

        {outcome && (
          <div className="rounded-md border border-border-subtle bg-surface-0 p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={sendWa} onChange={(e) => setSendWa(e.target.checked)} />
              💬 Send this WhatsApp message to {call.lead_name} after saving
            </label>
            {sendWa && (
              <>
                {(outcome === 'INTERESTED' || outcome === 'TRIAL') && tpl && !tpl.vars.zoom_link && (
                  <div className="mt-2 rounded-md bg-amber-tint px-3 py-2">
                    <div className="text-xs font-semibold text-amber-dark">Your Zoom link is not saved yet — the message will go without it. Paste it once and it is used for all your clients:</div>
                    <div className="mt-1.5 flex gap-2">
                      <input className="input !py-1.5 text-xs" placeholder="https://zoom.us/j/…" value={zoom} onChange={(e) => setZoom(e.target.value)} />
                      <button type="button" className="btn-dark !px-3 !py-1.5" disabled={!zoom.trim()} onClick={saveZoom}>Save</button>
                    </div>
                  </div>
                )}
                <textarea className="input mt-2 min-h-[150px] resize-y text-xs leading-relaxed" value={msg}
                  onChange={(e) => { setMsg(e.target.value); setMsgEdited(true); }} placeholder="Loading message…" />
                <p className="mt-1 text-[11px] text-ink-300">WhatsApp opens with this message ready — you only press Send. You can edit the text here first.</p>
              </>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <span className="label">WhatsApp group</span>
            <button type="button" onClick={() => setGroup(!group)}
              className={`w-full rounded-md border px-3 py-2.5 text-sm font-semibold ${group ? 'border-signal-green bg-signal-greenTint text-signal-greenDark' : 'border-border-subtle bg-surface-0 text-ink-500'}`}>
              {group ? '✓ Joined' : 'Not joined'}
            </button>
          </div>
          <div>
            <label className="label" htmlFor="wb">Webinar</label>
            <select id="wb" className="input" value={webinar} onChange={(e) => setWebinar(e.target.value)}>
              {WEBINAR.map((w) => <option key={w} value={w}>{label(w)}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ac">Account opening</label>
            <select id="ac" className="input" value={account} onChange={(e) => setAccount(e.target.value)}>
              {ACCOUNT.map((w) => <option key={w} value={w}>{label(w)}</option>)}
            </select>
          </div>
        </div>
        {account === 'OPENED' && call.account_status !== 'OPENED' && (
          <p className="rounded-md bg-signal-greenTint px-3 py-2 text-xs text-signal-greenDark">Account opened → this client will be locked to you. No other executive can call them.</p>
        )}

        {err && <div className="rounded-md bg-coral-tint px-3 py-2 text-sm font-medium text-coral">{err}</div>}
        <div className="flex gap-2">
          <button type="button" className="btn-ghost flex-1 !py-3" onClick={skip} disabled={saving}>Skip</button>
          <button className="btn-green flex-[2] !py-3" disabled={saving}>{saving ? 'Saving…' : 'Save call'}</button>
        </div>
      </form>
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { label, STATUS_META } from '../utils';

const BADGE = {
  NEW: 'bg-surface-2 text-ink-500',
  INTERESTED: 'bg-signal-greenTint text-signal-greenDark',
  NOT_INTERESTED: 'bg-coral-tint text-coral',
  CALLBACK: 'bg-amber-tint text-amber-dark',
  TRIAL: 'bg-sky-tint text-sky',
  FOLLOWUP: 'bg-violet-50 text-violet-700',
  ACTIVE: 'bg-signal-greenTint text-signal-greenDark',
  NOT_ACTIVE: 'bg-surface-2 text-ink-500',
  DONE_SOLD: 'bg-emerald-50 text-emerald-800',
  NO_ANSWER: 'bg-sky-tint text-sky',
  OPENED: 'bg-signal-greenTint text-signal-greenDark',
  IN_PROGRESS: 'bg-amber-tint text-amber-dark',
  NOT_OPENED: 'bg-surface-2 text-ink-500',
  ATTENDED: 'bg-signal-greenTint text-signal-greenDark',
  REGISTERED: 'bg-amber-tint text-amber-dark',
  NOT_ATTENDED: 'bg-coral-tint text-coral',
  PENDING: 'bg-surface-2 text-ink-500',
  YES: 'bg-signal-greenTint text-signal-greenDark',
  NO: 'bg-surface-2 text-ink-500',
  VERIFIED: 'bg-signal-greenTint text-signal-greenDark',
  EXPIRED: 'bg-coral-tint text-coral',
  FAILED: 'bg-coral-tint text-coral',
};

/** Compact professional status badge with icon + tooltip */
export function Badge({ value, compact = false }) {
  if (!value) return <span className="text-[#a9b0c6]">—</span>;
  const meta = STATUS_META[value];
  const cls = BADGE[value] || BADGE.NEW;
  const text = meta?.label || label(value);
  const icon = meta?.icon || '';
  return (
    <span
      title={text}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}
    >
      {icon && <span className="text-[11px] leading-none" aria-hidden>{icon}</span>}
      {!compact && <span>{text}</span>}
    </span>
  );
}

export function CallCount({ count, min = 6 }) {
  const done = count >= min;
  return (
    <div className="flex min-w-[78px] flex-col gap-1">
      <span className={`mono-num text-[13px] font-bold ${done ? 'text-signal-greenDark' : 'text-ink-800'}`}>{count}/{min}{done && ' ✓'}</span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${done ? 'bg-signal-green' : 'bg-amber'}`} style={{ width: `${Math.min(100, (count / min) * 100)}%` }} />
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children, wide, dismissible = true, backdropClose = true }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && dismissible && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose, dismissible]);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink-950/60 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && dismissible && backdropClose && onClose?.()}>
      <div className={`max-h-[94vh] w-full overflow-y-auto rounded-t-lg bg-white shadow-xl sm:rounded-lg ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}>
        {title && (
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-subtle bg-white px-5 py-4">
            <h3 className="text-lg font-bold">{title}</h3>
            {dismissible && <button aria-label="Close" onClick={onClose} className="rounded-md px-2 py-1 text-ink-300 hover:bg-surface-2 hover:text-ink-900">✕</button>}
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// Nice replacement for the browser's confirm() box
export function ConfirmModal({ title, message, confirmText = 'Confirm', danger, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm leading-relaxed text-ink-700">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className={danger ? 'btn-red' : 'btn-dark'} disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>
          {busy ? 'Please wait…' : confirmText}
        </button>
      </div>
    </Modal>
  );
}

// Call result chip (a call can be saved without a result)
export function Outcome({ v }) {
  return v ? <Badge value={v} /> : <span className="whitespace-nowrap rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-ink-300">No result</span>;
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-[26px] font-bold text-ink-950 sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[14.5px] text-ink-500">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function Kpi({ label: l, value, hint, tone }) {
  const color = tone === 'green' ? 'text-signal-greenDark' : tone === 'red' ? 'text-coral' : tone === 'amber' ? 'text-amber-dark' : 'text-ink-950';
  return (
    <div className="card px-5 py-4">
      <div className={`mono-num font-display text-[28px] font-bold leading-tight ${color}`}>{value}</div>
      <div className="mt-1 text-[13px] font-medium text-ink-500">{l}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-300">{hint}</div>}
    </div>
  );
}

export function Empty({ children }) {
  return <div className="px-5 py-10 text-center text-sm text-ink-300">{children}</div>;
}

export function Spinner() {
  return <div className="px-5 py-10 text-center text-sm text-ink-300">Loading…</div>;
}

export function Pagination({ page, total, limit, onPage }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-4 py-3 text-[13px] text-ink-500">
      <span>{total ? `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} of ${total}` : '0 results'}</span>
      <div className="flex items-center gap-2">
        <button className="btn-ghost !px-3 !py-1.5" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Prev</button>
        <span className="mono-num font-semibold">{page}/{pages}</span>
        <button className="btn-ghost !px-3 !py-1.5" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next ›</button>
      </div>
    </div>
  );
}

export function PhoneIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.8 19.8 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.8 19.8 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

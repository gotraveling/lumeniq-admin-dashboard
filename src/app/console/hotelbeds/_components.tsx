'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Check, FlaskConical } from 'lucide-react';
import type { Penalty } from './_lib';
import { destinationLocal, amount } from './_lib';

/** Always on screen: this is Hotelbeds' TEST environment, not live stock. */
export function TestEnvBanner() {
  return (
    <div className="hbx-noprint" style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 18,
      border: '1px solid #fcd34d', background: '#fffbeb', borderRadius: 8, color: 'var(--c-warn)', fontSize: 13,
    }}>
      <FlaskConical size={16} />
      <span>
        <strong>Hotelbeds TEST environment.</strong> Hotelbeds (HBX Group) product only, nothing from our other suppliers.
        Bookings made here are test bookings and are stored apart from real ones.
      </span>
    </div>
  );
}

export function HbxTabs() {
  const pathname = usePathname();
  const tabs = [
    { href: '/console/hotelbeds', label: 'Search & book' },
    { href: '/console/hotelbeds/bookings', label: 'Bookings' },
  ];
  return (
    <div className="hbx-noprint" style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
      {tabs.map((t) => {
        const active = t.href === '/console/hotelbeds'
          ? pathname === t.href
          : pathname === t.href || pathname.startsWith(t.href + '/');
        return (
          <Link key={t.href} href={t.href} className={`c-btn ${active ? 'c-btn-primary' : ''}`}>{t.label}</Link>
        );
      })}
    </div>
  );
}

export type StepState = 'done' | 'current' | 'skipped' | 'todo';

/** The certification workflow, visibly: Availability → CheckRate → Booking → Voucher. */
export function StepIndicator({ steps }: { steps: Array<{ label: string; note?: string; state: StepState }> }) {
  return (
    <ol aria-label="Booking steps" style={{ display: 'flex', gap: 0, listStyle: 'none', padding: 0, margin: '0 0 20px', flexWrap: 'wrap' }}>
      {steps.map((s, i) => {
        const color = s.state === 'done' ? 'var(--c-success)' : s.state === 'current' ? 'var(--c-accent)' : 'var(--c-fg-muted)';
        return (
          <li key={s.label} aria-current={s.state === 'current' ? 'step' : undefined}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px 6px 0', minWidth: 0 }}>
            <span style={{
              width: 24, height: 24, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, flexShrink: 0,
              border: `2px solid ${color}`,
              background: s.state === 'done' ? color : s.state === 'current' ? 'var(--c-accent-soft)' : '#fff',
              color: s.state === 'done' ? '#fff' : color,
              borderStyle: s.state === 'skipped' ? 'dashed' : 'solid',
            }}>{s.state === 'done' ? <Check size={13} /> : i + 1}</span>
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
              <span style={{ fontWeight: s.state === 'current' ? 700 : 600, color: s.state === 'todo' ? 'var(--c-fg-muted)' : 'var(--c-fg)', fontSize: 13.5 }}>{s.label}</span>
              {s.note && <span style={{ fontSize: 11.5, color: 'var(--c-fg-muted)' }}>{s.note}</span>}
            </span>
            {i < steps.length - 1 && <span aria-hidden style={{ width: 28, height: 1, background: 'var(--c-line)', marginLeft: 6 }} />}
          </li>
        );
      })}
    </ol>
  );
}

export function RefundPill({ refundable, nonRefundable }: { refundable: boolean | null; nonRefundable: boolean | null }) {
  if (nonRefundable) return <span className="c-pill c-pill-danger"><span className="dot" />Non-refundable</span>;
  if (refundable) return <span className="c-pill c-pill-success"><span className="dot" />Refundable</span>;
  if (refundable === false) return <span className="c-pill c-pill-warn"><span className="dot" />Free cancellation has ended</span>;
  return <span className="c-pill c-pill-muted"><span className="dot" />Cancellation terms not stated</span>;
}

/** Cancellation ladder with amounts and dates in destination local time (cert 3.8). */
export function Penalties({ penalties, compact }: { penalties: Penalty[] | null | undefined; compact?: boolean }) {
  if (!penalties || penalties.length === 0) return <span style={{ color: 'var(--c-fg-muted)' }}>No cancellation charges stated</span>;
  return (
    <div style={{ fontSize: compact ? 12.5 : 13.5 }}>
      {penalties.map((p, i) => (
        <div key={i}>
          From <strong>{destinationLocal(p.fromLocal || p.from)}</strong>: {amount(p.amount, p.currency)}
        </div>
      ))}
      <div style={{ fontSize: 11.5, color: 'var(--c-fg-muted)' }}>Dates and times are destination local time.</div>
    </div>
  );
}

export function Stars({ n }: { n: number | null }) {
  if (!n) return null;
  return <span aria-label={`${n} stars`} style={{ color: 'var(--c-accent)', letterSpacing: 1 }}>{'★'.repeat(n)}</span>;
}

/** Mandatory before confirming (cert 3.9). Impossible to miss. */
export function RateComments({ text, loading }: { text: string | null | undefined; loading?: boolean }) {
  return (
    <section aria-label="Rate comments" style={{ border: '2px solid #f59e0b', background: '#fffbeb', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--c-warn)', marginBottom: 6 }}>
        Rate comments (important information from the hotel)
      </div>
      {loading ? <div style={{ color: 'var(--c-fg-muted)' }}>Loading rate comments…</div>
        : text ? <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5 }}>{text}</div>
          : <div style={{ color: 'var(--c-fg-soft)' }}>This rate has no rate comments.</div>}
    </section>
  );
}

export function StatusPill({ status }: { status: string | null }) {
  const s = String(status || '').toLowerCase();
  const cls = s === 'confirmed' ? 'c-pill-success' : s === 'cancelled' ? 'c-pill-danger' : 'c-pill-muted';
  return <span className={`c-pill ${cls}`}><span className="dot" />{s || 'unknown'}</span>;
}

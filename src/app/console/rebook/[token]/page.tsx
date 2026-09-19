'use client';

/**
 * The page behind the link in a "cheaper rate found" email.
 *
 * It does not show the number from the email. It re-checks with the supplier on
 * load and shows what is true now, because by the time anyone opens the email
 * the rate may be gone, or moved again. Showing the morning's figure and then
 * booking something else is the one thing that would kill trust in this.
 *
 * Three outcomes, each said plainly: still cheaper (with a button), no longer
 * cheaper (with the supplier's reason), or too late to act.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';

type Live = {
  stillCheaper: boolean;
  reason?: string;
  old_net?: number;
  new_net?: number;
  saving?: number;
  saving_pct?: number;
  currency?: string;
  room_type_name?: string | null;
  rate_plan?: string | null;
  refundable?: boolean;
  cancellation_deadline_utc?: string | null;
};

type Payload = {
  candidate: any;
  booking: any;
  now: Live;
  actionable: boolean;
  expired: boolean;
};

const money = (n?: number | null, ccy?: string) =>
  n == null ? '—' : `${Number(n).toFixed(2)} ${ccy || ''}`.trim();

const stayDate = (d?: string | null) => {
  if (!d) return '—';
  const iso = String(d).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return String(d);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
};

export default function RebookDecisionPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [user] = useAuthState(auth);
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<any>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await fetch(`/api/admin/rebook/token/${token}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.message || j.error || 'Could not load this link');
      setData(j.data);
    } catch (e: any) {
      setErr(e.message || 'Could not load this link');
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const act = async (what: 'execute' | 'dismiss') => {
    if (!data?.candidate?.id) return;
    if (what === 'execute') {
      const live = data.now;
      const ok = confirm(
        `Rebook this stay?\n\n` +
        `We pay now: ${money(live.old_net, live.currency)}\n` +
        `We would pay: ${money(live.new_net, live.currency)}\n` +
        `Saving: ${money(live.saving, live.currency)}\n\n` +
        `The new room is booked first, then the original is cancelled. ` +
        `The price is checked once more before anything happens.`
      );
      if (!ok) return;
    }
    setBusy(what);
    setErr(null);
    try {
      const r = await fetch(`/api/admin/rebook/${data.candidate.id}/${what}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-consultant-email': user?.email || '' },
        body: JSON.stringify({}),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.message || j.error || `${what} failed`);
      setDone({ what, ...j.data });
      await load();
    } catch (e: any) {
      setErr(e.message);
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (err && !data) return <Shell><Note tone="bad">{err}</Note></Shell>;
  if (!data) return <Shell><div style={{ color: 'var(--c-fg-muted)' }}>Checking with the supplier…</div></Shell>;

  const b = data.booking;
  const live = data.now;
  const sp = b.searchParams || {};

  return (
    <Shell>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Rebook check</h1>
      <div style={{ fontSize: 13, color: 'var(--c-fg-muted)', marginBottom: 16 }}>
        {b.internalBookingId} · supplier {b.supplierBookingId} · checked just now
      </div>

      {done?.what === 'execute' && (
        <Note tone="good">
          Rebooked. New booking {done.newBooking?.internalBookingId} · saved {money(done.saved, done.currency)}.
          The original has been cancelled.
        </Note>
      )}
      {done?.what === 'dismiss' && <Note tone="plain">Left as it is. No further alerts for this one.</Note>}
      {err && <Note tone="bad">{err}</Note>}

      <Card>
        <Row k="Guest" v={`${b.guest?.firstName || ''} ${b.guest?.lastName || ''}`.trim() || '—'} />
        <Row k="Stay" v={`${stayDate(sp.checkIn)} to ${stayDate(sp.checkOut)}`} />
        <Row k="Room held" v={b.rateTerms?.roomTypeName || b.priceBreakdown?.roomTypeName || '—'} />
        <Row k="Client pays" v={`${money(b.totalAmount, b.currency)} — unchanged`} />
      </Card>

      {live.stillCheaper ? (
        <Card accent>
          <Row k="We pay now" v={money(live.old_net, live.currency)} />
          <Row k="We would pay" v={money(live.new_net, live.currency)} />
          <Row k="Saving" v={`${money(live.saving, live.currency)} (${Number(live.saving_pct).toFixed(1)}%)`} strong />
          <Row k="Room offered" v={live.room_type_name || '—'} />
          <Row k="Board" v={live.rate_plan || '—'} />
          <Row k="Offered rate" v={live.refundable ? 'refundable' : 'NON-REFUNDABLE'} />
        </Card>
      ) : (
        <Note tone="plain">
          Not cheaper any more: {live.reason || 'the rate has gone'}. The booking is untouched.
        </Note>
      )}

      {data.expired && (
        <Note tone="bad">
          Too late to act — the original booking can no longer be cancelled without a penalty.
        </Note>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
        <button
          className="c-btn c-btn-primary"
          disabled={!data.actionable || !!busy || !!done}
          onClick={() => act('execute')}
        >
          {busy === 'execute' ? 'Rebooking…' : `Rebook and save ${money(live.saving, live.currency)}`}
        </button>
        <button className="c-btn" disabled={!!busy || !!done} onClick={() => act('dismiss')}>
          Leave it
        </button>
        <button className="c-btn" disabled={!!busy} onClick={() => void load()}>Check again</button>
        <button className="c-btn" onClick={() => router.push('/console/bookings')}>All bookings</button>
      </div>

      <p style={{ fontSize: 12, color: 'var(--c-fg-muted)', marginTop: 16, lineHeight: 1.6 }}>
        Rebooking takes the new room first and cancels the original only once the new one is
        confirmed, so the guest is never left without a room. The price is checked one more time
        immediately before booking; if it has moved, nothing happens and you decide again.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 620, margin: '0 auto', padding: '24px 16px' }}>{children}</div>;
}

function Card({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div style={{
      border: `1px solid ${accent ? 'var(--c-accent)' : 'var(--c-line)'}`,
      background: accent ? 'var(--c-bg-soft)' : 'var(--c-bg)',
      borderRadius: 8, padding: '12px 14px', marginBottom: 12, display: 'grid', gap: 6,
    }}>{children}</div>
  );
}

function Row({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: 13 }}>
      <span style={{ color: 'var(--c-fg-muted)' }}>{k}</span>
      <span className="c-mono" style={{ fontWeight: strong ? 700 : 500, color: strong ? 'var(--c-accent)' : 'inherit', textAlign: 'right' }}>{v}</span>
    </div>
  );
}

function Note({ children, tone }: { children: React.ReactNode; tone: 'good' | 'bad' | 'plain' }) {
  const t = {
    good: { fg: '#166534', bg: 'rgba(22,101,52,0.08)', bd: '#16a34a' },
    bad: { fg: '#991b1b', bg: '#fef2f2', bd: '#fecaca' },
    plain: { fg: 'var(--c-fg-soft)', bg: 'var(--c-bg-soft)', bd: 'var(--c-line)' },
  }[tone];
  return (
    <div style={{ border: `1px solid ${t.bd}`, background: t.bg, color: t.fg, borderRadius: 7, padding: '9px 12px', fontSize: 13, marginBottom: 12 }}>
      {children}
    </div>
  );
}

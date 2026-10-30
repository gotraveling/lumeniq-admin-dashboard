'use client';

/**
 * What we owe each supplier, by billing period.
 *
 * RateHawk invoices on the 3rd of each month for bookings CREATED the month
 * before, whatever the check-in date. The expected total is summed from our
 * bookings; marking a period paid records the invoice number and amount so a
 * mismatch with their invoice shows here rather than in the bank statement.
 *
 * Hummingbird has no monthly invoice: each booking has its own due date, on
 * the invoice attached to the confirmation email. Those bookings are listed
 * one by one and the due date is typed in from that invoice.
 */

import { useCallback, useEffect, useState } from 'react';

type Net = { amount: number | null; currency: string | null };
type Line = {
  internalBookingId: string; supplierBookingId: string; supplierOrderId: string | null;
  status: string; counted: boolean; createdAt: string; checkIn: string | null; checkOut: string | null;
  freeCancelUntil: string | null;
  hotelId: string | number | null; hotelName: string | null; guest: string | null; net: Net;
};
type Period = {
  supplier: string; supplierLabel: string; terms: string; periodStart: string; dueDate: string | null;
  billing: 'monthly' | 'per_booking'; ref: string;
  status: 'collecting' | 'due' | 'overdue' | 'paid' | 'no_terms' | 'needs_due_date' | 'cancelled';
  bookingCount: number; expected: Record<string, number>; missingNet: number; bookings: Line[];
  invoice: null | {
    status: string; invoiceNumber: string | null; amount: number | null; currency: string | null;
    paidAt: string | null; paidBy: string | null; note: string | null;
    reminderSentAt: string | null; overdueSentAt: string | null;
  };
};

const fmtDate = (d?: string | null) =>
  d ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: d.length === 10 ? 'UTC' : undefined }) : '—';
const monthName = (p: string) => new Date(`${p}T00:00:00Z`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const money = (n: number | null | undefined, ccy?: string | null) =>
  n == null || !ccy ? '—' : `${ccy} ${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const totals = (t: Record<string, number>) => Object.entries(t).map(([c, n]) => money(n, c)).join(' + ') || '—';

const BADGE: Record<Period['status'], { label: string; color: string }> = {
  collecting: { label: 'Still taking bookings', color: 'var(--c-fg-muted)' },
  due:        { label: 'Due',                   color: '#b26a00' },
  overdue:    { label: 'Overdue',               color: 'var(--c-danger, #b4232a)' },
  paid:       { label: 'Paid',                  color: '#1e7d32' },
  no_terms:   { label: 'Terms not known',       color: 'var(--c-fg-muted)' },
  needs_due_date: { label: 'Enter due date',    color: 'var(--c-danger, #b4232a)' },
  cancelled:  { label: 'Cancelled',             color: 'var(--c-fg-muted)' },
};

export default function SupplierPaymentsPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await fetch('/api/admin/supplier-payments?months=12', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.message || j.error || 'Could not load');
      setPeriods(j.data.periods || []);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // The reminder email links to #supplier-period; scroll there and open the form
  // once the periods have loaded.
  useEffect(() => {
    const id = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
    if (!id || !periods.length) return;
    const p = periods.find(x => `${x.supplier}-${x.ref}` === id);
    if (!p) return;
    document.getElementById(id)?.scrollIntoView({ block: 'start' });
    if ((p.dueDate || p.billing === 'per_booking') && p.invoice?.status !== 'paid') setEditing(`${p.supplier}|${p.ref}`);
  }, [periods]);

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Supplier payments</h1>
      <div style={{ fontSize: 13, color: 'var(--c-fg-muted)', marginTop: 2 }}>
        RateHawk invoices on the 3rd of each month for bookings made the month before. Hummingbird bookings
        each have their own due date: enter it from the invoice on the confirmation email. A reminder goes
        out 2 days before the due date, and again 3 days after if it is not marked paid.
      </div>

      {err && <div className="c-error" style={{ marginTop: 12 }}>{err}</div>}
      {loading && <div style={{ marginTop: 16, fontSize: 13, color: 'var(--c-fg-muted)' }}>Loading…</div>}
      {!loading && !err && periods.length === 0 && (
        <div style={{ marginTop: 16, fontSize: 13, color: 'var(--c-fg-muted)' }}>No supplier bookings in the last 12 months.</div>
      )}

      {periods.map(p => {
        const key = `${p.supplier}|${p.ref}`;
        const byBooking = p.billing === 'per_booking';
        const first = p.bookings[0];
        const badge = BADGE[p.status];
        const inv = p.invoice;
        const mismatch = inv?.status === 'paid' && inv.amount != null && inv.currency
          && p.expected[inv.currency] != null && Math.abs(p.expected[inv.currency] - inv.amount) >= 0.01;
        return (
          <section key={key} id={`${p.supplier}-${p.ref}`} className="c-card" style={{ marginTop: 16, padding: 16, border: '1px solid var(--c-border)', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  {byBooking
                    ? <>{p.supplierLabel} · {first.hotelName || (first.hotelId ? `Hotel #${first.hotelId}` : first.supplierBookingId)}</>
                    : <>{p.supplierLabel} · bookings made in {monthName(p.periodStart)}</>}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--c-fg-muted)', marginTop: 2 }}>
                  {byBooking
                    ? (p.dueDate ? <>Due {fmtDate(p.dueDate)}</> : <>Due date not entered yet</>)
                    : (p.dueDate ? <>Invoice date {fmtDate(p.dueDate)}</> : p.terms)}
                  {!byBooking && <>{' · '}{p.bookingCount} booking{p.bookingCount === 1 ? '' : 's'}</>}
                  {' · '}expected net <b style={{ color: 'var(--c-fg)' }}>{totals(p.expected)}</b>
                  {p.missingNet > 0 && <> · {p.missingNet} with no net recorded</>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: badge.color }}>{badge.label}</span>
                {(p.dueDate || byBooking) && (
                  <button className="c-btn" onClick={() => setEditing(editing === key ? null : key)}>
                    {inv?.status === 'paid' ? 'Edit' : byBooking && !p.dueDate ? 'Enter due date' : 'Mark paid'}
                  </button>
                )}
              </div>
            </div>

            {inv?.status === 'paid' && (
              <div style={{ fontSize: 12.5, marginTop: 8 }}>
                Paid {fmtDate(inv.paidAt)}{inv.paidBy ? ` by ${inv.paidBy}` : ''}
                {inv.invoiceNumber ? ` · invoice ${inv.invoiceNumber}` : ''}
                {inv.amount != null ? ` · ${money(inv.amount, inv.currency)}` : ''}
                {mismatch && (
                  <span style={{ color: 'var(--c-danger, #b4232a)', fontWeight: 700 }}>
                    {' '}· differs from our {money(p.expected[inv.currency!], inv.currency)}
                  </span>
                )}
                {inv.note ? <div style={{ color: 'var(--c-fg-muted)' }}>{inv.note}</div> : null}
              </div>
            )}

            {editing === key && <PayForm period={p} onDone={async () => { setEditing(null); await load(); }} />}

            <table className="c-table" style={{ marginTop: 12 }}>
              <thead>
                <tr><th>Supplier order</th><th>Hotel</th><th>Guest</th><th>Booked</th><th>Stay</th><th>Free cancel until</th><th>Net (what we pay)</th><th>Status</th></tr>
              </thead>
              <tbody>
                {p.bookings.map(b => (
                  <tr key={b.internalBookingId} style={b.counted ? undefined : { color: 'var(--c-fg-muted)' }}>
                    <td className="c-mono" style={{ whiteSpace: 'nowrap' }}>
                      {b.supplierOrderId || b.supplierBookingId}
                      <div style={{ fontSize: 11, color: 'var(--c-fg-muted)' }}>{b.internalBookingId}</div>
                    </td>
                    <td>{b.hotelName || (b.hotelId ? `Hotel #${b.hotelId}` : '—')}</td>
                    <td>{b.guest || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(b.createdAt)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(b.checkIn)} – {fmtDate(b.checkOut)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {!b.counted ? '—' : b.freeCancelUntil ? fmtDate(b.freeCancelUntil.slice(0, 10)) : 'Non-refundable'}
                    </td>
                    <td className="c-mono" style={{ whiteSpace: 'nowrap' }}>{money(b.net.amount, b.net.currency)}</td>
                    <td style={{ fontSize: 12 }}>
                      {b.status}{!b.counted && <div>not counted, check invoice for a penalty</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

function PayForm({ period, onDone }: { period: Period; onDone: () => Promise<void> }) {
  const inv = period.invoice;
  const firstCcy = Object.keys(period.expected)[0] || 'AUD';
  const [invoiceNumber, setInvoiceNumber] = useState(inv?.invoiceNumber || '');
  const [amount, setAmount] = useState(inv?.amount != null ? String(inv.amount) : String(period.expected[firstCcy] ?? ''));
  const [currency, setCurrency] = useState(inv?.currency || firstCcy);
  const [paidAt, setPaidAt] = useState((inv?.paidAt || new Date().toISOString()).slice(0, 10));
  const [note, setNote] = useState(inv?.note || '');
  const byBooking = period.billing === 'per_booking';
  const [dueDate, setDueDate] = useState(period.dueDate || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async (status: 'paid' | 'open') => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/admin/supplier-payments/${period.supplier}/${encodeURIComponent(period.ref)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, invoiceNumber, amount, currency, paidAt, note, ...(byBooking ? { dueDate } : {}) }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.message || j.error || 'Could not save');
      await onDone();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const field = { display: 'flex', flexDirection: 'column' as const, gap: 4, fontSize: 12 };
  return (
    <div style={{ marginTop: 12, padding: 12, background: 'var(--c-bg-soft, rgba(0,0,0,0.03))', borderRadius: 6 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {byBooking && (
          <label style={field}>Due date (from the invoice)
            <input className="c-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </label>
        )}
        <label style={field}>Invoice number
          <input className="c-input" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
        </label>
        <label style={field}>Amount on the invoice
          <div style={{ display: 'flex', gap: 4 }}>
            <input className="c-input" style={{ width: 70 }} value={currency} onChange={e => setCurrency(e.target.value.toUpperCase().slice(0, 3))} />
            <input className="c-input" style={{ width: 120 }} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
        </label>
        <label style={field}>Paid on
          <input className="c-input" type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} />
        </label>
        <label style={{ ...field, flex: 1, minWidth: 180 }}>Note
          <input className="c-input" value={note} onChange={e => setNote(e.target.value)} />
        </label>
        {byBooking && inv?.status !== 'paid' && (
          <button className="c-btn" disabled={busy || !dueDate} onClick={() => save('open')}>{busy ? 'Saving…' : 'Save due date'}</button>
        )}
        <button className="c-btn" disabled={busy} onClick={() => save('paid')}>{busy ? 'Saving…' : 'Save as paid'}</button>
        {inv?.status === 'paid' && <button className="c-btn" disabled={busy} onClick={() => save('open')}>Mark unpaid</button>}
      </div>
      {err && <div className="c-error" style={{ marginTop: 8 }}>{err}</div>}
    </div>
  );
}

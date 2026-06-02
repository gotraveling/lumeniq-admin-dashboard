'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { CheckCircle2, Clock, XCircle, AlertTriangle, Search, X } from 'lucide-react';

interface Booking {
  internalBookingId: string;
  bookingId: string;
  status: string;
  supplierId: string;
  guestInfo: any;
  contactInfo?: any;
  bookingDetails: any;
  priceBreakdown?: any;
  commissionAmount?: number | null;
  totalAmount: number | null;
  currency: string;
  confirmationNumber: string;
  cancellationNumber?: string | null;
  specialRequests?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  cancelledAt?: string | null;
  // Enriched client-side from hotel-api:
  hotelName?: string;
  hotelCity?: string;
  hotelCountry?: string;
}

type StatusFilter = 'all' | 'confirmed' | 'awaiting_supplier_confirmation' | 'pending' | 'cancelled';

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'awaiting_supplier_confirmation', label: 'Awaiting supplier' },
  { value: 'pending', label: 'Pending' },
  { value: 'cancelled', label: 'Cancelled' },
];

// All booking-engine timestamps are UTC ISO; consultants are in Sydney.
// Centralise the formatters so every column reads the same way.
const TZ = 'Australia/Sydney';
const fmtStayDate = (iso?: string) => {
  if (!iso) return '?';
  try {
    return new Intl.DateTimeFormat('en-AU', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
  } catch { return iso.slice(0, 10); }
};
const fmtCreatedAt = (iso?: string) => {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date(iso)) + ' AEST';
  } catch { return iso; }
};

export default function ConsoleBookingsPage() {
  const [user, loading] = useAuthState(auth);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [openId, setOpenId] = useState<string | null>(null);

  // Extracted so the detail panel can refresh the list after a mutation
  // (cancel / guest edit) without a full page reload.
  const loadBookings = useCallback(async () => {
    try {
      const res = await fetch('/api/bookings');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const list: Booking[] = json?.data?.bookings || [];
      setBookings(list);
      // Enrich each booking with hotel name in parallel — bookings
      // list endpoint doesn't always populate hotelName, and the
      // consultant scan-read is much faster with property names
      // than with bare numeric hotel ids.
      enrichWithHotelNames(list, setBookings);
    } catch (e: any) {
      setError(e?.message || 'Failed to load bookings');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setBusy(false);
      setError('Sign in to view bookings.');
      return;
    }
    loadBookings();
  }, [user, loading, loadBookings]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return bookings.filter((b) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (supplierFilter !== 'all' && b.supplierId !== supplierFilter) return false;
      if (!s) return true;
      const haystack = [
        b.bookingId, b.internalBookingId, b.confirmationNumber,
        b.guestInfo?.firstName, b.guestInfo?.lastName, b.guestInfo?.email,
        b.bookingDetails?.hotelId, b.hotelName, b.hotelCity
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(s);
    });
  }, [bookings, search, statusFilter, supplierFilter]);

  const suppliers = useMemo(() => {
    const set = new Set<string>();
    bookings.forEach((b) => b.supplierId && set.add(b.supplierId));
    return ['all', ...Array.from(set)];
  }, [bookings]);

  const openBooking = filtered.find(b => (b.internalBookingId || b.bookingId) === openId) || null;

  return (
    <>
      <div className="c-page-head">
        <div>
          <h1 className="c-page-title">Bookings</h1>
          <p className="c-page-sub">
            {busy ? 'Loading…' : `${filtered.length} of ${bookings.length} ${bookings.length === 1 ? 'booking' : 'bookings'}`}
          </p>
        </div>
      </div>

      <div className="c-filter-row">
        <div style={{ flex: '1 1 240px', minWidth: 240, position: 'relative' }}>
          <Search
            size={14}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-fg-muted)' }}
          />
          <input
            className="c-input"
            placeholder="Search booking ref, email, hotel name or id…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 30 }}
          />
        </div>
        <div>
          <select className="c-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <select className="c-select" value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
            {suppliers.map((s) => (
              <option key={s} value={s}>{s === 'all' ? 'All suppliers' : s}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="c-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="c-card">
        {busy ? (
          <div className="c-loading">Loading bookings…</div>
        ) : filtered.length === 0 ? (
          <div className="c-empty">
            <div className="c-empty-title">No bookings match.</div>
            <div>Try clearing the filters or check back after a fresh test booking.</div>
          </div>
        ) : (
          <table className="c-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Guest</th>
                <th>Hotel</th>
                <th>Stay</th>
                <th>Created (AEST)</th>
                <th>Total</th>
                <th>Supplier</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const guest = b.guestInfo || {};
                const rowId = b.internalBookingId || b.bookingId;
                const hotelId = b.bookingDetails?.hotelId;
                const checkIn = b.bookingDetails?.searchParams?.checkIn;
                const checkOut = b.bookingDetails?.searchParams?.checkOut;
                const nights = (() => {
                  if (!checkIn || !checkOut) return null;
                  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
                  if (!Number.isFinite(ms) || ms <= 0) return null;
                  return Math.round(ms / 86400000);
                })();
                return (
                  <tr key={rowId} style={{ cursor: 'pointer' }} onClick={() => setOpenId(rowId)}>
                    <td className="c-mono" style={{ whiteSpace: 'nowrap' }}>
                      {rowId}
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{guest.firstName} {guest.lastName}</div>
                      {guest.email && <div style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>{guest.email}</div>}
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>
                        {b.hotelName || (hotelId ? `Hotel #${hotelId}` : '?')}
                      </div>
                      {(b.hotelCity || b.hotelCountry) && (
                        <div style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>
                          {[b.hotelCity, b.hotelCountry].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                      <div>{fmtStayDate(checkIn)} → {fmtStayDate(checkOut)}</div>
                      {nights != null && (
                        <div style={{ color: 'var(--c-fg-muted)', fontSize: 11 }}>
                          {nights} {nights === 1 ? 'night' : 'nights'}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--c-fg-soft)', whiteSpace: 'nowrap' }}>
                      {fmtCreatedAt(b.createdAt)}
                    </td>
                    <td className="c-mono" style={{ whiteSpace: 'nowrap' }}>
                      {b.totalAmount != null
                        ? new Intl.NumberFormat('en-AU', {
                            style: 'currency', currency: b.currency || 'AUD', maximumFractionDigits: 0,
                          }).format(Number(b.totalAmount))
                        : '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--c-fg-soft)' }}>{b.supplierId}</td>
                    <td><StatusPill status={b.status} /></td>
                    <td>
                      <button
                        className="c-btn"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                        onClick={(e) => { e.stopPropagation(); setOpenId(rowId); }}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <BookingDetailSidebar
        booking={openBooking}
        onClose={() => setOpenId(null)}
        onChanged={loadBookings}
      />
    </>
  );
}

/**
 * Background enrichment — for each unique hotelId across the bookings
 * list, fetch hotel content (name, city, country) once and merge
 * back into the rows. Bookings list endpoint doesn't reliably return
 * hotelName, and the bare numeric id is meaningless to consultants
 * during scan-read.
 */
async function enrichWithHotelNames(list: Booking[], setBookings: (next: any) => void) {
  const ids = Array.from(new Set(list.map(b => b.bookingDetails?.hotelId).filter(Boolean)));
  if (ids.length === 0) return;
  const byId = new Map<string, { hotel_name?: string; city?: string; country?: string }>();
  await Promise.all(ids.map(async (id) => {
    try {
      const r = await fetch(`https://hotel-api-91901273027.australia-southeast1.run.app/api/hotels/${id}`);
      if (!r.ok) return;
      const j = await r.json();
      byId.set(String(id), { hotel_name: j.hotel_name, city: j.city, country: j.country });
    } catch {}
  }));
  setBookings((prev: Booking[]) => prev.map(b => {
    const h = byId.get(String(b.bookingDetails?.hotelId));
    return h ? { ...b, hotelName: h.hotel_name, hotelCity: h.city, hotelCountry: h.country } : b;
  }));
}

/**
 * Right-side slide-out booking detail panel. Reuses the same visual
 * pattern as the BookingSidebar on the search page — the consultant
 * can scan the row, click for the deep view, and dismiss without
 * losing the list filter state. Beats a navigation to a dedicated
 * /admin/bookings/:id route when most use is "glance, then back".
 */
function BookingDetailSidebar({ booking, onClose, onChanged }: { booking: Booking | null; onClose: () => void; onChanged: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [edit, setEdit] = useState<{
    guests: { firstName: string; lastName: string }[];
    arrival: { date: string; airline: string; number: string };
    departure: { date: string; airline: string; number: string };
  }>({ guests: [], arrival: { date: '', airline: '', number: '' }, departure: { date: '', airline: '', number: '' } });
  const [cancelOutcome, setCancelOutcome] = useState<any | null>(null);

  const id = booking ? (booking.internalBookingId || booking.bookingId) : null;

  // Close on ESC for keyboard-driven consultants.
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  // Fetch the FULL booking detail when the panel opens — the list row
  // doesn't carry the margin breakdown or audit history. This is what
  // gives the console parity with the old /admin/bookings/[id] page.
  useEffect(() => {
    setDetail(null); setMsg(null); setShowEdit(false); setCancelOutcome(null);
    if (!id) return;
    let abort = false;
    (async () => {
      try {
        const r = await fetch(`/api/bookings/${id}`);
        const j = await r.json();
        if (!abort && j?.success) setDetail(j.data);
      } catch { /* fall back to the list row */ }
    })();
    return () => { abort = true; };
  }, [id]);

  if (!booking) return null;
  // Detail (when loaded) enriches/overrides the list row.
  const b: any = { ...booking, ...(detail || {}) };
  const sp = b.bookingDetails?.searchParams || {};
  const guests = sp.guests || [];
  const totalAdults = guests.reduce((s: number, r: any) => s + (r.adults || 0), 0) || sp.adults || 0;
  const totalChildren = guests.reduce((s: number, r: any) => s + (r.children?.length || 0), 0) || (sp.childrenAges?.length ?? sp.children ?? 0);
  const pb = b.priceBreakdown || null;
  const isHB = b.supplierId === 'hummingbird';
  const active = b.status !== 'cancelled' && b.status !== 'awaiting_supplier_confirmation';
  const fmtMoney = (amt?: number | null, ccy?: string) =>
    amt == null ? '—' : new Intl.NumberFormat('en-AU', {
      style: 'currency', currency: ccy || b.currency || 'AUD', maximumFractionDigits: 2,
    }).format(Number(amt));

  // Cancellation economics: prefer the live cancel response, else the
  // 'cancelled' audit event payload persisted on the booking.
  const cancelEv = Array.isArray(b.history) ? [...b.history].reverse().find((e: any) => e.action === 'cancelled') : null;
  const co = cancelOutcome || (cancelEv ? cancelEv.payload : null);

  const flash = (ok: boolean, text: string) => setMsg({ ok, text });
  const refresh = async () => {
    onChanged();
    if (!id) return;
    try { const r = await fetch(`/api/bookings/${id}`); const j = await r.json(); if (j?.success) setDetail(j.data); } catch {}
  };

  const handleCancel = async () => {
    const atRisk = b.totalAmount != null ? fmtMoney(b.totalAmount, b.currency) : 'the booking total';
    const warn = isHB
      ? `Cancel ${b.bookingId}?\n\nHummingbird returns no itemised penalty — if this rate is non-refundable, up to ${atRisk} may be charged.\nThis cannot be undone.`
      : `Cancel ${b.bookingId}?\n\nA cancellation penalty may apply (the supplier's figure is shown after).\nThis cannot be undone.`;
    if (!confirm(warn)) return;
    const reason = prompt('Cancellation reason (optional, logged in audit):') || '';
    setBusy('cancel');
    try {
      const r = await fetch(`/api/bookings/${id}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, actor: 'console' }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.success) { setCancelOutcome(j.data); flash(true, 'Booking cancelled. Guest has been emailed.'); await refresh(); }
      else flash(false, j.error || j.message || `Cancellation failed (${r.status})`);
    } catch { flash(false, 'Network error cancelling booking'); }
    finally { setBusy(null); }
  };

  const handleResend = async () => {
    setBusy('resend');
    try {
      const r = await fetch(`/api/bookings/${id}/resend-confirmation`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actor: 'console' }),
      });
      const j = await r.json().catch(() => ({}));
      flash(r.ok, r.ok ? (j.message || 'Confirmation re-sent.') : (j.error || `Resend failed (${r.status})`));
    } catch { flash(false, 'Network error'); }
    finally { setBusy(null); }
  };

  const openEdit = () => {
    const n = sp.adults || 1;
    const g = Array.from({ length: n }, (_, i) =>
      i === 0
        ? { firstName: b.guestInfo?.firstName || '', lastName: b.guestInfo?.lastName || '' }
        : { firstName: '', lastName: '' });
    setEdit({ guests: g, arrival: { date: '', airline: '', number: '' }, departure: { date: '', airline: '', number: '' } });
    setShowEdit(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    const named = edit.guests.filter(g => g.firstName.trim() || g.lastName.trim());
    if (!named.length) { flash(false, 'Enter at least one guest name.'); return; }
    const body: any = {
      firstName: edit.guests[0]?.firstName || b.guestInfo?.firstName,
      lastName: edit.guests[0]?.lastName || b.guestInfo?.lastName,
      email: b.guestInfo?.email,
      guests: named.map(g => ({ firstName: g.firstName, lastName: g.lastName, type: 'adult' })),
    };
    if (edit.arrival.date || edit.arrival.number) body.arrivalFlight = edit.arrival;
    if (edit.departure.date || edit.departure.number) body.departureFlight = edit.departure;
    setBusy('edit');
    try {
      const r = await fetch(`/api/bookings/${id}/guest-details`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.success) { flash(true, 'Guest & flight details updated. Guest has been emailed.'); setShowEdit(false); await refresh(); }
      else flash(false, j.message || j.error || `Update failed (${r.status})`);
    } catch { flash(false, 'Network error updating details'); }
    finally { setBusy(null); }
  };

  const inputStyle: React.CSSProperties = { padding: '6px 9px', fontSize: 13, border: '1px solid var(--c-line)', borderRadius: 6, background: 'var(--c-bg)', color: 'var(--c-fg)', width: '100%' };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 99 }} />
      <div ref={ref} style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(560px, 100vw)',
        background: 'var(--c-bg)', borderLeft: '1px solid var(--c-line)',
        boxShadow: '-12px 0 32px rgba(0,0,0,0.18)',
        zIndex: 100, overflowY: 'auto'
      }}>
        <div style={{ position: 'sticky', top: 0, background: 'var(--c-bg)', borderBottom: '1px solid var(--c-line)', padding: '14px 18px', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--c-fg-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 700 }}>Booking</div>
              <div className="c-mono" style={{ fontSize: 14 }}>{b.internalBookingId || b.bookingId}</div>
            </div>
            <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 0, cursor: 'pointer', padding: 6, color: 'var(--c-fg-muted)' }}>
              <X size={18} />
            </button>
          </div>
          {/* Action bar */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {active && (
              <button className="c-btn" disabled={!!busy} onClick={handleResend} style={{ padding: '5px 11px', fontSize: 12 }}>
                {busy === 'resend' ? 'Sending…' : 'Resend email'}
              </button>
            )}
            {active && (
              <button
                className="c-btn" disabled={!!busy || !isHB} onClick={openEdit}
                title={isHB ? 'Edit guest names + flight details' : `${b.supplierId} captures guest names at booking time — no post-booking edit`}
                style={{ padding: '5px 11px', fontSize: 12 }}
              >
                Edit guest / flight
              </button>
            )}
            {active && (
              <button className="c-btn" disabled={!!busy} onClick={handleCancel} style={{ padding: '5px 11px', fontSize: 12, borderColor: '#b91c1c', color: '#b91c1c' }}>
                {busy === 'cancel' ? 'Cancelling…' : 'Cancel booking'}
              </button>
            )}
          </div>
          {msg && (
            <div style={{
              marginTop: 10, padding: '7px 10px', borderRadius: 6, fontSize: 12.5,
              background: msg.ok ? 'rgba(16,185,129,0.10)' : 'rgba(220,38,38,0.08)',
              border: `1px solid ${msg.ok ? '#10b981' : '#dc2626'}`,
              color: msg.ok ? '#065f46' : '#991b1b',
            }}>{msg.text}</div>
          )}
        </div>

        <div style={{ padding: '16px 18px', display: 'grid', gap: 16 }}>
          {/* Inline edit form */}
          {showEdit && (
            <form onSubmit={handleEdit} style={{ border: '1px solid var(--c-line)', borderRadius: 8, padding: 14, display: 'grid', gap: 12, background: 'var(--c-bg-soft, transparent)' }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>Edit guest &amp; flight</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {edit.guests.map((g, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <input style={inputStyle} placeholder={`Guest ${i + 1} first name`} value={g.firstName}
                      onChange={e => setEdit(f => { const guests = [...f.guests]; guests[i] = { ...guests[i], firstName: e.target.value }; return { ...f, guests }; })} />
                    <input style={inputStyle} placeholder="Last name" value={g.lastName}
                      onChange={e => setEdit(f => { const guests = [...f.guests]; guests[i] = { ...guests[i], lastName: e.target.value }; return { ...f, guests }; })} />
                  </div>
                ))}
              </div>
              {(['arrival', 'departure'] as const).map(leg => (
                <div key={leg}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--c-fg-muted)', marginBottom: 4 }}>{leg} flight (optional)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 0.8fr', gap: 6 }}>
                    <input style={inputStyle} type="date" value={edit[leg].date} onChange={e => setEdit(f => ({ ...f, [leg]: { ...f[leg], date: e.target.value } }))} />
                    <input style={inputStyle} placeholder="QF" value={edit[leg].airline} onChange={e => setEdit(f => ({ ...f, [leg]: { ...f[leg], airline: e.target.value } }))} />
                    <input style={inputStyle} placeholder="Flight no." value={edit[leg].number} onChange={e => setEdit(f => ({ ...f, [leg]: { ...f[leg], number: e.target.value } }))} />
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="c-btn" style={{ padding: '5px 11px', fontSize: 12 }} onClick={() => setShowEdit(false)}>Cancel</button>
                <button type="submit" className="c-btn c-btn-primary" disabled={busy === 'edit'} style={{ padding: '5px 11px', fontSize: 12 }}>
                  {busy === 'edit' ? 'Saving…' : 'Update details'}
                </button>
              </div>
            </form>
          )}

          <Section label="Status">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <StatusPill status={b.status} />
              {b.confirmationNumber && (
                <span style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>
                  Supplier ref: <span className="c-mono" style={{ color: 'var(--c-fg)' }}>{b.confirmationNumber}</span>
                </span>
              )}
            </div>
          </Section>

          <Section label="Hotel">
            <div style={{ fontWeight: 600, fontSize: 15 }}>{b.hotelName || `Hotel #${b.bookingDetails?.hotelId}`}</div>
            <div style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>{[b.hotelCity, b.hotelCountry].filter(Boolean).join(', ') || '—'}</div>
            <div className="c-mono" style={{ fontSize: 11, color: 'var(--c-fg-muted)', marginTop: 4 }}>id {b.bookingDetails?.hotelId} · {b.supplierId}</div>
          </Section>

          <Section label="Stay">
            <div style={{ fontSize: 14 }}>{fmtStayDate(sp.checkIn)} → {fmtStayDate(sp.checkOut)}</div>
            <div style={{ fontSize: 12, color: 'var(--c-fg-muted)', marginTop: 2 }}>
              {totalAdults} adult{totalAdults === 1 ? '' : 's'}
              {totalChildren > 0 && `, ${totalChildren} child${totalChildren === 1 ? '' : 'ren'}`}
              {sp.rooms ? ` · ${sp.rooms} room${sp.rooms === 1 ? '' : 's'}` : ''}
              {sp.nationalityCode ? ` · ${sp.nationalityCode}` : ''}
            </div>
          </Section>

          <Section label="Pricing &amp; margin">
            <KV k="Total payable" v={<strong>{fmtMoney(b.totalAmount, b.currency)}</strong>} />
            {pb?.sellingTotal != null && <KV k="Selling total" v={fmtMoney(pb.sellingTotal, pb.sellingCurrency)} />}
            {pb?.supplierNet != null && <KV k="Supplier net" v={fmtMoney(pb.supplierNet, pb.supplierNetCurrency)} />}
            {pb?.commissionAmount != null && <KV k="Commission" v={`${fmtMoney(pb.commissionAmount, pb.sellingCurrency)}${pb.commissionPercent != null ? ` (${pb.commissionPercent}%)` : ''}`} />}
            {pb?.markupRule && <KV k="Markup rule" v={`${pb.markupRule.name}${pb.markupRule.type === 'percentage' ? ` · ${pb.markupRule.percentage}%` : pb.markupRule.fixedAmount != null ? ` · +${pb.markupRule.fixedAmount}` : ''}`} />}
            {pb?.expectedTotalAmount != null && pb?.sellingTotal != null && Math.abs(pb.expectedTotalAmount - pb.sellingTotal) > 0.01 && (
              <div style={{ fontSize: 11.5, color: '#92400e', background: 'rgba(245,158,11,0.10)', border: '1px solid #f59e0b', borderRadius: 6, padding: '6px 8px' }}>
                Customer saw {fmtMoney(pb.expectedTotalAmount, pb.expectedCurrency)} at search, booked at {fmtMoney(pb.sellingTotal, pb.sellingCurrency)}.
              </div>
            )}
          </Section>

          <Section label="Guest">
            <KV k="Name" v={`${b.guestInfo?.firstName || ''} ${b.guestInfo?.lastName || ''}`.trim() || '—'} />
            {b.guestInfo?.email && <KV k="Email" v={b.guestInfo.email} />}
            {b.guestInfo?.phone && <KV k="Phone" v={b.guestInfo.phone} />}
            {b.contactInfo?.address?.country && <KV k="Country" v={b.contactInfo.address.country} />}
          </Section>

          <Section label="References">
            <KV k="Internal ref" v={<span className="c-mono">{b.internalBookingId}</span>} />
            <KV k="Supplier ref" v={<span className="c-mono">{b.bookingId}</span>} />
            {b.confirmationNumber && <KV k="Confirmation #" v={<span className="c-mono">{b.confirmationNumber}</span>} />}
          </Section>

          {b.specialRequests && (
            <Section label="Notes"><div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{b.specialRequests}</div></Section>
          )}

          {(b.status === 'cancelled' || co) && (
            <Section label="Cancellation">
              {b.cancellationNumber && <KV k="Cancellation ref" v={<span className="c-mono">{b.cancellationNumber}</span>} />}
              {co?.cancellationFee != null ? (
                <>
                  <KV k="Penalty charged" v={<strong>{fmtMoney(co.cancellationFee, co.cancellationCurrency || co.refundCurrency)}</strong>} />
                  {co.refundAmount != null && <KV k="Refunded" v={fmtMoney(co.refundAmount, co.refundCurrency)} />}
                  {co.originalAmount != null && <KV k="Original" v={fmtMoney(co.originalAmount, co.refundCurrency)} />}
                </>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>
                  {isHB
                    ? `No itemised penalty returned by Hummingbird. The rate's cancellation policy applied — amount at risk was up to ${fmtMoney(b.totalAmount, b.currency)}.`
                    : 'No penalty detail returned by the supplier.'}
                </div>
              )}
            </Section>
          )}

          <Section label="Timeline">
            <KV k="Created" v={fmtCreatedAt(b.createdAt)} />
            {b.updatedAt && b.updatedAt !== b.createdAt && <KV k="Updated" v={fmtCreatedAt(b.updatedAt)} />}
            {b.cancelledAt && <KV k="Cancelled" v={fmtCreatedAt(b.cancelledAt)} />}
          </Section>

          {Array.isArray(b.history) && b.history.length > 0 && (
            <Section label="Audit timeline">
              <div style={{ display: 'grid', gap: 8 }}>
                {b.history.map((ev: any, i: number) => (
                  <div key={i} style={{ fontSize: 12, borderLeft: '2px solid var(--c-line)', paddingLeft: 10 }}>
                    <div style={{ fontWeight: 600 }}>{String(ev.action).replace(/_/g, ' ')}</div>
                    <div style={{ color: 'var(--c-fg-muted)', fontSize: 11 }}>{ev.actor} · {fmtCreatedAt(ev.at)}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-fg-muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'grid', gap: 4 }}>{children}</div>
    </div>
  );
}
function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
      <span style={{ color: 'var(--c-fg-muted)' }}>{k}</span>
      <span style={{ color: 'var(--c-fg)' }}>{v}</span>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  switch (status) {
    case 'confirmed':
      return <span className="c-pill c-pill-success"><CheckCircle2 size={11} /> Confirmed</span>;
    case 'awaiting_supplier_confirmation':
      return <span className="c-pill c-pill-warn"><Clock size={11} /> Awaiting supplier</span>;
    case 'pending':
      return <span className="c-pill c-pill-warn"><Clock size={11} /> Pending</span>;
    case 'cancelled':
      return <span className="c-pill c-pill-danger"><XCircle size={11} /> Cancelled</span>;
    default:
      return <span className="c-pill c-pill-muted"><AlertTriangle size={11} /> {status}</span>;
  }
}

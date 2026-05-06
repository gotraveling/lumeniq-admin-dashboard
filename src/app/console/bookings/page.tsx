'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { CheckCircle2, Clock, XCircle, AlertTriangle, ExternalLink, Search } from 'lucide-react';

interface Booking {
  internalBookingId: string;
  bookingId: string;
  status: string;
  supplierId: string;
  guestInfo: any;
  bookingDetails: any;
  totalAmount: number | null;
  currency: string;
  confirmationNumber: string;
  createdAt: string;
}

type StatusFilter = 'all' | 'confirmed' | 'awaiting_supplier_confirmation' | 'pending' | 'cancelled';

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'awaiting_supplier_confirmation', label: 'Awaiting supplier' },
  { value: 'pending', label: 'Pending' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function ConsoleBookingsPage() {
  const [user, loading] = useAuthState(auth);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [supplierFilter, setSupplierFilter] = useState('all');

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setBusy(false);
      setError('Sign in to view bookings.');
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/bookings');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const list = json?.data?.bookings || [];
        setBookings(list);
      } catch (e: any) {
        setError(e?.message || 'Failed to load bookings');
      } finally {
        setBusy(false);
      }
    })();
  }, [user, loading]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return bookings.filter((b) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (supplierFilter !== 'all' && b.supplierId !== supplierFilter) return false;
      if (!s) return true;
      const haystack = [
        b.bookingId,
        b.internalBookingId,
        b.confirmationNumber,
        b.guestInfo?.firstName,
        b.guestInfo?.lastName,
        b.guestInfo?.email,
        b.bookingDetails?.hotelId,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(s);
    });
  }, [bookings, search, statusFilter, supplierFilter]);

  const suppliers = useMemo(() => {
    const set = new Set<string>();
    bookings.forEach((b) => b.supplierId && set.add(b.supplierId));
    return ['all', ...Array.from(set)];
  }, [bookings]);

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
            placeholder="Search booking ref, email, hotel id…"
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
                <th>Dates</th>
                <th>Total</th>
                <th>Supplier</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const guest = b.guestInfo || {};
                const dates = `${b.bookingDetails?.searchParams?.checkIn || '?'} → ${b.bookingDetails?.searchParams?.checkOut || '?'}`;
                return (
                  <tr key={b.internalBookingId || b.bookingId}>
                    <td className="c-mono" style={{ whiteSpace: 'nowrap' }}>
                      {b.internalBookingId || b.bookingId}
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>
                        {guest.firstName} {guest.lastName}
                      </div>
                      {guest.email && (
                        <div style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>{guest.email}</div>
                      )}
                    </td>
                    <td className="c-mono" style={{ fontSize: 12 }}>
                      {b.bookingDetails?.hotelId || '?'}
                    </td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{dates}</td>
                    <td className="c-mono" style={{ whiteSpace: 'nowrap' }}>
                      {b.totalAmount != null
                        ? new Intl.NumberFormat('en-AU', {
                            style: 'currency',
                            currency: b.currency || 'AUD',
                            maximumFractionDigits: 0,
                          }).format(Number(b.totalAmount))
                        : '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--c-fg-soft)' }}>{b.supplierId}</td>
                    <td>
                      <StatusPill status={b.status} />
                    </td>
                    <td>
                      <Link
                        href={`/admin/bookings/${b.internalBookingId || b.bookingId}`}
                        className="c-btn"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                      >
                        Open <ExternalLink size={11} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function StatusPill({ status }: { status: string }) {
  switch (status) {
    case 'confirmed':
      return (
        <span className="c-pill c-pill-success">
          <CheckCircle2 size={11} /> Confirmed
        </span>
      );
    case 'awaiting_supplier_confirmation':
      return (
        <span className="c-pill c-pill-warn">
          <Clock size={11} /> Awaiting supplier
        </span>
      );
    case 'pending':
      return (
        <span className="c-pill c-pill-warn">
          <Clock size={11} /> Pending
        </span>
      );
    case 'cancelled':
      return (
        <span className="c-pill c-pill-danger">
          <XCircle size={11} /> Cancelled
        </span>
      );
    default:
      return (
        <span className="c-pill c-pill-muted">
          <AlertTriangle size={11} /> {status}
        </span>
      );
  }
}

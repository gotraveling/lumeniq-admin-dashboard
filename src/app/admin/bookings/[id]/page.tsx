'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Calendar, Users, Phone, Mail, MapPin, CreditCard,
  Hotel, Clock, Edit, X, RefreshCw, CheckCircle, XCircle,
  Send, History, DollarSign, AlertTriangle, ThumbsUp, ThumbsDown,
} from 'lucide-react';

interface PriceBreakdown {
  sellingTotal: number | null;
  sellingCurrency: string | null;
  supplierNet: number | null;
  supplierNetCurrency: string | null;
  commissionAmount: number | null;
  commissionPercent: number | null;
  expectedTotalAmount: number | null;
  expectedCurrency: string | null;
  markupRule: null | {
    id: number; name: string; type: string;
    percentage: number | null; fixedAmount: number | null; priority: number;
  };
  capturedAt: string;
}

interface HistoryEvent {
  action: string;
  payload: any;
  actor: string;
  at: string;
}

interface BookingDetail {
  internalBookingId: string;
  bookingId: string;
  supplierId: string;
  status: string;
  guestInfo: any;
  contactInfo: any;
  bookingDetails: any;
  priceBreakdown: PriceBreakdown | null;
  commissionAmount: number | null;
  totalAmount: number | null;
  currency: string;
  confirmationNumber: string;
  cancellationNumber?: string;
  specialRequests?: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
  history: HistoryEvent[];
}

type Toast = { kind: 'success' | 'error' | 'info'; text: string } | null;

export default function BookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'cancel' | 'resend' | 'sync'>(null);
  const [toast, setToast] = useState<Toast>(null);

  const bookingId = params.id as string;

  useEffect(() => { fetchBookingDetail(); }, [bookingId]);

  const fetchBookingDetail = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/bookings/${bookingId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) setBooking(data.data);
        else setError('Booking not found');
      } else {
        setError('Failed to fetch booking details');
      }
    } catch {
      setError('Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (t: Toast) => {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 6000);
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { border: string; icon: any; label: string; color: string }> = {
      confirmed:    { border: 'border-green-600',  icon: CheckCircle,  label: 'Confirmed',  color: 'text-green-600' },
      cancelled:    { border: 'border-red-600',    icon: XCircle,      label: 'Cancelled',  color: 'text-red-600' },
      pending:      { border: 'border-yellow-600', icon: Clock,        label: 'Pending',    color: 'text-yellow-600' },
      on_request:   { border: 'border-yellow-600', icon: Clock,        label: 'On request', color: 'text-yellow-600' },
      awaiting_supplier_confirmation: { border: 'border-amber-600', icon: Clock, label: 'Awaiting supplier', color: 'text-amber-600' },
      failed:       { border: 'border-red-600',    icon: XCircle,      label: 'Failed',     color: 'text-red-600' },
      unknown:      { border: 'border-gray-400',   icon: AlertTriangle,label: 'Unknown',    color: 'text-gray-500' },
    };
    const s = map[status] || { border: 'border-gray-400', icon: AlertTriangle, label: status, color: 'text-gray-500' };
    const Icon = s.icon;
    return (
      <div className={`flex items-center space-x-1 px-3 py-1 bg-white border ${s.border} text-black text-sm rounded-full`}>
        <Icon className={`h-4 w-4 ${s.color}`} />
        <span>{s.label}</span>
      </div>
    );
  };

  const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
  const formatDateTime = (d?: string) => d ? new Date(d).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const fmtMoney = (n: number | null | undefined, ccy: string | null | undefined) =>
    n == null ? '—' : `${ccy || ''} ${n.toFixed(2)}`.trim();

  const handleCancel = async () => {
    if (!booking) return;
    const reason = prompt('Cancellation reason (optional, will be logged in audit):') || '';
    if (!confirm(`Cancel booking ${booking.bookingId} for ${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}?\nThis cannot be undone.`)) return;
    setBusy('cancel');
    try {
      const r = await fetch(`/api/bookings/${bookingId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, actor: 'admin' }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        showToast({ kind: 'success', text: 'Booking cancelled. Supplier has been notified.' });
        await fetchBookingDetail();
      } else {
        showToast({ kind: 'error', text: d.error || `Cancellation failed (${r.status})` });
      }
    } catch (e) {
      showToast({ kind: 'error', text: 'Network error cancelling booking' });
    } finally {
      setBusy(null);
    }
  };

  const handleResend = async () => {
    if (!booking) return;
    setBusy('resend');
    try {
      const r = await fetch(`/api/bookings/${bookingId}/resend-confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: 'admin' }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        showToast({ kind: 'success', text: d.message || 'Confirmation email re-sent.' });
        await fetchBookingDetail();
      } else {
        showToast({ kind: 'error', text: d.error || `Resend failed (${r.status})` });
      }
    } finally { setBusy(null); }
  };

  const handleSupplierDecision = async (decision: 'confirmed' | 'cancelled') => {
    if (!booking) return;
    const verb = decision === 'confirmed' ? 'confirm' : 'decline';
    const confirmationNumber = decision === 'confirmed'
      ? (prompt('Supplier confirmation number (optional, leave blank to keep existing):') || undefined)
      : undefined;
    const note = prompt(`Optional note for the audit log:`) || undefined;
    if (!confirm(`Mark this on-request booking as ${decision}?\nGuest: ${booking.guestInfo?.firstName} ${booking.guestInfo?.lastName}\nThis is irreversible.`)) return;
    setBusy(`supplier-${verb}`);
    try {
      const r = await fetch(`/api/bookings/${bookingId}/supplier-confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, confirmationNumber, note }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        showToast({
          kind: 'success',
          text: decision === 'confirmed'
            ? 'Booking confirmed and customer email sent.'
            : 'Booking declined. Remember to contact the customer personally.',
        });
        await fetchBookingDetail();
      } else {
        showToast({ kind: 'error', text: d.error || `Action failed (${r.status})` });
      }
    } finally { setBusy(null); }
  };

  const handleSync = async () => {
    if (!booking) return;
    setBusy('sync');
    try {
      const r = await fetch(`/api/bookings/${bookingId}/sync-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: 'admin' }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        showToast({
          kind: d.changed ? 'success' : 'info',
          text: d.changed ? `Status updated: ${d.from} → ${d.to}` : `Status unchanged (still ${d.status}).`,
        });
        if (d.changed) await fetchBookingDetail();
      } else {
        showToast({ kind: 'error', text: d.error || `Sync failed (${r.status})` });
      }
    } finally { setBusy(null); }
  };

  if (loading) return <div className="p-8 flex items-center justify-center text-gray-700">Loading…</div>;
  if (error || !booking) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 font-medium">Error</p>
          <p className="text-sm text-red-700">{error || 'Booking not found'}</p>
        </div>
      </div>
    );
  }

  const pb = booking.priceBreakdown;

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      {/* Inline toast */}
      {toast && (
        <div className={`rounded-lg p-3 border ${
          toast.kind === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
          toast.kind === 'error'   ? 'bg-red-50 border-red-200 text-red-800' :
                                     'bg-blue-50 border-blue-200 text-blue-800'
        } flex items-start gap-3`}>
          <p className="flex-1 text-sm">{toast.text}</p>
          <button onClick={() => setToast(null)} className="text-inherit/70 hover:text-inherit">×</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Booking Details</h1>
            <p className="text-gray-600 font-mono text-sm">
              {booking.internalBookingId}
              <span className="text-gray-400 mx-2">·</span>
              <span className="text-gray-500">supplier ref</span> {booking.bookingId}
              <span className="text-gray-400 mx-2">·</span>
              <span className="text-gray-500">{booking.supplierId}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {getStatusBadge(booking.status)}
          <div className="flex space-x-2">
            <button
              onClick={handleResend}
              disabled={!!busy || !booking.guestInfo?.email}
              title={booking.guestInfo?.email ? `Re-send to ${booking.guestInfo.email}` : 'No guest email on file'}
              className="flex items-center space-x-1 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              <span>{busy === 'resend' ? 'Sending…' : 'Resend email'}</span>
            </button>
            <button
              onClick={handleSync}
              disabled={!!busy}
              className="flex items-center space-x-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${busy === 'sync' ? 'animate-spin' : ''}`} />
              <span>{busy === 'sync' ? 'Syncing…' : 'Sync from supplier'}</span>
            </button>
            {/* On-request approval buttons — only visible while the
                booking is waiting on the supplier. After approval the
                row flips to 'confirmed' and the standard cancel/sync
                actions take over. */}
            {booking.status === 'awaiting_supplier_confirmation' && (
              <>
                <button
                  onClick={() => handleSupplierDecision('confirmed')}
                  disabled={!!busy}
                  className="flex items-center space-x-1 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  <ThumbsUp className="h-4 w-4" />
                  <span>{busy === 'supplier-confirm' ? 'Confirming…' : 'Mark Confirmed'}</span>
                </button>
                <button
                  onClick={() => handleSupplierDecision('cancelled')}
                  disabled={!!busy}
                  className="flex items-center space-x-1 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  <ThumbsDown className="h-4 w-4" />
                  <span>{busy === 'supplier-decline' ? 'Declining…' : 'Decline'}</span>
                </button>
              </>
            )}
            {booking.status !== 'cancelled' && booking.status !== 'awaiting_supplier_confirmation' && (
              <button
                onClick={handleCancel}
                disabled={!!busy}
                className="flex items-center space-x-1 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                <span>{busy === 'cancel' ? 'Cancelling…' : 'Cancel booking'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Pricing — top card so margin info is visible at a glance */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <DollarSign className="h-5 w-5 mr-2" /> Pricing &amp; margin
        </h3>
        {pb ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-gray-500">Selling total</div>
              <div className="text-xl font-bold text-gray-900">{fmtMoney(pb.sellingTotal, pb.sellingCurrency)}</div>
            </div>
            <div>
              <div className="text-gray-500">Supplier net</div>
              <div className="text-xl font-bold text-gray-900">{fmtMoney(pb.supplierNet, pb.supplierNetCurrency)}</div>
            </div>
            <div>
              <div className="text-gray-500">Commission</div>
              <div className={`text-xl font-bold ${pb.commissionAmount != null && pb.commissionAmount >= 0 ? 'text-green-700' : 'text-gray-400'}`}>
                {fmtMoney(pb.commissionAmount, pb.sellingCurrency)}
                {pb.commissionPercent != null && (
                  <span className="text-sm font-normal text-gray-500 ml-1">({pb.commissionPercent}%)</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-gray-500">Markup rule</div>
              <div className="text-gray-900">
                {pb.markupRule
                  ? <>
                      <span className="font-medium">{pb.markupRule.name}</span>
                      <div className="text-xs text-gray-500">
                        {pb.markupRule.type === 'percentage'
                          ? `${pb.markupRule.percentage}%`
                          : `+ ${pb.markupRule.fixedAmount}`}
                        {' · priority '}{pb.markupRule.priority}
                        {' · #'}{pb.markupRule.id}
                      </div>
                    </>
                  : <span className="text-gray-400">No matching rule</span>}
              </div>
            </div>
            {(pb.expectedTotalAmount != null && pb.sellingTotal != null && Math.abs(pb.expectedTotalAmount - pb.sellingTotal) > 0.01) && (
              <div className="col-span-2 md:col-span-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                Customer saw {fmtMoney(pb.expectedTotalAmount, pb.expectedCurrency)} at search time, booked at {fmtMoney(pb.sellingTotal, pb.sellingCurrency)}.
              </div>
            )}
            <div className="col-span-2 md:col-span-4 text-xs text-gray-400">
              Captured at {formatDateTime(pb.capturedAt)}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            No pricing breakdown — this booking pre-dates margin tracking, or the supplier returned no net price.
            Total: <span className="font-medium text-gray-900">{fmtMoney(booking.totalAmount, booking.currency)}</span>
          </p>
        )}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <CreditCard className="h-5 w-5 mr-2" /> Booking
          </h3>
          <div className="space-y-3 text-sm">
            <Field label="Internal ref"><span className="font-mono">{booking.internalBookingId}</span></Field>
            <Field label="Supplier ref"><span className="font-mono">{booking.bookingId}</span></Field>
            <Field label="Confirmation #"><span className="font-mono">{booking.confirmationNumber || '—'}</span></Field>
            {booking.cancellationNumber && (
              <Field label="Cancellation #"><span className="font-mono">{booking.cancellationNumber}</span></Field>
            )}
            <Field label="Hotel ID">{booking.bookingDetails?.hotelId || '—'}</Field>
            <Field label="Created">{formatDateTime(booking.createdAt)}</Field>
            <Field label="Updated">{formatDateTime(booking.updatedAt)}</Field>
            {booking.cancelledAt && <Field label="Cancelled">{formatDateTime(booking.cancelledAt)}</Field>}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Users className="h-5 w-5 mr-2" /> Guest
          </h3>
          <div className="space-y-3 text-sm">
            <Field label="Name">{booking.guestInfo?.firstName} {booking.guestInfo?.lastName}</Field>
            <Field label="Email" icon={<Mail className="h-3.5 w-3.5" />}>{booking.guestInfo?.email}</Field>
            {booking.guestInfo?.phone && (
              <Field label="Phone" icon={<Phone className="h-3.5 w-3.5" />}>{booking.guestInfo.phone}</Field>
            )}
            {booking.contactInfo?.address?.country && (
              <Field label="Country" icon={<MapPin className="h-3.5 w-3.5" />}>{booking.contactInfo.address.country}</Field>
            )}
          </div>
        </div>

        {booking.bookingDetails?.searchParams && (
          <div className="bg-white border border-gray-200 rounded-lg p-6 lg:col-span-2">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Hotel className="h-5 w-5 mr-2" /> Stay
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <Field label="Check-in" icon={<Calendar className="h-3.5 w-3.5" />}>{formatDate(booking.bookingDetails.searchParams.checkIn)}</Field>
              <Field label="Check-out" icon={<Calendar className="h-3.5 w-3.5" />}>{formatDate(booking.bookingDetails.searchParams.checkOut)}</Field>
              <Field label="Guests">
                {booking.bookingDetails.searchParams.adults} adults
                {booking.bookingDetails.searchParams.children > 0 && `, ${booking.bookingDetails.searchParams.children} children`}
              </Field>
              <Field label="Rooms">{booking.bookingDetails.searchParams.rooms}</Field>
            </div>
          </div>
        )}

        {booking.specialRequests && (
          <div className="bg-white border border-gray-200 rounded-lg p-6 lg:col-span-2">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Special requests</h3>
            <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded">{booking.specialRequests}</p>
          </div>
        )}
      </div>

      {/* Audit timeline */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <History className="h-5 w-5 mr-2" /> Audit timeline
          <span className="ml-2 text-xs text-gray-500 font-normal">{booking.history?.length || 0} events</span>
        </h3>
        {booking.history && booking.history.length > 0 ? (
          <ol className="space-y-3">
            {booking.history.map((ev, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium text-gray-900">{ev.action.replace(/_/g, ' ')}</span>
                    <span className="text-xs text-gray-500">by {ev.actor}</span>
                    <span className="text-xs text-gray-400">{formatDateTime(ev.at)}</span>
                  </div>
                  {ev.payload && Object.keys(ev.payload).length > 0 && (
                    <details className="mt-1">
                      <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">payload</summary>
                      <pre className="text-xs bg-gray-50 border border-gray-100 rounded p-2 mt-1 overflow-x-auto">{JSON.stringify(ev.payload, null, 2)}</pre>
                    </details>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-gray-500">No events logged for this booking yet. New bookings will accumulate a timeline here.</p>
        )}
      </div>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-500 flex items-center gap-1">
        {icon}{label}
      </div>
      <div className="text-gray-900">{children}</div>
    </div>
  );
}

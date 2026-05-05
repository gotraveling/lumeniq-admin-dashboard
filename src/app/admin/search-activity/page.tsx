'use client';

import React, { useEffect, useState } from 'react';
import {
  RefreshCw, AlertTriangle, CheckCircle, XCircle, Search, Clock,
} from 'lucide-react';

interface Breakdown { available: number; unavailable: number; error: number }
interface Event {
  id: number;
  tenant_id: string;
  session_id: string | null;
  user_email: string | null;
  ip: string | null;
  user_agent: string | null;
  destination: string | null;
  check_in: string | null;
  check_out: string | null;
  adults: number | null;
  children: number | null;
  rooms: number | null;
  hotels_queried: number | null;
  hotels_available: number | null;
  hotels_unavailable: number | null;
  hotels_error: number | null;
  supplier_breakdown: Record<string, Breakdown> | null;
  latency_ms: number | null;
  created_at: string;
}

export default function SearchActivityPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [pagination, setPagination] = useState<{ page: number; pages: number; total: number }>({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ destination: '', email: '', session: '', errorsOnly: false });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.destination) params.set('destination', filters.destination);
    if (filters.email)       params.set('email', filters.email);
    if (filters.session)     params.set('session', filters.session);
    if (filters.errorsOnly)  params.set('errorsOnly', '1');
    params.set('limit', '100');
    setLoading(true);
    fetch(`/api/search/events?${params}`)
      .then(r => r.json())
      .then(d => {
        setEvents(d?.data?.events || []);
        setPagination(d?.data?.pagination || { page: 1, pages: 1, total: 0 });
      })
      .finally(() => setLoading(false));
  }, [filters, refreshKey]);

  const fmtDate = (d: string) => new Date(d).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'medium' });

  const supplierChips = (b: Record<string, Breakdown> | null) => {
    if (!b) return null;
    return Object.entries(b).map(([sup, c]) => (
      <span key={sup} className="inline-flex items-center text-[11px] gap-1 px-1.5 py-0.5 bg-gray-50 border border-gray-200 rounded mr-1">
        <span className="font-medium">{sup}</span>
        {c.available > 0 && <span className="text-green-700">✓{c.available}</span>}
        {c.unavailable > 0 && <span className="text-gray-500">×{c.unavailable}</span>}
        {c.error > 0 && <span className="text-red-700">!{c.error}</span>}
      </span>
    ));
  };

  return (
    <div className="p-8 max-w-7xl space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Search className="h-6 w-6" /> Search activity
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            One row per /api/search/rates/batch call · most recent first
          </p>
        </div>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="flex items-center gap-1 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <input
          placeholder="Destination contains…"
          className="border border-gray-300 rounded-md px-3 py-2 text-sm"
          value={filters.destination}
          onChange={e => setFilters({ ...filters, destination: e.target.value })}
        />
        <input
          placeholder="User email contains…"
          className="border border-gray-300 rounded-md px-3 py-2 text-sm"
          value={filters.email}
          onChange={e => setFilters({ ...filters, email: e.target.value })}
        />
        <input
          placeholder="Session id (exact)"
          className="border border-gray-300 rounded-md px-3 py-2 text-sm font-mono text-xs"
          value={filters.session}
          onChange={e => setFilters({ ...filters, session: e.target.value })}
        />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={filters.errorsOnly}
            onChange={e => setFilters({ ...filters, errorsOnly: e.target.checked })}
          />
          Errors only
        </label>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-xs uppercase text-gray-600">
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Destination</th>
                <th className="px-3 py-2">Dates</th>
                <th className="px-3 py-2">Guests</th>
                <th className="px-3 py-2 text-right">Result</th>
                <th className="px-3 py-2">Suppliers</th>
                <th className="px-3 py-2">Session</th>
                <th className="px-3 py-2">Latency</th>
              </tr>
            </thead>
            <tbody>
              {loading && events.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-500">Loading…</td></tr>
              ) : events.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-500">No events yet — try a search at /luxury-hotels/search and refresh.</td></tr>
              ) : events.map(ev => {
                const errPct = ev.hotels_queried && ev.hotels_error ? Math.round((ev.hotels_error / ev.hotels_queried) * 100) : 0;
                const errBadge = errPct >= 50 ? 'bg-red-50 border-red-200 text-red-700'
                  : errPct > 0 ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-green-50 border-green-200 text-green-700';
                return (
                  <tr key={ev.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1 text-gray-700">
                        <Clock className="h-3.5 w-3.5 text-gray-400" />
                        {fmtDate(ev.created_at)}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-medium">{ev.destination || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-xs">
                      {ev.check_in?.slice(0, 10)} → {ev.check_out?.slice(0, 10)}
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">
                      {ev.adults || 0}A {ev.children ? `${ev.children}C ` : ''}· {ev.rooms || 1}R
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-green-700 inline-flex items-center gap-0.5"><CheckCircle className="h-3 w-3" />{ev.hotels_available || 0}</span>
                        <span className="text-gray-500 inline-flex items-center gap-0.5"><XCircle className="h-3 w-3" />{ev.hotels_unavailable || 0}</span>
                        <span className={`inline-flex items-center gap-0.5 px-1.5 rounded border text-xs ${errBadge}`}>
                          <AlertTriangle className="h-3 w-3" />{ev.hotels_error || 0}
                        </span>
                        <span className="text-gray-400 text-xs">/ {ev.hotels_queried || 0}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {supplierChips(ev.supplier_breakdown)}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-gray-500" title={ev.session_id || ''}>
                      {ev.session_id ? ev.session_id.slice(0, 12) + '…' : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                      {ev.latency_ms != null ? `${ev.latency_ms} ms` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-gray-500 flex justify-between">
        <span>{pagination.total} total event{pagination.total === 1 ? '' : 's'}</span>
        <span>Showing {events.length} most recent</span>
      </div>
    </div>
  );
}

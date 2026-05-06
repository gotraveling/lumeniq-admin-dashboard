'use client';

import { Search, ArrowRight } from 'lucide-react';

export default function ConsoleSearchPage() {
  return (
    <>
      <div className="c-page-head">
        <div>
          <h1 className="c-page-title">B2B Search</h1>
          <p className="c-page-sub">
            Search hotels, compare RateHawk + Hummingbird side-by-side, book on behalf of a customer.
          </p>
        </div>
      </div>

      <div className="c-card" style={{ padding: 32, textAlign: 'center' }}>
        <Search size={28} style={{ color: 'var(--c-accent)', margin: '0 auto 14px' }} />
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Coming next phase</div>
        <p style={{ fontSize: 13, color: 'var(--c-fg-soft)', maxWidth: 480, margin: '0 auto' }}>
          Phase 2 ships the multi-supplier fan-out endpoint and the side-by-side rate panes.
          Each hotel result expands to show every supplier's rates in one view, with refundability,
          commission, and supplier reliability visible at a glance. Phase 3 closes the loop with
          a book-on-behalf-of flow (customer email + invoice or Stripe payment-link).
        </p>
        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center', gap: 10 }}>
          <a href="/console/bookings" className="c-btn">View bookings</a>
          <a href="/console/rules" className="c-btn">Pricing rules <ArrowRight size={12} /></a>
        </div>
      </div>
    </>
  );
}

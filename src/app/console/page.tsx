'use client';

import Link from 'next/link';
import { ClipboardList, Search, Sparkles, ArrowRight } from 'lucide-react';

const TILES = [
  {
    href: '/console/bookings',
    icon: ClipboardList,
    title: 'Bookings',
    body: 'View, filter, and inspect every booking across both suppliers.',
  },
  {
    href: '/console/search',
    icon: Search,
    title: 'B2B Search',
    body: 'Search hotels, compare RateHawk + Hummingbird side-by-side, and book on behalf of a customer.',
  },
  {
    href: '/console/rules',
    icon: Sparkles,
    title: 'Pricing rules',
    body: 'Markup rules per supplier, destination, and rate type.',
  },
];

export default function ConsoleHome() {
  return (
    <>
      <div className="c-page-head">
        <div>
          <h1 className="c-page-title">Console</h1>
          <p className="c-page-sub">
            B2B operations surface — pick a section to get started.
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 14,
        }}
      >
        {TILES.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className="c-card"
              style={{
                padding: 18,
                textDecoration: 'none',
                color: 'inherit',
                display: 'block',
                transition: 'border-color 120ms',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Icon size={18} style={{ color: 'var(--c-accent)' }} />
                <ArrowRight size={14} style={{ color: 'var(--c-fg-muted)' }} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{t.title}</div>
              <div style={{ fontSize: 13, color: 'var(--c-fg-soft)', lineHeight: 1.5 }}>{t.body}</div>
            </Link>
          );
        })}
      </div>
    </>
  );
}

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { useConsoleRole } from '@/lib/useConsoleRole';
import {
  Calendar,
  ClipboardList,
  Search,
  Sparkles,
  Settings,
  LogOut,
  BarChart3,
  Hotel,
  EyeOff,
  DollarSign,
  Globe,
  FolderOpen,
  SlidersHorizontal,
  Link2,
  Tag,
  LayoutList,
} from 'lucide-react';

/**
 * Console shell — sidebar nav + topbar + content slot.
 *
 * Auth: leans on the same firebase auth that /admin uses so console
 * pages don't need to re-auth. We surface the signed-in user's email
 * in the topbar; if there's no session, the sidebar still renders
 * (each page is responsible for its own access check, same pattern
 * as legacy admin).
 */
// Items prefixed with `/admin/` are not yet ported to the console
// shell — clicking them leaves the console layout for the legacy
// admin layout. They're surfaced here so consultants don't have to
// remember the two-URL split. Will be migrated into /console/* over
// time and then the hrefs swap without consumers noticing.
// adminOnly items are hidden from consultants (and the routes are guarded below).
// Consultants keep: Bookings + B2B Search (their job — search, book, notes).
const NAV: Array<{ section: string; items: Array<{ href: string; label: string; icon: any; adminOnly?: boolean }> }> = [
  {
    section: 'Operations',
    items: [
      { href: '/console/bookings',         label: 'Bookings',        icon: ClipboardList },
      { href: '/console/search',           label: 'B2B Search',      icon: Search },
      { href: '/console/offers',           label: 'Offers',          icon: Tag, adminOnly: true },
      // AI Agent search disabled — driven via MCP now (2026-06-28)
      { href: '/console/search-activity',  label: 'Search Activity', icon: BarChart3, adminOnly: true },
    ],
  },
  {
    section: 'Catalog',
    items: [
      { href: '/console/pages',            label: 'Pages',             icon: LayoutList, adminOnly: true },
      { href: '/console/collections',      label: 'Collections',       icon: FolderOpen, adminOnly: true },
      { href: '/console/room-mappings',    label: 'Room Mappings',     icon: Link2, adminOnly: true },
      { href: '/console/profiles',         label: 'Profiles',          icon: SlidersHorizontal, adminOnly: true },
      { href: '/console/editorial',        label: 'Editorial Content', icon: Sparkles, adminOnly: true },
      { href: '/console/hotels/visibility', label: 'Hotel Visibility', icon: EyeOff, adminOnly: true },
    ],
  },
  {
    section: 'Pricing',
    items: [
      { href: '/console/rules',            label: 'Pricing rules',     icon: DollarSign, adminOnly: true },
    ],
  },
  {
    section: 'Setup',
    items: [
      { href: '/console/suppliers',        label: 'Suppliers', icon: Globe, adminOnly: true },
      { href: '/console/settings',         label: 'Settings',  icon: Settings, adminOnly: true },
    ],
  },
];

// A consultant may only reach the overview, bookings, and B2B search (+ its
// sub-routes). Everything else under /console is admin-only. Kept as a function
// (not a prefix list) so "/console/search" is allowed but "/console/search-activity"
// is NOT, despite the shared prefix.
function consultantMayAccess(pathname: string): boolean {
  if (pathname === '/console' || pathname === '/console/') return true;
  if (pathname === '/console/bookings' || pathname.startsWith('/console/bookings/')) return true;
  if (pathname === '/console/search' || pathname.startsWith('/console/search/')) return true;
  return false;
}

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, loading] = useAuthState(auth);
  const { isAdmin, loading: roleLoading } = useConsoleRole();

  // Same auth gate /admin uses — push the visitor to /auth/login the
  // moment we know they're not signed in. Without this, /console/*
  // pages were rendering shell + (possibly empty) content for anon
  // visitors.
  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
    }
  }, [loading, user, router]);

  // Role gate: a consultant who deep-links (or is redirected) to an admin-only
  // route is bounced to B2B Search. UI-level guard — Tina's concern is
  // consultants ACCIDENTALLY changing settings, not a determined attacker.
  useEffect(() => {
    if (!loading && user && !roleLoading && !isAdmin && !consultantMayAccess(pathname)) {
      router.replace('/console/search');
    }
  }, [loading, user, roleLoading, isAdmin, pathname, router]);

  // Block render until firebase has answered. Otherwise the shell
  // flashes briefly before the redirect on slow connections — that
  // 'just enough to see' window is exactly what raised the question
  // about why pages render without login.
  if (loading || !user) {
    return (
      <div className="console-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="c-loading">Checking sign-in…</div>
      </div>
    );
  }

  const crumbs = buildCrumbs(pathname);

  return (
    <div className="console-shell">
      <aside className="c-sidebar">
        <div className="c-brand">
          First<span className="accent">Class</span> · Console
        </div>
        <nav className="c-nav">
          <Link
            href="/console"
            className={`c-nav-link ${pathname === '/console' ? 'active' : ''}`}
          >
            <Calendar size={15} /> Overview
          </Link>
          {NAV.map((section) => {
            // Hide admin-only items (and any section left empty) from consultants.
            const items = section.items.filter((it) => isAdmin || !it.adminOnly);
            if (items.length === 0) return null;
            return (
            <div key={section.section}>
              <div className="c-nav-section">{section.section}</div>
              {items.map((it) => {
                const Icon = it.icon;
                const active = pathname === it.href || pathname.startsWith(it.href + '/');
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={`c-nav-link ${active ? 'active' : ''}`}
                  >
                    <Icon size={15} /> {it.label}
                  </Link>
                );
              })}
            </div>
            );
          })}
          <div style={{ marginTop: 'auto', paddingTop: 18 }}>
            {/* Legacy admin has no index route (no /admin/page.tsx) — only
                sub-pages like /admin/dashboard exist, so linking to /admin 404s.
                Point at the real landing page. Admin-only. */}
            {isAdmin && (
              <Link href="/admin/dashboard" className="c-nav-link">
                <Settings size={15} /> Legacy admin
              </Link>
            )}
            <button
              type="button"
              onClick={() => auth.signOut().then(() => router.push('/auth/login'))}
              className="c-nav-link"
              style={{ background: 'transparent', border: 0, width: '100%', textAlign: 'left' }}
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </nav>
      </aside>

      <div className="c-main">
        <header className="c-topbar">
          <nav className="c-crumbs" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={i}>
                {i > 0 && <span className="sep">/</span>}
                {c.href && i < crumbs.length - 1 ? (
                  <Link href={c.href}>{c.label}</Link>
                ) : (
                  <span className="current">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
          <div className="c-userbox">
            <span className="dot" />
            <span>{user.email}</span>
          </div>
        </header>
        <main className="c-content">{children}</main>
      </div>
    </div>
  );
}

function buildCrumbs(pathname: string): Array<{ label: string; href?: string }> {
  if (pathname === '/console') return [{ label: 'Console' }];
  const parts = pathname.replace(/^\/console\/?/, '').split('/').filter(Boolean);
  const crumbs: Array<{ label: string; href?: string }> = [{ label: 'Console', href: '/console' }];
  let cursor = '/console';
  parts.forEach((p, idx) => {
    cursor += '/' + p;
    crumbs.push({
      label: p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, ' '),
      href: idx < parts.length - 1 ? cursor : undefined,
    });
  });
  return crumbs;
}

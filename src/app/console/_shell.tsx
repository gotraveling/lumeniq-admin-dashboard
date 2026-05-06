'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import {
  Calendar,
  ClipboardList,
  Search,
  Sparkles,
  Settings,
  LogOut,
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
const NAV: Array<{ section: string; items: Array<{ href: string; label: string; icon: any }> }> = [
  {
    section: 'Operations',
    items: [
      { href: '/console/bookings', label: 'Bookings', icon: ClipboardList },
      { href: '/console/search', label: 'B2B Search', icon: Search },
    ],
  },
  {
    section: 'Pricing',
    items: [
      { href: '/console/rules', label: 'Pricing rules', icon: Sparkles },
    ],
  },
];

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, loading] = useAuthState(auth);

  // Same auth gate /admin uses — push the visitor to /auth/login the
  // moment we know they're not signed in. Without this, /console/*
  // pages were rendering shell + (possibly empty) content for anon
  // visitors.
  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
    }
  }, [loading, user, router]);

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
          {NAV.map((section) => (
            <div key={section.section}>
              <div className="c-nav-section">{section.section}</div>
              {section.items.map((it) => {
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
          ))}
          <div style={{ marginTop: 'auto', paddingTop: 18 }}>
            <Link href="/admin" className="c-nav-link">
              <Settings size={15} /> Legacy admin
            </Link>
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

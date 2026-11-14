'use client';

import { useEffect, useState } from 'react';
import { onIdTokenChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

// Roles that get full admin access (manage hotels, rates, pricing, collections,
// settings). Everything else — 'user', 'consultant', or no role at all — is a
// CONSULTANT: search + book + view bookings + add internal notes, but no config.
// Fail CLOSED: an unknown/missing role is treated as a consultant so a
// consultant without an admin claim can never reach the admin surfaces.
const ADMIN_ROLES = new Set(['super_admin', 'admin', 'firstclass_admin']);

export type ConsoleRole = {
  role: string | null;
  isAdmin: boolean;
  /** A Hotelbeds certifier: sees /console/hotelbeds only, sell prices only. */
  isCertifier: boolean;
  loading: boolean;
};

export function useConsoleRole(): ConsoleRole {
  const [role, setRole] = useState<string | null>(null);
  const [isCertifier, setIsCertifier] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (u) => {
      if (!u) { setRole(null); setIsCertifier(false); setLoading(false); return; }
      setLoading(true);
      try {
        const t = await u.getIdTokenResult();
        setRole(typeof t.claims.role === 'string' ? (t.claims.role as string) : null);
        // The certifier allowlist is server-side, so ask the server. We stay
        // loading until it answers, so a certifier never sees the full nav.
        // This only shapes the UI: every API route applies the same rule
        // itself, so a certifier who got the wrong nav would still get 403s.
        try {
          const res = await fetch('/api/console/me', { headers: { Authorization: `Bearer ${t.token}` }, cache: 'no-store' });
          const me = res.ok ? await res.json() : null;
          setIsCertifier(me?.certifier === true);
        } catch {
          setIsCertifier(false);
        }
      } catch {
        setRole(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return { role, isAdmin: !isCertifier && !!role && ADMIN_ROLES.has(role), isCertifier, loading };
}

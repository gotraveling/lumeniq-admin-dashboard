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

export type ConsoleRole = { role: string | null; isAdmin: boolean; loading: boolean };

export function useConsoleRole(): ConsoleRole {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (u) => {
      if (!u) { setRole(null); setLoading(false); return; }
      try {
        const t = await u.getIdTokenResult();
        setRole(typeof t.claims.role === 'string' ? (t.claims.role as string) : null);
      } catch {
        setRole(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return { role, isAdmin: !!role && ADMIN_ROLES.has(role), loading };
}

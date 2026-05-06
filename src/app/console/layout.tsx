/**
 * /console — new B2B / staff console.
 *
 * Lives alongside the legacy /admin/* pages so we can migrate features
 * one at a time. Same Next app, same auth, same APIs — just a cleaner
 * shell + new design tokens. Each console page lives under /console/*.
 *
 * Visual direction: Linear/Vercel-dashboard, not WhatsApp. White
 * background, hairline gray borders, Inter throughout, FC-gold accent
 * only for primary actions. Compact info-dense tables — staff scan
 * many bookings/rates per minute, density matters more than whitespace.
 */
import { ConsoleShell } from './_shell';
import './_console.css';

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <ConsoleShell>{children}</ConsoleShell>;
}

export const metadata = {
  title: 'FirstClass Console',
  robots: { index: false, follow: false },
};

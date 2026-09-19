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

/**
 * Never let a browser hold on to console HTML.
 *
 * These pages were prerendered and served with `s-maxage=31536000` and no
 * `max-age`, so a browser was free to decide for itself how long the document
 * stayed fresh. Consultants kept working from a page that referenced the
 * previous build's JavaScript for hours after a deploy, and reported fixed bugs
 * as still broken. Rendering per request sends `no-store`, so every load picks
 * up the current build. The pages are behind a login and already fetch all
 * their data at runtime, so there was nothing to gain from prerendering them.
 */
export const dynamic = 'force-dynamic';

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <ConsoleShell>{children}</ConsoleShell>;
}

export const metadata = {
  title: 'FirstClass Console',
  robots: { index: false, follow: false },
};

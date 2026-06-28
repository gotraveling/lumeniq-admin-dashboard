/**
 * AI Agent — DISABLED (2026-06-28).
 *
 * The in-console agent search is driven via the booking-engine MCP server
 * now, so this route is parked. The implementation still lives in
 * ../search/AgentPanel.tsx — to re-enable, restore the previous page body
 * (git history) and re-add the "AI Agent" nav item in ../_shell.tsx.
 *
 * Any stale bookmark / deep-link lands back on the B2B search canvas.
 */

import { redirect } from 'next/navigation';

export default function ConsoleAIPage() {
  redirect('/console/search');
}

'use client';

/**
 * Dedicated AI Agent page — full-width chat for deeper research /
 * discovery flows. The compact search-side agent panel lives on
 * /console/search; here you get more room to read responses, drill
 * into tool calls, and run multi-turn discovery without competing
 * with the result canvas.
 *
 * Tool-found hotels still hydrate the results canvas — clicking
 * "Open →" in an expanded tool chip navigates to /console/search
 * with the hotel id, where the consultant completes the booking.
 */

import { useRouter } from 'next/navigation';
import AgentPanel from '../search/AgentPanel';

export default function ConsoleAIPage() {
  const router = useRouter();

  return (
    <>
      <div className="c-page-head">
        <div>
          <h1 className="c-page-title">AI Agent</h1>
          <p className="c-page-sub">
            Discovery and comparison via natural language. Once a hotel is picked, complete the booking on the B2B search page.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 920 }}>
        <AgentPanel
          onHotelClick={(h) => {
            // Jump to the search canvas with this hotel pre-loaded.
            // /console/search reads ?hotelId=… and opens the detail view.
            const params = new URLSearchParams({ hotelId: String(h.id) });
            router.push(`/console/search?${params.toString()}`);
          }}
        />
      </div>
    </>
  );
}

'use client';

/**
 * AI Agent — discovery-only.
 *
 * Consultants use the agent to explore hotels across various intents
 * ("honeymoon Maldives", "Conrad LA refundable", "compare Pullman vs
 * Conrad"). Once they pick a hotel, we hand off to the normal search
 * canvas (/console/search) where the existing booking flow takes
 * over. No booking happens on this page.
 *
 * Layout is Perplexity-style — flowing conversation, no surrounding
 * card, input sticky at the bottom. The agent's tool chips expose
 * "Open →" buttons per hotel result that deep-link into the canvas
 * with hotel id + the dates/guests the agent was reasoning about.
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
            Discover hotels by intent. Pick one and complete the booking on the B2B search page.
          </p>
        </div>
      </div>

      <AgentPanel
        variant="page"
        onHotelClick={(h: any) => {
          // Carry the dates/guests the agent inferred so the canvas
          // doesn't re-prompt the consultant.
          const params = new URLSearchParams({ hotelId: String(h.id) });
          if (h.checkIn)  params.set('checkIn',  h.checkIn);
          if (h.checkOut) params.set('checkOut', h.checkOut);
          if (h.adults)   params.set('adults',   String(h.adults));
          if (h.rooms)    params.set('rooms',    String(h.rooms));
          router.push(`/console/search?${params.toString()}`);
        }}
      />
    </>
  );
}

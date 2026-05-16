/**
 * Streaming chat endpoint for the /console/search agent panel.
 *
 * Stack: Vercel AI SDK v6 + @ai-sdk/google-vertex + Gemini 2.5 Flash.
 * Same pattern as enquiry-copilot/src/lib/draft.ts.
 *
 * Tools available to the agent: search_hotels, get_rate_breakdown,
 * compare_hotels (see src/lib/agent/tools.ts). Booking is intentionally
 * NOT a tool — booking happens deterministically in the canvas UI.
 */
import { NextRequest } from 'next/server';
import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import { agentTools } from '@/lib/agent/tools';

const SYSTEM = `You are a hotel-booking research assistant for FirstClass Travel consultants.

Your job is to help the consultant find and compare hotels for a customer. You can:
  • Search the inventory by destination or hotel name (search_hotels)
  • Pull live rates for a specific hotel on specific dates (get_rate_breakdown)
  • Compare cheapest rates across a shortlist (compare_hotels)

Rules:
  • Always confirm or assume sensible defaults if dates / guests are missing — never invent them silently. Mention what you assumed in your reply.
  • Default to 2 adults, 1 room, ISO check-in 30 days from today if unspecified.
  • When the consultant gives natural-language dates (e.g. "next October", "long weekend in May"), pick reasonable ISO YYYY-MM-DD values and state them in your reply.
  • Prefer concise tabular replies when comparing rates. Show NET, MARKUP, SELL columns. Currency from the rate.
  • Never quote a price without running get_rate_breakdown or compare_hotels — search_hotels does not return rates.
  • If the consultant asks to book, tell them to click the "Book" button on the matching hotel card in the canvas — booking happens there, not in chat.
  • Be terse. Consultants scan many of these per day. No filler phrases like "Great question!" or "Of course!".`;

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // Vertex provider is lazy-loaded so the build doesn't require creds
  // to be present at compile time.
  const { createVertex } = await import('@ai-sdk/google-vertex');
  const vertex = createVertex({
    project:  process.env.GOOGLE_VERTEX_PROJECT  || 'travelx-451306',
    location: process.env.GOOGLE_VERTEX_LOCATION || 'us-central1'
  });
  const model = vertex('gemini-2.5-flash');

  const { messages } = await req.json();

  const modelMessages = await convertToModelMessages(messages);
  const result = await streamText({
    model,
    system: SYSTEM,
    messages: modelMessages,
    tools: agentTools,
    // Let the agent take up to 5 tool-call/respond cycles per turn so
    // it can search → fetch rates → reply without ending early.
    stopWhen: stepCountIs(5)
  });

  return result.toUIMessageStreamResponse();
}

'use client';

/**
 * Right-side agent chat for /console/search.
 *
 * Streams Vertex Gemini 2.5 Flash via /api/console/agent/stream using
 * the Vercel AI SDK's useChat hook. Tool calls (search_hotels,
 * get_rate_breakdown, compare_hotels) render inline as compact summary
 * chips so the consultant can see what the agent is doing without
 * scrolling JSON.
 *
 * The agent does NOT book — that's a deterministic flow in the canvas.
 */

import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Send, Sparkles, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Props = {
  /** Called when a tool returns a list of hotels so the canvas can hydrate. */
  onHotelsFound?: (hits: any[]) => void;
  /** Click-to-open a specific hotel directly from inside an agent tool result. */
  onHotelClick?:  (hotel: { id: number; name?: string; city?: string; country?: string; image?: string | null }) => void;
  /**
   * 'compact' — bordered card used in /console/search sidebar (default).
   * 'page'    — Perplexity-style full page: no outer frame, document
   *             flow, sticky input pinned to the bottom of the viewport.
   */
  variant?: 'compact' | 'page';
};

export default function AgentPanel({ onHotelsFound, onHotelClick, variant = 'compact' }: Props) {
  if (variant === 'page') return <PageAgentPanel onHotelsFound={onHotelsFound} onHotelClick={onHotelClick} />;
  const [input, setInput] = useState('');
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/console/agent/stream' }),
    onFinish: ({ message }: { message: any }) => {
      // If a search_hotels tool produced hits, propagate them to the canvas.
      const parts = message.parts || [];
      for (const p of parts) {
        if (p.type?.startsWith('tool-search_hotels') && p.output?.hits) {
          onHotelsFound?.(p.output.hits);
        }
      }
    }
  } as any);

  const busy = status === 'streaming' || status === 'submitted';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      // Capped so the whole panel (header + scrollable history + input)
      // fits inside the viewport on 13" laptops. The parent is `position:
      // sticky; top: 52` so the panel scrolls with the page until it
      // pins, then stays in view — input always reachable.
      height: 'min(calc(100vh - 80px), 640px)',
      border: '1px solid var(--c-line)',
      borderRadius: 10,
      background: 'var(--c-bg)',
      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      overflow: 'hidden'
    }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--c-line)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--c-bg-soft)' }}>
        <Sparkles size={14} style={{ color: 'var(--c-accent)' }} />
        <span style={{ fontSize: 13, fontWeight: 700 }}>Agent</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && (
          <div style={{ color: 'var(--c-fg-muted)', fontSize: 13, marginTop: 8 }}>
            Ask in natural language. Examples:
            <ul style={{ paddingLeft: 18, marginTop: 8, lineHeight: 1.8 }}>
              <li>"3-night honeymoon in the Maldives end of October, 2 adults, refundable only"</li>
              <li>"Conrad LA next weekend, 2 adults — what's the cheapest breakfast-included rate?"</li>
              <li>"Compare Pullman Dubai JLT vs Conrad LA for the same week"</li>
            </ul>
          </div>
        )}

        {messages.map((m: any) => (
          <div key={m.id} style={{
            background: m.role === 'user' ? 'var(--c-accent-soft)' : 'var(--c-bg-soft)',
            border: '1px solid var(--c-line)',
            borderRadius: 10,
            padding: '10px 12px',
            fontSize: 13.5,
            lineHeight: 1.5
          }}>
            <div style={{ fontSize: 10.5, color: 'var(--c-fg-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4, fontWeight: 700 }}>
              {m.role === 'user' ? 'You' : 'Agent'}
            </div>
            {(m.parts || []).map((p: any, i: number) => {
              if (p.type === 'text') {
                return (
                  <div key={i} className="agent-md">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.text}</ReactMarkdown>
                  </div>
                );
              }
              if (typeof p.type === 'string' && p.type.startsWith('tool-')) {
                return <ToolChip key={i} part={p} onHotelClick={onHotelClick} />;
              }
              return null;
            })}
          </div>
        ))}

        {busy && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--c-fg-muted)', fontSize: 12 }}>
            <Loader2 size={13} className="animate-spin" /> thinking…
          </div>
        )}
      </div>

      {/* Tool-call chip helper at module scope below */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim() || busy) return;
          sendMessage({ text: input });
          setInput('');
        }}
        style={{ borderTop: '1px solid var(--c-line)', padding: 12, display: 'flex', gap: 8 }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the agent…"
          disabled={busy}
          style={{
            flex: 1, padding: '8px 10px', fontSize: 13.5,
            border: '1px solid var(--c-line)', borderRadius: 6,
            background: 'var(--c-bg)', color: 'var(--c-fg)'
          }}
        />
        <button
          type="submit"
          className="c-btn c-btn-primary"
          disabled={busy || !input.trim()}
          style={{ padding: '8px 12px' }}
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}

/**
 * Page-variant chat — Perplexity-style. The conversation flows
 * straight down the page (no outer card), and the input pins to the
 * bottom of the viewport via position:sticky. Suited for deep
 * research / discovery on /console/ai where there's no canvas
 * competing for width.
 */
function PageAgentPanel({ onHotelsFound, onHotelClick }: { onHotelsFound?: Props['onHotelsFound']; onHotelClick?: Props['onHotelClick'] }) {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/console/agent/stream' }),
    onFinish: ({ message }: { message: any }) => {
      const parts = message.parts || [];
      for (const p of parts) {
        if (p.type?.startsWith('tool-search_hotels') && p.output?.hits) {
          onHotelsFound?.(p.output.hits);
        }
      }
    }
  } as any);
  const busy = status === 'streaming' || status === 'submitted';

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', paddingBottom: 96 }}>
      {messages.length === 0 && (
        <div style={{ color: 'var(--c-fg-muted)', fontSize: 14, marginTop: 16, lineHeight: 1.7 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-fg)', marginBottom: 10, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Try
          </div>
          <ul style={{ paddingLeft: 16, marginTop: 0, display: 'grid', gap: 6 }}>
            <li>3-night honeymoon in the Maldives end of October, 2 adults, refundable only</li>
            <li>Conrad LA next weekend, 2 adults — what's the cheapest breakfast-included rate?</li>
            <li>Compare Pullman Dubai JLT vs Conrad LA for the same week</li>
          </ul>
        </div>
      )}

      {messages.map((m: any) => {
        const isUser = m.role === 'user';
        return (
          <div key={m.id} style={{ marginTop: 24 }}>
            {isUser ? (
              // User turn — read like a query heading, not a chat bubble.
              <div style={{
                fontSize: 22, fontWeight: 700, color: 'var(--c-fg)', lineHeight: 1.3,
                paddingBottom: 12, borderBottom: '1px solid var(--c-line)'
              }}>
                {(m.parts || []).map((p: any, i: number) => p.type === 'text' ? <span key={i}>{p.text}</span> : null)}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                <Sparkles size={16} style={{ color: 'var(--c-accent)', flexShrink: 0, marginTop: 4 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {(m.parts || []).map((p: any, i: number) => {
                    if (p.type === 'text') {
                      return (
                        <div key={i} className="agent-md" style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--c-fg)' }}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.text}</ReactMarkdown>
                        </div>
                      );
                    }
                    if (typeof p.type === 'string' && p.type.startsWith('tool-')) {
                      return <ToolChip key={i} part={p} onHotelClick={onHotelClick} />;
                    }
                    return null;
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {busy && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--c-fg-muted)', fontSize: 13, marginTop: 20 }}>
          <Loader2 size={14} className="animate-spin" /> thinking…
        </div>
      )}

      {/* Sticky bottom input — floats over the page with a soft shadow.
          Unlike the compact variant, no surrounding frame; the input
          itself is the visual anchor, Perplexity-style. */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0,
        background: 'linear-gradient(to top, var(--c-bg) 60%, rgba(255,255,255,0))',
        padding: '24px 16px 20px', zIndex: 50, pointerEvents: 'none'
      }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!input.trim() || busy) return;
            sendMessage({ text: input });
            setInput('');
          }}
          style={{
            maxWidth: 760, margin: '0 auto', display: 'flex', gap: 8,
            background: 'var(--c-bg)', border: '1px solid var(--c-line)',
            borderRadius: 14, padding: 6,
            boxShadow: '0 6px 24px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)',
            pointerEvents: 'auto'
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything — destination, dates, vibe…"
            disabled={busy}
            style={{
              flex: 1, padding: '10px 12px', fontSize: 14.5,
              border: 0, outline: 'none', background: 'transparent', color: 'var(--c-fg)'
            }}
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            style={{
              padding: '8px 14px',
              background: input.trim() && !busy ? 'var(--c-accent)' : 'var(--c-bg-soft)',
              color: input.trim() && !busy ? 'white' : 'var(--c-fg-muted)',
              border: 0, borderRadius: 10, cursor: busy || !input.trim() ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600
            }}
          >
            <Send size={14} />
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * Collapsed tool-call chip — Perplexity-style. Single line by default
 * with a chevron; click to expand the full input + output JSON.
 */
function ToolChip({ part, onHotelClick }: { part: any; onHotelClick?: Props['onHotelClick'] }) {
  const toolName = String(part.type || '').replace('tool-', '');
  const out = part.output || {};
  // Auto-expand for the tool calls the consultant actually wants to
  // act on (rate breakdowns, comparisons). Search-only chips stay
  // collapsed by default because they just show "N hotels" — the
  // value is in the agent's markdown reply below, not the chip.
  const autoOpen = toolName === 'get_rate_breakdown' || toolName === 'compare_hotels';
  const [open, setOpen] = useState(autoOpen);
  // The dates/guests the agent reasoned about — surface them so the
  // canvas can prefill instead of re-prompting the consultant.
  const ctx = {
    checkIn:  part.input?.checkIn  || null,
    checkOut: part.input?.checkOut || null,
    adults:   part.input?.adults   || null,
    rooms:    part.input?.rooms    || null
  };
  // Pull clickable hotels out of whichever shape the tool returned.
  const hotelsFromOutput: Array<{ id: number; name?: string; city?: string; country?: string; image?: string | null; supplier?: string; checkIn?: string; checkOut?: string; adults?: number; rooms?: number }> = [];
  if (Array.isArray(out.hits))    hotelsFromOutput.push(...out.hits.map((h: any) => ({ ...h, ...ctx })));
  if (Array.isArray(out.results)) hotelsFromOutput.push(...out.results.map((r: any) => ({ id: r.hotelId, name: r.hotel?.name, city: r.hotel?.city, country: r.hotel?.country, supplier: r.supplier, ...ctx })));
  if (out.hotel && out.rates) hotelsFromOutput.push({ id: out.hotel.id, name: out.hotel.name, city: out.hotel.city, country: out.hotel.country, ...ctx });

  let summary = '';
  if (out.hits)    summary = `${out.hits.length} hotels`;
  if (out.rates)   summary = `${out.rates.length} rates`;
  if (out.results) summary = `${out.results.length} compared`;
  if (out.error)   summary = `error: ${out.error}`;
  const inputBrief = part.input ? Object.entries(part.input).slice(0, 3).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ') : '';

  return (
    <div style={{
      marginTop: 6, padding: '4px 8px', borderRadius: 6,
      background: 'var(--c-bg)', border: '1px solid var(--c-line)',
      fontSize: 11.5, fontFamily: 'var(--c-mono)', color: 'var(--c-fg-soft)'
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left' }}
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <strong style={{ color: 'var(--c-accent)' }}>{toolName}</strong>
        {!open && inputBrief && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>· {inputBrief}</span>}
        {summary && <span style={{ marginLeft: 'auto', color: out.error ? 'var(--c-danger)' : 'var(--c-fg-muted)' }}>{summary}</span>}
      </button>

      {open && hotelsFromOutput.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--c-fg, sans-serif)' }}>
          {/* Single-hotel rate breakdown — one big accent button so the
              consultant has an obvious next step. Multi-hotel searches
              keep the per-row list below. */}
          {toolName === 'get_rate_breakdown' && hotelsFromOutput.length === 1 ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onHotelClick?.(hotelsFromOutput[0]); }}
              style={{
                background: 'var(--c-accent)', color: 'white',
                border: 0, borderRadius: 8, padding: '10px 14px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                boxShadow: '0 1px 2px rgba(0,0,0,0.06)'
              }}
              title="Open this hotel in the booking canvas"
            >
              <span>Open in canvas to book — {hotelsFromOutput[0].name || `Hotel #${hotelsFromOutput[0].id}`}</span>
              <span style={{ marginLeft: 12 }}>→</span>
            </button>
          ) : (
            hotelsFromOutput.slice(0, 10).map((h, i) => (
              <button
                key={`${h.id}-${i}`}
                type="button"
                onClick={(e) => { e.stopPropagation(); onHotelClick?.(h); }}
                style={{
                  textAlign: 'left', background: 'var(--c-bg-soft)', border: '1px solid var(--c-line-soft)',
                  borderRadius: 4, padding: '6px 8px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit'
                }}
                title="Open in canvas"
              >
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-fg)' }}>{h.name || `Hotel #${h.id}`}</span>
                <span style={{ fontSize: 11, color: 'var(--c-fg-muted)' }}>
                  {[h.city, h.country].filter(Boolean).join(', ')}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--c-accent)', fontWeight: 600 }}>Open →</span>
              </button>
            ))
          )}
        </div>
      )}

      {open && hotelsFromOutput.length === 0 && (
        <pre style={{ marginTop: 6, marginBottom: 0, fontSize: 10.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: 240, background: 'var(--c-bg-soft)', padding: 8, borderRadius: 4 }}>
{JSON.stringify({ input: part.input, output: part.output }, null, 2)}
        </pre>
      )}
    </div>
  );
}

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

type Props = {
  /** Called when a tool returns a list of hotels so the canvas can hydrate. */
  onHotelsFound?: (hits: any[]) => void;
};

export default function AgentPanel({ onHotelsFound }: Props) {
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
                return <div key={i} style={{ whiteSpace: 'pre-wrap' }}>{p.text}</div>;
              }
              if (typeof p.type === 'string' && p.type.startsWith('tool-')) {
                return <ToolChip key={i} part={p} />;
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
 * Collapsed tool-call chip — Perplexity-style. Single line by default
 * with a chevron; click to expand the full input + output JSON.
 */
function ToolChip({ part }: { part: any }) {
  const [open, setOpen] = useState(false);
  const toolName = String(part.type || '').replace('tool-', '');
  const out = part.output || {};
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
      {open && (
        <pre style={{ marginTop: 6, marginBottom: 0, fontSize: 10.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: 240, background: 'var(--c-bg-soft)', padding: 8, borderRadius: 4 }}>
{JSON.stringify({ input: part.input, output: part.output }, null, 2)}
        </pre>
      )}
    </div>
  );
}

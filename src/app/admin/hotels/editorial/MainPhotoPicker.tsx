'use client';

/**
 * Pick a hotel's main photo — the first photo on the public hotel page, its
 * search card and its collection cards.
 *
 * Shows the hotel's own photos (the same gallery the hotel page uses); clicking
 * one makes it the main photo. A photo from elsewhere can be pasted as a link.
 * Saved in the editorial overlay (keyed by hotel_id), so a supplier re-sync
 * never undoes it. One main photo per hotel.
 */
import React, { useEffect, useState } from 'react';
import { viaResizer } from '@/lib/imageUrl';

const HOTEL_API_URL = process.env.NEXT_PUBLIC_HOTEL_API_URL || 'https://hotel-api-91901273027.australia-southeast1.run.app';

function toUrl(img: unknown): string | null {
  const v = typeof img === 'string' ? img : (img && typeof img === 'object'
    ? ((img as Record<string, unknown>).url || (img as Record<string, unknown>).image_url) : null);
  return typeof v === 'string' && v ? v.replace('{size}', '1024x768') : null;
}

export default function MainPhotoPicker({
  hotelId,
  current,
  onChanged,
}: {
  hotelId: number;
  /** URL of the current main photo, if one is set. */
  current: string | null;
  onChanged: () => void;
}) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    setLoading(true);
    fetch(`${HOTEL_API_URL}/api/hotels/${hotelId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (off) return;
        const h = d?.hotel || d || {};
        const urls = (Array.isArray(h.images) ? h.images : []).map(toUrl).filter(Boolean) as string[];
        setPhotos([...new Set(urls)]);
      })
      .catch(() => { if (!off) setPhotos([]); })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [hotelId]);

  async function choose(url: string) {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`${HOTEL_API_URL}/api/editorial/hotels/${hotelId}/featured-photo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_url: url, updated_by: 'console' }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.success === false) throw new Error(d.error || `HTTP ${r.status}`);
      setPasted('');
      onChanged();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function clear() {
    if (!confirm('Go back to the supplier\'s photo order?')) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch(`${HOTEL_API_URL}/api/editorial/hotels/${hotelId}/featured-photo`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      onChanged();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="mb-8 rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="font-semibold">Main photo</h3>
          <p className="text-sm text-gray-600">
            Shown first on the hotel page, search results and collection pages. Click a photo to use it.
            Changes show on the website within a few minutes.
          </p>
        </div>
        {current && (
          <button onClick={clear} disabled={busy} className="text-sm text-red-600 hover:underline whitespace-nowrap disabled:opacity-50">
            Remove main photo
          </button>
        )}
      </div>

      {current && (
        <div className="mb-4 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viaResizer(current, 400) || current} alt="Current main photo" className="h-20 w-32 rounded object-cover ring-2 ring-amber-500" />
          <span className="text-sm text-gray-700">Current main photo</span>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading the hotel&apos;s photos…</p>
      ) : photos.length === 0 ? (
        <p className="text-sm text-gray-500">This hotel has no photos of its own. Paste a link below.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2 max-h-[420px] overflow-y-auto">
          {photos.map((url, i) => {
            const isCurrent = url === current;
            return (
              <button
                key={url}
                type="button"
                disabled={busy || isCurrent}
                onClick={() => choose(url)}
                title={isCurrent ? 'Current main photo' : 'Use as main photo'}
                className={`relative aspect-[4/3] overflow-hidden rounded bg-gray-100 ${isCurrent ? 'ring-2 ring-amber-500' : 'hover:ring-2 hover:ring-blue-500'} disabled:cursor-default`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={viaResizer(url, 400) || url} alt={`Photo ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
                {isCurrent && <span className="absolute left-1 top-1 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">MAIN</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <input
          type="url"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder="Or paste an image link (https://…)"
          className="flex-1 px-3 py-2 border rounded-lg text-sm"
        />
        <button
          type="button"
          disabled={busy || !/^https?:\/\//i.test(pasted.trim())}
          onClick={() => choose(pasted.trim())}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          Use this photo
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">Could not save: {error}</p>}
    </div>
  );
}

'use client';

/**
 * Pick a hotel's main photo — the first photo on the public hotel page, its
 * search card and its collection cards — and hide the photos that should not
 * show at all.
 *
 * Shows the hotel's own photos (the same gallery the hotel page uses); clicking
 * one makes it the main photo. A photo from elsewhere can be pasted as a link or
 * uploaded. The eye button hides a photo everywhere; hidden photos stay here,
 * greyed out, so they can be shown again.
 *
 * All of it is saved in the editorial overlay (keyed by hotel_id), so a supplier
 * re-sync never undoes it: a hidden photo that comes back in a sync stays hidden.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Upload } from 'lucide-react';
import { viaResizer } from '@/lib/imageUrl';

const HOTEL_API_URL = process.env.NEXT_PUBLIC_HOTEL_API_URL || 'https://hotel-api-91901273027.australia-southeast1.run.app';
const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const UPLOAD_MAX_MB = 10;

function toUrl(img: unknown): string | null {
  const v = typeof img === 'string' ? img : (img && typeof img === 'object'
    ? ((img as Record<string, unknown>).url || (img as Record<string, unknown>).image_url) : null);
  return typeof v === 'string' && v ? v.replace('{size}', '1024x768') : null;
}

/** Same matching as hotel-api lib/hiddenImages.js: one photo at any size. */
function imageKey(url: string): string {
  return url.trim()
    .replace(/[?#].*$/, '')
    .replace(/^https?:\/\//i, '')
    .toLowerCase()
    .replace(/\/t\/[^/]+\//, '/t/{size}/');
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
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadHidden = useCallback(async () => {
    const r = await fetch(`${HOTEL_API_URL}/api/editorial/hotels/${hotelId}/hidden-images`);
    const d = r.ok ? await r.json().catch(() => null) : null;
    setHidden(new Set((d?.data || []).map((h: { image_key: string }) => h.image_key)));
  }, [hotelId]);

  useEffect(() => {
    let off = false;
    setLoading(true);
    // show_hidden=1: the hotel page leaves hidden photos out; here we need them
    // so they can be shown again.
    Promise.all([
      fetch(`${HOTEL_API_URL}/api/hotels/${hotelId}?show_hidden=1`).then((r) => (r.ok ? r.json() : null)),
      loadHidden().catch(() => {}),
    ])
      .then(([d]) => {
        if (off) return;
        const h = d?.hotel || d || {};
        const urls = (Array.isArray(h.images) ? h.images : []).map(toUrl).filter(Boolean) as string[];
        setPhotos([...new Set(urls)]);
      })
      .catch(() => { if (!off) setPhotos([]); })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [hotelId, loadHidden]);

  async function saveMain(url: string) {
    const r = await fetch(`${HOTEL_API_URL}/api/editorial/hotels/${hotelId}/featured-photo`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ media_url: url, updated_by: 'console' }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.success === false) throw new Error(d.error || `HTTP ${r.status}`);
  }

  async function choose(url: string) {
    setBusy(true); setError(null);
    try {
      await saveMain(url);
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

  async function toggleHidden(url: string) {
    const isHidden = hidden.has(imageKey(url));
    setBusy(true); setError(null);
    try {
      const r = isHidden
        ? await fetch(`${HOTEL_API_URL}/api/editorial/hotels/${hotelId}/hidden-images?media_url=${encodeURIComponent(url)}`, { method: 'DELETE' })
        : await fetch(`${HOTEL_API_URL}/api/editorial/hotels/${hotelId}/hidden-images`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ media_url: url, updated_by: 'console' }),
          });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.success === false) throw new Error(d.error || `HTTP ${r.status}`);
      // Hiding the photo the cards lead with (the main photo, or the first
      // visible one when none is set): put the next visible photo there instead,
      // so the thumbnail never shows the hidden one.
      if (!isHidden) {
        const visible = photos.filter((p) => !hidden.has(imageKey(p)));
        const leading = current || visible[0];
        if (leading && imageKey(leading) === imageKey(url)) {
          const next = visible.find((p) => imageKey(p) !== imageKey(url));
          if (next) await saveMain(next);
        }
      }
      await loadHidden();
      onChanged();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function upload(file: File) {
    setError(null);
    if (!UPLOAD_TYPES.includes(file.type)) { setError('Use a JPEG, PNG or WebP photo'); return; }
    if (file.size > UPLOAD_MAX_MB * 1024 * 1024) { setError(`Photo is over ${UPLOAD_MAX_MB} MB`); return; }
    setBusy(true);
    try {
      const r = await fetch(`${HOTEL_API_URL}/api/editorial/hotels/${hotelId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.data?.url) throw new Error(d.error || `HTTP ${r.status}`);
      await saveMain(d.data.url);
      onChanged();
    } catch (e) { setError((e as Error).message); }
    finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  const hiddenCount = photos.filter((p) => hidden.has(imageKey(p))).length;

  return (
    <div className="mb-8 rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="font-semibold">Main photo</h3>
          <p className="text-sm text-gray-600">
            Shown first on the hotel page, search results and collection pages. Click a photo to use it.
            The eye hides a photo everywhere; click it again to show it.
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
        <p className="text-sm text-gray-500">This hotel has no photos of its own. Upload one or paste a link below.</p>
      ) : (
        <>
          {hiddenCount > 0 && (
            <p className="mb-2 text-xs text-gray-500">{hiddenCount} of {photos.length} photos hidden.</p>
          )}
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2 max-h-[420px] overflow-y-auto">
            {photos.map((url, i) => {
              const isCurrent = url === current;
              const isHidden = hidden.has(imageKey(url));
              return (
                <div key={url} className="relative">
                  <button
                    type="button"
                    disabled={busy || isCurrent || isHidden}
                    onClick={() => choose(url)}
                    title={isHidden ? 'Hidden — show it first to use it' : isCurrent ? 'Current main photo' : 'Use as main photo'}
                    className={`relative block w-full aspect-[4/3] overflow-hidden rounded bg-gray-100 ${isCurrent ? 'ring-2 ring-amber-500' : isHidden ? '' : 'hover:ring-2 hover:ring-blue-500'} disabled:cursor-default`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={viaResizer(url, 400) || url} alt={`Photo ${i + 1}`} loading="lazy" className={`h-full w-full object-cover ${isHidden ? 'opacity-30 grayscale' : ''}`} />
                    {isCurrent && <span className="absolute left-1 top-1 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">MAIN</span>}
                    {isHidden && <span className="absolute left-1 top-1 rounded bg-gray-700 px-1.5 py-0.5 text-[10px] font-semibold text-white">HIDDEN</span>}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => toggleHidden(url)}
                    title={isHidden ? 'Show this photo again' : 'Hide this photo everywhere'}
                    aria-label={isHidden ? 'Show photo' : 'Hide photo'}
                    className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-gray-700 shadow hover:bg-white disabled:opacity-50"
                  >
                    {isHidden ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          ref={fileInput}
          type="file"
          accept={UPLOAD_TYPES.join(',')}
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
          className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <Upload size={14} /> Upload a photo
        </button>
        <input
          type="url"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder="Or paste an image link (https://…)"
          className="flex-1 min-w-[200px] px-3 py-2 border rounded-lg text-sm"
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
      {busy && <p className="mt-2 text-sm text-gray-500">Saving…</p>}
      {error && <p className="mt-2 text-sm text-red-600">Could not save: {error}</p>}
    </div>
  );
}

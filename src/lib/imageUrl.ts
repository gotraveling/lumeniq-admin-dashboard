/**
 * Serve supplier photos through our own derivative service instead of hitting
 * the supplier CDN directly.
 *
 *   https://images.firstclass.com.au/img/{width}/{base64url(sourceUrl)}.webp
 *
 * Same service firstclass-next uses (hotels/image-resizer): it fetches the
 * original once, converts to webp at a fixed width, caches it in GCS and serves
 * it through Cloud CDN.
 *
 * Why the console needs it as much as the public site: a RateHawk room photo is
 * an untouched original. Measured on Amane Resort Seikai, one photo is 215KB
 * against 10.7KB for the same photo at thumbnail width and 26KB at gallery
 * width — 8 photos a room across 35 room groups is tens of megabytes of
 * originals for a panel that shows them at 280px. It isn't only slow: under
 * that many parallel requests cdn.worldota.net starts dropping connections, and
 * a dropped <img> collapses to zero height, which is exactly why a room
 * labelled "4 photos" would render three.
 *
 * Falls through untouched for hosts the resizer can't fetch, so a new supplier
 * degrades to today's behaviour rather than breaking. Keep this list in step
 * with the resizer's own allowlist — and verify a host end to end before adding
 * it, because next/image remotePatterns say what may be RENDERED, not what the
 * resizer may FETCH.
 */
const RESIZABLE_HOSTS = new Set([
  'cdn.worldota.net',
  'image.hummingbird.travel',
  'storage.googleapis.com',
  'images.unsplash.com',
]);

/** Must match ALLOWED_WIDTHS in the resizer — it 400s on anything else. */
const WIDTH_RUNGS = [400, 800, 1600];

/**
 * Defaults to the live service. Verified before switching on: /healthz answers
 * 200 over https and the three width rungs return real image/webp bodies for a
 * cdn.worldota.net source. Set NEXT_PUBLIC_IMAGE_RESIZER_URL to '' to turn it
 * off everywhere, or point it elsewhere.
 *
 * Every consumer must still keep its own per-image fallback to the original
 * URL, so a resizer outage shows the heavy photo rather than a blank box.
 */
const RESIZER_BASE = process.env.NEXT_PUBLIC_IMAGE_RESIZER_URL
  ?? 'https://images.firstclass.com.au';

/** URL-safe base64, no padding — matches the resizer's decoder. */
function encodeSource(url: string): string {
  return (typeof btoa === 'function'
    ? btoa(new TextEncoder().encode(url).reduce((s, b) => s + String.fromCharCode(b), ''))
    : Buffer.from(url, 'utf8').toString('base64')
  ).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Smallest rung that still covers the requested display width. */
function rungFor(width: number): number {
  return WIDTH_RUNGS.find((w) => w >= width) ?? WIDTH_RUNGS[WIDTH_RUNGS.length - 1];
}

/**
 * A resizer URL for `src` at roughly `width` CSS pixels, or `src` unchanged when
 * the resizer is off or can't serve that host. Returns undefined for a missing
 * source so callers can branch on it.
 */
export function viaResizer(src: string | null | undefined, width: number): string | undefined {
  if (!src) return undefined;
  if (!RESIZER_BASE || !src.startsWith('http')) return src;
  let host: string;
  try { host = new URL(src).hostname; } catch { return src; }
  if (!RESIZABLE_HOSTS.has(host)) return src;
  return `${RESIZER_BASE}/img/${rungFor(width)}/${encodeSource(src)}.webp`;
}

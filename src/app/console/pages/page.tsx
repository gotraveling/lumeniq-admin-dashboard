'use client';

/**
 * /console/pages — the list of composable pages.
 *
 * v1 ships ONE page (the luxury-hotels homepage) and ONE block type (a
 * collection row). Before this existed, a collection appeared on the homepage
 * only if someone hand-wrote a `homepage_position` in a SQL migration — nothing
 * in the console could show or change it.
 *
 * Editing happens at /console/pages/[slug], a real route rather than swapped-in
 * state, so it deep-links and the back button behaves.
 */
import Link from 'next/link';
import { LayoutList } from 'lucide-react';

// The pages v1 manages. Adding one means adding a row here + in the `pages` table.
const PAGES = [
  {
    slug: 'luxury-hotels-home',
    title: 'Luxury hotels homepage',
    description: 'The rows on firstclass.com.au/luxury-hotels, top to bottom.',
    viewHref: 'https://firstclass.com.au/luxury-hotels',
  },
];

export default function PagesPage() {
  return (
    <div>
      <div className="c-page-head">
        <div>
          <h1 className="c-page-title"><LayoutList size={18} style={{ verticalAlign: '-3px' }} /> Pages</h1>
          <p className="c-page-sub">
            Compose a page from collections — choose which rows appear, in what order, and how each one is framed.
          </p>
        </div>
      </div>

      <table className="c-table">
        <thead><tr><th>Page</th><th>Slug</th><th></th></tr></thead>
        <tbody>
          {PAGES.map((p) => (
            <tr key={p.slug}>
              <td>
                <Link href={`/console/pages/${p.slug}`} style={{ fontWeight: 600 }}>{p.title}</Link>
                <div style={{ fontSize: 12, color: 'var(--c-fg-muted)' }}>{p.description}</div>
              </td>
              <td className="c-mono">{p.slug}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <Link className="c-btn" href={`/console/pages/${p.slug}`}>Edit</Link>{' '}
                <a className="c-btn" href={p.viewHref} target="_blank" rel="noreferrer">View</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

'use client';

/**
 * /console/pages/[slug] — edit one page's blocks.
 *
 * The editor lives at its own URL rather than being swapped in as state on the
 * list page, so it deep-links, survives a refresh, and the browser back button
 * returns to the list instead of leaving the console.
 */
import { use } from 'react';
import PageEditor from '../PageEditor';

export default function PageEditRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return <PageEditor slug={slug} />;
}

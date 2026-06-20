/**
 * /console/editorial — per-hotel editorial overlay editor (overrides, curated
 * media, expert reviews, tags) surfaced inside the new console shell.
 *
 * Reuses the existing editor component from the legacy /admin/hotels/editorial
 * route verbatim — same hotel-api /api/editorial/* endpoints, no duplication —
 * so consultants have a single console for both Collections and Editorial.
 */
import EditorialEditor from '../../admin/hotels/editorial/page';

export default function ConsoleEditorialPage() {
  return <EditorialEditor />;
}

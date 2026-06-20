/** /console/search-activity — live customer-search log inside the console shell.
 *  Reuses the legacy /admin page component (GET /api/search/events). */
import SearchActivityPage from '../../admin/search-activity/page';

export default function ConsoleSearchActivityPage() {
  return <SearchActivityPage />;
}

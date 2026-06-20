/** /console/hotels/visibility — hotel visibility editor inside the console shell.
 *  Reuses the legacy /admin page component (same hotel-api /api/visibility/* endpoints). */
import VisibilityEditor from '../../../admin/hotels/visibility/page';

export default function ConsoleVisibilityPage() {
  return <VisibilityEditor />;
}

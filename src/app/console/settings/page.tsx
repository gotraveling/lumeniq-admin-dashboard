/** /console/settings — tenant settings inside the console shell.
 *  Reuses the legacy /admin/tenant-settings component.
 *  NOTE: that page is currently a UI-only stub (no backend persistence yet). */
import TenantSettings from '../../admin/tenant-settings/page';

export default function ConsoleSettingsPage() {
  return <TenantSettings />;
}

import { Card } from '../../shared/ui';
import { QuickAddForm } from './QuickAddForm';

/** Body for the app-wide Quick-Add FAB (registered into the shell's `quick-add` slot from
 *  nav.manifest). Any mounted JournalPage refreshes via the ACTIVITY_CREATED_EVENT. */
export default function QuickAddPanel() {
  return (
    <Card flush className="p-1">
      <h2 className="mb-3 text-lg font-semibold text-ink-900">Log an activity</h2>
      <QuickAddForm />
    </Card>
  );
}

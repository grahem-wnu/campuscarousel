import { Button, Icon } from '../../shared/ui';
import { buildMonthGrid, groupByDate } from './logic';
import type { Activity } from './types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface CalendarViewProps {
  activities: Activity[];
  year: number;
  month: number; // 0-based
  onPrev: () => void;
  onNext: () => void;
}

/** Monthly grid with a dot + count on days that have activities. */
export function CalendarView({ activities, year, month, onPrev, onNext }: CalendarViewProps) {
  const cells = buildMonthGrid(year, month);
  const byDate = groupByDate(activities);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onPrev} aria-label="Previous month">
          <Icon name="chevron-right" className="rotate-180" />
        </Button>
        <h3 className="text-base font-semibold text-ink-900">
          {MONTH_NAMES[month]} {year}
        </h3>
        <Button variant="ghost" size="sm" onClick={onNext} aria-label="Next month">
          <Icon name="chevron-right" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-ink-100 bg-ink-100">
        {WEEKDAYS.map((d) => (
          <div key={d} className="bg-ink-50 py-1.5 text-center text-xs font-medium text-ink-500">
            {d}
          </div>
        ))}
        {cells.map((cell) => {
          const entries = byDate[cell.iso] ?? [];
          const day = Number(cell.iso.slice(8, 10));
          return (
            <div
              key={cell.iso}
              className={`min-h-[64px] bg-white p-1.5 ${cell.inMonth ? '' : 'bg-ink-50/60 text-ink-300'}`}
            >
              <div className="text-right text-xs font-medium text-ink-500">{day}</div>
              {entries.length > 0 ? (
                <div className="mt-1 flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-primary-500" />
                  <span className="text-xs text-ink-600">{entries.length}</span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

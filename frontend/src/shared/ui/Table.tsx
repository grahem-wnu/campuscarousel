import { Fragment, type ReactNode } from "react";
import { cn } from "./cn";

export interface Column<T> {
  /** Stable key for the column. */
  key: string;
  header: ReactNode;
  /** Cell renderer for a row. */
  render: (row: T) => ReactNode;
  /** Right-align numeric columns, etc. */
  align?: "left" | "center" | "right";
  className?: string;
}

export interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  /** Stable key per row. */
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Optional accordion: when `isExpanded(row)` is true, a full-width detail row is rendered beneath
   *  it with `renderExpanded(row)`. Both must be provided for expansion to show. */
  isExpanded?: (row: T) => boolean;
  renderExpanded?: (row: T) => ReactNode;
  /** Shown when there are no rows (compose <EmptyState> for richer states). */
  empty?: ReactNode;
  className?: string;
}

const ALIGN = { left: "text-left", center: "text-center", right: "text-right" } as const;

/** Generic data table for the tabular/comparison density (e.g. college comparison). */
export function Table<T>({ columns, rows, rowKey, onRowClick, isExpanded, renderExpanded, empty, className }: TableProps<T>) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-surface-border text-left">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-3 py-2 font-semibold text-ink-600",
                  col.align && ALIGN[col.align],
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-ink-500">
                {empty ?? "Nothing here yet."}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const expanded = isExpanded?.(row) ?? false;
              return (
                <Fragment key={rowKey(row)}>
                  <tr
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      "border-b border-surface-border/70 last:border-0",
                      onRowClick && "cursor-pointer hover:bg-ink-50",
                      expanded && "bg-ink-50",
                    )}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn("px-3 py-2.5 text-ink-800", col.align && ALIGN[col.align], col.className)}
                      >
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                  {expanded && renderExpanded ? (
                    <tr className="border-b border-surface-border/70 last:border-0">
                      <td colSpan={columns.length} className="bg-surface-sunken px-3 py-3">
                        {renderExpanded(row)}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

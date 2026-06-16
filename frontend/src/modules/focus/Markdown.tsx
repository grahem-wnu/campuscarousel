// A small markdown renderer for the focus overview / career path. Handles the subset the prompts emit:
// `##`/`###` headings, `-`/`*` bullets, `**bold**`, pipe tables (the year-by-year timeline), and
// blank-line paragraphs. Anything fancier renders as text. Not a general-purpose parser.

import { Fragment, type ReactNode } from "react";

/** Render inline `**bold**` spans within a line; everything else is plain text. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const m = part.match(/^\*\*([^*]+)\*\*$/);
    return m ? <strong key={i} className="font-semibold text-ink-900">{m[1]}</strong> : <Fragment key={i}>{part}</Fragment>;
  });
}

/** A separator row in a markdown table (e.g. `|---|:--:|`). */
const isSeparator = (line: string): boolean => /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-");

/** Split a table row into trimmed cells (outer pipes stripped). */
const cells = (line: string): string[] => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

function Table({ lines }: { lines: string[] }) {
  const sepIdx = lines.findIndex(isSeparator);
  const header = sepIdx > 0 ? cells(lines[sepIdx - 1]!) : null;
  const bodyLines = lines.filter((l, i) => !isSeparator(l) && (header ? i !== sepIdx - 1 : true));
  const body = bodyLines.map(cells);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        {header ? (
          <thead>
            <tr>
              {header.map((c, ci) => (
                <th key={ci} className="border-b border-surface-border px-2 py-1.5 text-left font-semibold text-ink-700">{inline(c)}</th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className="align-top">
              {row.map((c, ci) => (
                <td key={ci} className="border-b border-surface-border px-2 py-1.5 text-ink-700">{inline(c)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Markdown({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="space-y-3 break-words text-sm leading-relaxed text-ink-700">
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.length > 0);

        const heading = (lines[0] ?? "").match(/^(#{2,3})\s+(.*)$/);
        if (heading) {
          const rest = lines.slice(1).join(" ").trim();
          return (
            <div key={bi}>
              <h3 className="text-sm font-semibold text-ink-900">{inline(heading[2] ?? "")}</h3>
              {rest ? <p className="mt-1">{inline(rest)}</p> : null}
            </div>
          );
        }

        // Pipe table: 2+ lines that mostly contain a pipe (e.g. the year-by-year timeline).
        if (lines.length >= 2 && lines.filter((l) => l.includes("|")).length >= 2) {
          return <Table key={bi} lines={lines} />;
        }

        const isList = lines.every((l) => /^\s*[-*]\s+/.test(l));
        if (isList && lines.length > 0) {
          return (
            <ul key={bi} className="list-disc space-y-1 pl-5">
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*[-*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }

        return <p key={bi}>{inline(block.replace(/\n/g, " "))}</p>;
      })}
    </div>
  );
}

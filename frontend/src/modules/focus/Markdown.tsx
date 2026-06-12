// A deliberately tiny markdown renderer for the focus overview — the app keeps dependencies light, and
// the overview prompt only emits a known subset: `##`/`###` headings, `-`/`*` bullets, blank-line
// paragraphs, and `**bold**`. Anything fancier just renders as text. Not a general-purpose parser.

import { Fragment, type ReactNode } from "react";

/** Render inline `**bold**` spans within a line; everything else is plain text. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const m = part.match(/^\*\*([^*]+)\*\*$/);
    return m ? <strong key={i} className="font-semibold text-ink-900">{m[1]}</strong> : <Fragment key={i}>{part}</Fragment>;
  });
}

export function Markdown({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="space-y-3 text-sm leading-relaxed text-ink-700">
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
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
        const isList = lines.every((l) => /^\s*[-*]\s+/.test(l) || l.trim() === "");
        if (isList && lines.some((l) => /^\s*[-*]\s+/.test(l))) {
          return (
            <ul key={bi} className="list-disc space-y-1 pl-5">
              {lines.filter((l) => l.trim()).map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*[-*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return <p key={bi}>{inline(block)}</p>;
      })}
    </div>
  );
}

// Minimal, dependency-free PDF writer for the experience-hours export. A experience-hours summary is
// plain formatted text, so a full PDF library (and its embedded fonts) would not earn its weight
// (CLAUDE.md: lightweight by default). This emits a valid multi-page PDF 1.4 document using the
// built-in Helvetica font — text-only, one line per Tj, with a real cross-reference table so any
// conformant reader opens it.
//
// The router contract is JSON-in/JSON-out, so the handler base64-encodes these bytes into the
// response envelope; the frontend decodes to a Blob and downloads it.

import type { ExperienceEntry } from '../../shared/data/index.js';
import { summarize } from './summary.js';
import { buildDirectory } from './supervisors.js';

/** A single rendered text line: its string and point size. */
interface Line {
  text: string;
  size: number;
}

const PAGE_WIDTH = 612; // US Letter, 72dpi
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const TOP = PAGE_HEIGHT - MARGIN;
const BOTTOM = MARGIN;
const LINE_RATIO = 1.4; // line height = size * ratio

/** Escape a string for a PDF literal `(...)` and drop non-ASCII (Helvetica/WinAnsi safe). */
function escapeText(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    const c = code >= 32 && code <= 126 ? ch : '?';
    if (c === '\\' || c === '(' || c === ')') out += `\\${c}`;
    else out += c;
  }
  return out;
}

/** Group lines into pages by accumulating their heights against the printable area. */
function paginate(lines: readonly Line[]): Line[][] {
  const pages: Line[][] = [];
  let current: Line[] = [];
  let y = TOP;
  for (const line of lines) {
    const h = line.size * LINE_RATIO;
    if (y - h < BOTTOM && current.length > 0) {
      pages.push(current);
      current = [];
      y = TOP;
    }
    current.push(line);
    y -= h;
  }
  if (current.length > 0) pages.push(current);
  return pages.length > 0 ? pages : [[]];
}

/** Build the content stream for one page: each line placed absolutely top-down. */
function contentStream(lines: readonly Line[]): string {
  let y = TOP;
  let body = '';
  for (const line of lines) {
    const h = line.size * LINE_RATIO;
    body += `BT /F1 ${line.size} Tf ${MARGIN} ${Math.round(y - line.size)} Td (${escapeText(line.text)}) Tj ET\n`;
    y -= h;
  }
  return body;
}

/** Assemble a complete PDF document from a flat list of sized lines. */
export function renderTextPdf(lines: readonly Line[]): Uint8Array {
  const pages = paginate(lines);

  // Object numbering: 1 Catalog, 2 Pages, 3 Font, then (Page, Contents) pairs from 4.
  const pageObjNum = (i: number): number => 4 + i * 2;
  const contentObjNum = (i: number): number => 5 + i * 2;
  const kids = pages.map((_, i) => `${pageObjNum(i)} 0 R`).join(' ');

  const objects: string[] = [];
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  pages.forEach((pageLines, i) => {
    objects[pageObjNum(i)] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjNum(i)} 0 R >>`;
    const stream = contentStream(pageLines);
    const bytes = Buffer.byteLength(stream, 'latin1');
    objects[contentObjNum(i)] = `<< /Length ${bytes} >>\nstream\n${stream}endstream`;
  });

  // Serialize with byte-offset tracking for the xref table.
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let n = 1; n < objects.length; n++) {
    const obj = objects[n];
    if (obj === undefined) continue; // numbering is dense here, but be defensive
    offsets[n] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${n} 0 obj\n${obj}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  const count = objects.length; // includes the free object 0
  pdf += `xref\n0 ${count}\n`;
  pdf += '0000000000 65535 f \n';
  for (let n = 1; n < count; n++) {
    const off = offsets[n] ?? 0;
    pdf += `${off.toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Uint8Array(Buffer.from(pdf, 'latin1'));
}

export interface ExperiencePdfModel {
  studentName?: string;
  generatedAt: string; // ISO timestamp, passed in for determinism/testability
  entries: readonly ExperienceEntry[];
}

const fmtHours = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** Build the formatted line list for a experience-hours export, then render it to PDF bytes. */
export function renderExperiencePdf(model: ExperiencePdfModel): Uint8Array {
  const { studentName, generatedAt, entries } = model;
  const summary = summarize(entries);
  const directory = buildDirectory(entries);
  const lines: Line[] = [];

  lines.push({ text: 'Experience Hours Record', size: 18 });
  if (studentName) lines.push({ text: studentName, size: 12 });
  lines.push({ text: `Generated ${generatedAt.slice(0, 10)}`, size: 9 });
  lines.push({ text: '', size: 9 });

  lines.push({ text: 'Summary', size: 13 });
  lines.push({ text: `Total hours: ${fmtHours(summary.totalHours)}`, size: 10 });
  lines.push({ text: `Total entries: ${summary.totalEntries}`, size: 10 });
  lines.push({ text: `Patient-interaction hours: ${fmtHours(summary.patientInteractionHours)}`, size: 10 });
  lines.push({ text: `Observational hours: ${fmtHours(summary.observationalHours)}`, size: 10 });
  for (const [facility, hours] of Object.entries(summary.hoursByFacility)) {
    lines.push({ text: `  ${facility}: ${fmtHours(hours)} hrs`, size: 10 });
  }
  lines.push({ text: '', size: 9 });

  lines.push({ text: 'Entries', size: 13 });
  if (entries.length === 0) {
    lines.push({ text: 'No experience hours logged.', size: 10 });
  }
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const c of sorted) {
    const dept = c.department ? ` / ${c.department}` : '';
    lines.push({ text: `${c.date}  ${c.facility}${dept}  -  ${fmtHours(c.hours)} hrs`, size: 10 });
    const sup = [c.supervisorName, c.supervisorTitle].filter(Boolean).join(', ');
    if (sup) lines.push({ text: `    Supervisor: ${sup}`, size: 9 });
    if (c.patientInteraction) lines.push({ text: '    Patient interaction', size: 9 });
    if (c.duties && c.duties.length > 0) lines.push({ text: `    Duties: ${c.duties.join(', ')}`, size: 9 });
  }

  if (directory.length > 0) {
    lines.push({ text: '', size: 9 });
    lines.push({ text: 'Supervisors', size: 13 });
    for (const s of directory) {
      const meta = [s.title, s.contact].filter(Boolean).join(' - ');
      lines.push({ text: `${s.name}${meta ? ` (${meta})` : ''}  -  ${fmtHours(s.totalHours)} hrs`, size: 10 });
    }
  }

  return renderTextPdf(lines);
}

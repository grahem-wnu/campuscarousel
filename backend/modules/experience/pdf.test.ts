import { describe, expect, it } from 'vitest';
import type { ExperienceEntry } from '../../shared/data/index.js';
import { renderExperiencePdf, renderTextPdf } from './pdf.js';

const decode = (bytes: Uint8Array): string => Buffer.from(bytes).toString('latin1');

const entry = (over: Partial<ExperienceEntry> = {}): ExperienceEntry => ({
  entryId: 'x',
  date: '2026-01-15',
  facility: 'Memorial',
  hours: 4,
  visibility: 'family',
  createdAt: '2026-01-15T00:00:00.000Z',
  updatedAt: '2026-01-15T00:00:00.000Z',
  ...over,
});

describe('renderTextPdf', () => {
  it('emits a structurally valid single-page PDF', () => {
    const pdf = decode(renderTextPdf([{ text: 'Hello', size: 12 }]));
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('/Type /Catalog');
    expect(pdf).toContain('/Type /Pages /Kids [4 0 R] /Count 1');
    expect(pdf).toContain('/BaseFont /Helvetica');
    expect(pdf).toContain('xref');
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('escapes PDF-special characters in text', () => {
    const pdf = decode(renderTextPdf([{ text: 'a(b)c\\d', size: 10 }]));
    expect(pdf).toContain('(a\\(b\\)c\\\\d)');
  });

  it('paginates when content overflows one page (Count > 1)', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ text: `line ${i}`, size: 12 }));
    const pdf = decode(renderTextPdf(many));
    const m = pdf.match(/\/Count (\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(1);
  });
});

describe('renderExperiencePdf', () => {
  it('includes the header, totals, and entry rows', () => {
    const pdf = decode(
      renderExperiencePdf({
        studentName: 'Keira',
        generatedAt: '2026-06-06T12:00:00.000Z',
        entries: [entry({ facility: 'Memorial', hours: 4, supervisorName: 'Dr. A' })],
      }),
    );
    expect(pdf).toContain('Experience Hours Record');
    expect(pdf).toContain('Keira');
    expect(pdf).toContain('Generated 2026-06-06');
    expect(pdf).toContain('Total hours: 4');
    expect(pdf).toContain('Memorial');
    expect(pdf).toContain('Dr. A');
  });

  it('handles an empty entry set without throwing', () => {
    const pdf = decode(renderExperiencePdf({ generatedAt: '2026-06-06T00:00:00.000Z', entries: [] }));
    expect(pdf).toContain('No experience hours logged.');
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
  });
});

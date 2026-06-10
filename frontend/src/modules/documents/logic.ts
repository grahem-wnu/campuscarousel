// Pure helpers for the document vault — labels, size formatting, client-side file validation.

import type { DocumentCategory } from './types';

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024; // 25 MB (matches the backend)

export const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  certificate: 'Certificate',
  essay: 'Essay',
  'application-doc': 'Application doc',
  recommendation: 'Recommendation',
  transcript: 'Transcript',
  'financial-aid': 'Financial aid',
  'visit-photo': 'Visit photo',
  other: 'Other',
};

export function categoryLabel(c: DocumentCategory): string {
  return CATEGORY_LABELS[c] ?? c;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Returns an error message if the file is unacceptable, or null if it's fine. */
export function validateFile(file: { size: number; type: string }): string | null {
  if (file.size > MAX_DOCUMENT_BYTES) return 'File is larger than 25 MB.';
  if (!ALLOWED_CONTENT_TYPES.includes(file.type)) return 'Unsupported file type (PDF, image, text, or Word doc).';
  return null;
}

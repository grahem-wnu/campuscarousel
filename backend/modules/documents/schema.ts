// Input validation for the documents module (v2.1 F2). `.strict()` rejects unknown fields (→ 422).
// Size + content-type are enforced server-side before a presigned upload URL is ever minted.

import { z } from '../../shared/api/index.js';

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024; // 25 MB

/** Content types the family can upload — PDFs, common images, plain text, Word docs. */
export const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

const category = z.enum([
  'certificate',
  'essay',
  'application-doc',
  'recommendation',
  'transcript',
  'financial-aid',
  'visit-photo',
  'other',
]);

const linkedEntity = z
  .object({
    type: z.enum(['certification', 'essay', 'application', 'contact', 'college', 'scholarship']),
    id: z.string().min(1).max(200),
  })
  .strict();

const contentType = z.enum(ALLOWED_CONTENT_TYPES);
const sizeBytes = z.number().int().positive().max(MAX_DOCUMENT_BYTES);

export const uploadUrlSchema = z
  .object({
    fileName: z.string().min(1).max(255),
    contentType,
    sizeBytes,
  })
  .strict();

export const createSchema = z
  .object({
    s3Key: z.string().min(1).max(1024),
    fileName: z.string().min(1).max(255),
    contentType,
    sizeBytes,
    category,
    linkedEntity: linkedEntity.optional(),
    visibility: z.enum(['family', 'private']).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict();

export const updateSchema = z
  .object({
    category: category.optional(),
    linkedEntity: linkedEntity.optional(),
    visibility: z.enum(['family', 'private']).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict();

export const listQuerySchema = z
  .object({
    category: category.optional(),
    linkedType: z.enum(['certification', 'essay', 'application', 'contact', 'college', 'scholarship']).optional(),
    linkedId: z.string().max(200).optional(),
  })
  .strict();

export const idParamSchema = z.object({ id: z.string().min(1) }).strict();

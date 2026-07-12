import { api } from '../../shared/api';
import type { DocumentCategory, DocumentDetail, DocumentMeta, Visibility } from './types';

export async function listDocuments(filters?: { category?: DocumentCategory }): Promise<DocumentMeta[]> {
  const res = await api.get<{ documents: DocumentMeta[] }>('/documents', {
    query: { category: filters?.category },
  });
  return res.documents;
}

/** Fetch metadata + a short-lived download URL. */
export function getDocument(id: string): Promise<DocumentDetail> {
  return api.get<DocumentDetail>(`/documents/${encodeURIComponent(id)}`);
}

export function deleteDocument(id: string): Promise<void> {
  return api.del<void>(`/documents/${encodeURIComponent(id)}`);
}

interface UploadUrlResponse {
  uploadUrl: string;
  s3Key: string;
}

/**
 * Two-step presigned upload: ask the API for a PUT url, send the bytes straight to S3 (NOT through
 * the API), then record the metadata. The bytes never touch the Lambda.
 */
export async function uploadDocument(opts: {
  file: File;
  category: DocumentCategory;
  visibility: Visibility;
  notes?: string;
}): Promise<DocumentMeta> {
  const { file } = opts;
  const presign = await api.post<UploadUrlResponse>('/documents/upload-url', {
    fileName: file.name,
    contentType: file.type,
    sizeBytes: file.size,
  });

  const put = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!put.ok) throw new Error(`Upload to storage failed (${put.status}).`);

  return api.post<DocumentMeta>('/documents', {
    s3Key: presign.s3Key,
    fileName: file.name,
    contentType: file.type,
    sizeBytes: file.size,
    category: opts.category,
    visibility: opts.visibility,
    notes: opts.notes || undefined,
  });
}

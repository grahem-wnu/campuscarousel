// Document vault types (v2.1 F2) — mirrors the backend Document shape.

export type DocumentCategory =
  | 'certificate'
  | 'essay'
  | 'application-doc'
  | 'recommendation'
  | 'transcript'
  | 'financial-aid'
  | 'visit-photo'
  | 'other';

export type Visibility = 'family' | 'private';

export interface DocumentLink {
  type: 'certification' | 'essay' | 'application' | 'contact' | 'college' | 'scholarship';
  id: string;
}

export interface DocumentMeta {
  documentId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  s3Key: string;
  category: DocumentCategory;
  linkedEntity?: DocumentLink;
  visibility: Visibility;
  uploadedBy: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentDetail extends DocumentMeta {
  downloadUrl: string;
}

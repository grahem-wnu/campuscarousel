// Document handlers (v2.1 F2): a two-step presigned-upload flow + CRUD over file metadata, with the
// same family/private visibility model as the journal. Bytes never pass through the Lambda — the
// client PUTs/GETs S3 directly via short-lived presigned URLs. Built from injectable deps (in-memory
// data + fake store in tests).

import {
  Errors,
  validateBody,
  validateParams,
  validateQuery,
  type Handler,
} from '../../shared/api/index.js';
import { assertCanRead, filterForRequester } from '../../shared/auth/index.js';
import type { Requester } from '../../shared/auth/index.js';
import type { Data } from '../../shared/data/index.js';
import { s3DocumentStoreFromEnv, type DocumentStore } from '../../shared/storage/index.js';
import { tenantDocKey } from './keys.js';
import { createSchema, idParamSchema, listQuerySchema, updateSchema, uploadUrlSchema } from './schema.js';

export interface DocumentHandlers {
  list: Handler;
  detail: Handler;
  uploadUrl: Handler;
  create: Handler;
  update: Handler;
  remove: Handler;
}

export interface DocumentDeps {
  getData: () => Data;
  /** Resolved lazily so importing the manifest never requires the bucket env. */
  getStore?: () => DocumentStore;
}


/** Only Keira (student) may mark a document private — mirrors the journal/clinical rule. */
function assertCanSetVisibility(visibility: string | undefined, requester: Requester): void {
  if (visibility === 'private' && requester.role !== 'student') {
    throw Errors.forbidden('Only Keira can mark a document private.');
  }
}

export function makeHandlers(deps: DocumentDeps): DocumentHandlers {
  const { getData } = deps;
  const getStore = deps.getStore ?? (() => s3DocumentStoreFromEnv());

  return {
    // GET /documents — the vault, visibility-filtered, optionally narrowed by category / linked entity.
    list: async (ctx) => {
      const q = validateQuery(listQuerySchema, ctx);
      const all = await getData().documents.list();
      let items = filterForRequester(all, ctx.requester);
      if (q.category) items = items.filter((d) => d.category === q.category);
      if (q.linkedType) {
        items = items.filter(
          (d) => d.linkedEntity?.type === q.linkedType && (!q.linkedId || d.linkedEntity?.id === q.linkedId),
        );
      }
      return { status: 200, body: { documents: items } };
    },

    // GET /documents/:id — metadata + a short-lived download URL (visibility-enforced).
    detail: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const doc = await getData().documents.get(id);
      if (!doc) throw Errors.notFound('Document not found');
      assertCanRead(doc, ctx.requester);
      const downloadUrl = await getStore().presignDownload(doc.s3Key, doc.fileName);
      return { status: 200, body: { ...doc, downloadUrl } };
    },

    // POST /documents/upload-url — validate, mint the server-owned key + a presigned PUT url.
    uploadUrl: async (ctx) => {
      const input = validateBody(uploadUrlSchema, ctx);
      const s3Key = tenantDocKey(input.fileName);
      const uploadUrl = await getStore().presignUpload(s3Key, input.contentType);
      return { status: 200, body: { uploadUrl, s3Key } };
    },

    // POST /documents — record metadata after the client has uploaded to S3.
    create: async (ctx) => {
      const input = validateBody(createSchema, ctx);
      assertCanSetVisibility(input.visibility, ctx.requester);
      const created = await getData().documents.create({
        ...input,
        visibility: input.visibility ?? 'family',
        uploadedBy: ctx.requester.username,
      });
      return { status: 201, body: created };
    },

    // PUT /documents/:id — update notes / category / link / visibility.
    update: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const patch = validateBody(updateSchema, ctx);
      const existing = await getData().documents.get(id);
      if (!existing) throw Errors.notFound('Document not found');
      assertCanRead(existing, ctx.requester); // can't edit what you can't see
      assertCanSetVisibility(patch.visibility, ctx.requester);
      const updated = await getData().documents.update(id, patch);
      return { status: 200, body: updated };
    },

    // DELETE /documents/:id — remove the S3 object then the metadata record.
    remove: async (ctx) => {
      const { id } = validateParams(idParamSchema, ctx);
      const existing = await getData().documents.get(id);
      if (!existing) throw Errors.notFound('Document not found');
      assertCanRead(existing, ctx.requester);
      await getStore().remove(existing.s3Key);
      await getData().documents.delete(id);
      return { status: 204, body: undefined };
    },
  };
}

/** Single source of truth for the route table (shared by the manifest + the router test).
 *  upload-url precedes :id so the static segment wins. */
export function buildRoutes(h: DocumentHandlers) {
  return [
    { method: 'GET' as const, path: '/documents', handler: h.list },
    { method: 'POST' as const, path: '/documents/upload-url', handler: h.uploadUrl },
    { method: 'POST' as const, path: '/documents', handler: h.create },
    { method: 'GET' as const, path: '/documents/:id', handler: h.detail },
    { method: 'PUT' as const, path: '/documents/:id', handler: h.update },
    { method: 'DELETE' as const, path: '/documents/:id', handler: h.remove },
  ];
}

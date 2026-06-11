import { beforeEach, describe, expect, it } from 'vitest';
import type { HandlerContext } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { InMemoryTableClient, makeData, type Data, type Document } from '../../shared/data/index.js';
import type { DocumentStore } from '../../shared/storage/index.js';
import { runWithTenant } from '../../shared/tenant/index.js';
import { makeHandlers, type DocumentHandlers } from './handlers.js';

const keira: Requester = { username: 'keira', role: 'student' };
const kate: Requester = { username: 'kate', role: 'parent' };

let data: Data;
let removed: string[];
let store: DocumentStore;
let h: DocumentHandlers;

beforeEach(() => {
  data = makeData(new InMemoryTableClient());
  removed = [];
  store = {
    presignUpload: async (key) => `https://put.example/${key}`,
    presignDownload: async (key, fileName) => `https://get.example/${key}?name=${encodeURIComponent(fileName)}`,
    remove: async (key) => void removed.push(key),
  };
  h = makeHandlers({ getData: () => data, getStore: () => store });
});

const ctx = (over: Partial<HandlerContext> = {}): HandlerContext => ({
  requester: keira,
  params: {},
  query: {},
  body: undefined,
  ...over,
});

async function seed(over: Partial<Document> = {}): Promise<Document> {
  return data.documents.create({
    fileName: 'cna.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1024,
    s3Key: 'documents/x/cna.pdf',
    category: 'certificate',
    visibility: 'family',
    uploadedBy: 'keira',
    ...over,
  } as Parameters<Data['documents']['create']>[0]);
}

describe('POST /documents/upload-url', () => {
  it('mints a server-owned, tenant-scoped key + presigned PUT url', async () => {
    // uploadUrl builds a tenant-prefixed S3 key, so it runs inside a tenant context (as the router does).
    const res = await runWithTenant('fam1', () =>
      h.uploadUrl(ctx({ body: { fileName: 'My Cert!.pdf', contentType: 'application/pdf', sizeBytes: 2048 } })),
    );
    expect(res.status).toBe(200);
    const body = res.body as { uploadUrl: string; s3Key: string };
    expect(body.s3Key).toMatch(/^T\/fam1\/documents\/.+\/My_Cert_\.pdf$/);
    expect(body.uploadUrl).toContain(body.s3Key);
  });
  it('422 on a disallowed content type', async () => {
    await expect(
      h.uploadUrl(ctx({ body: { fileName: 'x.zip', contentType: 'application/zip', sizeBytes: 10 } })),
    ).rejects.toMatchObject({ status: 422 });
  });
  it('422 on an oversize file', async () => {
    await expect(
      h.uploadUrl(ctx({ body: { fileName: 'big.pdf', contentType: 'application/pdf', sizeBytes: 26 * 1024 * 1024 } })),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe('POST /documents', () => {
  const base = { s3Key: 'documents/x/a.pdf', fileName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 100, category: 'certificate' as const };
  it('defaults visibility to family and stamps uploadedBy', async () => {
    const res = await h.create(ctx({ requester: kate, body: base }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ visibility: 'family', uploadedBy: 'kate' });
  });
  it('forbids a parent from marking a document private', async () => {
    await expect(
      h.create(ctx({ requester: kate, body: { ...base, visibility: 'private' } })),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('lets Keira mark a document private', async () => {
    const res = await h.create(ctx({ requester: keira, body: { ...base, visibility: 'private' } }));
    expect(res.body).toMatchObject({ visibility: 'private' });
  });
});

describe('GET /documents — visibility + filters', () => {
  beforeEach(async () => {
    await seed({ category: 'certificate', visibility: 'family' });
    await seed({ category: 'essay', visibility: 'private', fileName: 'draft.pdf' });
    await seed({ category: 'recommendation', visibility: 'family', linkedEntity: { type: 'contact', id: 'c1' } });
  });
  it('Keira sees all; a parent never sees private', async () => {
    expect((((await h.list(ctx({ requester: keira }))).body) as { documents: unknown[] }).documents).toHaveLength(3);
    const momDocs = (((await h.list(ctx({ requester: kate }))).body) as { documents: Document[] }).documents;
    expect(momDocs).toHaveLength(2);
    expect(momDocs.every((d) => d.visibility === 'family')).toBe(true);
  });
  it('filters by category and by linked entity', async () => {
    const byCat = (((await h.list(ctx({ query: { category: 'certificate' } }))).body) as { documents: unknown[] }).documents;
    expect(byCat).toHaveLength(1);
    const byLink = (((await h.list(ctx({ query: { linkedType: 'contact', linkedId: 'c1' } }))).body) as { documents: unknown[] }).documents;
    expect(byLink).toHaveLength(1);
  });
});

describe('GET /documents/:id', () => {
  it('returns a presigned download url', async () => {
    const doc = await seed();
    const res = await h.detail(ctx({ params: { id: doc.documentId } }));
    expect(res.status).toBe(200);
    expect((res.body as { downloadUrl: string }).downloadUrl).toContain(doc.s3Key);
  });
  it('403s a parent on a private document', async () => {
    const doc = await seed({ visibility: 'private' });
    await expect(h.detail(ctx({ requester: kate, params: { id: doc.documentId } }))).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe('DELETE /documents/:id', () => {
  it('removes the S3 object and the metadata record', async () => {
    const doc = await seed();
    const res = await h.remove(ctx({ params: { id: doc.documentId } }));
    expect(res.status).toBe(204);
    expect(removed).toContain(doc.s3Key);
    expect(await data.documents.get(doc.documentId)).toBeNull();
  });
});

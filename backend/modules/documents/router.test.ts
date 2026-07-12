// Integration through the real shared router: JWT identity + routing (static /documents/upload-url
// must beat /documents/:id) + zod + envelope, as in the Lambda, without AWS. S3 is a fake store.

import { describe, expect, it } from 'vitest';
import { createRouter, type ApiEvent } from '../../shared/api/index.js';
import type { Requester } from '../../shared/auth/index.js';
import { InMemoryTableClient, makeData, type Data } from '../../shared/data/index.js';
import type { DocumentStore } from '../../shared/storage/index.js';
import { buildRoutes, makeHandlers } from './handlers.js';

const claimsFor = (r: Requester) => ({ 'cognito:username': r.username, 'custom:role': r.role, 'custom:tenantId': r.tenantId ?? 'test-tenant' });
function event(method: string, path: string, opts: { as?: Requester; body?: unknown } = {}): ApiEvent {
  return {
    rawPath: path,
    queryStringParameters: undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    requestContext: {
      http: { method, path },
      authorizer: opts.as ? { jwt: { claims: claimsFor(opts.as) } } : undefined,
    },
  };
}
const keira: Requester = { username: 'keira', role: 'student' };
const parse = (res: { body: string }) => JSON.parse(res.body) as Record<string, unknown>;

function harness() {
  const data: Data = makeData(new InMemoryTableClient());
  const store: DocumentStore = {
    presignUpload: async (key) => `https://put.example/${key}`,
    presignDownload: async (key) => `https://get.example/${key}`,
    remove: async () => undefined,
  };
  const dispatch = createRouter(buildRoutes(makeHandlers({ getData: () => data, getStore: () => store })));
  return { dispatch };
}

describe('documents router integration', () => {
  it('401s unauthenticated', async () => {
    const { dispatch } = harness();
    expect((await dispatch(event('GET', '/documents'))).statusCode).toBe(401);
  });

  it('routes upload-url (static beats :id), create, list, and download', async () => {
    const { dispatch } = harness();

    const up = await dispatch(
      event('POST', '/documents/upload-url', {
        as: keira,
        body: { fileName: 'cna.pdf', contentType: 'application/pdf', sizeBytes: 1000 },
      }),
    );
    expect(up.statusCode).toBe(200);
    const s3Key = parse(up).s3Key as string;
    expect(s3Key).toMatch(/^T\/test-tenant\/documents\//);

    const created = await dispatch(
      event('POST', '/documents', {
        as: keira,
        body: { s3Key, fileName: 'cna.pdf', contentType: 'application/pdf', sizeBytes: 1000, category: 'certificate' },
      }),
    );
    expect(created.statusCode).toBe(201);
    const id = parse(created).documentId as string;

    const list = await dispatch(event('GET', '/documents', { as: keira }));
    expect((parse(list).documents as unknown[]).length).toBe(1);

    const detail = await dispatch(event('GET', `/documents/${id}`, { as: keira }));
    expect(detail.statusCode).toBe(200);
    expect(parse(detail).downloadUrl).toContain(s3Key);
  });
});

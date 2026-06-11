// Tenant-scoped S3 object keys for document uploads (SaaS isolation, sub-project 1). The bytes for one
// family live under T/<tenantId>/… so no family's objects collide with another's, and the tenant is
// read from the request's AsyncLocalStorage context. The S3 store stays key-agnostic; prefixing lives
// here at key construction so no caller forgets.

import { newId } from '../../shared/data/index.js';
import { currentTenantId } from '../../shared/tenant/index.js';

function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120) || 'file';
}

export function tenantDocKey(fileName: string): string {
  return `T/${currentTenantId()}/documents/${newId()}/${safeName(fileName)}`;
}

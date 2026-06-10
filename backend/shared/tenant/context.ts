// Per-request tenant context via AsyncLocalStorage (SaaS platform — sub-project 1). The data layer
// reads currentTenantId() to scope every key; it THROWS when unset so no access is ever un-scoped
// (fail closed). Request handlers get the context from the router (off the JWT); background jobs
// (the digest Lambda, the SQS worker) set it explicitly per tenant with runWithTenant.

import { AsyncLocalStorage } from 'node:async_hooks';

interface TenantStore {
  tenantId: string;
}

const als = new AsyncLocalStorage<TenantStore>();

export class TenantContextError extends Error {
  constructor() {
    super('No tenant in context — data access requires a tenant (fail closed).');
    this.name = 'TenantContextError';
  }
}

/** Run `fn` with `tenantId` as the ambient tenant. Throws if `tenantId` is empty. */
export function runWithTenant<T>(tenantId: string, fn: () => Promise<T> | T): Promise<T> | T {
  if (!tenantId) throw new TenantContextError();
  return als.run({ tenantId }, fn);
}

/** The ambient tenant id, or throw `TenantContextError` if none is set (the security backstop). */
export function currentTenantId(): string {
  const store = als.getStore();
  if (!store?.tenantId) throw new TenantContextError();
  return store.tenantId;
}

/** The ambient tenant id, or undefined — for code that must tolerate "no tenant" (e.g. logging). */
export function maybeTenantId(): string | undefined {
  return als.getStore()?.tenantId;
}

// Per-request tenant context via AsyncLocalStorage (SaaS platform — sub-project 1). The data layer
// reads currentTenantId() to scope every key; it THROWS when unset so no access is ever un-scoped
// (fail closed). Request handlers get the context from the router (off the JWT); background jobs
// (the digest Lambda, the SQS worker) set it explicitly per tenant with runWithTenant.

import { AsyncLocalStorage } from 'node:async_hooks';

interface TenantStore {
  tenantId: string;
  /** The active student (a child within the family). Set for per-child data access; unset for
   *  family-level access (the students roster, reminders) and platform-admin paths. */
  studentId?: string;
}

const als = new AsyncLocalStorage<TenantStore>();

export class TenantContextError extends Error {
  constructor() {
    super('No tenant in context — data access requires a tenant (fail closed).');
    this.name = 'TenantContextError';
  }
}

export class StudentContextError extends Error {
  constructor() {
    super('No student in context — per-child data access requires an active student (fail closed).');
    this.name = 'StudentContextError';
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

/**
 * Run `fn` with `studentId` as the ambient active student, nested inside the current tenant context.
 * The tenant must already be set (`runWithTenant`). Throws if `studentId` is empty or no tenant is set.
 */
export function runWithStudent<T>(studentId: string, fn: () => Promise<T> | T): Promise<T> | T {
  if (!studentId) throw new StudentContextError();
  const store = als.getStore();
  if (!store?.tenantId) throw new TenantContextError();
  return als.run({ ...store, studentId }, fn);
}

/** The ambient student id, or throw `StudentContextError` if none is set (per-child fail closed). */
export function currentStudentId(): string {
  const store = als.getStore();
  if (!store?.studentId) throw new StudentContextError();
  return store.studentId;
}

/** The ambient student id, or undefined — for code that must tolerate "no student" (e.g. logging). */
export function maybeStudentId(): string | undefined {
  return als.getStore()?.studentId;
}

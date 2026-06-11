// Public surface of the tenant context (SaaS platform — sub-project 1).
export {
  runWithTenant,
  currentTenantId,
  maybeTenantId,
  TenantContextError,
  runWithStudent,
  currentStudentId,
  maybeStudentId,
  StudentContextError,
} from './context.js';

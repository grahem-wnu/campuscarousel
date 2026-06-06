// Public surface of the shared auth + visibility contract. Modules and the API router import from
// `backend/shared/auth` (this index); they never reach into individual files.

export * from './types.js';
export * from './errors.js';
export * from './requester.js';
export * from './visibility.js';

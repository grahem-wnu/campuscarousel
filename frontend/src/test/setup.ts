import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom doesn't implement scrollTo; stub it so components that auto-scroll a list don't throw in
// tests. Guarded so this file stays inert under the default `node` environment (backend tests).
if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}
if (typeof window !== 'undefined' && !window.scrollTo) {
  window.scrollTo = () => {};
}

afterEach(() => cleanup());

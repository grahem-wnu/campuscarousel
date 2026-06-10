import { describe, expect, it } from 'vitest';
import { categoryLabel, formatBytes, validateFile } from './logic';

describe('categoryLabel', () => {
  it('humanizes category keys', () => {
    expect(categoryLabel('financial-aid')).toBe('Financial aid');
    expect(categoryLabel('certificate')).toBe('Certificate');
  });
});

describe('formatBytes', () => {
  it('scales to B/KB/MB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});

describe('validateFile', () => {
  it('rejects oversize files', () => {
    expect(validateFile({ size: 26 * 1024 * 1024, type: 'application/pdf' })).toMatch(/larger than 25/);
  });
  it('rejects unsupported types', () => {
    expect(validateFile({ size: 100, type: 'application/zip' })).toMatch(/Unsupported/);
  });
  it('passes a valid PDF', () => {
    expect(validateFile({ size: 100, type: 'application/pdf' })).toBeNull();
  });
});

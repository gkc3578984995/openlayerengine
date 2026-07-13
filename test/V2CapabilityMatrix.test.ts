import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { v1CapabilityManifest } from './fixtures/v1CapabilityManifest.js';
import { v2CapabilityMatrix } from './fixtures/v2CapabilityMatrix.js';

describe('v2 capability matrix', () => {
  it('maps every retained capability to a v2 entry and test', () => {
    const ids = v2CapabilityMatrix.map((item) => item.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(v1CapabilityManifest.map((item) => item.id).sort());
    for (const item of v2CapabilityMatrix) {
      expect(item.legacySources.length).toBeGreaterThan(0);
      expect(item.v2Entry.length).toBeGreaterThan(0);
      expect(item.testFiles.length).toBeGreaterThan(0);
      expect(item.testFiles.every(existsSync)).toBe(true);
      expect(item.id.toLowerCase()).not.toContain('wind');
    }
  });
});

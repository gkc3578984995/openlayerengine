import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { v1CapabilityManifest } from './fixtures/v1CapabilityManifest.js';
import * as v2CapabilityFixture from './fixtures/v2CapabilityMatrix.js';

const { v2CapabilityMatrix } = v2CapabilityFixture;

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

  it('defines planned v2 ids independently before joining legacy metadata', () => {
    const plannedCapabilities = Reflect.get(v2CapabilityFixture, 'v2PlannedCapabilities') as ReadonlyArray<{ id: string; v2Entry: string }> | undefined;
    const plannedIds = (plannedCapabilities ?? []).map((item) => item.id);
    const matrixSource = readFileSync('test/fixtures/v2CapabilityMatrix.ts', 'utf8');

    expect(plannedCapabilities).toBeDefined();
    expect(new Set(plannedIds).size).toBe(plannedIds.length);
    expect(plannedIds.sort()).toEqual(v1CapabilityManifest.map((item) => item.id).sort());
    expect(v2CapabilityMatrix.map(({ id, v2Entry }) => ({ id, v2Entry }))).toEqual(plannedCapabilities);
    expect(matrixSource).not.toMatch(/v1CapabilityManifest\.map\s*\(/);
    expect(matrixSource).not.toContain('.startsWith(');
    expect(matrixSource).not.toMatch(/import\s*\{[^}]*\b(?:fixedLegacyCapabilityIds|legacyShapeTypes)\b/);
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { coversCapabilities } from './fixtures/capabilityCoverage.js';
import {
  fixedLegacyCapabilityIds,
  v1CapabilityManifest,
  v1ExcludedCapabilities,
  v1KnownLimitations,
  type LegacyCapabilityId
} from './fixtures/v1CapabilityManifest.js';
import { v2CapabilityMatrix, v2ExcludedCapabilities, v2KnownLimitations } from './fixtures/v2CapabilityMatrix.js';

const projectRoot = resolve(__dirname, '..');

function declaredCapabilityMarkers(path: string): ReadonlySet<string> {
  const source = readFileSync(resolve(projectRoot, path), 'utf8');
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const markers = new Set<string>();

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'coversCapabilities') {
      for (const argument of node.arguments) {
        if (ts.isStringLiteralLike(argument)) markers.add(argument.text);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return markers;
}

describe('v1 capability baseline takeover', () => {
  it('keeps the independently audited v1 id set and approved dispositions frozen', () => {
    expect(v1CapabilityManifest.map(({ id }) => id)).toEqual([...fixedLegacyCapabilityIds]);
    expect(new Set(fixedLegacyCapabilityIds).size).toBe(fixedLegacyCapabilityIds.length);
    expect(fixedLegacyCapabilityIds.every((id) => !id.toLowerCase().includes('wind'))).toBe(true);

    expect(
      v1CapabilityManifest
        .filter(({ disposition }) => disposition === 'intentional-api-break')
        .map(({ id }) => id)
        .sort()
    ).toEqual(
      [
        'public-base-subclass-extension',
        'public-low-level-plot-api',
        'public-low-level-transform-interaction',
        'public-feature-metadata-keys',
        'public-legacy-type-only-ast',
        'earth-default-context-resolution',
        'event-manual-enable-disable'
      ].sort()
    );

    for (const row of v1CapabilityManifest) {
      expect(row.legacySources.length, row.id).toBeGreaterThan(0);
      expect(row.testFiles.length, row.id).toBeGreaterThan(0);
      if (row.disposition === 'intentional-api-break') {
        expect(row.replacementIds?.length, row.id).toBeGreaterThan(0);
        expect(row.specificationSection?.length, row.id).toBeGreaterThan(0);
      }
    }

    expect(v1KnownLimitations.map(({ id }) => id)).toEqual([
      'descriptor-custom-content',
      'descriptor-close-callback',
      'measure-text-size',
      'measure-total-distance-toggle',
      'dash-flow-single-remove-cleanup',
      'flight-line-listener-cleanup',
      'draw-remove-all-semantics'
    ]);
    expect(v1ExcludedCapabilities.map(({ id }) => id)).toEqual(['wind']);
  });

  it('takes over every legacy evidence row with an implemented v2 entry and matching explicit coverage marker', () => {
    const v2ById = new Map(v2CapabilityMatrix.map((row) => [row.id, row]));
    const markerCache = new Map<string, ReadonlySet<string>>();
    const missingMarkers: string[] = [];

    expect(v2ById.size).toBe(v1CapabilityManifest.length);
    for (const legacy of v1CapabilityManifest) {
      const v2 = v2ById.get(legacy.id);
      expect(v2, legacy.id).toBeDefined();
      if (v2 === undefined) continue;

      expect(v2.legacySources, legacy.id).toEqual(legacy.legacySources);
      expect(v2.disposition, legacy.id).toBe(legacy.disposition);
      expect(v2.status, legacy.id).toBe('implemented');
      expect(existsSync(resolve(projectRoot, v2.v2Entry)), `${legacy.id}: ${v2.v2Entry}`).toBe(true);
      expect(v2.testFiles.length, legacy.id).toBeGreaterThan(0);
      for (const testFile of v2.testFiles) {
        expect(existsSync(resolve(projectRoot, testFile)), `${legacy.id}: ${testFile}`).toBe(true);
        let markers = markerCache.get(testFile);
        if (markers === undefined) {
          markers = declaredCapabilityMarkers(testFile);
          markerCache.set(testFile, markers);
        }
        if (!markers.has(legacy.id)) missingMarkers.push(`${legacy.id}:${testFile}`);
      }
    }
    expect(missingMarkers).toEqual([]);
  });

  it('closes every frozen limitation and preserves Wind as the only approved exclusion', () => {
    expect(v2KnownLimitations.map(({ id, status }) => ({ id, status }))).toEqual(v1KnownLimitations.map(({ id }) => ({ id, status: 'fixed' })));
    expect(v2ExcludedCapabilities.map(({ id, reason }) => ({ id, reason }))).toEqual(v1ExcludedCapabilities);
  });

  it('validates frozen ids at runtime without importing a legacy implementation', () => {
    const representativeId: LegacyCapabilityId = v1CapabilityManifest[0].id;
    expect(coversCapabilities(representativeId)).toEqual([representativeId]);
    expect(() => coversCapabilities('wind' as LegacyCapabilityId)).toThrowError('Unknown frozen capability: wind');
  });
});

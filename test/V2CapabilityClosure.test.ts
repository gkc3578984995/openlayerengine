import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { v1CapabilityManifest, v1ExcludedCapabilities, v1KnownLimitations } from './fixtures/v1CapabilityManifest.js';
import { v2CapabilityMatrix, v2ExcludedCapabilities, v2KnownLimitations } from './fixtures/v2CapabilityMatrix.js';

const projectRoot = resolve(__dirname, '..');

function readProjectFile(path: string): string {
  return readFileSync(resolve(projectRoot, path), 'utf8');
}

function capabilityMarkers(path: string): ReadonlySet<string> {
  const source = readProjectFile(path);
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

describe('v2 capability closure', () => {
  it('closes every frozen v1 capability with an implemented repository entry and explicit v2 test marker', () => {
    const legacyIds = v1CapabilityManifest.map(({ id }) => id).sort();
    const matrixIds = v2CapabilityMatrix.map(({ id }) => id).sort();
    const markerCache = new Map<string, ReadonlySet<string>>();
    const missingMarkers: string[] = [];

    expect(new Set(matrixIds).size).toBe(matrixIds.length);
    expect(matrixIds).toEqual(legacyIds);

    for (const row of v2CapabilityMatrix) {
      expect(row.status, row.id).toBe('implemented');
      expect(row.v2Entry, row.id).toMatch(/^(?:package\.json|src\/[A-Za-z0-9_./-]+)$/);
      expect(existsSync(resolve(projectRoot, row.v2Entry)), `${row.id}: ${row.v2Entry}`).toBe(true);
      expect(row.testFiles.length, row.id).toBeGreaterThan(0);

      for (const testFile of row.testFiles) {
        expect(testFile, row.id).toMatch(/^test\/.+\.test\.ts$/);
        expect(existsSync(resolve(projectRoot, testFile)), `${row.id}: ${testFile}`).toBe(true);
        let markers = markerCache.get(testFile);
        if (markers === undefined) {
          markers = capabilityMarkers(testFile);
          markerCache.set(testFile, markers);
        }
        if (!markers.has(row.id)) missingMarkers.push(`${row.id}:${testFile}`);
      }

      if (row.disposition === 'intentional-api-break') {
        expect(row.replacementIds?.length, row.id).toBeGreaterThan(0);
        for (const replacementId of row.replacementIds ?? []) {
          expect(matrixIds, `${row.id} replacement ${replacementId}`).toContain(replacementId);
        }
      }
    }
    expect(missingMarkers).toEqual([]);
  });

  it('records every frozen known limitation as fixed with focused regression evidence', () => {
    expect(v2KnownLimitations.map(({ id }) => id).sort()).toEqual(v1KnownLimitations.map(({ id }) => id).sort());

    for (const limitation of v2KnownLimitations) {
      expect(limitation.status, limitation.id).toBe('fixed');
      expect(existsSync(resolve(projectRoot, limitation.v2Entry)), `${limitation.id}: ${limitation.v2Entry}`).toBe(true);
      expect(limitation.testFiles.length, limitation.id).toBeGreaterThan(0);
      for (const testFile of limitation.testFiles) {
        expect(existsSync(resolve(projectRoot, testFile)), `${limitation.id}: ${testFile}`).toBe(true);
        expect(readProjectFile(testFile), `${limitation.id}: ${limitation.evidenceMarker}`).toContain(limitation.evidenceMarker);
      }
    }
  });

  it('keeps Wind as the sole exclusion and ties it to design section 2 and implementation task 16', () => {
    expect(v2ExcludedCapabilities.map(({ id, reason }) => ({ id, reason }))).toEqual(v1ExcludedCapabilities);
    expect(v2ExcludedCapabilities).toEqual([
      {
        id: 'wind',
        status: 'excluded',
        reason: '已批准删除',
        specificationSections: ['design-spec-section-2', 'implementation-plan-task-16']
      }
    ]);

    const design = readProjectFile('docs/superpowers/specs/2026-07-13-v2-element-kernel-architecture-design.md');
    const plan = readProjectFile('docs/superpowers/plans/2026-07-13-v2-architecture-code-refactor.md');
    expect(design).toMatch(/## 2\. 明确不做的事项[\s\S]*?WindLayer[\s\S]*?ol-wind[\s\S]*?wind-core/);
    expect(plan).toMatch(/## Task 16:[\s\S]*?除 Wind 外/);
  });
});

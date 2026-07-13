/* eslint-disable @typescript-eslint/no-explicit-any */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type Earth from '../src/Earth';
import PointLayer from '../src/base/PointLayer';
import Transform from '../src/components/Transform';
import { getRegisteredEarth } from '../src/earthContext';
import { Toolbar } from '../src/extends/toolbar/Toolbar';
import { destroyEarth, useEarth } from '../src/useEarth';

const featureRoots = ['src/base', 'src/components', 'src/extends'];
const earthBoundaryFiles = [
  'src/base/BillboardLayer.ts',
  'src/base/CircleLayer.ts',
  'src/base/OverlayLayer.ts',
  'src/base/PointLayer.ts',
  'src/base/PolygonLayer.ts',
  'src/base/PolylineLayer.ts',
  'src/components/Transform.ts',
  'src/extends/plot/plotDraw.ts',
  'src/extends/plot/plotEdit.ts'
];

const state = vi.hoisted(() => ({
  defaultEarthConstructions: 0,
  defaultAddedLayers: [] as unknown[],
  defaultRegisteredLayers: [] as string[]
}));

vi.mock('../src/Earth', () => ({
  default: class MockEarth {
    isDestroyed = false;
    map = {
      addLayer: (layer: unknown) => state.defaultAddedLayers.push(layer)
    };

    constructor() {
      state.defaultEarthConstructions += 1;
    }

    _autoRegisterLayer(key: string): void {
      state.defaultRegisteredLayers.push(key);
    }

    removeLayer(): undefined {
      return undefined;
    }

    removeRegisteredLayer(): boolean {
      return false;
    }

    destroy(): void {
      this.isDestroyed = true;
    }
  }
}));

interface FeatureSource {
  file: string;
  source: string;
}

async function listTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) return listTypeScriptFiles(file);
      if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name === 'index.ts') return [];
      return [file];
    })
  );
  return files.flat();
}

async function loadFeatureSourceEntries(): Promise<FeatureSource[]> {
  const files = (await Promise.all(featureRoots.map(listTypeScriptFiles))).flat();
  return Promise.all(
    files.map(async (file) => ({
      file: file.replaceAll('\\', '/'),
      source: await readFile(file, 'utf8')
    }))
  );
}

async function loadFeatureSources(): Promise<string> {
  return (await loadFeatureSourceEntries()).map(({ source }) => source).join('\n');
}

function parseSource({ file, source }: FeatureSource): ts.SourceFile {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function containsIdentifier(entry: FeatureSource, identifier: string): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === identifier) found = true;
    ts.forEachChild(node, visit);
  };
  visit(parseSource(entry));
  return found;
}

function resolveEarthCallContexts(entry: FeatureSource): boolean[] {
  const calls: boolean[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'resolveEarth') {
      let ancestor: ts.Node | undefined = node.parent;
      while (ancestor && !ts.isConstructorDeclaration(ancestor)) ancestor = ancestor.parent;
      calls.push(Boolean(ancestor));
    }
    ts.forEachChild(node, visit);
  };
  visit(parseSource(entry));
  return calls;
}

const optionalEarthConstructors = new Set(['BillboardLayer', 'CircleLayer', 'OverlayLayer', 'PointLayer', 'PolygonLayer', 'PolylineLayer']);

function implicitEarthConstructions(entry: FeatureSource): string[] {
  const constructions: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && optionalEarthConstructors.has(node.expression.text) && node.arguments?.length === 0) {
      constructions.push(`${entry.file}:${node.expression.text}`);
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Toolbar' && (node.arguments?.length ?? 0) < 2) {
      constructions.push(`${entry.file}:Toolbar`);
    }
    ts.forEachChild(node, visit);
  };
  visit(parseSource(entry));
  return constructions;
}

function createNamedEarth(): { earth: Earth; addedLayers: unknown[]; registeredLayers: string[] } {
  const addedLayers: unknown[] = [];
  const registeredLayers: string[] = [];
  const earth = {
    isDestroyed: false,
    map: {
      addLayer: (layer: unknown) => addedLayers.push(layer)
    },
    _autoRegisterLayer: (key: string) => registeredLayers.push(key),
    removeLayer: () => undefined,
    removeRegisteredLayer: () => false
  } as unknown as Earth;
  return { earth, addedLayers, registeredLayers };
}

afterEach(() => {
  destroyEarth();
  vi.restoreAllMocks();
  state.defaultEarthConstructions = 0;
  state.defaultAddedLayers.length = 0;
  state.defaultRegisteredLayers.length = 0;
});

describe('Earth context boundaries', () => {
  it('centralizes optional Earth resolution', async () => {
    const entries = await loadFeatureSourceEntries();
    const featureSources = await loadFeatureSources();

    expect(featureSources).not.toMatch(/\bgetDefaultEarth\b/);
    expect(featureSources).not.toMatch(/from ['"].*useEarth['"]/);
    expect(entries.filter((entry) => containsIdentifier(entry, 'useEarth')).map(({ file }) => file)).toEqual([]);
  });

  it('limits default resolution to explicit public boundaries', async () => {
    const entries = await loadFeatureSourceEntries();
    const usages = entries
      .filter((entry) => containsIdentifier(entry, 'resolveEarth'))
      .map((entry) => ({ file: entry.file, constructorCalls: resolveEarthCallContexts(entry) }));

    expect(usages.map(({ file }) => file).sort()).toEqual([...earthBoundaryFiles].sort());
    expect(usages.every(({ constructorCalls }) => constructorCalls.length === 1 && constructorCalls[0])).toBe(true);
  });

  it('passes the resolved Earth to drawing-session helpers', async () => {
    const entries = await loadFeatureSourceEntries();
    const sources = new Map(entries.map(({ file, source }) => [file, source]));
    const earthEntry = {
      file: 'src/Earth.ts',
      source: await readFile('src/Earth.ts', 'utf8')
    };

    expect(entries.flatMap(implicitEarthConstructions)).toEqual([]);
    expect(implicitEarthConstructions(earthEntry)).toEqual([]);
    expect(sources.get('src/extends/plot/plotDraw.ts')).toContain('new OverlayLayer(this.earth)');
    expect(sources.get('src/extends/plot/plotEdit.ts')).toContain('new OverlayLayer(this.earth)');
  });

  it('uses the default Earth registered by useEarth for PointLayer', () => {
    const defaultEarth = useEarth();

    const layer = new PointLayer();

    expect((layer as any).earth).toBe(defaultEarth);
    expect(layer.getLayer()).toBe(state.defaultAddedLayers[0]);
    expect(state.defaultRegisteredLayers).toEqual([layer.registryKey]);
  });

  it('uses an explicit Earth for PointLayer without resolving the default', () => {
    const { earth: namedEarth, addedLayers, registeredLayers } = createNamedEarth();

    const layer = new PointLayer(namedEarth);

    expect((layer as any).earth).toBe(namedEarth);
    expect(layer.getLayer()).toBe(addedLayers[0]);
    expect(registeredLayers).toEqual([layer.registryKey]);
    expect(state.defaultEarthConstructions).toBe(0);
    expect(getRegisteredEarth()).toBeUndefined();
  });

  it('retains the explicit Earth passed to Transform', () => {
    const prototype = Transform.prototype as any;
    vi.spyOn(prototype, 'createTransform').mockReturnValue({});
    ['setupEventPipeline', 'watchContextMenu', 'setupKeyDownEvent', 'setupPointerTrack', 'setupToolbarSync'].forEach((method) =>
      vi.spyOn(prototype, method).mockImplementation(() => undefined)
    );
    const { earth: namedEarth } = createNamedEarth();

    const transform = new Transform({ earth: namedEarth });

    expect((transform as any).earth).toBe(namedEarth);
    expect(state.defaultEarthConstructions).toBe(0);
    expect(getRegisteredEarth()).toBeUndefined();
  });

  it('uses the Transform Earth for its toolbar overlay', () => {
    const { earth: namedEarth } = createNamedEarth();

    const toolbar = new Toolbar({ point: [0, 0], type: 'Point' }, namedEarth);

    expect((toolbar as any).overlay.map).toBe(namedEarth.map);
    expect(state.defaultEarthConstructions).toBe(0);
    expect(getRegisteredEarth()).toBeUndefined();
  });
});

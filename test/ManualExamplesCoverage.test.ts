import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { coverageForScenario, coverageItems, rootTypeExports, rootValueExports, type ScenarioId } from '../.test/coverage/publicApiCoverage.js';
import { scenarios } from '../.test/scenarios/index.js';
import { publicApiManifest } from './fixtures/v2PublicApiManifest.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scenarioRoot = resolve(repositoryRoot, '.test/scenarios');
const expectedScenarioIds = [
  'earth',
  'view-controls',
  'layers',
  'elements',
  'styles-shapes',
  'draw-edit',
  'measure',
  'transform',
  'animations',
  'events-menu',
  'overlays',
  'utilities'
] as const satisfies readonly ScenarioId[];

const auditedOwners = [
  'Earth',
  'EarthOptions',
  'UseEarthOptions',
  'ViewService',
  'ViewAnimationOptions',
  'FlyToOptions',
  'ControlService',
  'GraticuleOptions',
  'ScaleLineOptions',
  'Layer',
  'LayerService',
  'VectorLayerSpec',
  'TileLayerSpec',
  'NativeLayerSpec',
  'LayerPatch',
  'Element',
  'ElementService',
  'ElementCreateInput',
  'ElementSelector',
  'ElementPatch',
  'ElementCopyOptions',
  'ElementState',
  'ElementGeometryDetails',
  'ElementRenderGeometry',
  'ShapeInput',
  'StyleService',
  'StyleSpec',
  'StrokeSpec',
  'SolidFillSpec',
  'PatternFillSpec',
  'CircleSymbolSpec',
  'IconSymbolSpec',
  'TextSpec',
  'ArrowDecorationSpec',
  'StylePatch',
  'DrawService',
  'DrawOptions',
  'DrawSession',
  'DrawSessionEventMap',
  'EditOptions',
  'EditSession',
  'EditSessionEventMap',
  'MeasureService',
  'MeasureOptions',
  'MeasureSession',
  'MeasureSessionEventMap',
  'MeasureResult',
  'TransformService',
  'TransformOptions',
  'TransformSession',
  'TransformReplaceOptions',
  'TransformToolbarHandle',
  'TransformToolbarItemSpec',
  'TransformToolbarItemPatch',
  'TransformToolbarOptions',
  'TransformToolbarOptionsPatch',
  'TransformEventMap',
  'AnimationManager',
  'AnimationHandle',
  'BlinkAnimationSpec',
  'HighlightAnimationSpec',
  'AlertAnimationSpec',
  'GrowAnimationSpec',
  'RadarScanAnimationSpec',
  'CenterSpreadAnimationSpec',
  'FadeAnimationSpec',
  'PulseAnimationSpec',
  'DashFlowAnimationSpec',
  'PathTravelAnimationSpec',
  'EventService',
  'EventSubscriptionOptions',
  'EarthEventMap',
  'EarthPointerEvent',
  'EarthKeyboardEvent',
  'ContextMenuService',
  'ContextMenuSpec',
  'ContextMenuItemSpec',
  'ContextMenuItemContext',
  'ContextMenuItemState',
  'ContextMenuHandle',
  'OverlayService',
  'OverlaySpec',
  'OverlayPatch',
  'OverlaySelector',
  'OverlayHandle',
  'PanIntoViewSpec',
  'DescriptorSpec',
  'DescriptorPatch',
  'DescriptorHandle',
  'DescriptorListItem',
  'DescriptorEvent',
  'ThrottleOptions',
  'ThrottledFunction'
] as const;

const callableOwners = [
  'Earth',
  'ViewService',
  'ControlService',
  'Layer',
  'LayerService',
  'Element',
  'ElementService',
  'StyleService',
  'DrawService',
  'DrawSession',
  'EditSession',
  'MeasureService',
  'MeasureSession',
  'TransformService',
  'TransformSession',
  'TransformToolbarHandle',
  'AnimationManager',
  'AnimationHandle',
  'EventService',
  'ContextMenuService',
  'ContextMenuHandle',
  'OverlayService',
  'OverlayHandle',
  'DescriptorHandle',
  'ThrottledFunction'
] as const;

const scenarioFileById = {
  earth: 'earth.ts',
  'view-controls': 'viewControls.ts',
  layers: 'layers.ts',
  elements: 'elements.ts',
  'styles-shapes': 'stylesShapes.ts',
  'draw-edit': 'drawEdit.ts',
  measure: 'measure.ts',
  transform: 'transform.ts',
  animations: 'animations.ts',
  'events-menu': 'eventsMenu.ts',
  overlays: 'overlays.ts',
  utilities: 'utilities.ts'
} as const satisfies Record<ScenarioId, string>;

describe('2.0 人工验收台覆盖门禁', () => {
  it('覆盖根入口全部运行时值和类型导出', () => {
    expect([...rootValueExports].sort()).toEqual([...publicApiManifest.valueExports].sort());
    expect([...rootTypeExports].sort()).toEqual([...publicApiManifest.typeExports].sort());
  });

  it('每个覆盖项唯一、指向真实场景且每个场景都有覆盖内容', () => {
    const ids = coverageItems.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(scenarios.map((scenario) => scenario.id)).toEqual(expectedScenarioIds);
    for (const item of coverageItems) expect(expectedScenarioIds).toContain(item.scenario);
    for (const scenario of scenarios) expect(coverageForScenario(scenario.id).length, scenario.id).toBeGreaterThan(0);
  });

  it('覆盖每个受审公共接口和句柄的全部公开成员', () => {
    const { checker, exports } = publicExports();
    for (const owner of auditedOwners) {
      const exported = exports.get(owner);
      expect(exported, `缺少公共导出：${owner}`).toBeDefined();
      const symbol = exported === undefined ? undefined : resolveAlias(checker, exported);
      if (symbol === undefined) continue;
      const actual = allPropertyNames(checker.getDeclaredTypeOfSymbol(symbol));
      const covered = coverageMemberNames(owner);
      for (const property of actual) expect(covered, `${owner}.${property} 没有验收场景`).toContain(property);
    }
  });

  it('每个受审公共方法在对应场景中都有真实调用', async () => {
    const { checker, exports } = publicExports();
    const expectedCalls = new Map<string, { scenario: ScenarioId; method: string; owners: string[]; count: number }>();
    for (const owner of callableOwners) {
      const exported = exports.get(owner);
      expect(exported, `缺少公共导出：${owner}`).toBeDefined();
      if (exported === undefined) continue;
      for (const method of publicMethodNames(checker, checker.getDeclaredTypeOfSymbol(resolveAlias(checker, exported)))) {
        const coverage = coverageItems.find((item) => item.id === `${owner}.${method}`);
        expect(coverage, `${owner}.${method} 缺少覆盖项`).toBeDefined();
        if (coverage === undefined) continue;
        const key = `${coverage.scenario}:${method}`;
        const current = expectedCalls.get(key) ?? { scenario: coverage.scenario, method, owners: [], count: 0 };
        current.owners.push(owner);
        current.count += 1;
        expectedCalls.set(key, current);
      }
    }

    const actualCalls = new Map<ScenarioId, ReadonlyMap<string, number>>();
    for (const [scenario, file] of Object.entries(scenarioFileById) as [ScenarioId, string][]) {
      actualCalls.set(scenario, calledPropertyCounts(file, await readFile(resolve(scenarioRoot, file), 'utf8')));
    }
    for (const expected of expectedCalls.values()) {
      const actual = actualCalls.get(expected.scenario)?.get(expected.method) ?? 0;
      expect(actual, `${expected.scenario} 对 ${expected.owners.join('、')}.${expected.method} 的真实调用不足`).toBeGreaterThanOrEqual(expected.count);
    }
  });

  it('场景仅使用根公共入口并彻底移除旧架构和 Wind 示例', async () => {
    const files = (await readdir(scenarioRoot)).filter((file) => file.endsWith('.ts'));
    const entries = await Promise.all(files.map(async (file) => ({ file, source: await readFile(resolve(scenarioRoot, file), 'utf8') })));
    const source = entries.map((entry) => entry.source).join('\n');
    expect(source).not.toMatch(/from\s+['"][^'"]*src\//);
    expect(source).not.toMatch(/from\s+['"]@\//);
    expect(source).not.toMatch(/src\/(?:base|components|extends|facade|services|adapters|core|internal)/);
    expect(source).not.toMatch(
      /\b(?:BillboardLayer|PointLayer|PolylineLayer|PolygonLayer|CircleLayer|WindLayer|DynamicDraw|GlobalEvent|EPlotType|ETransform|PatternFillType)\b/
    );
    expect(source).not.toMatch(/\b(?:ol-wind|wind-core)\b/i);
    expect(source).not.toMatch(/\b(?:Enable all|Clear all|Demo controls|Base layers)\b/);
    for (const entry of entries) {
      for (const control of contextControlLabels(entry.file, entry.source)) {
        expect(control.label, `${entry.file} 的 ${control.method} 控件缺少中文说明`).toMatch(/[\u3400-\u9fff]/u);
      }
      for (const label of selectOptionLabels(entry.file, entry.source)) {
        expect(label, `${entry.file} 的下拉选项缺少中文说明`).toMatch(/[\u3400-\u9fff]/u);
      }
    }
  });

  it('为源码、dist 和覆盖检查提供独立命令', async () => {
    const packageJson = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    expect(packageJson.scripts?.['demo:dev']).toBe('vite');
    expect(packageJson.scripts?.['demo:dist']).toContain('acceptance-dist');
    expect(packageJson.scripts?.['demo:build:dist']).toContain('acceptance-dist');
    expect(packageJson.scripts?.['demo:coverage']).toContain('ManualExamplesCoverage.test.ts');
    expect(packageJson.scripts?.['typecheck:demo']).toContain('.test/tsconfig.json');
  });

  it('每段外部调用示例都能通过 strict TypeScript 编译', async () => {
    const files = (await readdir(scenarioRoot)).filter((file) => file.endsWith('.ts') && file !== 'index.ts');
    const snippets = (
      await Promise.all(
        files.map(async (file) =>
          codeSnippets(file, await readFile(resolve(scenarioRoot, file), 'utf8')).map((code, index) => ({ file: `${file}-${index + 1}.ts`, code }))
        )
      )
    ).flat();

    expect(snippets).toHaveLength(expectedScenarioIds.length);
    expect(compileSnippetDiagnostics(snippets)).toEqual([]);
  });
});

function publicExports(): Readonly<{ checker: ts.TypeChecker; exports: ReadonlyMap<string, ts.Symbol> }> {
  const configPath = resolve(repositoryRoot, 'tsconfig.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error !== undefined) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, repositoryRoot);
  const entryPath = resolve(repositoryRoot, 'src/index.ts');
  const program = ts.createProgram({ rootNames: [...new Set([...parsed.fileNames, entryPath])], options: parsed.options });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entryPath);
  if (source === undefined) throw new Error('无法加载 src/index.ts');
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (moduleSymbol === undefined) throw new Error('无法解析 src/index.ts 模块符号');
  return { checker, exports: new Map(checker.getExportsOfModule(moduleSymbol).map((symbol) => [symbol.name, symbol])) };
}

function resolveAlias(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  return (symbol.flags & ts.SymbolFlags.Alias) === 0 ? symbol : checker.getAliasedSymbol(symbol);
}

function allPropertyNames(type: ts.Type, visited = new Set<ts.Type>()): readonly string[] {
  if (visited.has(type)) return [];
  visited.add(type);
  const names = new Set(
    type
      .getProperties()
      .filter(isPublicProperty)
      .map((property) => property.name)
  );
  if (type.isUnionOrIntersection()) {
    for (const branch of type.types) for (const name of allPropertyNames(branch, visited)) names.add(name);
  }
  return [...names].filter((name) => !name.startsWith('__@') && !name.startsWith('#'));
}

function isPublicProperty(property: ts.Symbol): boolean {
  return !(property.declarations ?? []).some((declaration) => {
    const flags = ts.getCombinedModifierFlags(declaration as ts.Declaration & ts.HasModifiers);
    return (flags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) !== 0;
  });
}

function coverageMemberNames(owner: string): readonly string[] {
  const prefix = `${owner}.`;
  return [...new Set(coverageItems.filter((item) => item.id.startsWith(prefix)).map((item) => item.id.slice(prefix.length).split('=')[0]))];
}

function publicMethodNames(checker: ts.TypeChecker, type: ts.Type): readonly string[] {
  return type
    .getProperties()
    .filter(isPublicProperty)
    .filter((property) => {
      const declaration = property.valueDeclaration ?? property.declarations?.[0];
      return declaration !== undefined && checker.getTypeOfSymbolAtLocation(property, declaration).getCallSignatures().length > 0;
    })
    .map((property) => property.name);
}

function calledPropertyCounts(file: string, source: string): ReadonlyMap<string, number> {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const counts = new Map<string, number>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      counts.set(method, (counts.get(method) ?? 0) + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return counts;
}

function contextControlLabels(file: string, source: string): readonly { readonly method: string; readonly label: string }[] {
  const labelArgumentByMethod = new Map([
    ['button', 1],
    ['checkbox', 1],
    ['number', 1],
    ['text', 1],
    ['color', 1],
    ['select', 1],
    ['textarea', 1],
    ['section', 0],
    ['createMapTarget', 0],
    ['note', 1]
  ]);
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const controls: { method: string; label: string }[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'context'
    ) {
      const method = node.expression.name.text;
      const labelIndex = labelArgumentByMethod.get(method);
      if (labelIndex !== undefined) {
        const label = node.arguments[labelIndex];
        expect(label, `${file} 的 context.${method} 缺少标签`).toBeDefined();
        expect(label !== undefined && ts.isStringLiteralLike(label), `${file} 的 context.${method} 标签必须是静态字符串`).toBe(true);
        if (label !== undefined && ts.isStringLiteralLike(label)) controls.push({ method, label: label.text });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return controls;
}

function codeSnippets(file: string, source: string): readonly string[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const snippets: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'setCode' &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'context'
    ) {
      const code = node.arguments[0];
      expect(code !== undefined && (ts.isNoSubstitutionTemplateLiteral(code) || ts.isStringLiteral(code)), `${file} 的 setCode 必须使用静态字符串`).toBe(true);
      if (code !== undefined && (ts.isNoSubstitutionTemplateLiteral(code) || ts.isStringLiteral(code))) snippets.push(code.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return snippets;
}

function selectOptionLabels(file: string, source: string): readonly string[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const labels: string[] = [];
  const labelMaps = new Set<string>();
  const collectLabelMaps = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text.endsWith('Labels') &&
      node.initializer !== undefined &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      const values = node.initializer.properties
        .filter((property): property is ts.PropertyAssignment => ts.isPropertyAssignment(property))
        .map((property) => property.initializer);
      expect(values.length, `${file} 的 ${node.name.text} 必须包含中文标签`).toBeGreaterThan(0);
      expect(
        values.every((value) => ts.isStringLiteralLike(value)),
        `${file} 的 ${node.name.text} 标签必须是静态字符串`
      ).toBe(true);
      labelMaps.add(node.name.text);
      for (const value of values) if (ts.isStringLiteralLike(value)) labels.push(value.text);
    }
    ts.forEachChild(node, collectLabelMaps);
  };
  collectLabelMaps(sourceFile);
  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const labelProperty = node.properties.find(
        (property): property is ts.PropertyAssignment => ts.isPropertyAssignment(property) && property.name.getText(sourceFile) === 'label'
      );
      const hasValue = node.properties.some((property) => ts.isPropertyAssignment(property) && property.name.getText(sourceFile) === 'value');
      if (labelProperty !== undefined && hasValue) {
        if (ts.isStringLiteralLike(labelProperty.initializer)) labels.push(labelProperty.initializer.text);
        else {
          const usesChineseLabelMap =
            ts.isTemplateExpression(labelProperty.initializer) &&
            labelProperty.initializer.templateSpans.some(
              (span) =>
                ts.isElementAccessExpression(span.expression) && ts.isIdentifier(span.expression.expression) && labelMaps.has(span.expression.expression.text)
            );
          expect(usesChineseLabelMap, `${file} 的动态下拉选项 label 必须引用静态中文 Labels 映射`).toBe(true);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return labels;
}

function compileSnippetDiagnostics(snippets: readonly { readonly file: string; readonly code: string }[]): readonly string[] {
  const config = ts.readConfigFile(resolve(repositoryRoot, 'tsconfig.json'), ts.sys.readFile);
  if (config.error !== undefined) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, repositoryRoot);
  const options: ts.CompilerOptions = {
    ...parsed.options,
    noEmit: true,
    declaration: false,
    declarationDir: undefined,
    outDir: undefined,
    rootDir: repositoryRoot,
    types: ['node', 'vite/client'],
    paths: {
      '@/*': ['./src/*'],
      '@vrsim/earth-engine-ol': ['./src/index.ts'],
      '@vrsim/earth-engine-ol/style.css': ['./src/assets/style/public.scss']
    }
  };
  const virtualSources = new Map(snippets.map((snippet) => [pathKey(resolve(repositoryRoot, '.test-snippets', snippet.file)), snippet.code]));
  const rootNames = [...virtualSources.keys()];
  const host = ts.createCompilerHost(options);
  const baseFileExists = host.fileExists.bind(host);
  const baseReadFile = host.readFile.bind(host);
  const baseGetSourceFile = host.getSourceFile.bind(host);
  host.fileExists = (fileName) => virtualSources.has(pathKey(fileName)) || baseFileExists(fileName);
  host.readFile = (fileName) => virtualSources.get(pathKey(fileName)) ?? baseReadFile(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    const source = virtualSources.get(pathKey(fileName));
    return source === undefined
      ? baseGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile)
      : ts.createSourceFile(fileName, source, languageVersion, true, ts.ScriptKind.TS);
  };
  const program = ts.createProgram({ rootNames, options, host });
  return ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
    .map((diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
      if (diagnostic.file === undefined || diagnostic.start === undefined) return message;
      const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      return `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1} ${message}`;
    });
}

function pathKey(fileName: string): string {
  return resolve(fileName).replaceAll('\\', '/').toLowerCase();
}

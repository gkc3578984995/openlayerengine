import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { extractApiModel } from './api-docs.mjs';

const input = resolve(process.env.TYPEDOC_JSON ?? '.cache/typedoc.json');
const document = JSON.parse(await readFile(input, 'utf8'));
const model = extractApiModel(document);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function findType(name) {
  return model.apiCatalog.find((entry) => entry.name === name);
}

function findProperty(type, name) {
  return [...type.properties, ...type.accessors].find((property) => property.name === name);
}

function findMethod(type, name) {
  return type.methods.find((method) => method.name === name);
}

const expectedCounts = { class: 11, interface: 91, typeAlias: 57 };
assert(model.apiCatalog.length === 159, `公开类型目录数量应为 159，实际为 ${model.apiCatalog.length}`);
for (const [kind, expected] of Object.entries(expectedCounts)) {
  const actual = model.apiCatalog.filter((entry) => entry.kind === kind).length;
  assert(actual === expected, `${kind} 数量应为 ${expected}，实际为 ${actual}`);
}

assert(model.apiRuntimeExports.length === 17, `公开函数与常量目录数量应为 17，实际为 ${model.apiRuntimeExports.length}`);
for (const entry of model.apiRuntimeExports) {
  assert(entry.summary, `${entry.name} 缺少公开说明`);
  assert(entry.source, `${entry.name} 缺少源码位置`);
  if (entry.kind === 'function') assert(entry.signatures.length > 0, `${entry.name} 缺少函数签名`);
  if (entry.kind === 'variable') assert(entry.type, `${entry.name} 缺少公开值类型`);
}
for (const requiredName of ['useEarth', 'shapeTypes', 'stylePresets', 'lineStyles', 'animationTypes', 'measureTypes']) {
  assert(
    model.apiRuntimeExports.some((entry) => entry.name === requiredName),
    `运行时 API 目录缺少 ${requiredName}`
  );
}

const rootTypeNames = (document.children ?? [])
  .filter((reflection) => [128, 256, 2097152].includes(reflection.kind))
  .map((reflection) => reflection.name)
  .sort();
const catalogNames = model.apiCatalog.map((entry) => entry.name).sort();
assert(JSON.stringify(rootTypeNames) === JSON.stringify(catalogNames), '类型目录必须与 TypeDoc 根节点的公开 class、interface、type alias 完全一致');

const requiredCoreTypes = [
  'Earth',
  'EarthOptions',
  'EarthLifecycleState',
  'UseEarthOptions',
  'ViewService',
  'FlyToOptions',
  'ViewAnimationOptions',
  'Layer',
  'LayerService',
  'LayerState',
  'LayerPatch',
  'LayerKind',
  'LayerOwnership',
  'PublicLayerSpec',
  'VectorLayerSpec',
  'TileLayerCommonSpec',
  'TileLayerSpec',
  'NativeLayerSpec',
  'TileUrlFunction',
  'ControlService',
  'GraticuleOptions',
  'ScaleLineOptions'
];
const missingCoreTypes = requiredCoreTypes.filter((name) => !findType(name));
assert(!missingCoreTypes.length, `核心文档缺少公开类型：${missingCoreTypes.join(', ')}`);

for (const entry of model.apiCatalog) {
  assert(entry.summary, `${entry.name} 缺少公开说明`);
  assert(entry.source, `${entry.name} 缺少源码位置`);
  assert(model.publicTypeAnchors[entry.name] === entry.anchor, `${entry.name} 的类型锚点映射不一致`);
  if (entry.kind === 'typeAlias') assert(entry.type, `${entry.name} 缺少 type alias 表达式`);
}

const earth = findType('Earth');
assert(earth.anchor === 'api-type-earth', 'Earth 类型锚点不稳定');
assert(earth.constructors[0]?.anchor === 'api-type-earth-constructor', 'Earth 构造器锚点不稳定');
assert(earth.constructors[0]?.signatures[0]?.parameters[0]?.anchor === 'api-type-earth-constructor-parameter-options', 'Earth 构造参数锚点不稳定');
assert(findProperty(earth, 'lifecycle')?.anchor === 'api-type-earth-property-lifecycle', 'Earth.lifecycle 属性锚点不稳定');

const useEarthOptions = findType('UseEarthOptions');
assert(findProperty(useEarthOptions, 'target')?.anchor === 'api-type-use-earth-options-property-target', 'UseEarthOptions.target 属性锚点不稳定');
assert(findProperty(useEarthOptions, 'target')?.type === 'string | HTMLElement', 'UseEarthOptions.target 类型表达式不正确');

const viewService = findType('ViewService');
assert(findMethod(viewService, 'flyTo')?.anchor === 'api-type-view-service-method-fly-to', 'ViewService.flyTo 方法锚点不稳定');
assert(
  findMethod(viewService, 'flyHome')?.signatures[0]?.parameters[0]?.anchor === 'api-type-view-service-method-fly-home-parameter-options',
  '方法参数锚点不稳定'
);
assert(findMethod(findType('LayerService'), 'add'), 'LayerService.add 未写入类型目录');
assert(findMethod(findType('Layer'), 'update'), 'Layer.update 未写入类型目录');
assert(findType('ElementProtectionUpdate'), 'ElementProtectionUpdate 未写入类型目录');
assert(findType('ElementProtectionState'), 'ElementProtectionState 未写入类型目录');
assert(findType('ElementProtectedError'), 'ElementProtectedError 未写入类型目录');
assert(findMethod(findType('ElementService'), 'setProtection'), 'ElementService.setProtection 未写入类型目录');
assert(findMethod(findType('ElementService'), 'getProtection'), 'ElementService.getProtection 未写入类型目录');
assert(findMethod(findType('ControlService'), 'enableGraticule'), 'ControlService.enableGraticule 未写入类型目录');
assert(findMethod(findType('ControlService'), 'enableScaleLine'), 'ControlService.enableScaleLine 未写入类型目录');

const shapeInput = findType('ShapeInput');
assert(shapeInput.variants.length === 2, 'ShapeInput 必须展开 Circle 与非 Circle 两个对象分支');
assert(
  shapeInput.variants.some((variant) => variant.properties.some((property) => property.name === 'radius')),
  'ShapeInput Circle 分支缺少 radius'
);
assert(
  shapeInput.variants.some((variant) => variant.properties.some((property) => property.name === 'controlPoints')),
  'ShapeInput 非 Circle 分支缺少 controlPoints'
);

const animationSpec = findType('AnimationSpec');
assert(animationSpec.variants.length === 10, `AnimationSpec 应展开 10 种效果，实际为 ${animationSpec.variants.length}`);

for (const reflection of (document.children ?? []).filter((entry) => [128, 256].includes(entry.kind))) {
  const catalogEntry = findType(reflection.name);
  for (const member of reflection.children ?? []) {
    if (member.flags?.isExternal === true) continue;
    if (member.kind === 2048) {
      const method = findMethod(catalogEntry, member.name);
      assert(method?.signatures.length === (member.signatures ?? []).length, `${reflection.name}.${member.name} 的 overload 数量不完整`);
    }
    if (member.kind === 512) {
      const constructor = catalogEntry.constructors.find((entry) => entry.name === member.name);
      assert(constructor?.signatures.length === (member.signatures ?? []).length, `${reflection.name} 构造器的 overload 数量不完整`);
    }
  }
}

const anchors = [];
for (const entry of model.apiCatalog) {
  anchors.push(entry.anchor);
  for (const member of [...entry.properties, ...entry.accessors, ...entry.methods, ...entry.constructors]) anchors.push(member.anchor);
  for (const callable of [...entry.methods, ...entry.constructors]) {
    for (const signature of callable.signatures) {
      anchors.push(signature.anchor);
      for (const parameter of signature.parameters) anchors.push(parameter.anchor);
    }
  }
  for (const variant of entry.variants) {
    anchors.push(variant.anchor);
    for (const property of variant.properties) anchors.push(property.anchor);
  }
}
for (const entry of model.apiRuntimeExports) {
  anchors.push(entry.anchor);
  for (const signature of entry.signatures) {
    anchors.push(signature.anchor);
    for (const parameter of signature.parameters) anchors.push(parameter.anchor);
  }
}
const duplicateAnchors = anchors.filter((anchor, index) => anchors.indexOf(anchor) !== index);
assert(!duplicateAnchors.length, `类型目录包含重复锚点：${[...new Set(duplicateAnchors)].join(', ')}`);

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { apiCatalog, apiRuntimeExports } from '../../website/src/generated/api.ts';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const viewsRoot = path.join(repositoryRoot, 'website/src/views');
const routerFile = path.join(repositoryRoot, 'website/src/router/index.ts');

const normalizePath = (value) => value.split(path.sep).join('/');

const collectFiles = async (directory, extension) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectFiles(target, extension);
      return entry.isFile() && entry.name.endsWith(extension) ? [target] : [];
    })
  );
  return files.flat().sort();
};

const unwrapExpression = (expression) => {
  let current = expression;
  while (ts.isAsExpression(current) || ts.isSatisfiesExpression(current) || ts.isTypeAssertionExpression(current) || ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
};

const propertyName = (name) => {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  throw new Error(`不支持计算属性名：${name.getText()}`);
};

const collectConstants = (script, filename) => {
  const sourceFile = ts.createSourceFile(filename, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const constants = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) constants.set(declaration.name.text, declaration.initializer);
    }
  }
  return { constants, sourceFile };
};

const parseBoundExpression = (source, filename) => {
  const sourceFile = ts.createSourceFile(filename, `const __value = ${source};`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declaration = sourceFile.statements[0]?.declarationList?.declarations?.[0];
  if (!declaration?.initializer) throw new Error(`无法解析表达式：${source}`);
  return declaration.initializer;
};

const evaluateStringArray = (expression, constants, stack = []) => {
  const current = unwrapExpression(expression);
  if (ts.isIdentifier(current)) {
    if (stack.includes(current.text)) throw new Error(`常量循环引用：${[...stack, current.text].join(' -> ')}`);
    const initializer = constants.get(current.text);
    if (!initializer) throw new Error(`找不到数组常量：${current.text}`);
    return evaluateStringArray(initializer, constants, [...stack, current.text]);
  }
  if (!ts.isArrayLiteralExpression(current)) throw new Error(`应为字符串数组，实际为：${current.getText()}`);
  return current.elements.map((element) => {
    const item = unwrapExpression(element);
    if (!ts.isStringLiteralLike(item)) throw new Error(`数组成员应为字符串，实际为：${item.getText()}`);
    return item.text;
  });
};

const evaluateMemberMap = (expression, constants, stack = []) => {
  const current = unwrapExpression(expression);
  if (ts.isIdentifier(current)) {
    if (stack.includes(current.text)) throw new Error(`常量循环引用：${[...stack, current.text].join(' -> ')}`);
    const initializer = constants.get(current.text);
    if (!initializer) throw new Error(`找不到成员映射常量：${current.text}`);
    return evaluateMemberMap(initializer, constants, [...stack, current.text]);
  }
  if (!ts.isObjectLiteralExpression(current)) throw new Error(`应为成员数组对象，实际为：${current.getText()}`);
  const result = {};
  for (const property of current.properties) {
    if (!ts.isPropertyAssignment(property)) throw new Error(`成员映射仅支持普通属性：${property.getText()}`);
    result[propertyName(property.name)] = evaluateStringArray(property.initializer, constants);
  }
  return result;
};

const extractAttributes = (tag) => {
  const result = new Map();
  const pattern = /(?:^|\s)(:?[-\w]+)\s*=\s*(["'])([\s\S]*?)\2/g;
  for (const match of tag.matchAll(pattern)) result.set(match[1], match[3]);
  return result;
};

const buildRouteMap = async () => {
  const source = await readFile(routerFile, 'utf8');
  const componentFiles = new Map();
  for (const match of source.matchAll(/import\s+(\w+)\s+from\s+['"](\.\.\/views\/[^'"]+\.vue)['"]/g)) {
    componentFiles.set(match[1], path.resolve(path.dirname(routerFile), match[2]));
  }
  for (const match of source.matchAll(/const\s+(\w+)\s*=\s*\(\)\s*=>\s*import\(['"](\.\.\/views\/[^'"]+\.vue)['"]\)/g)) {
    componentFiles.set(match[1], path.resolve(path.dirname(routerFile), match[2]));
  }

  const routes = new Map();
  for (const match of source.matchAll(/\{\s*path:\s*['"]([^'"]+)['"][^{}]*?component:\s*(\w+)[^{}]*?\}/g)) {
    const filename = componentFiles.get(match[2]);
    if (!filename) continue;
    const route = match[1] === '' ? '/' : match[1].startsWith('/') ? match[1] : `/${match[1]}`;
    routes.set(path.normalize(filename), route);
  }
  return routes;
};

const parsePageSelections = async () => {
  const [files, routeMap] = await Promise.all([collectFiles(viewsRoot, '.vue'), buildRouteMap()]);
  const selections = [];
  const parseErrors = [];

  for (const filename of files) {
    const source = await readFile(filename, 'utf8');
    if (!source.includes('<PublicApiSection')) continue;
    const script = source.match(/<script\s+setup(?:\s+lang=["']ts["'])?>([\s\S]*?)<\/script>/)?.[1] ?? '';
    const { constants } = collectConstants(script, filename);
    const page = routeMap.get(path.normalize(filename)) ?? normalizePath(path.relative(repositoryRoot, filename));

    for (const [index, match] of [...source.matchAll(/<PublicApiSection\b([\s\S]*?)\/>/g)].entries()) {
      const attributes = extractAttributes(match[1]);
      try {
        const evaluateArrayAttribute = (name) => {
          const bound = attributes.get(`:${name}`);
          if (bound !== undefined) return evaluateStringArray(parseBoundExpression(bound, `${filename}:${name}`), constants);
          const literal = attributes.get(name);
          return literal === undefined ? [] : [literal];
        };
        const memberSource = attributes.get(':member-names');
        const memberNames = memberSource === undefined ? {} : evaluateMemberMap(parseBoundExpression(memberSource, `${filename}:member-names`), constants);
        selections.push({
          page,
          filename: normalizePath(path.relative(repositoryRoot, filename)),
          componentIndex: index,
          typeNames: evaluateArrayAttribute('type-names'),
          runtimeNames: evaluateArrayAttribute('runtime-names'),
          memberNames
        });
      } catch (error) {
        parseErrors.push({ page, message: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return { selections, parseErrors };
};

const addOwner = (owners, key, page) => {
  const pages = owners.get(key) ?? [];
  pages.push(page);
  owners.set(key, pages);
};

const directMembers = (entry) => [
  ...entry.constructors.map((member) => ({ kind: 'constructor', name: member.name })),
  ...entry.properties.map((member) => ({ kind: 'property', name: member.name })),
  ...entry.accessors.map((member) => ({ kind: 'accessor', name: member.name })),
  ...entry.methods.map((member) => ({ kind: 'method', name: member.name }))
];

const memberKey = (typeName, kind, memberName) => `${typeName}:${kind}:${memberName}`;

export const auditComponentApiOwnership = async () => {
  const { selections, parseErrors } = await parsePageSelections();
  const typeByName = new Map(apiCatalog.map((entry) => [entry.name, entry]));
  const runtimeByName = new Map(apiRuntimeExports.map((entry) => [entry.name, entry]));
  const typeOwners = new Map();
  const runtimeOwners = new Map();
  const memberOwners = new Map();
  const unknownTypes = [];
  const unknownRuntime = [];
  const unknownMembers = [];
  const orphanMemberFilters = [];

  for (const selection of selections) {
    for (const typeName of Object.keys(selection.memberNames)) {
      if (!selection.typeNames.includes(typeName)) orphanMemberFilters.push({ page: selection.page, typeName });
    }
    for (const typeName of selection.typeNames) {
      const entry = typeByName.get(typeName);
      if (!entry) {
        unknownTypes.push({ page: selection.page, name: typeName });
        continue;
      }
      addOwner(typeOwners, typeName, selection.page);
      const members = directMembers(entry);
      const filter = Object.prototype.hasOwnProperty.call(selection.memberNames, typeName) ? selection.memberNames[typeName] : undefined;
      const memberNames = new Set(members.map((member) => member.name));
      if (filter) {
        for (const name of filter) {
          if (!memberNames.has(name)) unknownMembers.push({ page: selection.page, typeName, name });
        }
      }
      for (const member of members) {
        if (filter === undefined || filter.includes(member.name)) addOwner(memberOwners, memberKey(typeName, member.kind, member.name), selection.page);
      }
    }
    for (const runtimeName of selection.runtimeNames) {
      if (!runtimeByName.has(runtimeName)) {
        unknownRuntime.push({ page: selection.page, name: runtimeName });
        continue;
      }
      addOwner(runtimeOwners, runtimeName, selection.page);
    }
  }

  const missingTypes = apiCatalog.filter((entry) => !typeOwners.has(entry.name)).map((entry) => entry.name);
  const selfContainedTypeDuplicates = apiCatalog
    .filter((entry) => directMembers(entry).length === 0 || entry.variants.length > 0)
    .map((entry) => ({ name: entry.name, pages: typeOwners.get(entry.name) ?? [] }))
    .filter((entry) => entry.pages.length > 1);
  const multiPageTypes = apiCatalog
    .map((entry) => ({ name: entry.name, pages: [...new Set(typeOwners.get(entry.name) ?? [])] }))
    .filter((entry) => entry.pages.length > 1);
  const missingRuntime = apiRuntimeExports.filter((entry) => !runtimeOwners.has(entry.name)).map((entry) => entry.name);
  const duplicateRuntime = apiRuntimeExports
    .map((entry) => ({ name: entry.name, pages: runtimeOwners.get(entry.name) ?? [] }))
    .filter((entry) => entry.pages.length > 1);

  const missingMembers = [];
  const duplicateMembers = [];
  for (const entry of apiCatalog) {
    for (const member of directMembers(entry)) {
      const owners = memberOwners.get(memberKey(entry.name, member.kind, member.name)) ?? [];
      const issue = { typeName: entry.name, kind: member.kind, name: member.name, pages: owners };
      if (owners.length === 0) missingMembers.push(issue);
      if (owners.length > 1) duplicateMembers.push(issue);
    }
  }

  const errors = [
    ...parseErrors.map((issue) => `解析失败 ${issue.page}: ${issue.message}`),
    ...unknownTypes.map((issue) => `未知类型 ${issue.name}: ${issue.page}`),
    ...unknownRuntime.map((issue) => `未知运行时导出 ${issue.name}: ${issue.page}`),
    ...unknownMembers.map((issue) => `未知成员 ${issue.typeName}.${issue.name}: ${issue.page}`),
    ...orphanMemberFilters.map((issue) => `成员过滤目标未列入 typeNames ${issue.typeName}: ${issue.page}`),
    ...missingTypes.map((name) => `类型缺少归属: ${name}`),
    ...selfContainedTypeDuplicates.map((issue) => `不可拆分类型重复归属 ${issue.name}: ${issue.pages.join(', ')}`),
    ...missingRuntime.map((name) => `运行时导出缺少归属: ${name}`),
    ...duplicateRuntime.map((issue) => `运行时导出重复归属 ${issue.name}: ${issue.pages.join(', ')}`),
    ...missingMembers.map((issue) => `${issue.kind} 缺少归属: ${issue.typeName}.${issue.name}`),
    ...duplicateMembers.map((issue) => `${issue.kind} 重复归属 ${issue.typeName}.${issue.name}: ${issue.pages.join(', ')}`)
  ];

  return {
    exportedSymbolCount: apiCatalog.length + apiRuntimeExports.length,
    typeCount: apiCatalog.length,
    runtimeCount: apiRuntimeExports.length,
    pageCount: new Set(selections.map((selection) => selection.page)).size,
    selections,
    missingTypes,
    selfContainedTypeDuplicates,
    multiPageTypes,
    missingRuntime,
    duplicateRuntime,
    missingMembers,
    duplicateMembers,
    unknownTypes,
    unknownRuntime,
    unknownMembers,
    orphanMemberFilters,
    parseErrors,
    errors
  };
};

const formatList = (items, format) => (items.length ? items.map((item) => `  - ${format(item)}`).join('\n') : '  - 无');

export const formatComponentApiOwnershipReport = (report) => {
  const lines = [
    `组件文档 API 归属审计：${report.exportedSymbolCount} 个包根导出（${report.typeCount} 个类型，${report.runtimeCount} 个运行时导出），${report.pageCount} 个文档页面。`,
    '',
    `错误：${report.errors.length}`,
    ...report.errors.map((error) => `  - ${error}`),
    '',
    `多页承载类型（成员拆页，信息项）：${report.multiPageTypes.length}`,
    formatList(report.multiPageTypes, (item) => `${item.name}: ${item.pages.join(', ')}`)
  ];
  return lines.join('\n');
};

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const report = await auditComponentApiOwnership();
  console.log(formatComponentApiOwnershipReport(report));
  if (report.errors.length) process.exitCode = 1;
}

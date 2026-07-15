import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { publicApiManifest } from './fixtures/v2PublicApiManifest.js';

const repositoryRoot = process.cwd();
const sourceRoot = path.join(repositoryRoot, 'src');
const sourceEntry = path.join(sourceRoot, 'index.ts');
const publicNames = [...publicApiManifest.valueExports, ...publicApiManifest.typeExports];

describe('公共 API 中文注释契约', () => {
  it('根导出具有中文说明，公开字段和方法遵守统一格式', () => {
    const program = createSourceProgram();
    const diagnostics = ts.getPreEmitDiagnostics(program);
    expect(diagnostics, formatDiagnostics(diagnostics)).toEqual([]);

    const checker = program.getTypeChecker();
    const entry = program.getSourceFile(sourceEntry);
    expect(entry, `无法读取公共入口 ${sourceEntry}`).toBeDefined();
    if (entry === undefined) return;

    const moduleSymbol = checker.getSymbolAtLocation(entry);
    expect(moduleSymbol, '无法解析公共入口模块符号').toBeDefined();
    if (moduleSymbol === undefined) return;

    const exportsByName = new Map(checker.getExportsOfModule(moduleSymbol).map((symbol) => [symbol.getName(), resolveAlias(checker, symbol)]));
    const issues: string[] = [];
    for (const name of publicNames) {
      const symbol = exportsByName.get(name);
      if (symbol === undefined) {
        issues.push(`${name}：无法解析根导出`);
        continue;
      }
      const declarations = (symbol.getDeclarations() ?? []).filter(isSourceDeclaration);
      if (declarations.length === 0) {
        issues.push(`${name}：无法定位源码声明`);
        continue;
      }
      auditRootDeclaration(name, declarations, issues);
    }

    expect(issues, issues.join('\n')).toEqual([]);
  });
});

/** 创建只加载根入口的源码类型检查程序。 */
function createSourceProgram(): ts.Program {
  const configPath = path.join(repositoryRoot, 'tsconfig.json');
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  if (loaded.error !== undefined) throw new Error(formatDiagnostics([loaded.error]));
  const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, repositoryRoot, undefined, configPath);
  if (parsed.errors.length > 0) throw new Error(formatDiagnostics(parsed.errors));
  return ts.createProgram({ rootNames: [sourceEntry], options: { ...parsed.options, noEmit: true } });
}

/** 检查一个根导出的声明及其公开成员。 */
function auditRootDeclaration(name: string, declarations: readonly ts.Declaration[], issues: string[]): void {
  const primary = declarations.find(isNamedPublicDeclaration) ?? declarations[0];
  auditSummary(primary, name, issues);
  auditTypeParameters(primary, name, issues);

  if (ts.isClassDeclaration(primary) || ts.isInterfaceDeclaration(primary)) {
    auditMembers(primary.members, name, issues);
    return;
  }
  if (ts.isTypeAliasDeclaration(primary)) {
    if (ts.isFunctionTypeNode(primary.type)) auditCallable(primary, primary.type.parameters, name, issues, true);
    else auditTypeNode(primary.type, name, issues);
    return;
  }
  if (ts.isFunctionDeclaration(primary)) {
    const overloads = declarations.filter(
      (declaration): declaration is ts.FunctionDeclaration => ts.isFunctionDeclaration(declaration) && declaration.body === undefined
    );
    const targets = overloads.length > 0 ? overloads : declarations.filter(ts.isFunctionDeclaration);
    for (const declaration of targets) auditCallable(declaration, declaration.parameters, name, issues, true);
  }
}

/** 检查类、接口或内联对象的公开成员。 */
function auditMembers(members: ts.NodeArray<ts.TypeElement | ts.ClassElement>, owner: string, issues: string[]): void {
  const overloadKeys = new Set(
    members
      .filter((member): member is ts.MethodDeclaration => ts.isMethodDeclaration(member) && member.body === undefined)
      .map((member) => member.name.getText())
  );
  const constructorOverloads = members.some((member) => ts.isConstructorDeclaration(member) && member.body === undefined);

  for (const member of members) {
    if (!isPublicMember(member)) continue;
    const route = `${owner}.${memberName(member)}`;
    if (ts.isPropertySignature(member) || ts.isPropertyDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) {
      auditFieldSummary(member, route, issues);
      const type = 'type' in member ? member.type : undefined;
      if (type !== undefined) auditTypeNode(type, route, issues);
      continue;
    }
    if (ts.isMethodSignature(member) || ts.isCallSignatureDeclaration(member) || ts.isConstructSignatureDeclaration(member)) {
      auditCallable(member, member.parameters, route, issues, !ts.isConstructSignatureDeclaration(member));
      continue;
    }
    if (ts.isMethodDeclaration(member)) {
      if (member.body !== undefined && overloadKeys.has(member.name.getText())) continue;
      auditCallable(member, member.parameters, route, issues, true);
      continue;
    }
    if (ts.isConstructorDeclaration(member)) {
      if (member.body !== undefined && constructorOverloads) continue;
      auditCallable(member, member.parameters, `${owner}.constructor`, issues, false);
    }
  }
}

/** 递归检查联合、交叉和内联对象类型。 */
function auditTypeNode(node: ts.TypeNode, owner: string, issues: string[]): void {
  if (ts.isTypeLiteralNode(node)) {
    auditMembers(node.members, owner, issues);
    return;
  }
  if (ts.isFunctionTypeNode(node)) return;
  if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
    for (const type of node.types) auditTypeNode(type, owner, issues);
    return;
  }
  if (ts.isParenthesizedTypeNode(node)) auditTypeNode(node.type, owner, issues);
}

/** 检查声明是否带有中文 TypeDoc 摘要。 */
function auditSummary(node: ts.Node, route: string, issues: string[]): void {
  const summary = jsDocSummary(node);
  if (summary.length === 0) issues.push(`${route}：缺少 TypeDoc 说明`);
  else if (!/[\u3400-\u9fff]/u.test(summary)) issues.push(`${route}：说明必须使用中文`);
}

/** 检查公开字段是否使用“名称。说明。”格式。 */
function auditFieldSummary(node: ts.Node, route: string, issues: string[]): void {
  const summary = jsDocSummary(node);
  if (summary.length === 0) {
    issues.push(`${route}：缺少字段说明`);
    return;
  }
  if (!/[\u3400-\u9fff]/u.test(summary)) issues.push(`${route}：字段说明必须使用中文`);
  if (summary.split('。').filter((part) => part.trim().length > 0).length < 2) issues.push(`${route}：字段说明应使用“名称。说明。”格式`);
}

/** 检查公开 callable 的参数、返回值和示例。 */
function auditCallable(node: ts.Node, parameters: ts.NodeArray<ts.ParameterDeclaration>, route: string, issues: string[], requireReturns: boolean): void {
  auditSummary(node, route, issues);
  auditTypeParameters(node, route, issues);
  const tags = ts.getJSDocTags(node);
  const parameterTags = new Map(tags.filter((tag): tag is ts.JSDocParameterTag => ts.isJSDocParameterTag(tag)).map((tag) => [tag.name.getText(), tag]));
  for (const parameter of parameters) {
    const name = parameter.name.getText();
    const tag = parameterTags.get(name);
    if (tag === undefined) {
      issues.push(`${route}：缺少 @param ${name}`);
      continue;
    }
    const description = jsDocCommentText(tag.comment).trim();
    if (!/[\u3400-\u9fff]/u.test(description)) issues.push(`${route}：@param ${name} 必须使用中文`);
    if (description.split('。').filter((part) => part.trim().length > 0).length < 2) {
      issues.push(`${route}：@param ${name} 应使用“名称。说明。”格式`);
    }
  }
  const tagNames = new Set(tags.map((tag) => tag.tagName.text));
  const returns = tags.find((tag) => tag.tagName.text === 'returns' || tag.tagName.text === 'return');
  if (requireReturns && returns === undefined) issues.push(`${route}：缺少 @returns`);
  else if (returns !== undefined && !/[\u3400-\u9fff]/u.test(jsDocCommentText(returns.comment))) issues.push(`${route}：@returns 必须使用中文`);
  const example = tags.find((tag) => tag.tagName.text === 'example');
  if (!tagNames.has('example')) issues.push(`${route}：缺少 @example`);
  else if (example === undefined || !jsDocCommentText(example.comment).includes('```')) issues.push(`${route}：@example 必须包含代码示例`);
}

/** 检查公开泛型参数是否使用“名称。说明。”格式。 */
function auditTypeParameters(node: ts.Node, route: string, issues: string[]): void {
  const typeParameters = (node as ts.Node & { readonly typeParameters?: ts.NodeArray<ts.TypeParameterDeclaration> }).typeParameters;
  if (typeParameters === undefined || typeParameters.length === 0) return;
  const tags = ts.getJSDocTags(node).filter((tag) => tag.tagName.text === 'typeParam');
  const descriptions = new Map<string, string>();
  for (const tag of tags) {
    const text = jsDocCommentText(tag.comment).trim();
    const separator = text.search(/\s/u);
    if (separator > 0) descriptions.set(text.slice(0, separator), text.slice(separator).trim());
  }
  for (const parameter of typeParameters) {
    const name = parameter.name.text;
    const description = descriptions.get(name);
    if (description === undefined) {
      issues.push(`${route}：缺少 @typeParam ${name}`);
      continue;
    }
    if (!/[\u3400-\u9fff]/u.test(description)) issues.push(`${route}：@typeParam ${name} 必须使用中文`);
    if (description.split('。').filter((part) => part.trim().length > 0).length < 2) {
      issues.push(`${route}：@typeParam ${name} 应使用“名称。说明。”格式`);
    }
  }
}

/** 读取声明 JSDoc 中标签之前的正文。 */
function jsDocSummary(node: ts.Node): string {
  const anchor = ts.isVariableDeclaration(node) ? node.parent.parent : node;
  const docs = (anchor as ts.Node & { readonly jsDoc?: readonly ts.JSDoc[] }).jsDoc ?? [];
  return docs
    .map((doc) => jsDocCommentText(doc.comment))
    .join('\n')
    .trim();
}

/** 将 TypeScript 的结构化 JSDoc 文本转为普通字符串。 */
function jsDocCommentText(comment: ts.JSDoc['comment']): string {
  if (comment === undefined) return '';
  if (typeof comment === 'string') return comment;
  return comment.map((part) => part.text).join('');
}

/** 判断声明是否可以作为根导出的主声明。 */
function isNamedPublicDeclaration(declaration: ts.Declaration): boolean {
  return (
    ts.isClassDeclaration(declaration) ||
    ts.isInterfaceDeclaration(declaration) ||
    ts.isTypeAliasDeclaration(declaration) ||
    ts.isFunctionDeclaration(declaration) ||
    ts.isEnumDeclaration(declaration) ||
    ts.isVariableDeclaration(declaration)
  );
}

/** 判断类或接口成员是否对外可见。 */
function isPublicMember(member: ts.TypeElement | ts.ClassElement): boolean {
  if ('name' in member && member.name !== undefined && ts.isPrivateIdentifier(member.name)) return false;
  const flags = ts.getCombinedModifierFlags(member as ts.Declaration);
  return (flags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) === 0;
}

/** 读取类或接口成员的可读名称。 */
function memberName(member: ts.TypeElement | ts.ClassElement): string {
  if (ts.isConstructorDeclaration(member)) return 'constructor';
  if ('name' in member && member.name !== undefined) return member.name.getText();
  return 'call';
}

/** 判断声明是否来自本仓库源码目录。 */
function isSourceDeclaration(declaration: ts.Declaration): boolean {
  const fileName = path.resolve(declaration.getSourceFile().fileName).replaceAll('\\', '/').toLowerCase();
  const root = path.resolve(sourceRoot).replaceAll('\\', '/').toLowerCase();
  return fileName === root || fileName.startsWith(`${root}/`);
}

/** 解析 TypeScript 重导出的别名符号。 */
function resolveAlias(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  return (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
}

/** 将 TypeScript 诊断格式化为测试错误文本。 */
function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => repositoryRoot,
    getNewLine: () => '\n'
  });
}

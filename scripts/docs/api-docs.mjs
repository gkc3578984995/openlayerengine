import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REFLECTION_KIND = {
  variable: 32,
  function: 64,
  class: 128,
  interface: 256,
  constructor: 512,
  property: 1024,
  method: 2048,
  accessor: 262144,
  typeAlias: 2097152
};

const TYPE_KINDS = [REFLECTION_KIND.class, REFLECTION_KIND.interface, REFLECTION_KIND.typeAlias];

function typeNeedsGrouping(type) {
  return ['conditional', 'intersection', 'union', 'reflection'].includes(type?.type);
}

function renderTypeParameter(parameter) {
  const constraint = parameter.type ? ` extends ${renderType(parameter.type)}` : '';
  const defaultValue = parameter.default ? ` = ${renderType(parameter.default)}` : '';
  return `${parameter.name}${constraint}${defaultValue}`;
}

function renderSignature(signature, useArrow = true) {
  const signatureTypeParameters = signature.typeParameters ?? signature.typeParameter ?? [];
  const typeParameters = signatureTypeParameters.length ? `<${signatureTypeParameters.map(renderTypeParameter).join(', ')}>` : '';
  const parameters = (signature.parameters ?? []).map((parameter) => {
    const rest = parameter.flags?.isRest ? '...' : '';
    const optional = parameter.flags?.isOptional ? '?' : '';
    return `${rest}${parameter.name}${optional}: ${renderType(parameter.type)}`;
  });
  const returns = renderType(signature.type);
  return useArrow ? `${typeParameters}(${parameters.join(', ')}) => ${returns}` : `${typeParameters}(${parameters.join(', ')}): ${returns}`;
}

function renderReflection(type) {
  const declaration = type.declaration ?? {};
  const signatures = declaration.signatures ?? [];
  if (signatures.length) {
    return signatures.length === 1 ? renderSignature(signatures[0]) : signatures.map((signature) => `(${renderSignature(signature)})`).join(' & ');
  }

  const members = [];
  for (const child of declaration.children ?? []) {
    if (isKind(child, 'Property', REFLECTION_KIND.property)) {
      members.push(`${child.flags?.isReadonly ? 'readonly ' : ''}${child.name}${child.flags?.isOptional ? '?' : ''}: ${renderType(child.type)}`);
    } else if (isKind(child, 'Method', REFLECTION_KIND.method)) {
      for (const signature of child.signatures ?? []) members.push(`${child.name}${renderSignature(signature, false)}`);
    }
  }
  for (const signature of declaration.indexSignatures ?? []) {
    const parameters = (signature.parameters ?? []).map((parameter) => `${parameter.name}: ${renderType(parameter.type)}`).join(', ');
    members.push(`[${parameters}]: ${renderType(signature.type)}`);
  }
  return members.length ? `{ ${members.join('; ')} }` : 'object';
}

function renderMappedType(type) {
  const readonly = type.readonlyModifier === '+' ? 'readonly ' : type.readonlyModifier === '-' ? '-readonly ' : '';
  const optional = type.optionalModifier === '+' ? '?' : type.optionalModifier === '-' ? '-?' : '';
  const nameType = type.nameType ? ` as ${renderType(type.nameType)}` : '';
  return `{ ${readonly}[${type.parameter} in ${renderType(type.parameterType)}${nameType}]${optional}: ${renderType(type.templateType)} }`;
}

function renderTemplateLiteral(type) {
  const tail = (type.tail ?? [])
    .map((part) => {
      if (Array.isArray(part)) return `\${${renderType(part[0])}}${part[1] ?? ''}`;
      return `\${${renderType(part.type ?? part[0])}}${part.text ?? part[1] ?? ''}`;
    })
    .join('');
  return `\`${type.head ?? ''}${tail}\``;
}

/** 将 TypeDoc 类型节点转换为便于阅读和链接拆分的 TypeScript 类型表达式。 */
export function renderType(type) {
  if (!type) return 'unknown';
  if (type.type === 'intrinsic') return type.name;
  if (type.type === 'reference') {
    const typeArguments = type.typeArguments?.length ? `<${type.typeArguments.map(renderType).join(', ')}>` : '';
    return `${type.name ?? type.qualifiedName ?? 'unknown'}${typeArguments}`;
  }
  if (type.type === 'array') {
    const element = renderType(type.elementType);
    return `${typeNeedsGrouping(type.elementType) ? `(${element})` : element}[]`;
  }
  if (type.type === 'union' || type.type === 'intersection') return type.types.map(renderType).join(type.type === 'union' ? ' | ' : ' & ');
  if (type.type === 'literal') {
    if (typeof type.value === 'bigint') return `${type.value}n`;
    if (type.value && typeof type.value === 'object' && 'value' in type.value) return `${type.value.negative ? '-' : ''}${type.value.value}n`;
    return JSON.stringify(type.value) ?? String(type.value);
  }
  if (type.type === 'tuple') return `[${(type.elements ?? []).map(renderType).join(', ')}]`;
  if (type.type === 'namedTupleMember') return `${type.name}${type.isOptional ? '?' : ''}: ${renderType(type.element)}`;
  if (type.type === 'reflection') return renderReflection(type);
  if (type.type === 'typeOperator') return `${type.operator} ${renderType(type.target)}`;
  if (type.type === 'indexedAccess') return `${renderType(type.objectType)}[${renderType(type.indexType)}]`;
  if (type.type === 'query') return `typeof ${renderType(type.queryType)}`;
  if (type.type === 'conditional') {
    return `${renderType(type.checkType)} extends ${renderType(type.extendsType)} ? ${renderType(type.trueType)} : ${renderType(type.falseType)}`;
  }
  if (type.type === 'mapped') return renderMappedType(type);
  if (type.type === 'optional') return `${renderType(type.elementType ?? type.target)}?`;
  if (type.type === 'rest') return `...${renderType(type.elementType ?? type.target)}`;
  if (type.type === 'templateLiteral') return renderTemplateLiteral(type);
  if (type.type === 'infer') return `infer ${type.name ?? renderType(type.typeParameter)}`;
  if (type.type === 'predicate') {
    const assertion = type.asserts ? 'asserts ' : '';
    const target = type.targetType ? ` is ${renderType(type.targetType)}` : '';
    return `${assertion}${type.name}${target}`;
  }
  return type.name ?? 'unknown';
}

function isKind(reflection, name, numericKind) {
  return reflection.kindString === name || reflection.kind === numericKind;
}

function findReflections(reflection, predicate, result = []) {
  if (predicate(reflection)) result.push(reflection);
  for (const child of reflection.children ?? []) findReflections(child, predicate, result);
  return result;
}

function summaryOf(reflection) {
  return (reflection?.comment?.summary ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function blockTagsOf(reflection, tag) {
  return (reflection?.comment?.blockTags ?? [])
    .filter((entry) => entry.tag === tag)
    .map((entry) =>
      (entry.content ?? [])
        .map((part) => part.text ?? '')
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean);
}

function sourceOf(reflection) {
  return reflection?.sources?.[0]?.fileName ?? '';
}

function slug(value) {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-z\d])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z\d]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function typeAnchor(name) {
  return `api-type-${slug(name)}`;
}

function runtimeAnchor(kind, name) {
  return `api-${kind === 'function' ? 'function' : 'value'}-${slug(name)}`;
}

function memberAnchor(ownerAnchor, kind, name) {
  return `${ownerAnchor}-${kind}-${slug(name)}`;
}

function parameterModel(parameter, ownerAnchor, overloadIndex) {
  const signaturePrefix = overloadIndex === 0 ? ownerAnchor : `${ownerAnchor}-overload-${overloadIndex + 1}`;
  return {
    name: parameter.name,
    anchor: `${signaturePrefix}-parameter-${slug(parameter.name)}`,
    type: renderType(parameter.type),
    optional: Boolean(parameter.flags?.isOptional),
    defaultValue: parameter.defaultValue ?? '',
    summary: summaryOf(parameter)
  };
}

function signatureModel(signature, ownerAnchor, overloadIndex) {
  return {
    anchor: `${ownerAnchor}-signature-${overloadIndex + 1}`,
    summary: summaryOf(signature),
    typeParameters: (signature.typeParameters ?? signature.typeParameter ?? []).map(typeParameterModel),
    parameters: (signature.parameters ?? []).map((parameter) => parameterModel(parameter, ownerAnchor, overloadIndex)),
    returns: renderType(signature.type),
    throws: blockTagsOf(signature, '@throws')
  };
}

function callableModel(member, ownerAnchor, kind) {
  const anchor = kind === 'constructor' ? `${ownerAnchor}-constructor` : memberAnchor(ownerAnchor, kind, member.name);
  const signatures = (member.signatures ?? []).map((signature, index) => signatureModel(signature, anchor, index));
  return {
    name: member.name,
    anchor,
    summary: summaryOf(member) || signatures.find((signature) => signature.summary)?.summary || '',
    signatures
  };
}

function propertyModel(member, ownerAnchor) {
  return {
    name: member.name,
    anchor: memberAnchor(ownerAnchor, 'property', member.name),
    type: renderType(member.type),
    optional: Boolean(member.flags?.isOptional),
    readonly: Boolean(member.flags?.isReadonly),
    defaultValue: member.defaultValue ?? blockTagsOf(member, '@defaultValue')[0] ?? '',
    summary: summaryOf(member)
  };
}

function accessorModel(member, ownerAnchor) {
  const signature = member.getSignature ?? member.setSignature;
  const setterParameter = member.setSignature?.parameters?.[0];
  return {
    name: member.name,
    anchor: memberAnchor(ownerAnchor, 'property', member.name),
    type: renderType(member.getSignature?.type ?? setterParameter?.type),
    readonly: !member.setSignature,
    summary: summaryOf(member) || summaryOf(signature)
  };
}

function typeParameterModel(parameter) {
  return {
    name: parameter.name,
    summary: summaryOf(parameter),
    constraint: parameter.type ? renderType(parameter.type) : '',
    default: parameter.default ? renderType(parameter.default) : ''
  };
}

function literalKeys(type) {
  if (!type) return [];
  if (type.type === 'literal' && typeof type.value === 'string') return [type.value];
  if (type.type === 'union') return type.types.flatMap(literalKeys);
  return [];
}

function mergeVariantProperties(left, right) {
  const merged = new Map(left.map((property) => [property.name, property]));
  for (const property of right) merged.set(property.name, property);
  return [...merged.values()];
}

function applyPropertyTransform(variants, transform) {
  return variants.map((variant) => ({ ...variant, properties: variant.properties.map(transform) }));
}

function reflectionObjectVariants(reflection, context, seen) {
  const properties = (reflection.children ?? [])
    .filter((member) => isKind(member, 'Property', REFLECTION_KIND.property))
    .map((member) => ({
      name: member.name,
      type: renderType(member.type),
      optional: Boolean(member.flags?.isOptional),
      readonly: Boolean(member.flags?.isReadonly),
      defaultValue: member.defaultValue ?? blockTagsOf(member, '@defaultValue')[0] ?? '',
      summary: summaryOf(member)
    }));

  if (properties.length) return [{ label: reflection.name === '__type' ? '对象字段' : reflection.name, expression: '', properties }];
  if (isKind(reflection, 'Type alias', REFLECTION_KIND.typeAlias) || isKind(reflection, 'TypeAlias', REFLECTION_KIND.typeAlias)) {
    return resolveObjectVariants(reflection.type, context, seen);
  }
  return [];
}

/**
 * 展开公开 type alias 中的对象分支，避免 ShapeInput、AnimationSpec 一类联合只显示一条长表达式。
 * 这里只解释公开结构和 TypeScript 标准映射工具，不解析运行期实现类型。
 */
function resolveObjectVariants(type, context, seen = new Set()) {
  if (!type) return [];

  if (type.type === 'reflection') return reflectionObjectVariants(type.declaration ?? {}, context, seen);

  if (type.type === 'conditional') {
    const condition = `${renderType(type.checkType)} extends ${renderType(type.extendsType)}`;
    return [
      ...resolveObjectVariants(type.trueType, context, new Set(seen)).map((variant) => ({
        ...variant,
        label: `满足 ${condition}`,
        expression: renderType(type.trueType)
      })),
      ...resolveObjectVariants(type.falseType, context, new Set(seen)).map((variant) => ({
        ...variant,
        label: `不满足 ${condition}`,
        expression: renderType(type.falseType)
      }))
    ];
  }

  if (type.type === 'union') {
    return type.types.flatMap((branch, index) =>
      resolveObjectVariants(branch, context, new Set(seen)).map((variant) => ({
        ...variant,
        label: variant.label === '对象字段' ? `分支 ${index + 1}` : variant.label,
        expression: renderType(branch)
      }))
    );
  }

  if (type.type === 'intersection') {
    let variants = [{ label: '对象字段', expression: renderType(type), properties: [] }];
    for (const branch of type.types) {
      const branchVariants = resolveObjectVariants(branch, context, new Set(seen));
      if (!branchVariants.length) continue;
      variants = variants.flatMap((current) =>
        branchVariants.map((branchVariant) => ({
          label: branchVariant.label === '对象字段' ? current.label : branchVariant.label,
          expression: renderType(type),
          properties: mergeVariantProperties(current.properties, branchVariant.properties)
        }))
      );
    }
    return variants.filter((variant) => variant.properties.length);
  }

  if (type.type === 'typeOperator') {
    const variants = resolveObjectVariants(type.target, context, seen);
    return type.operator === 'readonly' ? applyPropertyTransform(variants, (property) => ({ ...property, readonly: true })) : variants;
  }

  if (type.type !== 'reference') return [];

  const typeArguments = type.typeArguments ?? [];
  const utilityTarget = typeArguments[0];
  if (type.name === 'Partial') {
    return applyPropertyTransform(resolveObjectVariants(utilityTarget, context, seen), (property) => ({ ...property, optional: true }));
  }
  if (type.name === 'Required') {
    return applyPropertyTransform(resolveObjectVariants(utilityTarget, context, seen), (property) => ({ ...property, optional: false }));
  }
  if (type.name === 'Readonly') {
    return applyPropertyTransform(resolveObjectVariants(utilityTarget, context, seen), (property) => ({ ...property, readonly: true }));
  }
  if (type.name === 'Pick' || type.name === 'Omit') {
    const keys = new Set(literalKeys(typeArguments[1]));
    return applyPropertyTransform(resolveObjectVariants(utilityTarget, context, seen), (property) => property).map((variant) => ({
      ...variant,
      properties: variant.properties.filter((property) => (type.name === 'Pick' ? keys.has(property.name) : !keys.has(property.name)))
    }));
  }

  const targetId = typeof type.target === 'number' ? type.target : undefined;
  if (targetId === undefined || seen.has(targetId)) return [];
  const target = context.reflections.get(targetId);
  if (!target) return [];
  const nextSeen = new Set(seen);
  nextSeen.add(targetId);
  return reflectionObjectVariants(target, context, nextSeen).map((variant) => ({
    ...variant,
    label: variant.label === '对象字段' ? (type.name ?? target.name) : variant.label,
    expression: renderType(type)
  }));
}

function variantModels(reflection, anchor, context, directPropertyCount) {
  if (directPropertyCount > 0 || !reflection.type) return [];
  return resolveObjectVariants(reflection.type, context).map((variant, variantIndex) => ({
    label: variant.label,
    anchor: `${anchor}-variant-${variantIndex + 1}`,
    expression: variant.expression || renderType(reflection.type),
    properties: variant.properties.map((property) => ({
      ...property,
      anchor: `${anchor}-variant-${variantIndex + 1}-property-${slug(property.name)}`
    }))
  }));
}

function catalogKind(reflection) {
  if (isKind(reflection, 'Class', REFLECTION_KIND.class)) return 'class';
  if (isKind(reflection, 'Interface', REFLECTION_KIND.interface)) return 'interface';
  return 'typeAlias';
}

/** TypeDoc 会把平台声明成员复制到导出类；保留本包内继承，只排除外部平台成员。 */
function isOwnedMember(reflection) {
  return reflection.flags?.isExternal !== true;
}

function catalogEntry(reflection, context) {
  const anchor = typeAnchor(reflection.name);
  const properties = [];
  const accessors = [];
  const methods = [];
  const constructors = [];

  for (const member of reflection.children ?? []) {
    if (!isOwnedMember(member)) continue;
    if (isKind(member, 'Property', REFLECTION_KIND.property)) properties.push(propertyModel(member, anchor));
    else if (isKind(member, 'Accessor', REFLECTION_KIND.accessor)) accessors.push(accessorModel(member, anchor));
    else if (isKind(member, 'Method', REFLECTION_KIND.method)) methods.push(callableModel(member, anchor, 'method'));
    else if (isKind(member, 'Constructor', REFLECTION_KIND.constructor)) constructors.push(callableModel(member, anchor, 'constructor'));
  }

  return {
    name: reflection.name,
    kind: catalogKind(reflection),
    anchor,
    summary: summaryOf(reflection),
    source: sourceOf(reflection),
    typeParameters: (reflection.typeParameters ?? []).map(typeParameterModel),
    type:
      isKind(reflection, 'Type alias', REFLECTION_KIND.typeAlias) || isKind(reflection, 'TypeAlias', REFLECTION_KIND.typeAlias)
        ? renderType(reflection.type ?? { type: 'reflection', declaration: reflection })
        : null,
    properties,
    accessors,
    methods,
    constructors,
    variants: variantModels(reflection, anchor, context, properties.length + accessors.length)
  };
}

function runtimeExportModel(reflection) {
  const kind = isKind(reflection, 'Function', REFLECTION_KIND.function) ? 'function' : 'variable';
  const anchor = runtimeAnchor(kind, reflection.name);
  const signatures = kind === 'function' ? (reflection.signatures ?? []).map((signature, index) => signatureModel(signature, anchor, index)) : [];
  return {
    name: reflection.name,
    kind,
    anchor,
    summary: summaryOf(reflection) || signatures.find((signature) => signature.summary)?.summary || '',
    source: sourceOf(reflection),
    type: kind === 'variable' ? renderType(reflection.type) : null,
    defaultValue: reflection.defaultValue ?? '',
    signatures
  };
}

function methodSignature(method) {
  const signatures = method.signatures ?? [];
  const signature = signatures.reduce(
    (selected, candidate) => ((candidate.parameters?.length ?? 0) >= (selected.parameters?.length ?? 0) ? candidate : selected),
    signatures[0] ?? {}
  );
  const params = (signature.parameters ?? [])
    .map((parameter) => `${parameter.name}${parameter.flags?.isOptional ? '?' : ''}: ${renderType(parameter.type)}`)
    .join(', ');
  return { params, returns: renderType(signature.type) };
}

export function extractApiModel(document) {
  const classes = {};
  const interfaces = {};
  for (const reflection of findReflections(document, (item) => isKind(item, 'Class', REFLECTION_KIND.class))) {
    const methods = {};
    for (const member of reflection.children ?? []) {
      if (isOwnedMember(member) && isKind(member, 'Method', REFLECTION_KIND.method)) methods[member.name] = methodSignature(member);
    }
    classes[reflection.name] = { methods };
  }
  for (const reflection of findReflections(document, (item) => isKind(item, 'Interface', REFLECTION_KIND.interface))) {
    const properties = {};
    for (const member of reflection.children ?? []) {
      if (isOwnedMember(member) && isKind(member, 'Property', REFLECTION_KIND.property)) properties[member.name] = { type: renderType(member.type) };
    }
    interfaces[reflection.name] = { properties };
  }

  // 只读取根 children，避免把函数签名和对象字面量中的内部 reflection 误认为公开导出。
  const reflections = new Map(findReflections(document, (reflection) => typeof reflection.id === 'number').map((reflection) => [reflection.id, reflection]));
  const context = { reflections };
  const apiCatalog = (document.children ?? [])
    .filter((reflection) => TYPE_KINDS.includes(reflection.kind) || ['Class', 'Interface', 'Type alias', 'TypeAlias'].includes(reflection.kindString))
    .map((reflection) => catalogEntry(reflection, context))
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  const publicTypeAnchors = Object.fromEntries(apiCatalog.map((entry) => [entry.name, entry.anchor]));
  const apiRuntimeExports = (document.children ?? [])
    .filter(
      (reflection) => [REFLECTION_KIND.variable, REFLECTION_KIND.function].includes(reflection.kind) || ['Variable', 'Function'].includes(reflection.kindString)
    )
    .map(runtimeExportModel)
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

  return { classes, interfaces, apiCatalog, apiRuntimeExports, publicTypeAnchors };
}

async function generate() {
  const input = resolve(process.env.TYPEDOC_JSON ?? '.cache/typedoc.json');
  const output = resolve(process.env.API_DOC_OUTPUT ?? 'website/src/generated/api.ts');
  const document = JSON.parse(await readFile(input, 'utf8'));
  const { classes, interfaces, apiCatalog, apiRuntimeExports, publicTypeAnchors } = extractApiModel(document);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(
    output,
    `// Generated by scripts/docs/api-docs.mjs. Do not edit.\nexport const generatedApi = ${JSON.stringify({ classes, interfaces }, null, 2)} as const;\n\nexport const apiCatalog = ${JSON.stringify(apiCatalog, null, 2)} as const;\n\nexport const apiRuntimeExports = ${JSON.stringify(apiRuntimeExports, null, 2)} as const;\n\nexport const publicTypeAnchors = ${JSON.stringify(publicTypeAnchors, null, 2)} as const;\n`,
    'utf8'
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) generate();

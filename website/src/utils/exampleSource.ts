/** 从运行示例的原始源码中截取带名称的 region，保证核心代码与实际示例同源。 */
export function extractExampleSnippet(source: string, region: string): string {
  const startMarker = `// #region ${region}`;
  const endMarker = `// #endregion ${region}`;
  const markerStart = source.indexOf(startMarker);
  if (markerStart < 0) throw new Error(`示例源码缺少 region 起始标记：${region}`);

  const contentStart = source.indexOf('\n', markerStart);
  if (contentStart < 0) throw new Error(`示例源码 region 没有正文：${region}`);
  const contentEnd = source.indexOf(endMarker, contentStart + 1);
  if (contentEnd < 0) throw new Error(`示例源码缺少 region 结束标记：${region}`);

  const snippet = source.slice(contentStart + 1, contentEnd).trim();
  if (snippet.length === 0) throw new Error(`示例源码 region 不能为空：${region}`);
  return snippet;
}

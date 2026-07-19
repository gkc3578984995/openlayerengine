/** 将标题文本转换为可读、可复现的页内锚点。 */
export const normalizeTocLabel = (text: string): string => text.replace(/\s+/g, ' ').trim();

export const createStableHeadingId = (label: string, usedIds: Set<string>): string => {
  const normalized = normalizeTocLabel(label)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  const base = normalized || 'section';
  let candidate = base;
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate);
  return candidate;
};

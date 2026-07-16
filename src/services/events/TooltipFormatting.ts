import type { TooltipLine, TooltipSegment, TooltipSegmentTone } from '../../core/ports/TooltipPort.js';

/** 标准快捷键标记；业务能力仍由 Session 决定，本工具只添加显示语义。 */
const shortcutPattern = /Ctrl\+[A-Z]|Shift|Alt|Delete|Esc|\s*\|\s*/g;

/** 将 Session 已生成的纯文本行转换为安全、可分色的 Tooltip 行。 */
export function formatTooltipLines(lines: readonly string[], mutedShortcuts: readonly string[] = []): readonly TooltipLine[] {
  return Object.freeze(lines.map((line) => formatTooltipLine(line, mutedShortcuts)));
}

/** 保留 Tooltip 行的可见纯文本，供日志、测试和无 DOM 环境使用。 */
export function tooltipLineText(line: TooltipLine): string {
  return typeof line === 'string' ? line : line.map(({ text }) => text).join('');
}

/** 为一行中的标准快捷键和分隔符添加语义色调。 */
function formatTooltipLine(line: string, mutedShortcuts: readonly string[]): TooltipLine {
  if (line.startsWith('Ctrl+Z')) return Object.freeze([segment(line, 'undo')]);
  if (line.startsWith('Ctrl+Y')) return Object.freeze([segment(line, 'redo')]);
  const segments: TooltipSegment[] = [];
  let offset = 0;
  for (const match of line.matchAll(shortcutPattern)) {
    const start = match.index;
    const text = match[0];
    if (start > offset) segments.push(segment(line.slice(offset, start)));
    segments.push(segment(text, toneFor(text.trim(), mutedShortcuts)));
    offset = start + text.length;
  }
  if (segments.length === 0) return line;
  if (offset < line.length) segments.push(segment(line.slice(offset)));
  return Object.freeze(segments);
}

/** 创建不可变 Tooltip 文本片段。 */
function segment(text: string, tone?: TooltipSegmentTone): TooltipSegment {
  return Object.freeze({ text, ...(tone === undefined ? {} : { tone }) });
}

/** 将标准按键映射到旧版延续下来的颜色语义。 */
function toneFor(value: string, mutedShortcuts: readonly string[]): TooltipSegmentTone {
  if (mutedShortcuts.includes(value)) return 'muted';
  if (value === 'Ctrl+Z') return 'undo';
  if (value === 'Ctrl+Y') return 'redo';
  if (value === 'Delete') return 'danger';
  if (value === 'Esc') return 'exit';
  if (value === '|') return 'muted';
  return 'shortcut';
}

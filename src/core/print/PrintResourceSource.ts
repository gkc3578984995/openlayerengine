import { PrintError } from '../errors.js';

const fallbackBase = 'https://print-resource.invalid';
const maximumSourceIdLength = 256;

export interface PrintResourceDescriptor {
  readonly layerId: string;
  readonly resourceType: 'tile' | 'image' | 'icon';
  readonly sourceId: string;
}

export function createCorsTaintedCanvasError(cause: unknown, descriptors: readonly Readonly<PrintResourceDescriptor>[]): PrintError {
  const candidates = Object.freeze(
    descriptors.map(({ layerId, resourceType, sourceId }) => Object.freeze({ layerId, resourceType, sourceId: sanitizePrintSourceId(sourceId) }))
  );
  const primary = candidates[0] ?? Object.freeze({ layerId: 'unknown', resourceType: 'image' as const, sourceId: 'unknown' });
  return new PrintError('cors-tainted-canvas', '地图资源的跨域策略阻止导出，请为瓦片、图片和图标配置 CORS。', {
    cause,
    details: Object.freeze({ ...primary, candidates })
  });
}

/** 将资源来源压缩为可公开记录且不含凭据、查询参数或片段的稳定标识。 */
export function sanitizePrintSourceId(input: string): string {
  const value = input.trim();
  if (value.length === 0) return 'unknown';
  if (/^data:/iu.test(value)) {
    const mediaType = value.match(/^data:([^;,\s]+)/iu)?.[1]?.toLowerCase();
    return mediaType === undefined ? 'data:[redacted]' : `data:${mediaType}`;
  }
  if (/^blob:/iu.test(value)) return sanitizeBlobSource(value);

  try {
    const absolute = /^[a-z][a-z\d+.-]*:\/\//iu.test(value);
    const parsed = new URL(value, fallbackBase);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    const sanitized = absolute ? parsed.toString() : `${parsed.pathname}`;
    return truncateSourceId(sanitized.length === 0 ? 'unknown' : sanitized);
  } catch {
    const withoutSecrets = value
      .replace(/^([a-z][a-z\d+.-]*:\/\/)[^/@\s]+@/iu, '$1')
      .split(/[?#]/u, 1)[0]
      ?.trim();
    return truncateSourceId(withoutSecrets === undefined || withoutSecrets.length === 0 ? 'unknown' : withoutSecrets);
  }
}

function sanitizeBlobSource(value: string): string {
  try {
    const parsed = new URL(value.slice(5));
    return truncateSourceId(`blob:${parsed.protocol}//${parsed.host}/[redacted]`);
  } catch {
    return 'blob:[redacted]';
  }
}

function truncateSourceId(value: string): string {
  return value.length <= maximumSourceIdLength ? value : `${value.slice(0, maximumSourceIdLength - 1)}…`;
}

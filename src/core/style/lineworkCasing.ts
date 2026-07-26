import type { Color } from '../common/types.js';
import type { LineworkSpec, PathTrackSpec } from './types.js';

/**
 * 根据前景轨道的完整视觉包络解析 casing paint。
 *
 * 返回值只服务于编译、命中与视觉范围计算，不会写回 `LineworkSpec.tracks`。
 */
export function deriveLineworkCasingTrack(spec: Pick<LineworkSpec, 'tracks' | 'casing' | 'contour'>): PathTrackSpec | undefined {
  const casing = spec.casing;
  if (casing === undefined || spec.tracks.length === 0) return undefined;

  let minimumEdge = Number.POSITIVE_INFINITY;
  let maximumEdge = Number.NEGATIVE_INFINITY;
  for (const track of spec.tracks) {
    const width = track.stroke.width ?? 1;
    minimumEdge = Math.min(minimumEdge, track.offset - width / 2);
    maximumEdge = Math.max(maximumEdge, track.offset + width / 2);
  }

  const centerOffset = (minimumEdge + maximumEdge) / 2;
  const closed = spec.contour?.kind === 'closed';
  let offset: number;
  let width: number;
  if (casing.type === 'center') {
    offset = centerOffset;
    width = maximumEdge - minimumEdge + casing.width * 2;
  } else {
    const positiveSide = closed ? casing.type === 'outer' : casing.type === 'inner';
    offset = positiveSide ? maximumEdge + casing.width / 2 : minimumEdge - casing.width / 2;
    width = casing.width;
  }

  return {
    offset,
    stroke: {
      color: copyColor(casing.color),
      width,
      lineJoin: 'round'
    }
  };
}

/** revision 级生成先画 casing、后画逻辑前景轨道的 paint 列表。 */
export function deriveLineworkPaintTracks(spec: Pick<LineworkSpec, 'tracks' | 'casing' | 'contour'>): readonly PathTrackSpec[] {
  const casing = deriveLineworkCasingTrack(spec);
  return casing === undefined ? spec.tracks : [casing, ...spec.tracks];
}

/** 单轨端帽跟随轨道 offset；多轨端帽仍锚定逻辑路径端点。 */
export function lineworkCapTrackOffset(spec: Pick<LineworkSpec, 'tracks'>): number {
  return spec.tracks.length === 1 ? (spec.tracks[0]?.offset ?? 0) : 0;
}

function copyColor(color: Color): Color {
  return typeof color === 'string' ? color : ([...color] as Color);
}

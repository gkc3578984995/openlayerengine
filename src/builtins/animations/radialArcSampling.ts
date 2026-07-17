const radialArcScreenErrorCssPx = 0.75;
const radialArcMinSegmentCount = 2;
const radialArcMaxSegmentCount = 512;

/**
 * 复用径向弧线的采样预算。同一 resolution 与外半径桶内保持固定拓扑，桶边界使用保守值保证屏幕误差。
 */
export class RadialArcSamplingCache {
  #resolutionBucketExponent = Number.NaN;
  #radiusBucketExponent = Number.NaN;
  #arcAngleRad = Number.NaN;
  #coordinateDimension = 0;
  #segmentCount = radialArcMinSegmentCount;

  get segmentCount(): number {
    return this.#segmentCount;
  }

  update(radius: number, arcAngleRad: number, resolution: number, coordinateDimension: number): boolean {
    const resolutionBucketExponent = Math.floor(Math.log2(normalizePositive(resolution)));
    const radiusBucketExponent = Math.ceil(Math.log2(normalizePositive(radius)));
    if (
      resolutionBucketExponent === this.#resolutionBucketExponent &&
      radiusBucketExponent === this.#radiusBucketExponent &&
      arcAngleRad === this.#arcAngleRad &&
      coordinateDimension === this.#coordinateDimension
    ) {
      return false;
    }

    this.#resolutionBucketExponent = resolutionBucketExponent;
    this.#radiusBucketExponent = radiusBucketExponent;
    this.#arcAngleRad = arcAngleRad;
    this.#coordinateDimension = coordinateDimension;
    this.#segmentCount = segmentCountForBuckets(radiusBucketExponent, resolutionBucketExponent, arcAngleRad);
    return true;
  }
}

function segmentCountForBuckets(radiusBucketExponent: number, resolutionBucketExponent: number, arcAngleRad: number): number {
  const screenRadiusExponent = radiusBucketExponent - resolutionBucketExponent;
  if (screenRadiusExponent > 1023) return radialArcMaxSegmentCount;

  const screenRadiusCssPx = 2 ** screenRadiusExponent;
  if (!Number.isFinite(screenRadiusCssPx) || screenRadiusCssPx <= 0) return radialArcMinSegmentCount;
  const cosine = Math.max(0, 1 - radialArcScreenErrorCssPx / screenRadiusCssPx);
  const maxSegmentAngleRad = 2 * Math.acos(cosine);
  if (!Number.isFinite(maxSegmentAngleRad) || maxSegmentAngleRad <= Number.EPSILON) return radialArcMaxSegmentCount;

  const segmentCount = Math.ceil(Math.max(0, arcAngleRad) / maxSegmentAngleRad);
  return Math.max(radialArcMinSegmentCount, Math.min(radialArcMaxSegmentCount, segmentCount));
}

function normalizePositive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

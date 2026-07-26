/** 固定打印页的物理尺寸、字体和配色。所有长度单位均为毫米。 */
export const printPageTokens = Object.freeze({
  colors: Object.freeze({
    paper: '#ffffff',
    ink: '#111111',
    mutedInk: '#4b5563',
    legendBackground: 'rgba(255, 255, 255, 0.9)',
    legendBorder: '#6b7280'
  }),
  fonts: Object.freeze({
    family: '"Noto Sans SC", "Microsoft YaHei", sans-serif',
    headerSizeMm: 3.2,
    titleSizeMm: 6,
    subtitleSizeMm: 3.8,
    legendTitleSizeMm: 3.2,
    legendGroupSizeMm: 2.9,
    legendItemSizeMm: 2.7,
    footerSizeMm: 3
  }),
  border: Object.freeze({
    outerWidthMm: 0.6,
    innerWidthMm: 0.2,
    gapMm: 1
  }),
  layout: Object.freeze({
    headerBandHeightMm: 8,
    titleBandHeightMm: 16,
    titleGapMm: 2,
    frameReserveMm: 2,
    mapFooterGapMm: 2,
    footerBandHeightMm: 14
  }),
  header: Object.freeze({
    pageInsetMm: 4,
    titleGapMm: 2,
    metadataGapMm: 2
  }),
  legend: Object.freeze({
    mapInsetMm: 3,
    paddingMm: 2,
    borderWidthMm: 0.2,
    rowGapMm: 1.4,
    groupGapMm: 1.8,
    symbolWidthMm: 8,
    symbolHeightMm: 4,
    symbolTextGapMm: 2,
    maxWidthRatio: 0.42,
    maxHeightRatio: 0.55
  }),
  footer: Object.freeze({
    pageInsetMm: 4,
    scaleBarTargetWidthMm: 36,
    scaleBarHeightMm: 2.4,
    scaleBarSegments: 4,
    northArrowSizeMm: 10,
    northArrowLabelGapMm: 1
  })
});

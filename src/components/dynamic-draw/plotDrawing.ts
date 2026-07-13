import { cloneDeep } from 'lodash';
import type Earth from '../../Earth.js';
import { EPlotType } from '../../enum/index.js';
import { DrawType, IDrawEvent, IDrawPolygon, IPlotAttackArrow } from '../../interface/index.js';
import type { Coordinate } from 'ol/coordinate.js';
import type Feature from 'ol/Feature.js';
import type Geometry from 'ol/geom/Geometry.js';
import PlotDraw from '../../extends/plot/plotDraw.js';
import AttackArrow from '../../extends/plot/geom/AttackArrow.js';
import TailedAttackArrow from '../../extends/plot/geom/TailedAttackArrow.js';
import FineArrow from '../../extends/plot/geom/FineArrow.js';
import TailedSquadCombat from '../../extends/plot/geom/TailedSquadCombatArrow.js';
import AssaultDirectionArrow from '../../extends/plot/geom/AssaultDirectionArrow.js';
import DoubleArrow from '../../extends/plot/geom/DoubleArrow.js';
import Circle from '../../extends/plot/circle/Circle.js';
import Ellipse from '../../extends/plot/circle/Ellipse.js';
import AssemblePolygon from '../../extends/plot/polygon/AssemblePolygon.js';
import ClosedCurvePolygon from '../../extends/plot/polygon/ClosedCurvePolygon.js';
import SectorPolygon from '../../extends/plot/polygon/SectorPolygon.js';
import LunePolygon from '../../extends/plot/polygon/LunePolygon.js';
import RectAnglePolygon from '../../extends/plot/polygon/RectAnglePolygon.js';
import TrianglePolygon from '../../extends/plot/polygon/TrianglePolygon.js';
import EquilateralTrianglePolygon from '../../extends/plot/polygon/EquilateralTrianglePolygon.js';
import LunePolyline from '../../extends/plot/polyline/LunePolyline.js';
import CurvePolyline from '../../extends/plot/polyline/CurvePolyline.js';

type PlotGeometry = Geometry & { getCoordinates(): Coordinate[] | Coordinate[][] };
type PlotGeometryConstructor = new (coordinates: Coordinate[], points: Coordinate[], params: Record<string, unknown>) => PlotGeometry;
export type PlotTargetLayer = {
  add(param: Record<string, unknown>): Feature<Geometry>;
};

export type PlotDrawingKind =
  | 'circle'
  | 'ellipse'
  | 'attackArrow'
  | 'tailedAttackArrow'
  | 'fineArrow'
  | 'tailedSquadCombatArrow'
  | 'assaultDirectionArrow'
  | 'doubleArrow'
  | 'rectAnglePolygon'
  | 'trianglePolygon'
  | 'equilateralTrianglePolygon'
  | 'assemblePolygon'
  | 'closedCurvePolygon'
  | 'sectorPolygon'
  | 'lunePolygon'
  | 'lunePolyline'
  | 'curvePolyline';

interface PlotDrawingConfig {
  plotType: EPlotType;
  geometry: PlotGeometryConstructor;
  layerType: 'Polygon' | 'LineString';
  isValid(points: Coordinate[]): boolean;
  includeCircleMetadata?: boolean;
}

const exactly = (count: number) => (points: Coordinate[]) => points.length === count;
const moreThan = (count: number) => (points: Coordinate[]) => points.length > count;

const plotDrawingConfigs: Record<PlotDrawingKind, PlotDrawingConfig> = {
  circle: { plotType: EPlotType.Circle, geometry: Circle, layerType: 'Polygon', isValid: exactly(2), includeCircleMetadata: true },
  ellipse: { plotType: EPlotType.Ellipse, geometry: Ellipse, layerType: 'Polygon', isValid: exactly(2) },
  attackArrow: { plotType: EPlotType.AttackArrow, geometry: AttackArrow, layerType: 'Polygon', isValid: moreThan(2) },
  tailedAttackArrow: { plotType: EPlotType.TailedAttackArrow, geometry: TailedAttackArrow, layerType: 'Polygon', isValid: moreThan(2) },
  fineArrow: { plotType: EPlotType.FineArrow, geometry: FineArrow, layerType: 'Polygon', isValid: exactly(2) },
  tailedSquadCombatArrow: {
    plotType: EPlotType.TailedSquadCombatArrow,
    geometry: TailedSquadCombat,
    layerType: 'Polygon',
    isValid: exactly(2)
  },
  assaultDirectionArrow: {
    plotType: EPlotType.AssaultDirectionArrow,
    geometry: AssaultDirectionArrow,
    layerType: 'Polygon',
    isValid: exactly(2)
  },
  doubleArrow: { plotType: EPlotType.DoubleArrow, geometry: DoubleArrow, layerType: 'Polygon', isValid: exactly(5) },
  rectAnglePolygon: { plotType: EPlotType.RectAnglePolygon, geometry: RectAnglePolygon, layerType: 'Polygon', isValid: exactly(2) },
  trianglePolygon: { plotType: EPlotType.TrianglePolygon, geometry: TrianglePolygon, layerType: 'Polygon', isValid: exactly(3) },
  equilateralTrianglePolygon: {
    plotType: EPlotType.EquilateralTrianglePolygon,
    geometry: EquilateralTrianglePolygon,
    layerType: 'Polygon',
    isValid: exactly(2)
  },
  assemblePolygon: { plotType: EPlotType.AssemblePolygon, geometry: AssemblePolygon, layerType: 'Polygon', isValid: exactly(3) },
  closedCurvePolygon: {
    plotType: EPlotType.ClosedCurvePolygon,
    geometry: ClosedCurvePolygon,
    layerType: 'Polygon',
    isValid: moreThan(2)
  },
  sectorPolygon: { plotType: EPlotType.SectorPolygon, geometry: SectorPolygon, layerType: 'Polygon', isValid: exactly(3) },
  lunePolygon: { plotType: EPlotType.LunePolygon, geometry: LunePolygon, layerType: 'Polygon', isValid: exactly(3) },
  lunePolyline: { plotType: EPlotType.LuneLine, geometry: LunePolyline, layerType: 'LineString', isValid: exactly(3) },
  curvePolyline: { plotType: EPlotType.CurvePolyline, geometry: CurvePolyline, layerType: 'LineString', isValid: moreThan(1) }
};

interface StartPlotDrawingOptions {
  earth: Earth;
  kind: PlotDrawingKind;
  param?: IDrawPolygon;
  callbackContext: unknown;
  getLayer(type: 'Polygon' | 'LineString'): PlotTargetLayer | undefined;
}

export function startPlotDrawing(options: StartPlotDrawingOptions): PlotDraw {
  const { earth, kind, param, callbackContext, getLayer } = options;
  const config = plotDrawingConfigs[kind];
  const plot = new PlotDraw(earth);
  plot.init(config.plotType);

  plot.on<IPlotAttackArrow>('start', (event) => {
    param?.callback?.call(callbackContext, { type: DrawType.Drawstart, eventPosition: event.point });
  });
  plot.on<IPlotAttackArrow>('add-point', (event) => {
    param?.callback?.call(callbackContext, { type: DrawType.DrawingClick, eventPosition: event.point });
  });
  plot.on<IPlotAttackArrow>('moving', (event) => {
    param?.callback?.call(callbackContext, { type: DrawType.Drawing, eventPosition: event.tempPoint || event.point });
  });
  plot.on<IPlotAttackArrow>('end', (event) => {
    const points = event.points || [];
    if (config.isValid(points)) {
      const response: IDrawEvent = {
        type: DrawType.Drawend,
        eventPosition: points[points.length - 1]
      };
      if (param?.keepGraphics === true || param?.keepGraphics === undefined) {
        const geometry = new config.geometry([], points, {});
        const coordinates = geometry.getCoordinates();
        const layer = getLayer(config.layerType);
        const feature = layer?.add({
          positions: coordinates,
          stroke: { color: param?.strokeColor || '#ffcc33', width: param?.strokeWidth || 2 },
          ...(config.layerType === 'Polygon' ? { fill: { color: param?.fillColor || 'rgba(255,255,255,0.2)' } } : {})
        });
        feature?.set('param', {
          positions: coordinates,
          plotType: config.plotType,
          plotPoints: points,
          ...(config.includeCircleMetadata ? { center: event.center || null, radius: event.radius || null } : {})
        });
        response.feature = feature;
      }
      response.featurePosition = cloneDeep(
        config.layerType === 'Polygon' ? (event.coordinates as Coordinate[][] | undefined)?.[0] : (event.coordinates as Coordinate[] | undefined)
      );
      response.ctlPoints = points;
      if (config.includeCircleMetadata) {
        response.center = event.center;
        response.radius = event.radius;
      }
      param?.callback?.call(callbackContext, response);
    } else {
      param?.callback?.call(callbackContext, {
        type: DrawType.Drawexit,
        eventPosition: points.length ? points[points.length - 1] : []
      });
    }
    plot.destroy();
  });

  return plot;
}

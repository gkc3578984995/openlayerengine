import Earth from '../Earth.js';
import Feature from 'ol/Feature.js';
import Map from 'ol/Map.js';
import Geometry from 'ol/geom/Geometry.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import Draw from 'ol/interaction/Draw.js';
import VectorSource from 'ol/source/Vector.js';
import Fill from 'ol/style/Fill.js';
import RegularShape from 'ol/style/RegularShape.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import Text from 'ol/style/Text.js';
import CircleStyle from 'ol/style/Circle.js';
import { getLength, getArea } from 'ol/sphere.js';
import { Coordinate } from 'ol/coordinate.js';
import { FeatureLike } from 'ol/Feature.js';
import RenderFeature from 'ol/render/Feature.js';
import VectorLayer from 'ol/layer/Vector.js';
import { IMeasure, IMeasureEvent } from '../interface/index.js';
import { PointLayer } from '../base/index.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';

function isPrimaryMouseButton(originalEvent: Event): boolean {
  if (typeof PointerEvent !== 'undefined' && originalEvent instanceof PointerEvent) return originalEvent.button === 0;
  if (typeof MouseEvent !== 'undefined' && originalEvent instanceof MouseEvent) return originalEvent.button === 0;
  return false;
}

/**
 * 测量类
 */
export default class Measure {
  /**
   * earth实例
   */
  private earth: Earth;
  /**
   * map实例
   */
  private map: Map;
  /**
   * 绘制工具
   */
  private draw?: Draw;
  /** 当前测量会话的右键退出监听释放器 */
  private measureExitDisposer?: () => void;
  /** 中心测距使用的左键抬起监听释放器 */
  private centerLeftUpDisposer?: () => void;
  /** 中心测距延迟注册监听的定时器 */
  private centerLeftUpTimer?: ReturnType<typeof setTimeout>;
  /**
   * 图层
   */
  private layer: VectorLayer<VectorSource<Feature<Geometry>>>;
  /**
   * 图层数据源
   */
  private source: VectorSource<Feature<Geometry>>;
  /**
   * tip样式
   */
  private tipStyle: Style = new Style({
    text: new Text({
      font: '12px Calibri,sans-serif',
      fill: new Fill({
        color: '#ffcc33'
      }),
      backgroundFill: new Fill({
        color: 'rgba(0, 0, 0, 0.4)'
      }),
      padding: [5, 5, 4, 5],
      textAlign: 'left',
      offsetX: 15
    })
  });
  /**
   * 公共样式
   */
  private style!: Style;
  /**
   * label样式
   */
  private labelStyle!: Style;
  /**
   * 片段样式
   */
  private segmentStyle!: Style;
  /**
   * 片段样式数组
   */
  private segmentStyles: Style[] = [];
  /**
   * 定位点图层
   */
  private pointLayer: PointLayer<unknown>;
  private measureData: IMeasureEvent = {
    data: []
  };
  /**
   * 分段标签显隐
   */
  private segments: boolean = false;
  /**
   * 总距标签显隐
   */
  private labels: boolean = false;
  /**
   *
   * @param earth
   */
  constructor(earth: Earth) {
    this.earth = earth;
    this.map = earth.map;
    this.source = new VectorSource();
    this.layer = new VectorLayer({
      source: this.source,
      style: (feature) => {
        return this.styleFunction(feature);
      }
    });
    this.map.addLayer(this.layer);
    this.pointLayer = new PointLayer(this.earth);
  }
  /** 释放当前测量会话登记的监听和延迟任务 */
  private clearMeasureListeners() {
    this.measureExitDisposer?.();
    this.centerLeftUpDisposer?.();
    if (this.centerLeftUpTimer !== undefined) {
      clearTimeout(this.centerLeftUpTimer);
    }
    this.measureExitDisposer = undefined;
    this.centerLeftUpDisposer = undefined;
    this.centerLeftUpTimer = undefined;
  }
  /** 开启新测量会话前，清理上一个会话的交互和监听 */
  private beginMeasureSession() {
    this.clearMeasureListeners();
    if (this.draw) {
      this.map.removeInteraction(this.draw);
      this.draw = undefined;
    }
  }
  private formatLength(line: LineString): number {
    const length = getLength(line);
    const output = Math.round((length / 1000) * 100) / 100;
    return output;
  }
  private formatArea(polygon: Polygon): number {
    const area = getArea(polygon);
    const output = Math.round((area / 1000000) * 100) / 100;
    return output;
  }
  private styleFunction(feature: FeatureLike, param?: IMeasure, drawType?: string, tip?: string): Style[] {
    if (tip) {
      this.style = new Style({
        fill: new Fill({
          color: '#ffffff70'
        }),
        stroke: new Stroke({
          color: param?.lineColor || '#ffcc33',
          lineDash: [10, 10],
          width: param?.lineWidth || 2
        }),
        image: new CircleStyle({
          radius: param?.pointSzie || 5,
          stroke: new Stroke({
            color: '#fff'
          }),
          fill: new Fill({
            color: '#ffcc33'
          })
        })
      });
    } else {
      this.style.getStroke()?.setLineDash(null);
    }
    const styles = [this.style];
    const geometry = feature.getGeometry();
    const type = geometry?.getType();
    let point: Point | undefined, label: String | any, line: LineString | undefined, unit: string | any;
    if (!drawType || drawType === type) {
      if (type === 'Polygon') {
        const polygon = <Polygon>geometry;
        point = polygon.getInteriorPoint();
        label = this.formatArea(polygon);
        line = new LineString(polygon.getCoordinates()[0]);
        unit = ' km\xB2';
      } else if (type === 'LineString') {
        const lineString = <LineString>geometry;
        point = new Point(lineString.getLastCoordinate());
        label = this.formatLength(lineString);
        line = lineString;
        unit = ' km';
      }
    }

    if (this.segments && line) {
      this.segmentStyle = new Style({
        text: new Text({
          font: '12px Calibri,sans-serif',
          fill: new Fill({
            color: param?.textColor || '#ffcc33'
          }),
          backgroundFill: new Fill({
            color: param?.textBackgroundColor || 'rgba(0, 0, 0, 0.4)'
          }),
          padding: [4, 4, 4, 4],
          textBaseline: 'bottom',
          offsetY: -12
        }),
        image: new RegularShape({
          radius: 6,
          points: 3,
          angle: Math.PI,
          displacement: [0, 8],
          fill: new Fill({
            color: 'rgba(0, 0, 0, 0.4)'
          })
        })
      });
      this.segmentStyles.push(this.segmentStyle);
      let count = 0;
      line.forEachSegment((a: Coordinate, b: Coordinate) => {
        const segment = new LineString([a, b]);
        const label = this.formatLength(segment);
        if (this.segmentStyles.length - 1 < count) {
          this.segmentStyles.push(this.segmentStyle.clone());
        }
        const segmentPoint = new Point(segment.getCoordinateAt(0.5));
        this.segmentStyles[count].setGeometry(segmentPoint);
        this.segmentStyles[count].getText()?.setText(label + ' km');
        styles.push(this.segmentStyles[count]);
        count++;
      });
    }
    if (this.labels && label && point) {
      this.labelStyle = new Style({
        text: new Text({
          font: '12px Calibri,sans-serif',
          fill: new Fill({
            color: param?.textColor || '#ffcc33'
          }),
          backgroundFill: new Fill({
            color: param?.textBackgroundColor || 'rgba(0, 0, 0, 0.4)'
          }),
          padding: [4, 4, 4, 4],
          textBaseline: 'bottom',
          offsetY: -12
        }),
        image: new RegularShape({
          radius: 6,
          points: 3,
          angle: Math.PI,
          displacement: [0, 8],
          fill: new Fill({
            color: 'rgba(0, 0, 0, 0.4)'
          })
        })
      });
      this.labelStyle.setGeometry(point);
      this.labelStyle.getText()?.setText('合计：' + label + unit);
      styles.push(this.labelStyle);
    }
    if (tip && type === 'Point') {
      this.tipStyle.getText()?.setText(tip);
      styles.push(this.tipStyle);
    }
    return styles;
  }
  /**
   * 画线测量
   * @param param 参数，详见{@link IMeasure}
   */
  private lineMeasure(param: IMeasure) {
    this.beginMeasureSession();
    this.earth.setMouseStyle('pointer');
    const activeTip = '单击继续绘制线 右击退出测量';
    const idleTip = '单击开始测量';
    let tip = idleTip;
    this.draw = new Draw({
      source: this.source,
      type: 'LineString',
      style: (feature) => {
        return this.styleFunction(feature, param, 'line', tip);
      },
      condition: (e) => {
        if (isPrimaryMouseButton(e.originalEvent)) {
          return true;
        } else {
          return false;
        }
      },
      finishCondition: (e) => {
        return false;
      }
    });
    this.draw.on('drawstart', () => {
      tip = activeTip;
    });
    this.draw.on('drawend', (e) => {
      tip = idleTip;
      const line = <Feature<LineString>>e.feature;
      line
        .getGeometry()
        ?.getCoordinates()
        .map((item) => {
          if (param?.pointShow == undefined || param.pointShow == true) {
            this.pointLayer.add({
              center: item,
              fill: {
                color: param?.pointColor || '#fff'
              },
              size: param?.pointSzie || 3
            });
          }
        });
      let totalDistance = 0;
      line.getGeometry()?.forEachSegment((a: Coordinate, b: Coordinate) => {
        const segment = new LineString([a, b]);
        const distance = this.formatLength(segment);
        this.measureData.data.push({
          startP: toLonLat(a),
          endP: toLonLat(b),
          distance: distance
        });
        totalDistance += distance;
      });
      this.measureData.totalDistance = totalDistance;
      param.callback?.call(this, this.measureData);
    });
    this.measureExitDisposer = this.earth.useGlobalEvent().addCancelableMouseOnceRightClickEventByGlobal(() => {
      this.clearMeasureListeners();
      if (this.draw) {
        this.draw.finishDrawing();
        this.map.removeInteraction(this.draw);
      }
      this.earth.setMouseStyle('auto');
    });
    this.map.addInteraction(this.draw);
  }
  /**
   * 画线测量-分段方距
   * @param param 参数，详见{@link IMeasure}
   */
  lineSegmentation(param: IMeasure) {
    this.segments = true;
    this.labels = false;
    this.lineMeasure(param);
  }
  /**
   * 画线测量-首点方距
   * @param param 参数，详见{@link IMeasure}
   */
  lineFirst(param: IMeasure) {
    this.segments = false;
    this.labels = true;
    this.lineMeasure(param);
  }
  /**
   * 画线测量-中心方距
   * @param param 参数，详见{@link IMeasure}
   */
  lineCenter(param: IMeasure) {
    this.beginMeasureSession();
    this.segments = true;
    this.labels = false;
    this.earth.setMouseStyle('pointer');
    const activeTip = '单击继续绘制线 右击退出测量';
    const idleTip = '单击开始测量';
    let tip = idleTip;
    this.draw = new Draw({
      source: this.source,
      type: 'LineString',
      style: (feature) => {
        return this.styleFunction(feature, param, 'line', tip);
      },
      condition: (e) => {
        if (isPrimaryMouseButton(e.originalEvent)) {
          return true;
        } else {
          return false;
        }
      },
      finishCondition: (e) => {
        return false;
      }
    });
    this.draw.on('drawstart', (e) => {
      const line = <LineString>e.feature.getGeometry();
      tip = activeTip;
      if (!this.centerLeftUpDisposer && this.centerLeftUpTimer === undefined) {
        this.centerLeftUpTimer = setTimeout(() => {
          this.centerLeftUpTimer = undefined;
          this.centerLeftUpDisposer = this.earth.useGlobalEvent().addMouseLeftUpEventByGlobal(() => {
            if (this.draw) {
              this.draw.finishDrawing();
              this.draw.appendCoordinates([line.getCoordinates()[0]]);
            }
          });
          this.pointLayer.add({
            center: line.getCoordinates()[0],
            fill: {
              color: param?.pointColor || '#fff'
            },
            size: param?.pointSzie || 3
          });
        }, 50);
      }
    });
    this.draw.on('drawend', (e) => {
      tip = idleTip;
      const line = <Feature<LineString>>e.feature;
      const positions = <Coordinate[]>line.getGeometry()?.getCoordinates();
      if (positions.length < 2) return;
      if (param?.pointShow == undefined || param.pointShow == true) {
        this.pointLayer.add({
          center: positions[1],
          fill: {
            color: param?.pointColor || '#fff'
          },
          size: param?.pointSzie || 3
        });
      }
      line.getGeometry()?.forEachSegment((a: Coordinate, b: Coordinate) => {
        const segment = new LineString([a, b]);
        const distance = this.formatLength(segment);
        this.measureData.data.push({
          startP: toLonLat(a),
          endP: toLonLat(b),
          distance: distance
        });
      });
    });
    this.measureExitDisposer = this.earth.useGlobalEvent().addCancelableMouseOnceRightClickEventByGlobal(() => {
      this.clearMeasureListeners();
      if (this.draw) {
        this.draw.finishDrawing();
        this.map.removeInteraction(this.draw);
      }
      this.earth.setMouseStyle('auto');
      param.callback?.call(this, this.measureData);
    });
    this.map.addInteraction(this.draw);
  }
  /**
   * 面积测量
   * @param param 参数，详见{@link IMeasure}
   */
  polygonMeasure(param: IMeasure) {
    this.beginMeasureSession();
    this.segments = true;
    this.labels = true;
    this.earth.setMouseStyle('pointer');
    const activeTip = '单击继续绘制线 右击退出测量';
    const idleTip = '单击开始测量';
    let tip = idleTip;
    this.draw = new Draw({
      source: this.source,
      type: 'Polygon',
      style: (feature) => {
        return this.styleFunction(feature, param, 'Polygon', tip);
      },
      condition: (e) => {
        if (isPrimaryMouseButton(e.originalEvent)) {
          return true;
        } else {
          return false;
        }
      },
      finishCondition: (e) => {
        return false;
      }
    });
    this.draw.on('drawstart', (e) => {
      tip = activeTip;
    });
    this.draw.on('drawend', (e) => {
      tip = idleTip;
      const polygon = <Feature<Polygon>>e.feature;
      if (param?.pointShow == undefined || param.pointShow == true) {
        polygon
          .getGeometry()
          ?.getCoordinates()[0]
          .map((item) => {
            this.pointLayer.add({
              center: item,
              fill: {
                color: param?.pointColor || '#fff'
              },
              size: param?.pointSzie || 3
            });
            this.measureData.data.push(toLonLat(item));
          });
      }
      this.measureData.area = this.formatArea(polygon.getGeometry()!);
      param.callback?.call(this, this.measureData);
    });
    this.measureExitDisposer = this.earth.useGlobalEvent().addCancelableMouseOnceRightClickEventByGlobal(() => {
      this.clearMeasureListeners();
      if (this.draw) {
        this.draw.finishDrawing();
        this.map.removeInteraction(this.draw);
      }
      this.earth.setMouseStyle('auto');
    });
    this.map.addInteraction(this.draw);
  }
  /**
   * 清空测量
   */
  clear() {
    this.clearMeasureListeners();
    if (this.draw) {
      this.map.removeInteraction(this.draw);
      this.draw = undefined;
    }
    this.source.clear();
    this.pointLayer.remove();
    this.measureData = { data: [] };
    this.segmentStyles = [];
  }
}

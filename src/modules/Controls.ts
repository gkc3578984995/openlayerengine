import Map from 'ol/Map';
import Graticule from 'ol/layer/Graticule';
import ScaleLine from 'ol/control/ScaleLine';
import { Stroke } from 'ol/style';

/**
 * 地图控件模块：封装网格线(Graticule)与比例尺(ScaleLine)的生命周期管理。
 *
 * 从 `Earth` 中拆分而来。`Earth` 通过组合持有该实例，`earth.graticule` / `earth.scaleLine`
 * 以 getter 透传至此处的状态，保持对外可读。
 */
export default class Controls {
  /** 网格图层 */
  public graticule: Graticule | undefined;
  /** 比例尺控件 */
  public scaleLine: ScaleLine | undefined;

  constructor(private readonly map: Map) {}

  /**
   * 启用网格线
   */
  enableGraticule(): void {
    const graticule = new Graticule({
      strokeStyle: new Stroke({
        color: 'rgba(0, 0, 0, 0.3)',
        width: 1
      }),
      showLabels: true,
      wrapX: true,
      lonLabelPosition: 0.985,
      latLabelPosition: 0.985,
      properties: {
        layerType: 'graticule'
      }
    });
    graticule.setZIndex(9999);
    this.graticule = graticule;
    this.map.addLayer(graticule);
  }

  /**
   * 禁用网格线
   */
  disableGraticule(): void {
    if (this.graticule) {
      this.map.removeLayer(this.graticule);
      this.graticule = undefined;
    }
  }

  /**
   * 启用比例尺
   */
  enableScaleLine(): void {
    if (this.scaleLine) return;
    this.scaleLine = new ScaleLine({
      bar: true,
      text: true,
      minWidth: 100
    });
    this.map.addControl(this.scaleLine);
  }

  /**
   * 禁用比例尺
   */
  disableScaleLine(): void {
    if (this.scaleLine) {
      this.map.removeControl(this.scaleLine);
      this.scaleLine = undefined;
    }
  }
}

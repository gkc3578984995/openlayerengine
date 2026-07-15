import type { NativeRefRegistry } from '../adapters/openlayers/NativeRefRegistry.js';
import { InvalidArgumentError } from '../core/errors.js';
import type { ElementStyleState, NativeStyleRef } from '../core/style/types.js';
import type { StyleService as InternalStyleService } from '../services/style/StyleService.js';
import type { StyleInput, StyleService } from './styleTypes.js';

/** 原生样式注册表接受的值。 */
type NativeStyleValue = Parameters<NativeRefRegistry['registerStyle']>[0];
/** 公开样式是否属于原生样式写法的检查结果。 */
export type NativeStyleMatch = { readonly matched: false } | { readonly matched: true; readonly value: NativeStyleValue };

/** 将公开样式操作转交给内部样式服务。 */
export class StyleFacade implements StyleService {
  /** 负责修改元素样式状态的内部服务。 */
  readonly #service: InternalStyleService;
  /** 管理原生 OpenLayers 样式引用。 */
  readonly #nativeRefs: NativeRefRegistry;

  /** 保存内部样式服务和原生引用注册表。 */
  constructor(service: InternalStyleService, nativeRefs: NativeRefRegistry) {
    this.#service = service;
    this.#nativeRefs = nativeRefs;
  }

  /** 为匹配的元素设置完整样式。 */
  set(selector: Parameters<StyleService['set']>[0], style: StyleInput): void {
    let reference: NativeStyleRef | undefined;
    try {
      const changes = this.#service.setResolved(selector, () => {
        const nativeStyle = inspectStyleInput(style);
        if (!nativeStyle.matched) return style as ElementStyleState;
        reference = this.#nativeRefs.registerProvisionalStyle(nativeStyle.value);
        return reference;
      });
      if (reference === undefined) return;
      if (changes.changes.length === 0) this.#nativeRefs.discardProvisionalStyle(reference);
      else this.#nativeRefs.commitProvisionalStyle(reference);
    } catch (error) {
      if (reference !== undefined) {
        try {
          this.#nativeRefs.discardProvisionalStyle(reference);
        } catch {
          // 注册表销毁后，临时样式已经自动失效。
        }
      }
      throw error;
    }
  }

  /** 合并修改匹配元素的部分样式。 */
  patch(selector: Parameters<StyleService['patch']>[0], patch: Parameters<StyleService['patch']>[1]): void {
    this.#service.patch(selector, patch);
  }
}

/** 检查样式输入是否是仅包含 nativeStyle 的原生样式对象。 */
export function inspectStyleInput(style: StyleInput): NativeStyleMatch {
  if (style === null || typeof style !== 'object') return { matched: false };

  let keys: (string | symbol)[];
  try {
    keys = Reflect.ownKeys(style);
  } catch {
    throw new InvalidArgumentError('Style input must be an inspectable plain object');
  }
  if (!keys.includes('nativeStyle')) return { matched: false };

  try {
    const prototype = Object.getPrototypeOf(style);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new InvalidArgumentError('Native style input must be a plain object');
    }
    if (keys.length !== 1 || keys[0] !== 'nativeStyle') {
      throw new InvalidArgumentError('Native style input may contain only nativeStyle');
    }
    const descriptor = Object.getOwnPropertyDescriptor(style, 'nativeStyle');
    if (descriptor === undefined || !('value' in descriptor)) {
      throw new InvalidArgumentError('Native style input nativeStyle must be a data property');
    }
    return { matched: true, value: descriptor.value as NativeStyleValue };
  } catch (error) {
    if (error instanceof InvalidArgumentError) throw error;
    throw new InvalidArgumentError('Native style input must be an inspectable plain object');
  }
}

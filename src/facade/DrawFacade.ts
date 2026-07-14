import type { NativeRefRegistry } from '../adapters/openlayers/NativeRefRegistry.js';
import type { ElementSelector } from '../core/element/types.js';
import { InvalidArgumentError } from '../core/errors.js';
import { isNativeStyleRef, type NativeStyleRef } from '../core/style/types.js';
import type { DrawService as InternalDrawService } from '../services/draw/DrawService.js';
import type { InternalDrawOptions, InternalDrawSession } from '../services/draw/types.js';
import { elementHandleFeature, type Element } from './Element.js';
import { inspectStyleInput } from './StyleFacade.js';
import { DrawSessionFacade } from './DrawSessionFacade.js';
import { EditSessionFacade } from './EditSessionFacade.js';
import type { DrawOptions, DrawService, DrawSession, EditOptions, EditSession } from './drawTypes.js';
import type { ElementService } from './types.js';

/**
 * 将内部绘制服务映射为公开元素句柄 API，并负责原生样式引用的所有权校验。
 *
 * @internal
 */
export class DrawFacade implements DrawService {
  readonly #service: InternalDrawService;
  readonly #elements: ElementService;
  readonly #nativeRefs: NativeRefRegistry;

  /**
   * @param service 仅使用元素状态和 ID 的内部绘制服务。
   * @param elements 当前 Earth 的公开元素服务。
   * @param nativeRefs 当前 Earth 的原生对象引用注册表。
   */
  constructor(service: InternalDrawService, elements: ElementService, nativeRefs: NativeRefRegistry) {
    this.#service = service;
    this.#elements = elements;
    this.#nativeRefs = nativeRefs;
  }

  start<T>(input: DrawOptions<T>): DrawSession<T> {
    const options = inspectDrawOptions(input);
    let provisional: NativeStyleRef | undefined;
    let internal: InternalDrawSession<T> | undefined;
    try {
      if (Object.prototype.hasOwnProperty.call(options, 'style') && options.style !== undefined) {
        const nativeStyle = inspectStyleInput(options.style as NonNullable<DrawOptions<T>['style']>);
        if (nativeStyle.matched) options.style = provisional = this.#nativeRefs.registerProvisionalStyle(nativeStyle.value);
        else if (isNativeStyleRef(options.style)) void this.#nativeRefs.requireStyle(options.style);
      }
      internal = this.#service.start<T>(options as unknown as InternalDrawOptions<T>);
      if (provisional !== undefined) this.#nativeRefs.commitProvisionalStyle(provisional);
      return new DrawSessionFacade<T>(internal, this.#elements);
    } catch (error) {
      internal?.destroy();
      if (provisional !== undefined) this.#discardStyle(provisional);
      throw error;
    }
  }

  edit<T>(element: Element<T>, options?: EditOptions): EditSession<T> {
    const id = currentElementId(element, this.#elements);
    return new EditSessionFacade(this.#service.edit<T>(id, options), element, this.#elements);
  }

  query<T>(selector?: ElementSelector<T>): readonly Element<T>[] {
    return Object.freeze(
      this.#service.query<T>(selector).flatMap(({ id }) => {
        const element = this.#elements.get<T>(id);
        return element === undefined ? [] : [element];
      })
    );
  }

  clear(selector?: ElementSelector): number {
    return this.#service.clear(selector);
  }

  /**
   * 由 Earth 生命周期调用，销毁内部绘制服务。
   *
   * @internal
   */
  destroy(): void {
    this.#service.destroy();
  }

  #discardStyle(reference: NativeStyleRef): void {
    try {
      this.#nativeRefs.discardProvisionalStyle(reference);
    } catch {
      // 成功提交或注册表销毁已经终结该临时引用的所有权。
    }
  }
}

function currentElementId<T>(element: Element<T>, elements: ElementService): string {
  const feature = elementHandleFeature(element);
  if (feature === undefined) throw new InvalidArgumentError('Draw edit target must be an Element');
  const id = element.id;
  void element.state;
  const current = elements.get<T>(id);
  if (current === undefined || elementHandleFeature(current) !== feature) {
    throw new InvalidArgumentError(`Draw edit Element does not belong to this Earth: ${id}`);
  }
  return id;
}

function inspectDrawOptions(input: unknown): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new InvalidArgumentError('Draw options must be a plain object');
  try {
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) throw new InvalidArgumentError('Draw options must be a plain object');
    const options = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(input)) {
      if (typeof key !== 'string') throw new InvalidArgumentError('Draw options cannot contain symbol properties');
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError('Draw options cannot contain accessor properties');
      options[key] = descriptor.value;
    }
    return options;
  } catch (error) {
    if (error instanceof InvalidArgumentError) throw error;
    throw new InvalidArgumentError('Draw options must be inspectable');
  }
}

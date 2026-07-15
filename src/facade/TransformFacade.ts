import type { ElementSelector, ElementState } from '../core/element/types.js';
import { InvalidArgumentError } from '../core/errors.js';
import type { InternalTransformOptions, InternalTransformService } from '../services/transform/types.js';
import type { Element } from './Element.js';
import { TransformSessionFacade } from './TransformSessionFacade.js';
import type { TransformOptions, TransformService, TransformSession } from './transformTypes.js';
import type { ElementService } from './types.js';

/** 将公开变换 API 转换为内部会话调用。 */
export class TransformFacade implements TransformService {
  /** 执行实际变换工作的内部服务。 */
  readonly #service: InternalTransformService;
  /** 用于校验元素归属并提供公开句柄。 */
  readonly #elements: ElementService;

  /** 保存内部变换服务和元素服务。 */
  constructor(service: InternalTransformService, elements: ElementService) {
    this.#service = service;
    this.#elements = elements;
  }

  /** 启动等待用户选择元素的变换会话。 */
  start(options?: TransformOptions): TransformSession {
    return new TransformSessionFacade(this.#service.start(this.#mapOptions(options)), this.#elements);
  }

  /** 校验元素归属并直接启动选中状态的变换会话。 */
  select<T>(element: Element<T>, options?: TransformOptions): TransformSession<T> {
    this.#assertOwned(element);
    return new TransformSessionFacade<T>(this.#service.select<T>(element.id, this.#mapOptions(options)), this.#elements);
  }

  /** 校验并转换公开变换参数。 */
  #mapOptions(options: TransformOptions | undefined): InternalTransformOptions | undefined {
    if (options === undefined) return undefined;
    const record = inspectOptions(options);
    const { predicate, toolbar, selector, ...rest } = record;
    const mappedSelector = this.#selector(selector, predicate);
    return {
      ...rest,
      ...(mappedSelector === undefined ? {} : { selector: mappedSelector }),
      ...(toolbar === undefined ? {} : { toolbar: toolbar === true ? {} : toolbar })
    };
  }

  /** 合并状态选择器和基于公开元素的筛选函数。 */
  #selector(selector: ElementSelector | undefined, predicate: TransformOptions['predicate']): ElementSelector | undefined {
    if (predicate === undefined) return selector;
    if (typeof predicate !== 'function') throw new InvalidArgumentError('Transform predicate must be a function');
    const statePredicate = selector?.predicate;
    return {
      ...selector,
      predicate: (state: Readonly<ElementState>) => {
        if (statePredicate !== undefined && !statePredicate(state)) return false;
        const element = this.#elements.get(state.id);
        return element !== undefined && predicate(element);
      }
    };
  }

  /** 确认元素属于当前 Earth 和当前代次。 */
  #assertOwned<T>(element: Element<T>): void {
    if (this.#elements.get<T>(element.id) !== element) throw new InvalidArgumentError('Element belongs to another Earth or generation');
  }
}

/** 安全复制并校验变换参数对象。 */
function inspectOptions(input: unknown): TransformOptions {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new InvalidArgumentError('Transform options must be a plain object');
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) throw new InvalidArgumentError('Transform options must be a plain object');
  const allowed = new Set([
    'selector',
    'predicate',
    'layerIds',
    'hitTolerance',
    'translate',
    'scale',
    'stretch',
    'rotate',
    'translateBBox',
    'noFlip',
    'keepRectangle',
    'buffer',
    'pointRadius',
    'handleStyle',
    'handleCenter',
    'historyLimit',
    'toolbar',
    'policy'
  ]);
  const copy = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string') throw new InvalidArgumentError('Transform options cannot contain symbol properties');
    if (!allowed.has(key)) throw new InvalidArgumentError(`Unknown transform options field: ${key}`);
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (descriptor === undefined || !('value' in descriptor)) throw new InvalidArgumentError('Transform options cannot contain accessor properties');
    copy[key] = descriptor.value;
  }
  return copy as TransformOptions;
}

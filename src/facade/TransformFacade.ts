import type { ElementSelector, ElementState } from '../core/element/types.js';
import { InvalidArgumentError } from '../core/errors.js';
import type { InternalTransformOptions, InternalTransformService } from '../services/transform/types.js';
import type { Element } from './Element.js';
import { TransformSessionFacade } from './TransformSessionFacade.js';
import type { TransformOptions, TransformService, TransformSession } from './transformTypes.js';
import type { ElementService } from './types.js';

export class TransformFacade implements TransformService {
  readonly #service: InternalTransformService;
  readonly #elements: ElementService;

  constructor(service: InternalTransformService, elements: ElementService) {
    this.#service = service;
    this.#elements = elements;
  }

  start(options?: TransformOptions): TransformSession {
    return new TransformSessionFacade(this.#service.start(this.#mapOptions(options)), this.#elements);
  }

  select<T>(element: Element<T>, options?: TransformOptions): TransformSession<T> {
    this.#assertOwned(element);
    return new TransformSessionFacade<T>(this.#service.select<T>(element.id, this.#mapOptions(options)), this.#elements);
  }

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

  #assertOwned<T>(element: Element<T>): void {
    if (this.#elements.get<T>(element.id) !== element) throw new InvalidArgumentError('Element belongs to another Earth or generation');
  }
}

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

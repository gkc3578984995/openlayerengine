import type { NativeRefRegistry } from '../adapters/openlayers/NativeRefRegistry.js';
import { InvalidArgumentError } from '../core/errors.js';
import type { ElementStyleState, NativeStyleRef } from '../core/style/types.js';
import type { StyleService as InternalStyleService } from '../services/style/StyleService.js';
import type { StyleInput, StyleService } from './styleTypes.js';

type NativeStyleValue = Parameters<NativeRefRegistry['registerStyle']>[0];
type NativeStyleMatch = { readonly matched: false } | { readonly matched: true; readonly value: NativeStyleValue };

export class StyleFacade implements StyleService {
  readonly #service: InternalStyleService;
  readonly #nativeRefs: NativeRefRegistry;

  constructor(service: InternalStyleService, nativeRefs: NativeRefRegistry) {
    this.#service = service;
    this.#nativeRefs = nativeRefs;
  }

  set(selector: Parameters<StyleService['set']>[0], style: StyleInput): void {
    let reference: NativeStyleRef | undefined;
    try {
      const changes = this.#service.setResolved(selector, () => {
        const nativeStyle = matchNativeStyleInput(style);
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
          // Registry destruction already clears provisional ownership.
        }
      }
      throw error;
    }
  }

  patch(selector: Parameters<StyleService['patch']>[0], patch: Parameters<StyleService['patch']>[1]): void {
    this.#service.patch(selector, patch);
  }
}

function matchNativeStyleInput(style: StyleInput): NativeStyleMatch {
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

import type { NativeRefRegistry } from '../adapters/openlayers/NativeRefRegistry.js';
import type { StyleService as InternalStyleService } from '../services/style/StyleService.js';
import type { StyleInput, StyleService } from './styleTypes.js';

export class StyleFacade implements StyleService {
  readonly #service: InternalStyleService;
  readonly #nativeRefs: NativeRefRegistry;

  constructor(service: InternalStyleService, nativeRefs: NativeRefRegistry) {
    this.#service = service;
    this.#nativeRefs = nativeRefs;
  }

  set(selector: Parameters<StyleService['set']>[0], style: StyleInput): void {
    if (isNativeStyleInput(style)) {
      const reference = this.#nativeRefs.registerProvisionalStyle(style.nativeStyle);
      try {
        const changes = this.#service.set(selector, reference);
        if (changes.changes.length === 0) this.#nativeRefs.discardProvisionalStyle(reference);
        else this.#nativeRefs.commitProvisionalStyle(reference);
      } catch (error) {
        try {
          this.#nativeRefs.discardProvisionalStyle(reference);
        } catch {
          // Registry destruction already clears provisional ownership.
        }
        throw error;
      }
      return;
    }
    this.#service.set(selector, style);
  }

  patch(selector: Parameters<StyleService['patch']>[0], patch: Parameters<StyleService['patch']>[1]): void {
    this.#service.patch(selector, patch);
  }
}

function isNativeStyleInput(style: StyleInput): style is { nativeStyle: Parameters<NativeRefRegistry['registerStyle']>[0] } {
  return style !== null && typeof style === 'object' && Object.prototype.hasOwnProperty.call(style, 'nativeStyle');
}

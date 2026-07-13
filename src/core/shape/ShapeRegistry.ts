import { CapabilityError, InvalidArgumentError } from '../errors.js';
import { shapeTypes, type ShapeCapability, type ShapeDefinition, type ShapeState, type ShapeType } from './types.js';

const canonicalShapeTypes: ReadonlySet<string> = new Set(shapeTypes);

export class ShapeRegistry {
  readonly #definitions = new Map<ShapeType, ShapeDefinition>();
  readonly #capabilities = new Map<ShapeType, ReadonlySet<ShapeCapability>>();

  constructor(definitions: readonly ShapeDefinition[] = []) {
    for (const definition of definitions) this.register(definition);
  }

  register<S extends ShapeState>(definition: ShapeDefinition<S>): void {
    const type = definition.type as ShapeType;
    if (!canonicalShapeTypes.has(type)) throw new InvalidArgumentError(`Unknown shape type: ${String(type)}`);
    if (this.#definitions.has(type)) throw new InvalidArgumentError(`Shape type is already registered: ${type}`);
    this.#definitions.set(type, definition as ShapeDefinition);
    this.#capabilities.set(type, new Set(definition.capabilities));
  }

  get<T extends ShapeType>(type: T): ShapeDefinition<ShapeState<T>> {
    const definition = this.#definitions.get(type);
    if (definition === undefined) throw new CapabilityError(`Shape definition is unavailable: ${String(type)}`);
    return definition as ShapeDefinition<ShapeState<T>>;
  }

  supports(type: ShapeType, capability: ShapeCapability): boolean {
    this.get(type);
    return this.#capabilities.get(type)?.has(capability) ?? false;
  }

  types(): readonly ShapeType[] {
    return Object.freeze([...this.#definitions.keys()]);
  }
}

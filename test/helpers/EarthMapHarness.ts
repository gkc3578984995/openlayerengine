export class FakeCollection<T> {
  readonly #values: T[];

  constructor(values: readonly T[] = []) {
    this.#values = [...values];
  }

  getArray(): T[] {
    return this.#values;
  }

  push(value: T): number {
    this.#values.push(value);
    return this.#values.length;
  }

  remove(value: T): T | undefined {
    const index = this.#values.indexOf(value);
    return index < 0 ? undefined : this.#values.splice(index, 1)[0];
  }

  clear(): void {
    this.#values.length = 0;
  }

  forEach(listener: (value: T) => void): void {
    this.#values.forEach(listener);
  }
}

export class FakeViewport extends EventTarget {
  readonly style = { cursor: '' };

  getBoundingClientRect(): DOMRect {
    return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  }
}

export class FakeMap {
  readonly viewport = new FakeViewport();
  readonly #layers = new FakeCollection<unknown>();
  readonly #overlays = new FakeCollection<unknown>();
  readonly #listeners = new globalThis.Map<string, Set<(event: unknown) => void>>();
  readonly #view: unknown;
  readonly #interactions: FakeCollection<unknown>;
  readonly #controls: FakeCollection<unknown>;
  disposeCount = 0;
  target: unknown;

  constructor(options: { target: unknown; view: unknown; interactions: FakeCollection<unknown>; controls: FakeCollection<unknown> }) {
    this.target = options.target;
    this.#view = options.view;
    this.#interactions = options.interactions;
    this.#controls = options.controls;
  }

  getViewport(): FakeViewport {
    return this.viewport;
  }

  getTargetElement(): FakeViewport {
    return this.viewport;
  }

  getView(): unknown {
    return this.#view;
  }

  getLayers(): FakeCollection<unknown> {
    return this.#layers;
  }

  getAllLayers(): unknown[] {
    return [...this.#layers.getArray()];
  }

  getOverlays(): FakeCollection<unknown> {
    return this.#overlays;
  }

  getInteractions(): FakeCollection<unknown> {
    return this.#interactions;
  }

  getControls(): FakeCollection<unknown> {
    return this.#controls;
  }

  addLayer(layer: unknown): void {
    this.#layers.push(layer);
  }

  removeLayer(layer: unknown): unknown {
    return this.#layers.remove(layer);
  }

  addOverlay(overlay: unknown): void {
    this.#overlays.push(overlay);
  }

  removeOverlay(overlay: unknown): unknown {
    return this.#overlays.remove(overlay);
  }

  addInteraction(interaction: unknown): void {
    this.#interactions.push(interaction);
  }

  removeInteraction(interaction: unknown): unknown {
    return this.#interactions.remove(interaction);
  }

  addControl(control: unknown): void {
    this.#controls.push(control);
  }

  removeControl(control: unknown): unknown {
    return this.#controls.remove(control);
  }

  on(type: string, listener: (event: unknown) => void): object {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
    return { target: this, type, listener };
  }

  un(type: string, listener: (event: unknown) => void): void {
    this.#listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: unknown): void {
    for (const listener of [...(this.#listeners.get(type) ?? [])]) listener(event);
  }

  listenerCount(type: string): number {
    return this.#listeners.get(type)?.size ?? 0;
  }

  forEachFeatureAtPixel(): undefined {
    return undefined;
  }

  getEventPixel(): [number, number] {
    return [0, 0];
  }

  getCoordinateFromPixel(): [number, number] {
    return [0, 0];
  }

  getPixelFromCoordinate(): [number, number] {
    return [0, 0];
  }

  setTarget(target: unknown): void {
    this.target = target;
  }

  dispose(): void {
    this.disposeCount += 1;
  }
}

export class FakeHtmlElement extends EventTarget {
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  readonly childNodes: FakeHtmlElement[] = [];
  className = '';
  parentElement: FakeHtmlElement | null = null;

  get firstChild(): FakeHtmlElement | null {
    return this.childNodes[0] ?? null;
  }

  get lastChild(): FakeHtmlElement | null {
    return this.childNodes.at(-1) ?? null;
  }

  appendChild(child: FakeHtmlElement): FakeHtmlElement {
    child.remove();
    child.parentElement = this;
    this.childNodes.push(child);
    return child;
  }

  insertBefore(child: FakeHtmlElement, before: FakeHtmlElement | null): FakeHtmlElement {
    child.remove();
    child.parentElement = this;
    const index = before === null ? this.childNodes.length : this.childNodes.indexOf(before);
    this.childNodes.splice(index < 0 ? this.childNodes.length : index, 0, child);
    return child;
  }

  removeChild(child: FakeHtmlElement): FakeHtmlElement {
    const index = this.childNodes.indexOf(child);
    if (index >= 0) this.childNodes.splice(index, 1);
    child.parentElement = null;
    return child;
  }

  remove(): void {
    this.parentElement?.removeChild(this);
  }

  getBoundingClientRect(): DOMRect {
    return { left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  }

  setAttribute(): void {}

  setPointerCapture(): void {}

  releasePointerCapture(): void {}
}

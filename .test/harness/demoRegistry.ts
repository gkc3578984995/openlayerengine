export type DemoCleanup = () => void;

export interface DemoDefinition {
  id: string;
  group: string;
  label: string;
  mount: () => void | DemoCleanup;
}

export class DemoRegistry {
  private readonly demos = new Map<string, DemoDefinition>();
  private readonly cleanups = new Map<string, DemoCleanup>();

  constructor(demos: DemoDefinition[]) {
    demos.forEach((demo) => this.demos.set(demo.id, demo));
  }

  isEnabled(id: string) {
    return this.cleanups.has(id);
  }

  enable(id: string) {
    if (this.cleanups.has(id)) return;
    const demo = this.demos.get(id);
    if (!demo) throw new Error(`Unknown demo: ${id}`);
    this.cleanups.set(id, demo.mount() ?? (() => {}));
  }

  disable(id: string) {
    const cleanup = this.cleanups.get(id);
    if (!cleanup) return;
    cleanup();
    this.cleanups.delete(id);
  }

  clear() {
    [...this.cleanups.keys()].forEach((id) => this.disable(id));
  }

  enableAll() {
    [...this.demos.keys()].forEach((id) => this.enable(id));
  }
}

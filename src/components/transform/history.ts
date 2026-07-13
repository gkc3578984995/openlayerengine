import type Feature from 'ol/Feature.js';

export interface FeatureSnapshot {
  id: string;
  feature: Feature;
}

export class TransformHistory {
  private history: FeatureSnapshot[] = [];
  private redoHistory: FeatureSnapshot[] = [];

  constructor(private readonly getLimit: () => number) {}

  get current(): FeatureSnapshot | undefined {
    return this.history[this.history.length - 1];
  }

  get undoCount(): number {
    return Math.max(0, this.history.length - 1);
  }

  get redoCount(): number {
    return this.redoHistory.length;
  }

  get canUndo(): boolean {
    return this.history.length > 1;
  }

  get canRedo(): boolean {
    return this.redoHistory.length > 0;
  }

  record(snapshot: FeatureSnapshot): void {
    this.push(snapshot);
    this.redoHistory = [];
  }

  push(snapshot: FeatureSnapshot): void {
    this.history.push(snapshot);
    const limit = Math.max(1, this.getLimit());
    if (this.history.length > limit) this.history.shift();
  }

  undo(): FeatureSnapshot | undefined {
    if (!this.canUndo) return undefined;
    const current = this.history.pop();
    if (current) this.redoHistory.push(current);
    return this.current;
  }

  takeRedo(): FeatureSnapshot | undefined {
    return this.redoHistory.pop();
  }

  clear(): void {
    this.history = [];
    this.redoHistory = [];
  }
}

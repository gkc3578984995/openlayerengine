import type { Earth } from '@vrsim/earth-engine-ol';
import type { DisposeBag } from './DisposeBag.js';
import type { ScenarioContext } from './ScenarioContext.js';

export type LogLevel = '信息' | '成功' | '警告' | '错误';

export interface ScenarioDefinition {
  readonly id: string;
  readonly group: string;
  readonly title: string;
  readonly summary: string;
  readonly steps: readonly string[];
  mount(context: ScenarioContext): void | Promise<void>;
}

export interface ScenarioRuntime {
  readonly earth?: Earth;
  readonly dispose: DisposeBag;
}

export interface SelectOption<T extends string> {
  readonly label: string;
  readonly value: T;
}

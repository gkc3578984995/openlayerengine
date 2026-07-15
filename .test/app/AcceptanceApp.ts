import { coverageSummary, coverageForScenario } from '../coverage/publicApiCoverage.js';
import { ScenarioContext } from '../harness/ScenarioContext.js';
import type { ScenarioDefinition } from '../harness/types.js';

const STORAGE_KEY = 'ol-engine-v2-acceptance-passed';

interface AppElements {
  readonly title: HTMLElement;
  readonly summary: HTMLElement;
  readonly steps: HTMLElement;
  readonly map: HTMLElement;
  readonly controls: HTMLElement;
  readonly log: HTMLElement;
  readonly checks: HTMLElement;
  readonly code: HTMLElement;
  readonly status: HTMLElement;
  readonly coverage: HTMLElement;
  readonly passed: HTMLButtonElement;
  readonly reset: HTMLButtonElement;
  readonly progress: HTMLElement;
}

export class AcceptanceApp {
  readonly #root: HTMLElement;
  readonly #scenarios: readonly ScenarioDefinition[];
  readonly #source: string;
  readonly #passed = readPassed();
  readonly #buttons = new Map<string, HTMLButtonElement>();
  #elements: AppElements | undefined;
  #context: ScenarioContext | undefined;
  #active: ScenarioDefinition | undefined;
  #loadVersion = 0;

  constructor(root: HTMLElement, scenarios: readonly ScenarioDefinition[], source: string) {
    this.#root = root;
    this.#scenarios = scenarios;
    this.#source = source;
  }

  mount(): void {
    this.#root.replaceChildren();
    this.#root.className = 'acceptance-app';
    this.#elements = this.#buildShell();
    this.#renderNavigation();
    this.#syncProgress();

    window.addEventListener('hashchange', this.#onHashChange);
    window.addEventListener('beforeunload', this.#destroy);
    const requested = decodeURIComponent(window.location.hash.slice(1));
    const first = this.#scenarios.find((scenario) => scenario.id === requested) ?? this.#scenarios[0];
    if (first !== undefined) void this.#load(first, false);
  }

  #buildShell(): AppElements {
    const header = document.createElement('header');
    header.className = 'acceptance-header';
    const brand = document.createElement('div');
    const heading = document.createElement('h1');
    heading.textContent = 'ol-engine 2.0 公共 API 验收台';
    const source = document.createElement('span');
    source.className = 'acceptance-badge';
    source.textContent = this.#source;
    brand.append(heading, source);
    const progress = document.createElement('strong');
    progress.className = 'acceptance-progress';
    header.append(brand, progress);

    const navigation = document.createElement('nav');
    navigation.className = 'acceptance-navigation';
    navigation.dataset.region = 'navigation';

    const workspace = document.createElement('main');
    workspace.className = 'acceptance-workspace';
    const scenarioHeader = document.createElement('section');
    scenarioHeader.className = 'acceptance-scenario-header';
    const title = document.createElement('h2');
    const summary = document.createElement('p');
    const actions = document.createElement('div');
    actions.className = 'acceptance-actions';
    const reset = actionButton('重置当前场景');
    const passed = actionButton('标记为已通过', '主要');
    actions.append(reset, passed);
    scenarioHeader.append(title, summary, actions);

    const stage = document.createElement('section');
    stage.className = 'acceptance-stage';
    const map = region('acceptance-map-region');
    const controls = region('acceptance-controls');
    stage.append(map, controls);

    const evidence = document.createElement('section');
    evidence.className = 'acceptance-evidence';
    const stepsCard = card('人工操作步骤');
    const steps = document.createElement('ol');
    steps.className = 'acceptance-steps';
    stepsCard.append(steps);
    const statusCard = card('当前状态');
    const status = region('acceptance-card-body');
    statusCard.append(status);
    const checksCard = card('自动检查');
    const checks = region('acceptance-card-body');
    checksCard.append(checks);
    const logCard = card('事件日志');
    const log = region('acceptance-card-body');
    logCard.append(log);
    const coverageCard = card('本场景覆盖');
    const coverage = region('acceptance-card-body');
    coverageCard.append(coverage);
    const codeCard = card('外部调用示例');
    const code = document.createElement('pre');
    codeCard.append(code);
    evidence.append(stepsCard, statusCard, checksCard, logCard, coverageCard, codeCard);

    workspace.append(scenarioHeader, stage, evidence);
    this.#root.append(header, navigation, workspace);

    reset.addEventListener('click', () => {
      if (this.#active !== undefined) void this.#load(this.#active, false);
    });
    passed.addEventListener('click', () => this.#togglePassed());

    return { title, summary, steps, map, controls, log, checks, code, status, coverage, passed, reset, progress };
  }

  #renderNavigation(): void {
    const navigation = this.#root.querySelector<HTMLElement>('[data-region="navigation"]');
    if (navigation === null) return;
    const groups = new Map<string, ScenarioDefinition[]>();
    for (const scenario of this.#scenarios) {
      const items = groups.get(scenario.group) ?? [];
      items.push(scenario);
      groups.set(scenario.group, items);
    }
    for (const [group, scenarios] of groups) {
      const section = document.createElement('section');
      const heading = document.createElement('h2');
      heading.textContent = group;
      section.append(heading);
      for (const scenario of scenarios) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = scenario.title;
        button.addEventListener('click', () => void this.#load(scenario, true));
        this.#buttons.set(scenario.id, button);
        section.append(button);
      }
      navigation.append(section);
    }
  }

  async #load(scenario: ScenarioDefinition, updateHash: boolean): Promise<void> {
    const elements = this.#elements;
    if (elements === undefined) return;
    const version = ++this.#loadVersion;
    this.#disposeContext();
    this.#active = scenario;
    for (const [id, button] of this.#buttons) button.classList.toggle('is-active', id === scenario.id);
    if (updateHash) history.replaceState(null, '', `#${encodeURIComponent(scenario.id)}`);

    elements.title.textContent = scenario.title;
    elements.summary.textContent = scenario.summary;
    elements.map.replaceChildren();
    elements.controls.replaceChildren();
    elements.log.replaceChildren();
    elements.checks.replaceChildren();
    elements.code.textContent = '';
    elements.status.replaceChildren();
    elements.steps.replaceChildren(...scenario.steps.map(stepItem));
    this.#renderCoverage(scenario);
    this.#syncPassedButton();

    const context = new ScenarioContext({
      map: elements.map,
      controls: elements.controls,
      log: elements.log,
      checks: elements.checks,
      code: elements.code,
      status: elements.status
    });
    this.#context = context;
    try {
      await scenario.mount(context);
      if (version !== this.#loadVersion) context.dispose.dispose();
    } catch (error) {
      if (version !== this.#loadVersion) return;
      context.log('场景初始化失败', '错误', error instanceof Error ? error.message : error);
      context.check('场景可以正常初始化', false);
    }
  }

  #renderCoverage(scenario: ScenarioDefinition): void {
    const root = this.#elements?.coverage;
    if (root === undefined) return;
    root.replaceChildren();
    const items = coverageForScenario(scenario.id);
    const summary = document.createElement('p');
    summary.textContent = `共 ${items.length} 项：${groupModes(items.map((item) => item.mode))}`;
    root.append(summary);
    const list = document.createElement('ul');
    list.className = 'acceptance-coverage-list';
    for (const item of items) {
      const entry = document.createElement('li');
      const mode = document.createElement('span');
      mode.textContent = item.mode;
      const id = document.createElement('code');
      id.textContent = item.id;
      entry.append(mode, id);
      list.append(entry);
    }
    root.append(list);
  }

  #togglePassed(): void {
    const active = this.#active;
    if (active === undefined) return;
    if (this.#passed.has(active.id)) this.#passed.delete(active.id);
    else this.#passed.add(active.id);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.#passed]));
    } catch (error) {
      console.warn('无法持久化人工验收状态', error);
    }
    this.#syncPassedButton();
    this.#syncProgress();
  }

  #syncPassedButton(): void {
    const elements = this.#elements;
    const active = this.#active;
    if (elements === undefined || active === undefined) return;
    const passed = this.#passed.has(active.id);
    elements.passed.textContent = passed ? '取消通过标记' : '标记为已通过';
    elements.passed.classList.toggle('is-passed', passed);
  }

  #syncProgress(): void {
    const progress = this.#elements?.progress;
    if (progress === undefined) return;
    const summary = coverageSummary();
    progress.textContent = `场景 ${this.#passed.size}/${this.#scenarios.length} 已人工通过 · API 覆盖 ${summary.total} 项`;
  }

  #disposeContext(): void {
    const context = this.#context;
    this.#context = undefined;
    if (context === undefined) return;
    try {
      context.dispose.dispose();
    } catch (error) {
      console.error('验收场景清理失败', error);
    }
  }

  #onHashChange = (): void => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    const scenario = this.#scenarios.find((candidate) => candidate.id === id);
    if (scenario !== undefined && scenario !== this.#active) void this.#load(scenario, false);
  };

  #destroy = (): void => {
    this.#disposeContext();
    window.removeEventListener('hashchange', this.#onHashChange);
    window.removeEventListener('beforeunload', this.#destroy);
  };
}

function region(className: string): HTMLElement {
  const element = document.createElement('div');
  element.className = className;
  return element;
}

function card(title: string): HTMLElement {
  const section = document.createElement('section');
  section.className = 'acceptance-card';
  const heading = document.createElement('h3');
  heading.textContent = title;
  section.append(heading);
  return section;
}

function actionButton(label: string, kind: '普通' | '主要' = '普通'): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.className = `acceptance-button acceptance-button--${kind}`;
  return button;
}

function stepItem(step: string): HTMLLIElement {
  const item = document.createElement('li');
  item.textContent = step;
  return item;
}

function readPassed(): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

function groupModes(modes: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const mode of modes) counts.set(mode, (counts.get(mode) ?? 0) + 1);
  return [...counts].map(([mode, count]) => `${mode} ${count}`).join('，');
}

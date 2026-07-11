import { DemoDefinition, DemoRegistry } from './demoRegistry';

export class DemoPanel {
  private readonly root: HTMLElement;

  constructor(
    private readonly registry: DemoRegistry,
    private readonly demos: DemoDefinition[]
  ) {
    this.root = document.createElement('aside');
    this.root.className = 'demo-panel';
  }

  mount(): void {
    const heading = document.createElement('h1');
    heading.textContent = 'Demo controls';
    this.root.append(heading, this.createActions());

    this.groupDemos().forEach(([group, demos]) => {
      const section = document.createElement('section');
      const title = document.createElement('h2');
      title.textContent = group;
      section.append(title);

      demos.forEach((demo) => section.append(this.createDemoControl(demo)));
      this.root.append(section);
    });

    document.body.append(this.root);
  }

  destroy(): void {
    this.root.remove();
  }

  private createActions(): HTMLElement {
    const actions = document.createElement('div');
    actions.className = 'demo-panel__actions';

    const enableAll = document.createElement('button');
    enableAll.type = 'button';
    enableAll.textContent = 'Enable all';
    enableAll.addEventListener('click', () => {
      this.registry.enableAll();
      this.syncCheckboxes();
    });

    const clearAll = document.createElement('button');
    clearAll.type = 'button';
    clearAll.textContent = 'Clear all';
    clearAll.addEventListener('click', () => {
      this.registry.clear();
      this.syncCheckboxes();
    });

    actions.append(enableAll, clearAll);
    return actions;
  }

  private createDemoControl(demo: DemoDefinition): HTMLLabelElement {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.demoId = demo.id;
    input.addEventListener('change', () => {
      if (input.checked) this.registry.enable(demo.id);
      else this.registry.disable(demo.id);
      input.checked = this.registry.isEnabled(demo.id);
    });

    const text = document.createElement('span');
    text.textContent = demo.label;
    label.append(input, text);
    return label;
  }

  private groupDemos(): Array<[string, DemoDefinition[]]> {
    const groups = new Map<string, DemoDefinition[]>();
    this.demos.forEach((demo) => {
      const current = groups.get(demo.group) ?? [];
      current.push(demo);
      groups.set(demo.group, current);
    });
    return [...groups.entries()];
  }

  private syncCheckboxes(): void {
    this.root.querySelectorAll<HTMLInputElement>('input[data-demo-id]').forEach((input) => {
      input.checked = this.registry.isEnabled(input.dataset.demoId!);
    });
  }
}

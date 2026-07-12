import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readStyles = () => readFileSync(resolve(process.cwd(), 'website/src/assets/styles/index.scss'), 'utf8');

describe('website sidebar hierarchy', () => {
  it('uses separate parent and child active indicators', () => {
    const styles = readStyles();

    expect(styles).toContain('.docs-sidebar__link.is-active');
    expect(styles).toContain('font-weight: 600;');
    expect(styles).toContain('.docs-sidebar__child-link.is-active');
    expect(styles).toContain('box-shadow: inset 3px 0 0 var(--doc-primary);');
  });

  it('keeps child pages visibly nested below their parent module', () => {
    const styles = readStyles();

    expect(styles).toContain('margin: 4px 0 8px 18px;');
    expect(styles).toContain('padding-left: 12px;');
  });
});

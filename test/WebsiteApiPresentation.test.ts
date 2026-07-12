import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('website API presentation', () => {
  it('gives API columns semantic property and method presentation classes', async () => {
    const apiTable = await readFile('website/src/components/docs/ApiTable.vue', 'utf8');

    expect(apiTable).toContain("presentation?: 'property' | 'method';");
    expect(apiTable).toContain(':class="col.presentation ? `api-table__${col.presentation}` : undefined"');
  });
});

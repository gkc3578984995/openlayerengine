import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

async function getDocumentationFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return getDocumentationFiles(path);
      return /\.(ts|vue)$/.test(entry.name) ? [path] : [];
    })
  );

  return files.flat();
}

describe('website API descriptions', () => {
  it('does not end property or method descriptions with a sentence period', async () => {
    const files = await Promise.all(['website/src/docs', 'website/src/views'].map(getDocumentationFiles));

    for (const file of files.flat()) {
      const source = await readFile(file, 'utf8');
      expect(source, file).not.toMatch(/\bdesc:\s*(?:'[^']*[。.\.]'|`[^`]*[。.\.]`)/s);
    }
  });
});

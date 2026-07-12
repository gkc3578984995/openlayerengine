import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootPackage = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')) as { version?: unknown };

if (typeof rootPackage.version !== 'string' || rootPackage.version.length === 0) {
  throw new Error('The root package.json must define a non-empty version string.');
}

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    '__OL_DOC_VERSION__': JSON.stringify(rootPackage.version)
  },
  plugins: [vue()]
});

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [
    {
      name: 'ol-engine-browser-test-probes',
      enforce: 'pre',
      transform(code, id) {
        if (!id.replaceAll('\\', '/').endsWith('/src/facade/earthRegistry.ts')) return undefined;
        return {
          code: `${code}\nObject.defineProperty(globalThis, '__OL_ENGINE_TEST_REGISTRY_KEYS__', { configurable: true, value: () => Object.freeze([...earthRegistry.keys()].map((key) => key === defaultEarthKey ? '<default>' : key)) });`,
          map: null
        };
      }
    }
  ],
  server: {
    host: '127.0.0.1',
    port: 4_177,
    strictPort: true
  }
});

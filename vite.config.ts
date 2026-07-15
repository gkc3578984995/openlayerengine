import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const repositoryRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  const useBuiltPackage = mode === 'acceptance-dist';
  return {
    define: {
      __ACCEPTANCE_SOURCE__: JSON.stringify(useBuiltPackage ? '构建产物 dist' : '源码公共入口')
    },
    resolve: {
      alias: [
        {
          find: '@vrsim/earth-engine-ol/style.css',
          replacement: resolve(repositoryRoot, useBuiltPackage ? 'dist/style.css' : 'src/assets/style/public.scss')
        },
        {
          find: '@vrsim/earth-engine-ol',
          replacement: resolve(repositoryRoot, useBuiltPackage ? 'dist/esm/index.mjs' : 'src/index.ts')
        }
      ]
    },
    server: {
      open: true
    }
  };
});

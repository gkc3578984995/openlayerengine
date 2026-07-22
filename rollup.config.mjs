import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import { defineConfig } from 'rollup';

// eslint-disable-next-line no-undef
const mode = process.env.MODE;
const isProd = mode === 'prod';

export default defineConfig({
  input: {
    index: 'src/index.ts'
  },
  external: (id) => id === 'ol' || id.startsWith('ol/'),
  output: {
    dir: 'dist/esm',
    entryFileNames: '[name].mjs',
    chunkFileNames: 'chunks/[name]-[hash].mjs',
    format: 'es',
    sourcemap: !isProd
  },
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
      declaration: false,
      declarationMap: false,
      declarationDir: undefined,
      outDir: undefined
    }),
    terser()
  ]
});

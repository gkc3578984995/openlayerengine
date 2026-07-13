import * as pkg from './package.json';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import url from '@rollup/plugin-url';
import { defineConfig } from 'rollup';
import fs from 'fs';

// 自定义 ?raw 资源加载插件，使 *.svg?raw 返回源代码字符串（兼容 vite 风格导入）
function rawPlugin() {
  return {
    name: 'raw-plugin',
    load(id) {
      if (id.endsWith('?raw')) {
        const realId = id.replace(/\?raw$/, '');
        try {
          const code = fs.readFileSync(realId, 'utf-8');
          return `export default ${JSON.stringify(code)};`;
        } catch (e) {
          this.error(`raw-plugin: cannot read file ${realId}: ${e}`);
        }
      }
      return null;
    }
  };
}

// eslint-disable-next-line no-undef
const mode = process.env.MODE;
const isProd = mode === 'prod';
const externalDependencies = [...new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})])];

function toNativeEsmSpecifier(id) {
  if ((id.startsWith('ol/') || id.startsWith('lodash/')) && !id.endsWith('.js')) return `${id}.js`;
  return id;
}

const lodashInteropId = '\0lodash-esm-interop';

function lodashEsmInteropPlugin() {
  return {
    name: 'lodash-esm-interop',
    resolveId(id) {
      if (id === 'lodash') return lodashInteropId;
      return null;
    },
    load(id) {
      if (id === lodashInteropId) return "export { default as cloneDeep } from 'lodash/cloneDeep';";
      return null;
    }
  };
}

export default defineConfig({
  input: {
    index: 'src/index.ts',
    core: 'src/entries/core.ts',
    layers: 'src/base/index.ts',
    draw: 'src/entries/draw.ts',
    measure: 'src/entries/measure.ts',
    transform: 'src/entries/transform.ts',
    plot: 'src/entries/plot.ts'
  },
  external: (id) => id !== 'lodash' && externalDependencies.some((dependency) => id === dependency || id.startsWith(`${dependency}/`)),
  output: {
    dir: 'dist/esm',
    entryFileNames: '[name].mjs',
    chunkFileNames: 'chunks/[name]-[hash].mjs',
    format: 'es',
    paths: toNativeEsmSpecifier,
    sourcemap: !isProd
  },
  plugins: [
    lodashEsmInteropPlugin(),
    // 放在最前，优先截获 *?raw 资源
    rawPlugin(),
    // 小图片自动转 base64，大于 limit 的复制到 dist/assets
    // 资源文件处理：此前使用 limit:4096 以内联小图片，但出现部分 png 被压缩后 dataURI 内容为空的问题（可能与某些工具链/缓存交互有关）。
    // 为保证发布库中引用的图标路径稳定且便于调试，这里改为 limit:0 强制始终复制到 dist/assets 下。
    // 下游使用时可自行选择再行处理（例如通过构建工具做进一步的资产哈希或内联优化）。
    url({
      include: ['**/*.svg', '**/*.png', '**/*.jpg', '**/*.jpeg'],
      // 将小图标（<4KB）内联为 data URI，减少消费端路径依赖；较大资源仍输出到 dist/assets
      limit: 4096,
      fileName: 'assets/[name][hash][extname]'
    }),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: false,
      declarationMap: false,
      declarationDir: undefined,
      outDir: undefined
    }),
    nodeResolve(),
    commonjs(),
    terser()
  ]
});

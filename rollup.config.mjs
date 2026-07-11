import * as pkg from './package.json';
import typescript from '@rollup/plugin-typescript';
import shader from 'rollup-plugin-shader';
import terser from '@rollup/plugin-terser';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import url from '@rollup/plugin-url';
import postcss from 'rollup-plugin-postcss';
import { defineConfig } from 'rollup';
import copy from 'rollup-plugin-copy';
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

export default defineConfig({
  input: `src/index.ts`,
  // Keep peer and runtime-provided dependencies out of the library bundle.
  external: (id) => id === 'mitt' || id === 'heatmap.js' || id === 'ol' || id.startsWith('ol/'),
  output: [
    {
      file: pkg.main,
      exports: 'named',
      format: 'cjs',
      sourcemap: !isProd
    },
    {
      file: pkg.module,
      format: 'es',
      sourcemap: !isProd
    }
    // 注：移除 iife 全局构建。ol 改为 external 后，深路径导入（ol/Map 等）无法在
    // 浏览器全局模式下正确映射到 OL 的 UMD 命名导出，iife 产物不可用。
    // 消费端请使用 ESM/CJS（已在 package.json exports 中声明）。
  ],
  plugins: [
    // 放在最前，优先截获 *?raw 资源
    rawPlugin(),
    // 处理样式（SCSS -> 单独 CSS 文件 dist/index.css）
    postcss({
      extract: true,
      minimize: isProd,
      sourceMap: !isProd,
      extensions: ['.css', '.scss'],
      use: ['sass']
    }),
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
    copy({
      targets: [
        // 说明：原先复制 public/image/* 以供硬编码 /image/... 引用；
        // 现已改为 ESM import 引入 src/assets/image 下的资源交由 url 插件处理 -> 移除以避免与文件句柄冲突 (EBUSY)。
        { src: 'public/earthspec1k.jpg', dest: 'dist' },
        { src: 'public/waterNormals.jpg', dest: 'dist' }
      ],
      hook: 'writeBundle'
    }),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: true,
      declarationDir: 'dist/types',
      emitDeclarationOnly: false
    }),
    shader(),
    nodeResolve(),
    commonjs(),
    terser()
  ]
});

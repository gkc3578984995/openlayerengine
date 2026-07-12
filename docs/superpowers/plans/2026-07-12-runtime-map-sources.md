# Runtime Map Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every documentation map example read deploy-time editable XYZ endpoints from `/map-sources.json`, with safe defaults when that file cannot be used.

**Architecture:** A pure `mapSources` module owns defaults, validation, URL-template substitution, runtime loading, and the two configured layer factories. `main.ts` awaits a non-cached configuration request before mounting Vue, so every example reads the same resolved configuration. The static JSON file is copied into the built site and may be changed by an internal deployment without rebuilding.

**Tech Stack:** Vue 3, TypeScript, Vite public assets, Vitest, OpenLayers through `Earth`.

## Global Constraints

- The feature applies to all ten files under `website/src/examples` that instantiate `Earth`.
- The public Earth API remains unchanged.
- Runtime configuration is loaded from `${import.meta.env.BASE_URL}map-sources.json` before the Vue app mounts.
- The only supported template variables are `{z}`, `{x}`, and `{y}`.
- Invalid, incomplete, or unreachable runtime configuration falls back to built-in OSM and ArcGIS defaults.
- Default configuration and documentation must not contain private tokens, credentials, or internal addresses.
- Public API references in documentation use the link markup required by `website/AGENTS.md`.

---

## File Structure

- Create: `website/src/config/mapSources.ts` — validated runtime configuration, URL generation, and configured layer factories.
- Create: `website/public/map-sources.json` — deployment-time editable default configuration copied unchanged to the built site.
- Create: `test/WebsiteMapSources.test.ts` — Vitest coverage for configuration validation, fallback, and template substitution.
- Modify: `website/src/main.ts` — load configuration before Vue mount.
- Modify: `website/src/examples/BaseLayerHandleDemo.vue` — create both lifecycle-demo layers through the centralized factories.
- Modify: `website/src/examples/CameraDemo.vue`, `ControlsDemo.vue`, `EarthCreateDemo.vue`, `MouseDemo.vue`, `MultiEarthDemo.vue`, `PointLayerBasicDemo.vue`, `PointLayerFlashDemo.vue`, `PointLayerStyleDemo.vue`, `PointLayerUpdateDemo.vue` — create configured vector layers rather than inline URL functions.
- Modify: `website/src/views/EarthCreateView.vue` — document deployment-time configuration and lifecycle-demo behavior.
- Modify: `website/AGENTS.md` — require centralized runtime map-source use for every map example.

### Task 1: Define and test runtime map-source resolution

**Files:**
- Create: `test/WebsiteMapSources.test.ts`
- Create: `website/src/config/mapSources.ts`

**Interfaces:**
- Produces `MapSourceName = 'vector' | 'satellite'`.
- Produces `MapSourceConfig` with `urlTemplate: string` and `opacity: number`.
- Produces `DEFAULT_MAP_SOURCES`, `resolveMapSources(value: unknown): MapSources`, `setMapSources(value: unknown): void`, `getMapSource(name: MapSourceName): MapSourceConfig`, `createTileUrl(template: string, coordinate: TileCoord): string`, and `loadMapSources(fetcher?: typeof fetch): Promise<void>`.
- Consumes OpenLayers `TileCoord` only as a type.

- [ ] **Step 1: Write the failing test for valid overrides and URL templates**

Create `test/WebsiteMapSources.test.ts` with this test before the implementation exists:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_MAP_SOURCES, createTileUrl, getMapSource, loadMapSources, setMapSources } from '../website/src/config/mapSources';

afterEach(() => setMapSources(undefined));

describe('website runtime map sources', () => {
  it('uses a valid runtime configuration and expands XYZ placeholders', () => {
    setMapSources({
      vector: { urlTemplate: 'https://maps.example/vector/{z}/{x}/{y}.png' },
      satellite: { urlTemplate: 'https://maps.example/satellite/{z}/{y}/{x}.jpg', opacity: 0.4 }
    });

    expect(getMapSource('satellite')).toEqual({
      urlTemplate: 'https://maps.example/satellite/{z}/{y}/{x}.jpg',
      opacity: 0.4
    });
    expect(createTileUrl(getMapSource('vector').urlTemplate, [6, 11, 22])).toBe('https://maps.example/vector/6/11/22.png');
    expect(DEFAULT_MAP_SOURCES.vector.urlTemplate).toContain('{z}');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails for the missing module**

Run: `npm test -- test/WebsiteMapSources.test.ts`

Expected: FAIL because `../website/src/config/mapSources` does not exist.

- [ ] **Step 3: Add failing tests for invalid configuration and failed loading**

Append these tests:

```ts
it('falls back to defaults when configuration is incomplete or malformed', () => {
  setMapSources({ vector: { urlTemplate: 'https://maps.example/{z}/{x}/{y}.png' } });

  expect(getMapSource('vector')).toEqual(DEFAULT_MAP_SOURCES.vector);
  expect(getMapSource('satellite')).toEqual(DEFAULT_MAP_SOURCES.satellite);
});

it('keeps defaults when the runtime configuration request fails', async () => {
  await loadMapSources(async () => {
    throw new Error('network unavailable');
  });

  expect(getMapSource('vector')).toEqual(DEFAULT_MAP_SOURCES.vector);
});
```

- [ ] **Step 4: Implement the minimal configuration module**

Create `website/src/config/mapSources.ts` with the following implementation. Import `Earth` from the package and `TileCoord` from `ol/tilecoord`; use `TileLayer<XYZ>` as the factory return type.

```ts
import type TileLayer from 'ol/layer/Tile';
import type TileCoord from 'ol/tilecoord';
import type XYZ from 'ol/source/XYZ';
import type { Earth } from '@vrsim/earth-engine-ol';

export type MapSourceName = 'vector' | 'satellite';

export interface MapSourceConfig {
  urlTemplate: string;
  opacity: number;
}

export type MapSources = Record<MapSourceName, MapSourceConfig>;

export const DEFAULT_MAP_SOURCES: MapSources = {
  vector: { urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', opacity: 1 },
  satellite: {
    urlTemplate: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    opacity: 0.65
  }
};

let mapSources: MapSources = DEFAULT_MAP_SOURCES;

const isUrlTemplate = (value: unknown): value is string => typeof value === 'string' && /\{z\}/.test(value) && /\{x\}/.test(value) && /\{y\}/.test(value);
const isOpacity = (value: unknown): value is number => typeof value === 'number' && value >= 0 && value <= 1;

export const resolveMapSources = (value: unknown): MapSources => {
  if (!value || typeof value !== 'object') return DEFAULT_MAP_SOURCES;
  const candidate = value as { vector?: Partial<MapSourceConfig>; satellite?: Partial<MapSourceConfig> };
  if (!isUrlTemplate(candidate.vector?.urlTemplate) || !isUrlTemplate(candidate.satellite?.urlTemplate)) return DEFAULT_MAP_SOURCES;
  return {
    vector: { urlTemplate: candidate.vector.urlTemplate, opacity: isOpacity(candidate.vector.opacity) ? candidate.vector.opacity : 1 },
    satellite: { urlTemplate: candidate.satellite.urlTemplate, opacity: isOpacity(candidate.satellite.opacity) ? candidate.satellite.opacity : 0.65 }
  };
};

export const setMapSources = (value: unknown): void => {
  mapSources = resolveMapSources(value);
};

export const getMapSource = (name: MapSourceName): MapSourceConfig => mapSources[name];

export const createTileUrl = (template: string, [z, x, y]: TileCoord): string => template.replaceAll('{z}', String(z)).replaceAll('{x}', String(x)).replaceAll('{y}', String(y));

export const createConfiguredLayer = (earth: Earth, name: MapSourceName): TileLayer<XYZ> => {
  const source = getMapSource(name);
  const layer = earth.createXyzLayer((coordinate) => createTileUrl(source.urlTemplate, coordinate));
  layer.setOpacity(source.opacity);
  return layer;
};

export const loadMapSources = async (fetcher: typeof fetch = fetch): Promise<void> => {
  try {
    const response = await fetcher(`${import.meta.env.BASE_URL}map-sources.json`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`map source configuration request failed: ${response.status}`);
    setMapSources(await response.json());
  } catch (error) {
    setMapSources(undefined);
    console.warn('Unable to load runtime map source configuration; using defaults.', error);
  }
};
```

- [ ] **Step 5: Run focused tests to verify they pass**

Run: `npm test -- test/WebsiteMapSources.test.ts`

Expected: PASS with three tests.

- [ ] **Step 6: Commit the tested configuration core**

```bash
git add test/WebsiteMapSources.test.ts website/src/config/mapSources.ts
git commit -m "feat(docs): add runtime map source configuration"
```

### Task 2: Load the deployed configuration before any example mounts

**Files:**
- Create: `website/public/map-sources.json`
- Modify: `website/src/main.ts`
- Test: `test/WebsiteMapSources.test.ts`

**Interfaces:**
- Consumes `loadMapSources(): Promise<void>` from `website/src/config/mapSources.ts`.
- Produces a document application whose examples only mount after source configuration is resolved.

- [ ] **Step 1: Add a failing test for the default deployment configuration**

Extend the test file import block with `import { readFile } from 'node:fs/promises';`, then append this test:

```ts
it('ships editable vector and satellite URL templates', async () => {
  const raw = await readFile('website/public/map-sources.json', 'utf8');
  const mapSources = JSON.parse(raw);

  expect(mapSources.vector.urlTemplate).toMatch(/\{z\}.*\{x\}.*\{y\}|\{z\}.*\{y\}.*\{x\}/);
  expect(mapSources.satellite.urlTemplate).toMatch(/\{z\}.*\{x\}.*\{y\}|\{z\}.*\{y\}.*\{x\}/);
});
```

- [ ] **Step 2: Run the focused test to verify it fails for the missing JSON file**

Run: `npm test -- test/WebsiteMapSources.test.ts`

Expected: FAIL with `ENOENT` for `website/public/map-sources.json`.

- [ ] **Step 3: Add the deployment configuration file and bootstrap loading**

Create `website/public/map-sources.json`:

```json
{
  "vector": {
    "urlTemplate": "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
  },
  "satellite": {
    "urlTemplate": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    "opacity": 0.65
  }
}
```

Replace `website/src/main.ts` with a bootstrap that waits for `loadMapSources`:

```ts
import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import App from './App.vue';
import router from './router';
import { loadMapSources } from './config/mapSources';
import './assets/styles/index.scss';

const bootstrap = async (): Promise<void> => {
  await loadMapSources();
  createApp(App).use(router).use(ElementPlus).mount('#app');
};

void bootstrap();
```

- [ ] **Step 4: Run focused tests and the documentation type check**

Run: `npm test -- test/WebsiteMapSources.test.ts && npm run build --workspace=ol-doc`

Expected: the focused tests pass and `vue-tsc -b && vite build` exits with code 0.

- [ ] **Step 5: Commit runtime loading**

```bash
git add website/public/map-sources.json website/src/main.ts test/WebsiteMapSources.test.ts
git commit -m "feat(docs): load map sources before app mount"
```

### Task 3: Migrate every documentation map example

**Files:**
- Modify: `website/src/examples/BaseLayerHandleDemo.vue`
- Modify: `website/src/examples/CameraDemo.vue`
- Modify: `website/src/examples/ControlsDemo.vue`
- Modify: `website/src/examples/EarthCreateDemo.vue`
- Modify: `website/src/examples/MouseDemo.vue`
- Modify: `website/src/examples/MultiEarthDemo.vue`
- Modify: `website/src/examples/PointLayerBasicDemo.vue`
- Modify: `website/src/examples/PointLayerFlashDemo.vue`
- Modify: `website/src/examples/PointLayerStyleDemo.vue`
- Modify: `website/src/examples/PointLayerUpdateDemo.vue`

**Interfaces:**
- Consumes `createConfiguredLayer(earth, 'vector' | 'satellite')` from `website/src/config/mapSources.ts`.
- Produces examples without direct tile service URL literals.

- [ ] **Step 1: Add a failing guard test forbidding direct service URLs in examples**

Extend the test file import block with `import { readdir } from 'node:fs/promises';` and `import path from 'node:path';`, then append this test:

```ts
it('keeps tile service URLs out of documentation examples', async () => {
  const examplesDirectory = 'website/src/examples';
  const files = (await readdir(examplesDirectory)).filter((file) => file.endsWith('.vue'));
  const contents = await Promise.all(files.map((file) => readFile(path.join(examplesDirectory, file), 'utf8')));

  expect(contents.join('\n')).not.toMatch(/https:\/\/(tile\.openstreetmap\.org|server\.arcgisonline\.com|webrd\d+\.is\.autonavi\.com)/);
});
```

- [ ] **Step 2: Run the guard test to verify it fails on existing inline URLs**

Run: `npm test -- test/WebsiteMapSources.test.ts`

Expected: FAIL because one or more example components contain direct tile service URLs.

- [ ] **Step 3: Replace inline vector-layer creation in the eight single-map examples**

In `CameraDemo.vue`, `ControlsDemo.vue`, `EarthCreateDemo.vue`, `MouseDemo.vue`, `PointLayerBasicDemo.vue`, `PointLayerFlashDemo.vue`, `PointLayerStyleDemo.vue`, and `PointLayerUpdateDemo.vue`:

1. Add `import { createConfiguredLayer } from '../config/mapSources';` beside existing imports.
2. Replace each `earth.addLayer(earth.createXyzLayer(...))` block with:

```ts
earth.addLayer(createConfiguredLayer(earth, 'vector'));
```

In `MultiEarthDemo.vue`, add the same import and replace each map's inline block with:

```ts
earth1.addLayer(createConfiguredLayer(earth1, 'vector'));
earth2.addLayer(createConfiguredLayer(earth2, 'vector'));
```

- [ ] **Step 4: Migrate the multiple-base-layer lifecycle demo**

In `BaseLayerHandleDemo.vue`:

1. Remove `createSatelliteLayer`.
2. Import `createConfiguredLayer` from `../config/mapSources`.
3. Set the initial vector handle with:

```ts
vectorLayerId.value = earth.addLayer(createConfiguredLayer(earth, 'vector'));
```

4. Add the satellite handle with:

```ts
satelliteLayerId.value = earth.addLayer(createConfiguredLayer(earth, 'satellite'));
```

Keep all current `ref` state and button disabled expressions unchanged, so vector removal is initially enabled and satellite removal becomes enabled only after satellite creation.

- [ ] **Step 5: Run the guard and focused tests to verify migration**

Run: `npm test -- test/WebsiteMapSources.test.ts`

Expected: PASS, including the no-inline-URL guard.

- [ ] **Step 6: Commit example migration**

```bash
git add website/src/examples test/WebsiteMapSources.test.ts
git commit -m "refactor(docs): centralize example map layers"
```

### Task 4: Document deployment configuration and make it a maintenance requirement

**Files:**
- Modify: `website/src/views/EarthCreateView.vue`
- Modify: `website/AGENTS.md`

**Interfaces:**
- Consumes the deployed `/map-sources.json` contract from Task 2.
- Produces user-facing instructions and contributor rules aligned with the centralized factory from Task 1.

- [ ] **Step 1: Add a failing documentation guard test**

Append this test:

```ts
it('documents deployment-time map-source configuration and contributor rules', async () => {
  const [earthCreatePage, websiteRules] = await Promise.all([
    readFile('website/src/views/EarthCreateView.vue', 'utf8'),
    readFile('website/AGENTS.md', 'utf8')
  ]);

  expect(earthCreatePage).toContain('/map-sources.json');
  expect(websiteRules).toContain('map-sources.json');
  expect(websiteRules).toContain('createConfiguredLayer');
});
```

- [ ] **Step 2: Run the focused test to verify it fails because documentation is absent**

Run: `npm test -- test/WebsiteMapSources.test.ts`

Expected: FAIL because the page and contributor rules do not yet reference the runtime configuration contract.

- [ ] **Step 3: Add the user-facing deployment note**

Add a list item in the “注意事项” section of `website/src/views/EarthCreateView.vue` with these exact contents:

```vue
<li>
  文档站构建完成后，可直接编辑站点根目录的 <code>/map-sources.json</code> 来替换全部示例的矢量与卫星 XYZ 服务；地址模板必须包含
  <code>{z}</code>、<code>{x}</code> 与 <code>{y}</code>。配置无法读取或不合法时，示例会回退到内置默认服务。
</li>
```

Keep method references in the existing example description linked with the required `<code class="code-fn"><a href="#api-methods">…</a></code>` markup.

- [ ] **Step 4: Add the contributor requirement**

Append this section to `website/AGENTS.md`:

```md
## 运行时地图源

所有含底图的运行示例必须通过 `website/src/config/mapSources.ts` 的 `createConfiguredLayer` 创建图层，禁止在 `website/src/examples` 中直接写入瓦片服务 URL。部署人员通过构建产物根目录的 `map-sources.json` 替换矢量或卫星 XYZ 地址；新增配置字段、底图示例或地图源行为时，必须同步更新该 JSON 示例和“地图创建与销毁”页面说明。默认配置、示例和文档不得包含私有 token、账号或内网地址。
```

- [ ] **Step 5: Run focused tests and the complete documentation build**

Run: `npm test -- test/WebsiteMapSources.test.ts && npm run docs:build`

Expected: focused tests pass; API coverage reports 0 errors; the documentation build exits with code 0.

- [ ] **Step 6: Perform browser acceptance checks**

Start the local documentation site and verify the “地图创建与销毁 → 管理多个底图” demo:

1. Immediately after load, “移除矢量底图” is enabled and “移除卫星底图” is disabled.
2. Click “添加卫星底图”; “移除卫星底图” becomes enabled.
3. Remove vector and satellite layers independently; each status label changes correctly.

- [ ] **Step 7: Commit documentation and rules**

```bash
git add website/src/views/EarthCreateView.vue website/AGENTS.md test/WebsiteMapSources.test.ts
git commit -m "docs: explain runtime map source configuration"
```

### Task 5: Final verification

**Files:**
- Verify all files changed by Tasks 1–4.

**Interfaces:**
- Consumes the committed runtime configuration, examples, tests, and documentation.
- Produces an implementation ready for review on the current branch.

- [ ] **Step 1: Run repository verification**

Run: `npm run verify`

Expected: typecheck, lint, all Vitest files, and package build exit with code 0. Existing lint warnings may remain only if they were present before this feature.

- [ ] **Step 2: Re-run documentation verification**

Run: `npm run docs:build`

Expected: documentation typecheck, API coverage, and Vite build exit with code 0.

- [ ] **Step 3: Inspect the final change set**

Run: `git diff HEAD~4..HEAD --check && git status --short`

Expected: no whitespace errors and a clean working tree.

- [ ] **Step 4: Request final review and hand off the branch**

Report the deployment file path, fallback behavior, test commands, and commits. Keep the branch intact for the user’s chosen integration workflow.

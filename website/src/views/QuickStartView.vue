<script setup lang="ts">
import ApiReference from '../components/docs/ApiReference.vue';
import CodeBlock from '../components/docs/CodeBlock.vue';
import PageAnchor from '../components/docs/PageAnchor.vue';

interface AnchorItem {
  id: string;
  label: string;
  children?: AnchorItem[];
}

const anchors: AnchorItem[] = [
  { id: 'requirements', label: '环境要求' },
  { id: 'install', label: '安装' },
  { id: 'import', label: '引入' },
  { id: 'offline', label: '离线安装' },
  { id: 'next-step', label: '下一步' }
];

const installationCode = `npm install @vrsim/earth-engine-ol@2.0.0 ol@10.9.0`;

const dependenciesCode = `{
  "dependencies": {
    "@vrsim/earth-engine-ol": "2.0.0",
    "ol": "10.9.0"
  }
}`;

const importCode = `import { onBeforeUnmount } from 'vue';
import { useEarth, type UseEarthOptions } from '@vrsim/earth-engine-ol';
import '@vrsim/earth-engine-ol/style.css';

const options: UseEarthOptions = {
  target: 'map'
};

const earth = useEarth(options);

onBeforeUnmount(() => earth.destroy());`;

const offlinePreparationCode = `# 在真实业务项目，或它的 package.json / package-lock.json 完整副本中执行
npm install --package-lock-only --save-exact ol@10.9.0 ./vrsim-earth-engine-ol-2.0.0.tgz
npm ci --cache ./npm-cache --ignore-scripts --no-audit --no-fund`;

const offlineInstallationCode = `npm ci --offline --cache ./npm-cache --ignore-scripts --no-audit --no-fund`;
</script>

<template>
  <div class="doc-page-layout">
    <article class="doc-page">
      <header class="doc-hero">
        <span class="doc-hero__eyebrow">快速上手</span>
        <h1>安装</h1>
        <p>完成 2.0.0 的环境检查、在线安装和离线物料准备，并从稳定的公开入口开始编码。</p>

        <el-steps class="install-overview" :active="4" finish-status="success" simple>
          <el-step title="检查环境" />
          <el-step title="安装依赖" />
          <el-step title="引入 API" />
          <el-step title="创建地图" />
        </el-steps>
      </header>

      <section id="requirements" class="doc-prose">
        <h2 class="doc-h2">环境要求</h2>
        <p>2.0.0 使用项目发布时锁定的 Node.js 与 npm 主版本范围。开始前请先核对本地环境，避免安装成功后在构建阶段出现版本不一致。</p>

        <el-card class="install-card" shadow="never">
          <template #header>
            <div class="install-card__header">
              <span>版本基线</span>
              <el-tag type="primary" effect="plain">earth-engine-ol 2.0.0</el-tag>
            </div>
          </template>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="Node.js">
              <el-tag type="success" effect="plain">&gt;=24.18.0 &lt;25</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="npm">
              <el-tag type="success" effect="plain">&gt;=11 &lt;12</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="OpenLayers">
              <el-tag effect="plain">10.9.0</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="模块格式">
              <el-tag effect="plain">ESM only</el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </el-card>

        <el-alert class="doc-prose__alert" type="info" :closable="false" show-icon>
          <template #title>仅提供 ESM 入口</template>
          <p>请使用支持 ESM 的构建工具或运行时。2.0.0 只公开包根入口和 <code>style.css</code>，不要从未声明的功能子路径导入。</p>
        </el-alert>
      </section>

      <section id="install" class="doc-prose">
        <h2 class="doc-h2">安装</h2>
        <p>在业务项目中同时安装引擎和经过验证的 OpenLayers 版本：</p>
        <div class="install-code">
          <CodeBlock :code="installationCode" lang="bash" />
        </div>

        <el-alert class="doc-prose__alert" type="warning" :closable="false" show-icon>
          <template #title>optional peer 不等于运行时可选</template>
          <p>
            <code>ol</code> 在引擎发布包中声明为 optional peer，仅表示安装引擎 tgz 时 npm 不会随包下载或安装 OpenLayers。业务项目的构建和运行仍必须提供
            OpenLayers；建议固定使用已验证的 <code>ol@10.9.0</code>。
          </p>
        </el-alert>

        <p>安装完成后，业务项目的直接依赖应明确包含这两个版本：</p>
        <div class="install-code">
          <CodeBlock :code="dependenciesCode" lang="json" />
        </div>
      </section>

      <section id="import" class="doc-prose">
        <h2 class="doc-h2">引入</h2>
        <p>
          JavaScript API 统一从包根入口引入，公共样式统一从
          <code>@vrsim/earth-engine-ol/style.css</code> 引入。下面以 Vue 组件为例，展示类型导入、实例创建和卸载清理的完整边界。
        </p>
        <div class="install-code">
          <CodeBlock :code="importCode" lang="typescript" />
        </div>

        <el-card class="install-card install-card--references" shadow="never">
          <template #header>
            <div class="install-card__header">
              <span>快速定位本节 API</span>
              <el-tag type="info" effect="plain">点击查看定义</el-tag>
            </div>
          </template>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="方法">
              <div class="install-reference-list">
                <ApiReference kind="method" to="/guide/earth-create#api-method-use-earth">useEarth()</ApiReference>
                <ApiReference kind="method" to="/guide/earth-create#api-method-destroy">earth.destroy()</ApiReference>
              </div>
            </el-descriptions-item>
            <el-descriptions-item label="类型">
              <ApiReference kind="type" to="/guide/earth-create#api-type-use-earth-options">UseEarthOptions</ApiReference>
            </el-descriptions-item>
            <el-descriptions-item label="属性">
              <ApiReference kind="property" to="/guide/earth-create#api-property-target">target</ApiReference>
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </section>

      <section id="offline" class="doc-prose">
        <h2 class="doc-h2">离线安装</h2>
        <p>
          引擎 tgz 不携带普通、可选或 bundled runtime dependency，因此它可以在空 npm
          缓存中单独完成安装；但这只验证引擎包本身可安装，不代表业务项目已经具备可构建、可运行的地图环境。
        </p>

        <el-alert class="doc-prose__alert" type="warning" :closable="false" show-icon>
          <template #title>必须准备业务项目的完整依赖闭包</template>
          <p>
            单独准备 OpenLayers 的依赖仍不足以安装真实业务。请在联网环境使用业务项目本身的 <code>package.json</code> 和
            <code>package-lock.json</code>，把引擎、<code>ol@10.9.0</code> 及业务全部依赖写入同一锁文件并预热缓存。
          </p>
        </el-alert>

        <el-steps class="offline-steps" direction="vertical" :active="3" finish-status="success">
          <el-step title="1. 在真实业务依赖图中预热">
            <template #description>
              <p>在真实业务项目或其完整依赖文件副本中锁定引擎与 OL，再通过 <code>npm ci</code> 将整个业务依赖闭包写入独立缓存。</p>
              <div class="install-code">
                <CodeBlock :code="offlinePreparationCode" lang="bash" />
              </div>
            </template>
          </el-step>

          <el-step title="2. 传输全部离线物料">
            <template #description>
              <p>
                保持相同相对路径，将业务 <code>package.json</code>、<code>package-lock.json</code>、<code>npm-cache</code> 和
                <code>vrsim-earth-engine-ol-2.0.0.tgz</code> 一并复制到离线环境。
              </p>
            </template>
          </el-step>

          <el-step title="3. 按同一锁文件强制离线安装">
            <template #description>
              <p>
                在离线业务项目中使用同一锁文件执行 <code>npm ci</code>。下面以禁用安装脚本的安全验收基线为例；若业务依赖必要脚本，应先审计再按项目策略启用。
              </p>
              <div class="install-code">
                <CodeBlock :code="offlineInstallationCode" lang="bash" />
              </div>
            </template>
          </el-step>
        </el-steps>
      </section>

      <section id="next-step" class="doc-prose">
        <h2 class="doc-h2">下一步</h2>
        <el-card class="install-card install-next" shadow="never">
          <p>依赖与样式就绪后，继续创建第一张地图；如果项目来自 1.x，请先查看迁移入口、生命周期和能力映射。</p>
          <div class="install-next__actions">
            <RouterLink v-slot="{ navigate }" to="/guide/earth-create" custom>
              <el-button type="primary" @click="navigate">创建第一张地图</el-button>
            </RouterLink>
            <RouterLink v-slot="{ navigate }" to="/guide/migration-v2" custom>
              <el-button @click="navigate">查看 1.x → 2.0 迁移</el-button>
            </RouterLink>
          </div>
        </el-card>
      </section>
    </article>

    <aside class="doc-page-layout__aside">
      <PageAnchor title="安装" :items="anchors" />
    </aside>
  </div>
</template>

<style scoped>
.install-overview {
  margin-top: 24px;
}

.install-card,
.install-code {
  margin-top: 16px;
}

.install-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  font-weight: 600;
}

.install-code {
  overflow: hidden;
  border: 1px solid var(--el-border-color-light, var(--doc-border));
  border-radius: 8px;
}

.install-card--references {
  margin-top: 20px;
}

.install-reference-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.offline-steps {
  margin-top: 20px;
}

.offline-steps :deep(.el-step__description) {
  max-width: 100%;
  padding: 2px 0 22px;
}

.offline-steps :deep(.el-step__description p) {
  margin: 0;
  color: var(--el-text-color-regular, var(--doc-muted));
  line-height: 1.7;
}

.offline-steps :deep(.install-code) {
  margin-top: 12px;
}

.install-next p {
  margin: 0;
  color: var(--el-text-color-regular, var(--doc-muted));
  line-height: 1.7;
}

.install-next__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 18px;
}

@media (max-width: 720px) {
  .install-overview {
    display: none;
  }

  .install-card__header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>

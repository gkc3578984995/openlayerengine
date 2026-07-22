<template>
  <article class="doc-page">
    <header class="doc-hero">
      <span class="doc-hero__eyebrow">导航提示</span>
      <h1>页面未找到</h1>
      <p>当前地址没有对应的文档页面，可能是链接已过期或路径输入有误。</p>
    </header>

    <el-result icon="warning" title="404" sub-title="请从文档首页、组件目录或 API 查询继续。">
      <template #extra>
        <el-space wrap>
          <RouterLink v-slot="{ navigate }" to="/" custom><el-button type="primary" @click="navigate">返回文档首页</el-button></RouterLink>
          <RouterLink v-slot="{ navigate }" to="/components/core/earth" custom><el-button @click="navigate">浏览组件</el-button></RouterLink>
          <RouterLink v-slot="{ navigate }" to="/api/methods" custom><el-button @click="navigate">查询 API</el-button></RouterLink>
        </el-space>
      </template>
    </el-result>
  </article>
</template>

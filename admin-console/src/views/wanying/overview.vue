<script setup lang="ts">
import WanyingPage from "./components/WanyingPage.vue";
import AnalyticsBoard from "./analytics.vue";
</script>

<template>
  <WanyingPage title="平台概览" subtitle="平台累计规模、周期经营指标、收入与 AI 生产质量总览。">
    <AnalyticsBoard />
  </WanyingPage>
</template>

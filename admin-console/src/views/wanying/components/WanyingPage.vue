<script setup lang="ts">
defineProps<{
  title: string;
  subtitle: string;
}>();
</script>

<template>
  <div class="page">
    <header>
      <div>
        <h1>{{ title }}</h1>
        <p>{{ subtitle }}</p>
      </div>
      <div class="extra">
        <slot name="extra" />
      </div>
    </header>
    <slot />
  </div>
</template>

<style scoped>
.page {
  padding: 4px;
}
.page > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
}
h1 {
  margin: 0 0 6px;
  font-size: 22px;
}
.page header p {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.extra {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  ElCard,
  ElEmpty,
  ElTable,
  ElTableColumn
} from "element-plus";
import { http } from "@/utils/http";
import { message } from "@/utils/message";
import WanyingPage from "./components/WanyingPage.vue";
import {
  auditActionLabel,
  auditDetailText,
  auditTargetText,
  data,
  errorText,
  formatTime
} from "./utils/format";
import { names } from "./utils/constants";

const [title, subtitle] = names.logs;
const loading = ref(false);
const rows = ref<any[]>([]);

async function load() {
  loading.value = true;
  try {
    rows.value = data(await http.get("/admin/audit-logs"));
  } catch (error: any) {
    message(errorText(error) || "数据加载失败", { type: "error" });
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <WanyingPage :title="title" :subtitle="subtitle">
    <ElCard shadow="never" v-loading="loading">
      <ElTable :data="rows" stripe>
        <ElTableColumn label="管理员" width="130">
          <template #default="{ row }">{{ row.admin_username || "-" }}</template>
        </ElTableColumn>
        <ElTableColumn label="操作" min-width="170">
          <template #default="{ row }">{{ auditActionLabel(row.action) }}</template>
        </ElTableColumn>
        <ElTableColumn label="操作对象" min-width="220">
          <template #default="{ row }">{{ auditTargetText(row) }}</template>
        </ElTableColumn>
        <ElTableColumn label="说明" min-width="360" show-overflow-tooltip>
          <template #default="{ row }">{{ auditDetailText(row) }}</template>
        </ElTableColumn>
        <ElTableColumn prop="created_at" label="创建时间" min-width="170">
          <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
        </ElTableColumn>
      </ElTable>
      <ElEmpty v-if="!rows.length" description="暂无数据" />
    </ElCard>
  </WanyingPage>
</template>

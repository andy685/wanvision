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
import { data, errorText, formatTime, paymentProviderLabel, statusLabel } from "./utils/format";
import { names } from "./utils/constants";

const [title, subtitle] = names.orders;
const loading = ref(false);
const rows = ref<any[]>([]);

async function load() {
  loading.value = true;
  try {
    rows.value = data(await http.get("/admin/orders"));
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
        <ElTableColumn prop="order_no" label="订单号" min-width="190" />
        <ElTableColumn prop="user_phone" label="用户手机号" width="150" />
        <ElTableColumn prop="user_nickname" label="用户昵称" width="140" />
        <ElTableColumn prop="workspace_name" label="工作区" min-width="160" />
        <ElTableColumn label="支付渠道" width="120">
          <template #default="{ row }">{{ paymentProviderLabel(row.payment_provider) }}</template>
        </ElTableColumn>
        <ElTableColumn label="金额" width="100">
          <template #default="{ row }">￥{{ ((row.amount_fen || 0) / 100).toFixed(2) }}</template>
        </ElTableColumn>
        <ElTableColumn prop="credits" label="积分" width="100" />
        <ElTableColumn prop="created_at" label="创建时间" min-width="170">
          <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
        </ElTableColumn>
        <ElTableColumn label="状态">
          <template #default="{ row }">{{ statusLabel(row.status) }}</template>
        </ElTableColumn>
      </ElTable>
      <ElEmpty v-if="!rows.length" description="暂无数据" />
    </ElCard>
  </WanyingPage>
</template>

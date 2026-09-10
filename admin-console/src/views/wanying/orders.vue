<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  ElButton,
  ElCard,
  ElEmpty,
  ElMessageBox,
  ElTable,
  ElTableColumn
} from "element-plus";
import { http } from "@/utils/http";
import { message } from "@/utils/message";
import { useUserStoreHook } from "@/store/modules/user";
import WanyingPage from "./components/WanyingPage.vue";
import { data, errorText, formatTime, paymentProviderLabel, statusLabel } from "./utils/format";
import { names } from "./utils/constants";

const [title, subtitle] = names.orders;
const loading = ref(false);
const rows = ref<any[]>([]);
const userStore = useUserStoreHook();
const isSuperAdmin = computed(() => userStore.roles.includes("super_admin"));

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

async function refundOrder(row: any) {
  if (!isSuperAdmin.value) {
    message("只有超级管理员可以执行退款", { type: "warning" });
    return;
  }
  try {
    const { value: reason } = await ElMessageBox.prompt(
      `确定对订单 ${row.order_no} 退款 ${row.credits} 积分吗？退款后将从用户余额中扣回。`,
      "确认退款",
      {
        confirmButtonText: "确认退款",
        cancelButtonText: "取消",
        type: "warning",
        inputPlaceholder: "必填，如：用户投诉、重复充值",
        inputValidator: (value: string) =>
          value?.trim() ? true : "退款理由不能为空"
      }
    );
    await http.request("post", `/admin/orders/${row.order_no}/refund`, {
      data: { reason: reason.trim() }
    });
    await load();
    message("退款成功", { type: "success" });
  } catch (error: any) {
    if (error !== "cancel" && error?.message !== "cancel")
      message(errorText(error) || "退款失败", { type: "error" });
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
        <ElTableColumn label="操作" width="120">
          <template #default="{ row }">
            <ElButton v-if="row.status === 'paid' && isSuperAdmin" link type="danger" @click="refundOrder(row)">退款</ElButton>
            <span v-else style="color: var(--el-text-color-secondary); font-size: 12px;">-</span>
          </template>
        </ElTableColumn>
      </ElTable>
      <ElEmpty v-if="!rows.length" description="暂无数据" />
    </ElCard>
  </WanyingPage>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  ElButton,
  ElCard,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElMessageBox,
  ElTable,
  ElTableColumn,
  ElTag
} from "element-plus";
import { http } from "@/utils/http";
import { message } from "@/utils/message";
import { useUserStoreHook } from "@/store/modules/user";
import WanyingPage from "./components/WanyingPage.vue";
import { data, errorText, formatTime, statusLabel, statusTagType } from "./utils/format";
import { names } from "./utils/constants";

const [title, subtitle] = names.users;
const loading = ref(false);
const rows = ref<any[]>([]);
const dialogOpen = ref(false);
const saving = ref(false);
const editing = ref<any>(null);
const form = ref<any>({});
const userStore = useUserStoreHook();
const hasPerm = (perm: string) => {
  const perms = userStore.permissions || [];
  return perms.includes("*") || perms.includes(perm);
};

async function load() {
  loading.value = true;
  try {
    rows.value = data(await http.get("/admin/users"));
  } catch (error: any) {
    message(errorText(error) || "数据加载失败", { type: "error" });
  } finally {
    loading.value = false;
  }
}

async function toggleUserStatus(row: any) {
  const next = row.status === "active" ? "disabled" : "active";
  try {
    const { value: reason } = await ElMessageBox.prompt(
      `请输入${statusLabel(next)}用户 ${row.phone} 的理由`,
      `确认${statusLabel(next)}`,
      {
        confirmButtonText: "确认",
        cancelButtonText: "取消",
        inputPlaceholder: "必填，如：违规使用、用户申请注销",
        inputValidator: (value: string) =>
          value?.trim() ? true : "操作理由不能为空"
      }
    );
    await http.request("patch", `/admin/users/${row.id}/status`, {
      data: { status: next, reason: reason.trim() }
    });
    row.status = next;
    message(`用户已${statusLabel(next)}`, { type: "success" });
  } catch (error: any) {
    if (error !== "cancel" && error?.message !== "cancel")
      message(errorText(error) || "状态更新失败", { type: "error" });
  }
}

function openCredit(row: any) {
  editing.value = row;
  form.value = { amount: 0, note: "" };
  dialogOpen.value = true;
}

async function saveCredit() {
  saving.value = true;
  try {
    const { amount, note } = form.value;
    await http.request("post", `/admin/users/${editing.value.id}/credits`, {
      data: { amount: Math.trunc(Number(amount)), note }
    });
    dialogOpen.value = false;
    await load();
    message("积分调整已生效", { type: "success" });
  } catch (error: any) {
    message(errorText(error) || "积分调整失败", { type: "error" });
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <WanyingPage :title="title" :subtitle="subtitle">
    <ElCard shadow="never" v-loading="loading">
      <ElTable :data="rows" stripe>
        <ElTableColumn prop="phone" label="手机号" />
        <ElTableColumn prop="created_at" label="注册时间" width="170">
          <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
        </ElTableColumn>
        <ElTableColumn prop="last_active_at" label="最后操作时间" width="170">
          <template #default="{ row }">{{ formatTime(row.last_active_at) }}</template>
        </ElTableColumn>
        <ElTableColumn prop="balance" label="积分余额" />
        <ElTableColumn prop="frozen" label="冻结积分" />
        <ElTableColumn label="状态" width="100">
          <template #default="{ row }">
            <ElTag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="180">
          <template #default="{ row }">
            <template v-if="hasPerm('user:write')">
              <ElButton link type="primary" @click="openCredit(row)">调账</ElButton>
              <ElButton link :type="row.status === 'active' ? 'danger' : 'success'" @click="toggleUserStatus(row)">
                {{ row.status === "active" ? "停用" : "启用" }}
              </ElButton>
            </template>
            <span v-else style="color: var(--el-text-color-secondary); font-size: 12px;">-</span>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>

    <ElDialog v-model="dialogOpen" title="积分调整" width="560px">
      <p style="margin: 0 0 16px; color: var(--el-text-color-secondary); font-size: 13px;">
        用户：{{ editing?.phone }}（当前余额 {{ editing?.balance || 0 }}，冻结 {{ editing?.frozen || 0 }}）
      </p>
      <ElForm label-position="top">
        <ElFormItem label="调整金额">
          <ElInputNumber v-model="form.amount" :min="-1000000" :max="1000000" :step="1" style="width: 100%;" />
          <div class="field-hint">正数为增加积分，负数为扣减积分。</div>
        </ElFormItem>
        <ElFormItem label="调整原因">
          <ElInput v-model="form.note" placeholder="必填，如：活动赠送、投诉补偿、违规扣减" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogOpen = false">取消</ElButton>
        <ElButton type="primary" :loading="saving" @click="saveCredit">保存</ElButton>
      </template>
    </ElDialog>
  </WanyingPage>
</template>

<style scoped>
.field-hint {
  margin-top: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}
</style>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  ElButton,
  ElCard,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElOption,
  ElSelect,
  ElSwitch,
  ElTable,
  ElTableColumn
} from "element-plus";
import { http } from "@/utils/http";
import { message } from "@/utils/message";
import WanyingPage from "./components/WanyingPage.vue";
import { data, errorText, label } from "./utils/format";
import { names } from "./utils/constants";

const [title, subtitle] = names.pricing;
const loading = ref(false);
const rows = ref<any[]>([]);
const dialogOpen = ref(false);
const saving = ref(false);
const editing = ref<any>(null);
const form = ref<any>({});

const videoSeconds = (action: string) => {
  const matched = /^video_(\d+)s$/.exec(String(action || ""));
  return matched ? Number(matched[1]) : 0;
};

const rowsView = computed(() =>
  rows.value.filter(row => videoSeconds(row.action) === 0).map(row => ({
    ...row,
    unitLabel: row.action === "video" ? "积分 / 秒" : "积分 / 次"
  }))
);

async function load() {
  loading.value = true;
  try {
    rows.value = data(await http.get("/pricing/admin"));
  } catch (error: any) {
    message(errorText(error) || "数据加载失败", { type: "error" });
  } finally {
    loading.value = false;
  }
}

function open(row?: any) {
  editing.value = row;
  form.value = row ? { ...row } : { action: "", service_type: "text", price: 0, unit: "task", is_active: true };
  dialogOpen.value = true;
}

async function save() {
  saving.value = true;
  try {
    const payload = {
      ...form.value,
      unit: form.value.action === "video" ? "second" : form.value.unit || "task"
    };
    await http.request(
      editing.value ? "put" : "post",
      editing.value ? `/pricing/admin/${editing.value.id}` : "/pricing/admin",
      { data: payload }
    );
    dialogOpen.value = false;
    await load();
    message("保存成功", { type: "success" });
  } catch (error: any) {
    message(errorText(error) || "保存失败", { type: "error" });
  } finally {
    saving.value = false;
  }
}

async function togglePricing(row: any) {
  try {
    await http.request("put", `/pricing/admin/${row.id}`, {
      data: { is_active: !row.is_active }
    });
    row.is_active = !row.is_active;
    message("价格规则状态已更新", { type: "success" });
  } catch (error: any) {
    message(errorText(error) || "状态更新失败", { type: "error" });
  }
}

onMounted(load);
</script>

<template>
  <WanyingPage :title="title" :subtitle="subtitle">
    <template #extra>
      <ElButton type="primary" @click="open()">新增价格规则</ElButton>
    </template>
    <ElCard shadow="never" v-loading="loading">
      <ElTable :data="rowsView" stripe>
        <ElTableColumn label="生成环节" min-width="200">
          <template #default="{ row }">{{ label(row.action) }}</template>
        </ElTableColumn>
        <ElTableColumn prop="service_type" label="服务类型" />
        <ElTableColumn label="积分" min-width="160">
          <template #default="{ row }">
            <span>{{ row.price }}</span>
            <span class="pricing-per-second">· {{ row.unitLabel }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="状态">
          <template #default="{ row }">
            <ElSwitch :model-value="row.is_active" @change="togglePricing(row)" />
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作">
          <template #default="{ row }">
            <ElButton link type="primary" @click="open(row)">编辑</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>

    <ElDialog v-model="dialogOpen" title="价格规则" width="560px">
      <ElForm label-position="top">
        <ElFormItem label="规则名称 / action">
          <ElInput v-model="form.action" :disabled="!!editing" placeholder="如 character_image" />
        </ElFormItem>
        <ElFormItem label="服务类型">
          <ElSelect v-model="form.service_type" :disabled="!!editing">
            <ElOption label="文本" value="text" />
            <ElOption label="图片" value="image" />
            <ElOption label="视频" value="video" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem :label="form.action === 'video' ? '每秒积分' : '积分价格'"><ElInputNumber v-model="form.price" :min="0" /></ElFormItem>
        <ElFormItem v-if="form.action === 'video'" label="计费说明">
          <div class="pricing-hint">视频按秒计费：实际消耗 = 每秒积分 × 生成时长。可选时长由视频模型和前端生成参数控制。</div>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogOpen = false">取消</ElButton>
        <ElButton type="primary" :loading="saving" @click="save">保存</ElButton>
      </template>
    </ElDialog>
  </WanyingPage>
</template>

<style scoped>
.pricing-per-second {
  margin-left: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.pricing-hint {
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.6;
}
</style>

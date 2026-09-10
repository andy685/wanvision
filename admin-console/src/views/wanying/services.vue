<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  ElButton,
  ElCard,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessageBox,
  ElOption,
  ElSelect,
  ElSwitch
} from "element-plus";
import { http } from "@/utils/http";
import { message } from "@/utils/message";
import WanyingPage from "./components/WanyingPage.vue";
import { data, errorText } from "./utils/format";
import { AI_GATEWAY_BASE_URL, names, quickConfigs } from "./utils/constants";

const [title, subtitle] = names.services;
const loading = ref(false);
const rows = ref<any[]>([]);
const dialogOpen = ref(false);
const saving = ref(false);
const editing = ref<any>(null);
const form = ref<any>({});
const quickApiKey = ref("");
const quickSaving = ref(false);
const modelsLoading = ref(false);
const testing = ref(false);

const serviceTypes = [
  { type: "text", label: "文本", desc: "剧本改写、角色场景提取、分镜拆解等文本能力" },
  { type: "image", label: "图片", desc: "角色图、场景图与镜头图等图片生成能力" },
  { type: "video", label: "视频", desc: "分镜视频直出生成能力" }
];

const quickConfigRows = computed(() =>
  quickConfigs.map(item => ({
    ...item,
    label: serviceTypes.find(t => t.type === item.service_type)?.label || item.service_type,
    effectiveDefaultModel: defaultModelOf(item.service_type)
  }))
);

function byType(type: string) {
  return rows.value.filter(row => row.service_type === type);
}

function defaultPreset(type: string) {
  return quickConfigs.find(item => item.service_type === type) || quickConfigs[0];
}

function firstByType(type: string) {
  return byType(type)[0];
}

function defaultModelOf(type: string) {
  const active = byType(type)
    .filter(row => row.is_active)
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))[0];
  return modelList(active?.model)[0] || "";
}

function isQuickDefault(item: any, model: string, index: number) {
  return item.effectiveDefaultModel ? model === item.effectiveDefaultModel : index === 0;
}

async function load() {
  loading.value = true;
  try {
    rows.value = data(await http.get("/ai-configs"));
  } catch (error: any) {
    message(errorText(error) || "数据加载失败", { type: "error" });
  } finally {
    loading.value = false;
  }
}

async function applyQuickConfig() {
  if (!quickApiKey.value.trim()) {
    message("请输入统一 API Key", { type: "warning" });
    return;
  }
  quickSaving.value = true;
  try {
    for (const preset of quickConfigs) {
      const existing = firstByType(preset.service_type);
      const payload = { ...preset, api_key: quickApiKey.value, is_active: true };
      if (existing)
        await http.request("put", `/ai-configs/${existing.id}`, { data: payload });
      else await http.request("post", "/ai-configs", { data: payload });
    }
    quickApiKey.value = "";
    await load();
    message("AI 服务一键配置成功", { type: "success" });
  } catch (error: any) {
    message(errorText(error) || "一键配置失败", { type: "error" });
  } finally {
    quickSaving.value = false;
  }
}

function open(rowOrType?: any) {
  const row = typeof rowOrType === "string" ? firstByType(rowOrType) : rowOrType;
  const type = typeof rowOrType === "string" ? rowOrType : row?.service_type || "text";
  const preset = defaultPreset(type);
  editing.value = row;
  form.value = row
    ? {
        ...row,
        model: Array.isArray(row.model) ? row.model.join(", ") : row.model || ""
      }
    : {
        name: preset?.name || "",
        service_type: type,
        provider: preset?.provider || "openai",
        base_url: preset?.base_url || AI_GATEWAY_BASE_URL,
        api_key: "",
        model: Array.isArray(preset?.model) ? preset.model.join(", ") : "",
        priority: preset?.priority || 0,
        is_active: true
      };
  dialogOpen.value = true;
}

function applyTemplate(type: string) {
  open(type);
}

function modelList(value: any) {
  return Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);
}

async function fetchModels() {
  const d = form.value;
  if (!d.provider || !d.base_url) {
    message("请先填写服务商和 Base URL", { type: "warning" });
    return;
  }
  if (!d.api_key && !editing.value?.id) {
    message("请先填写 API Key", { type: "warning" });
    return;
  }

  modelsLoading.value = true;
  try {
    const result = data(
      await http.request("post", "/ai-configs/models", {
        data: {
          config_id: editing.value?.id,
          service_type: d.service_type,
          provider: d.provider,
          base_url: d.base_url,
          api_key: d.api_key
        }
      })
    );
    const models = Array.isArray(result?.models) ? result.models : [];
    if (!result?.ok || !models.length) {
      message(result?.message || "没有拉取到可用模型", { type: "warning" });
      return;
    }
    d.model = models.join(", ");
    const label = serviceTypes.find(item => item.type === d.service_type)?.label || "";
    message(`已拉取 ${models.length} 个${label}模型`, { type: "success" });
  } catch (error: any) {
    message(errorText(error) || "模型拉取失败", { type: "error" });
  } finally {
    modelsLoading.value = false;
  }
}

async function testConfig(target = form.value, configId = editing.value?.id) {
  if (!target.provider || !target.base_url) {
    message("请先填写服务商和 Base URL", { type: "warning" });
    return;
  }
  if (!target.api_key && !configId) {
    message("请先填写 API Key", { type: "warning" });
    return;
  }

  testing.value = true;
  try {
    const result = data(
      await http.request("post", "/ai-configs/test", {
        data: {
          config_id: configId,
          service_type: target.service_type,
          provider: target.provider,
          base_url: target.base_url,
          api_key: target.api_key,
          model: modelList(target.model)
        }
      })
    );
    if (result?.ok) message("测试成功", { type: "success" });
    else message(result?.message || "测试失败", { type: "error" });
  } catch (error: any) {
    message(errorText(error) || "测试失败", { type: "error" });
  } finally {
    testing.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    const d = form.value;
    const existing = editing.value || firstByType(d.service_type);
    const url = existing ? `/ai-configs/${existing.id}` : "/ai-configs";
    await http.request(
      existing ? "put" : "post",
      url,
      {
        data: {
          ...d,
          model: String(d.model || "")
            .split(",")
            .map((x: string) => x.trim())
            .filter(Boolean)
        }
      }
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

async function deleteConfig(row: any) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${row.name || row.provider}」吗？删除后该类型会变为未配置。`,
      "删除 AI 服务配置",
      { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" }
    );
    await http.request("delete", `/ai-configs/${row.id}`);
    await load();
    message("已删除", { type: "success" });
  } catch (error: any) {
    if (error === "cancel" || error === "close") return;
    message(errorText(error) || "删除失败", { type: "error" });
  }
}

async function toggleConfig(row: any) {
  try {
    await http.request("put", `/ai-configs/${row.id}`, {
      data: { is_active: !row.is_active }
    });
    row.is_active = !row.is_active;
    message("AI 服务状态已更新", { type: "success" });
  } catch (error: any) {
    message(errorText(error) || "状态更新失败", { type: "error" });
  }
}

onMounted(load);
</script>

<template>
  <WanyingPage :title="title" :subtitle="subtitle">
    <ElCard shadow="never" class="quick-card">
      <div class="card-head">
        <div>
          <div class="card-title">
            快捷配置
            <span class="recommend">推荐</span>
          </div>
          <p>输入 API Key，一次写入当前支持的文本、图片、视频配置。</p>
        </div>
        <a
          class="console-link"
          :href="AI_GATEWAY_BASE_URL"
          target="_blank"
          rel="noopener noreferrer"
        >前往 cloudapi.flowingcloud.com 获取 Key</a>
      </div>
      <div class="quick-row">
        <ElInput
          v-model="quickApiKey"
          type="password"
          show-password
          placeholder="API Key"
        />
        <ElButton :loading="quickSaving" type="primary" @click="applyQuickConfig"
          >写入配置</ElButton
        >
      </div>
      <div class="quick-models">
        <div v-for="item in quickConfigRows" :key="item.service_type" class="quick-model-row">
          <span class="type-label">{{ item.label }}</span>
          <span class="provider-chip">{{ item.provider }}</span>
          <span v-for="(m, i) in item.model" :key="m" class="model-chip">
            {{ m }}
            <em v-if="isQuickDefault(item, m, i)">默认</em>
          </span>
        </div>
      </div>
    </ElCard>

    <ElCard shadow="never" class="manual-card">
      <div class="card-title">手动模板</div>
      <p>选择服务类型后，直接用模板填充 `provider / base URL / model`。</p>
      <div class="template-row">
        <ElButton
          v-for="type in serviceTypes"
          :key="type.type"
          class="template-chip"
          native-type="button"
          @click="applyTemplate(type.type)"
        >
          {{ type.label }}
        </ElButton>
      </div>
    </ElCard>

    <section v-loading="loading" class="service-groups">
      <ElCard v-for="type in serviceTypes" :key="type.type" shadow="never" class="service-card">
        <div class="service-card-head">
          <div>
            <div class="card-title">{{ type.label }}配置</div>
            <p>{{ type.desc }}</p>
          </div>
          <ElButton type="primary" plain @click="open(type.type)">
            {{ firstByType(type.type) ? "配置/覆盖" : "新增" }}
          </ElButton>
        </div>
        <div v-if="byType(type.type).length" class="config-list">
          <div v-for="row in byType(type.type)" :key="row.id" class="config-row">
            <div class="config-main">
              <div class="config-title-line">
                <strong>{{ row.name || `${row.provider}-${row.service_type}` }}</strong>
                <span :class="['status-tag', row.api_key ? 'ok' : 'danger']">
                  {{ row.api_key ? "已配置" : "无密钥" }}
                </span>
                <span v-if="!row.is_active" class="status-tag">已停用</span>
              </div>
              <div class="config-url">{{ row.base_url || "未设置 Base URL" }}</div>
              <div class="config-models">
                <span v-for="m in modelList(row.model)" :key="m" class="model-chip">{{ m }}</span>
              </div>
            </div>
            <ElButton :loading="testing" text type="primary" @click="testConfig(row, row.id)">测试</ElButton>
            <ElSwitch :model-value="row.is_active" @change="toggleConfig(row)" />
            <ElButton text type="primary" @click="open(row)">编辑</ElButton>
            <ElButton text type="danger" @click="deleteConfig(row)">删除</ElButton>
          </div>
        </div>
        <div v-else class="empty-state">暂无配置</div>
      </ElCard>
    </section>

    <ElDialog v-model="dialogOpen" title="AI 服务配置" width="560px">
      <ElForm label-position="top">
        <ElFormItem label="服务名称"><ElInput v-model="form.name" /></ElFormItem>
        <ElFormItem label="服务类型">
          <ElSelect v-model="form.service_type">
            <ElOption label="文本" value="text" />
            <ElOption label="图片" value="image" />
            <ElOption label="视频" value="video" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="服务商"><ElInput v-model="form.provider" /></ElFormItem>
        <ElFormItem label="Base URL"><ElInput v-model="form.base_url" /></ElFormItem>
        <ElFormItem label="API Key">
          <ElInput v-model="form.api_key" type="password" show-password />
        </ElFormItem>
        <ElFormItem label="模型（逗号分隔）">
          <div class="model-row">
            <ElInput v-model="form.model" />
            <ElButton :loading="modelsLoading" @click="fetchModels">拉取模型</ElButton>
          </div>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton :loading="testing" @click="testConfig()">测试</ElButton>
        <ElButton @click="dialogOpen = false">取消</ElButton>
        <ElButton type="primary" :loading="saving" @click="save">保存</ElButton>
      </template>
    </ElDialog>
  </WanyingPage>
</template>

<style scoped>
.quick-card,
.manual-card,
.service-card {
  margin-bottom: 16px;
}

.card-head,
.service-card-head {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
}

.card-title {
  display: flex;
  gap: 8px;
  align-items: center;
  color: var(--el-text-color-primary);
  font-size: 16px;
  font-weight: 700;
}

p {
  margin: 6px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.recommend {
  padding: 2px 8px;
  color: var(--el-color-primary);
  font-size: 12px;
  font-weight: 700;
  background: var(--el-color-primary-light-9);
  border-radius: var(--el-border-radius-base);
}

.console-link {
  flex: 0 0 auto;
  margin-top: 30px;
  color: var(--el-color-primary);
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
}

.quick-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  margin-top: 18px;
}

.quick-row .el-button {
  min-width: 112px;
}

.quick-models {
  display: grid;
  gap: 9px;
  margin-top: 16px;
}

.quick-model-row,
.config-models {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  align-items: center;
}

.type-label {
  width: 32px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  font-weight: 700;
}

.provider-chip,
.model-chip,
.status-tag {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  color: var(--el-text-color-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  background: var(--el-fill-color-light);
  border-radius: var(--el-border-radius-base);
}

.provider-chip {
  color: var(--el-color-primary);
  font-weight: 800;
  text-transform: uppercase;
  background: var(--el-color-primary-light-9);
}

.model-chip em {
  margin-left: 5px;
  color: var(--el-color-primary);
  font-style: normal;
  font-weight: 700;
}

.template-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 22px;
}

.template-chip { min-width: 54px; font-weight: 700; }

.service-groups {
  display: grid;
  gap: 16px;
}

.config-list {
  display: grid;
  gap: 10px;
  margin-top: 18px;
}

.config-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto auto;
  gap: 10px;
  align-items: center;
  padding: 14px;
  background: var(--el-fill-color-extra-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
}

.config-main {
  min-width: 0;
}

.config-title-line {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.config-title-line strong {
  color: var(--el-text-color-primary);
  font-size: 14px;
}

.status-tag {
  min-height: 20px;
  font-family: inherit;
}

.status-tag.ok {
  color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}

.status-tag.danger {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}

.config-url {
  margin: 6px 0;
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  padding: 18px 0 2px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.model-row {
  display: flex;
  width: 100%;
  gap: 8px;
}

.model-row .el-button {
  flex: 0 0 auto;
}

@media (max-width: 768px) {
  .card-head,
  .service-card-head {
    display: block;
  }

  .console-link {
    display: inline-flex;
    margin-top: 12px;
  }

  .quick-row,
  .config-row {
    grid-template-columns: 1fr;
  }
}
</style>

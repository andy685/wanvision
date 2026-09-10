<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import {
  ElAlert,
  ElButton,
  ElCard,
  ElEmpty,
  ElInput,
  ElOption,
  ElSelect,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElTag
} from "element-plus";
import { http } from "@/utils/http";
import WanyingPage from "./components/WanyingPage.vue";
import {
  data,
  errorText,
  formatTime,
  resultHref,
  statusLabel,
  statusTagType,
  taskError,
  taskParams,
  typeLabel
} from "./utils/format";
import { names } from "./utils/constants";

const [title, subtitle] = names.tasks;

/** 后端 GET /admin/tasks 固定截取最近 500 条，前端据此提示是否还有更多 */
const SERVER_LIMIT = 500;
const REFRESH_INTERVAL = 30_000;

const loading = ref(false);
const loadError = ref("");
const rows = ref<any[]>([]);
const filters = ref({ type: "", status: "", keyword: "" });
const autoRefresh = ref(false);
const lastLoadedAt = ref<Date | null>(null);
let timer: ReturnType<typeof setInterval> | null = null;

const statusChips = [
  { key: "", label: "全部" },
  { key: "pending", label: "等待中" },
  { key: "processing", label: "处理中" },
  { key: "completed", label: "已完成" },
  { key: "failed", label: "失败" },
  { key: "cancelled", label: "已取消" }
];

const stats = computed(() => {
  const acc: Record<string, number> = {
    all: rows.value.length,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0
  };
  for (const row of rows.value) {
    const key = String(row?.status || "");
    if (key in acc) acc[key] += 1;
  }
  return acc;
});

const filteredRows = computed(() => {
  const keyword = filters.value.keyword.trim().toLowerCase();
  const type = filters.value.type;
  const status = filters.value.status;
  // 类型与状态在服务端已过滤，这里只在前端补齐一次，防止服务端筛选与前端 chip 不同步
  return rows.value.filter(row => {
    if (type && row.type !== type) return false;
    if (status && row.status !== status) return false;
    if (!keyword) return true;
    return [
      row.id,
      row.task_name,
      row.user_phone,
      row.user_nickname,
      row.provider,
      row.model,
      row.status,
      row.prompt,
      row.error_msg
    ]
      .filter(v => v !== null && v !== undefined)
      .some(v => String(v).toLowerCase().includes(keyword));
  });
});

/** 区分「真的没有任务」「筛选 / 搜索没命中」「加载失败」，避免运营误判成数据没落库 */
const emptyState = computed(() => {
  if (loadError.value)
    return {
      title: "数据加载失败",
      desc: loadError.value,
      action: "重新加载"
    };
  if (!rows.value.length)
    return {
      title: "还没有任何生成任务",
      desc: "用户在创作端触发 AI 生成（剧本改写、资产提取、图片 / 视频生成）后，记录会实时出现在这里。若刚触发过仍为空，请确认后端服务在正常运行。",
      action: "重新加载"
    };
  if (filters.value.keyword.trim())
    return {
      title: "没有匹配的任务",
      desc: `后端已返回 ${rows.value.length} 条任务，但没有命中关键词「${filters.value.keyword.trim()}」。可搜索任务 ID、任务名、手机号、模型或错误信息。`,
      action: "清空筛选条件"
    };
  return {
    title: "当前筛选条件下没有任务",
    desc: `后端已返回 ${rows.value.length} 条任务，但都不符合当前的类型 / 状态筛选。`,
    action: "清空筛选条件"
  };
});

const truncated = computed(() => rows.value.length >= SERVER_LIMIT);

function looksLikeUrl(value: string) {
  return /^https?:\/\//i.test(value) || value.startsWith("/");
}

function taskResultText(row: any) {
  const value = String(row?.result_url || "").trim();
  if (!value || row?.type !== "text" || looksLikeUrl(value)) return "";
  return value;
}

function taskResultUrl(row: any) {
  const value = String(row?.local_path || row?.result_url || "").trim();
  if (!value) return "";
  if (row?.type === "text" && !looksLikeUrl(value)) return "";
  return resultHref(value);
}

async function load() {
  loading.value = true;
  loadError.value = "";
  try {
    rows.value = data(
      await http.get("/admin/tasks", {
        params: {
          type: filters.value.type || undefined,
          status: filters.value.status || undefined
        }
      })
    );
    lastLoadedAt.value = new Date();
  } catch (error: any) {
    rows.value = [];
    loadError.value = errorText(error) || "数据加载失败，请稍后重试。";
  } finally {
    loading.value = false;
  }
}

function pickStatus(key: string) {
  if (filters.value.status === key) return;
  filters.value.status = key;
  load();
}

function resetFilters() {
  filters.value = { type: "", status: "", keyword: "" };
  load();
}

function handleEmptyAction() {
  if (loadError.value || !rows.value.length) load();
  else resetFilters();
}

function toggleAutoRefresh(value: boolean) {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (value) timer = setInterval(() => !loading.value && load(), REFRESH_INTERVAL);
}

onMounted(load);
onBeforeUnmount(() => toggleAutoRefresh(false));
</script>

<template>
  <WanyingPage :title="title" :subtitle="subtitle">
    <template #extra>
      <span v-if="lastLoadedAt" class="sync-time">
        更新于 {{ formatTime(lastLoadedAt) }}
      </span>
      <ElSwitch
        v-model="autoRefresh"
        active-text="自动刷新"
        @change="toggleAutoRefresh"
      />
      <ElButton :loading="loading" @click="load">刷新</ElButton>
    </template>

    <ElCard shadow="never" v-loading="loading">
      <div class="task-chips">
        <button
          v-for="chip in statusChips"
          :key="chip.key"
          type="button"
          class="task-chip"
          :class="{ 'is-active': filters.status === chip.key }"
          @click="pickStatus(chip.key)"
        >
          {{ chip.label }}
          <span class="task-chip-count">
            {{ chip.key ? stats[chip.key] : stats.all }}
          </span>
        </button>
      </div>

      <div class="task-filters">
        <ElSelect v-model="filters.type" clearable placeholder="任务类型" @change="load">
          <ElOption label="文本" value="text" />
          <ElOption label="图片" value="image" />
          <ElOption label="视频" value="video" />
        </ElSelect>
        <ElSelect v-model="filters.status" clearable placeholder="任务状态" @change="load">
          <ElOption label="等待中" value="pending" />
          <ElOption label="处理中" value="processing" />
          <ElOption label="已完成" value="completed" />
          <ElOption label="失败" value="failed" />
          <ElOption label="已取消" value="cancelled" />
        </ElSelect>
        <ElInput v-model="filters.keyword" clearable placeholder="搜索任务、账号、模型、错误" />
        <ElButton @click="resetFilters">重置</ElButton>
      </div>

      <ElAlert
        v-if="loadError"
        type="error"
        show-icon
        :closable="false"
        :title="emptyState.title"
        :description="emptyState.desc"
        class="task-alert"
      />

      <ElTable :data="filteredRows" stripe>
        <ElTableColumn type="expand" width="48">
          <template #default="{ row }">
            <div class="task-detail">
              <div>
                <strong>输入 / 生成文案</strong>
                <p>{{ row.prompt || "暂无文案" }}</p>
              </div>
              <div>
                <strong>模型与服务</strong>
                <p>{{ row.provider || "-" }} · {{ row.model || "-" }}</p>
              </div>
              <div>
                <strong>生成参数与参考素材</strong>
                <pre>{{ taskParams(row.params) }}</pre>
              </div>
              <div v-if="taskResultText(row) || taskResultUrl(row)" class="task-result">
                <strong>生成结果</strong>
                <pre v-if="taskResultText(row)">{{ taskResultText(row) }}</pre>
                <a v-else :href="taskResultUrl(row)" target="_blank" rel="noreferrer">查看生成结果</a>
              </div>
              <div v-if="row.error_msg" class="task-error">
                <strong>失败原因</strong>
                <p>{{ taskError(row.error_msg) }}</p>
              </div>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="id" label="ID" width="80" />
        <ElTableColumn prop="task_name" label="任务名称" min-width="170" />
        <ElTableColumn prop="user_phone" label="用户手机号" width="150" />
        <ElTableColumn prop="user_nickname" label="用户昵称" width="140" />
        <ElTableColumn label="类型">
          <template #default="{ row }">{{ typeLabel(row.type) }}</template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="100">
          <template #default="{ row }">
            <ElTag :type="statusTagType(row.status)" size="small" disable-transitions>
              {{ statusLabel(row.status) }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="credit_cost" label="消耗积分" width="100" />
        <ElTableColumn prop="model" label="模型" />
        <ElTableColumn label="创建时间" min-width="170">
          <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
        </ElTableColumn>
        <ElTableColumn label="失败原因" min-width="240">
          <template #default="{ row }">{{ row.error_msg ? taskError(row.error_msg) : "-" }}</template>
        </ElTableColumn>

        <template #empty>
          <div v-if="loading" class="task-empty">加载中…</div>
          <ElEmpty v-else :description="emptyState.title">
            <p class="task-empty-desc">{{ emptyState.desc }}</p>
            <ElButton type="primary" plain @click="handleEmptyAction">
              {{ emptyState.action }}
            </ElButton>
          </ElEmpty>
        </template>
      </ElTable>

      <div v-if="rows.length" class="task-footer">
        <span>
          共 {{ rows.length }} 条{{ filteredRows.length !== rows.length ? `，筛选后 ${filteredRows.length} 条` : "" }}
        </span>
        <span v-if="truncated" class="task-footer-warn">
          后端仅返回最近 {{ SERVER_LIMIT }} 条，更早的任务请用类型 / 状态筛选后查看。
        </span>
      </div>
    </ElCard>
  </WanyingPage>
</template>

<style scoped>
.sync-time {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.task-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.task-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 999px;
  background: transparent;
  color: var(--el-text-color-regular);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.task-chip:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
}
.task-chip.is-active {
  background: var(--el-color-primary);
  border-color: var(--el-color-primary);
  color: #fff;
}
.task-chip-count {
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  opacity: 0.75;
}
.task-filters {
  display: grid;
  grid-template-columns: 160px 160px minmax(220px, 1fr) auto;
  gap: 10px;
  margin-bottom: 12px;
}
.task-alert {
  margin-bottom: 12px;
}
.task-empty {
  padding: 24px 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.task-empty-desc {
  max-width: 460px;
  margin: 0 auto 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.7;
}
.task-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: space-between;
  margin-top: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.task-footer-warn {
  color: var(--el-color-warning);
}
.task-detail {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  padding: 16px 26px;
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-regular);
}
.task-detail strong {
  display: block;
  margin-bottom: 6px;
  color: var(--el-text-color-primary);
  font-size: 13px;
}
.task-detail p {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.7;
}
.task-detail pre {
  max-height: 180px;
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.task-detail a {
  color: var(--el-color-primary);
  font-size: 12px;
}
.task-detail .task-error {
  color: var(--el-color-danger);
}
@media (max-width: 800px) {
  .task-filters {
    grid-template-columns: 1fr;
  }
  .task-detail {
    grid-template-columns: 1fr;
  }
}
</style>

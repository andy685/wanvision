<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  ElButton,
  ElCard,
  ElDatePicker,
  ElEmpty,
  ElOption,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag
} from "element-plus";
import { http } from "@/utils/http";
import { message } from "@/utils/message";
import { resolveErrorMessage } from "@/utils/errorMessage";

type Metric = {
  label: string;
  value: string | number;
  helper: string;
  tone?: "green" | "amber" | "red" | "blue";
};

const loading = ref(false);
const range = ref<[string, string] | null>(null);
const preset = ref("30d");
const platform = ref<any>({});
const analytics = ref<any>({
  summary: {},
  charts: {},
  rankings: {},
  funnel: [],
  anomalies: [],
  notes: []
});

const data = (value: any) => value?.data ?? value ?? {};
const money = (value: unknown) => `￥${Number(value || 0).toFixed(2)}`;
const numberText = (value: unknown) => Number(value || 0).toLocaleString();
const typeLabel = (value: string) =>
  (
    {
      text: "文本",
      image: "图片",
      video: "视频",
      consume: "积分消费",
      recharge: "充值到账",
      gift: "注册赠送",
      welcome: "注册赠送",
      reserve: "任务冻结",
      freeze: "任务冻结",
      refund: "任务退款",
      recharge_refund: "充值退款",
      admin_adjust: "手工调账",
      character_image: "角色图片",
      scene_image: "场景图片",
      prop_image: "道具图片"
    } as Record<string, string>
  )[value] || value || "-";
const statusLabel = (value: string) =>
  (
    {
      pending: "等待中",
      processing: "处理中",
      completed: "已完成",
      failed: "失败",
      cancelled: "已取消"
    } as Record<string, string>
  )[value] || value || "-";
const providerLabel = (value: string) =>
  ({ wechat: "微信支付", alipay: "支付宝" } as Record<string, string>)[
    value
  ] || value || "-";

const summary = computed(() => analytics.value.summary || {});
const maxDaily = computed(() =>
  Math.max(
    1,
    ...(analytics.value.charts?.daily || []).map((item: any) =>
      Math.max(Number(item.tasks || 0), Number(item.consumed_credits || 0) / 10)
    )
  )
);
const maxActionCredits = computed(() =>
  Math.max(
    1,
    ...(analytics.value.charts?.consume_actions || []).map((item: any) =>
      Number(item.credits || 0)
    )
  )
);
const maxFailure = computed(() =>
  Math.max(
    1,
    ...(analytics.value.charts?.failure_reasons || []).map((item: any) =>
      Number(item.total || 0)
    )
  )
);

// 平台累计指标（不受时间筛选影响）
const platformMetrics = computed<Metric[]>(() => [
  {
    label: "累计用户",
    value: numberText(summary.value.users),
    helper: `周期内新增 ${numberText(summary.value.new_users)}`
  },
  {
    label: "工作区",
    value: numberText(summary.value.workspaces),
    helper: `企业空间 ${numberText(summary.value.enterprise_workspaces)}`
  },
  {
    label: "剧集项目",
    value: numberText(summary.value.projects),
    helper: `活跃项目 ${numberText(summary.value.active_projects)}`
  },
  {
    label: "累计任务",
    value: numberText(platform.value.tasks),
    helper: `待支付订单 ${numberText(platform.value.pending_orders)}`
  },
  {
    label: "累计消耗积分",
    value: numberText(platform.value.consumed_credits),
    helper: `发放积分 ${numberText(summary.value.issued_credits)}`
  },
  {
    label: "冻结积分",
    value: numberText(summary.value.frozen_credits),
    helper: "任务执行中预留"
  }
]);

const topMetrics = computed<Metric[]>(() => [
  {
    label: "净收入",
    value: money(summary.value.net_revenue_yuan),
    helper: `支付订单 ${numberText(summary.value.paid_orders)} 笔`,
    tone: "green"
  },
  {
    label: "消耗积分",
    value: numberText(summary.value.consumed_credits),
    helper: `折算收入 ${money(summary.value.credit_revenue_yuan)}`,
    tone: "blue"
  },
  {
    label: "生成任务",
    value: numberText(summary.value.tasks),
    helper: `成功率 ${summary.value.task_success_rate || 0}%`,
    tone: "amber"
  },
  {
    label: "活跃用户",
    value: numberText(summary.value.active_users),
    helper: `新增用户 ${numberText(summary.value.new_users)}`,
    tone: "green"
  },
  {
    label: "预估成本",
    value: money(summary.value.estimated_cost_yuan),
    helper: `毛利估算 ${money(summary.value.estimated_margin_yuan)}`,
    tone: "red"
  },
  {
    label: "异常待处理",
    value: numberText(analytics.value.anomalies?.length),
    helper: `失败任务 ${numberText(summary.value.failed_tasks)}`,
    tone: "red"
  }
]);

function applyPreset(value = preset.value) {
  const end = new Date();
  const start = new Date();
  if (value === "today") {
    start.setDate(end.getDate());
  } else if (value === "7d") {
    start.setDate(end.getDate() - 6);
  } else if (value === "month") {
    start.setDate(1);
  } else {
    start.setDate(end.getDate() - 29);
  }
  range.value = [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}

async function load() {
  if (!range.value) applyPreset();
  loading.value = true;
  try {
    const [result, platformResult] = await Promise.all([
      http.get("/admin/analytics", {
        params: {
          start_date: range.value?.[0],
          end_date: range.value?.[1]
        }
      }),
      http.get("/admin/overview")
    ]);
    analytics.value = data(result);
    platform.value = data(platformResult);
  } catch (error: any) {
    const status = error?.response?.status;
    const detail = resolveErrorMessage(error, "运营数据加载失败");
    message(
      status === 404
        ? "运营数据接口不可用，请确认后端已更新并重启服务。"
        : detail,
      { type: "error" }
    );
  } finally {
    loading.value = false;
  }
}

function barWidth(value: unknown, max: number) {
  return `${Math.max(4, Math.round((Number(value || 0) / max) * 100))}%`;
}

onMounted(() => {
  applyPreset();
  load();
});
</script>

<template>
  <div class="analytics-page" v-loading="loading">
    <div class="toolbar-row">
      <span class="range-hint"
        >统计周期：{{ analytics.range?.start_date || "-" }} 至
        {{ analytics.range?.end_date || "-" }}</span
      >
      <div class="filters">
        <ElSelect v-model="preset" class="preset" @change="applyPreset">
          <ElOption label="今日" value="today" />
          <ElOption label="近 7 日" value="7d" />
          <ElOption label="近 30 日" value="30d" />
          <ElOption label="本月" value="month" />
        </ElSelect>
        <ElDatePicker
          v-model="range"
          type="daterange"
          value-format="YYYY-MM-DD"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
        />
        <ElButton type="primary" @click="load">刷新</ElButton>
      </div>
    </div>

    <h2 class="section-title">平台累计</h2>
    <section class="metric-grid">
      <ElCard
        v-for="metric in platformMetrics"
        :key="metric.label"
        class="metric-card"
        shadow="never"
      >
        <span>{{ metric.label }}</span>
        <strong>{{ metric.value }}</strong>
        <small>{{ metric.helper }}</small>
      </ElCard>
    </section>

    <h2 class="section-title">周期指标</h2>
    <section class="metric-grid">
      <ElCard
        v-for="metric in topMetrics"
        :key="metric.label"
        class="metric-card"
        :class="metric.tone"
        shadow="never"
      >
        <span>{{ metric.label }}</span>
        <strong>{{ metric.value }}</strong>
        <small>{{ metric.helper }}</small>
      </ElCard>
    </section>

    <section class="panel-grid two">
      <ElCard shadow="never">
        <template #header>经营趋势</template>
        <div v-if="analytics.charts?.daily?.length" class="daily-list">
          <div v-for="item in analytics.charts.daily" :key="item.day" class="daily-row">
            <span>{{ item.day }}</span>
            <div>
              <div
                class="bar tasks"
                :style="{ width: barWidth(item.tasks, maxDaily) }"
              />
            </div>
            <b>{{ numberText(item.tasks) }} 任务</b>
            <em>{{ money(item.revenue_yuan) }}</em>
          </div>
        </div>
        <ElEmpty v-else description="暂无趋势数据" />
      </ElCard>

      <ElCard shadow="never">
        <template #header>能力消耗排行</template>
        <div v-if="analytics.charts?.consume_actions?.length" class="rank-bars">
          <div
            v-for="item in analytics.charts.consume_actions"
            :key="item.action"
            class="rank-bar"
          >
            <span>{{ typeLabel(item.action) }}</span>
            <div>
              <i :style="{ width: barWidth(item.credits, maxActionCredits) }" />
            </div>
            <b>{{ numberText(item.credits) }}</b>
          </div>
        </div>
        <ElEmpty v-else description="暂无消耗数据" />
      </ElCard>
    </section>

    <section class="panel-grid three">
      <ElCard shadow="never">
        <template #header>收入与支付</template>
        <ElTable :data="analytics.charts?.revenue_providers || []" stripe>
          <ElTableColumn label="渠道">
            <template #default="{ row }">{{ providerLabel(row.provider) }}</template>
          </ElTableColumn>
          <ElTableColumn prop="orders" label="订单" />
          <ElTableColumn prop="paid_orders" label="成功" />
          <ElTableColumn label="金额">
            <template #default="{ row }">{{ money(row.amount_yuan) }}</template>
          </ElTableColumn>
        </ElTable>
      </ElCard>

      <ElCard shadow="never">
        <template #header>积分账务</template>
        <ElTable :data="analytics.charts?.credit_types || []" stripe>
          <ElTableColumn label="类型">
            <template #default="{ row }">{{ typeLabel(row.type) }}</template>
          </ElTableColumn>
          <ElTableColumn prop="entries" label="笔数" />
          <ElTableColumn label="积分">
            <template #default="{ row }">{{ numberText(row.amount) }}</template>
          </ElTableColumn>
        </ElTable>
      </ElCard>

      <ElCard shadow="never">
        <template #header>任务状态</template>
        <ElTable :data="analytics.charts?.task_statuses || []" stripe>
          <ElTableColumn label="状态">
            <template #default="{ row }">
              <ElTag :type="row.status === 'failed' ? 'danger' : 'info'">
                {{ statusLabel(row.status) }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="total" label="数量" />
        </ElTable>
      </ElCard>
    </section>

    <section class="panel-grid two">
      <ElCard shadow="never">
        <template #header>AI 模型表现</template>
        <ElTable :data="analytics.charts?.model_performance || []" stripe>
          <ElTableColumn prop="provider" label="服务商" width="110" />
          <ElTableColumn prop="model" label="模型" min-width="180" />
          <ElTableColumn label="类型" width="80">
            <template #default="{ row }">{{ typeLabel(row.type) }}</template>
          </ElTableColumn>
          <ElTableColumn prop="total" label="调用" width="80" />
          <ElTableColumn prop="success_rate" label="成功率" width="90" />
          <ElTableColumn prop="credits" label="积分" width="90" />
        </ElTable>
      </ElCard>

      <ElCard shadow="never">
        <template #header>失败原因</template>
        <div v-if="analytics.charts?.failure_reasons?.length" class="rank-bars danger">
          <div
            v-for="item in analytics.charts.failure_reasons"
            :key="item.reason"
            class="rank-bar"
          >
            <span>{{ item.reason }}</span>
            <div>
              <i :style="{ width: barWidth(item.total, maxFailure) }" />
            </div>
            <b>{{ numberText(item.total) }}</b>
          </div>
        </div>
        <ElEmpty v-else description="暂无失败数据" />
      </ElCard>
    </section>

    <section class="panel-grid two">
      <ElCard shadow="never">
        <template #header>内容生产漏斗</template>
        <div v-if="analytics.funnel?.length" class="funnel">
          <div v-for="item in analytics.funnel" :key="item.stage" class="funnel-row">
            <span>{{ item.stage }}</span>
            <div>
              <i :style="{ width: `${Math.max(8, item.conversion_rate)}%` }" />
            </div>
            <b>{{ numberText(item.total) }}</b>
            <em>{{ item.conversion_rate }}%</em>
          </div>
        </div>
        <ElEmpty v-else description="暂无漏斗数据" />
      </ElCard>

      <ElCard shadow="never">
        <template #header>异常监控</template>
        <ElTable :data="analytics.anomalies || []" stripe>
          <ElTableColumn prop="type" label="异常" width="130" />
          <ElTableColumn prop="target" label="对象" min-width="150" />
          <ElTableColumn prop="count" label="数量/积分" width="100" />
          <ElTableColumn prop="last_seen" label="最近发生" min-width="160" />
          <ElTableColumn prop="status" label="状态" width="90" />
        </ElTable>
        <ElEmpty v-if="!analytics.anomalies?.length" description="暂无异常" />
      </ElCard>
    </section>

    <section class="panel-grid two">
      <ElCard shadow="never">
        <template #header>高消耗用户</template>
        <ElTable :data="analytics.rankings?.users || []" stripe>
          <ElTableColumn prop="phone" label="手机号" />
          <ElTableColumn prop="nickname" label="昵称" />
          <ElTableColumn prop="tasks" label="任务" />
          <ElTableColumn prop="credits" label="积分" />
        </ElTable>
      </ElCard>

      <ElCard shadow="never">
        <template #header>高消耗空间</template>
        <ElTable :data="analytics.rankings?.workspaces || []" stripe>
          <ElTableColumn prop="name" label="空间" />
          <ElTableColumn label="类型">
            <template #default="{ row }">{{
              row.type === "personal" ? "个人" : "企业"
            }}</template>
          </ElTableColumn>
          <ElTableColumn prop="tasks" label="任务" />
          <ElTableColumn prop="credits" label="积分" />
        </ElTable>
      </ElCard>
    </section>

    <ElCard shadow="never">
      <template #header>统计口径</template>
      <div class="notes">
        <p v-for="note in analytics.notes || []" :key="note">{{ note }}</p>
        <p>当前数据范围：{{ analytics.range?.start_date }} 至 {{ analytics.range?.end_date }}</p>
      </div>
    </ElCard>
  </div>
</template>

<style scoped>
.analytics-page {
  padding: 4px;
}
.toolbar-row {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.range-hint {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.section-title {
  margin: 4px 0 10px;
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 600;
}
.filters {
  display: flex;
  gap: 8px;
  align-items: center;
}
.preset {
  width: 110px;
}
.metric-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}
.metric-card {
  border-left: 3px solid var(--el-color-primary);
}
.metric-card.green {
  border-left-color: var(--el-color-success);
}
.metric-card.amber {
  border-left-color: var(--el-color-warning);
}
.metric-card.red {
  border-left-color: var(--el-color-danger);
}
.metric-card :deep(.el-card__body) {
  display: grid;
  gap: 8px;
  min-height: 96px;
}
.metric-card span,
.metric-card small {
  color: var(--el-text-color-secondary);
}
.metric-card strong {
  font-size: 24px;
  line-height: 1.2;
  word-break: break-word;
}
.panel-grid {
  display: grid;
  gap: 14px;
  margin-bottom: 14px;
}
.panel-grid.two {
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
}
.panel-grid.three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.daily-list,
.rank-bars,
.funnel {
  display: grid;
  gap: 10px;
}
.daily-row,
.rank-bar,
.funnel-row {
  display: grid;
  grid-template-columns: 92px minmax(120px, 1fr) 90px 86px;
  gap: 10px;
  align-items: center;
  min-height: 26px;
  color: var(--el-text-color-regular);
  font-size: 12px;
}
.rank-bar {
  grid-template-columns: 118px minmax(120px, 1fr) 80px;
}
.daily-row > div,
.rank-bar > div,
.funnel-row > div {
  height: 8px;
  overflow: hidden;
  background: var(--el-fill-color-light);
  border-radius: 999px;
}
.bar,
.rank-bar i,
.funnel-row i {
  display: block;
  height: 100%;
  background: var(--el-color-primary);
  border-radius: inherit;
}
.bar.tasks {
  background: var(--el-color-success);
}
.rank-bars.danger i {
  background: var(--el-color-danger);
}
.funnel-row i {
  background: var(--el-color-warning);
}
.daily-row b,
.daily-row em,
.rank-bar b,
.funnel-row b,
.funnel-row em {
  font-style: normal;
  font-weight: 500;
  text-align: right;
}
.notes {
  display: grid;
  gap: 6px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.notes p {
  margin: 0;
}
@media (max-width: 1200px) {
  .metric-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .panel-grid.two,
  .panel-grid.three {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 760px) {
  .toolbar-row,
  .filters {
    flex-direction: column;
    align-items: stretch;
  }
  .metric-grid {
    grid-template-columns: 1fr;
  }
  .daily-row,
  .rank-bar,
  .funnel-row {
    grid-template-columns: 1fr;
  }
  .daily-row b,
  .daily-row em,
  .rank-bar b,
  .funnel-row b,
  .funnel-row em {
    text-align: left;
  }
}
</style>

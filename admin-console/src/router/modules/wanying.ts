const Layout = () => import("@/layout/index.vue");

export default {
  path: "/",
  name: "Root",
  component: Layout,
  redirect: "/wanying/overview",
  meta: {
    title: "万影工坊",
    icon: "ri:film-line",
    rank: 1
  },
  children: [
    {
      path: "/wanying/operations",
      name: "WanyingOperations",
      redirect: "/wanying/overview",
      meta: { title: "运营概览", icon: "ri:dashboard-line" },
      children: [
        {
          path: "/wanying/overview",
          name: "WanyingOverview",
          component: () => import("@/views/wanying/overview.vue"),
          meta: {
            title: "平台概览",
            icon: "ri:dashboard-line",
            fixedTag: true,
            showParent: true
          }
        },
        {
          path: "/wanying/analytics",
          name: "WanyingAnalytics",
          redirect: "/wanying/overview",
          meta: {
            title: "运营数据",
            icon: "ri:bar-chart-box-line",
            showLink: false
          }
        }
      ]
    },
    {
      path: "/wanying/ai-production",
      name: "WanyingAiProduction",
      redirect: "/wanying/services",
      meta: { title: "AI 生产", icon: "ri:robot-line" },
      children: [
        {
          path: "/wanying/services",
          name: "WanyingServices",
          component: () => import("@/views/wanying/services.vue"),
          meta: { title: "AI 服务", icon: "ri:robot-line" }
        },
        {
          path: "/wanying/pricing",
          name: "WanyingPricing",
          component: () => import("@/views/wanying/pricing.vue"),
          meta: { title: "价格规则", icon: "ri:price-tag-3-line" }
        },
        {
          path: "/wanying/visual-presets",
          name: "WanyingStyles",
          component: () => import("@/views/wanying/styles.vue"),
          meta: { title: "风格预设", icon: "ri:palette-line" }
        },
        {
          path: "/wanying/agent-settings",
          name: "WanyingAgents",
          component: () => import("@/views/wanying/agents.vue"),
          meta: { title: "Agent 工作流", icon: "ri:settings-3-line" }
        },
        {
          path: "/wanying/skill-settings",
          name: "WanyingSkills",
          redirect: "/wanying/agent-settings",
          meta: {
            title: "技能管理",
            icon: "ri:lightbulb-flash-line",
            showLink: false
          }
        },
        {
          path: "/wanying/tasks",
          name: "WanyingTasks",
          component: () => import("@/views/wanying/tasks.vue"),
          meta: { title: "生成任务", icon: "ri:task-line" }
        }
      ]
    },
    {
      path: "/wanying/account-finance",
      name: "WanyingAccountFinance",
      redirect: "/wanying/users",
      meta: { title: "账号财务", icon: "ri:user-settings-line" },
      children: [
        {
          path: "/wanying/users",
          name: "WanyingUsers",
          component: () => import("@/views/wanying/users.vue"),
          meta: { title: "用户管理", icon: "ri:user-line" }
        },
        {
          path: "/wanying/orders",
          name: "WanyingOrders",
          component: () => import("@/views/wanying/orders.vue"),
          meta: { title: "充值订单", icon: "ri:bill-line" }
        },
        {
          path: "/wanying/payments",
          name: "WanyingPayments",
          component: () => import("@/views/wanying/payments.vue"),
          meta: { title: "支付渠道", icon: "ri:bank-card-line" }
        }
      ]
    },
    {
      path: "/wanying/audit",
      name: "WanyingAudit",
      redirect: "/wanying/logs",
      meta: { title: "系统审计", icon: "ri:file-list-3-line" },
      children: [
        {
          path: "/wanying/logs",
          name: "WanyingLogs",
          component: () => import("@/views/wanying/logs.vue"),
          meta: {
            title: "操作日志",
            icon: "ri:file-list-3-line",
            showParent: true
          }
        }
      ]
    }
  ]
} satisfies RouteConfigsTable;

export const names: Record<string, [string, string]> = {
  overview: [
    "平台概览",
    "平台累计规模、周期经营指标、收入与 AI 生产质量总览。"
  ],
  services: ["AI 服务", "管理文本、图片、视频 API 配置。"],
  payments: ["支付渠道", "管理充值渠道参数和启用状态。"],
  pricing: ["价格规则", "管理各 AI 生成环节的积分价格。"],
  styles: ["风格预设", "管理项目可用的视觉风格。"],
  agents: ["Agent 工作流", "统一管理 Agent 主指令、模型覆盖和技能规则。"],
  skills: ["技能管理", "已合并到 Agent 工作流。"],
  users: ["用户管理", "管理业务用户和积分余额。"],
  tasks: [
    "生成任务",
    "只读查看全部 AI 生成任务与积分消耗；任务的取消与重试由用户在创作端发起。"
  ],
  orders: ["充值订单", "查看充值订单和到账状态。"],
  logs: ["操作日志", "查看平台管理员操作记录。"]
};

export const PAYMENT_SECRET_KEYS = [
  "wechat_api_v3_key",
  "wechat_private_key",
  "wechat_platform_public_key",
  "wechat_webhook_secret",
  "alipay_private_key",
  "alipay_public_key"
] as const;

export const PAYMENT_SETTING_KEYS = [
  "wechat_enabled",
  "alipay_enabled",
  "wechat_mch_id",
  "wechat_app_id",
  "wechat_serial_no",
  "wechat_api_v3_key",
  "wechat_private_key",
  "wechat_platform_public_key",
  "wechat_webhook_secret",
  "alipay_app_id",
  "alipay_private_key",
  "alipay_public_key",
  "alipay_return_url",
  "payment_notify_url",
  "reason"
];

export const AI_GATEWAY_BASE_URL = "https://cloudapi.flowingcloud.com";

export const quickConfigs = [
  {
    service_type: "text",
    provider: "openai",
    name: "自有文本服务 · New API",
    base_url: AI_GATEWAY_BASE_URL,
    model: ["gpt-5.5", "claude-opus-4-8"],
    priority: 101
  },
  {
    service_type: "image",
    provider: "openai",
    name: "自有图片服务 · New API",
    base_url: AI_GATEWAY_BASE_URL,
    model: ["gpt-image-2"],
    priority: 99
  },
  {
    service_type: "video",
    provider: "volcengine",
    name: "自有视频服务 · Seedance",
    base_url: AI_GATEWAY_BASE_URL,
    model: [
      "doubao-seedance-2-0-260128",
      "doubao-seedance-2-0-mini-260615",
      "doubao-seedance-2-5-260628"
    ],
    priority: 98
  }
];

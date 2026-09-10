import dayjs from "dayjs";
import { resolveErrorMessage } from "@/utils/errorMessage";

export const data = (value: any) => value?.data ?? value ?? [];

export const formatTime = (value: string | number | Date | null | undefined) =>
  value ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "-";

export const errorText = (error: any) => {
  const text = String(error?.response?.data?.message || error?.message || "");
  const lower = text.toLowerCase();
  if (
    lower.includes("no available channel") ||
    lower.includes("no channel for model")
  )
    return "当前模型暂时没有可用服务通道，请检查模型配置或更换模型。";
  if (text.includes("积分不足")) return text;
  if (lower.includes("unauthorized") || text.includes("需要管理员权限"))
    return "当前后台会话或权限不足，请重新登录。";
  // 其余情况统一交给中文解析器，避免把英文原文（如 Network Error、Request failed with status code 400）暴露给用户
  return resolveErrorMessage(error);
};

export const label = (value: string) =>
  (
    ({
      "script-rewriter": "剧本改写",
      extractor: "资产提取",
      "storyboard-breaker": "分镜拆解",
      "character-prompt": "角色提示词",
      "scene-prompt": "场景提示词",
      "prop-prompt": "道具提示词",
      "video-prompt": "视频提示词",
      script_rewrite: "剧本改写",
      asset_extract: "资产提取",
      storyboard_break: "分镜拆解",
      character_prompt: "角色提示词",
      scene_prompt: "场景提示词",
      prop_prompt: "道具提示词",
      video_prompt: "视频提示词",
      character_image: "角色图片",
      scene_image: "场景图片",
      prop_image: "道具图片",
      video: "视频生成（按秒）",
      video_4s: "历史视频 4 秒",
      video_8s: "历史视频 8 秒",
      video_12s: "历史视频 12 秒",
      video_15s: "历史视频 15 秒"
    }) as Record<string, string>
  )[value] || value;

export const taskParams = (value: any) =>
  typeof value === "string" ? value : JSON.stringify(value || {}, null, 2);

export const taskError = (value: any) => {
  const text = String(value || "");
  const lower = text.toLowerCase();
  if (lower.includes("no available channel") || lower.includes("no channel for model")) return "模型暂无可用服务通道，请检查模型配置或切换模型。";
  if (lower.includes("network error") || lower.includes("failed to fetch") || lower.includes("econnrefused")) return "服务连接失败，请检查服务端或网络。";
  if (text.includes("积分不足")) return text;
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("polling exceeded")) return "上游服务响应超时，请稍后重试。";
  if (lower.includes("sensitivecontent") || lower.includes("privacyinformation")) return "内容触发平台安全审核，请调整提示词或参考素材。";
  if (lower.includes("api key") || lower.includes("authentication") || lower.includes("invalid token")) return "AI 服务密钥无效或未配置。";
  if (lower.includes("model not found") || lower.includes("unsupported model") || lower.includes("invalid model")) return "模型不可用，请检查模型名称或配置。";
  return text.length > 180 ? "任务执行失败，请展开查看详细日志或稍后重试。" : text || "任务执行失败";
};

export const resultHref = (value: string) => value ? (value.startsWith("http") ? value : `${window.location.origin}${value}`) : "";

export const typeLabel = (v: string) =>
  (({ text: "文本", image: "图片", video: "视频" }) as Record<string, string>)[v] || v;

export const statusLabel = (v: string) =>
  (
    ({
      pending: "等待中",
      processing: "处理中",
      completed: "已完成",
      failed: "失败",
      cancelled: "已取消",
      paid: "已支付",
      refunded: "已退款",
      active: "正常",
      disabled: "已停用"
    }) as Record<string, string>
  )[v] || v;

export const statusTagType = (v: string) =>
  (({
    failed: "danger",
    cancelled: "info",
    pending: "info",
    processing: "warning",
    completed: "success",
    paid: "success",
    refunded: "info",
    active: "success",
    disabled: "info"
  }) as Record<string, any>)[v] || "info";

export const paymentProviderLabel = (v: string) =>
  (({ wechat: "微信支付", alipay: "支付宝" }) as Record<string, string>)[v] || v;

export const auditActionLabel = (value: string) =>
  (
    ({
      admin_login: "登录后台",
      ai_config_create: "新增 AI 服务配置",
      ai_config_update: "修改 AI 服务配置",
      ai_config_delete: "删除 AI 服务配置",
      payment_settings_update: "修改支付配置",
      pricing_create: "新增价格规则",
      pricing_update: "修改价格规则",
      pricing_delete: "删除价格规则",
      workspace_status_update: "修改工作区状态",
      user_status_update: "修改用户状态",
      task_cancel: "取消生成任务",
      task_retry: "重试生成任务",
      recharge_refund: "充值退款",
      credit_adjust: "调整用户积分"
    }) as Record<string, string>
  )[value] || value;

export const auditTargetText = (row: any) => {
  const targetType = row?.target_type;
  const id = row?.target_id;
  const user = [row?.user_nickname, row?.user_phone].filter(Boolean).join(" / ");
  const workspace = row?.workspace_name;
  if (row?.action === "credit_adjust") return user || "用户积分账户";
  if (targetType === "admin_user") return "后台账号";
  if (targetType === "ai_service_config") return `AI 服务配置${id ? ` #${id}` : ""}`;
  if (targetType === "pricing_rule") return `价格规则${id ? ` #${id}` : ""}`;
  if (targetType === "platform_settings") return "平台支付配置";
  if (targetType === "user") return user || `用户${id ? ` #${id}` : ""}`;
  if (targetType === "workspace") return workspace || `业务空间${id ? ` #${id}` : ""}`;
  if (targetType === "sys_task") return `生成任务${id ? ` #${id}` : ""}${user ? `，用户：${user}` : ""}`;
  if (targetType === "recharge_order") return `充值订单${id ? ` ${id}` : ""}${user ? `，用户：${user}` : ""}`;
  return id ? `${targetType || "对象"} #${id}` : "-";
};

const listText = (value: any) => Array.isArray(value) ? value.join("、") : String(value || "");

export const auditDetailText = (row: any) => {
  const d = typeof row?.detail === "object" && row.detail ? row.detail : {};
  switch (row?.action) {
    case "admin_login":
      return "管理员登录了运营后台。";
    case "ai_config_create":
      return `新增了${typeLabel(d.service_type)}服务配置：${d.name || d.provider || "未命名"}，模型：${listText(d.model) || "未填写"}${d.api_key_changed ? "，并填写了 API Key" : ""}。`;
    case "ai_config_update":
      return `修改了${typeLabel(d.service_type)}服务配置：${d.name || d.provider || "未命名"}，当前状态为${d.is_active ? "启用" : "停用"}${d.api_key_changed ? "，同时更新了 API Key" : ""}。`;
    case "ai_config_delete":
      return `删除了${typeLabel(d.service_type)}服务配置：${d.name || d.provider || "未命名"}。`;
    case "payment_settings_update":
      return `修改了支付配置：${listText(d.changed) || "未发现字段变化"}。原因：${d.reason || "未填写"}。`;
    case "pricing_create":
      return `新增了「${label(d.action)}」价格规则，价格为 ${d.price ?? "-"} 积分/${d.unit || "次"}。`;
    case "pricing_update":
      return `修改了价格规则：${d.price !== undefined ? `价格调整为 ${d.price} 积分` : "配置已更新"}${d.isActive !== undefined || d.is_active !== undefined ? `，状态为${(d.isActive ?? d.is_active) ? "启用" : "停用"}` : ""}。`;
    case "pricing_delete":
      return `删除了「${label(d.action)}」价格规则。`;
    case "workspace_status_update":
      return `将工作区状态从「${statusLabel(d.old_status)}」改为「${statusLabel(d.new_status)}」。原因：${d.reason || "未填写"}。`;
    case "user_status_update":
      return `将用户状态从「${statusLabel(d.old_status)}」改为「${statusLabel(d.new_status)}」。原因：${d.reason || "未填写"}。`;
    case "task_cancel":
      return `取消了生成任务。原因：${d.reason || "未填写"}。`;
    case "task_retry":
      return `重试了生成任务，新任务 ID：${d.new_task_id || "-"}，扣费项：${label(d.action)}，预计消耗 ${d.credit_cost ?? "-"} 积分。原因：${d.reason || "未填写"}。`;
    case "recharge_refund":
      return `处理了充值退款，退回 ${d.credits ?? "-"} 积分。原因：${d.reason || "未填写"}。`;
    case "credit_adjust":
      return `调整了用户积分 ${d.amount ?? "-"}，余额从 ${d.old_balance ?? "-"} 变为 ${d.new_balance ?? "-"}。备注：${d.note || "未填写"}。`;
    default:
      return Object.keys(d).length ? Object.entries(d).map(([key, value]) => `${key}: ${listText(value)}`).join("；") : "-";
  }
};

export const agentModelDisplay = (row: any) =>
  row?.effective_model
    ? row.model_source === "agent"
      ? `自定义：${row.effective_model}`
      : `默认文本模型：${row.effective_model}`
    : "未配置默认文本模型";

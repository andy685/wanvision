/**
 * 全局错误提示中文化
 *
 * 管理后台的所有错误提示都必须以中文呈现，这里统一处理三类来源：
 * 1. 后端返回的业务文案（本身就是中文，优先展示）
 * 2. axios / 浏览器的原生英文错误（Network Error、timeout、Request failed with status code xxx）
 * 3. 未能被 i18n 解析而直接暴露出来的 key（形如 login.purePassWordReg）
 */

import { transformI18n } from "@/plugins/i18n";
import { message } from "@/utils/message";

const STATUS_MESSAGE: Record<number, string> = {
  400: "请求参数有误，请检查后重试",
  401: "登录状态已失效，请重新登录",
  403: "当前账号权限不足，无法执行该操作",
  404: "请求的数据不存在或已被删除",
  405: "请求方式不被允许，请刷新页面后重试",
  408: "请求超时，请稍后重试",
  409: "数据存在冲突，请刷新后重试",
  422: "数据校验未通过，请检查输入内容",
  429: "操作过于频繁，请稍后再试",
  500: "服务内部错误，请稍后重试",
  502: "服务网关异常，请稍后重试",
  503: "服务暂时不可用，请稍后重试",
  504: "服务响应超时，请稍后重试"
};

const KEYWORD_MESSAGE: Array<[RegExp, string]> = [
  [/amount\s*(和|and)\s*note/i, "请填写调整积分和操作备注"],
  [/^(drama_id|episode_id|name|location|prompt|file|skill id|system_prompt)\s*(is\s*)?required$/i, "请填写必填内容后重试"],
  [/network\s*error|failed to fetch|econnrefused|err_connection/i, "服务连接失败，请检查网络或确认服务端已启动"],
  [/timeout|timed out|econtaborted/i, "请求超时，请稍后重试"],
  [/unauthorized|token.*(invalid|expired)|登录已过期/i, "登录状态已失效，请重新登录"],
  [/forbidden|permission denied|需要管理员权限/i, "当前账号权限不足，无法执行该操作"],
  [/not found/i, "请求的数据不存在或已被删除"],
  [/bad request|invalid (param|payload|argument)/i, "请求参数有误，请检查后重试"],
  [/no available channel|no channel for model/i, "当前模型暂时没有可用服务通道，请检查模型配置或更换模型"],
  [/internal error|internal server error/i, "服务内部错误，请稍后重试"],
  [/request failed with status code/i, "请求失败，请稍后重试"]
];

/** 判断是否包含中文字符，用于识别后端已经中文化的文案 */
export const hasChinese = (value: string) => /[\u4e00-\u9fa5]/.test(value);

/** 判断是否是未被解析的 i18n key，例如 login.purePassWordReg */
const isI18nKey = (value: string) =>
  /^[a-zA-Z][\w-]*(\.[\w-]+)+$/.test(value) && !hasChinese(value);

/**
 * 将任意错误对象转换为中文提示文案
 * @param error 错误对象、后端响应体或字符串
 * @param fallback 无法识别时的兜底中文文案
 */
export function resolveErrorMessage(
  error: any,
  fallback = "操作失败，请稍后重试"
): string {
  if (error == null) return fallback;

  // Element Plus 的取消操作（ElMessageBox / ElForm 校验中断）不需要提示
  if (error === "cancel" || error?.message === "cancel") return "cancel";

  // 后端响应体 { code, message }
  const backendMessage =
    error?.response?.data?.message ??
    error?.data?.message ??
    (typeof error === "string" ? error : error?.message);

  const status = error?.response?.status ?? error?.status;

  // 后端已返回中文文案时直接展示
  if (typeof backendMessage === "string" && backendMessage.trim()) {
    const text = backendMessage.trim();
    if (hasChinese(text)) return text;

    // 未被 i18n 解析的 key，交给 i18n 再试一次
    if (isI18nKey(text)) {
      const translated = transformI18n(text);
      if (translated && translated !== text && hasChinese(translated)) {
        return translated;
      }
    }

    // 英文文案按关键词映射
    const matched = KEYWORD_MESSAGE.find(([pattern]) => pattern.test(text));
    if (matched) return matched[1];

    // 有明确状态码时按状态码映射
    if (status && STATUS_MESSAGE[status]) return STATUS_MESSAGE[status];

    return fallback;
  }

  // 没有文案时按状态码映射
  if (status && STATUS_MESSAGE[status]) return STATUS_MESSAGE[status];

  // axios 取消请求不提示
  if (error?.isCancelRequest || error?.code === "ERR_CANCELED") return "cancel";

  if (error?.code) {
    const matched = KEYWORD_MESSAGE.find(([pattern]) =>
      pattern.test(String(error.code))
    );
    if (matched) return matched[1];
  }

  return fallback;
}

/** 弹窗展示错误提示（自动忽略取消操作） */
export function showErrorMessage(error: any, fallback?: string) {
  const text = resolveErrorMessage(error, fallback);
  if (text === "cancel") return;
  message(text, { type: "error" });
}

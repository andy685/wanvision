// 多组件库的国际化和本地项目国际化兼容
import { type I18n, createI18n } from "vue-i18n";
import type { App } from "vue";
import { responsiveStorageNameSpace } from "@/config";
import { storageLocal, isObject } from "@pureadmin/utils";

// element-plus国际化
import enLocale from "element-plus/es/locale/lang/en";
import zhLocale from "element-plus/es/locale/lang/zh-cn";

const siphonI18n = (function () {
  // 仅初始化一次国际化配置
  const cache = Object.fromEntries(
    Object.entries(
      import.meta.glob("../../locales/*.{yaml,yml}", { eager: true })
    ).map(([key, value]: any) => {
      const matched = key.match(/([A-Za-z0-9-_]+)\./i)[1];
      return [matched, value.default];
    })
  );
  return (prefix = "zh-CN") => {
    return cache[prefix];
  };
})();

export const localesConfigs = {
  zh: {
    ...siphonI18n("zh-CN"),
    ...zhLocale
  },
  en: {
    ...siphonI18n("en"),
    ...enLocale
  }
};

/** 获取对象中所有嵌套对象的key键，并将它们用点号分割组成字符串 */
function getObjectKeys(obj) {
  const stack = [];
  const keys: Set<string> = new Set();

  stack.push({ obj, key: "" });

  while (stack.length > 0) {
    const { obj, key } = stack.pop();

    for (const k in obj) {
      const newKey = key ? `${key}.${k}` : k;

      if (obj[k] && isObject(obj[k])) {
        stack.push({ obj: obj[k], key: newKey });
      } else {
        keys.add(newKey);
      }
    }
  }

  return keys;
}

/** 将展开的key缓存 */
const keysCache: Map<string, Set<string>> = new Map();
const flatI18n = (prefix = "zh-CN") => {
  let cache = keysCache.get(prefix);
  if (!cache) {
    cache = getObjectKeys(siphonI18n(prefix));
    keysCache.set(prefix, cache);
  }
  return cache;
};

/** 按点号路径从文案表中取值，如 getByPath(messages, "login.purePassWordReg") */
function getByPath(source: Record<string, any>, path: string) {
  return path
    .split(".")
    .reduce<any>(
      (acc, segment) =>
        acc && typeof acc === "object" ? acc[segment] : undefined,
      source
    );
}

/**
 * 国际化转换工具函数（自动读取根目录locales文件夹下文件进行国际化匹配）
 * 说明：无论当前界面语言是什么，校验与错误提示一律以中文为准，避免用户看到英文或原始的 i18n key。
 * @param message message
 * @returns 转化后的message
 */
export function transformI18n(message: any = "") {
  if (!message) {
    return "";
  }

  // 处理存储动态路由的title,格式 {zh:"",en:""}
  if (typeof message === "object") {
    return message.zh ?? message.en ?? "";
  }

  if (typeof message !== "string") {
    return message;
  }

  const zhMessages = (siphonI18n("zh-CN") || {}) as Record<string, any>;

  // 1. 中文文案表里能取到就直接用，保证提示始终为中文（不依赖 key 展开缓存是否命中）
  const zhValue = getByPath(zhMessages, message);
  if (typeof zhValue === "string" && zhValue) {
    return zhValue;
  }

  // 2. 兼容非嵌套形式的国际化写法，交给 vue-i18n 处理
  try {
    // vue-i18n v11 下 global.t 是联合类型，这里断言为普通翻译函数
    const translate = i18n.global.t as unknown as (
      key: string
    ) => string | undefined;
    const translated = translate(message);
    if (typeof translated === "string" && translated && translated !== message) {
      return translated;
    }
  } catch {
    /* 忽略，返回原始文案 */
  }

  // 3. 非国际化文案（例如后端直接返回的中文）原样返回
  return message;
}

/** 此函数只是配合i18n Ally插件来进行国际化智能提示，并无实际意义（只对提示起作用），如果不需要国际化可删除 */
export const $t = (key: string) => key;

export const i18n: I18n = createI18n({
  legacy: false,
  locale:
    storageLocal().getItem<StorageConfigs>(
      `${responsiveStorageNameSpace()}locale`
    )?.locale ?? "zh",
  fallbackLocale: "zh",
  messages: localesConfigs
});

export function useI18n(app: App) {
  app.use(i18n);
}
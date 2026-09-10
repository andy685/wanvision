<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  ElButton,
  ElCard,
  ElCollapseTransition,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessageBox,
  ElSwitch,
  ElTag
} from "element-plus";
import { http } from "@/utils/http";
import { message } from "@/utils/message";
import { useUserStoreHook } from "@/store/modules/user";
import WanyingPage from "./components/WanyingPage.vue";
import { data, errorText } from "./utils/format";
import { names, PAYMENT_SECRET_KEYS, PAYMENT_SETTING_KEYS } from "./utils/constants";

const [title, subtitle] = names.payments;
const loading = ref(false);
const saving = ref(false);
const form = ref<any>({});
const configuredSecrets = ref<string[]>([]);
const userStore = useUserStoreHook();
const isSuperAdmin = computed(() => userStore.roles.includes("super_admin"));

const secretPlaceholder = (key: string) =>
  configuredSecrets.value.includes(key) ? "已配置，留空保持不变" : "";

async function load() {
  loading.value = true;
  try {
    const settings = data(await http.get("/admin/payment-settings"));
    configuredSecrets.value = PAYMENT_SECRET_KEYS.filter(
      k => settings[k] === "configured"
    );
    for (const k of PAYMENT_SECRET_KEYS)
      if (settings[k] === "configured") settings[k] = "";
    form.value = { ...form.value, ...settings };
  } catch (error: any) {
    message(errorText(error) || "数据加载失败", { type: "error" });
  } finally {
    loading.value = false;
  }
}

async function savePayment() {
  if (!isSuperAdmin.value) {
    message("只有超级管理员可以修改支付渠道配置", { type: "warning" });
    return;
  }
  try {
    const { value: reason } = await ElMessageBox.prompt(
      "修改支付渠道配置将影响平台充值到账，请输入操作理由。",
      "确认保存支付配置",
      {
        confirmButtonText: "确认保存",
        cancelButtonText: "取消",
        inputPlaceholder: "必填，如：更换商户号、修复支付回调",
        inputValidator: (value: string) =>
          value?.trim() ? true : "操作理由不能为空"
      }
    );
    saving.value = true;
    const payload: Record<string, any> = { reason: reason.trim() };
    for (const k of PAYMENT_SETTING_KEYS) {
      if (k === "reason") continue;
      payload[k] = form.value[k];
      if (!payload[k] && configuredSecrets.value.includes(k as any))
        payload[k] = "configured";
    }
    await http.request("put", "/admin/payment-settings", { data: payload });
    await load();
    message("支付配置已保存", { type: "success" });
  } catch (error: any) {
    if (error !== "cancel" && error?.message !== "cancel")
      message(errorText(error) || "保存失败", { type: "error" });
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <WanyingPage :title="title" :subtitle="subtitle">
    <div class="payments" v-loading="loading">
      <div class="payment-grid">
        <ElCard shadow="never" class="payment-card">
          <div class="payment-head">
            <div class="payment-title">
              <span class="payment-badge wechat">微</span>
              <strong>微信支付</strong>
              <ElTag :type="form.wechat_enabled ? 'success' : 'info'" size="small" round>
                {{ form.wechat_enabled ? "已启用" : "未启用" }}
              </ElTag>
            </div>
            <ElSwitch v-model="form.wechat_enabled" :disabled="!isSuperAdmin" />
          </div>
          <ElCollapseTransition>
            <div v-show="form.wechat_enabled" class="payment-body">
              <ElForm label-position="top">
                <ElFormItem label="微信商户号（Mch ID）">
                  <ElInput v-model="form.wechat_mch_id" placeholder="如 1900000109" :disabled="!isSuperAdmin" />
                </ElFormItem>
                <ElFormItem label="AppID">
                  <ElInput v-model="form.wechat_app_id" placeholder="公众号 / 小程序 / App 的应用 ID" :disabled="!isSuperAdmin" />
                </ElFormItem>
                <ElFormItem label="商户证书序列号">
                  <ElInput v-model="form.wechat_serial_no" placeholder="商户 API 证书的序列号" :disabled="!isSuperAdmin" />
                </ElFormItem>
                <ElFormItem label="API v3 密钥">
                  <ElInput v-model="form.wechat_api_v3_key" type="password" show-password :placeholder="secretPlaceholder('wechat_api_v3_key')" :disabled="!isSuperAdmin" />
                </ElFormItem>
                <ElFormItem label="商户 API 私钥">
                  <ElInput v-model="form.wechat_private_key" type="textarea" :rows="4" :placeholder="secretPlaceholder('wechat_private_key') || 'apiclient_key.pem 私钥内容（-----BEGIN PRIVATE KEY----- 开头）'" :disabled="!isSuperAdmin" />
                </ElFormItem>
                <ElFormItem label="微信支付平台公钥">
                  <ElInput v-model="form.wechat_platform_public_key" type="textarea" :rows="4" :placeholder="secretPlaceholder('wechat_platform_public_key') || '微信支付平台证书公钥内容'" :disabled="!isSuperAdmin" />
                </ElFormItem>
                <ElFormItem label="Webhook 回调密钥">
                  <ElInput v-model="form.wechat_webhook_secret" type="password" show-password :placeholder="secretPlaceholder('wechat_webhook_secret')" :disabled="!isSuperAdmin" />
                </ElFormItem>
              </ElForm>
            </div>
          </ElCollapseTransition>
        </ElCard>
        <ElCard shadow="never" class="payment-card">
          <div class="payment-head">
            <div class="payment-title">
              <span class="payment-badge alipay">支</span>
              <strong>支付宝</strong>
              <ElTag :type="form.alipay_enabled ? 'success' : 'info'" size="small" round>
                {{ form.alipay_enabled ? "已启用" : "未启用" }}
              </ElTag>
            </div>
            <ElSwitch v-model="form.alipay_enabled" :disabled="!isSuperAdmin" />
          </div>
          <ElCollapseTransition>
            <div v-show="form.alipay_enabled" class="payment-body">
              <ElForm label-position="top">
                <ElFormItem label="支付宝 AppID">
                  <ElInput v-model="form.alipay_app_id" placeholder="开放平台创建应用后获取" :disabled="!isSuperAdmin" />
                </ElFormItem>
                <ElFormItem label="应用私钥">
                  <ElInput v-model="form.alipay_private_key" type="textarea" :rows="4" :placeholder="secretPlaceholder('alipay_private_key') || '应用私钥内容（-----BEGIN PRIVATE KEY----- 开头）'" :disabled="!isSuperAdmin" />
                </ElFormItem>
                <ElFormItem label="支付宝公钥">
                  <ElInput v-model="form.alipay_public_key" type="textarea" :rows="4" :placeholder="secretPlaceholder('alipay_public_key')" :disabled="!isSuperAdmin" />
                </ElFormItem>
                <ElFormItem label="支付回跳地址">
                  <ElInput v-model="form.alipay_return_url" placeholder="用户支付完成后的回跳页面地址" :disabled="!isSuperAdmin" />
                </ElFormItem>
              </ElForm>
            </div>
          </ElCollapseTransition>
        </ElCard>
      </div>
      <ElCard shadow="never" class="payment-card payment-common">
        <div class="payment-head">
          <div class="payment-title">
            <span class="payment-badge common">通</span>
            <strong>通用配置</strong>
          </div>
        </div>
        <div class="payment-body">
          <ElForm label-position="top">
            <ElFormItem label="支付回调地址（Notify URL）">
              <ElInput v-model="form.payment_notify_url" placeholder="微信 / 支付宝共用的异步通知地址，需外网可访问" :disabled="!isSuperAdmin" />
            </ElFormItem>
          </ElForm>
        </div>
      </ElCard>
      <div class="payment-actions">
        <ElButton type="primary" :loading="saving" :disabled="!isSuperAdmin" @click="savePayment">保存支付配置</ElButton>
      </div>
    </div>
  </WanyingPage>
</template>

<style scoped>
.payments {
  max-width: 1080px;
}
.payment-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}
.payment-card {
  margin-bottom: 0;
}
.payment-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.payment-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.payment-title strong {
  font-size: 16px;
}
.payment-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}
.payment-badge.wechat {
  background: #07c160;
}
.payment-badge.alipay {
  background: #1677ff;
}
.payment-badge.common {
  background: #909399;
}
.payment-body {
  padding-top: 18px;
}
.payment-common {
  margin-top: 16px;
}
.payment-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 28px;
}
.payment-body :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}
</style>

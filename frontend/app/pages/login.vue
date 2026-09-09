<template>
  <main class="auth-page">
    <img class="auth-background" :src="loginBackground" alt="" aria-hidden="true" />
    <section class="auth-panel">
      <div class="auth-header">
        <img class="auth-logo" :src="brandLogo" alt="万影工坊" />
        <h1 class="auth-title">万影工坊</h1>
        <p class="auth-subtitle">{{ resetMode ? '通过手机号验证重置密码' : '每个人都是短剧导演' }}</p>
      </div>

      <form @submit.prevent="submit" class="auth-form">
        <div class="field">
          <label for="phone">手机号</label>
          <input id="phone" v-model.trim="phone" class="input" type="tel" autocomplete="tel" placeholder="请输入手机号" required />
        </div>

        <template v-if="resetMode">
          <div class="field">
            <label for="code">短信验证码</label>
            <div class="code-row">
              <input id="code" v-model.trim="resetCode" class="input" inputmode="numeric" autocomplete="one-time-code" placeholder="请输入 6 位验证码" required />
              <button class="code-btn" type="button" @click="sendResetCode">获取验证码</button>
            </div>
            <small v-if="codeMessage" class="field-hint">{{ codeMessage }}</small>
          </div>
        </template>

        <div class="field">
          <label for="password">{{ resetMode ? '新密码' : '密码' }}</label>
          <input id="password" v-model="password" class="input" type="password" autocomplete="new-password" placeholder="至少 6 位密码" minlength="6" required />
        </div>

        <p v-if="error" class="auth-error">{{ error }}</p>

        <button class="btn btn-primary auth-submit" type="submit" :disabled="loading">
          {{ loading ? '处理中…' : (resetMode ? '重置密码' : (registerMode ? '注册并领取 100 积分' : '登 录')) }}
        </button>
      </form>

      <div class="auth-footer">
        <template v-if="!resetMode">
          <button class="footer-link" type="button" @click="registerMode = !registerMode; error = ''">
            {{ registerMode ? '已有账号？返回登录' : '还没有账号？注册领取 100 积分' }}
          </button>
          <span class="footer-divider" v-if="!registerMode"></span>
          <button v-if="!registerMode" class="footer-link secondary" type="button" @click="resetMode = true; error = ''">忘记密码？</button>
        </template>
        <button v-else class="footer-link" type="button" @click="resetMode = false; registerMode = false; error = ''">返回登录</button>
      </div>
    </section>
  </main>
</template>

<script setup>
definePageMeta({ layout: false })
import brandLogo from '~/assets/huobao-logo.png'
import loginBackground from '~/assets/wanying-login-bg.png'
const { user, loading, signIn, resetPassword, requestPasswordReset } = useAuth()
const phone = ref('')
const password = ref('')
const error = ref('')
const registerMode = ref(false)
const resetMode = ref(false)
const resetCode = ref('')
const codeMessage = ref('')
const route = useRoute()

if (user.value) navigateTo('/')

async function submit() {
  error.value = ''
  try {
    if (resetMode.value) await resetPassword(phone.value, resetCode.value, password.value)
    else await signIn(phone.value, password.value, registerMode.value)
    await navigateTo(typeof route.query.redirect === 'string' ? route.query.redirect : '/')
  } catch (e) { error.value = e.message || '操作失败，请稍后重试' }
}
async function sendResetCode() {
  try { const result = await requestPasswordReset(phone.value); codeMessage.value = result.debug_code ? `开发环境验证码：${result.debug_code}` : '验证码已发送，请查收短信' } catch (e) { codeMessage.value = e.message || '验证码发送失败' }
}
</script>

<style scoped>
.auth-page {
  position: relative;
  isolation: isolate;
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  overflow: hidden;
  background: #08162f;
}
.auth-background { position:absolute; z-index:-2; inset:0; width:100%; height:100%; object-fit:cover; object-position:center; filter:brightness(.48) saturate(.78); }
.auth-page::after { content:""; position:absolute; z-index:-1; inset:0; background:rgba(5,15,35,.32); pointer-events:none; }

.auth-panel {
  position:relative;
  width: min(100%, 448px);
  padding: 46px 48px 38px;
  background: #fff;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(0, 0, 0, .05);
  border-radius: var(--radius-xl, 20px);
  box-shadow: 0 2px 5px rgba(15, 23, 42, .06), 0 24px 70px rgba(5, 15, 35, .22);
}

/* ---- Header: logo + title ---- */
.auth-header { text-align: center; margin-bottom: 34px; }
.auth-logo {
  width: 68px;
  height: 68px;
  border-radius: 16px;
  margin-bottom: 14px;
  object-fit: contain;
  box-shadow: 0 2px 10px rgba(0, 0, 0, .07);
}
.auth-title {
  margin: 0 0 6px;
  font-size: 24px;
  font-weight: 700;
  color: var(--text-0, #1d1d1f);
  letter-spacing: -0.02em;
}
.auth-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--text-3, #86868b);
  line-height: 1.5;
}

/* ---- Form ---- */
.auth-form { display: grid; gap: 20px; }
.field { display: grid; gap: 6px; }
.field label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1, #424245);
}
.field-hint {
  font-size: 12px;
  color: var(--accent-text, #0066cc);
  margin: 0;
}

.code-row { display: flex; gap: 8px; }
.code-row .input { flex: 1; }
.code-btn {
  flex: 0 0 auto;
  padding: 0 14px;
  border: 1px solid var(--border-strong, rgba(0,0,0,.14));
  border-radius: var(--radius, 10px);
  background: var(--surface-raised, #fff);
  color: var(--text-1, #424245);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  transition: border-color .15s, color .15s;
}
.code-btn:hover { border-color: var(--accent, #0071e3); color: var(--accent, #0071e3); }

.auth-submit {
  width: 100%;
  justify-content: center;
  margin-top: 2px;
  height: 48px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.auth-error {
  margin: -6px 0 -2px;
  font-size: 12px;
  color: var(--error, #ff3b30);
}

/* ---- Footer links ---- */
.auth-footer {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid rgba(0, 0, 0, .06);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}
.footer-link {
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: var(--accent-text, #0066cc);
  padding: 0;
  line-height: 1.4;
  transition: color .15s;
}
.footer-link:hover { color: var(--accent, #0071e3); }
.footer-link.secondary { color: var(--text-3, #86868b); }
.footer-link.secondary:hover { color: var(--text-2, #6e6e73); }
.footer-divider {
  width: 1px;
  height: 14px;
  background: rgba(0, 0, 0, .12);
}
</style>

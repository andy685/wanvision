<template>
  <main class="admin-login">
    <section class="admin-login-panel">
      <div class="admin-login-brand"><span>万</span><div><strong>万影工坊</strong><small>运营管理中心</small></div></div>
      <h1>后台登录</h1>
      <p>使用运营后台账号进入管理中心</p>
      <form @submit.prevent="submit">
        <label>后台账号<input v-model.trim="phone" type="tel" placeholder="请输入后台手机号" autocomplete="username" required /></label>
        <label>密码<input v-model="password" type="password" placeholder="请输入后台密码" autocomplete="current-password" required /></label>
        <div v-if="error" class="login-error">{{ error }}</div>
        <button class="login-button" type="submit" :disabled="loading">{{ loading ? '登录中…' : '进入管理后台' }}</button>
      </form>
      <small class="security-note">后台账号与前端业务账号相互独立</small>
    </section>
  </main>
</template>

<script setup>
import { api } from '~/composables/useApi'
definePageMeta({ layout: false })
const route = useRoute()
const config = useRuntimeConfig()
const adminSessionCookie = useCookie('wanying:admin-session', { maxAge: 60 * 60 * 24 * 30, sameSite: 'lax' })
const phone = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  loading.value = true; error.value = ''
  try {
    const result = await api.post('/auth/admin-login', { phone: phone.value, password: password.value })
    localStorage.setItem('wanying:admin-session', result.token)
    adminSessionCookie.value = result.token
    const target = adminPath(typeof route.query.redirect === 'string' ? route.query.redirect : '/admin')
    await navigateTo(target, target.startsWith('http') ? { external: true } : undefined)
  } catch (e) { error.value = e.message || '登录失败，请稍后重试' } finally { loading.value = false }
}

function adminPath(path) {
  const adminOrigin = String(config.public.adminOrigin || '').replace(/\/+$/, '')
  const targetPath = path.startsWith('/admin') ? path : '/admin'
  if (!adminOrigin || typeof window === 'undefined' || window.location.origin === adminOrigin) return targetPath
  return `${adminOrigin}${targetPath}`
}
</script>

<style scoped>
.admin-login { min-height:100dvh; display:grid; place-items:center; padding:24px; background:#f3f5f8; color:#1f2937; }
.admin-login-panel { width:min(100%,390px); padding:34px; border:1px solid #e2e6ec; border-radius:10px; background:#fff; box-shadow:0 18px 50px rgba(16,24,40,.08); }
.admin-login-brand { display:flex; align-items:center; gap:10px; } .admin-login-brand > span { display:grid; place-items:center; width:32px; height:32px; border-radius:8px; background:#1f2937; color:#fff; font-weight:750; } .admin-login-brand div { display:grid; gap:2px; } .admin-login-brand strong { font-size:16px; } .admin-login-brand small { color:#8b95a5; font-size:10px; }
h1 { margin:30px 0 6px; font-size:25px; } p { margin:0 0 25px; color:#8b95a5; font-size:13px; } form { display:grid; gap:16px; } label { display:grid; gap:7px; color:#475467; font-size:12px; font-weight:650; } input { box-sizing:border-box; width:100%; padding:11px 12px; border:1px solid #d9dee7; border-radius:6px; outline:0; color:#1f2937; font:inherit; font-weight:400; } input:focus { border-color:#1677ff; box-shadow:0 0 0 3px rgba(22,119,255,.12); } .login-error { color:#d92d20; font-size:12px; } .login-button { height:40px; border:0; border-radius:6px; background:#1677ff; color:#fff; cursor:pointer; font-size:13px; font-weight:650; } .login-button:hover { background:#0958d9; } .login-button:disabled { opacity:.6; cursor:wait; } .security-note { display:block; margin-top:22px; color:#98a2b3; text-align:center; font-size:11px; }
</style>

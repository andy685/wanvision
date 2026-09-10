<template>
  <main class="account-page">
    <button class="back-link" type="button" @click="navigateTo('/')">
      <ArrowLeft :size="15" :stroke-width="1.8" />
      返回项目
    </button>

    <header class="page-head">
      <h1>账号设置</h1>
      <button class="btn btn-danger" type="button" @click="logout">
        <LogOut :size="15" :stroke-width="1.9" />
        退出登录
      </button>
    </header>

    <section class="settings-stack">
      <section class="settings-section">
        <div class="section-head">
          <h2>个人资料</h2>
        </div>
        <div class="profile-editor">
          <div class="avatar-picker"><img :src="profileForm.avatar || defaultAvatar" alt="头像" class="profile-avatar" @error="useDefaultAvatar" /><label class="avatar-upload"><input type="file" accept="image/png,image/jpeg,image/webp" @change="handleAvatarChange" />{{ uploadingAvatar ? '上传中' : '更换头像' }}</label></div>
          <div class="profile-fields">
            <label>手机号<input :value="displayPhone" class="input readonly-input" type="tel" readonly aria-readonly="true" /></label>
            <label>昵称<input v-model.trim="profileForm.nickname" class="input" maxlength="64" placeholder="设置一个昵称" /></label>
            <small>手机号用于账号登录，昵称用于个人资料和创作内容中的署名。</small>
          </div>
          <button class="btn btn-primary profile-save" type="button" :disabled="savingProfile" @click="saveProfile"><Loader2 v-if="savingProfile" class="spin" :size="15" /><Save v-else :size="15" />{{ savingProfile ? '保存中' : '保存资料' }}</button>
        </div>
      </section>

      <section class="settings-section">
        <div class="section-head">
          <h2>积分</h2>
          <NuxtLink to="/credits" class="btn btn-sm btn-primary">充值 / 明细</NuxtLink>
        </div>
        <dl class="info-grid">
          <div>
            <dt>可用积分</dt>
            <dd class="balance">{{ totalBalance }}</dd>
          </div>
          <div>
            <dt>冻结积分</dt>
            <dd>{{ totalFrozen }}</dd>
          </div>
          <div>
            <dt>积分用途</dt>
            <dd>AI 生成</dd>
          </div>
        </dl>
      </section>

      <section class="settings-section">
        <div class="section-head">
          <h2>安全设置</h2>
        </div>
        <button class="setting-row" type="button" @click="openPasswordModal">
          <span>
            <strong>修改密码</strong>
            <small>需要验证当前密码</small>
          </span>
          <ChevronRight :size="17" :stroke-width="1.9" />
        </button>
      </section>
    </section>

    <div v-if="showPasswordModal" class="modal-backdrop" @click.self="closePasswordModal" @keydown.esc="closePasswordModal">
      <section class="password-modal" role="dialog" aria-modal="true" aria-labelledby="password-modal-title">
        <button class="modal-close" type="button" aria-label="关闭" @click="closePasswordModal">
          <X :size="18" :stroke-width="2" />
        </button>
        <h2 id="password-modal-title">修改密码</h2>
        <form class="password-form" @submit.prevent="submitPassword">
          <label>
            <span>当前密码</span>
            <input v-model="currentPassword" class="input" type="password" autocomplete="current-password" required autofocus />
          </label>
          <label>
            <span>新密码</span>
            <input v-model="newPassword" class="input" type="password" minlength="6" autocomplete="new-password" required />
          </label>
          <label>
            <span>确认新密码</span>
            <input v-model="confirmPassword" class="input" type="password" minlength="6" autocomplete="new-password" required />
          </label>
          <p v-if="message" :class="['form-message', { error: messageType === 'error' }]">{{ message }}</p>
          <button class="btn btn-primary" type="submit" :disabled="savingPassword">
            <Loader2 v-if="savingPassword" class="spin" :size="15" :stroke-width="1.9" />
            <Save v-else :size="15" :stroke-width="1.9" />
            {{ savingPassword ? '保存中' : '保存密码' }}
          </button>
        </form>
      </section>
    </div>
  </main>
</template>

<script setup>
import { ArrowLeft, ChevronRight, Loader2, LogOut, Save, X } from 'lucide-vue-next'
import { creditAPI, uploadAPI } from '~/composables/useApi'
import defaultAvatar from '~/assets/wanying-default-avatar.png'

const { user, changePassword, signOut, updateProfile } = useAuth()
const accounts = ref([])
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const savingPassword = ref(false)
const message = ref('')
const messageType = ref('')
const showPasswordModal = ref(false)
const savingProfile = ref(false)
const uploadingAvatar = ref(false)
const profileForm = reactive({ nickname: '', avatar: '' })

const totalBalance = computed(() => accounts.value.reduce((sum, item) => sum + Number(item.balance || 0), 0))
const totalFrozen = computed(() => accounts.value.reduce((sum, item) => sum + Number(item.frozen || 0), 0))
const displayPhone = computed(() => user.value?.phone || '未登录')

onMounted(() => {
  if (!user.value) {
    navigateTo('/login?redirect=/account')
    return
  }
  profileForm.nickname = user.value.nickname || `万影用户${String(user.value.phone || '').slice(-4)}`
  profileForm.avatar = user.value.avatar || ''
  loadAccountData()
})

async function saveProfile() {
  savingProfile.value = true
  try {
    await updateProfile(profileForm)
    message.value = '资料已保存'; messageType.value = 'success'
  } catch (error) { message.value = error.message || '资料保存失败'; messageType.value = 'error' } finally { savingProfile.value = false }
}

async function handleAvatarChange(event) {
  const file = event.target.files?.[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) { message.value = '头像不能超过 5MB'; messageType.value = 'error'; return }
  uploadingAvatar.value = true
  try { const result = await uploadAPI.image(file); profileForm.avatar = result.url; await saveProfile() } catch (error) { message.value = error.message || '头像上传失败'; messageType.value = 'error' } finally { uploadingAvatar.value = false; event.target.value = '' }
}

function useDefaultAvatar(event) {
  if (event.currentTarget.getAttribute('src') !== defaultAvatar) event.currentTarget.src = defaultAvatar
}

async function loadAccountData() {
  try {
    accounts.value = await creditAPI.list() || []
  } catch {
    accounts.value = []
  }
}

function openPasswordModal() {
  message.value = ''
  messageType.value = ''
  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  showPasswordModal.value = true
}

function closePasswordModal() {
  if (savingPassword.value) return
  showPasswordModal.value = false
}

async function submitPassword() {
  message.value = ''
  if (newPassword.value !== confirmPassword.value) {
    message.value = '两次输入的新密码不一致'
    messageType.value = 'error'
    return
  }
  savingPassword.value = true
  try {
    await changePassword(currentPassword.value, newPassword.value)
    message.value = '密码修改成功'
    messageType.value = 'success'
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    showPasswordModal.value = false
  } catch (error) {
    message.value = error.message || '密码修改失败'
    messageType.value = 'error'
  } finally {
    savingPassword.value = false
  }
}

async function logout() {
  await signOut()
  navigateTo('/login')
}
</script>

<style scoped>
.account-page {
  width: min(var(--page-fixed-width), 100%);
  margin: 0 auto;
  padding: 36px var(--page-gutter) 64px;
  color: var(--text-0);
}
.back-link {
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  padding: 0 10px;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
  font: 650 12px/1 var(--font-body);
}
.back-link:hover { background: var(--bg-hover); color: var(--text-0); }
.back-link:focus-visible { outline: none; box-shadow: 0 0 0 3.5px var(--button-focus); }
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 22px 0 16px;
}
.page-head h1 { margin: 0; font-size: 26px; }
.settings-stack {
  display: grid;
  gap: 14px;
}
.settings-section {
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow-card);
}
.section-head {
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 12px;
}
.section-head h2 { margin: 0; font-size: 16px; }
.info-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.info-grid div {
  min-width: 0;
  padding: 12px;
  border-radius: 8px;
  background: var(--surface-soft);
}
dt { color: var(--text-3); font-size: 12px; }
dd {
  margin-top: 3px;
  color: var(--text-0);
  font-size: 13px;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.balance { color: var(--accent-text); font-variant-numeric: tabular-nums; }
.setting-row {
  width: 100%;
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-1);
  text-align: left;
  cursor: pointer;
  transition: background 0.16s var(--ease-out), border-color 0.16s var(--ease-out);
}
.setting-row:hover { background: var(--bg-hover); border-color: var(--border-strong); }
.setting-row:focus-visible { outline: none; box-shadow: 0 0 0 3.5px var(--button-focus); }
.setting-row span { display: grid; gap: 3px; }
.setting-row strong { color: var(--text-0); font-size: 13px; }
.setting-row small { color: var(--text-3); font-size: 11px; }
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(16,24,40,.42);
}
.password-modal {
  position: relative;
  width: min(100%, 420px);
  padding: 24px;
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow-xl);
}
.password-modal h2 { margin: 0 0 18px; font-size: 18px; }
.modal-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
}
.modal-close:hover { background: var(--bg-hover); color: var(--text-0); }
.modal-close:focus-visible { outline: none; box-shadow: 0 0 0 3.5px var(--button-focus); }
.password-form label {
  display: grid;
  gap: 7px;
  color: var(--text-2);
  font-size: 12px;
}
.password-form label span { font-weight: 650; color: var(--text-1); }
.password-form {
  display: grid;
  gap: 14px;
}
.form-message { margin:0; color:#16803c; font-size:12px; }
.form-message.error { color:#c43232; }
.profile-editor { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:18px; }
.avatar-picker { display:grid; justify-items:center; gap:8px; }
.profile-avatar { width:68px; height:68px; display:grid; place-items:center; border-radius:18px; background:var(--text-0); color:#fff; font-size:25px; font-weight:750; object-fit:cover; }
.avatar-upload { color:var(--accent); cursor:pointer; font-size:11px; } .avatar-upload input { display:none; }
.profile-fields { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:10px 12px; align-items:end; }
.profile-fields label { display:grid; gap:6px; color:var(--text-2); font-size:12px; }
.profile-fields small { grid-column:1 / -1; color:var(--text-3); font-size:11px; }
.readonly-input { color:var(--text-1); background:var(--surface-soft); cursor:default; }
.profile-save { align-self:end; white-space:nowrap; }
.account-credential { margin-top:18px; padding-top:16px; border-top:1px solid var(--border); }
.password-form .btn { justify-self: end; min-width: 120px; }
.spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 760px) {
  .account-page { padding: 24px var(--page-gutter-sm) 50px; }
  .page-head { align-items: stretch; flex-direction: column; }
  .page-head .btn { width: 100%; }
  .info-grid { grid-template-columns: 1fr; }
  .profile-editor { grid-template-columns:auto 1fr; align-items:start; }
  .profile-fields { grid-template-columns:1fr; }
  .profile-fields small { grid-column:auto; }
  .profile-save { grid-column:1 / -1; width:100%; }
  .password-form .btn { justify-self: stretch; }
  .password-modal { padding: 22px 18px; }
}
</style>

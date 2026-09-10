<template>
  <div class="shell">
    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <button class="brand" @click="navigateTo('/')">
          <div class="brand-mark">
            <img v-if="showBrandImage" :src="brandLogo" alt="万影工坊" class="brand-logo" @error="showBrandImage = false" />
            <span v-else class="brand-fallback">万</span>
          </div>
          <div class="brand-text">
            <span class="brand-name">万影工坊</span>
            <span class="brand-sub">wanvision</span>
          </div>
        </button>
      </div>

      <div class="header-account" ref="accountMenuRef">
        <template v-if="user">
          <NuxtLink to="/credits" class="credit-chip" title="查看积分余额">
            <span class="credit-symbol">✦</span>
            <span>{{ creditBalance }}</span>
          </NuxtLink>
          <button
            class="account-trigger"
            type="button"
            :aria-expanded="accountMenuOpen"
            aria-haspopup="menu"
            @click="accountMenuOpen = !accountMenuOpen"
          >
            <img class="account-avatar account-avatar-image" :src="accountAvatar" alt="个人头像" @error="useDefaultAvatar" />
            <ChevronDown :size="14" :stroke-width="1.8" />
          </button>
          <div v-if="accountMenuOpen" class="account-menu" role="menu">
            <div class="account-menu-head">
              <img class="account-avatar large account-avatar-image" :src="accountAvatar" alt="个人头像" @error="useDefaultAvatar" />
            </div>
            <NuxtLink to="/account" class="account-menu-item" role="menuitem" @click="accountMenuOpen = false">
              <UserRound :size="15" :stroke-width="1.8" />
              账号设置
            </NuxtLink>
            <NuxtLink to="/credits" class="account-menu-item" role="menuitem" @click="accountMenuOpen = false">
              <WalletCards :size="15" :stroke-width="1.8" />
              积分中心
              <span class="menu-balance">{{ creditBalance }}</span>
            </NuxtLink>
            <button class="account-menu-item danger" type="button" role="menuitem" @click="handleSignOut">
              <LogOut :size="15" :stroke-width="1.8" />
              退出登录
            </button>
          </div>
        </template>
        <NuxtLink v-else to="/login" class="login-action">登录 / 注册</NuxtLink>
      </div>
    </header>

    <!-- AI 服务未配置引导横幅(缺任一类型即提示) -->
    <div v-if="missingConfigLabels.length" class="config-banner">
      <TriangleAlert :size="14" :stroke-width="1.8" />
      <span>尚未配置{{ missingConfigLabels.join('、') }}模型,AI 功能无法使用</span>
      <a v-if="user?.role === 'admin' && adminOrigin" :href="adminOrigin" class="config-banner-link">前往后台配置</a>
      <span v-else class="config-banner-link config-banner-contact">请联系管理员配置</span>
    </div>

    <main class="content">
      <slot />
    </main>
  </div>
</template>

<script setup>
import { ChevronDown, LogOut, TriangleAlert, UserRound, WalletCards } from 'lucide-vue-next'
import { aiConfigAPI, creditAPI } from '~/composables/useApi'
import brandLogo from '~/assets/logo.svg'
import defaultAvatar from '~/assets/wanying-default-avatar.png'

const route = useRoute()
const config = useRuntimeConfig()
const showBrandImage = ref(true)

const SERVICE_TYPE_LABELS = { text: '文本', image: '图片', video: '视频' }
const missingConfigLabels = ref([])
const { user, signOut } = useAuth()
const creditBalance = ref('--')
const accountMenuOpen = ref(false)
const accountMenuRef = ref(null)
const accountAvatar = computed(() => user.value?.avatar || defaultAvatar)

const adminOrigin = String(config.public.adminOrigin || '').replace(/\/+$/, '')

async function checkAiConfigs() {
  try {
    const configs = await aiConfigAPI.list()
    missingConfigLabels.value = Object.entries(SERVICE_TYPE_LABELS)
      .filter(([type]) => !configs.some(c => c.service_type === type && c.is_active))
      .map(([, label]) => label)
  } catch { /* 配置检查失败不阻塞页面 */ }
}

onMounted(checkAiConfigs)
onMounted(async () => {
  if (!user.value) return
  try {
    const accounts = await creditAPI.list()
    creditBalance.value = accounts?.[0]?.balance ?? 0
  } catch { creditBalance.value = '--' }
})
// 设置页保存配置后返回时重新检查(布局跨页面复用,onMounted 只触发一次)
watch(() => route.path, checkAiConfigs)
watch(() => route.path, () => { accountMenuOpen.value = false })

async function handleSignOut() {
  accountMenuOpen.value = false
  await signOut()
  navigateTo('/login')
}

function useDefaultAvatar(event) {
  if (event.currentTarget.getAttribute('src') !== defaultAvatar) event.currentTarget.src = defaultAvatar
}

function onDocumentPointerDown(event) {
  if (!accountMenuRef.value?.contains(event.target)) accountMenuOpen.value = false
}

function onDocumentKeydown(event) {
  if (event.key === 'Escape') accountMenuOpen.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onDocumentKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<style scoped>
.shell {
  display: flex; flex-direction: column;
  height: 100vh; overflow: hidden;
  background: var(--bg-base);
}

/* === Header === */
.header {
  display: flex; align-items: center;
  height: 60px; flex-shrink: 0;
  padding: 0 24px;
  gap: 32px;
  background: rgba(251,251,253,0.72);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 1px solid var(--border);
  position: relative; z-index: 10;
}

.header-left { display: flex; align-items: center; }
.header-account { position: relative; display: flex; align-items: center; gap: 10px; margin-left: auto; color: var(--text-3); font-size: 11px; }
.credit-chip { display: inline-flex; align-items: center; gap: 5px; min-height: 30px; padding: 0 9px; border: 1px solid var(--border); border-radius: 7px; color: var(--text-1); text-decoration: none; font-variant-numeric: tabular-nums; }
.credit-chip:hover { border-color: var(--accent); background: var(--bg-hover); }
.credit-symbol { color: var(--accent); font-size: 14px; font-weight: 750; line-height: 1; }
.login-action { color: var(--text-1); text-decoration: none; border: 0; background: transparent; cursor: pointer; font-size: 12px; font-weight: 650; }
.login-action:hover { color: var(--accent); }
.account-trigger {
  min-height: 36px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 9px 3px 4px;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-1);
  cursor: pointer;
  transition: background 0.16s var(--ease-out), border-color 0.16s var(--ease-out);
}
.account-trigger:hover,
.account-trigger[aria-expanded="true"] { background: var(--bg-hover); border-color: var(--border); }
.account-trigger:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3.5px var(--button-focus);
}
.account-avatar {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--text-0);
  color: #fff;
  font-size: 11px;
  font-weight: 750;
  line-height: 1;
}
.account-avatar.large { width: 38px; height: 38px; font-size: 13px; }
.account-avatar-image { display:block; object-fit:cover; background:var(--text-0); }
.account-copy {
  display: grid;
  gap: 1px;
  text-align: left;
  line-height: 1.1;
}
.account-copy strong {
  max-width: 138px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text-0);
}
.account-copy small { font-size: 10px; color: var(--text-3); }
.account-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 236px;
  display: grid;
  gap: 3px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow-lg);
  z-index: 20;
}
.account-menu-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 8px 10px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 4px;
}
.account-menu-head div { display: grid; gap: 2px; min-width: 0; }
.account-menu-head strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--text-0);
}
.account-menu-head small { font-size: 11px; color: var(--text-3); }
.account-menu-item {
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 9px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-1);
  text-decoration: none;
  font: 650 12px/1 var(--font-body);
  text-align: left;
  cursor: pointer;
}
.account-menu-item:hover { background: var(--bg-hover); color: var(--text-0); }
.account-menu-item:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--button-focus);
}
.account-menu-item.danger { color: var(--action-danger); }
.account-menu-item.danger:hover { background: var(--action-danger-bg); color: var(--action-danger); }
.menu-balance {
  margin-left: auto;
  color: var(--accent-text);
  font-variant-numeric: tabular-nums;
}

.brand {
  display: flex; align-items: center; gap: 9px;
  background: transparent; border: none; cursor: pointer; padding: 4px 8px 4px 4px;
  text-decoration: none; border-radius: var(--radius);
  transition: background 0.18s var(--ease-out);
  color: var(--text-0);
}
.brand:hover { background: var(--bg-hover); }
.brand:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3.5px var(--button-focus);
}
.brand-mark {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  background: var(--text-0); border-radius: 9px;
  overflow: hidden;
}
.brand-logo {
  width: 16px;
  height: 16px;
  object-fit: contain;
  display: block;
}
.brand-fallback {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  line-height: 1;
}
.brand-text {
  height: 32px;
  display: grid;
  align-content: center;
  justify-items: start;
  gap: 1px;
}
.brand-name {
  font-size: 15px; font-weight: 700;
  line-height: 1.15;
  color: var(--text-0);
  letter-spacing: 0;
}
.brand-sub {
  font-size: 10px; font-weight: 400;
  line-height: 1.1;
  color: var(--text-3);
  letter-spacing: 0;
}

/* Nav — pill segmented group */
.header-nav {
  display: flex; gap: 2px;
  padding: 3px;
  border-radius: var(--radius-pill);
  background: rgba(0,0,0,0.05);
}
.nav-link {
  display: flex; align-items: center; gap: 6px;
  min-height: 32px;
  padding: 0 16px; border-radius: var(--radius-pill);
  font-size: 13px; font-weight: 600;
  color: var(--text-2); text-decoration: none;
  transition: all 0.18s var(--ease-out);
  border: none;
  line-height: 1;
}
.nav-link:hover { color: var(--text-0); }
.nav-link.active {
  background: #fff;
  color: var(--text-0);
  box-shadow: 0 1px 4px rgba(0,0,0,0.1);
}
.nav-link:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3.5px var(--button-focus);
}

/* Config banner — AI 服务未配置引导 */
.config-banner {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 24px; flex-shrink: 0;
  font-size: 12.5px; color: #92400e;
  background: #fffbeb;
  border-bottom: 1px solid #fde68a;
  position: relative; z-index: 9;
}
.config-banner-link {
  margin-left: auto;
  font-size: 12.5px; font-weight: 600;
  color: #b45309; text-decoration: none;
  padding: 2px 10px; border-radius: var(--radius-pill);
  border: 1px solid #fcd34d;
  transition: all 0.18s var(--ease-out);
  line-height: 1.6;
}
.config-banner-link:hover { background: #fef3c7; color: #92400e; }

/* Content */
.content { flex: 1; min-height: 0; overflow: auto; overflow-x: hidden; display: flex; flex-direction: column; }

@media (max-width: 760px) {
  .header {
    height: auto;
    min-height: 60px;
    padding: 10px 14px;
    gap: 10px;
    flex-wrap: wrap;
  }
  .header-nav { order: 3; width: 100%; overflow-x: auto; }
  .nav-link { flex: 1; justify-content: center; padding: 0 12px; }
  .brand-sub,
  .account-copy,
  .credit-chip { display: none; }
  .header-account { margin-left: auto; }
  .account-menu { right: 0; }
}
</style>

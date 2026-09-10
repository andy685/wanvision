// 应用启动时向服务器校准用户资料，避免 localStorage 中的昵称/头像过期。
// 各浏览器本地缓存独立，之前只写不刷，导致同一账号在不同浏览器显示的资料不一致。
import { useAuthStore } from '~/stores/auth'

export default defineNuxtPlugin(() => {
  const auth = useAuthStore()
  // 本地无会话则不发请求（未登录时中间件会处理跳转）
  if (!auth.user) return
  auth.refreshUser().catch(() => {
    // 校准失败不影响页面使用，静默降级为本地缓存数据
  })
})

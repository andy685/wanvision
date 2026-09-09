const USER_SESSION_KEY = 'wanying:session'
const ADMIN_SESSION_KEY = 'wanying:admin-session'

function readSession(key: string, cookieName: string) {
  const cookie = useCookie<string | null>(cookieName)
  if (cookie.value) return { token: cookie.value, cookie }
  if (import.meta.client) {
    const token = localStorage.getItem(key)
    if (token) {
      cookie.value = token
      return { token, cookie }
    }
  }
  return { token: '', cookie }
}

async function hasValidUserSession(token: string) {
  if (!token) return false
  try {
    const config = useRuntimeConfig()
    const base = String(config.public.apiBase || '/api/v1').replace(/\/+$/, '')
    const response = await $fetch<{ data?: unknown; code?: number }>(`${base}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return !!response?.data
  } catch {
    return false
  }
}

export default defineNuxtRouteMiddleware(async (to) => {
  const config = useRuntimeConfig()
  const adminOrigin = String(config.public.adminOrigin || '').replace(/\/+$/, '')
  const currentOrigin = import.meta.server ? useRequestURL().origin : window.location.origin
  const isAdminOrigin = !!adminOrigin && currentOrigin === adminOrigin
  const adminTarget = (path: string) => adminOrigin ? `${adminOrigin}${path}` : path

  if (adminOrigin && to.path.startsWith('/admin') && !isAdminOrigin) {
    return navigateTo(adminTarget(to.fullPath), { external: true })
  }
  if (isAdminOrigin && !to.path.startsWith('/admin')) {
    const { token } = readSession(ADMIN_SESSION_KEY, ADMIN_SESSION_KEY)
    return navigateTo(token ? '/admin' : '/admin/login')
  }
  if (to.path.startsWith('/admin')) {
    if (to.path === '/admin/login') return
    const { token } = readSession(ADMIN_SESSION_KEY, ADMIN_SESSION_KEY)
    if (!token) return navigateTo(`/admin/login?redirect=${encodeURIComponent(to.fullPath)}`)
    return
  }
  if (to.path === '/login') return
  const { token, cookie } = readSession(USER_SESSION_KEY, USER_SESSION_KEY)
  if (!token || !(await hasValidUserSession(token))) {
    if (import.meta.client) localStorage.removeItem(USER_SESSION_KEY)
    cookie.value = null
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
})

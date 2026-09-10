import { STORAGE_KEYS } from '~/constants/storage'

const USER_SESSION_KEY = STORAGE_KEYS.session

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
  if (to.path === '/admin' || to.path.startsWith('/admin/')) {
    const config = useRuntimeConfig()
    const adminOrigin = String(config.public.adminOrigin || '').replace(/\/+$/, '')
    return navigateTo(adminOrigin || '/', adminOrigin ? { external: true } : undefined)
  }

  if (to.path === '/login') return
  const { token, cookie } = readSession(USER_SESSION_KEY, USER_SESSION_KEY)
  if (!token || !(await hasValidUserSession(token))) {
    if (import.meta.client) localStorage.removeItem(USER_SESSION_KEY)
    cookie.value = null
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
})

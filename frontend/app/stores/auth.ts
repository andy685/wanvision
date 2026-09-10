import { defineStore } from 'pinia'
import { authAPI } from '~/api/auth'
import { STORAGE_KEYS } from '~/constants/storage'
import type { User } from '~/api/types'

interface AuthResult {
  token: string
  user: User
}

export const useAuthStore = defineStore('auth', () => {
  const sessionCookie = useCookie<string | null>(STORAGE_KEYS.session, {
    maxAge: 60 * 60 * 24 * 30,
    sameSite: 'lax',
  })
  const user = ref<User | null>(null)
  const loading = ref(false)

  function hydrate() {
    if (!import.meta.client) return
    const token = sessionCookie.value || localStorage.getItem(STORAGE_KEYS.session)
    if (token && !sessionCookie.value) sessionCookie.value = token
    try {
      user.value = JSON.parse(localStorage.getItem(STORAGE_KEYS.user) || 'null')
    } catch {
      user.value = null
    }
  }

  function setSession(result: AuthResult) {
    if (import.meta.client) {
      localStorage.setItem(STORAGE_KEYS.session, result.token)
      localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(result.user))
    }
    sessionCookie.value = result.token
    user.value = result.user
  }

  function clearSession() {
    if (import.meta.client) {
      localStorage.removeItem(STORAGE_KEYS.session)
      localStorage.removeItem(STORAGE_KEYS.user)
    }
    sessionCookie.value = null
    user.value = null
  }

  async function signIn(phone: string, password: string, register = false) {
    loading.value = true
    try {
      const result = register
        ? await authAPI.register(phone, password)
        : await authAPI.login(phone, password)
      setSession(result)
      return result
    } finally {
      loading.value = false
    }
  }

  async function signOut() {
    try {
      await authAPI.logout()
    } finally {
      clearSession()
    }
  }

  async function resetPassword(phone: string, code: string, password: string) {
    loading.value = true
    try {
      return await authAPI.resetPassword(phone, code, password)
    } finally {
      loading.value = false
    }
  }

  async function requestPasswordReset(phone: string) {
    return authAPI.requestPasswordReset(phone)
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    const result = await authAPI.changePassword(currentPassword, newPassword)
    if (result?.token) setSession({ token: result.token, user: user.value! })
    return result
  }

  async function updateProfile(data: { nickname: string; avatar: string }) {
    const result = await authAPI.updateProfile(data)
    if (result) {
      user.value = result
      // 同步写回 localStorage，否则刷新页面后 hydrate() 会用旧资料覆盖显示
      if (import.meta.client) {
        localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(result))
      }
    }
    return result
  }

  async function refreshUser() {
    const result = await authAPI.me()
    if (result) {
      user.value = result
      if (import.meta.client) {
        localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(result))
      }
    }
    return result
  }

  hydrate()

  return {
    user,
    loading,
    signIn,
    signOut,
    resetPassword,
    requestPasswordReset,
    changePassword,
    updateProfile,
    refreshUser,
    setSession,
    clearSession,
  }
})

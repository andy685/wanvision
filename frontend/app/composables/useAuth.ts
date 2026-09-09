import { authAPI } from './useApi'

const SESSION_KEY = 'wanying:session'
const USER_KEY = 'wanying:user'

export function useAuth() {
  const sessionCookie = useCookie<string | null>('wanying:session', { maxAge: 60 * 60 * 24 * 30, sameSite: 'lax' })
  if (import.meta.client && !sessionCookie.value) {
    const existingToken = localStorage.getItem(SESSION_KEY)
    if (existingToken) sessionCookie.value = existingToken
  }
  const user = useState<any | null>('wanying-user', () => {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null') } catch { return null }
  })
  const loading = useState('wanying-auth-loading', () => false)

  async function signIn(phone: string, password: string, register = false) {
    loading.value = true
    try {
      const result = register ? await authAPI.register(phone, password) : await authAPI.login(phone, password)
      localStorage.setItem(SESSION_KEY, result.token)
      sessionCookie.value = result.token
      localStorage.setItem(USER_KEY, JSON.stringify(result.user))
      user.value = result.user
      return result
    } finally { loading.value = false }
  }

  async function signOut() {
    try { await authAPI.logout() } finally {
      localStorage.removeItem(SESSION_KEY)
      sessionCookie.value = null
      localStorage.removeItem(USER_KEY)
      user.value = null
    }
  }

  async function resetPassword(phone: string, code: string, password: string) {
    loading.value = true
    try { return await authAPI.resetPassword(phone, code, password) } finally { loading.value = false }
  }
  async function requestPasswordReset(phone: string) { return authAPI.requestPasswordReset(phone) }
  async function changePassword(currentPassword: string, newPassword: string) {
    const result = await authAPI.changePassword(currentPassword, newPassword)
    if (result?.token) localStorage.setItem(SESSION_KEY, result.token)
    if (result?.token) sessionCookie.value = result.token
    return result
  }

  return { user, loading, signIn, signOut, resetPassword, requestPasswordReset, changePassword }
}

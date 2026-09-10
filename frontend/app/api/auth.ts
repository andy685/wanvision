import { api } from './client'
import type { User } from './types'

export interface AuthResult {
  token: string
  user: User
}

export const authAPI = {
  register: (phone: string, password: string) =>
    api.post<AuthResult>('/auth/register', { phone, password }),
  login: (phone: string, password: string) =>
    api.post<AuthResult>('/auth/login', { phone, password }),
  me: () => api.get<User>('/auth/me'),
  logout: () => api.post<void>('/auth/logout'),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/password/change', { current_password: currentPassword, new_password: newPassword }),
  updateProfile: (data: { nickname: string; avatar: string }) =>
    api.patch<User>('/auth/profile', data),
  requestPasswordReset: (phone: string) =>
    api.post<{ debug_code?: string }>('/auth/password-reset/request', { phone }),
  resetPassword: (phone: string, code: string, password: string) =>
    api.post('/auth/password-reset/confirm', { phone, code, password }),
}

import { api } from './client'
import type { Drama } from './types'

export const dramaAPI = {
  list: () => api.get<{ items: Drama[] }>('/dramas'),
  get: (id: number) => api.get<Drama>(`/dramas/${id}`),
  create: (data: Partial<Drama>) => api.post<Drama>('/dramas', data),
  update: (id: number, data: Partial<Drama>) => api.put<Drama>(`/dramas/${id}`, data),
  del: (id: number) => api.del<void>(`/dramas/${id}`),
  members: (id: number) => api.get(`/dramas/${id}/members`),
  grantMember: (id: number, phone: string, role = 'creator') =>
    api.post(`/dramas/${id}/members`, { phone, role }),
  removeMember: (id: number, memberId: number) =>
    api.del(`/dramas/${id}/members/${memberId}`),
}

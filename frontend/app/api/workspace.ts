import { api } from './client'
import type { Workspace } from './types'

export const workspaceAPI = {
  list: () => api.get<Workspace[]>('/workspaces'),
  create: (name: string) => api.post<Workspace>('/workspaces', { name }),
  members: (id: number) => api.get(`/workspaces/${id}/members`),
  invite: (id: number, phone: string, role = 'creator') =>
    api.post(`/workspaces/${id}/members`, { phone, role }),
  removeMember: (id: number, memberId: number) =>
    api.del(`/workspaces/${id}/members/${memberId}`),
}

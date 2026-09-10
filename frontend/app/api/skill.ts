import { api } from './client'
import type { Skill } from './types'

export const skillsAPI = {
  list: () => api.get<Skill[]>('/skills'),
  get: (id: string) => api.get<Skill>(`/skills/${id}`),
  create: (data: { id: string; name: string; description?: string }) =>
    api.post<Skill>('/skills', data),
  update: (id: string, content: string) =>
    api.put<Skill>(`/skills/${id}`, { content }),
  del: (id: string) => api.del<void>(`/skills/${id}`),
}

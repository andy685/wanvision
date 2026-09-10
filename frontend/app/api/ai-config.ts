import { api } from './client'
import type { AIConfig } from './types'

export const aiConfigAPI = {
  list: (t?: string) => api.get<AIConfig[]>(`/ai-configs${t ? `?service_type=${t}` : ''}`),
  create: (data: Partial<AIConfig>) => api.post<AIConfig>('/ai-configs', data),
  update: (id: number, data: Partial<AIConfig>) => api.put<AIConfig>(`/ai-configs/${id}`, data),
  del: (id: number) => api.del<void>(`/ai-configs/${id}`),
  test: (data: unknown) => api.post('/ai-configs/test', data),
}

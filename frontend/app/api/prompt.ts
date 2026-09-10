import { api } from './client'
import type { Prompt } from './types'

export const promptAPI = {
  list: () => api.get<Prompt[]>('/prompts'),
  get: (type: string) => api.get<Prompt>(`/prompts/${type}`),
  update: (type: string, data: Partial<Prompt>) => api.put<Prompt>(`/prompts/${type}`, data),
  reset: (type: string) => api.post<Prompt>(`/prompts/${type}/reset`),
}

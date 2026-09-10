import { api } from './client'
import type { Storyboard } from './types'

export const storyboardAPI = {
  create: (data: Partial<Storyboard>) => api.post<Storyboard>('/storyboards', data),
  update: (id: number, data: Partial<Storyboard>) => api.put<Storyboard>(`/storyboards/${id}`, data),
  del: (id: number) => api.del<void>(`/storyboards/${id}`),
}

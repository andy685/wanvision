import { api } from './client'
import type { StylePreset } from './types'

export const stylePresetAPI = {
  list: (all = false) => api.get<StylePreset[]>(`/style-presets${all ? '?all=1' : ''}`),
  create: (data: Partial<StylePreset>) => api.post<StylePreset>('/style-presets', data),
  update: (id: number, data: Partial<StylePreset>) => api.put<StylePreset>(`/style-presets/${id}`, data),
  del: (id: number) => api.del<void>(`/style-presets/${id}`),
}

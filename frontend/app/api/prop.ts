import { api } from './client'
import type { Prop } from './types'

export const propAPI = {
  create: (data: Partial<Prop>) => api.post<Prop>('/props', data),
  update: (id: number, data: Partial<Prop>) => api.put<Prop>(`/props/${id}`, data),
  del: (id: number) => api.del<void>(`/props/${id}`),
  generatePrompt: (id: number, episodeId: number, force = false, textModel?: string, textConfigId?: number) =>
    api.post(`/props/${id}/generate-prompt`, { episode_id: episodeId, force, text_model: textModel || undefined, text_config_id: textConfigId || undefined }),
  generateImage: (id: number, episodeId: number, model?: string, configId?: number, textModel?: string, textConfigId?: number) =>
    api.post(`/props/${id}/generate-image`, { episode_id: episodeId, model: model || undefined, config_id: configId || undefined, text_model: textModel || undefined, text_config_id: textConfigId || undefined }),
}

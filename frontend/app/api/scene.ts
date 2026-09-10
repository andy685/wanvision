import { api } from './client'
import type { Scene } from './types'

export const sceneAPI = {
  create: (data: Partial<Scene>) => api.post<Scene>('/scenes', data),
  update: (id: number, data: Partial<Scene>) => api.put<Scene>(`/scenes/${id}`, data),
  del: (id: number) => api.del<void>(`/scenes/${id}`),
  generatePrompt: (id: number, episodeId: number, force = false, textModel?: string, textConfigId?: number) =>
    api.post(`/scenes/${id}/generate-prompt`, { episode_id: episodeId, force, text_model: textModel || undefined, text_config_id: textConfigId || undefined }),
  generateImage: (id: number, episodeId: number, model?: string, configId?: number, textModel?: string, textConfigId?: number) =>
    api.post(`/scenes/${id}/generate-image`, { episode_id: episodeId, model: model || undefined, config_id: configId || undefined, text_model: textModel || undefined, text_config_id: textConfigId || undefined }),
}

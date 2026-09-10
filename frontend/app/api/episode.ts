import { api } from './client'
import type { Character, Episode, Prop, Scene, Storyboard, Task } from './types'

export const episodeAPI = {
  create: (data: Partial<Episode>) => api.post<Episode>('/episodes', data),
  update: (id: number, data: Partial<Episode>) => api.put<Episode>(`/episodes/${id}`, data),
  del: (id: number) => api.del<void>(`/episodes/${id}`),
  characters: (id: number) => api.get<Character[]>(`/episodes/${id}/characters`),
  scenes: (id: number) => api.get<Scene[]>(`/episodes/${id}/scenes`),
  props: (id: number) => api.get<Prop[]>(`/episodes/${id}/props`),
  storyboards: (id: number) => api.get<Storyboard[]>(`/episodes/${id}/storyboards`),
  pipelineStatus: (id: number) => api.get(`/episodes/${id}/pipeline-status`),
  extract: (id: number, target: string, model?: string, configId?: number) =>
    api.post(`/episodes/${id}/extract`, { target, model: model || undefined, config_id: configId || undefined }),
  extractStatus: (id: number) => api.get(`/episodes/${id}/extract-status`),
  generateVideoPrompts: (id: number, model?: string, configId?: number, storyboardIds?: number[]) =>
    api.post(`/episodes/${id}/generate-video-prompts`, { model: model || undefined, config_id: configId || undefined, storyboard_ids: storyboardIds?.length ? storyboardIds : undefined }),
  videoPromptsStatus: (id: number) => api.get(`/episodes/${id}/video-prompts-status`),
  generationTasks: (id: number) => api.get<{ tasks: Task[]; merges: any[] }>(`/episodes/${id}/generation-tasks`),
}

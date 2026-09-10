import { api } from './client'
import type { Task } from './types'

export interface TaskListParams {
  type?: 'image' | 'video' | 'text'
  drama_id?: number
  storyboard_id?: number
}

export const taskAPI = {
  generate: (data: Partial<Task>) => api.post<Task>('/tasks', data),
  get: (id: number) => api.get<Task>(`/tasks/${id}`),
  del: (id: number) => api.del<void>(`/tasks/${id}`),
  listByEpisode: (episodeId: number) => api.get<{ tasks: Task[]; merges: any[] }>(`/episodes/${episodeId}/generation-tasks`),
  list: (params?: TaskListParams) => {
    const query = new URLSearchParams()
    if (params?.type) query.set('type', params.type)
    if (params?.drama_id) query.set('drama_id', String(params.drama_id))
    if (params?.storyboard_id) query.set('storyboard_id', String(params.storyboard_id))
    return api.get<Task[]>(`/tasks${query.size ? `?${query.toString()}` : ''}`)
  },
}

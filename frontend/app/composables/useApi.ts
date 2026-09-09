import { friendlyErrorMessage } from './useFriendlyError'

const BASE = '/api/v1'

function apiBase() {
  return (useRuntimeConfig().public.apiBase || BASE).replace(/\/+$/, '')
}

async function req<T = any>(method: string, path: string, body?: any): Promise<T> {
  const isAdminPageRequest = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin') && (path.startsWith('/ai-configs') || path.startsWith('/ai-providers'))
  const isAdminRequest = path.startsWith('/admin') || path === '/pricing/admin' || path.startsWith('/pricing/admin/') || isAdminPageRequest
  const tokenKey = isAdminRequest ? 'wanying:admin-session' : 'wanying:session'
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem(tokenKey) : ''
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const workspaceId = typeof localStorage !== 'undefined' ? localStorage.getItem('wanying:workspace') : ''
  if (workspaceId) headers['X-Workspace-Id'] = workspaceId
  const opts: RequestInit = { method, headers }
  if (body) opts.body = JSON.stringify(body)

  const start = performance.now()
  console.log(`%c[API] %c${method} %c${path}`, 'color:#888', 'color:#4fc3f7;font-weight:bold', 'color:#ccc', body || '')

  try {
    const resp = await fetch(`${apiBase()}${path}`, opts)
    const raw = await resp.text()
    let json: any = null
    if (raw.trim()) {
      try {
        json = JSON.parse(raw)
      } catch {
        throw new Error(`服务返回了无效响应（${resp.status}）`)
      }
    }
    const ms = Math.round(performance.now() - start)

    if (!resp.ok || (json?.code && json.code >= 400)) {
      console.log(`%c[API] %c${method} ${path} %c${resp.status} %c${ms}ms`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold', 'color:#888', json?.message || '')
      throw new Error(friendlyErrorMessage(json?.message || `${resp.status}`))
    }

    console.log(`%c[API] %c${method} ${path} %c${resp.status} %c${ms}ms`, 'color:#888', 'color:#66bb6a', 'color:#66bb6a;font-weight:bold', 'color:#888')
    return json?.data ?? json
  } catch (err: any) {
    if (!err.message?.match(/^\d{3}$/)) {
      const ms = Math.round(performance.now() - start)
      console.log(`%c[API] %c${method} ${path} %cERROR %c${ms}ms`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold', 'color:#888', err.message)
    }
    if (/network error|failed to fetch|econnrefused/i.test(err?.message || '')) {
      throw new Error(friendlyErrorMessage(err, '服务连接失败，请检查网络或确认服务端已启动后重试。'))
    }
    throw err
  }
}

export const api = {
  get: <T = any>(p: string) => req<T>('GET', p),
  post: <T = any>(p: string, b?: any) => req<T>('POST', p, b),
  put: <T = any>(p: string, b?: any) => req<T>('PUT', p, b),
  patch: <T = any>(p: string, b?: any) => req<T>('PATCH', p, b),
  del: <T = any>(p: string) => req<T>('DELETE', p),
}

export const dramaAPI = {
  list: () => api.get<{ items: any[] }>('/dramas'),
  get: (id: number) => api.get(`/dramas/${id}`),
  create: (data: any) => api.post('/dramas', data),
  update: (id: number, data: any) => api.put(`/dramas/${id}`, data),
  del: (id: number) => api.del(`/dramas/${id}`),
  members: (id: number) => api.get(`/dramas/${id}/members`),
  grantMember: (id: number, phone: string, role = 'creator') => api.post(`/dramas/${id}/members`, { phone, role }),
  removeMember: (id: number, memberId: number) => api.del(`/dramas/${id}/members/${memberId}`),
}

export const authAPI = {
  register: (phone: string, password: string) => api.post('/auth/register', { phone, password }),
  login: (phone: string, password: string) => api.post('/auth/login', { phone, password }),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
  changePassword: (currentPassword: string, newPassword: string) => api.post('/auth/password/change', { current_password: currentPassword, new_password: newPassword }),
  updateProfile: (data: { nickname: string; avatar: string }) => api.patch('/auth/profile', data),
  requestPasswordReset: (phone: string) => api.post('/auth/password-reset/request', { phone }),
  resetPassword: (phone: string, code: string, password: string) => api.post('/auth/password-reset/confirm', { phone, code, password }),
}

export const creditAPI = {
  list: () => api.get('/credits'),
  ledger: (workspaceId?: number) => api.get(`/credits/ledger${workspaceId ? `?workspace_id=${workspaceId}` : ''}`),
}

export const workspaceAPI = {
  list: () => api.get('/workspaces'),
  create: (name: string) => api.post('/workspaces', { name }),
  members: (id: number) => api.get(`/workspaces/${id}/members`),
  invite: (id: number, phone: string, role = 'creator') => api.post(`/workspaces/${id}/members`, { phone, role }),
  removeMember: (id: number, memberId: number) => api.del(`/workspaces/${id}/members/${memberId}`),
}

export const pricingAPI = {
  list: () => api.get('/pricing'),
  quote: (action: string, quantity = 1) => api.post('/pricing/quote', { action, quantity }),
}

export const rechargeAPI = {
  create: (amount: number, paymentProvider: 'wechat' | 'alipay') => api.post('/recharge/orders', { amount, payment_provider: paymentProvider }),
  list: () => api.get('/recharge/orders'),
  get: (orderNo: string) => api.get(`/recharge/orders/${orderNo}`),
  pay: (orderNo: string) => api.post(`/recharge/orders/${orderNo}/pay`),
}

export const adminAPI = {
  overview: () => api.get('/admin/overview'),
  users: () => api.get('/admin/users'),
  workspaces: () => api.get('/admin/workspaces'),
  orders: () => api.get('/admin/orders'),
  tasks: (params = '') => api.get(`/admin/tasks${params ? `?${params}` : ''}`),
  cancelTask: (taskId: number) => api.post(`/admin/tasks/${taskId}/cancel`),
  retryTask: (taskId: number) => api.post(`/admin/tasks/${taskId}/retry`),
  pricing: () => api.get('/pricing/admin'),
  updatePricing: (id: number, data: any) => api.put(`/pricing/admin/${id}`, data),
  aiConfigs: () => api.get('/ai-configs'),
  paymentSettings: () => api.get('/admin/payment-settings'),
  updatePaymentSettings: (data: any) => api.put('/admin/payment-settings', data),
  adjustUserCredits: (userId: number, amount: number, note: string) => api.post(`/admin/users/${userId}/credits`, { amount, note }),
  updateUserStatus: (userId: number, status: 'active' | 'disabled') => api.patch(`/admin/users/${userId}/status`, { status }),
  updateWorkspaceStatus: (workspaceId: number, status: 'active' | 'disabled') => api.patch(`/admin/workspaces/${workspaceId}/status`, { status }),
  refundOrder: (orderNo: string) => api.post(`/admin/orders/${orderNo}/refund`),
  auditLogs: () => api.get('/admin/audit-logs'),
}

export const episodeAPI = {
  create: (data: any) => api.post('/episodes', data),
  update: (id: number, data: any) => api.put(`/episodes/${id}`, data),
  del: (id: number) => api.del(`/episodes/${id}`),
  characters: (id: number) => api.get(`/episodes/${id}/characters`),
  scenes: (id: number) => api.get(`/episodes/${id}/scenes`),
  props: (id: number) => api.get(`/episodes/${id}/props`),
  storyboards: (id: number) => api.get(`/episodes/${id}/storyboards`),
  pipelineStatus: (id: number) => api.get(`/episodes/${id}/pipeline-status`),
  extract: (id: number, target: string, model?: string, configId?: number) => api.post(`/episodes/${id}/extract`, { target, model: model || undefined, config_id: configId || undefined }),
  extractStatus: (id: number) => api.get(`/episodes/${id}/extract-status`),
  generateVideoPrompts: (id: number, model?: string, configId?: number, storyboardIds?: number[]) => api.post(`/episodes/${id}/generate-video-prompts`, { model: model || undefined, config_id: configId || undefined, storyboard_ids: storyboardIds?.length ? storyboardIds : undefined }),
  videoPromptsStatus: (id: number) => api.get(`/episodes/${id}/video-prompts-status`),
}

export const storyboardAPI = {
  create: (data: any) => api.post('/storyboards', data),
  update: (id: number, data: any) => api.put(`/storyboards/${id}`, data),
  del: (id: number) => api.del(`/storyboards/${id}`),
}

export const characterAPI = {
  create: (data: any) => api.post('/characters', data),
  update: (id: number, data: any) => api.put(`/characters/${id}`, data),
  del: (id: number) => api.del(`/characters/${id}`),
  generatePrompt: (id: number, episodeId: number, force = false, textModel?: string, textConfigId?: number) => api.post(`/characters/${id}/generate-prompt`, { episode_id: episodeId, force, text_model: textModel || undefined, text_config_id: textConfigId || undefined }),
  generateImage: (id: number, episodeId: number, model?: string, configId?: number, textModel?: string, textConfigId?: number) => api.post(`/characters/${id}/generate-image`, { episode_id: episodeId, model: model || undefined, config_id: configId || undefined, text_model: textModel || undefined, text_config_id: textConfigId || undefined }),
  batchImages: (ids: number[], episodeId: number, model?: string, configId?: number, textModel?: string, textConfigId?: number) => api.post('/characters/batch-generate-images', { character_ids: ids, episode_id: episodeId, model: model || undefined, config_id: configId || undefined, text_model: textModel || undefined, text_config_id: textConfigId || undefined }),
}

export const sceneAPI = {
  create: (data: any) => api.post('/scenes', data),
  update: (id: number, data: any) => api.put(`/scenes/${id}`, data),
  del: (id: number) => api.del(`/scenes/${id}`),
  generatePrompt: (id: number, episodeId: number, force = false, textModel?: string, textConfigId?: number) => api.post(`/scenes/${id}/generate-prompt`, { episode_id: episodeId, force, text_model: textModel || undefined, text_config_id: textConfigId || undefined }),
  generateImage: (id: number, episodeId: number, model?: string, configId?: number, textModel?: string, textConfigId?: number) => api.post(`/scenes/${id}/generate-image`, { episode_id: episodeId, model: model || undefined, config_id: configId || undefined, text_model: textModel || undefined, text_config_id: textConfigId || undefined }),
}

export const propAPI = {
  create: (data: any) => api.post('/props', data),
  update: (id: number, data: any) => api.put(`/props/${id}`, data),
  del: (id: number) => api.del(`/props/${id}`),
  generatePrompt: (id: number, episodeId: number, force = false, textModel?: string, textConfigId?: number) => api.post(`/props/${id}/generate-prompt`, { episode_id: episodeId, force, text_model: textModel || undefined, text_config_id: textConfigId || undefined }),
  generateImage: (id: number, episodeId: number, model?: string, configId?: number, textModel?: string, textConfigId?: number) => api.post(`/props/${id}/generate-image`, { episode_id: episodeId, model: model || undefined, config_id: configId || undefined, text_model: textModel || undefined, text_config_id: textConfigId || undefined }),
}

// 统一生成任务（图片/视频）：POST 带 type 字段，列表按 type 过滤
export const taskAPI = {
  generate: (d: any) => api.post('/tasks', d),
  get: (id: number) => api.get(`/tasks/${id}`),
  del: (id: number) => api.del(`/tasks/${id}`),
  list: (params?: { type?: 'image' | 'video'; drama_id?: number; storyboard_id?: number }) => {
    const query = new URLSearchParams()
    if (params?.type) query.set('type', params.type)
    if (params?.drama_id) query.set('drama_id', String(params.drama_id))
    if (params?.storyboard_id) query.set('storyboard_id', String(params.storyboard_id))
    return api.get(`/tasks${query.size ? `?${query.toString()}` : ''}`)
  },
  // 按集聚合生成任务（sys_task + video_merges）
  listByEpisode: (episodeId: number) => api.get<{ tasks: any[]; merges: any[] }>(`/episodes/${episodeId}/generation-tasks`),
}

async function uploadReq<T = any>(path: string, file: File): Promise<T> {
  const fd = new FormData()
  fd.append('file', file)
  console.log(`%c[API] %cPOST %c${path} %c${file.name}`, 'color:#888', 'color:#4fc3f7;font-weight:bold', 'color:#ccc', 'color:#888')
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('wanying:session') : ''
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const workspaceId = typeof localStorage !== 'undefined' ? localStorage.getItem('wanying:workspace') : ''
  if (workspaceId) headers['X-Workspace-Id'] = workspaceId
  const resp = await fetch(`${apiBase()}${path}`, { method: 'POST', body: fd, headers })
  const raw = await resp.text()
  let json: any = null
  if (raw.trim()) {
    try { json = JSON.parse(raw) } catch { throw new Error(`服务返回了无效响应（${resp.status}）`) }
  }
  if (!resp.ok || (json?.code && json.code >= 400)) {
    console.log(`%c[API] %cPOST ${path} %c${resp.status}`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold')
    throw new Error(friendlyErrorMessage(json?.message || `${resp.status}`))
  }
  return json?.data ?? json
}

export const uploadAPI = {
  image: (f: File) => uploadReq<{ url: string; path: string }>('/upload/image', f),
  video: (f: File) => uploadReq<{ url: string; path: string }>('/upload/video', f),
  audio: (f: File) => uploadReq<{ url: string; path: string }>('/upload/audio', f),
}
export const mergeAPI = {
  merge: (epId: number, storyboardIds?: number[]) => api.post(`/merge/episodes/${epId}/merge`, storyboardIds?.length ? { storyboard_ids: storyboardIds } : {}),
  status: (epId: number) => api.get(`/merge/episodes/${epId}/merge`),
  list: (epId: number) => api.get<any[]>(`/merge/episodes/${epId}/merges`),
}
export const aiConfigAPI = {
  list: (t?: string) => api.get(`/ai-configs${t ? `?service_type=${t}` : ''}`),
  create: (d: any) => api.post('/ai-configs', d),
  update: (id: number, d: any) => api.put(`/ai-configs/${id}`, d),
  del: (id: number) => api.del(`/ai-configs/${id}`),
  test: (d: any) => api.post('/ai-configs/test', d),
}

export const promptAPI = {
  list: () => api.get('/prompts'),
  get: (type: string) => api.get(`/prompts/${type}`),
  update: (type: string, d: any) => api.put(`/prompts/${type}`, d),
  reset: (type: string) => api.post(`/prompts/${type}/reset`),
}

export const skillsAPI = {
  list: () => api.get('/skills'),
  get: (id: string) => api.get(`/skills/${id}`),
  create: (data: { id: string; name: string; description?: string }) => api.post('/skills', data),
  update: (id: string, content: string) => api.put(`/skills/${id}`, { content }),
  del: (id: string) => api.del(`/skills/${id}`),
}

export const stylePresetAPI = {
  list: (all = false) => api.get(`/style-presets${all ? '?all=1' : ''}`),
  create: (d: any) => api.post('/style-presets', d),
  update: (id: number, d: any) => api.put(`/style-presets/${id}`, d),
  del: (id: number) => api.del(`/style-presets/${id}`),
}

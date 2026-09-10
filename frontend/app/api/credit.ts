import { api } from './client'

export const creditAPI = {
  list: () => api.get('/credits'),
  // 返回 { list, total, page, page_size }，默认 50 条/页
  ledger: (params?: { workspaceId?: number; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams()
    if (params?.workspaceId) qs.set('workspace_id', String(params.workspaceId))
    if (params?.page) qs.set('page', String(params.page))
    if (params?.pageSize) qs.set('page_size', String(params.pageSize))
    const q = qs.toString()
    return api.get(`/credits/ledger${q ? `?${q}` : ''}`)
  },
}

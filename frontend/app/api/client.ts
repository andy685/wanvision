import { friendlyErrorMessage } from '~/composables/useFriendlyError'
import { STORAGE_KEYS } from '~/constants/storage'

const BASE = '/api/v1'
const isDev = import.meta.dev
const apiLog = (...args: any[]) => { if (isDev) console.log(...args) }

function apiBase() {
  return (useRuntimeConfig().public.apiBase || BASE).replace(/\/+$/, '')
}

export interface RequestOptions {
  admin?: boolean
  workspace?: boolean
  upload?: boolean
}

function getToken(admin = false): string {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem(admin ? STORAGE_KEYS.adminSession : STORAGE_KEYS.session) || ''
}

function getWorkspaceId(): string {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem(STORAGE_KEYS.workspace) || ''
}

function buildHeaders(opts: RequestOptions): Record<string, string> {
  const headers: Record<string, string> = {}
  if (!opts.upload) headers['Content-Type'] = 'application/json'
  const token = getToken(opts.admin)
  if (token) headers.Authorization = `Bearer ${token}`
  if (opts.workspace !== false) {
    const workspaceId = getWorkspaceId()
    if (workspaceId) headers['X-Workspace-Id'] = workspaceId
  }
  return headers
}

async function parseResponse(resp: Response) {
  const raw = await resp.text()
  if (!raw.trim()) return null
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`服务返回了无效响应（${resp.status}）`)
  }
}

export async function request<T = unknown>(method: string, path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
  const url = `${apiBase()}${path}`
  const headers = buildHeaders(opts)
  const init: RequestInit = { method, headers }
  if (body) {
    init.body = opts.upload ? (body as FormData) : JSON.stringify(body)
  }

  const start = performance.now()
  apiLog(`%c[API] %c${method} %c${path}`, 'color:#888', 'color:#4fc3f7;font-weight:bold', 'color:#ccc', body || '')

  try {
    const resp = await fetch(url, init)
    const json = await parseResponse(resp)
    const ms = Math.round(performance.now() - start)

    if (!resp.ok || (json?.code && json.code >= 400)) {
      apiLog(`%c[API] %c${method} ${path} %c${resp.status} %c${ms}ms`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold', 'color:#888', json?.message || '')
      throw new Error(friendlyErrorMessage(json?.message || `${resp.status}`))
    }

    apiLog(`%c[API] %c${method} ${path} %c${resp.status} %c${ms}ms`, 'color:#888', 'color:#66bb6a', 'color:#66bb6a;font-weight:bold', 'color:#888')
    return json?.data ?? json
  } catch (err: any) {
    if (!err.message?.match(/^\d{3}$/)) {
      const ms = Math.round(performance.now() - start)
      apiLog(`%c[API] %c${method} ${path} %cERROR %c${ms}ms`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold', 'color:#888', err.message)
    }
    if (/network error|failed to fetch|econnrefused/i.test(err?.message || '')) {
      throw new Error(friendlyErrorMessage(err, '服务连接失败，请检查网络或确认服务端已启动后重试。'))
    }
    throw err
  }
}

export const api = {
  get: <T = unknown>(path: string, opts?: RequestOptions) => request<T>('GET', path, undefined, opts),
  post: <T = unknown>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('POST', path, body, opts),
  put: <T = unknown>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PUT', path, body, opts),
  patch: <T = unknown>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PATCH', path, body, opts),
  del: <T = unknown>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, undefined, opts),
}

export function upload<T = unknown>(path: string, file: File): Promise<T> {
  const fd = new FormData()
  fd.append('file', file)
  return request<T>('POST', path, fd, { upload: true, workspace: true })
}

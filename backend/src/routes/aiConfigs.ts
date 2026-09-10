import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { success, notFound, created, badRequest, now } from '../utils/response.js'
import { toSnakeCase } from '../utils/transform.js'
import { joinProviderUrl, normalizeProviderBaseUrl } from '../services/adapters/url.js'
import { isOfficialProvider, parseConfigTemperature } from '../services/ai.js'
import { redactUrl, logTaskError, logTaskProgress, logTaskSuccess } from '../utils/task-logger.js'
import { currentAdmin } from '../utils/workspace-access.js'
import { decryptSecret, encryptSecret } from '../utils/secret-crypto.js'
import { logAdminAction } from '../services/admin-audit.js'

const app = new Hono()

/** 归一化 temperature 入参：null=未设置；合法值 0~2；非法抛错 */
function normalizeTemperature(v: any): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0 || n > 2) throw new Error('invalid temperature')
  return n
}

/** 把 settings JSON 中的 temperature 透出为顶层字段，便于前端直接读写 */
function withParsedFields(r: any) {
  return {
    ...toSnakeCase(r),
    // API Key 永不返回给浏览器；前端只需要知道是否已配置。
    api_key: r.apiKey ? 'configured' : '',
    model: r.model ? JSON.parse(r.model) : [],
    temperature: parseConfigTemperature(r.settings),
  }
}

async function requireAdmin(c: any) {
  const admin = await currentAdmin(c)
  return admin && ['super_admin', 'admin'].includes(admin.role) ? admin : null
}

function safeConfigDetail(row: any, extra: Record<string, unknown> = {}) {
  return {
    service_type: row.serviceType,
    provider: row.provider,
    name: row.name,
    base_url: row.baseUrl,
    model: row.model ? JSON.parse(row.model) : [],
    priority: row.priority,
    is_active: row.isActive,
    has_api_key: !!row.apiKey,
    temperature: parseConfigTemperature(row.settings),
    ...extra,
  }
}

function bearerHeaders(apiKey?: string, withJson = false) {
  const headers: Record<string, string> = {}
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  if (withJson) headers['Content-Type'] = 'application/json'
  return headers
}

function geminiHeaders(apiKey?: string, withJson = false) {
  const headers: Record<string, string> = {}
  if (apiKey) {
    headers['x-goog-api-key'] = apiKey
  }
  if (withJson) headers['Content-Type'] = 'application/json'
  return headers
}

function buildProbe(serviceType: string, provider: string, baseUrl: string, model?: string, apiKey?: string) {
  const p = provider.toLowerCase()
  const m = model || ''
  const base = (baseUrl || '').replace(/\/+$/, '')

  if (base === 'https://cloudapi.flowingcloud.com') {
    return {
      method: 'GET',
      url: joinProviderUrl(baseUrl, '/v1', '/models'),
      headers: bearerHeaders(apiKey),
      body: undefined,
    }
  }

  if (p === 'gemini') {
    // 探针统一走 generateContent:文本运行时(AI SDK)走的就是它,官方与中转站都支持;
    // interactions 端点很多中转站未配置,探它会误报 500。
    // 用最小合法请求体而非空体——空体在部分中转站会触发上游认证失败的误报
    const modelName = m || 'gemini-3.1-pro-preview'
    const url = new URL(joinProviderUrl(baseUrl, '/v1beta', `/models/${modelName}:generateContent`))
    if (apiKey) url.searchParams.set('key', apiKey)
    return {
      method: 'POST',
      url: url.toString(),
      headers: geminiHeaders(apiKey, true),
      body: { contents: [{ parts: [{ text: 'hi' }] }] },
    }
  }

  if (p === 'openai') {
    return {
      method: 'GET',
      url: joinProviderUrl(baseUrl, '/v1', '/models'),
      headers: bearerHeaders(apiKey),
      body: undefined,
    }
  }

  if (p === 'volcengine') {
    const path = serviceType === 'video'
      ? '/contents/generations/tasks'
      : serviceType === 'text'
        ? '/chat/completions'
        : '/images/generations'
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '/api/v3', path),
      headers: bearerHeaders(apiKey, true),
      body: {},
    }
  }

  if (p === 'minimax') {
    // MiniMax 仅提供视频服务，空请求体探测鉴权/端点连通性
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '/v2', '/video_generation'),
      headers: bearerHeaders(apiKey, true),
      body: {},
    }
  }

  return {
    method: 'GET',
    url: joinProviderUrl(baseUrl, '', m ? `/${m}` : '/'),
    headers: bearerHeaders(apiKey),
    body: undefined,
  }
}

function buildModelListProbe(provider: string, baseUrl: string, apiKey?: string) {
  const p = provider.toLowerCase()
  const base = (baseUrl || '').replace(/\/+$/, '')
  const useOpenAICompatibleModels = base === 'https://cloudapi.flowingcloud.com'

  if (p === 'gemini' && !useOpenAICompatibleModels) {
    const url = new URL(joinProviderUrl(baseUrl, '/v1beta', '/models'))
    if (apiKey) url.searchParams.set('key', apiKey)
    return {
      url: url.toString(),
      headers: geminiHeaders(apiKey),
    }
  }

  return {
    url: joinProviderUrl(baseUrl, '/v1', '/models'),
    headers: bearerHeaders(apiKey),
  }
}

function parseModelIds(payload: any): string[] {
  const list = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : Array.isArray(payload)
        ? payload
        : []

  return Array.from(new Set(
    list
      .map((item: any) => {
        if (typeof item === 'string') return item
        if (typeof item?.id === 'string') return item.id
        if (typeof item?.name === 'string') return item.name.replace(/^models\//, '')
        return ''
      })
      .map((model: string) => model.trim())
      .filter(Boolean)
  ))
}

function modelServiceType(model: string): 'text' | 'image' | 'video' | 'unknown' {
  const name = model.toLowerCase()
  if (/(seedance|video|wanx|hailuo|minimax-h|kling|veo|sora)/.test(name)) return 'video'
  if (/(image|img|gpt-image|dall-e|imagen|flux|midjourney|stable-diffusion)/.test(name)) return 'image'
  if (/(embedding|rerank|tts|whisper|audio|moderation)/.test(name)) return 'unknown'
  return 'text'
}

function filterModelsByServiceType(models: string[], serviceType?: string): string[] {
  if (!serviceType || !['text', 'image', 'video'].includes(serviceType)) return models
  return models.filter(model => modelServiceType(model) === serviceType)
}

function testFailureMessage(status: number, modelMissing = false) {
  if (modelMissing) return '测试失败：当前 API Key 不支持所填模型'
  if (status === 401 || status === 403) return '测试失败：API Key 无效或没有权限'
  if (status === 404) return '测试失败：Base URL 或接口路径不正确'
  if (status === 400) return '测试失败：请求未被服务接受，请检查模型配置'
  return `测试失败：服务返回 HTTP ${status}`
}

function buildConfigValues(body: any, ts: string, existing?: any) {
  let settings: Record<string, any> = {}
  try { settings = existing?.settings ? JSON.parse(existing.settings) : {} } catch { settings = {} }

  if ('temperature' in body) {
    const temperature = normalizeTemperature(body.temperature)
    if (temperature === null) delete settings.temperature
    else settings.temperature = temperature
  }

  return {
    serviceType: body.service_type ?? existing?.serviceType,
    provider: body.provider ?? existing?.provider,
    name: body.name ?? existing?.name ?? `${body.provider}-${body.service_type}`,
    baseUrl: 'base_url' in body ? normalizeProviderBaseUrl(body.base_url || '') : existing?.baseUrl ?? '',
    apiKey: 'api_key' in body && body.api_key !== 'configured'
      ? encryptSecret(body.api_key || '')
      : existing?.apiKey ?? encryptSecret(''),
    model: 'model' in body
      ? JSON.stringify(body.model || [])
      : existing?.model ?? JSON.stringify([]),
    priority: body.priority ?? existing?.priority ?? 0,
    isActive: 'is_active' in body ? body.is_active : existing?.isActive ?? true,
    settings: Object.keys(settings).length ? JSON.stringify(settings) : null,
    updatedAt: ts,
  }
}

async function removeDuplicateConfigs(serviceType: string, keepId: number) {
  const duplicates = (await db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, serviceType)))
    .filter(row => row.id !== keepId)

  for (const row of duplicates) {
    await db.delete(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, row.id))
  }
}

// GET /ai-configs?service_type=text
app.get('/', async (c) => {
  const serviceType = c.req.query('service_type')
  const isAdmin = await requireAdmin(c)
  let rows = await db.select().from(schema.aiServiceConfigs)
  if (!isAdmin) rows = rows.filter(r => r.isActive)
  if (serviceType) rows = rows.filter(r => r.serviceType === serviceType)

  const parsed = rows.map(withParsedFields)
  return success(c, parsed)
})

// POST /ai-configs
app.post('/', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const body = await c.req.json()
  const ts = now()

  // 验证必填字段
  if (!body.service_type || !body.provider) {
    return badRequest(c, 'service_type and provider are required')
  }
  if (!isOfficialProvider(body.service_type, body.provider)) {
    return badRequest(c, 'Unsupported service_type/provider')
  }

  if ('temperature' in body) {
    try {
      normalizeTemperature(body.temperature)
    } catch {
      return badRequest(c, 'temperature must be a number between 0 and 2')
    }
  }

  const existingRows = await db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, body.service_type))
  const existing = existingRows[0]
  if (existing) {
    await db.update(schema.aiServiceConfigs).set(buildConfigValues(body, ts, existing))
      .where(eq(schema.aiServiceConfigs.id, existing.id))
    await removeDuplicateConfigs(body.service_type, existing.id)
    const [row] = await db.select().from(schema.aiServiceConfigs)
      .where(eq(schema.aiServiceConfigs.id, existing.id))
    await logAdminAction(admin.id, 'ai_config_update', 'ai_service_config', existing.id, safeConfigDetail(row, { api_key_changed: 'api_key' in body && body.api_key !== 'configured', mode: 'upsert_existing' }))
    return success(c, withParsedFields(row))
  }

  const res = await db.insert(schema.aiServiceConfigs).values({
    serviceType: body.service_type,
    provider: body.provider,
    name: body.name || `${body.provider}-${body.service_type}`,
    baseUrl: body.base_url || '',
    apiKey: encryptSecret(body.api_key || ''),
    model: JSON.stringify(body.model || []),
    priority: body.priority || 0,
    isActive: true,
    settings: buildConfigValues(body, ts).settings,
    createdAt: ts,
    updatedAt: ts,
  })

  const [row] = await db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.id, getInsertId(res)))
  await removeDuplicateConfigs(body.service_type, row.id)
  await logAdminAction(admin.id, 'ai_config_create', 'ai_service_config', row.id, safeConfigDetail(row, { api_key_changed: !!body.api_key }))

  return created(c, withParsedFields(row))
})

// POST /ai-configs/test
app.post('/test', async (c) => {
  if (!await requireAdmin(c)) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const body = await c.req.json()
  if (!body.service_type || !body.provider || !body.base_url) {
    return badRequest(c, 'service_type, provider and base_url are required')
  }
  if (!isOfficialProvider(body.service_type, body.provider)) {
    return badRequest(c, 'Unsupported service_type/provider')
  }

  let apiKey = body.api_key || ''
  if (body.config_id && apiKey === 'configured') {
    const [existing] = await db.select().from(schema.aiServiceConfigs)
      .where(eq(schema.aiServiceConfigs.id, Number(body.config_id)))
    if (existing?.apiKey) apiKey = decryptSecret(existing.apiKey)
  }
  const model = Array.isArray(body.model) ? body.model[0] : body.model
  const probe = buildProbe(body.service_type, body.provider, body.base_url, model, apiKey)
  const probeUrl = redactUrl(probe.url)

  logTaskProgress('AIConfig', 'probe-start', {
    serviceType: body.service_type,
    provider: body.provider,
    method: probe.method,
    url: probeUrl,
  })

  try {
    const resp = await fetch(probe.url, {
      method: probe.method,
      headers: probe.headers,
      body: probe.body ? JSON.stringify(probe.body) : undefined,
    })
    const text = await resp.text()
    let modelMissing = false
    const base = String(body.base_url || '').replace(/\/+$/, '')
    if (resp.ok && base === 'https://cloudapi.flowingcloud.com' && model) {
      let modelPayload: any = null
      try { modelPayload = JSON.parse(text) } catch { modelPayload = null }
      const availableModels = parseModelIds(modelPayload)
      modelMissing = availableModels.length > 0 && !availableModels.includes(model)
    }
    const ok = resp.ok && !modelMissing
    const payload = {
      ok,
      reachable: ok,
      status: resp.status,
      status_text: resp.statusText,
      method: probe.method,
      url: probeUrl,
      message: ok ? '测试成功' : testFailureMessage(resp.status, modelMissing),
      response_preview: text.slice(0, 240),
    }
    if (ok) {
      logTaskSuccess('AIConfig', 'probe-done', {
        provider: body.provider,
        status: resp.status,
        url: probeUrl,
      })
    } else {
      logTaskError('AIConfig', 'probe-unexpected', {
        provider: body.provider,
        status: resp.status,
        url: probeUrl,
      })
    }
    return success(c, payload)
  } catch (error: any) {
    logTaskError('AIConfig', 'probe-failed', {
      provider: body.provider,
      url: probeUrl,
      error: error.message,
    })
    return success(c, {
      ok: false,
      reachable: false,
      method: probe.method,
      url: probeUrl,
      message: error.message || '请求失败',
      response_preview: '',
    })
  }
})

// POST /ai-configs/models
app.post('/models', async (c) => {
  if (!await requireAdmin(c)) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const body = await c.req.json()
  if (!body.provider || !body.base_url) {
    return badRequest(c, 'provider and base_url are required')
  }

  let apiKey = body.api_key || ''
  if (body.config_id && apiKey === 'configured') {
    const [existing] = await db.select().from(schema.aiServiceConfigs)
      .where(eq(schema.aiServiceConfigs.id, Number(body.config_id)))
    if (existing?.apiKey) apiKey = decryptSecret(existing.apiKey)
  }

  const probe = buildModelListProbe(body.provider, body.base_url, apiKey)
  const probeUrl = redactUrl(probe.url)

  logTaskProgress('AIConfig', 'models-fetch-start', {
    provider: body.provider,
    url: probeUrl,
  })

  try {
    const resp = await fetch(probe.url, {
      method: 'GET',
      headers: probe.headers,
    })
    const text = await resp.text()
    if (!resp.ok) {
      logTaskError('AIConfig', 'models-fetch-failed', {
        provider: body.provider,
        status: resp.status,
        url: probeUrl,
      })
      return success(c, {
        ok: false,
        status: resp.status,
        message: '模型列表拉取失败，请检查 API Key 和 Base URL',
        response_preview: text.slice(0, 240),
        models: [],
      })
    }

    let payload: any = null
    try { payload = JSON.parse(text) } catch { payload = null }
    const allModels = parseModelIds(payload)
    const models = filterModelsByServiceType(allModels, body.service_type)
    logTaskSuccess('AIConfig', 'models-fetch-done', {
      provider: body.provider,
      count: models.length,
      totalCount: allModels.length,
      serviceType: body.service_type || '',
      url: probeUrl,
    })
    return success(c, { ok: true, status: resp.status, models, total: allModels.length, filtered: !!body.service_type })
  } catch (error: any) {
    logTaskError('AIConfig', 'models-fetch-error', {
      provider: body.provider,
      url: probeUrl,
      error: error.message,
    })
    return success(c, {
      ok: false,
      message: error.message || '模型列表拉取失败',
      response_preview: '',
      models: [],
    })
  }
})

// GET /ai-configs/:id
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = await db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, id))
  if (!row || (!row.isActive && !await requireAdmin(c))) return notFound(c)
  return success(c, withParsedFields(row))
})

// PUT /ai-configs/:id
app.put('/:id', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [existing] = await db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, id))
  if (!existing) return notFound(c)

  const serviceType = 'service_type' in body ? body.service_type : existing.serviceType
  const provider = 'provider' in body ? body.provider : existing.provider
  if (!isOfficialProvider(serviceType, provider)) {
    return badRequest(c, 'Unsupported service_type/provider')
  }

  const updates: Record<string, any> = { updatedAt: now() }

  if ('service_type' in body) updates.serviceType = body.service_type
  if ('provider' in body) updates.provider = body.provider
  if ('name' in body) updates.name = body.name
  if ('base_url' in body) updates.baseUrl = body.base_url
  if ('api_key' in body && body.api_key !== 'configured') updates.apiKey = encryptSecret(body.api_key)
  if ('model' in body) updates.model = JSON.stringify(body.model)
  if ('priority' in body) updates.priority = body.priority
  if ('is_active' in body) updates.isActive = body.is_active
  if ('temperature' in body) {
    let temperature: number | null
    try {
      temperature = normalizeTemperature(body.temperature)
    } catch {
      return badRequest(c, 'temperature must be a number between 0 and 2')
    }
    // 与已有 settings 合并，清空的 temperature 从 JSON 中移除
    let settings: Record<string, any> = {}
    try { settings = existing.settings ? JSON.parse(existing.settings) : {} } catch { settings = {} }
    if (temperature === null) delete settings.temperature
    else settings.temperature = temperature
    updates.settings = Object.keys(settings).length ? JSON.stringify(settings) : null
  }

  await db.update(schema.aiServiceConfigs).set(updates).where(eq(schema.aiServiceConfigs.id, id))
  await removeDuplicateConfigs(serviceType, id)
  const [row] = await db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, id))
  await logAdminAction(admin.id, 'ai_config_update', 'ai_service_config', id, safeConfigDetail(row, { api_key_changed: 'api_key' in body && body.api_key !== 'configured' }))
  return success(c)
})

// DELETE /ai-configs/:id
app.delete('/:id', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const id = Number(c.req.param('id'))
  const [existing] = await db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, id))
  await db.delete(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, id))
  if (existing) await logAdminAction(admin.id, 'ai_config_delete', 'ai_service_config', id, safeConfigDetail(existing))
  return success(c)
})

// GET /ai-providers
export const aiProviders = new Hono()
aiProviders.get('/', async (c) => {
  const isAdmin = await requireAdmin(c)
  let rows = await db.select().from(schema.aiServiceProviders)
  if (!isAdmin) rows = rows.filter(r => r.isActive)
  const parsed = rows.map(r => ({
    ...toSnakeCase(r),
    preset_models: r.presetModels ? JSON.parse(r.presetModels) : [],
  }))
  return success(c, parsed)
})

export default app

import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { badRequest, created, notFound, success, now } from '../utils/response.js'
import { toSnakeCaseArray } from '../utils/transform.js'
import { currentAdmin } from '../utils/workspace-access.js'
import { logAdminAction } from '../services/admin-audit.js'
import { getPrice, isVideoGenerationAction } from '../services/pricing.js'

const app = new Hono()

// 首版默认价仅用于数据库还没有配置价格时的报价展示，正式价格由后台规则覆盖。
const defaultPricing = [
  ['script_rewrite', 'text', 2, 'task'],
  ['asset_extract', 'text', 2, 'task'],
  ['storyboard_break', 'text', 3, 'task'],
  ['character_prompt', 'text', 1, 'task'],
  ['scene_prompt', 'text', 1, 'task'],
  ['prop_prompt', 'text', 1, 'task'],
  ['video_prompt', 'text', 1, 'storyboard'],
  ['character_image', 'image', 8, 'image'],
  ['scene_image', 'image', 6, 'image'],
  ['prop_image', 'image', 5, 'image'],
  ['video', 'video', 5, 'second'],
].map(([action, serviceType, price, unit]) => ({ action, serviceType, price, unit }))

function withoutLegacyVideoDurationRows<T extends { action: string }>(rows: T[]) {
  return rows.filter(row => !/^video_\d+s$/.test(row.action))
}

// GET /pricing - 用户端读取当前生效价格
app.get('/', async (c) => {
  const rows = await db.select().from(schema.pricingRules)

  return success(c, rows.length ? toSnakeCaseArray(withoutLegacyVideoDurationRows(rows)) : defaultPricing)
})

// POST /pricing/quote - 根据生成环节和数量计算生成前展示的总价
app.post('/quote', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const action = typeof body.action === 'string' ? body.action : ''
  const quantity = Math.max(1, Math.floor(Number(body.quantity) || 1))
  const duration = body.duration === undefined ? undefined : Math.max(1, Math.floor(Number(body.duration) || 0))
  const rows = await db.select().from(schema.pricingRules)
  const configured = rows.find(r => r.action === action)
  const fallback = fallbackPrice(action)
  if (!configured && fallback == null && !isVideoGenerationAction(action)) return badRequest(c, '未找到该生成环节的价格')
  const unitPrice = isVideoGenerationAction(action)
    ? await getPrice(action, duration)
    : await getPrice(action)
  return success(c, { action, quantity, unit_price: unitPrice, total_price: unitPrice * quantity, currency: 'credits' })
})

function fallbackPrice(action: string) {
  return defaultPricing.find(item => item.action === action)?.price ?? null
}

async function requireAdmin(c: any) {
  const user = await currentAdmin(c)
  return user?.role === 'super_admin' || user?.role === 'admin' ? user : null
}

// 管理员价格规则：价格可随时调整，新任务读取最新生效规则。
app.get('/admin', async (c) => {
  if (!await requireAdmin(c)) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  return success(c, toSnakeCaseArray(withoutLegacyVideoDurationRows(await db.select().from(schema.pricingRules))))
})

app.post('/admin', async (c) => {
  const user = await requireAdmin(c)
  if (!user) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const body = await c.req.json().catch(() => ({}))
  if (!body.action || !body.service_type || Number(body.price) < 0) return badRequest(c, '请填写生成环节、服务类型和合法价格')
  const ts = now()
  const result = await db.insert(schema.pricingRules).values({
    action: body.action, serviceType: body.service_type, provider: body.provider || null,
    model: body.model || null, params: body.params ? JSON.stringify(body.params) : null,
    price: Math.floor(Number(body.price)), unit: body.unit || (body.action === 'video' ? 'second' : 'task'), isActive: body.is_active !== false,
    createdAt: ts, updatedAt: ts,
  })
  const [row] = await db.select().from(schema.pricingRules).where(eq(schema.pricingRules.id, Number((Array.isArray(result) ? result[0] : result).insertId)))
  await logAdminAction(user.id, 'pricing_create', 'pricing_rule', row.id, toSnakeCaseArray([row])[0])
  return created(c, toSnakeCaseArray([row])[0])
})

app.put('/admin/:id', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [existing] = await db.select().from(schema.pricingRules).where(eq(schema.pricingRules.id, id))
  if (!existing) return notFound(c, '价格规则不存在')
  const updates: Record<string, any> = { updatedAt: now() }
  if (body.price !== undefined && Number(body.price) >= 0) updates.price = Math.floor(Number(body.price))
  if (body.is_active !== undefined) updates.isActive = !!body.is_active
  if (body.provider !== undefined) updates.provider = body.provider || null
  if (body.model !== undefined) updates.model = body.model || null
  if (body.params !== undefined) updates.params = body.params ? JSON.stringify(body.params) : null
  if (body.unit !== undefined) updates.unit = body.unit
  await db.update(schema.pricingRules).set(updates).where(eq(schema.pricingRules.id, id))
  await logAdminAction(admin.id, 'pricing_update', 'pricing_rule', id, updates)
  const [row] = await db.select().from(schema.pricingRules).where(eq(schema.pricingRules.id, id))
  return success(c, toSnakeCaseArray([row])[0])
})

app.delete('/admin/:id', async (c) => {
  const admin = await requireAdmin(c)
  if (!admin) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const id = Number(c.req.param('id'))
  const [existing] = await db.select().from(schema.pricingRules).where(eq(schema.pricingRules.id, id))
  if (!existing) return notFound(c, '价格规则不存在')
  await db.delete(schema.pricingRules).where(eq(schema.pricingRules.id, id))
  await logAdminAction(admin.id, 'pricing_delete', 'pricing_rule', id, toSnakeCaseArray([existing])[0])
  return success(c)
})

export default app

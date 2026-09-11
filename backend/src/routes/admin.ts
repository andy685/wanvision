import { Hono } from 'hono'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { RowDataPacket } from 'mysql2'
import { count, desc, eq, sql } from 'drizzle-orm'
import { db, pool, schema } from '../db/index.js'
import { badRequest, now, success } from '../utils/response.js'
import { currentAdmin } from '../utils/workspace-access.js'
import { toSnakeCase, toSnakeCaseArray } from '../utils/transform.js'
import { adjustCredits, settleCredits } from '../services/credits.js'
import { logAdminAction } from '../services/admin-audit.js'
import { generateImage, generateVideo } from '../services/generation.js'
import { getActiveConfigId } from '../services/ai.js'
import { getPrice, videoActionForDuration } from '../services/pricing.js'
import { getPlatformSetting, setPlatformSetting, settingEnabled } from '../services/platform-settings.js'
import { resolveTaskNames } from '../utils/task-name.js'
import { generateImageThumb, saveBase64Image } from '../utils/storage.js'

const app = new Hono()
const PAYMENT_SETTING_KEYS = ['wechat_enabled', 'wechat_mch_id', 'wechat_app_id', 'wechat_api_v3_key', 'wechat_serial_no', 'wechat_private_key', 'wechat_platform_public_key', 'wechat_webhook_secret', 'alipay_enabled', 'alipay_app_id', 'alipay_private_key', 'alipay_public_key', 'alipay_return_url', 'payment_notify_url'] as const
const PAYMENT_SECRET_KEYS = new Set(PAYMENT_SETTING_KEYS.filter(key => !['wechat_mch_id', 'wechat_app_id', 'wechat_serial_no', 'alipay_app_id', 'alipay_return_url', 'payment_notify_url'].includes(key)))
const PAYMENT_BOOLEAN_KEYS = new Set(['wechat_enabled', 'alipay_enabled'])
const ADMIN_ROLES = new Set(['super_admin', 'admin'])
const ADMIN_STATUSES = new Set(['active', 'disabled'])

function paymentBooleanSetting(value: unknown) {
  if (value === false || value === 0) return 'false'
  const normalized = String(value ?? '').trim().toLowerCase()
  return ['false', '0', 'off', 'disabled', 'no'].includes(normalized) ? 'false' : 'true'
}

function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const digest = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${digest}`
}

function verifyPassword(password: string, encoded: string) {
  const [salt, digest] = encoded.split(':')
  if (!salt || !digest) return false
  const actual = scryptSync(password, salt, 64)
  const expected = Buffer.from(digest, 'hex')
  return expected.length === actual.length && timingSafeEqual(actual, expected)
}

function publicAdmin(admin: typeof schema.adminUsers.$inferSelect) {
  return {
    id: admin.id,
    username: admin.username,
    phone: admin.phone,
    nickname: admin.nickname || admin.username,
    avatar: admin.avatar || '',
    email: admin.email || '',
    role: admin.role,
    status: admin.status,
    created_at: admin.createdAt,
    updated_at: admin.updatedAt
  }
}

async function adminOnly(c: any) {
  const user = await currentAdmin(c)
  return user?.role === 'super_admin' || user?.role === 'admin' ? user : null
}

async function requireSuperAdmin(c: any) {
  const admin = await currentAdmin(c)
  if (!admin || admin.role !== 'super_admin') return null
  return admin
}

app.get('/mine', async (c) => {
  const admin = await adminOnly(c)
  if (!admin) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  return success(c, {
    avatar: admin.avatar || '',
    username: admin.username,
    nickname: admin.nickname || admin.username,
    email: admin.email || '',
    phone: admin.phone,
    description: admin.role === 'super_admin' ? '平台超级管理员' : '平台管理员'
  })
})

app.put('/mine', async (c) => {
  const admin = await adminOnly(c)
  if (!admin) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const body = await c.req.json().catch(() => ({}))
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim().slice(0, 64) : admin.nickname || ''
  const avatar = typeof body.avatar === 'string' ? body.avatar.trim().slice(0, 2048) : admin.avatar || ''
  const email = typeof body.email === 'string' ? body.email.trim().slice(0, 128) : admin.email || ''
  const phone = typeof body.phone === 'string' ? body.phone.trim() : admin.phone
  if (!nickname) return badRequest(c, '昵称不能为空')
  if (!/^1[3-9]\d{9}$/.test(phone)) return badRequest(c, '请输入有效的 11 位手机号')
  if (phone !== admin.phone) {
    const [samePhone] = await db.select({ id: schema.adminUsers.id }).from(schema.adminUsers).where(eq(schema.adminUsers.phone, phone))
    if (samePhone) return badRequest(c, '手机号已被后台账号使用')
  }
  await db.update(schema.adminUsers).set({ nickname, avatar, email, phone, updatedAt: now() }).where(eq(schema.adminUsers.id, admin.id))
  await logAdminAction(admin.id, 'admin_profile_update', 'admin_user', admin.id, { fields: ['nickname', 'avatar', 'email', 'phone'] })
  return success(c, {
    avatar,
    username: admin.username,
    nickname,
    email,
    phone,
    description: admin.role === 'super_admin' ? '平台超级管理员' : '平台管理员'
  })
})

app.post('/avatar', async (c) => {
  const admin = await adminOnly(c)
  if (!admin) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const body = await c.req.json().catch(() => ({}))
  const avatar = typeof body.avatar === 'string' ? body.avatar : ''
  const match = avatar.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/)
  if (!match) return badRequest(c, '头像图片格式无效')
  const base64 = match[2]
  const byteLength = Buffer.byteLength(base64, 'base64')
  if (byteLength > 2 * 1024 * 1024) return badRequest(c, '头像图片不能超过 2MB')
  const path = await saveBase64Image(base64, match[1] === 'image/jpg' ? 'image/jpeg' : match[1], 'avatars')
  await generateImageThumb(path)
  const avatarUrl = `/${path}`
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim().slice(0, 64) : admin.nickname || admin.username
  const email = typeof body.email === 'string' ? body.email.trim().slice(0, 128) : admin.email || ''
  await db.update(schema.adminUsers).set({ avatar: avatarUrl, nickname, email, updatedAt: now() }).where(eq(schema.adminUsers.id, admin.id))
  await logAdminAction(admin.id, 'admin_avatar_update', 'admin_user', admin.id)
  return success(c, {
    avatar: avatarUrl,
    username: admin.username,
    nickname,
    email,
    phone: admin.phone,
    description: admin.role === 'super_admin' ? '平台超级管理员' : '平台管理员'
  })
})

app.post('/password', async (c) => {
  const admin = await adminOnly(c)
  if (!admin) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const body = await c.req.json().catch(() => ({}))
  const currentPassword = typeof body.current_password === 'string' ? body.current_password : ''
  const newPassword = typeof body.new_password === 'string' ? body.new_password : ''
  if (newPassword.length < 8) return badRequest(c, '新密码至少需要 8 位')
  if (!verifyPassword(currentPassword, admin.passwordHash)) return badRequest(c, '当前密码不正确')
  await db.update(schema.adminUsers).set({ passwordHash: hashPassword(newPassword), updatedAt: now() }).where(eq(schema.adminUsers.id, admin.id))
  await db.delete(schema.adminSessions).where(eq(schema.adminSessions.adminUserId, admin.id))
  await logAdminAction(admin.id, 'admin_password_change', 'admin_user', admin.id)
  return success(c, { message: '密码修改成功，请重新登录' })
})

app.get('/mine-logs', async (c) => {
  const admin = await adminOnly(c)
  if (!admin) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const rows = await db.select().from(schema.adminAuditLogs)
    .where(eq(schema.adminAuditLogs.adminUserId, admin.id))
    .orderBy(desc(schema.adminAuditLogs.createdAt))
  return success(c, {
    list: rows.slice(0, 20).map(row => ({
      id: row.id,
      ip: '-',
      address: '-',
      system: '-',
      browser: '-',
      summary: row.action,
      operatingTime: row.createdAt
    })),
    total: rows.length,
    pageSize: 20,
    currentPage: 1
  })
})

app.get('/admins', async (c) => {
  const admin = await requireSuperAdmin(c)
  if (!admin) return c.json({ code: 403, message: '需要超级管理员权限' }, 403)
  const rows = await db.select().from(schema.adminUsers).orderBy(desc(schema.adminUsers.createdAt))
  return success(c, rows.map(publicAdmin))
})

app.post('/admins', async (c) => {
  const admin = await requireSuperAdmin(c)
  if (!admin) return c.json({ code: 403, message: '需要超级管理员权限' }, 403)
  const body = await c.req.json().catch(() => ({}))
  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const role = typeof body.role === 'string' && ADMIN_ROLES.has(body.role) ? body.role : 'admin'
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim().slice(0, 64) : ''
  const email = typeof body.email === 'string' ? body.email.trim().slice(0, 128) : ''
  const avatar = typeof body.avatar === 'string' ? body.avatar.trim().slice(0, 2048) : ''
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(username)) return badRequest(c, '账号需为 3-32 位英文、数字、下划线或横线')
  if (!/^1[3-9]\d{9}$/.test(phone)) return badRequest(c, '请输入有效的 11 位手机号')
  if (password.length < 8) return badRequest(c, '初始密码至少需要 8 位')
  const [sameUsername] = await db.select({ id: schema.adminUsers.id }).from(schema.adminUsers).where(eq(schema.adminUsers.username, username))
  if (sameUsername) return badRequest(c, '后台账号已存在')
  const [samePhone] = await db.select({ id: schema.adminUsers.id }).from(schema.adminUsers).where(eq(schema.adminUsers.phone, phone))
  if (samePhone) return badRequest(c, '手机号已被后台账号使用')
  const ts = now()
  const result = await db.insert(schema.adminUsers).values({
    username,
    phone,
    nickname: nickname || username,
    avatar,
    email,
    passwordHash: hashPassword(password),
    role,
    status: 'active',
    createdAt: ts,
    updatedAt: ts
  })
  const id = Number((Array.isArray(result) ? result[0] : result)?.insertId || 0)
  await logAdminAction(admin.id, 'admin_create', 'admin_user', id || username, { username, phone, role })
  const [createdAdmin] = await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.username, username))
  return success(c, publicAdmin(createdAdmin))
})

app.patch('/admins/:id', async (c) => {
  const admin = await requireSuperAdmin(c)
  if (!admin) return c.json({ code: 403, message: '需要超级管理员权限' }, 403)
  const id = Number(c.req.param('id'))
  if (!id) return badRequest(c, '管理员不存在')
  const body = await c.req.json().catch(() => ({}))
  const [target] = await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.id, id))
  if (!target) return c.json({ code: 404, message: '管理员不存在' }, 404)
  const updates: Partial<typeof schema.adminUsers.$inferInsert> = { updatedAt: now() }
  const detail: Record<string, unknown> = {}
  if (typeof body.nickname === 'string') updates.nickname = body.nickname.trim().slice(0, 64)
  if (typeof body.email === 'string') updates.email = body.email.trim().slice(0, 128)
  if (typeof body.avatar === 'string') updates.avatar = body.avatar.trim().slice(0, 2048)
  if (typeof body.role === 'string') {
    if (!ADMIN_ROLES.has(body.role)) return badRequest(c, '角色仅支持 super_admin 或 admin')
    if (id === admin.id && body.role !== 'super_admin') return badRequest(c, '不能降低自己的超管角色')
    updates.role = body.role
    detail.role = { from: target.role, to: body.role }
  }
  if (typeof body.status === 'string') {
    if (!ADMIN_STATUSES.has(body.status)) return badRequest(c, '状态仅支持 active 或 disabled')
    if (id === admin.id && body.status !== 'active') return badRequest(c, '不能停用自己的账号')
    updates.status = body.status
    detail.status = { from: target.status, to: body.status }
  }
  if (typeof body.password === 'string' && body.password) {
    if (body.password.length < 8) return badRequest(c, '新密码至少需要 8 位')
    updates.passwordHash = hashPassword(body.password)
    detail.password = 'updated'
  }
  await db.update(schema.adminUsers).set(updates).where(eq(schema.adminUsers.id, id))
  if (updates.passwordHash) await db.delete(schema.adminSessions).where(eq(schema.adminSessions.adminUserId, id))
  await logAdminAction(admin.id, 'admin_update', 'admin_user', id, detail)
  const [updatedAdmin] = await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.id, id))
  return success(c, publicAdmin(updatedAdmin))
})

app.get('/payment-settings', async (c) => {
  if (!await adminOnly(c)) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const values = await Promise.all(PAYMENT_SETTING_KEYS.map(async key => [key, await getPlatformSetting(key)] as const))
  return success(c, Object.fromEntries(values.map(([key, value]) => [key, PAYMENT_BOOLEAN_KEYS.has(key) ? settingEnabled(value) : PAYMENT_SECRET_KEYS.has(key) ? (value ? 'configured' : '') : value])))
})

app.put('/payment-settings', async (c) => {
  const admin = await requireSuperAdmin(c)
  if (!admin) return c.json({ code: 403, message: '需要超级管理员权限' }, 403)
  const body = await c.req.json().catch(() => ({}))
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!reason) return c.json({ code: 400, message: '修改支付渠道配置必须填写操作理由' }, 400)
  const before: Record<string, any> = {}
  const after: Record<string, any> = {}
  const changed: string[] = []
  for (const key of PAYMENT_SETTING_KEYS) {
    if (!(key in body) || (PAYMENT_SECRET_KEYS.has(key) && body[key] === 'configured')) continue
    const oldValue = await getPlatformSetting(key)
    const value = PAYMENT_BOOLEAN_KEYS.has(key) ? paymentBooleanSetting(body[key]) : String(body[key] ?? '').trim()
    if (oldValue !== value) {
      await setPlatformSetting(key, value)
      changed.push(key)
      if (PAYMENT_SECRET_KEYS.has(key)) {
        before[key] = oldValue ? 'configured' : ''
        after[key] = value ? 'configured' : ''
      } else {
        before[key] = PAYMENT_BOOLEAN_KEYS.has(key) ? settingEnabled(oldValue) : oldValue
        after[key] = PAYMENT_BOOLEAN_KEYS.has(key) ? settingEnabled(value) : value
      }
    }
  }
  if (changed.length === 0) return success(c, { changed: [] })
  await logAdminAction(admin.id, 'payment_settings_update', 'platform_settings', 'payment', { reason, changed, before, after })
  return success(c, { changed })
})

app.get('/overview', async (c) => {
  if (!await adminOnly(c)) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const [[userCount], [workspaceCount], [taskCount], [pendingOrders], [consumed]] = await Promise.all([
    db.select({ value: count() }).from(schema.users),
    db.select({ value: count() }).from(schema.workspaces),
    db.select({ value: count() }).from(schema.sysTask),
    db.select({ value: count() }).from(schema.rechargeOrders).where(eq(schema.rechargeOrders.status, 'pending')),
    db.select({ value: sql<number>`coalesce(sum(abs(${schema.creditLedger.amount})), 0)` }).from(schema.creditLedger).where(eq(schema.creditLedger.type, 'consume')),
  ])
  return success(c, { users: userCount.value, workspaces: workspaceCount.value, tasks: taskCount.value, pending_orders: pendingOrders.value, consumed_credits: consumed.value || 0 })
})

app.get('/users', async (c) => {
  if (!await adminOnly(c)) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const rows = await db.select({ user: schema.users, workspace: schema.workspaces, account: schema.creditAccounts })
    .from(schema.users)
    .leftJoin(schema.workspaces, eq(schema.workspaces.ownerUserId, schema.users.id))
    .leftJoin(schema.creditAccounts, eq(schema.creditAccounts.workspaceId, schema.workspaces.id))
    .orderBy(desc(schema.users.createdAt))

  const userIds = rows.map(({ user }) => user.id).filter(Boolean)
  const placeholders = userIds.length ? userIds.map(() => '?').join(',') : 'NULL'
  const idParams = userIds.length ? userIds : []
  type UserLastAtRow = RowDataPacket & { user_id: number; last_at: string }
  const [taskRows, ledgerRows, orderRows] = await Promise.all([
    pool.query<UserLastAtRow[]>(
      `SELECT credit_user_id AS user_id, MAX(updated_at) AS last_at FROM sys_task WHERE credit_user_id IN (${placeholders}) GROUP BY credit_user_id`,
      idParams
    ),
    pool.query<UserLastAtRow[]>(
      `SELECT user_id, MAX(created_at) AS last_at FROM credit_ledger WHERE user_id IN (${placeholders}) GROUP BY user_id`,
      idParams
    ),
    pool.query<UserLastAtRow[]>(
      `SELECT user_id, MAX(updated_at) AS last_at FROM recharge_orders WHERE user_id IN (${placeholders}) GROUP BY user_id`,
      idParams
    ),
  ])

  const maxByUser = new Map<number, string>()
  const consider = (userId: number | null | undefined, at: string | null | undefined) => {
    if (!userId || !at) return
    const cur = maxByUser.get(userId)
    if (!cur || at > cur) maxByUser.set(userId, at)
  }
  ;[taskRows[0], ledgerRows[0], orderRows[0]].forEach(list =>
    list.forEach(r => consider(r.user_id, r.last_at))
  )

  return success(c, rows.map(({ user, account }) => {
    const lastActiveAt = maxByUser.get(user.id) || user.updatedAt
    return {
      ...user,
      balance: account?.balance || 0,
      frozen: account?.frozen || 0,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
      last_active_at: lastActiveAt,
      password_hash: undefined
    }
  }))
})

app.get('/workspaces', async (c) => {
  if (!await adminOnly(c)) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const rows = await db.select().from(schema.workspaces).orderBy(desc(schema.workspaces.createdAt))
  const result = await Promise.all(rows.map(async workspace => {
    const [members] = await db.select({ value: count() }).from(schema.workspaceMembers).where(eq(schema.workspaceMembers.workspaceId, workspace.id))
    const [projects] = await db.select({ value: count() }).from(schema.dramas).where(eq(schema.dramas.workspaceId, workspace.id))
    const [account] = await db.select().from(schema.creditAccounts).where(eq(schema.creditAccounts.workspaceId, workspace.id))
    const [owner] = await db.select({ phone: schema.users.phone }).from(schema.users).where(eq(schema.users.id, workspace.ownerUserId))
    return { ...workspace, owner_phone: owner?.phone || '', member_count: members.value, project_count: projects.value, balance: account?.balance || 0, frozen: account?.frozen || 0 }
  }))
  return success(c, result)
})

app.patch('/workspaces/:id/status', async (c) => {
  const admin = await adminOnly(c)
  if (!admin) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  if (!['active', 'disabled'].includes(body.status)) return c.json({ code: 400, message: 'status 仅支持 active 或 disabled' }, 400)
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!reason) return c.json({ code: 400, message: '变更工作区状态必须填写操作理由' }, 400)
  const [workspace] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, id))
  if (!workspace) return c.json({ code: 404, message: '工作区不存在' }, 404)
  if (workspace.status === body.status) return c.json({ code: 400, message: `工作区已经是 ${body.status} 状态` }, 400)
  const oldStatus = workspace.status
  await db.update(schema.workspaces).set({ status: body.status, updatedAt: new Date().toISOString() }).where(eq(schema.workspaces.id, id))
  await logAdminAction(admin.id, 'workspace_status_update', 'workspace', id, { reason, old_status: oldStatus, new_status: body.status })
  return success(c, { id, status: body.status })
})

app.patch('/users/:id/status', async (c) => {
  const admin = await adminOnly(c)
  if (!admin) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const userId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  if (!['active', 'disabled'].includes(body.status)) return c.json({ code: 400, message: 'status 仅支持 active 或 disabled' }, 400)
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!reason) return c.json({ code: 400, message: '变更用户状态必须填写操作理由' }, 400)
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId))
  if (!user) return c.json({ code: 404, message: '用户不存在' }, 404)
  if (user.status === body.status) return c.json({ code: 400, message: `用户已经是 ${body.status} 状态` }, 400)
  const oldStatus = user.status
  await db.update(schema.users).set({ status: body.status, updatedAt: new Date().toISOString() }).where(eq(schema.users.id, userId))
  await logAdminAction(admin.id, 'user_status_update', 'user', userId, { reason, old_status: oldStatus, new_status: body.status })
  return success(c, { id: userId, status: body.status })
})

app.get('/orders', async (c) => {
  if (!await adminOnly(c)) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const rows = await db.select({ order: schema.rechargeOrders, user: schema.users, workspace: schema.workspaces })
    .from(schema.rechargeOrders)
    .leftJoin(schema.users, eq(schema.users.id, schema.rechargeOrders.userId))
    .leftJoin(schema.workspaces, eq(schema.workspaces.id, schema.rechargeOrders.workspaceId))
    .orderBy(desc(schema.rechargeOrders.createdAt))
  return success(c, rows.map(({ order, user, workspace }) => ({
    ...toSnakeCase(order),
    user_phone: user?.phone || '',
    user_nickname: user?.nickname || (user?.phone ? `万影用户${user.phone.slice(-4)}` : ''),
    workspace_name: workspace?.name || '',
  })))
})

app.get('/tasks', async (c) => {
  if (!await adminOnly(c)) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const type = c.req.query('type')
  const status = c.req.query('status')
  let rows = await db.select({ task: schema.sysTask, user: schema.users })
    .from(schema.sysTask)
    .leftJoin(schema.users, eq(schema.users.id, schema.sysTask.creditUserId))
    .orderBy(desc(schema.sysTask.createdAt))
  if (type) rows = rows.filter(row => row.task.type === type)
  if (status) rows = rows.filter(row => row.task.status === status)
  const nameMap = await resolveTaskNames(rows.slice(0, 500).map(r => r.task))
  return success(c, rows.slice(0, 500).map(({ task: row, user }) => {
    let params = null
    try { params = row.params ? JSON.parse(row.params) : null } catch { params = null }
    const taskName = nameMap.get(row.id)
      || (row.type === 'image' ? '图片生成' : row.type === 'video' ? '视频生成' : row.type)
    return { ...toSnakeCase(row), params, task_name: taskName, user_phone: user?.phone || '', user_nickname: user?.nickname || (user?.phone ? `万影用户${user.phone.slice(-4)}` : '') }
  }))
})

// 应急通道：管理后台「生成任务」页已移除取消 / 重试入口，这两个接口仅供人工排查（如任务卡在
// processing 导致积分长期冻结）时通过脚本调用。调用即写审计日志，且必须填写操作理由。
app.post('/tasks/:id/cancel', async (c) => {
  const admin = await adminOnly(c)
  if (!admin) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!reason) return c.json({ code: 400, message: '取消任务必须填写操作理由' }, 400)
  const [task] = await db.select().from(schema.sysTask).where(eq(schema.sysTask.id, id))
  if (!task) return c.json({ code: 404, message: '任务不存在' }, 404)
  if (task.status !== 'processing') return c.json({ code: 400, message: '只有处理中的任务可以取消' }, 400)
  await settleCredits(id, false)
  await db.update(schema.sysTask).set({ status: 'cancelled', errorMsg: `管理员取消任务：${reason}`, updatedAt: new Date().toISOString() }).where(eq(schema.sysTask.id, id))
  await logAdminAction(admin.id, 'task_cancel', 'sys_task', id, { reason, old_status: task.status, new_status: 'cancelled', credit_status: task.creditStatus, credit_cost: task.creditCost })
  return success(c, { id, status: 'cancelled' })
})

app.post('/tasks/:id/retry', async (c) => {
  const admin = await adminOnly(c)
  if (!admin) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  // 重试会按当前价格重新扣除用户积分，风险高于取消，同样强制留痕
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!reason) return c.json({ code: 400, message: '重试任务必须填写操作理由' }, 400)
  const [task] = await db.select().from(schema.sysTask).where(eq(schema.sysTask.id, id))
  if (!task) return c.json({ code: 404, message: '任务不存在' }, 404)
  if (task.status !== 'failed' && task.status !== 'cancelled') return c.json({ code: 400, message: '只有失败或已取消任务可以重试' }, 400)
  if (!task.creditWorkspaceId || !task.creditUserId) return c.json({ code: 400, message: '原任务缺少积分归属，无法安全重试' }, 400)
  let params: any = {}
  try { params = task.params ? JSON.parse(task.params) : {} } catch {}
  const configId = await getActiveConfigId(task.type === 'video' ? 'video' : 'image')
  if (!configId) return c.json({ code: 400, message: '没有可用的 AI 服务配置' }, 400)
  const costAction = task.type === 'video'
    ? videoActionForDuration(Number(params.duration || 10))
    : task.characterId ? 'character_image' : task.sceneId ? 'scene_image' : task.propId ? 'prop_image' : 'character_image'
  const cost = task.type === 'video' 
    ? await getPrice(costAction, Number(params.duration || 10))
    : await getPrice(costAction)
  try {
    const newId = task.type === 'video'
      ? await generateVideo({ storyboardId: task.storyboardId || undefined, dramaId: task.dramaId || undefined, prompt: task.prompt || '', model: task.model || undefined, referenceMode: params.referenceMode || 'reference', referenceImageUrls: params.referenceImageUrls, referenceVideoUrls: params.referenceVideoUrls, referenceAudioUrls: params.referenceAudioUrls, generateAudio: params.generateAudio !== 0, duration: params.duration, aspectRatio: params.aspectRatio, resolution: params.resolution, configId, credit: { workspaceId: task.creditWorkspaceId, userId: task.creditUserId, cost } })
      : await generateImage({ storyboardId: task.storyboardId || undefined, dramaId: task.dramaId || undefined, sceneId: task.sceneId || undefined, characterId: task.characterId || undefined, propId: task.propId || undefined, prompt: task.prompt || '', model: task.model || undefined, size: params.size, referenceImages: params.referenceImages, frameType: params.frameType, configId, credit: { workspaceId: task.creditWorkspaceId, userId: task.creditUserId, cost } })
    await logAdminAction(admin.id, 'task_retry', 'sys_task', id, { reason, old_status: task.status, new_task_id: newId, credit_cost: cost, action: costAction })
    return success(c, { task_id: newId, credit_cost: cost })
  } catch (error: any) { return badRequest(c, error.message || '任务重试失败') }
})

app.get('/audit-logs', async (c) => {
  if (!await adminOnly(c)) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const rows = await db.select({ log: schema.adminAuditLogs, admin: schema.adminUsers })
    .from(schema.adminAuditLogs)
    .innerJoin(schema.adminUsers, eq(schema.adminUsers.id, schema.adminAuditLogs.adminUserId))
    .orderBy(desc(schema.adminAuditLogs.createdAt))
  const result = await Promise.all(rows.map(async ({ log, admin }) => {
    let detail: Record<string, any> = {}
    try { detail = log.detail ? JSON.parse(log.detail) : {} } catch { detail = {} }

    let targetUserId: number | null = null
    if (log.targetType === 'user') targetUserId = Number(log.targetId) || null
    if (!targetUserId && detail.user_id) targetUserId = Number(detail.user_id) || null
    if (!targetUserId && log.targetType === 'workspace') {
      const [workspace] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, Number(log.targetId) || 0))
      targetUserId = workspace?.ownerUserId || null
    }
    if (!targetUserId && log.targetType === 'sys_task') {
      const [task] = await db.select().from(schema.sysTask).where(eq(schema.sysTask.id, Number(log.targetId) || 0))
      targetUserId = task?.creditUserId || null
    }
    if (!targetUserId && log.targetType === 'recharge_order') {
      const [order] = await db.select().from(schema.rechargeOrders).where(eq(schema.rechargeOrders.orderNo, String(log.targetId || '')))
      targetUserId = order?.userId || null
    }

    let user: typeof schema.users.$inferSelect | null = null
    let workspace: typeof schema.workspaces.$inferSelect | null = null
    if (targetUserId) {
      const [u] = await db.select().from(schema.users).where(eq(schema.users.id, targetUserId))
      user = u || null
      const [w] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.ownerUserId, targetUserId))
      workspace = w || null
    }

    return {
      ...toSnakeCase(log),
      detail,
      admin_username: admin.username,
      admin_phone: admin.phone,
      user_phone: user?.phone || '',
      user_nickname: user?.nickname || (user?.phone ? `万影用户${user.phone.slice(-4)}` : ''),
      workspace_name: workspace?.name || '',
    }
  }))
  return success(c, result)
})

app.post('/orders/:orderNo/refund', async (c) => {
  const admin = await requireSuperAdmin(c)
  if (!admin) return c.json({ code: 403, message: '需要超级管理员权限' }, 403)
  const orderNo = c.req.param('orderNo')
  const body = await c.req.json().catch(() => ({}))
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!reason) return c.json({ code: 400, message: '退款必须填写操作理由' }, 400)
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [orders] = await connection.query('SELECT * FROM recharge_orders WHERE order_no = ? FOR UPDATE', [orderNo]) as [any[], unknown]
    const order = orders[0]
    if (!order) return badRequest(c, '充值订单不存在')
    if (order.status !== 'paid') return badRequest(c, '只有已支付订单可以退款')
    const [accounts] = await connection.query('SELECT balance FROM credit_accounts WHERE workspace_id = ? FOR UPDATE', [order.workspace_id]) as [{ balance: number }[], unknown]
    if (!accounts[0] || accounts[0].balance < order.credits) return badRequest(c, '当前积分余额不足，无法退款')
    const balanceAfter = accounts[0].balance - order.credits
    const ts = new Date().toISOString()
    await connection.query('UPDATE credit_accounts SET balance = balance - ?, updated_at = ? WHERE workspace_id = ?', [order.credits, ts, order.workspace_id])
    await connection.query('INSERT INTO credit_ledger (workspace_id, user_id, type, amount, balance_after, reference_type, reference_id, note, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [order.workspace_id, admin.id, 'recharge_refund', -order.credits, balanceAfter, 'recharge_order', orderNo, `充值退款 ${order.credits} 积分`, `recharge_refund:${orderNo}`, ts])
    await connection.query('UPDATE recharge_orders SET status = \'refunded\', updated_at = ? WHERE order_no = ?', [ts, orderNo])
    await connection.commit()
    await logAdminAction(admin.id, 'recharge_refund', 'recharge_order', orderNo, { reason, credits: order.credits, old_balance: accounts[0]?.balance, new_balance: balanceAfter })
    return success(c, { order_no: orderNo, status: 'refunded', balance: balanceAfter })
  } catch (error: any) { await connection.rollback(); return badRequest(c, error.message || '退款失败') } finally { connection.release() }
})

app.post('/users/:id/credits', async (c) => {
  const admin = await adminOnly(c)
  if (!admin) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const userId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const amount = Math.trunc(Number(body.amount))
  const note = typeof body.note === 'string' ? body.note.trim() : ''
  if (!amount || !note) return c.json({ code: 400, message: '请填写调整积分和操作备注' }, 400)
  const [workspace] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.ownerUserId, userId))
  if (!workspace) return c.json({ code: 404, message: '用户积分账户不存在' }, 404)
  const [account] = await db.select().from(schema.creditAccounts).where(eq(schema.creditAccounts.workspaceId, workspace.id))
  const oldBalance = account?.balance || 0
  const balance = await adjustCredits(workspace.id, admin.id, amount, note)
  await logAdminAction(admin.id, 'credit_adjust', 'user', userId, { amount, note, old_balance: oldBalance, new_balance: balance })
  return success(c, { user_id: userId, balance })
})

type SqlRow = Record<string, any>

function toNumber(value: unknown) {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? number : 0
}

function percent(part: number, total: number) {
  return total > 0 ? Number(((part / total) * 100).toFixed(1)) : 0
}

function dayOnly(value: Date) {
  return value.toISOString().slice(0, 10)
}

function dateBounds(c: any) {
  const endInput = String(c.req.query('end_date') || '').trim()
  const startInput = String(c.req.query('start_date') || '').trim()
  const end = endInput ? new Date(`${endInput}T00:00:00.000Z`) : new Date()
  end.setUTCHours(0, 0, 0, 0)
  const start = startInput ? new Date(`${startInput}T00:00:00.000Z`) : new Date(end)
  if (!startInput) start.setUTCDate(start.getUTCDate() - 29)
  const exclusiveEnd = new Date(end)
  exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1)
  return {
    startDate: dayOnly(start),
    endDate: dayOnly(end),
    startAt: `${dayOnly(start)}T00:00:00.000Z`,
    endAt: `${dayOnly(exclusiveEnd)}T00:00:00.000Z`,
  }
}

async function rows<T extends SqlRow = SqlRow>(sqlText: string, params: unknown[] = []) {
  const [result] = await pool.query(sqlText, params) as [T[], unknown]
  return result
}

async function one<T extends SqlRow = SqlRow>(sqlText: string, params: unknown[] = []) {
  const result = await rows<T>(sqlText, params)
  return result[0] || {} as T
}

app.get('/analytics', async (c) => {
  if (!await adminOnly(c)) return c.json({ code: 403, message: '需要管理员权限' }, 403)
  const { startDate, endDate, startAt, endAt } = dateBounds(c)
  const rangeParams = [startAt, endAt]

  const [
    totals,
    rangeUsers,
    rangeWorkspaces,
    rangeProjects,
    taskSummary,
    revenueSummary,
    creditSummary,
    dailyRows,
    taskTypeRows,
    taskStatusRows,
    revenueProviderRows,
    creditTypeRows,
    modelRows,
    consumeActionRows,
    topUsers,
    topWorkspaces,
    failureRows,
    funnelRows,
    anomalyRows,
  ] = await Promise.all([
    one(`
      SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM workspaces) AS workspaces,
        (SELECT COUNT(*) FROM workspaces WHERE type <> 'personal') AS enterprise_workspaces,
        (SELECT COUNT(*) FROM dramas WHERE deleted_at IS NULL) AS projects,
        (SELECT COUNT(*) FROM sys_task) AS tasks
    `),
    one(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE created_at >= ? AND created_at < ?) AS new_users,
        COUNT(DISTINCT credit_user_id) AS active_users,
        COUNT(DISTINCT CASE WHEN status IN ('completed','failed','cancelled') THEN credit_user_id END) AS generation_users
      FROM sys_task
      WHERE created_at >= ? AND created_at < ?
    `, [...rangeParams, ...rangeParams]),
    one(`
      SELECT
        (SELECT COUNT(*) FROM workspaces WHERE created_at >= ? AND created_at < ?) AS new_workspaces,
        COUNT(DISTINCT credit_workspace_id) AS active_workspaces
      FROM sys_task
      WHERE created_at >= ? AND created_at < ?
    `, [...rangeParams, ...rangeParams]),
    one(`
      SELECT
        (SELECT COUNT(*) FROM dramas WHERE created_at >= ? AND created_at < ? AND deleted_at IS NULL) AS new_projects,
        COUNT(DISTINCT drama_id) AS active_projects
      FROM sys_task
      WHERE created_at >= ? AND created_at < ?
    `, [...rangeParams, ...rangeParams]),
    one(`
      SELECT
        COUNT(*) AS total,
        SUM(status = 'completed') AS completed,
        SUM(status = 'failed') AS failed,
        SUM(status = 'processing') AS processing,
        SUM(status = 'cancelled') AS cancelled,
        COALESCE(AVG(TIMESTAMPDIFF(SECOND, created_at, COALESCE(completed_at, updated_at))), 0) AS avg_seconds
      FROM sys_task
      WHERE created_at >= ? AND created_at < ?
    `, rangeParams),
    one(`
      SELECT
        COUNT(*) AS orders,
        SUM(status = 'paid') AS paid_orders,
        SUM(status = 'pending') AS pending_orders,
        COALESCE(SUM(CASE WHEN status IN ('paid','refunded') THEN amount_fen ELSE 0 END), 0) AS gross_amount_fen,
        COALESCE(SUM(CASE WHEN status = 'refunded' THEN amount_fen ELSE 0 END), 0) AS refund_amount_fen,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_fen ELSE 0 END), 0) AS net_amount_fen
      FROM recharge_orders
      WHERE created_at >= ? AND created_at < ?
    `, rangeParams),
    one(`
      SELECT
        COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS issued,
        COALESCE(SUM(CASE WHEN type = 'recharge' THEN amount ELSE 0 END), 0) AS recharge,
        COALESCE(SUM(CASE WHEN type = 'gift' THEN amount ELSE 0 END), 0) AS gift,
        COALESCE(SUM(CASE WHEN type = 'admin_adjust' AND amount > 0 THEN amount ELSE 0 END), 0) AS admin_added,
        COALESCE(SUM(CASE WHEN type = 'admin_adjust' AND amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS admin_deducted,
        COALESCE(SUM(CASE WHEN type = 'consume' THEN ABS(amount) ELSE 0 END), 0) AS consumed,
        COALESCE(SUM(CASE WHEN type LIKE '%refund%' THEN amount ELSE 0 END), 0) AS refunded
      FROM credit_ledger
      WHERE created_at >= ? AND created_at < ?
    `, rangeParams),
    rows(`
      SELECT d.day,
        COUNT(DISTINCT u.id) AS new_users,
        COUNT(DISTINCT t.id) AS tasks,
        COALESCE(SUM(CASE WHEN o.status = 'paid' THEN o.amount_fen ELSE 0 END), 0) AS revenue_fen,
        COALESCE(SUM(CASE WHEN l.type = 'consume' THEN ABS(l.amount) ELSE 0 END), 0) AS consumed_credits
      FROM (
        SELECT LEFT(created_at, 10) AS day FROM users WHERE created_at >= ? AND created_at < ?
        UNION
        SELECT LEFT(created_at, 10) AS day FROM sys_task WHERE created_at >= ? AND created_at < ?
        UNION
        SELECT LEFT(created_at, 10) AS day FROM recharge_orders WHERE created_at >= ? AND created_at < ?
        UNION
        SELECT LEFT(created_at, 10) AS day FROM credit_ledger WHERE created_at >= ? AND created_at < ?
      ) d
      LEFT JOIN users u ON LEFT(u.created_at, 10) = d.day
      LEFT JOIN sys_task t ON LEFT(t.created_at, 10) = d.day
      LEFT JOIN recharge_orders o ON LEFT(o.created_at, 10) = d.day
      LEFT JOIN credit_ledger l ON LEFT(l.created_at, 10) = d.day
      GROUP BY d.day
      ORDER BY d.day
    `, [...rangeParams, ...rangeParams, ...rangeParams, ...rangeParams]),
    rows(`
      SELECT type, COUNT(*) AS total, SUM(status = 'completed') AS completed, SUM(status = 'failed') AS failed, COALESCE(SUM(credit_cost), 0) AS credits
      FROM sys_task
      WHERE created_at >= ? AND created_at < ?
      GROUP BY type
      ORDER BY total DESC
    `, rangeParams),
    rows(`
      SELECT status, COUNT(*) AS total
      FROM sys_task
      WHERE created_at >= ? AND created_at < ?
      GROUP BY status
      ORDER BY total DESC
    `, rangeParams),
    rows(`
      SELECT payment_provider AS provider, COUNT(*) AS orders, SUM(status = 'paid') AS paid_orders, COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_fen ELSE 0 END), 0) AS amount_fen
      FROM recharge_orders
      WHERE created_at >= ? AND created_at < ?
      GROUP BY payment_provider
      ORDER BY amount_fen DESC
    `, rangeParams),
    rows(`
      SELECT type, COUNT(*) AS entries, COALESCE(SUM(amount), 0) AS amount
      FROM credit_ledger
      WHERE created_at >= ? AND created_at < ?
      GROUP BY type
      ORDER BY ABS(SUM(amount)) DESC
    `, rangeParams),
    rows(`
      SELECT provider, model, type, COUNT(*) AS total, SUM(status = 'completed') AS completed, SUM(status = 'failed') AS failed, COALESCE(SUM(credit_cost), 0) AS credits
      FROM sys_task
      WHERE created_at >= ? AND created_at < ?
      GROUP BY provider, model, type
      ORDER BY total DESC
      LIMIT 20
    `, rangeParams),
    rows(`
      SELECT
        CASE
          WHEN type = 'image' AND character_id IS NOT NULL THEN 'character_image'
          WHEN type = 'image' AND scene_id IS NOT NULL THEN 'scene_image'
          WHEN type = 'image' AND prop_id IS NOT NULL THEN 'prop_image'
          WHEN type = 'video' THEN 'video'
          ELSE type
        END AS action,
        COUNT(*) AS total,
        COALESCE(SUM(credit_cost), 0) AS credits
      FROM sys_task
      WHERE created_at >= ? AND created_at < ?
      GROUP BY action
      ORDER BY credits DESC
      LIMIT 12
    `, rangeParams),
    rows(`
      SELECT u.id, u.phone, COALESCE(u.nickname, CONCAT('万影用户', RIGHT(u.phone, 4))) AS nickname, COUNT(t.id) AS tasks, COALESCE(SUM(t.credit_cost), 0) AS credits
      FROM sys_task t
      LEFT JOIN users u ON u.id = t.credit_user_id
      WHERE t.created_at >= ? AND t.created_at < ?
      GROUP BY u.id, u.phone, u.nickname
      ORDER BY credits DESC, tasks DESC
      LIMIT 10
    `, rangeParams),
    rows(`
      SELECT w.id, w.name, w.type, COUNT(t.id) AS tasks, COALESCE(SUM(t.credit_cost), 0) AS credits
      FROM sys_task t
      LEFT JOIN workspaces w ON w.id = t.credit_workspace_id
      WHERE t.created_at >= ? AND t.created_at < ?
      GROUP BY w.id, w.name, w.type
      ORDER BY credits DESC, tasks DESC
      LIMIT 10
    `, rangeParams),
    rows(`
      SELECT
        CASE
          WHEN LOWER(error_msg) LIKE '%timeout%' OR LOWER(error_msg) LIKE '%timed out%' THEN '上游超时'
          WHEN LOWER(error_msg) LIKE '%api key%' OR LOWER(error_msg) LIKE '%authentication%' THEN '密钥或鉴权异常'
          WHEN LOWER(error_msg) LIKE '%model%' THEN '模型不可用'
          WHEN LOWER(error_msg) LIKE '%network%' OR LOWER(error_msg) LIKE '%econnrefused%' THEN '网络连接失败'
          WHEN error_msg LIKE '%积分不足%' THEN '积分不足'
          WHEN error_msg IS NULL OR error_msg = '' THEN '未知失败'
          ELSE '其他失败'
        END AS reason,
        COUNT(*) AS total
      FROM sys_task
      WHERE created_at >= ? AND created_at < ? AND status = 'failed'
      GROUP BY reason
      ORDER BY total DESC
      LIMIT 8
    `, rangeParams),
    rows(`
      SELECT '创建项目' AS stage, COUNT(*) AS total FROM dramas WHERE created_at >= ? AND created_at < ? AND deleted_at IS NULL
      UNION ALL SELECT '创建剧集', COUNT(*) FROM episodes WHERE created_at >= ? AND created_at < ? AND deleted_at IS NULL
      UNION ALL SELECT '完成文本生成', COUNT(*) FROM sys_task WHERE created_at >= ? AND created_at < ? AND type = 'text' AND status = 'completed'
      UNION ALL SELECT '完成图片生成', COUNT(*) FROM sys_task WHERE created_at >= ? AND created_at < ? AND type = 'image' AND status = 'completed'
      UNION ALL SELECT '完成分镜拆解', COUNT(*) FROM storyboards WHERE created_at >= ? AND created_at < ? AND deleted_at IS NULL
      UNION ALL SELECT '完成视频生成', COUNT(*) FROM sys_task WHERE created_at >= ? AND created_at < ? AND type = 'video' AND status = 'completed'
      UNION ALL SELECT '完成合并导出', COUNT(*) FROM video_merges WHERE created_at >= ? AND created_at < ? AND status = 'completed' AND deleted_at IS NULL
    `, [...rangeParams, ...rangeParams, ...rangeParams, ...rangeParams, ...rangeParams, ...rangeParams, ...rangeParams]),
    (async () => {
      const failed = await rows(`
        SELECT '连续失败任务' AS type, CONCAT(COALESCE(provider, '-'), ' / ', COALESCE(model, '-')) AS target, COUNT(*) AS count_value, MAX(updated_at) AS last_seen
        FROM sys_task
        WHERE created_at >= ? AND created_at < ? AND status = 'failed'
        GROUP BY provider, model
        HAVING count_value >= 3
      `, rangeParams)
      const pending = await rows(`
        SELECT '支付待处理' AS type, payment_provider AS target, COUNT(*) AS count_value, MAX(created_at) AS last_seen
        FROM recharge_orders
        WHERE created_at >= ? AND created_at < ? AND status = 'pending'
        GROUP BY payment_provider
        HAVING count_value >= 3
      `, rangeParams)
      const frozen = await rows(`
        SELECT '冻结积分未释放' AS type, CAST(workspace_id AS CHAR) AS target, frozen AS count_value, updated_at AS last_seen
        FROM credit_accounts
        WHERE frozen > 0
      `, [])
      return [...failed, ...pending, ...frozen].sort((a, b) => Number(b.count_value) - Number(a.count_value)).slice(0, 12)
    })(),
  ])

  const taskTotal = toNumber(taskSummary.total)
  const taskCompleted = toNumber(taskSummary.completed)
  const taskFailed = toNumber(taskSummary.failed)
  const revenueFen = toNumber(revenueSummary.net_amount_fen)
  const consumedCredits = toNumber(creditSummary.consumed)
  const creditRevenueFen = consumedCredits * 10
  const estimatedCostFen = Math.round(creditRevenueFen * 0.45)

  return success(c, {
    range: { start_date: startDate, end_date: endDate },
    summary: {
      users: toNumber(totals.users),
      new_users: toNumber(rangeUsers.new_users),
      active_users: toNumber(rangeUsers.active_users),
      generation_users: toNumber(rangeUsers.generation_users),
      workspaces: toNumber(totals.workspaces),
      enterprise_workspaces: toNumber(totals.enterprise_workspaces),
      new_workspaces: toNumber(rangeWorkspaces.new_workspaces),
      active_workspaces: toNumber(rangeWorkspaces.active_workspaces),
      projects: toNumber(totals.projects),
      new_projects: toNumber(rangeProjects.new_projects),
      active_projects: toNumber(rangeProjects.active_projects),
      tasks: taskTotal,
      completed_tasks: taskCompleted,
      failed_tasks: taskFailed,
      processing_tasks: toNumber(taskSummary.processing),
      cancelled_tasks: toNumber(taskSummary.cancelled),
      task_success_rate: percent(taskCompleted, taskTotal),
      avg_task_seconds: Math.round(toNumber(taskSummary.avg_seconds)),
      paid_orders: toNumber(revenueSummary.paid_orders),
      pending_orders: toNumber(revenueSummary.pending_orders),
      gross_revenue_yuan: Number((toNumber(revenueSummary.gross_amount_fen) / 100).toFixed(2)),
      refund_yuan: Number((toNumber(revenueSummary.refund_amount_fen) / 100).toFixed(2)),
      net_revenue_yuan: Number((revenueFen / 100).toFixed(2)),
      consumed_credits: consumedCredits,
      issued_credits: toNumber(creditSummary.issued),
      frozen_credits: toNumber((await one('SELECT COALESCE(SUM(frozen), 0) AS frozen FROM credit_accounts')).frozen),
      credit_revenue_yuan: Number((creditRevenueFen / 100).toFixed(2)),
      estimated_cost_yuan: Number((estimatedCostFen / 100).toFixed(2)),
      estimated_margin_yuan: Number(((creditRevenueFen - estimatedCostFen) / 100).toFixed(2)),
    },
    charts: {
      daily: dailyRows.map(row => ({
        day: row.day,
        new_users: toNumber(row.new_users),
        tasks: toNumber(row.tasks),
        revenue_yuan: Number((toNumber(row.revenue_fen) / 100).toFixed(2)),
        consumed_credits: toNumber(row.consumed_credits),
      })),
      task_types: taskTypeRows.map(row => ({ ...row, total: toNumber(row.total), completed: toNumber(row.completed), failed: toNumber(row.failed), credits: toNumber(row.credits), success_rate: percent(toNumber(row.completed), toNumber(row.total)) })),
      task_statuses: taskStatusRows.map(row => ({ ...row, total: toNumber(row.total) })),
      revenue_providers: revenueProviderRows.map(row => ({ provider: row.provider, orders: toNumber(row.orders), paid_orders: toNumber(row.paid_orders), amount_yuan: Number((toNumber(row.amount_fen) / 100).toFixed(2)) })),
      credit_types: creditTypeRows.map(row => ({ type: row.type, entries: toNumber(row.entries), amount: toNumber(row.amount) })),
      model_performance: modelRows.map(row => ({ ...row, total: toNumber(row.total), completed: toNumber(row.completed), failed: toNumber(row.failed), credits: toNumber(row.credits), success_rate: percent(toNumber(row.completed), toNumber(row.total)) })),
      consume_actions: consumeActionRows.map(row => ({ action: row.action, total: toNumber(row.total), credits: toNumber(row.credits) })),
      failure_reasons: failureRows.map(row => ({ reason: row.reason, total: toNumber(row.total) })),
    },
    rankings: {
      users: topUsers.map(row => ({ ...row, tasks: toNumber(row.tasks), credits: toNumber(row.credits) })),
      workspaces: topWorkspaces.map(row => ({ ...row, tasks: toNumber(row.tasks), credits: toNumber(row.credits) })),
    },
    funnel: funnelRows.map((row, index) => {
      const total = toNumber(row.total)
      const previous = index > 0 ? toNumber(funnelRows[index - 1]?.total) : total
      return { stage: row.stage, total, conversion_rate: index === 0 ? 100 : percent(total, previous) }
    }),
    anomalies: anomalyRows.map(row => ({
      type: row.type,
      target: row.target || '-',
      count: toNumber(row.count_value),
      last_seen: row.last_seen,
      status: '待处理',
    })),
    notes: [
      '预估成本首版按积分收入的 45% 估算，后续可接入模型单位成本配置。',
      '活跃用户首版按统计周期内发起生成任务的用户计算。',
    ],
  })
})

export default app

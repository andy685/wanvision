import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { badRequest, created, success, now } from '../utils/response.js'
import { logAdminAction } from '../services/admin-audit.js'

const app = new Hono()
const SESSION_DAYS = 30
const WELCOME_CREDITS = 100
const DEV_ADMIN_PHONE = '13800138000'
const DEV_ADMIN_PASSWORD = 'Admin@123456'
const DEV_ADMIN_USERNAME = 'admin'

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

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function validPhone(phone: unknown) {
  return typeof phone === 'string' && /^1[3-9]\d{9}$/.test(phone.trim())
}

function defaultNickname(phone: string) {
  return `万影用户${phone.slice(-4)}`
}

function publicUser(user: any) {
  return { id: user.id, phone: user.phone, nickname: user.nickname || defaultNickname(user.phone), avatar: user.avatar || '', role: user.role, status: user.status }
}

async function createSession(userId: number) {
  const token = randomBytes(32).toString('hex')
  const ts = now()
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString()
  await db.insert(schema.userSessions).values({ userId, tokenHash: tokenHash(token), expiresAt: expires, createdAt: ts })
  return { token, expiresAt: expires }
}

async function createAdminSession(adminUserId: number) {
  const token = randomBytes(32).toString('hex')
  const ts = now()
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString()
  await db.insert(schema.adminSessions).values({ adminUserId, tokenHash: tokenHash(token), expiresAt: expires, createdAt: ts })
  return { token, expiresAt: expires }
}

export async function ensureBootstrapAdmin() {
  const phone = process.env.ADMIN_PHONE || (process.env.NODE_ENV === 'production' ? '' : DEV_ADMIN_PHONE)
  if (!phone) return
  const [legacyUser] = await db.select().from(schema.users).where(eq(schema.users.phone, phone))
  if (legacyUser?.role === 'admin') {
    await db.update(schema.users).set({ role: 'user', status: 'disabled', updatedAt: now() }).where(eq(schema.users.id, legacyUser.id))
  }
  const [existing] = await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.phone, phone))
  if (existing) return
  const ts = now()
  const password = process.env.ADMIN_PASSWORD || DEV_ADMIN_PASSWORD
  await db.insert(schema.adminUsers).values({ username: process.env.ADMIN_USERNAME || DEV_ADMIN_USERNAME, phone, passwordHash: hashPassword(password), role: 'super_admin', createdAt: ts, updatedAt: ts })
  console.log(`[auth] 已初始化超管账号 ${process.env.ADMIN_USERNAME || DEV_ADMIN_USERNAME}${process.env.NODE_ENV === 'production' ? '' : `，开发密码 ${password}`}`)
}

// 后台账号使用独立表和独立会话，不能注册为业务用户或拥有创作工作区。
// 仅允许使用后台账号（username）登录，不接受手机号，避免手机号成为后台的第二个登录入口。
app.post('/admin-login', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!username) return badRequest(c, '请输入后台账号')
  if (!password) return badRequest(c, '请输入后台密码')
  const [admin] = await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.username, username))
  if (!admin || !verifyPassword(password, admin.passwordHash)) return badRequest(c, '后台账号或密码错误')
  if (admin.status !== 'active') return badRequest(c, '后台账号已停用')
  await logAdminAction(admin.id, 'admin_login', 'admin_user', admin.id, { username: admin.username })
  return success(c, { admin: { id: admin.id, username: admin.username, phone: admin.phone, nickname: admin.nickname || admin.username, avatar: admin.avatar || '', role: admin.role, status: admin.status }, ...(await createAdminSession(admin.id)) })
})

// POST /auth/register
app.post('/register', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!validPhone(phone)) return badRequest(c, '请输入有效的 11 位手机号')
  if (password.length < 6) return badRequest(c, '密码至少需要 6 位')

  const [exists] = await db.select().from(schema.users).where(eq(schema.users.phone, phone))
  if (exists) return badRequest(c, '该手机号已注册')

  const ts = now()
  const role = process.env.ADMIN_PHONE && process.env.ADMIN_PHONE === phone ? 'admin' : 'user'
  const result = await db.insert(schema.users).values({ phone, nickname: defaultNickname(phone), passwordHash: hashPassword(password), role, createdAt: ts, updatedAt: ts })
  const userId = getInsertId(result)
  const workspaceResult = await db.insert(schema.workspaces).values({ name: '我的工作区', type: 'personal', ownerUserId: userId, createdAt: ts, updatedAt: ts })
  const workspaceId = getInsertId(workspaceResult)
  await db.insert(schema.workspaceMembers).values({ workspaceId, userId, role: 'owner', createdAt: ts })
  await db.insert(schema.creditAccounts).values({ workspaceId, balance: WELCOME_CREDITS, frozen: 0, createdAt: ts, updatedAt: ts })
  await db.insert(schema.creditLedger).values({
    workspaceId, userId, type: 'welcome', amount: WELCOME_CREDITS, balanceAfter: WELCOME_CREDITS,
    referenceType: 'user', referenceId: String(userId), note: '新用户注册赠送', idempotencyKey: `welcome:user:${userId}`, createdAt: ts,
  })
  const session = await createSession(userId)
  return created(c, { user: publicUser({ id: userId, phone, role, status: 'active' }), ...session })
})

// POST /auth/login
app.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const [user] = await db.select().from(schema.users).where(eq(schema.users.phone, phone))
  if (!user || !verifyPassword(password, user.passwordHash)) return badRequest(c, '手机号或密码错误')
  if (user.status !== 'active') return badRequest(c, '账号已停用')
  return success(c, { user: publicUser(user), ...(await createSession(user.id)) })
})

// GET /auth/me
app.get('/me', async (c) => {
  const token = (c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return success(c, null)
  const [row] = await db.select({ user: schema.users, session: schema.userSessions })
    .from(schema.userSessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.userSessions.userId))
    .where(eq(schema.userSessions.tokenHash, tokenHash(token)))
  if (!row || new Date(row.session.expiresAt).getTime() <= Date.now()) return success(c, null)
  return success(c, publicUser(row.user))
})

// POST /auth/logout
app.post('/logout', async (c) => {
  const token = (c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (token) await db.delete(schema.userSessions).where(eq(schema.userSessions.tokenHash, tokenHash(token)))
  return success(c)
})

// PATCH /auth/profile - 更新业务用户的公开资料。
app.patch('/profile', async (c) => {
  const token = (c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  const [row] = await db.select({ user: schema.users, session: schema.userSessions }).from(schema.userSessions).innerJoin(schema.users, eq(schema.users.id, schema.userSessions.userId)).where(eq(schema.userSessions.tokenHash, tokenHash(token)))
  if (!row || row.user.status !== 'active') return badRequest(c, '请先登录')
  const body = await c.req.json().catch(() => ({}))
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim().slice(0, 64) : row.user.nickname || ''
  const avatar = typeof body.avatar === 'string' ? body.avatar.trim().slice(0, 2048) : row.user.avatar || ''
  await db.update(schema.users).set({ nickname, avatar, updatedAt: now() }).where(eq(schema.users.id, row.user.id))
  return success(c, publicUser({ ...row.user, nickname, avatar }))
})

// POST /auth/password/change - 登录后修改密码，修改成功后刷新当前会话并注销旧会话。
app.post('/password/change', async (c) => {
  const token = (c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  const body = await c.req.json().catch(() => ({}))
  const currentPassword = typeof body.current_password === 'string' ? body.current_password : ''
  const newPassword = typeof body.new_password === 'string' ? body.new_password : ''
  if (newPassword.length < 6) return badRequest(c, '新密码至少需要 6 位')
  const [row] = await db.select({ user: schema.users, session: schema.userSessions })
    .from(schema.userSessions).innerJoin(schema.users, eq(schema.users.id, schema.userSessions.userId))
    .where(eq(schema.userSessions.tokenHash, tokenHash(token)))
  if (!row || row.user.status !== 'active' || !verifyPassword(currentPassword, row.user.passwordHash)) return badRequest(c, '当前密码不正确')
  const ts = now()
  await db.update(schema.users).set({ passwordHash: hashPassword(newPassword), updatedAt: ts }).where(eq(schema.users.id, row.user.id))
  await db.delete(schema.userSessions).where(eq(schema.userSessions.userId, row.user.id))
  return success(c, { message: '密码修改成功', ...(await createSession(row.user.id)) })
})

// POST /auth/password-reset/request - 生产环境由短信适配器发送 code，本地开发返回 debug_code 便于验证。
app.post('/password-reset/request', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const [user] = await db.select().from(schema.users).where(eq(schema.users.phone, phone))
  const response: Record<string, string> = { message: '如果该手机号已注册，验证码将在短信中发送' }
  if (!user) return success(c, response)
  const code = String(Math.floor(100000 + Math.random() * 900000))
  await db.insert(schema.passwordResetTokens).values({ userId: user.id, codeHash: createHash('sha256').update(code).digest('hex'), expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), createdAt: now() })
  if (process.env.NODE_ENV !== 'production') response.debug_code = code
  return success(c, response)
})

// POST /auth/password-reset/confirm - 验证一次性验证码并使旧会话失效。
app.post('/password-reset/confirm', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (password.length < 6 || !/^\d{6}$/.test(code)) return badRequest(c, '验证码或新密码格式不正确')
  const [user] = await db.select().from(schema.users).where(eq(schema.users.phone, phone))
  if (!user) return badRequest(c, '验证码无效或已过期')
  const [reset] = await db.select().from(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.userId, user.id))
  if (!reset || reset.usedAt || new Date(reset.expiresAt).getTime() <= Date.now() || reset.codeHash !== createHash('sha256').update(code).digest('hex')) return badRequest(c, '验证码无效或已过期')
  const ts = now()
  await db.update(schema.users).set({ passwordHash: hashPassword(password), updatedAt: ts }).where(eq(schema.users.id, user.id))
  await db.update(schema.passwordResetTokens).set({ usedAt: ts }).where(eq(schema.passwordResetTokens.id, reset.id))
  await db.delete(schema.userSessions).where(eq(schema.userSessions.userId, user.id))
  return success(c, { message: '密码已重置，请使用新密码登录' })
})

export default app

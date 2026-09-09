import { createHash } from 'node:crypto'
import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { badRequest, created, success, now } from '../utils/response.js'
import { toSnakeCase } from '../utils/transform.js'

const app = new Hono()

async function currentUser(c: any) {
  const token = (c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const digest = createHash('sha256').update(token).digest('hex')
  const [row] = await db.select({ user: schema.users, session: schema.userSessions })
    .from(schema.userSessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.userSessions.userId))
    .where(eq(schema.userSessions.tokenHash, digest))
  return row && row.user.status === 'active' && new Date(row.session.expiresAt).getTime() > Date.now() ? row.user : null
}

app.get('/', async (c) => {
  const user = await currentUser(c)
  if (!user) return badRequest(c, '请先登录')
  const rows = await db.select({ member: schema.workspaceMembers, workspace: schema.workspaces })
    .from(schema.workspaceMembers)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId))
    .where(and(eq(schema.workspaceMembers.userId, user.id), eq(schema.workspaces.status, 'active')))
  return success(c, rows.map(({ member, workspace }) => ({ ...toSnakeCase(workspace), role: member.role })))
})

app.post('/', async (c) => {
  const user = await currentUser(c)
  if (!user) return badRequest(c, '请先登录')
  const body = await c.req.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return badRequest(c, '请输入工作区名称')
  const ts = now()
  const workspaceId = getInsertId(await db.insert(schema.workspaces).values({ name, type: 'enterprise', ownerUserId: user.id, createdAt: ts, updatedAt: ts }))
  await db.insert(schema.workspaceMembers).values({ workspaceId, userId: user.id, role: 'owner', createdAt: ts })
  await db.insert(schema.creditAccounts).values({ workspaceId, balance: 0, frozen: 0, createdAt: ts, updatedAt: ts })
  const [workspace] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId))
  return created(c, { ...toSnakeCase(workspace), role: 'owner' })
})

async function canManageWorkspace(c: any, workspaceId: number) {
  const user = await currentUser(c)
  if (!user) return null
  const [member] = await db.select().from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, user.id)))
  return member && ['owner', 'admin'].includes(member.role) ? { user, member } : null
}

app.get('/:id/members', async (c) => {
  const user = await currentUser(c)
  if (!user) return badRequest(c, '请先登录')
  const workspaceId = Number(c.req.param('id'))
  const [membership] = await db.select().from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, user.id)))
  if (!membership) return c.json({ code: 403, message: '无权访问该工作区' }, 403)
  const rows = await db.select({ member: schema.workspaceMembers, user: schema.users })
    .from(schema.workspaceMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
    .where(eq(schema.workspaceMembers.workspaceId, workspaceId))
  return success(c, rows.map(({ member, user: item }) => ({ id: member.id, user_id: item.id, phone: item.phone, role: member.role, created_at: member.createdAt })))
})

app.post('/:id/members', async (c) => {
  const manager = await canManageWorkspace(c, Number(c.req.param('id')))
  if (!manager) return c.json({ code: 403, message: '需要企业所有者或团队管理员权限' }, 403)
  const workspaceId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const role = ['admin', 'creator', 'viewer'].includes(body.role) ? body.role : 'creator'
  const [invitee] = await db.select().from(schema.users).where(eq(schema.users.phone, phone))
  if (!invitee) return badRequest(c, '该手机号尚未注册，请先注册万影工坊账号')
  const [existing] = await db.select().from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, invitee.id)))
  if (existing) return badRequest(c, '该用户已经在工作区中')
  const result = await db.insert(schema.workspaceMembers).values({ workspaceId, userId: invitee.id, role, createdAt: now() })
  return created(c, { id: Number((Array.isArray(result) ? result[0] : result).insertId), user_id: invitee.id, phone: invitee.phone, role })
})

app.delete('/:id/members/:memberId', async (c) => {
  const manager = await canManageWorkspace(c, Number(c.req.param('id')))
  if (!manager) return c.json({ code: 403, message: '需要企业所有者或团队管理员权限' }, 403)
  await db.delete(schema.workspaceMembers).where(and(eq(schema.workspaceMembers.id, Number(c.req.param('memberId'))), eq(schema.workspaceMembers.workspaceId, Number(c.req.param('id')))))
  return success(c)
})

export default app

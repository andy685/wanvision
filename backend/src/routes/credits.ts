import { createHash } from 'node:crypto'
import { Hono } from 'hono'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { badRequest, success } from '../utils/response.js'
import { toSnakeCaseArray } from '../utils/transform.js'

const app = new Hono()

function authToken(c: any) {
  return (c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
}

async function currentUser(c: any) {
  const token = authToken(c)
  if (!token) return null
  const digest = createHash('sha256').update(token).digest('hex')
  const [row] = await db.select({ user: schema.users, session: schema.userSessions })
    .from(schema.userSessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.userSessions.userId))
    .where(eq(schema.userSessions.tokenHash, digest))
  if (!row || row.user.status !== 'active' || new Date(row.session.expiresAt).getTime() <= Date.now()) return null
  return row.user
}

// GET /credits - 当前用户所有个人/企业工作区的积分余额
app.get('/', async (c) => {
  const user = await currentUser(c)
  if (!user) return badRequest(c, '请先登录')
  const requestedWorkspaceId = Number(c.req.header('X-Workspace-Id') || 0)
  const memberships = await db.select({ member: schema.workspaceMembers, workspace: schema.workspaces, account: schema.creditAccounts })
    .from(schema.workspaceMembers)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId))
    .leftJoin(schema.creditAccounts, eq(schema.creditAccounts.workspaceId, schema.workspaceMembers.workspaceId))
    .where(and(eq(schema.workspaceMembers.userId, user.id), eq(schema.workspaces.status, 'active'), requestedWorkspaceId ? eq(schema.workspaceMembers.workspaceId, requestedWorkspaceId) : undefined))
  return success(c, memberships.map(({ member, workspace, account }) => ({
    workspace_id: workspace.id,
    workspace_name: workspace.name,
    workspace_type: workspace.type,
    role: member.role,
    balance: account?.balance || 0,
    frozen: account?.frozen || 0,
  })))
})

// GET /credits/ledger?workspace_id=... - 当前用户可访问的积分流水
app.get('/ledger', async (c) => {
  const user = await currentUser(c)
  if (!user) return badRequest(c, '请先登录')
  const workspaceId = Number(c.req.query('workspace_id')) || Number(c.req.header('X-Workspace-Id') || 0)
  const memberships = await db.select().from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.userId, user.id), workspaceId ? eq(schema.workspaceMembers.workspaceId, workspaceId) : undefined))
  const ids = memberships.map(m => m.workspaceId)
  if (!ids.length) return success(c, [])
  const rows = await db.select().from(schema.creditLedger).where(inArray(schema.creditLedger.workspaceId, ids)).orderBy(desc(schema.creditLedger.createdAt))
  return success(c, toSnakeCaseArray(rows))
})

export default app

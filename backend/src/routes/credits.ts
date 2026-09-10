import { createHash } from 'node:crypto'
import { Hono } from 'hono'
import { and, count, desc, eq, inArray } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { badRequest, success } from '../utils/response.js'
import { toSnakeCaseArray } from '../utils/transform.js'
import { resolveTaskNames } from '../utils/task-name.js'

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

// GET /credits/ledger?workspace_id=...&page=1&page_size=50 - 当前用户可访问的积分流水（分页）
app.get('/ledger', async (c) => {
  const user = await currentUser(c)
  if (!user) return badRequest(c, '请先登录')
  const workspaceId = Number(c.req.query('workspace_id')) || Number(c.req.header('X-Workspace-Id') || 0)
  // 分页:默认 50 条/页,上限 200,防止流水过大拖垮接口与前端渲染
  const page = Math.max(1, Number(c.req.query('page')) || 1)
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query('page_size')) || 50))
  const memberships = await db.select().from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.userId, user.id), workspaceId ? eq(schema.workspaceMembers.workspaceId, workspaceId) : undefined))
  const ids = memberships.map(m => m.workspaceId)
  if (!ids.length) return success(c, { list: [], total: 0, page, page_size: pageSize })
  const [{ total }] = await db.select({ total: count() }).from(schema.creditLedger).where(inArray(schema.creditLedger.workspaceId, ids))
  const rows = await db.select().from(schema.creditLedger).where(inArray(schema.creditLedger.workspaceId, ids))
    .orderBy(desc(schema.creditLedger.createdAt)).limit(pageSize).offset((page - 1) * pageSize)
  // 关联 sys_task 解析出具体任务名（剧本改写 / 资产提取（角色）/ 图片生成（分镜 #3）…），
  // 历史流水同样生效，不用回填数据。reference_id 兼容 settleCredits 的纯数字与 reserveCredits 的 task:123 两种格式
  const taskIdOf = (r: any) => {
    if (r.referenceType !== 'task') return null
    const m = String(r.referenceId || '').match(/^(?:task:)?(\d+)$/)
    return m ? Number(m[1]) : null
  }
  const taskIds = [...new Set(rows.map(taskIdOf).filter((v): v is number => v !== null))]
  const taskRows = taskIds.length ? await db.select().from(schema.sysTask).where(inArray(schema.sysTask.id, taskIds)) : []
  const nameMap = await resolveTaskNames(taskRows)
  return success(c, {
    list: toSnakeCaseArray(rows.map(r => ({
      ...r,
      taskName: taskIdOf(r) !== null ? nameMap.get(taskIdOf(r) as number) || null : null,
    }))),
    total: Number(total),
    page,
    page_size: pageSize,
  })
})

export default app

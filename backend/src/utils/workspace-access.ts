import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'

export async function currentWorkspaceId(c: any) {
  const token = (c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const digest = createHash('sha256').update(token).digest('hex')
  const requested = Number(c.req.header('X-Workspace-Id') || 0)
  const [row] = await db.select({ workspaceId: schema.workspaceMembers.workspaceId })
    .from(schema.userSessions)
    .innerJoin(schema.workspaceMembers, eq(schema.workspaceMembers.userId, schema.userSessions.userId))
    .where(requested > 0
      ? and(eq(schema.userSessions.tokenHash, digest), eq(schema.workspaceMembers.workspaceId, requested))
      : eq(schema.userSessions.tokenHash, digest))
  return row?.workspaceId || null
}

export async function currentUser(c: any) {
  const token = (c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const digest = createHash('sha256').update(token).digest('hex')
  const [row] = await db.select({ user: schema.users, session: schema.userSessions })
    .from(schema.userSessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.userSessions.userId))
    .where(eq(schema.userSessions.tokenHash, digest))
  if (!row || row.user.status !== 'active' || new Date(row.session.expiresAt).getTime() <= Date.now()) return null
  return row.user
}

export async function currentAdmin(c: any) {
  const token = (c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const digest = createHash('sha256').update(token).digest('hex')
  const [row] = await db.select({ admin: schema.adminUsers, session: schema.adminSessions })
    .from(schema.adminSessions)
    .innerJoin(schema.adminUsers, eq(schema.adminUsers.id, schema.adminSessions.adminUserId))
    .where(eq(schema.adminSessions.tokenHash, digest))
  if (!row || row.admin.status !== 'active' || new Date(row.session.expiresAt).getTime() <= Date.now()) return null
  return row.admin
}

export async function canAccessDrama(c: any, dramaId: number) {
  const [drama] = await db.select({ workspaceId: schema.dramas.workspaceId }).from(schema.dramas).where(eq(schema.dramas.id, dramaId))
  if (!drama) return false
  const workspaceId = await currentWorkspaceId(c)
  if (drama.workspaceId == null) return true
  if (drama.workspaceId !== workspaceId) return false
  const user = await currentUser(c)
  if (!user) return false
  const [workspaceMember] = await db.select({ role: schema.workspaceMembers.role }).from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, user.id)))
  if (workspaceMember && ['owner', 'admin'].includes(workspaceMember.role)) return true
  const [projectMember] = await db.select().from(schema.dramaMembers)
    .where(and(eq(schema.dramaMembers.dramaId, dramaId), eq(schema.dramaMembers.userId, user.id)))
  return !!projectMember
}

export async function canWriteDrama(c: any, dramaId: number) {
  const [drama] = await db.select({ workspaceId: schema.dramas.workspaceId }).from(schema.dramas).where(eq(schema.dramas.id, dramaId))
  if (!drama) return false
  if (drama.workspaceId == null) return true
  const workspaceId = await currentWorkspaceId(c)
  if (workspaceId !== drama.workspaceId) return false
  const user = await currentUser(c)
  if (!user) return false
  const [workspaceMember] = await db.select({ role: schema.workspaceMembers.role }).from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, user.id)))
  if (workspaceMember && ['owner', 'admin'].includes(workspaceMember.role)) return true
  const [projectMember] = await db.select({ role: schema.dramaMembers.role }).from(schema.dramaMembers)
    .where(and(eq(schema.dramaMembers.dramaId, dramaId), eq(schema.dramaMembers.userId, user.id)))
  return !!projectMember && projectMember.role !== 'viewer'
}

export async function canManageDrama(c: any, dramaId: number) {
  const [drama] = await db.select({ workspaceId: schema.dramas.workspaceId }).from(schema.dramas).where(eq(schema.dramas.id, dramaId))
  if (!drama) return false
  if (drama.workspaceId == null) return true
  const workspaceId = await currentWorkspaceId(c)
  const user = await currentUser(c)
  if (!user || workspaceId !== drama.workspaceId) return false
  const [member] = await db.select({ role: schema.workspaceMembers.role }).from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, user.id)))
  if (member && ['owner', 'admin'].includes(member.role)) return true
  const [projectMember] = await db.select({ role: schema.dramaMembers.role }).from(schema.dramaMembers)
    .where(and(eq(schema.dramaMembers.dramaId, dramaId), eq(schema.dramaMembers.userId, user.id)))
  return projectMember?.role === 'owner'
}

export async function canAccessEpisode(c: any, episodeId: number) {
  const [episode] = await db.select({ dramaId: schema.episodes.dramaId }).from(schema.episodes).where(eq(schema.episodes.id, episodeId))
  return !!episode && canAccessDrama(c, episode.dramaId)
}

import { Hono } from 'hono'
import { and, eq, isNull, like, desc } from 'drizzle-orm'
import { db, getInsertId, pool, schema } from '../db/index.js'
import { success, badRequest, notFound, created, now } from '../utils/response.js'
import { toSnakeCase, toSnakeCaseArray } from '../utils/transform.js'
import { removeStoredFiles } from '../utils/storage.js'
import { canAccessDrama, canManageDrama, canWriteDrama, currentUser } from '../utils/workspace-access.js'
import { createHash } from 'node:crypto'

const app = new Hono()

async function currentWorkspaceId(c: any) {
  const token = (c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const digest = createHash('sha256').update(token).digest('hex')
  const requested = Number(c.req.header('X-Workspace-Id') || 0)
  const [row] = await db.select({ workspaceId: schema.workspaceMembers.workspaceId })
    .from(schema.userSessions)
    .innerJoin(schema.workspaceMembers, eq(schema.workspaceMembers.userId, schema.userSessions.userId))
    .where(requested > 0 ? and(eq(schema.userSessions.tokenHash, digest), eq(schema.workspaceMembers.workspaceId, requested)) : eq(schema.userSessions.tokenHash, digest))
  return row?.workspaceId || null
}

async function accessibleDrama(c: any, id: number) {
  const [drama] = await db.select().from(schema.dramas).where(eq(schema.dramas.id, id))
  if (!drama) return null
  if (!await canAccessDrama(c, id)) return null
  return drama
}

// GET /dramas - List dramas
app.get('/', async (c) => {
  const page = Number(c.req.query('page') || 1)
  const pageSize = Number(c.req.query('page_size') || 20)
  const status = c.req.query('status')
  const keyword = c.req.query('keyword')

  const workspaceId = await currentWorkspaceId(c)
  const allRows = (await db.select().from(schema.dramas)
    .where(isNull(schema.dramas.deletedAt))
    .orderBy(desc(schema.dramas.updatedAt)))
    .filter(d => d.workspaceId == null || d.workspaceId === workspaceId)
  let filtered = allRows

  if (status) filtered = filtered.filter(d => d.status === status)
  if (keyword) filtered = filtered.filter(d => d.title.includes(keyword))

  const total = filtered.length
  const items = filtered.slice((page - 1) * pageSize, page * pageSize)

  // Attach episode/character/scene counts
  const enriched = await Promise.all(items.map(async (drama) => {
    const eps = await db.select().from(schema.episodes)
      .where(and(eq(schema.episodes.dramaId, drama.id), isNull(schema.episodes.deletedAt)))
    const chars = await db.select().from(schema.characters)
      .where(eq(schema.characters.dramaId, drama.id))
    const scns = await db.select().from(schema.scenes)
      .where(eq(schema.scenes.dramaId, drama.id))
    return {
      ...toSnakeCase(drama),
      tags: drama.tags ? JSON.parse(drama.tags) : [],
      total_episodes: eps.length,
      episodes: toSnakeCaseArray(eps),
      characters: toSnakeCaseArray(chars),
      scenes: toSnakeCaseArray(scns),
    }
  }))

  return success(c, {
    items: enriched,
    pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) },
  })
})

// POST /dramas - Create drama
app.post('/', async (c) => {
  const body = await c.req.json()
  const ts = now()
  const workspaceId = await currentWorkspaceId(c)
  const res = await db.insert(schema.dramas).values({
    workspaceId,
    title: body.title,
    description: body.description,
    genre: body.genre,
    style: body.style,
    aspectRatio: body.aspect_ratio || '16:9',
    tags: body.tags ? JSON.stringify(body.tags) : null,
    metadata: body.metadata,
    status: 'draft',
    createdAt: ts,
    updatedAt: ts,
  })

  const [result] = await db.select().from(schema.dramas)
    .where(eq(schema.dramas.id, getInsertId(res)))
  const creator = await currentUser(c)
  if (creator) await db.insert(schema.dramaMembers).values({ dramaId: result.id, userId: creator.id, role: 'owner', createdAt: ts })

  // 不再预建集 — 用户通过「添加集」流程创建（该流程会锁定图片/视频生成配置）
  return created(c, toSnakeCase(result))
})


// GET /dramas/stats — must be before /:id
app.get('/stats', async (c) => {
  const all = await db.select().from(schema.dramas).where(isNull(schema.dramas.deletedAt))
  const byStatus = Object.entries(
    all.reduce((acc, d) => {
      acc[d.status || 'draft'] = (acc[d.status || 'draft'] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  ).map(([status, count]) => ({ status, count }))
  return success(c, { total: all.length, by_status: byStatus })
})

// GET /dramas/:id - Get drama detail
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const drama = await accessibleDrama(c, id)
  if (!drama) return notFound(c, '剧本不存在')

  const eps = await db.select().from(schema.episodes)
    .where(and(eq(schema.episodes.dramaId, id), isNull(schema.episodes.deletedAt)))
  const chars = await db.select().from(schema.characters)
    .where(eq(schema.characters.dramaId, id))
  const scns = await db.select().from(schema.scenes)
    .where(eq(schema.scenes.dramaId, id))
  const prps = await db.select().from(schema.props)
    .where(eq(schema.props.dramaId, id))

  return success(c, {
    ...toSnakeCase(drama),
    tags: drama.tags ? JSON.parse(drama.tags) : [],
    episodes: toSnakeCaseArray(eps),
    characters: toSnakeCaseArray(chars),
    scenes: toSnakeCaseArray(scns),
    props: toSnakeCaseArray(prps),
  })
})

// PUT /dramas/:id - Update drama
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!await accessibleDrama(c, id)) return notFound(c, '剧本不存在')
  if (!await canWriteDrama(c, id)) return c.json({ code: 403, message: '当前角色没有编辑项目的权限' }, 403)
  const body = await c.req.json()
  const updates: Record<string, any> = { updatedAt: now() }
  if (body.title !== undefined) updates.title = body.title
  if (body.description !== undefined) updates.description = body.description
  if (body.genre !== undefined) updates.genre = body.genre
  if (body.style !== undefined) updates.style = body.style
  if (body.aspect_ratio !== undefined) updates.aspectRatio = body.aspect_ratio
  if (body.status !== undefined) updates.status = body.status
  if (body.tags !== undefined) updates.tags = JSON.stringify(body.tags)
  if (body.metadata !== undefined) updates.metadata = body.metadata
  await db.update(schema.dramas).set(updates).where(eq(schema.dramas.id, id))
  return success(c)
})

// DELETE /dramas/:id - 永久删除项目及其关联数据
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!await accessibleDrama(c, id)) return notFound(c, '剧本不存在')
  if (!await canManageDrama(c, id)) return c.json({ code: 403, message: '只有企业所有者或团队管理员可以删除项目' }, 403)
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const storedPaths: string[] = []
    const collect = (rows: any[]) => rows.forEach(row => ['image_url', 'video_url', 'composed_video_url', 'composed_image', 'first_frame_image', 'last_frame_image', 'thumbnail', 'local_path', 'url', 'thumbnail_url', 'merged_url'].forEach(key => row[key] && storedPaths.push(row[key])))
    const collectNestedRefs = (value: unknown) => {
      if (!value || typeof value !== 'object') return
      if (Array.isArray(value)) return value.forEach(collectNestedRefs)
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (typeof item === 'string' && /(url|path|image|video|thumbnail|subtitle)/i.test(key)) storedPaths.push(item)
        else if (item && typeof item === 'object') collectNestedRefs(item)
      }
    }
    const [mediaRows] = await connection.query('SELECT image_url, local_path, thumbnail FROM characters WHERE drama_id = ? UNION ALL SELECT image_url, local_path, NULL AS thumbnail FROM scenes WHERE drama_id = ? UNION ALL SELECT image_url, local_path, NULL AS thumbnail FROM props WHERE drama_id = ? UNION ALL SELECT url, local_path, thumbnail_url FROM assets WHERE drama_id = ? UNION ALL SELECT video_url, thumbnail, NULL AS thumbnail_url FROM episodes WHERE drama_id = ?', [id, id, id, id, id]) as [any[], unknown]
    collect(mediaRows)
    const [mergeRows] = await connection.query('SELECT merged_url, scenes FROM video_merges WHERE drama_id = ?', [id]) as [any[], unknown]
    collect(mergeRows)
    mergeRows.forEach(row => { if (row.scenes) { try { collectNestedRefs(JSON.parse(row.scenes)) } catch {} } })
    const [taskRows] = await connection.query('SELECT result_url, local_path, params FROM sys_task WHERE drama_id = ?', [id]) as [any[], unknown]
    collect(taskRows)
    taskRows.forEach(row => { if (row.params) { try { collectNestedRefs(JSON.parse(row.params)) } catch {} } })
    const [episodes] = await connection.query('SELECT id FROM episodes WHERE drama_id = ?', [id]) as [{ id: number }[], unknown]
    const episodeIds = episodes.map(row => row.id)
    let storyboardIds: number[] = []
    if (episodeIds.length) {
      const marks = episodeIds.map(() => '?').join(',')
      const [storyboards] = await connection.query(`SELECT id FROM storyboards WHERE episode_id IN (${marks})`, episodeIds) as [{ id: number }[], unknown]
      storyboardIds = storyboards.map(row => row.id)
      const [storyboardRows] = await connection.query(`SELECT composed_image, first_frame_image, last_frame_image, video_url, subtitle_url, composed_video_url FROM storyboards WHERE id IN (${marks})`, storyboardIds) as [any[], unknown]
      collect(storyboardRows)
      const episodeMarks = episodeIds.map(() => '?').join(',')
      await connection.query(`DELETE FROM episode_characters WHERE episode_id IN (${episodeMarks})`, episodeIds)
      await connection.query(`DELETE FROM episode_scenes WHERE episode_id IN (${episodeMarks})`, episodeIds)
      await connection.query(`DELETE FROM episode_props WHERE episode_id IN (${episodeMarks})`, episodeIds)
    }
    if (storyboardIds.length) {
      const marks = storyboardIds.map(() => '?').join(',')
      await connection.query(`DELETE FROM storyboard_characters WHERE storyboard_id IN (${marks})`, storyboardIds)
      await connection.query(`DELETE FROM storyboard_props WHERE storyboard_id IN (${marks})`, storyboardIds)
    }
    await connection.query('DELETE FROM sys_task WHERE drama_id = ?', [id])
    await connection.query('DELETE FROM video_merges WHERE drama_id = ?', [id])
    await connection.query('DELETE FROM assets WHERE drama_id = ?', [id])
    await connection.query('DELETE FROM drama_members WHERE drama_id = ?', [id])
    if (episodeIds.length) {
      const marks = episodeIds.map(() => '?').join(',')
      await connection.query(`DELETE FROM storyboards WHERE episode_id IN (${marks})`, episodeIds)
      await connection.query(`DELETE FROM episodes WHERE id IN (${marks})`, episodeIds)
    }
    await connection.query('DELETE FROM characters WHERE drama_id = ?', [id])
    await connection.query('DELETE FROM scenes WHERE drama_id = ?', [id])
    await connection.query('DELETE FROM props WHERE drama_id = ?', [id])
    await connection.query('DELETE FROM dramas WHERE id = ?', [id])
    await connection.commit()
    removeStoredFiles(storedPaths)
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
  return success(c)
})

// PUT /dramas/:id/characters - Save characters
app.put('/:id/characters', async (c) => {
  const dramaId = Number(c.req.param('id'))
  if (!await canWriteDrama(c, dramaId)) return c.json({ code: 403, message: '当前角色没有编辑项目角色的权限' }, 403)
  const body = await c.req.json()
  const chars = body.characters || []
  const ts = now()

  for (const char of chars) {
    if (char.id) {
      await db.update(schema.characters).set({ ...char, updatedAt: ts }).where(eq(schema.characters.id, char.id))
    } else {
      await db.insert(schema.characters).values({ ...char, dramaId, createdAt: ts, updatedAt: ts })
    }
  }
  return success(c)
})

// PUT /dramas/:id/episodes - Save episodes
app.put('/:id/episodes', async (c) => {
  const dramaId = Number(c.req.param('id'))
  if (!await canWriteDrama(c, dramaId)) return c.json({ code: 403, message: '当前角色没有编辑项目剧集的权限' }, 403)
  const body = await c.req.json()
  const episodes = body.episodes || []
  const ts = now()

  for (const ep of episodes) {
    if (ep.id) {
      await db.update(schema.episodes).set({ ...ep, updatedAt: ts }).where(eq(schema.episodes.id, ep.id))
    } else {
      await db.insert(schema.episodes).values({
        ...ep,
        dramaId,
        episodeNumber: ep.episode_number || ep.episodeNumber || 1,
        title: ep.title || '未命名',
        createdAt: ts,
        updatedAt: ts,
      })
    }
  }
  return success(c)
})

// GET /dramas/:id/members - 项目成员权限
app.get('/:id/members', async (c) => {
  const drama = await accessibleDrama(c, Number(c.req.param('id')))
  if (!drama) return notFound(c, '项目不存在')
  const rows = await db.select({ member: schema.dramaMembers, user: schema.users })
    .from(schema.dramaMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.dramaMembers.userId))
    .where(eq(schema.dramaMembers.dramaId, drama.id))
  return success(c, rows.map(({ member, user }) => ({ id: member.id, user_id: user.id, phone: user.phone, role: member.role, created_at: member.createdAt })))
})

// POST /dramas/:id/members - 企业管理员向项目授权成员
app.post('/:id/members', async (c) => {
  const dramaId = Number(c.req.param('id'))
  if (!await canManageDrama(c, dramaId)) return c.json({ code: 403, message: '只有企业所有者或团队管理员可以管理项目成员' }, 403)
  const body = await c.req.json().catch(() => ({}))
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const role = ['creator', 'viewer'].includes(body.role) ? body.role : 'creator'
  const [user] = await db.select().from(schema.users).where(eq(schema.users.phone, phone))
  if (!user) return badRequest(c, '该手机号尚未注册，请先注册万影工坊账号')
  const [existing] = await db.select().from(schema.dramaMembers).where(and(eq(schema.dramaMembers.dramaId, dramaId), eq(schema.dramaMembers.userId, user.id)))
  if (existing) return badRequest(c, '该用户已经拥有项目权限')
  const result = await db.insert(schema.dramaMembers).values({ dramaId, userId: user.id, role, createdAt: now() })
  return created(c, { id: getInsertId(result), user_id: user.id, phone: user.phone, role })
})

app.delete('/:id/members/:memberId', async (c) => {
  const dramaId = Number(c.req.param('id'))
  if (!await canManageDrama(c, dramaId)) return c.json({ code: 403, message: '只有企业所有者或团队管理员可以管理项目成员' }, 403)
  await db.delete(schema.dramaMembers).where(and(eq(schema.dramaMembers.id, Number(c.req.param('memberId'))), eq(schema.dramaMembers.dramaId, dramaId)))
  return success(c)
})

export default app

import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, created, badRequest } from '../utils/response.js'
import { generateImage, generateVideo } from '../services/generation.js'
import { logTaskError, logTaskPayload, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { friendlyErrorMessage } from '../utils/friendly-error.js'
import { canAccessDrama, canAccessEpisode, canWriteDrama } from '../utils/workspace-access.js'
import { workspaceForToken } from '../services/credits.js'
import { getPrice, videoActionForDuration } from '../services/pricing.js'

const app = new Hono()

type TaskType = 'image' | 'video'

async function canReadTask(c: any, row: typeof schema.sysTask.$inferSelect) {
  if (row.dramaId && !await canAccessDrama(c, row.dramaId)) return false
  if (row.storyboardId) {
    const [sb] = await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, row.storyboardId))
    if (!sb || !await canAccessEpisode(c, sb.episodeId)) return false
  }
  if (row.creditWorkspaceId) {
    const token = (c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
    const workspace = await workspaceForToken(token, Number(c.req.header('X-Workspace-Id') || 0) || undefined)
    if (!workspace || workspace.workspaceId !== row.creditWorkspaceId) return false
  }
  return !!(row.dramaId || row.storyboardId || row.creditWorkspaceId)
}

// POST /tasks — 发起生成任务（body.type: image | video）
app.post('/', async (c) => {
  const body = await c.req.json()
  const type = body.type as TaskType
  if (type !== 'image' && type !== 'video') return badRequest(c, 'type 必须为 image 或 video')

  if (type === 'image') {
    if (!body.prompt) return badRequest(c, 'prompt is required')
  } else {
    // 视频生成只保留多模态参考：校验素材上限与必填项
    const imgs = body.reference_image_urls?.length || 0
    const vids = body.reference_video_urls?.length || 0
    const auds = body.reference_audio_urls?.length || 0
    if (imgs > 9 || vids > 3 || auds > 3) {
      return badRequest(c, '参考素材超限：图片≤9、视频≤3、音频≤3')
    }
    if (auds > 0 && imgs + vids === 0) {
      return badRequest(c, '参考音频需要至少 1 个参考图片或视频')
    }
    if (imgs + vids + auds === 0 && !body.prompt) {
      return badRequest(c, '多模态参考模式需要至少一个参考素材或 prompt')
    }
  }

  try {
    if (body.drama_id && !await canWriteDrama(c, Number(body.drama_id))) return c.json({ code: 403, message: '当前角色没有发起该项目生成任务的权限' }, 403)
    if (body.storyboard_id) {
      const [sb] = await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, Number(body.storyboard_id)))
      const [ep] = sb ? await db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)) : []
      if (!sb || !ep || !await canWriteDrama(c, ep.dramaId)) return c.json({ code: 403, message: '当前角色没有发起该分镜生成任务的权限' }, 403)
    }
    for (const [key, table] of [['character_id', schema.characters], ['scene_id', schema.scenes], ['prop_id', schema.props]] as const) {
      if (!body[key]) continue
      const [asset] = await db.select().from(table).where(eq(table.id, Number(body[key])))
      if (!asset || (body.drama_id && asset.dramaId !== Number(body.drama_id)) || !await canWriteDrama(c, asset.dramaId)) {
        return c.json({ code: 403, message: '生成素材与项目归属不一致或无编辑权限' }, 403)
      }
    }
    const token = (c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
    const workspace = await workspaceForToken(token, Number(c.req.header('X-Workspace-Id') || 0) || undefined)
    if (!workspace) return badRequest(c, '未找到可用工作区')
    const duration = Number(body.duration || 10)
    const action = type === 'video' ? videoActionForDuration(duration) : body.character_id ? 'character_image' : body.scene_id ? 'scene_image' : body.prop_id ? 'prop_image' : 'character_image'
    const cost = type === 'video' ? await getPrice(action, duration) : await getPrice(action)
    const credit = { workspaceId: workspace.workspaceId, userId: workspace.userId, cost }
    // 集锁定的生成配置优先于请求指定；视频分辨率同样锁定到集
    let configId: number | undefined = body.config_id
    let episodeResolution: string | undefined
    if (body.storyboard_id) {
      const [sb] = await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, Number(body.storyboard_id)))
      if (sb) {
        const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId))
        const locked = type === 'image' ? ep?.imageConfigId : ep?.videoConfigId
        if (locked != null) configId = locked
        if (type === 'video' && ep?.resolution) episodeResolution = ep.resolution
      }
    }

    logTaskStart('TaskAPI', 'generate', {
      type,
      storyboardId: body.storyboard_id,
      sceneId: body.scene_id,
      characterId: body.character_id,
      dramaId: body.drama_id,
    })
    logTaskPayload('TaskAPI', 'request body', body)

    const id = type === 'image'
      ? await generateImage({
        storyboardId: body.storyboard_id,
        dramaId: body.drama_id,
        sceneId: body.scene_id,
        characterId: body.character_id,
        prompt: body.prompt,
        model: body.model,
        size: body.size,
        referenceImages: body.reference_images,
        frameType: body.frame_type,
        configId,
        credit,
      })
      : await generateVideo({
        storyboardId: body.storyboard_id,
        dramaId: body.drama_id,
        prompt: body.prompt,
        model: body.model,
        referenceMode: 'reference',
        referenceImageUrls: body.reference_image_urls,
        referenceVideoUrls: body.reference_video_urls,
        referenceAudioUrls: body.reference_audio_urls,
        generateAudio: body.generate_audio,
        duration: body.duration,
        aspectRatio: body.aspect_ratio,
        resolution: episodeResolution || body.resolution,
        configId,
        credit,
      })

    const [record] = await db.select().from(schema.sysTask)
      .where(eq(schema.sysTask.id, id))
    logTaskSuccess('TaskAPI', 'generate', { taskId: id, type, provider: record?.provider })
    return created(c, record)
  } catch (err: any) {
    logTaskError('TaskAPI', 'generate', { type, error: err.message })
    return badRequest(c, friendlyErrorMessage(err))
  }
})

// GET /tasks/:id — 轮询任务状态
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = await db.select().from(schema.sysTask)
    .where(eq(schema.sysTask.id, id))
  return success(c, row && await canReadTask(c, row) ? row : null)
})

// GET /tasks — 按 type / storyboard_id / drama_id 过滤
app.get('/', async (c) => {
  const type = c.req.query('type')
  const storyboardId = c.req.query('storyboard_id')
  const dramaId = c.req.query('drama_id')

  let rows = await db.select().from(schema.sysTask)

  const accessible = []
  for (const row of rows) {
    const allowed = await canReadTask(c, row)
    if (allowed) accessible.push(row)
  }
  rows = accessible

  if (type) rows = rows.filter(r => r.type === type)
  if (storyboardId) rows = rows.filter(r => r.storyboardId === Number(storyboardId))
  if (dramaId) rows = rows.filter(r => r.dramaId === Number(dramaId))

  return success(c, rows)
})

// DELETE /tasks/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [task] = await db.select().from(schema.sysTask).where(eq(schema.sysTask.id, id))
  if (!task) return success(c, null)
  if (task.dramaId && !await canWriteDrama(c, task.dramaId)) return c.json({ code: 403, message: '当前角色没有删除任务的权限' }, 403)
  if (task.storyboardId) {
    const [storyboard] = await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, task.storyboardId))
    if (storyboard && !await canWriteDrama(c, (await db.select({ dramaId: schema.episodes.dramaId }).from(schema.episodes).where(eq(schema.episodes.id, storyboard.episodeId)))[0]?.dramaId || 0)) return c.json({ code: 403, message: '当前角色没有删除任务的权限' }, 403)
  }
  if (!task.dramaId && !task.storyboardId && !(await canReadTask(c, task))) return c.json({ code: 403, message: '当前用户没有删除该任务的权限' }, 403)
  await db.delete(schema.sysTask).where(eq(schema.sysTask.id, id))
  return success(c)
})

export default app

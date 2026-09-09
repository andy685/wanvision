import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { success, created, badRequest, notFound, now } from '../utils/response.js'
import { generateImage } from '../services/generation.js'
import { getDramaStylePrompt } from '../services/style-preset.js'
import { ensureSceneFinalPrompt } from '../services/final-prompt.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { canAccessDrama, canAccessEpisode, canManageDrama, canWriteDrama } from '../utils/workspace-access.js'
import { workspaceForToken, consumeCredits } from '../services/credits.js'
import { getPrice } from '../services/pricing.js'

const app = new Hono()

app.use('/:id/*', async (c, next) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return next()
  const [scene] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, id))
  if (!scene || !await canAccessDrama(c, scene.dramaId)) return notFound(c, '场景不存在')
  return next()
})

// POST /scenes — 手动新增场景（传入 episode_id 时关联到该集）
app.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.drama_id) return badRequest(c, 'drama_id required')
  if (!await canWriteDrama(c, Number(body.drama_id))) return c.json({ code: 403, message: '当前角色没有新增场景的权限' }, 403)
  if (!body.location?.trim()) return badRequest(c, 'location required')
  const ts = now()
  const res = await db.insert(schema.scenes).values({
    dramaId: body.drama_id,
    episodeId: body.episode_id,
    location: body.location.trim(),
    time: body.time || '',
    prompt: body.prompt || body.description || body.location,
    lighting: body.lighting || '',
    createdAt: ts,
    updatedAt: ts,
  })
  const sceneId = getInsertId(res)
  if (body.episode_id) {
    const existing = await db.select().from(schema.episodeScenes)
      .where(and(eq(schema.episodeScenes.episodeId, Number(body.episode_id)), eq(schema.episodeScenes.sceneId, sceneId)))
    if (!existing.length) {
      await db.insert(schema.episodeScenes).values({ episodeId: Number(body.episode_id), sceneId, createdAt: ts })
    }
  }
  const [result] = await db.select().from(schema.scenes)
    .where(eq(schema.scenes.id, sceneId))
  return created(c, result)
})

// PUT /scenes/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [target] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, id))
  if (!target || !await canWriteDrama(c, target.dramaId)) return c.json({ code: 403, message: '当前角色没有编辑场景的权限' }, 403)
  const body = await c.req.json()
  const updates: Record<string, any> = { updatedAt: now() }
  if (body.location !== undefined) updates.location = body.location
  if (body.time !== undefined) updates.time = body.time
  if (body.prompt !== undefined) updates.prompt = body.prompt
  if (body.description !== undefined) updates.prompt = body.description
  if (body.lighting !== undefined) updates.lighting = body.lighting
  // 用户上传场景图：直接写入图片地址与本地路径
  const uploadedImage = body.image_url ?? body.imageUrl
  if (uploadedImage !== undefined) {
    updates.imageUrl = uploadedImage
    if (uploadedImage) updates.status = 'completed'
  }
  if (body.local_path !== undefined) updates.localPath = body.local_path
  else if (body.localPath !== undefined) updates.localPath = body.localPath
  // 手动编辑最终提示词时以传入值为准；未传入则保留原值（修改信息时不再自动置空）
  if (body.final_prompt !== undefined) updates.finalPrompt = body.final_prompt || null
  else if (body.finalPrompt !== undefined) updates.finalPrompt = body.finalPrompt || null
  await db.update(schema.scenes).set(updates).where(eq(schema.scenes.id, id))
  return success(c)
})

// POST /scenes/:id/generate-image
app.post('/:id/generate-image', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [scene] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, id))
  if (scene && !await canWriteDrama(c, scene.dramaId)) return c.json({ code: 403, message: '当前角色没有生成场景图的权限' }, 403)
  if (!scene) return badRequest(c, 'Scene not found')
  if (!body.episode_id) return badRequest(c, 'episode_id is required')
  if (!await canAccessEpisode(c, Number(body.episode_id))) return notFound(c, '剧集不存在')
  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id)))
  if (!ep) return badRequest(c, 'Episode not found')
  if (ep.dramaId !== scene.dramaId) return badRequest(c, '场景与剧集不属于同一项目')
  const creditOwner = await workspaceForToken((c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '').trim(), Number(c.req.header('X-Workspace-Id') || 0) || undefined)
  if (!creditOwner) return badRequest(c, '未找到可用积分账户')

  const stylePrompt = await getDramaStylePrompt(scene.dramaId)
  const finalPrompt = await ensureSceneFinalPrompt(scene, ep.id, false, { model: body.text_model, configId: body.text_config_id ?? undefined })
  const prompt = finalPrompt || [
    stylePrompt || '',
    scene.location,
    scene.time || '',
    scene.prompt || '高质量场景',
    scene.lighting || '电影感光影',
  ].filter(Boolean).join(', ')
  try {
    logTaskStart('SceneImage', 'generate', { sceneId: id, episodeId: ep.id, dramaId: scene.dramaId, location: scene.location })
    await db.update(schema.scenes).set({ status: 'processing', updatedAt: now() }).where(eq(schema.scenes.id, id))
    const genId = await generateImage({ sceneId: id, dramaId: scene.dramaId, prompt, model: body.model, configId: body.config_id ?? ep.imageConfigId ?? undefined, credit: { workspaceId: creditOwner.workspaceId, userId: creditOwner.userId, cost: await getPrice('scene_image') } })
    logTaskSuccess('SceneImage', 'generate', { sceneId: id, generationId: genId })
    return success(c, { image_generation_id: genId })
  } catch (err: any) {
    logTaskError('SceneImage', 'generate', { sceneId: id, error: err.message })
    await db.update(schema.scenes).set({ status: 'failed', updatedAt: now() }).where(eq(schema.scenes.id, id))
    return badRequest(c, err.message)
  }
})

// POST /scenes/:id/generate-prompt — 独立生成/重新生成固定视角最终提示词（不生图）
app.post('/:id/generate-prompt', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [scene] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, id))
  if (!scene) return badRequest(c, 'Scene not found')
  if (!body.episode_id) return badRequest(c, 'episode_id is required')

  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id)))
  if (!ep) return badRequest(c, 'Episode not found')
  if (ep.dramaId !== scene.dramaId) return badRequest(c, '场景与剧集不属于同一项目')

  logTaskStart('FinalPrompt', 'scene-generate', { sceneId: id, episodeId: ep.id, force: !!body.force })
  const finalPrompt = await ensureSceneFinalPrompt(scene, ep.id, !!body.force, { model: body.text_model, configId: body.text_config_id ?? undefined })
  if (!finalPrompt) {
    logTaskError('FinalPrompt', 'scene-generate', { sceneId: id, error: 'agent returned empty prompt' })
    return badRequest(c, '最终提示词生成失败，请重试')
  }
  const promptCost = await getPrice('scene_prompt')
  const creditOwner = await workspaceForToken((c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '').trim(), Number(c.req.header('X-Workspace-Id') || 0) || undefined)
  if (!creditOwner) return badRequest(c, '未找到可用积分账户')
  await consumeCredits(creditOwner.workspaceId, creditOwner.userId, promptCost, `scene-prompt:${id}:${Date.now()}`, `场景提示词生成 ${promptCost} 积分`)
  logTaskSuccess('FinalPrompt', 'scene-generate', { sceneId: id })
  return success(c, { final_prompt: finalPrompt })
})

// DELETE /scenes/:id — 软删除（保留历史生成记录）
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [target] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, id))
  if (!target || !await canManageDrama(c, target.dramaId)) return c.json({ code: 403, message: '只有企业所有者或团队管理员可以删除场景' }, 403)
  await db.update(schema.scenes).set({ deletedAt: now(), updatedAt: now() }).where(eq(schema.scenes.id, id))
  return success(c)
})

export default app

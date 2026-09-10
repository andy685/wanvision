import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { success, created, badRequest, notFound, now } from '../utils/response.js'
import { toSnakeCase } from '../utils/transform.js'
import { generateImage } from '../services/generation.js'
import { getDramaStylePrompt } from '../services/style-preset.js'
import { ensureCharacterFinalPrompt } from '../services/final-prompt.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { canAccessDrama, canAccessEpisode, canManageDrama, canWriteDrama } from '../utils/workspace-access.js'
import { workspaceForToken } from '../services/credits.js'
import { getPrice } from '../services/pricing.js'
import { runBillableTextTask } from '../services/text-task.js'

const app = new Hono()
const CHARACTER_IMAGE_SIZE = '1920x1080'

app.use('/:id/*', async (c, next) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) return next()
  const [char] = await db.select().from(schema.characters).where(eq(schema.characters.id, id))
  if (!char || !await canAccessDrama(c, char.dramaId)) return notFound(c, '角色不存在')
  return next()
})

// POST /characters — 手动新增角色（传入 episode_id 时关联到该集）
app.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.drama_id) return badRequest(c, 'drama_id required')
  if (!await canWriteDrama(c, Number(body.drama_id))) return c.json({ code: 403, message: '当前角色没有新增角色的权限' }, 403)
  if (!body.name?.trim()) return badRequest(c, 'name required')
  const ts = now()
  const res = await db.insert(schema.characters).values({
    name: body.name.trim(),
    role: body.role || '',
    description: body.description || '',
    appearance: body.appearance || '',
    styling: body.styling || '',
    dramaId: body.drama_id,
    createdAt: ts,
    updatedAt: ts,
  })
  const charId = getInsertId(res)
  if (body.episode_id) {
    const existing = await db.select().from(schema.episodeCharacters)
      .where(and(eq(schema.episodeCharacters.episodeId, Number(body.episode_id)), eq(schema.episodeCharacters.characterId, charId)))
    if (!existing.length) {
      await db.insert(schema.episodeCharacters).values({ episodeId: Number(body.episode_id), characterId: charId, createdAt: ts })
    }
  }
  const [row] = await db.select().from(schema.characters).where(eq(schema.characters.id, charId))
  return created(c, toSnakeCase(row))
})

function characterImagePrompt(char: typeof schema.characters.$inferSelect, stylePrompt = '') {
  return [
    stylePrompt || '',
    char.name,
    char.appearance || char.description || '人物立绘',
    char.styling || '',
    '16:9 横版风格化 3D 动画角色设定图',
    '左侧头部到胸口完整入镜的半身肖像，不要大幅正脸特写',
    '右侧正面、90 度侧面、背面三张等高全身视图',
    '明显虚构动画角色，非真人照片，非写实肖像，非真实演员感',
    '略微简化的五官，干净皮肤材质，柔和雕塑感面部',
    '高质量动画电影质感',
    '白色背景',
  ].filter(Boolean).join(', ')
}

// PUT /characters/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [target] = await db.select().from(schema.characters).where(eq(schema.characters.id, id))
  if (!target || !await canWriteDrama(c, target.dramaId)) return c.json({ code: 403, message: '当前角色没有编辑角色的权限' }, 403)
  const body = await c.req.json()
  const updates: Record<string, any> = { updatedAt: now() }
  for (const key of ['name', 'role', 'description', 'appearance', 'styling', 'imageUrl', 'localPath']) {
    const snakeKey = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase())
    if (snakeKey in body) updates[key] = body[snakeKey]
    else if (key in body) updates[key] = body[key]
  }
  // 手动编辑最终提示词时以传入值为准；未传入则保留原值（修改信息时不再自动置空）
  if (body.final_prompt !== undefined) updates.finalPrompt = body.final_prompt || null
  else if (body.finalPrompt !== undefined) updates.finalPrompt = body.finalPrompt || null
  await db.update(schema.characters).set(updates).where(eq(schema.characters.id, id))
  return success(c)
})

// DELETE /characters/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [target] = await db.select().from(schema.characters).where(eq(schema.characters.id, id))
  if (!target || !await canManageDrama(c, target.dramaId)) return c.json({ code: 403, message: '只有企业所有者或团队管理员可以删除角色' }, 403)
  await db.update(schema.characters).set({ deletedAt: now() }).where(eq(schema.characters.id, id))
  return success(c)
})

// POST /characters/:id/generate-image
app.post('/:id/generate-image', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [char] = await db.select().from(schema.characters).where(eq(schema.characters.id, id))
  if (!char) return badRequest(c, 'Character not found')
  if (!await canWriteDrama(c, char.dramaId)) return c.json({ code: 403, message: '当前角色没有生成角色图的权限' }, 403)
  if (!body.episode_id) return badRequest(c, 'episode_id is required')
  if (!await canAccessEpisode(c, Number(body.episode_id))) return notFound(c, '剧集不存在')

  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id)))
  if (!ep) return badRequest(c, 'Episode not found')
  if (ep.dramaId !== char.dramaId) return badRequest(c, '角色与剧集不属于同一项目')
  const creditOwner = await workspaceForToken((c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '').trim(), Number(c.req.header('X-Workspace-Id') || 0) || undefined)
  if (!creditOwner) return badRequest(c, '未找到可用积分账户')

  const stylePrompt = await getDramaStylePrompt(char.dramaId)
  const finalPrompt = await ensureCharacterFinalPrompt(char, ep.id, false, { model: body.text_model, configId: body.text_config_id ?? undefined })
  const prompt = finalPrompt || characterImagePrompt(char, stylePrompt)
  try {
    logTaskStart('CharacterImage', 'generate', { characterId: id, episodeId: ep.id, dramaId: char.dramaId })
    const genId = await generateImage({ characterId: id, dramaId: char.dramaId, prompt, model: body.model, size: CHARACTER_IMAGE_SIZE, configId: body.config_id ?? ep.imageConfigId ?? undefined, credit: { workspaceId: creditOwner.workspaceId, userId: creditOwner.userId, cost: await getPrice('character_image') } })
    logTaskSuccess('CharacterImage', 'generate', { characterId: id, generationId: genId })
    return success(c, { image_generation_id: genId })
  } catch (err: any) {
    logTaskError('CharacterImage', 'generate', { characterId: id, error: err.message })
    return badRequest(c, err.message)
  }
})

// POST /characters/:id/generate-prompt — 独立生成/重新生成三视图最终提示词（不生图）
app.post('/:id/generate-prompt', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [char] = await db.select().from(schema.characters).where(eq(schema.characters.id, id))
  if (!char) return badRequest(c, 'Character not found')
  if (!await canWriteDrama(c, char.dramaId)) return c.json({ code: 403, message: '当前角色没有生成提示词的权限' }, 403)
  if (!body.episode_id) return badRequest(c, 'episode_id is required')

  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id)))
  if (!ep) return badRequest(c, 'Episode not found')
  if (ep.dramaId !== char.dramaId) return badRequest(c, '角色与剧集不属于同一项目')
  if (char.finalPrompt && !body.force) return success(c, { final_prompt: char.finalPrompt })
  logTaskStart('FinalPrompt', 'character-generate', { characterId: id, episodeId: ep.id, force: !!body.force })
  const promptCost = await getPrice('character_prompt')
  const creditOwner = await workspaceForToken((c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '').trim(), Number(c.req.header('X-Workspace-Id') || 0) || undefined)
  if (!creditOwner) return badRequest(c, '未找到可用积分账户')
  try {
    const finalPrompt = await runBillableTextTask({
      dramaId: char.dramaId,
      episodeId: ep.id,
      characterId: id,
      provider: 'prompt_generator',
      model: body.text_model || null,
      prompt: `为角色「${char.name}」生成三视图最终提示词`,
      params: { agent_type: 'prompt_generator', action: 'character_prompt', character_id: id, force: !!body.force },
      credit: { workspaceId: creditOwner.workspaceId, userId: creditOwner.userId, cost: promptCost },
      run: () => ensureCharacterFinalPrompt(char, ep.id, !!body.force, { model: body.text_model, configId: body.text_config_id ?? undefined }),
      validate: prompt => !!String(prompt || '').trim(),
      emptyMessage: '最终提示词生成失败，请重试',
    })
    logTaskSuccess('FinalPrompt', 'character-generate', { characterId: id })
    return success(c, { final_prompt: finalPrompt })
  } catch (err: any) {
    logTaskError('FinalPrompt', 'character-generate', { characterId: id, error: err.message })
    return badRequest(c, err.message || '最终提示词生成失败，请重试')
  }
})

// POST /characters/batch-generate-images
app.post('/batch-generate-images', async (c) => {
  const body = await c.req.json()
  const ids: number[] = body.character_ids || []
  if (!body.episode_id) return badRequest(c, 'episode_id is required')
  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id)))
  if (!ep) return badRequest(c, 'Episode not found')
  if (!await canWriteDrama(c, ep.dramaId)) return c.json({ code: 403, message: '当前角色没有批量生成的权限' }, 403)
  const creditOwner = await workspaceForToken((c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '').trim(), Number(c.req.header('X-Workspace-Id') || 0) || undefined)
  if (!creditOwner) return badRequest(c, '未找到可用积分账户')
  const results: number[] = []
  const stylePrompt = await getDramaStylePrompt(ep.dramaId)
  for (const cid of ids) {
    const [char] = await db.select().from(schema.characters).where(eq(schema.characters.id, cid))
    if (!char) continue
    const finalPrompt = await ensureCharacterFinalPrompt(char, ep.id, false, { model: body.text_model, configId: body.text_config_id ?? undefined })
    const prompt = finalPrompt || characterImagePrompt(char, stylePrompt)
    try {
      const genId = await generateImage({ characterId: cid, dramaId: char.dramaId, prompt, model: body.model, size: CHARACTER_IMAGE_SIZE, configId: body.config_id ?? ep.imageConfigId ?? undefined, credit: { workspaceId: creditOwner.workspaceId, userId: creditOwner.userId, cost: await getPrice('character_image') } })
      results.push(genId)
    } catch {}
  }
  logTaskSuccess('CharacterImage', 'batch-generate', { episodeId: ep.id, requested: ids.length, started: results.length })
  return success(c, { count: results.length, ids: results })
})

export default app

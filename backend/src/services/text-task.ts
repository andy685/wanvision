import { eq } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { reserveCredits, settleCredits } from './credits.js'

interface BillableTextTaskOptions<T> {
  dramaId: number
  episodeId: number
  prompt: string
  provider: string
  model?: string | null
  params?: Record<string, unknown>
  credit: { workspaceId: number; userId: number; cost: number }
  characterId?: number
  sceneId?: number
  propId?: number
  storyboardId?: number
  run: () => Promise<T>
  validate?: (result: T) => boolean
  emptyMessage?: string
}

export async function runBillableTextTask<T>(options: BillableTextTaskOptions<T>): Promise<T> {
  const taskResult = await db.insert(schema.sysTask).values({
    type: 'text',
    dramaId: options.dramaId,
    storyboardId: options.storyboardId,
    characterId: options.characterId,
    sceneId: options.sceneId,
    propId: options.propId,
    provider: options.provider,
    model: options.model || null,
    prompt: options.prompt,
    params: JSON.stringify({ episode_id: options.episodeId, ...options.params }),
    status: 'processing',
    creditCost: options.credit.cost,
    creditStatus: 'pending',
    creditWorkspaceId: options.credit.workspaceId,
    creditUserId: options.credit.userId,
    createdAt: now(),
    updatedAt: now(),
  })
  const taskId = getInsertId(taskResult)

  try {
    await reserveCredits(options.credit.workspaceId, options.credit.userId, options.credit.cost, `task:${taskId}`)
    await db.update(schema.sysTask)
      .set({ creditStatus: 'frozen', updatedAt: now() })
      .where(eq(schema.sysTask.id, taskId))
  } catch (error: any) {
    await db.update(schema.sysTask)
      .set({ status: 'failed', creditStatus: 'none', errorMsg: error.message || '积分不足', updatedAt: now(), completedAt: now() })
      .where(eq(schema.sysTask.id, taskId))
    throw error
  }

  try {
    const result = await options.run()
    if (options.validate && !options.validate(result)) {
      throw new Error(options.emptyMessage || '文本生成失败，请重试')
    }
    await settleCredits(taskId, true)
    await db.update(schema.sysTask)
      .set({ status: 'completed', resultUrl: typeof result === 'string' ? result : null, updatedAt: now(), completedAt: now() })
      .where(eq(schema.sysTask.id, taskId))
    return result
  } catch (error: any) {
    await settleCredits(taskId, false)
    await db.update(schema.sysTask)
      .set({ status: 'failed', errorMsg: error.message || '文本生成失败', updatedAt: now(), completedAt: now() })
      .where(eq(schema.sysTask.id, taskId))
    throw error
  }
}

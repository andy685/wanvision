/**
 * Agent 聊天路由 — 非流式版本
 */
import { Hono } from 'hono'
import { validAgentTypes } from '../agents/index.js'
import { buildAgentRequestContext } from '../agents/context.js'
import { mastra } from '../mastra/index.js'
import { success, badRequest } from '../utils/response.js'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { reserveCredits, settleCredits, workspaceForToken } from '../services/credits.js'
import { db, getInsertId, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { eq } from 'drizzle-orm'
import { getConfigById, getTextConfig } from '../services/ai.js'

const app = new Hono()

// Mastra v1.17 的 ToolCallChunk / ToolResultChunk 结构：
// { type: 'tool-call', payload: { toolCallId, toolName, args } }
// { type: 'tool-result', payload: { toolCallId, toolName, result, isError } }
function normalizeToolName(entry: any) {
  return entry?.payload?.toolName
    || entry?.toolName
    || entry?.tool?.toolName
    || entry?.tool?.id
    || entry?.name
    || entry?.type
    || null
}

function normalizeToolResult(entry: any) {
  const result = entry?.payload?.result ?? entry?.result ?? entry?.payload?.output ?? entry?.output ?? entry?.data ?? null
  return typeof result === 'string' ? result : JSON.stringify(result)
}

// POST /agent/:type/chat — 非流式 Agent 对话
app.post('/:type/chat', async (c) => {
  const agentType = c.req.param('type')
  if (!validAgentTypes.includes(agentType)) {
    return badRequest(c, `Invalid agent type: ${agentType}`)
  }

  const body = await c.req.json()
  const { message, drama_id, episode_id } = body

  logTaskStart('Agent', agentType, {
    dramaId: drama_id,
    episodeId: episode_id,
    message,
  })
  logTaskPayload('Agent', `${agentType} input`, body)

  if (!episode_id || !drama_id) {
    logTaskError('Agent', agentType, { reason: 'missing drama_id or episode_id' })
    return badRequest(c, 'drama_id and episode_id are required')
  }

  const creditOwner = await workspaceForToken((c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '').trim(), Number(c.req.header('X-Workspace-Id') || 0) || undefined)
  const agentCost = agentType === 'storyboard_breaker' ? 3 : agentType === 'prompt_generator' ? 1 : 2
  const textConfig = (body.config_id ? await getConfigById(Number(body.config_id), 'text') : null) || await getTextConfig()
  const resolvedModel = body.model || textConfig.model || null
  const taskResult = await db.insert(schema.sysTask).values({
    type: 'text', dramaId: Number(drama_id), prompt: String(message || ''), provider: agentType, model: resolvedModel,
    params: JSON.stringify({ agent_type: agentType, episode_id, message }), status: 'processing',
    creditCost: creditOwner ? agentCost : 0, creditStatus: creditOwner ? 'frozen' : 'none',
    creditWorkspaceId: creditOwner?.workspaceId, creditUserId: creditOwner?.userId, createdAt: now(), updatedAt: now(),
  })
  const taskId = getInsertId(taskResult)
  try { if (creditOwner) await reserveCredits(creditOwner.workspaceId, creditOwner.userId, agentCost, `task:${taskId}`) } catch (error: any) {
    await db.update(schema.sysTask).set({ status: 'failed', errorMsg: error.message || '积分不足', updatedAt: now(), completedAt: now() }).where(eq(schema.sysTask.id, taskId))
    return badRequest(c, error.message || '积分不足')
  }

  const agent = mastra.getAgent(agentType)
  if (!agent) {
    logTaskError('Agent', agentType, { reason: 'agent not found' })
    return badRequest(c, 'Agent not found')
  }

  const requestContext = buildAgentRequestContext({
    episodeId: episode_id,
    dramaId: drama_id,
    modelOverride: body.model || undefined,
    textConfigId: body.config_id || undefined,
  })

  const startTime = performance.now()

  try {
    const result = await agent.generate(
      [{ role: 'user', content: message }],
      { maxSteps: 20, requestContext },
    )

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
    if (creditOwner) await settleCredits(taskId, true)
    await db.update(schema.sysTask).set({ status: 'completed', resultUrl: result.text || null, updatedAt: now(), completedAt: now() }).where(eq(schema.sysTask.id, taskId))
    logTaskSuccess('Agent', agentType, { elapsedSeconds: elapsed })

    // 收集所有 tool calls 和 results
    const toolCalls = result.toolCalls || []
    const toolResults = result.toolResults || []
    const normalizedToolCalls = toolCalls.map((tc: any) => ({
      toolName: normalizeToolName(tc),
      args: tc?.payload?.args ?? tc?.args ?? tc?.input ?? null,
    }))
    const normalizedToolResults = toolResults.map((tr: any) => ({
      toolName: normalizeToolName(tr),
      result: normalizeToolResult(tr),
    }))

    logTaskProgress('Agent', 'tool-summary', {
      agentType,
      toolCalls: normalizedToolCalls.map((tc: any) => tc.toolName),
      toolResults: normalizedToolResults.map((tr: any) => tr.toolName),
    })
    logTaskPayload('Agent', `${agentType} tool-results`, normalizedToolResults)

    return success(c, {
      type: 'done',
      text: result.text || '',
      toolCalls: normalizedToolCalls,
      toolResults: normalizedToolResults,
    })
  } catch (err: any) {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
    logTaskError('Agent', agentType, { elapsedSeconds: elapsed, error: err.message })
    console.error(err.stack || err)
    if (creditOwner) await settleCredits(taskId, false)
    await db.update(schema.sysTask).set({ status: 'failed', errorMsg: err.message || 'Agent execution failed', updatedAt: now(), completedAt: now() }).where(eq(schema.sysTask.id, taskId))
    return badRequest(c, err.message || 'Agent execution failed')
  }
})

// GET /agent/:type/debug
app.get('/:type/debug', async (c) => {
  const agentType = c.req.param('type')
  if (!validAgentTypes.includes(agentType)) return badRequest(c, 'Invalid agent type')
  return success(c, { agent_type: agentType, valid: true })
})

export default app

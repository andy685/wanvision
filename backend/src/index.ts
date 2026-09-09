import 'dotenv/config'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import path from 'path'
import { fileURLToPath } from 'url'

import dramas from './routes/dramas.js'
import episodes from './routes/episodes.js'
import storyboards from './routes/storyboards.js'
import scenes from './routes/scenes.js'
import characters from './routes/characters.js'
import tasks from './routes/tasks.js'
import upload from './routes/upload.js'
import aiConfigs, { aiProviders } from './routes/aiConfigs.js'
import stylePresets from './routes/stylePresets.js'
import prompts from './routes/prompts.js'
import agent from './routes/agent.js'
import merge from './routes/merge.js'
import skills from './routes/skills.js'
import props from './routes/props.js'
import pricing from './routes/pricing.js'
import auth, { ensureBootstrapAdmin } from './routes/auth.js'
import credits from './routes/credits.js'
import workspaces from './routes/workspaces.js'
import recharge from './routes/recharge.js'
import admin from './routes/admin.js'
import { requestLogger, errorHandler } from './middleware/logger.js'
import { db, pool, schema } from './db/index.js'
import { eq } from 'drizzle-orm'
import { now } from './utils/response.js'
import { currentAdmin, currentUser } from './utils/workspace-access.js'
import { getAbsolutePath } from './utils/storage.js'
import { isObjectStorageEnabled, signedObjectUrl } from './services/object-storage.js'
import fs from 'node:fs'
import { settleCredits } from './services/credits.js'
import { paymentConfigStatus } from './services/platform-settings.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')

const app = new Hono()

// Middleware
app.use('*', cors({
  origin: [
    'http://localhost:3013',
    'http://localhost:5679',
    ...(process.env.FRONTEND_ORIGIN ? process.env.FRONTEND_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean) : []),
    ...(process.env.ADMIN_ORIGIN ? process.env.ADMIN_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean) : []),
  ],
  credentials: true,
}))
app.use('*', requestLogger)
app.use('*', errorHandler)

// Health check
app.get('/api/v1/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))
app.get('/api/v1/health/ready', async (c) => {
  try {
    await pool.query('SELECT 1')
    return c.json({ status: 'ready', database: 'ok', storage: isObjectStorageEnabled() ? 'cos' : 'local', payments: await paymentConfigStatus(), timestamp: new Date().toISOString() })
  } catch (error: any) {
    return c.json({ status: 'not_ready', database: 'error', message: error.message, timestamp: new Date().toISOString() }, 503)
  }
})

// SaaS 业务接口默认要求登录；健康检查、认证和公开价格接口保持开放。
app.use('/api/v1/*', async (c, next) => {
  const path = c.req.path
  if (path === '/api/v1/health' || path.startsWith('/api/v1/auth') || path.startsWith('/api/v1/admin') || path === '/api/v1/pricing' || path === '/api/v1/pricing/quote' || path.startsWith('/api/v1/recharge/webhooks/')) return next()
  if ((path.startsWith('/api/v1/style-presets') || path.startsWith('/api/v1/prompts') || path.startsWith('/api/v1/skills')) && await currentAdmin(c)) return next()
  if ((path === '/api/v1/pricing/admin' || path.startsWith('/api/v1/pricing/admin/') || path.startsWith('/api/v1/ai-configs') || path.startsWith('/api/v1/ai-providers')) && await currentAdmin(c)) return next()
  if (!await currentUser(c)) return c.json({ code: 401, message: '请先登录' }, 401)
  return next()
})

// API routes
const api = new Hono()
api.route('/dramas', dramas)
api.route('/episodes', episodes)
api.route('/storyboards', storyboards)
api.route('/scenes', scenes)
api.route('/characters', characters)
api.route('/tasks', tasks)
api.route('/upload', upload)
api.route('/ai-configs', aiConfigs)
api.route('/ai-providers', aiProviders)
api.route('/style-presets', stylePresets)
api.route('/prompts', prompts)
api.route('/agent', agent)
api.route('/merge', merge)
api.route('/skills', skills)
api.route('/props', props)
api.route('/pricing', pricing)
api.route('/auth', auth)
api.route('/credits', credits)
api.route('/workspaces', workspaces)
api.route('/recharge', recharge)
api.route('/admin', admin)

app.route('/api/v1', api)

// Serve static files (storage)
// 生成的图片/视频按 uuid 命名、内容不变，标记为 immutable 让浏览器长缓存
app.use('/static/*', async (c, next) => {
  const relativePath = c.req.path.replace(/^\//, '')
  const localPath = getAbsolutePath(relativePath)
  if (isObjectStorageEnabled() && !fs.existsSync(localPath)) {
    const remoteUrl = signedObjectUrl(relativePath)
    if (remoteUrl) return c.redirect(remoteUrl, 302)
  }
  await next()
  if (c.res.ok) c.header('Cache-Control', 'public, max-age=31536000, immutable')
})
app.use('/static/*', serveStatic({ root: path.join(projectRoot, 'data') }))

// Serve frontend (production build)
const distPath = path.join(projectRoot, 'frontend', 'dist')
app.use('*', serveStatic({ root: distPath }))
app.get('*', serveStatic({ root: distPath, path: 'index.html' }))

const port = Number(process.env.PORT || 5679)
console.log(`🚀 Wanying Studio TS server on http://localhost:${port}`)

await ensureBootstrapAdmin()

// 进程重启后内存中的轮询线程全部丢失,残留的 processing 任务永远不会完成,
// 启动时统一标记为 failed,避免前端一直显示"生成中"
db.select({ id: schema.sysTask.id })
  .from(schema.sysTask)
  .where(eq(schema.sysTask.status, 'processing'))
  .then(async tasks => {
    for (const task of tasks) await settleCredits(task.id, false)
    const result = await db.update(schema.sysTask)
      .set({ status: 'failed', errorMsg: '服务重启，生成任务中断，请重试', updatedAt: now() })
      .where(eq(schema.sysTask.status, 'processing'))
    const affected = (Array.isArray(result) ? result[0] : result)?.affectedRows ?? 0
    if (affected > 0) console.log(`🔁 已清理 ${affected} 个中断任务并退还冻结积分`)
  })
  .catch(err => console.error('清理中断任务失败:', err?.message))

serve({ fetch: app.fetch, port })

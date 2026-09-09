import { createDecipheriv, createHmac, createVerify, randomUUID, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { desc, eq } from 'drizzle-orm'
import { db, getInsertId, pool, schema } from '../db/index.js'
import { badRequest, created, success, now } from '../utils/response.js'
import { toSnakeCaseArray } from '../utils/transform.js'
import { workspaceForToken } from '../services/credits.js'
import { paymentAdapters } from '../services/payments/adapters.js'
import { getPlatformSetting, paymentChannelEnabled, paymentConfigStatus } from '../services/platform-settings.js'

const app = new Hono()
const providers = new Set(['wechat', 'alipay'])

async function decryptWechatResource(resource: any, timestamp: string, nonce: string, signature: string, rawBody: string) {
  const platformKey = (await getPlatformSetting('wechat_platform_public_key')).replace(/\\n/g, '\n')
  const apiV3Key = await getPlatformSetting('wechat_api_v3_key')
  if (!platformKey || !apiV3Key || apiV3Key.length !== 32) throw new Error('微信支付回调验签密钥未完整配置')
  const verifier = createVerify('RSA-SHA256')
  verifier.update(`${timestamp}\n${nonce}\n${rawBody}\n`)
  verifier.end()
  if (!verifier.verify(platformKey, signature, 'base64')) throw new Error('微信支付回调签名无效')
  const ciphertext = Buffer.from(String(resource.ciphertext || ''), 'base64')
  const authTag = ciphertext.subarray(ciphertext.length - 16)
  const encrypted = ciphertext.subarray(0, ciphertext.length - 16)
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(apiV3Key), Buffer.from(String(resource.nonce || nonce)))
  decipher.setAuthTag(authTag)
  decipher.setAAD(Buffer.from(String(resource.associated_data || '')))
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8'))
}

async function owner(c: any) {
  return workspaceForToken((c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '').trim(), Number(c.req.header('X-Workspace-Id') || 0) || undefined)
}

// POST /recharge/orders - 创建充值订单；支付成功前只创建待支付订单，不增加积分。
app.post('/orders', async (c) => {
  const account = await owner(c)
  if (!account) return badRequest(c, '请先登录')
  const body = await c.req.json().catch(() => ({}))
  const provider = String(body.payment_provider || body.paymentProvider || '')
  const amountFen = Math.floor(Number(body.amount_fen ?? Number(body.amount || 0) * 100))
  if (!providers.has(provider)) return badRequest(c, '支付方式仅支持微信支付或支付宝')
  if (!await paymentChannelEnabled(provider as 'wechat' | 'alipay')) return badRequest(c, '该支付渠道暂未启用')
  const paymentStatus = await paymentConfigStatus()
  if (!paymentStatus[provider as 'wechat' | 'alipay']) return badRequest(c, '该支付渠道配置未完成，请联系管理员')
  if (!Number.isFinite(amountFen) || amountFen < 100) return badRequest(c, '充值金额不能低于 1 元')
  const credits = Math.floor(amountFen / 10)
  const ts = now()
  const orderNo = `WY${Date.now()}${randomUUID().replace(/-/g, '').slice(0, 10)}`
  const result = await db.insert(schema.rechargeOrders).values({
    orderNo, userId: account.userId, workspaceId: account.workspaceId, paymentProvider: provider,
    amountFen, credits, status: 'pending', createdAt: ts, updatedAt: ts,
  })
  const [order] = await db.select().from(schema.rechargeOrders).where(eq(schema.rechargeOrders.id, getInsertId(result)))
  return created(c, { ...toSnakeCaseArray([order])[0], payment_status: 'pending', payment_message: '支付适配器待配置' })
})

// GET /recharge/orders - 当前用户当前工作区的充值订单
app.get('/orders', async (c) => {
  const account = await owner(c)
  if (!account) return badRequest(c, '请先登录')
  const rows = await db.select().from(schema.rechargeOrders)
    .where(eq(schema.rechargeOrders.workspaceId, account.workspaceId))
    .orderBy(desc(schema.rechargeOrders.createdAt))
  return success(c, toSnakeCaseArray(rows))
})

app.get('/orders/:orderNo', async (c) => {
  const account = await owner(c)
  if (!account) return badRequest(c, '请先登录')
  const [order] = await db.select().from(schema.rechargeOrders).where(eq(schema.rechargeOrders.orderNo, c.req.param('orderNo')))
  if (!order || order.workspaceId !== account.workspaceId) return badRequest(c, '充值订单不存在')
  return success(c, toSnakeCaseArray([order])[0])
})

app.post('/orders/:orderNo/pay', async (c) => {
  const account = await owner(c)
  if (!account) return badRequest(c, '请先登录')
  const [order] = await db.select().from(schema.rechargeOrders).where(eq(schema.rechargeOrders.orderNo, c.req.param('orderNo')))
  if (!order || order.workspaceId !== account.workspaceId) return badRequest(c, '充值订单不存在')
  if (order.status !== 'pending') return badRequest(c, '该订单当前不可支付')
  const intent = await paymentAdapters[order.paymentProvider as 'wechat' | 'alipay'].createPayment({ orderNo: order.orderNo, amountFen: order.amountFen, description: `万影工坊积分充值 ${order.credits}` })
  return success(c, intent)
})

// POST /recharge/webhooks/:provider - 微信/支付宝统一支付回调适配入口
// 适配器在接入官方 SDK 后负责把回调标准化为 order_no、provider_trade_no、signature。
app.post('/webhooks/:provider', async (c) => {
  const provider = c.req.param('provider')
  if (!providers.has(provider)) return badRequest(c, '不支持的支付渠道')
  const rawBody = provider === 'alipay' ? '' : await c.req.text()
  let body: Record<string, any> = provider === 'alipay'
    ? await c.req.parseBody().catch(() => ({}))
    : (() => { try { return JSON.parse(rawBody || '{}') } catch { return {} } })()
  let wechatVerified = false
  if (provider === 'wechat' && body.resource) {
    body = await decryptWechatResource(body.resource, c.req.header('Wechatpay-Timestamp') || '', c.req.header('Wechatpay-Nonce') || '', c.req.header('Wechatpay-Signature') || '', rawBody)
    wechatVerified = true
  }
  const orderNo = String(body.order_no || '')
  const normalizedOrderNo = orderNo || String(body.out_trade_no || '')
  const tradeNo = String(body.provider_trade_no || body.trade_no || body.transaction_id || '')
  const signature = String(body.signature || body.sign || '')
  if (!normalizedOrderNo || !tradeNo || !signature) return c.json({ code: 400, message: '支付回调参数不完整' }, 400)
  if (provider === 'alipay') {
    const publicKey = (await getPlatformSetting('alipay_public_key')).replace(/\\n/g, '\n')
    if (!publicKey) return c.json({ code: 400, message: 'ALIPAY_PUBLIC_KEY 未配置' }, 400)
    const content = Object.keys(body).filter(key => !['sign', 'sign_type'].includes(key) && body[key] !== '' && body[key] != null).sort().map(key => `${key}=${body[key]}`).join('&')
    const verifier = createVerify('RSA-SHA256')
    verifier.update(content)
    verifier.end()
    if (!verifier.verify(publicKey, signature, 'base64')) return c.json({ code: 401, message: '支付宝回调签名无效' }, 401)
    if (!['TRADE_SUCCESS', 'TRADE_FINISHED'].includes(String(body.trade_status))) return c.text('success')
  } else if (!wechatVerified) {
    const secret = await getPlatformSetting('wechat_webhook_secret')
    if (!secret) return c.json({ code: 400, message: '微信回调密钥未配置' }, 400)
    const payload = `${provider}:${normalizedOrderNo}:${tradeNo}`
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return c.json({ code: 401, message: '支付回调签名无效' }, 401)
  }
  if (provider === 'wechat' && wechatVerified && String(body.trade_state) !== 'SUCCESS') return c.text('success')

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [orders] = await connection.query('SELECT * FROM recharge_orders WHERE order_no = ? FOR UPDATE', [normalizedOrderNo]) as [any[], unknown]
    const order = orders[0]
    if (!order || order.payment_provider !== provider) throw new Error('充值订单不存在')
    if (order.status === 'paid') { await connection.commit(); return provider === 'alipay' ? c.text('success') : success(c, { order_no: normalizedOrderNo, status: 'paid', idempotent: true }) }
    if (order.status !== 'pending') throw new Error('订单当前不可到账')
    if (provider === 'alipay' && Number(body.total_amount).toFixed(2) !== (Number(order.amount_fen) / 100).toFixed(2)) throw new Error('支付金额与订单金额不一致')
    if (provider === 'wechat' && Number(body.amount?.total) !== Number(order.amount_fen)) throw new Error('支付金额与订单金额不一致')
    const [accounts] = await connection.query('SELECT balance FROM credit_accounts WHERE workspace_id = ? FOR UPDATE', [order.workspace_id]) as [{ balance: number }[], unknown]
    const account = accounts[0]
    if (!account) throw new Error('积分账户不存在')
    const balanceAfter = account.balance + order.credits
    const ts = now()
    await connection.query('UPDATE credit_accounts SET balance = balance + ?, updated_at = ? WHERE workspace_id = ?', [order.credits, ts, order.workspace_id])
    await connection.query('INSERT INTO credit_ledger (workspace_id, user_id, type, amount, balance_after, reference_type, reference_id, note, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [order.workspace_id, order.user_id, 'recharge', order.credits, balanceAfter, 'recharge_order', orderNo, `充值到账 ${order.credits} 积分`, `recharge:${orderNo}`, ts])
    await connection.query('UPDATE recharge_orders SET status = \'paid\', provider_trade_no = ?, paid_at = ?, updated_at = ? WHERE order_no = ?', [tradeNo, ts, ts, orderNo])
    await connection.commit()
    return provider === 'alipay' ? c.text('success') : success(c, { order_no: normalizedOrderNo, status: 'paid', credits: order.credits })
  } catch (error: any) {
    await connection.rollback()
    return badRequest(c, error.message || '支付回调处理失败')
  } finally { connection.release() }
})

export default app

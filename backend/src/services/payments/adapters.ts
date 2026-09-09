import { createSign, randomBytes } from 'node:crypto'
import type { PaymentAdapter, PaymentIntent, PaymentOrderInput, PaymentProvider } from './types.js'
import { getPlatformSetting } from '../platform-settings.js'

function required(name: string, value: string | undefined) { if (!value) throw new Error(`${name} 未配置，暂时无法发起支付`); return value }
function signRsa(content: string, privateKey: string) { const signer = createSign('RSA-SHA256'); signer.update(content); signer.end(); return signer.sign(privateKey, 'base64') }

async function alipayQuery(input: PaymentOrderInput) {
  const appId = required('ALIPAY_APP_ID', await getPlatformSetting('alipay_app_id'))
  const privateKey = required('ALIPAY_PRIVATE_KEY', await getPlatformSetting('alipay_private_key')).replace(/\\n/g, '\n')
  const paymentNotifyUrl = required('PAYMENT_NOTIFY_URL', await getPlatformSetting('payment_notify_url'))
  const fields: Record<string, string> = {
    app_id: appId, method: 'alipay.trade.page.pay', format: 'JSON',
    return_url: await getPlatformSetting('alipay_return_url') || process.env.FRONTEND_ORIGIN || '', charset: 'utf-8', sign_type: 'RSA2',
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '), version: '1.0', notify_url: `${paymentNotifyUrl}/alipay`,
    biz_content: JSON.stringify({ out_trade_no: input.orderNo, product_code: 'FAST_INSTANT_TRADE_PAY', subject: input.description, total_amount: (input.amountFen / 100).toFixed(2) }),
  }
  const canonical = Object.keys(fields).sort().map(key => `${key}=${fields[key]}`).join('&')
  fields.sign = signRsa(canonical, privateKey)
  const gateway = process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do'
  const url = `${gateway}?${Object.entries(fields).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')}`
  return { payment_url: url, order_no: input.orderNo, amount_fen: input.amountFen }
}

async function wechatNative(input: PaymentOrderInput) {
  const mchid = required('WECHAT_MCH_ID', await getPlatformSetting('wechat_mch_id'))
  const appid = required('WECHAT_APP_ID', await getPlatformSetting('wechat_app_id'))
  const serial = required('WECHAT_SERIAL_NO', await getPlatformSetting('wechat_serial_no'))
  const privateKey = required('WECHAT_PRIVATE_KEY', await getPlatformSetting('wechat_private_key')).replace(/\\n/g, '\n')
  const paymentNotifyUrl = required('PAYMENT_NOTIFY_URL', await getPlatformSetting('payment_notify_url'))
  const nonce = randomBytes(16).toString('hex'); const timestamp = Math.floor(Date.now() / 1000).toString(); const path = '/v3/pay/transactions/native'
  const body = JSON.stringify({ appid, mchid, description: input.description, out_trade_no: input.orderNo, notify_url: `${paymentNotifyUrl}/wechat`, amount: { total: input.amountFen, currency: 'CNY' } })
  const signature = signRsa(`POST\n${path}\n${timestamp}\n${nonce}\n${body}\n`, privateKey)
  const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${serial}"`
  const response = await fetch(`https://api.mch.weixin.qq.com${path}`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: authorization }, body })
  const result = await response.json().catch(() => ({})) as any
  if (!response.ok || !result.code_url) throw new Error(result.message || `微信支付下单失败（${response.status}）`)
  return { payment_url: result.code_url, order_no: input.orderNo, amount_fen: input.amountFen }
}

class ConfigurableAdapter implements PaymentAdapter {
  constructor(public readonly provider: PaymentProvider) {}
  async createPayment(input: PaymentOrderInput): Promise<PaymentIntent> {
    try { const payload = this.provider === 'alipay' ? await alipayQuery(input) : await wechatNative(input); return { provider: this.provider, configured: true, message: '支付链接已生成', payload } }
    catch (error: any) { return { provider: this.provider, configured: false, message: error?.message || '支付参数待配置' } }
  }
}

export const paymentAdapters: Record<PaymentProvider, PaymentAdapter> = { wechat: new ConfigurableAdapter('wechat'), alipay: new ConfigurableAdapter('alipay') }

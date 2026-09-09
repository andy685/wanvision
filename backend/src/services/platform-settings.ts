import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { decryptSecret, encryptSecret } from '../utils/secret-crypto.js'

const ENV_FALLBACKS: Record<string, string> = {
  wechat_mch_id: 'WECHAT_MCH_ID', wechat_app_id: 'WECHAT_APP_ID', wechat_api_v3_key: 'WECHAT_API_V3_KEY',
  wechat_serial_no: 'WECHAT_SERIAL_NO', wechat_private_key: 'WECHAT_PRIVATE_KEY', wechat_platform_public_key: 'WECHAT_PLATFORM_PUBLIC_KEY', wechat_webhook_secret: 'WECHAT_WEBHOOK_SECRET',
  alipay_app_id: 'ALIPAY_APP_ID', alipay_private_key: 'ALIPAY_PRIVATE_KEY', alipay_public_key: 'ALIPAY_PUBLIC_KEY',
  alipay_return_url: 'ALIPAY_RETURN_URL', payment_notify_url: 'PAYMENT_NOTIFY_URL',
}

export async function getPlatformSetting(key: string) {
  const [row] = await db.select().from(schema.platformSettings).where(eq(schema.platformSettings.settingKey, key))
  if (row) return decryptSecret(row.settingValue)
  const envName = ENV_FALLBACKS[key]
  return envName ? process.env[envName] || '' : ''
}

export async function setPlatformSetting(key: string, value: string) {
  const encoded = encryptSecret(value)
  const [existing] = await db.select().from(schema.platformSettings).where(eq(schema.platformSettings.settingKey, key))
  if (existing) await db.update(schema.platformSettings).set({ settingValue: encoded, updatedAt: now() }).where(eq(schema.platformSettings.settingKey, key))
  else await db.insert(schema.platformSettings).values({ settingKey: key, settingValue: encoded, updatedAt: now() })
}

export async function paymentConfigStatus() {
  const values = await Promise.all(['wechat_mch_id', 'wechat_app_id', 'wechat_api_v3_key', 'wechat_serial_no', 'wechat_private_key', 'wechat_platform_public_key', 'payment_notify_url', 'alipay_app_id', 'alipay_private_key', 'alipay_public_key'].map(async key => [key, !!(await getPlatformSetting(key))] as const))
  const map = Object.fromEntries(values)
  const [wechatEnabled, alipayEnabled] = await Promise.all([getPlatformSetting('wechat_enabled'), getPlatformSetting('alipay_enabled')])
  const enabled = (value: string) => value !== 'false'
  return {
    wechat: enabled(wechatEnabled) && ['wechat_mch_id', 'wechat_app_id', 'wechat_api_v3_key', 'wechat_serial_no', 'wechat_private_key', 'wechat_platform_public_key', 'payment_notify_url'].every(key => map[key]),
    alipay: enabled(alipayEnabled) && ['alipay_app_id', 'alipay_private_key', 'alipay_public_key', 'payment_notify_url'].every(key => map[key]),
  }
}

export async function paymentChannelEnabled(provider: 'wechat' | 'alipay') {
  return (await getPlatformSetting(`${provider}_enabled`)) !== 'false'
}

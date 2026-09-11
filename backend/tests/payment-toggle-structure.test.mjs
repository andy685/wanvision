import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const adminRoute = readFileSync(new URL('../src/routes/admin.ts', import.meta.url), 'utf8')
const platformSettings = readFileSync(new URL('../src/services/platform-settings.ts', import.meta.url), 'utf8')

test('admin payment toggles persist common false values', () => {
  assert.match(adminRoute, /function paymentBooleanSetting\(value: unknown\)/)
  assert.match(adminRoute, /value === false \|\| value === 0/)
  assert.match(adminRoute, /\['false', '0', 'off', 'disabled', 'no'\]\.includes/)
  assert.match(adminRoute, /settingEnabled\(value\)/)
  assert.match(adminRoute, /settingEnabled\(oldValue\)/)
  assert.match(adminRoute, /PAYMENT_BOOLEAN_KEYS\.has\(key\) \? paymentBooleanSetting\(body\[key\]\)/)
})

test('frontend payment readiness honors disabled payment settings', () => {
  assert.match(platformSettings, /export function settingEnabled\(value: string\)/)
  assert.match(platformSettings, /settingEnabled\(wechatEnabled\)/)
  assert.match(platformSettings, /settingEnabled\(alipayEnabled\)/)
  assert.match(platformSettings, /return settingEnabled\(await getPlatformSetting\(`\$\{provider\}_enabled`\)\)/)
})

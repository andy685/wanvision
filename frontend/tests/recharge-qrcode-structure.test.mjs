import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const creditsPage = readFileSync(new URL('../app/pages/credits.vue', import.meta.url), 'utf8')
const rechargeApi = readFileSync(new URL('../app/api/recharge.ts', import.meta.url), 'utf8')
const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8')

test('credits page renders a local payment qr code after creating an order', () => {
  assert.match(packageJson, /"qrcode":\s*"\^1\.5\.4"/)
  assert.match(creditsPage, /import QRCode from 'qrcode'/)
  assert.match(creditsPage, /QRCode\.toDataURL/)
  assert.match(creditsPage, /result\.payload\?\.qr_code \|\| result\.payload\?\.payment_url/)
  assert.match(creditsPage, /创建支付二维码/)
  assert.match(creditsPage, /activePayment/)
})

test('credits page polls the order and refreshes credits after payment', () => {
  assert.match(rechargeApi, /RechargePaymentIntent/)
  assert.match(creditsPage, /startPaymentPolling\(order\.order_no\)/)
  assert.match(creditsPage, /latest\.status === 'paid'/)
  assert.match(creditsPage, /await reloadCredits\(\)/)
})

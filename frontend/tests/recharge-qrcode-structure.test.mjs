import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const creditsPage = readFileSync(new URL('../app/pages/credits.vue', import.meta.url), 'utf8')
const rechargeApi = readFileSync(new URL('../app/api/recharge.ts', import.meta.url), 'utf8')
const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8')

test('credits page renders a cashier or qr payment ui after creating an order', () => {
  assert.match(packageJson, /"qrcode":\s*"\^1\.5\.4"/)
  assert.match(creditsPage, /import QRCode from 'qrcode'/)
  assert.match(creditsPage, /QRCode\.toDataURL/)
  assert.match(creditsPage, /order\.payment_provider === 'alipay'/)
  assert.match(creditsPage, /cashierUrl: String\(paymentUrl\)/)
  assert.match(creditsPage, /class="alipay-cashier"/)
  assert.match(creditsPage, /scrolling="no"/)
  assert.match(creditsPage, /width: min\(300px, 100%\)/)
  assert.match(creditsPage, /width: 240px/)
  assert.match(creditsPage, /height: 240px/)
  assert.match(creditsPage, /result\.payload\?\.qr_code \|\| paymentUrl/)
  assert.match(creditsPage, /availablePaymentProviders/)
  assert.match(creditsPage, /v-for="provider in availablePaymentProviders"/)
  assert.match(creditsPage, /去支付/)
  assert.doesNotMatch(creditsPage, /打开收银台/)
  assert.doesNotMatch(creditsPage, /创建支付二维码/)
  assert.match(creditsPage, /min="0\.1"/)
  assert.match(creditsPage, /请输入至少 0\.1 元/)
  assert.match(creditsPage, /activePayment/)
})

test('credits page polls the order and refreshes credits after payment', () => {
  assert.match(rechargeApi, /RechargePaymentIntent/)
  assert.match(creditsPage, /async function refreshPaymentReady/)
  assert.match(creditsPage, /@click="openRechargeModal"/)
  assert.match(creditsPage, /await refreshPaymentReady\(\{ preferAvailable: false \}\)/)
  assert.match(creditsPage, /startPaymentPolling\(order\.order_no\)/)
  assert.match(creditsPage, /latest\.status === 'paid'/)
  assert.match(creditsPage, /await reloadCreditsPage\(\)/)
  assert.match(creditsPage, /showRecharge\.value = false/)
  assert.match(creditsPage, /toast\.success\(message\)/)
  assert.match(creditsPage, /orders\.value = await rechargeAPI\.list\(\) \|\| \[\]/)
})

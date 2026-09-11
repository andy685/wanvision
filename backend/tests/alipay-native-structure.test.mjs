import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const adapters = readFileSync(new URL('../src/services/payments/adapters.ts', import.meta.url), 'utf8')
const rechargeRoute = readFileSync(new URL('../src/routes/recharge.ts', import.meta.url), 'utf8')

test('alipay payment adapter creates native scan-code payment intents', () => {
  assert.match(adapters, /method:\s*'alipay\.trade\.precreate'/)
  assert.doesNotMatch(adapters, /method:\s*'alipay\.trade\.page\.pay'/)
  assert.match(adapters, /alipay_trade_precreate_response/)
  assert.match(adapters, /payload\.qr_code/)
  assert.match(adapters, /qr_code:\s*payload\.qr_code/)
})

test('alipay webhook credits the normalized out_trade_no order once', () => {
  assert.match(rechargeRoute, /const normalizedOrderNo = orderNo \|\| String\(body\.out_trade_no \|\| ''\)/)
  assert.match(rechargeRoute, /`recharge:\$\{normalizedOrderNo\}`/)
  assert.match(rechargeRoute, /WHERE order_no = \?', \[tradeNo, ts, ts, normalizedOrderNo\]/)
})

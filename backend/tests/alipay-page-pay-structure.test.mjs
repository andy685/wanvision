import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const adapters = readFileSync(new URL('../src/services/payments/adapters.ts', import.meta.url), 'utf8')
const rechargeRoute = readFileSync(new URL('../src/routes/recharge.ts', import.meta.url), 'utf8')

test('alipay payment adapter creates signed computer website payment urls', () => {
  assert.match(adapters, /method:\s*'alipay\.trade\.page\.pay'/)
  assert.doesNotMatch(adapters, /method:\s*'alipay\.trade\.precreate'/)
  assert.match(adapters, /product_code:\s*'FAST_INSTANT_TRADE_PAY'/)
  assert.match(adapters, /qr_pay_mode:\s*'4'/)
  assert.match(adapters, /qrcode_width:\s*240/)
  assert.match(adapters, /payment_url:\s*url/)
  assert.match(adapters, /fields\.return_url = returnUrl/)
})

test('alipay webhook credits the normalized out_trade_no order once', () => {
  assert.match(rechargeRoute, /const normalizedOrderNo = orderNo \|\| String\(body\.out_trade_no \|\| ''\)/)
  assert.match(rechargeRoute, /`recharge:\$\{normalizedOrderNo\}`/)
  assert.match(rechargeRoute, /WHERE order_no = \?', \[tradeNo, ts, ts, normalizedOrderNo\]/)
})

test('recharge order minimum amount is below one yuan', () => {
  assert.match(rechargeRoute, /amountFen < 10/)
  assert.match(rechargeRoute, /充值金额不能低于 0\.1 元/)
  assert.doesNotMatch(rechargeRoute, /amountFen < 100/)
  assert.doesNotMatch(rechargeRoute, /请输入至少 1 元|不能低于 1 元/)
})

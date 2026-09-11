import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const ordersPage = readFileSync(new URL('../src/views/wanying/orders.vue', import.meta.url), 'utf8')
const constants = readFileSync(new URL('../src/views/wanying/utils/constants.ts', import.meta.url), 'utf8')

test('admin recharge orders page hides refund action', () => {
  assert.doesNotMatch(ordersPage, /refundOrder/)
  assert.doesNotMatch(ordersPage, /\/refund/)
  assert.doesNotMatch(ordersPage, />退款</)
  assert.doesNotMatch(ordersPage, /确认退款|退款成功|退款失败/)
  assert.doesNotMatch(ordersPage, /ElTableColumn label="操作"/)
  assert.match(constants, /查看充值订单和到账状态/)
})

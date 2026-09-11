import { api } from './client'
import type { RechargeOrder, RechargePaymentIntent } from './types'

export const rechargeAPI = {
  create: (amount: number, paymentProvider: 'wechat' | 'alipay') =>
    api.post<RechargeOrder>('/recharge/orders', { amount, payment_provider: paymentProvider }),
  list: () => api.get<RechargeOrder[]>('/recharge/orders'),
  get: (orderNo: string) => api.get<RechargeOrder>(`/recharge/orders/${orderNo}`),
  pay: (orderNo: string) => api.post<RechargePaymentIntent>(`/recharge/orders/${orderNo}/pay`),
}

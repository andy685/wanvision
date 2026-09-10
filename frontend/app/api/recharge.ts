import { api } from './client'
import type { RechargeOrder } from './types'

export const rechargeAPI = {
  create: (amount: number, paymentProvider: 'wechat' | 'alipay') =>
    api.post<RechargeOrder>('/recharge/orders', { amount, payment_provider: paymentProvider }),
  list: () => api.get<RechargeOrder[]>('/recharge/orders'),
  get: (orderNo: string) => api.get<RechargeOrder>(`/recharge/orders/${orderNo}`),
  pay: (orderNo: string) => api.post<{ payment_url?: string }>(`/recharge/orders/${orderNo}/pay`),
}

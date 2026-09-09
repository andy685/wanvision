export type PaymentProvider = 'wechat' | 'alipay'

export interface PaymentOrderInput {
  orderNo: string
  amountFen: number
  description: string
}

export interface PaymentIntent {
  provider: PaymentProvider
  configured: boolean
  message: string
  payload?: Record<string, unknown>
}

export interface PaymentAdapter {
  readonly provider: PaymentProvider
  createPayment(input: PaymentOrderInput): Promise<PaymentIntent>
}

import { api } from './client'
import type { PricingItem } from './types'

export const pricingAPI = {
  list: () => api.get<PricingItem[]>('/pricing'),
  quote: (action: string, quantity = 1) =>
    api.post<{ price: number }>('/pricing/quote', { action, quantity }),
}

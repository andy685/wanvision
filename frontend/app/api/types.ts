export interface User {
  id: number
  phone: string
  nickname: string
  avatar: string
  role: string
  balance: number
  status: 'active' | 'disabled'
  created_at?: string
  last_active_at?: string
}

export interface Workspace {
  id: number
  name: string
  type: 'personal' | 'enterprise'
  role: 'owner' | 'admin' | 'creator' | 'viewer'
  balance: number
}

export interface Drama {
  id: number
  title: string
  description?: string
  cover?: string
  status?: string
  created_at?: string
  updated_at?: string
}

export interface Episode {
  id: number
  drama_id: number
  title: string
  episode_number: number
  status?: string
}

export interface Character {
  id: number
  episode_id: number
  name: string
  description?: string
  image_url?: string
}

export interface Scene {
  id: number
  episode_id: number
  description?: string
  image_url?: string
}

export interface Prop {
  id: number
  episode_id: number
  name: string
  description?: string
  image_url?: string
}

export interface Storyboard {
  id: number
  episode_id: number
  description?: string
  video_url?: string
}

export interface Task {
  id: number
  type: 'image' | 'video' | 'text'
  drama_id?: number
  episode_id?: number
  storyboard_id?: number
  model?: string
  credit_cost: number
  credit_status: 'none' | 'pending' | 'frozen' | 'settled' | 'charged' | 'refunded'
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  created_at: string
}

export interface RechargeOrder {
  order_no: string
  user_id: number
  amount: number
  credits: number
  status: 'pending' | 'paid' | 'refunded'
  payment_provider?: 'wechat' | 'alipay'
  created_at: string
}

export interface PricingItem {
  id: number
  action: string
  service_type?: 'text' | 'image' | 'video'
  price: number
  unit?: string
  is_active: boolean
}

export interface AIConfig {
  id: number
  name: string
  service_type: 'text' | 'image' | 'video'
  provider: string
  base_url: string
  model: string[]
  priority: number
  is_active: boolean
}

export interface StylePreset {
  id: number
  name: string
  preview_url?: string
  is_active?: boolean
}

export interface Skill {
  id: string
  name: string
  description?: string
  content?: string
}

export interface Prompt {
  type: string
  content: string
}

export interface UploadResult {
  url: string
  path: string
}

export interface ApiResponse<T = unknown> {
  code?: number
  message?: string
  data?: T
}

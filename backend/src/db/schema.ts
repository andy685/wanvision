/**
 * Drizzle schema - MySQL column mappings.
 */
import { mysqlTable, text, int, double, boolean, primaryKey, unique, varchar } from 'drizzle-orm/mysql-core'

export const dramas = mysqlTable('dramas', {
  id: int('id').primaryKey().autoincrement(),
  workspaceId: int('workspace_id'),
  title: text('title').notNull(),
  description: text('description'),
  genre: text('genre'),
  style: varchar('style', { length: 64 }).default('3d'),
  aspectRatio: varchar('aspect_ratio', { length: 16 }).default('16:9'),
  totalEpisodes: int('total_episodes').default(1),
  totalDuration: int('total_duration').default(0),
  status: varchar('status', { length: 64 }).notNull().default('draft'),
  thumbnail: text('thumbnail'),
  tags: text('tags'),
  metadata: text('metadata'),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
  updatedAt: varchar('updated_at', { length: 64 }).notNull(),
  deletedAt: varchar('deleted_at', { length: 64 }),
})

export const episodes = mysqlTable('episodes', {
  id: int('id').primaryKey().autoincrement(),
  dramaId: int('drama_id').notNull(),
  episodeNumber: int('episode_number').notNull(),
  title: text('title').notNull(),
  content: text('content'),
  scriptContent: text('script_content'),
  description: text('description'),
  duration: int('duration').default(0),
  status: varchar('status', { length: 64 }).default('draft'),
  videoUrl: text('video_url'),
  thumbnail: text('thumbnail'),
  imageConfigId: int('image_config_id'),
  videoConfigId: int('video_config_id'),
  resolution: varchar('resolution', { length: 16 }).default('720p'),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
  updatedAt: varchar('updated_at', { length: 64 }).notNull(),
  deletedAt: varchar('deleted_at', { length: 64 }),
})

export const characters = mysqlTable('characters', {
  id: int('id').primaryKey().autoincrement(),
  dramaId: int('drama_id').notNull(),
  name: text('name').notNull(),
  role: text('role'),
  description: text('description'),
  appearance: text('appearance'),
  styling: text('styling'),
  finalPrompt: text('final_prompt'),
  personality: text('personality'),
  imageUrl: text('image_url'),
  referenceImages: text('reference_images'),
  seedValue: text('seed_value'),
  sortOrder: int('sort_order'),
  localPath: text('local_path'),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
  updatedAt: varchar('updated_at', { length: 64 }).notNull(),
  deletedAt: varchar('deleted_at', { length: 64 }),
})

// Episode-Character many-to-many
export const episodeCharacters = mysqlTable('episode_characters', {
  id: int('id').primaryKey().autoincrement(),
  episodeId: int('episode_id').notNull(),
  characterId: int('character_id').notNull(),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
})

// Episode-Scene many-to-many
export const episodeScenes = mysqlTable('episode_scenes', {
  id: int('id').primaryKey().autoincrement(),
  episodeId: int('episode_id').notNull(),
  sceneId: int('scene_id').notNull(),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
})

// Episode-Prop many-to-many
export const episodeProps = mysqlTable('episode_props', {
  id: int('id').primaryKey().autoincrement(),
  episodeId: int('episode_id').notNull(),
  propId: int('prop_id').notNull(),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
})

export const scenes = mysqlTable('scenes', {
  id: int('id').primaryKey().autoincrement(),
  dramaId: int('drama_id').notNull(),
  episodeId: int('episode_id'),
  location: text('location').notNull(),
  time: varchar('time', { length: 64 }).notNull(),
  prompt: text('prompt').notNull(),
  lighting: text('lighting'),
  finalPrompt: text('final_prompt'),
  storyboardCount: int('storyboard_count').default(1),
  imageUrl: text('image_url'),
  status: varchar('status', { length: 64 }).default('pending'),
  localPath: text('local_path'),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
  updatedAt: varchar('updated_at', { length: 64 }).notNull(),
  deletedAt: varchar('deleted_at', { length: 64 }),
})

export const storyboards = mysqlTable('storyboards', {
  id: int('id').primaryKey().autoincrement(),
  episodeId: int('episode_id').notNull(),
  sceneId: int('scene_id'),
  storyboardNumber: int('storyboard_number').notNull(),
  title: text('title'),
  location: text('location'),
  time: varchar('time', { length: 64 }),
  shotType: text('shot_type'),
  angle: text('angle'),
  movement: text('movement'),
  result: text('result'),
  atmosphere: text('atmosphere'),
  imagePrompt: text('image_prompt'),
  videoPrompt: text('video_prompt'),
  bgmPrompt: text('bgm_prompt'),
  soundEffect: text('sound_effect'),
  description: text('description'),
  duration: int('duration').default(0),
  composedImage: text('composed_image'),
  firstFrameImage: text('first_frame_image'),
  lastFrameImage: text('last_frame_image'),
  referenceImages: text('reference_images'),
  videoUrl: text('video_url'),
  subtitleUrl: text('subtitle_url'),
  composedVideoUrl: text('composed_video_url'),
  status: varchar('status', { length: 64 }).default('pending'),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
  updatedAt: varchar('updated_at', { length: 64 }).notNull(),
  deletedAt: varchar('deleted_at', { length: 64 }),
})

export const storyboardCharacters = mysqlTable('storyboard_characters', {
  storyboardId: int('storyboard_id').notNull(),
  characterId: int('character_id').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.storyboardId, table.characterId] }),
}))

export const storyboardProps = mysqlTable('storyboard_props', {
  storyboardId: int('storyboard_id').notNull(),
  propId: int('prop_id').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.storyboardId, table.propId] }),
}))

export const aiServiceConfigs = mysqlTable('ai_service_configs', {
  id: int('id').primaryKey().autoincrement(),
  serviceType: varchar('service_type', { length: 64 }).notNull(),
  provider: varchar('provider', { length: 64 }),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  apiKey: text('api_key').notNull(),
  model: text('model'),
  endpoint: text('endpoint'),
  queryEndpoint: text('query_endpoint'),
  priority: int('priority').default(0),
  isDefault: boolean('is_default').default(false),
  isActive: boolean('is_active').default(true),
  settings: text('settings'),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
  updatedAt: varchar('updated_at', { length: 64 }).notNull(),
  // 注意: 此表无 deleted_at
})

export const aiServiceProviders = mysqlTable('ai_service_providers', {
  id: int('id').primaryKey().autoincrement(),
  name: text('name').notNull(),
  displayName: text('display_name'),
  serviceType: varchar('service_type', { length: 64 }).notNull(),
  provider: varchar('provider', { length: 64 }).notNull(),
  defaultUrl: text('default_url'),
  presetModels: text('preset_models'),
  description: text('description'),
  isActive: boolean('is_active').default(true),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
  updatedAt: varchar('updated_at', { length: 64 }).notNull(),
})

export const stylePresets = mysqlTable('style_presets', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 64 }).notNull(),
  value: varchar('value', { length: 64 }).notNull(),
  prompt: text('prompt').notNull(),
  description: text('description'),
  sortOrder: int('sort_order').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
  updatedAt: varchar('updated_at', { length: 64 }).notNull(),
  // 注意: 此表无 deleted_at（硬删除），value 列有唯一索引（见 DDL）
})

// 统一生成任务表：图片/视频生成共用，type 区分，生成参数存 params(JSON)
export const sysTask = mysqlTable('sys_task', {
  id: int('id').primaryKey().autoincrement(),
  type: varchar('type', { length: 16 }).notNull(), // image | video
  storyboardId: int('storyboard_id'),
  dramaId: int('drama_id'),
  sceneId: int('scene_id'),
  characterId: int('character_id'),
  propId: int('prop_id'),
  provider: varchar('provider', { length: 64 }),
  prompt: text('prompt'),
  model: text('model'),
  // image: {size, frameType, referenceImages[]}
  // video: {referenceMode, referenceImageUrls[], referenceVideoUrls[], referenceAudioUrls[], generateAudio, duration, aspectRatio}
  params: text('params'),
  taskId: text('task_id'),
  resultUrl: text('result_url'),
  localPath: text('local_path'),
  creditCost: int('credit_cost').notNull().default(0),
  creditStatus: varchar('credit_status', { length: 32 }).default('none'),
  creditWorkspaceId: int('credit_workspace_id'),
  creditUserId: int('credit_user_id'),
  status: varchar('status', { length: 64 }).default('processing'),
  errorMsg: text('error_msg'),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
  updatedAt: varchar('updated_at', { length: 64 }).notNull(),
  completedAt: varchar('completed_at', { length: 64 }),
})

export const videoMerges = mysqlTable('video_merges', {
  id: int('id').primaryKey().autoincrement(),
  episodeId: int('episode_id'),
  dramaId: int('drama_id'),
  title: text('title'),
  provider: varchar('provider', { length: 64 }),
  model: text('model'),
  status: varchar('status', { length: 64 }).default('pending'),
  scenes: text('scenes'), // JSON
  mergedUrl: text('merged_url'),
  duration: int('duration'),
  taskId: text('task_id'),
  errorMsg: text('error_msg'),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
  completedAt: varchar('completed_at', { length: 64 }),
  deletedAt: varchar('deleted_at', { length: 64 }),
})

export const props = mysqlTable('props', {
  id: int('id').primaryKey().autoincrement(),
  dramaId: int('drama_id').notNull(),
  name: text('name').notNull(),
  type: text('type'),
  description: text('description'),
  prompt: text('prompt'),
  finalPrompt: text('final_prompt'),
  imageUrl: text('image_url'),
  referenceImages: text('reference_images'),
  localPath: text('local_path'),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
  updatedAt: varchar('updated_at', { length: 64 }).notNull(),
  deletedAt: varchar('deleted_at', { length: 64 }),
})

export const assets = mysqlTable('assets', {
  id: int('id').primaryKey().autoincrement(),
  dramaId: int('drama_id'),
  episodeId: int('episode_id'),
  storyboardId: int('storyboard_id'),
  storyboardNum: int('storyboard_num'),
  name: text('name'),
  description: text('description'),
  type: text('type'),
  category: text('category'),
  url: text('url'),
  thumbnailUrl: text('thumbnail_url'),
  localPath: text('local_path'),
  fileSize: int('file_size'),
  mimeType: text('mime_type'),
  width: int('width'),
  height: int('height'),
  duration: int('duration'),
  format: text('format'),
  imageGenId: int('image_gen_id'),
  videoGenId: int('video_gen_id'),
  isFavorite: boolean('is_favorite').default(false),
  viewCount: int('view_count').default(0),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
  updatedAt: varchar('updated_at', { length: 64 }).notNull(),
  deletedAt: varchar('deleted_at', { length: 64 }),
})

export const users = mysqlTable('users', {
  id: int('id').primaryKey().autoincrement(),
  phone: varchar('phone', { length: 32 }).notNull(),
  nickname: varchar('nickname', { length: 64 }),
  avatar: text('avatar'),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 32 }).notNull().default('user'),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
  updatedAt: varchar('updated_at', { length: 64 }).notNull(),
})

export const adminUsers = mysqlTable('admin_users', {
  id: int('id').primaryKey().autoincrement(),
  username: varchar('username', { length: 64 }).notNull().default('admin'),
  phone: varchar('phone', { length: 32 }).notNull(),
  nickname: varchar('nickname', { length: 64 }),
  avatar: text('avatar'),
  email: varchar('email', { length: 128 }),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 32 }).notNull().default('super_admin'),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
  updatedAt: varchar('updated_at', { length: 64 }).notNull(),
})

export const adminSessions = mysqlTable('admin_sessions', {
  id: int('id').primaryKey().autoincrement(),
  adminUserId: int('admin_user_id').notNull(),
  tokenHash: varchar('token_hash', { length: 128 }).notNull(),
  expiresAt: varchar('expires_at', { length: 64 }).notNull(),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
})

export const userSessions = mysqlTable('user_sessions', {
  id: int('id').primaryKey().autoincrement(),
  userId: int('user_id').notNull(),
  tokenHash: varchar('token_hash', { length: 128 }).notNull(),
  expiresAt: varchar('expires_at', { length: 64 }).notNull(),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
})

export const passwordResetTokens = mysqlTable('password_reset_tokens', {
  id: int('id').primaryKey().autoincrement(),
  userId: int('user_id').notNull(),
  codeHash: varchar('code_hash', { length: 128 }).notNull(),
  expiresAt: varchar('expires_at', { length: 64 }).notNull(),
  usedAt: varchar('used_at', { length: 64 }),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
})

export const workspaces = mysqlTable('workspaces', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 128 }).notNull(),
  type: varchar('type', { length: 32 }).notNull().default('personal'),
  ownerUserId: int('owner_user_id').notNull(),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
  updatedAt: varchar('updated_at', { length: 64 }).notNull(),
})

export const workspaceMembers = mysqlTable('workspace_members', {
  id: int('id').primaryKey().autoincrement(),
  workspaceId: int('workspace_id').notNull(),
  userId: int('user_id').notNull(),
  role: varchar('role', { length: 32 }).notNull().default('creator'),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
})

export const dramaMembers = mysqlTable('drama_members', {
  id: int('id').primaryKey().autoincrement(),
  dramaId: int('drama_id').notNull(),
  userId: int('user_id').notNull(),
  role: varchar('role', { length: 32 }).notNull().default('creator'),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
})

export const creditAccounts = mysqlTable('credit_accounts', {
  id: int('id').primaryKey().autoincrement(),
  workspaceId: int('workspace_id').notNull(),
  balance: int('balance').notNull().default(0),
  frozen: int('frozen').notNull().default(0),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
  updatedAt: varchar('updated_at', { length: 64 }).notNull(),
})

export const creditLedger = mysqlTable('credit_ledger', {
  id: int('id').primaryKey().autoincrement(),
  workspaceId: int('workspace_id').notNull(),
  userId: int('user_id'),
  type: varchar('type', { length: 32 }).notNull(),
  amount: int('amount').notNull(),
  balanceAfter: int('balance_after').notNull(),
  referenceType: varchar('reference_type', { length: 64 }),
  referenceId: varchar('reference_id', { length: 128 }),
  note: text('note'),
  idempotencyKey: varchar('idempotency_key', { length: 128 }),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
})

export const pricingRules = mysqlTable('pricing_rules', {
  id: int('id').primaryKey().autoincrement(),
  action: varchar('action', { length: 64 }).notNull(),
  serviceType: varchar('service_type', { length: 32 }).notNull(),
  provider: varchar('provider', { length: 64 }),
  model: varchar('model', { length: 255 }),
  params: text('params'),
  price: int('price').notNull(),
  unit: varchar('unit', { length: 32 }).notNull().default('task'),
  isActive: boolean('is_active').default(true),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
  updatedAt: varchar('updated_at', { length: 64 }).notNull(),
})

export const rechargeOrders = mysqlTable('recharge_orders', {
  id: int('id').primaryKey().autoincrement(),
  orderNo: varchar('order_no', { length: 64 }).notNull(),
  userId: int('user_id').notNull(),
  workspaceId: int('workspace_id').notNull(),
  paymentProvider: varchar('payment_provider', { length: 32 }).notNull(),
  amountFen: int('amount_fen').notNull(),
  credits: int('credits').notNull(),
  status: varchar('status', { length: 32 }).notNull().default('pending'),
  providerTradeNo: varchar('provider_trade_no', { length: 128 }),
  paidAt: varchar('paid_at', { length: 64 }),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
  updatedAt: varchar('updated_at', { length: 64 }).notNull(),
})

export const adminAuditLogs = mysqlTable('admin_audit_logs', {
  id: int('id').primaryKey().autoincrement(),
  adminUserId: int('admin_user_id').notNull(),
  action: varchar('action', { length: 64 }).notNull(),
  targetType: varchar('target_type', { length: 64 }),
  targetId: varchar('target_id', { length: 128 }),
  detail: text('detail'),
  createdAt: varchar('created_at', { length: 64 }).notNull(),
})

export const platformSettings = mysqlTable('platform_settings', {
  id: int('id').primaryKey().autoincrement(),
  settingKey: varchar('setting_key', { length: 128 }).notNull(),
  settingValue: text('setting_value').notNull(),
  updatedAt: varchar('updated_at', { length: 64 }).notNull(),
}, (table) => ({
  uniqueKey: unique('uk_platform_settings_key').on(table.settingKey),
}))

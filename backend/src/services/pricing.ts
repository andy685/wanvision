import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'

const fallback: Record<string, number> = {
  character_image: 8, scene_image: 6, prop_image: 5,
  video: 5,  // 5 credits per second
  script_rewrite: 2, asset_extract: 2, storyboard_break: 3,
  character_prompt: 1, scene_prompt: 1, prop_prompt: 1, video_prompt: 1,
}

export function isVideoGenerationAction(action: string) {
  return action === 'video' || /^video_\d+s$/.test(action)
}

export async function getPrice(action: string, duration?: number) {
  if (isVideoGenerationAction(action)) {
    const seconds = Math.max(1, Math.floor(Number(duration) || Number(action.match(/^video_(\d+)s$/)?.[1]) || 0))
    const exactAction = seconds ? `video_${seconds}s` : action
    const rows = await db.select({ action: schema.pricingRules.action, price: schema.pricingRules.price, isActive: schema.pricingRules.isActive })
      .from(schema.pricingRules)

    const perSecondRule = rows.find(row => row.action === 'video')
    if (perSecondRule) return perSecondRule.isActive === false ? 0 : (seconds ? perSecondRule.price * seconds : perSecondRule.price)

    const exactRule = rows.find(row => row.action === exactAction)
    if (exactRule) return exactRule.isActive === false ? 0 : exactRule.price

    if (fallback[exactAction] !== undefined) return fallback[exactAction]
    return seconds ? (fallback.video ?? 0) * seconds : fallback.video ?? 0
  }
  
  const [rule] = await db.select({ price: schema.pricingRules.price, isActive: schema.pricingRules.isActive }).from(schema.pricingRules)
    .where(eq(schema.pricingRules.action, action))
  if (rule) return rule.isActive === false ? 0 : rule.price
  return fallback[action] ?? 0
}

export function videoActionForDuration(duration: number) {
  return 'video'
}

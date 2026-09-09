import { eq, and } from 'drizzle-orm'
import { db, schema } from '../db/index.js'

const fallback: Record<string, number> = {
  character_image: 8, scene_image: 6, prop_image: 5,
  video: 5,  // 5 credits per second
  script_rewrite: 2, asset_extract: 2, storyboard_break: 3,
  character_prompt: 1, scene_prompt: 1, prop_prompt: 1, video_prompt: 1,
}

export async function getPrice(action: string, duration?: number) {
  if (action.startsWith('video_')) {
    // For backward compatibility, map old video_4s, video_8s, etc. to 'video' and calculate price
    const baseAction = 'video';
    const [rule] = await db.select({ price: schema.pricingRules.price }).from(schema.pricingRules)
      .where(and(eq(schema.pricingRules.action, baseAction), eq(schema.pricingRules.isActive, true)))
    const pricePerSecond = rule?.price ?? fallback[baseAction] ?? 0;
    
    // Calculate price based on duration if provided, otherwise return per-second price
    if (duration !== undefined) {
      return pricePerSecond * duration;
    }
    return pricePerSecond;
  }
  
  const [rule] = await db.select({ price: schema.pricingRules.price }).from(schema.pricingRules)
    .where(and(eq(schema.pricingRules.action, action), eq(schema.pricingRules.isActive, true)))
  return rule?.price ?? fallback[action] ?? 0
}

export function videoActionForDuration(duration: number) {
  return 'video'  // Always return 'video' action, pricing calculation handles duration
}

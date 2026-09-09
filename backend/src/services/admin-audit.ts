import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'

export async function logAdminAction(adminUserId: number, action: string, targetType: string, targetId: string | number, detail: Record<string, unknown> = {}) {
  await db.insert(schema.adminAuditLogs).values({ adminUserId, action, targetType, targetId: String(targetId), detail: JSON.stringify(detail), createdAt: now() })
}

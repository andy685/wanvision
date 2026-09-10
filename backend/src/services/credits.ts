import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db, pool, schema } from '../db/index.js'
import { now } from '../utils/response.js'

export async function workspaceForToken(token: string, requestedWorkspaceId?: number) {
  if (!token) return null
  const digest = createHash('sha256').update(token).digest('hex')
  const [row] = await db.select({ userId: schema.userSessions.userId, workspaceId: schema.workspaceMembers.workspaceId })
    .from(schema.userSessions)
    .innerJoin(schema.workspaceMembers, eq(schema.workspaceMembers.userId, schema.userSessions.userId))
    .where(requestedWorkspaceId
      ? and(eq(schema.userSessions.tokenHash, digest), eq(schema.workspaceMembers.workspaceId, requestedWorkspaceId))
      : eq(schema.userSessions.tokenHash, digest))
  return row || null
}

export async function reserveCredits(workspaceId: number, userId: number, amount: number, referenceId: string, note?: string) {
  if (amount <= 0) return
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.query('SELECT balance FROM credit_accounts WHERE workspace_id = ? FOR UPDATE', [workspaceId]) as [{ balance: number }[], unknown]
    const account = rows[0]
    if (!account || account.balance < amount) throw new Error(`积分不足，还需要 ${amount - (account?.balance || 0)} 积分`)
    const balanceAfter = account.balance - amount
    await connection.query('UPDATE credit_accounts SET balance = balance - ?, frozen = frozen + ?, updated_at = ? WHERE workspace_id = ?', [amount, amount, now(), workspaceId])
    await connection.query('INSERT INTO credit_ledger (workspace_id, user_id, type, amount, balance_after, reference_type, reference_id, note, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [workspaceId, userId, 'freeze', -amount, balanceAfter, 'task', referenceId, note || `冻结 ${amount} 积分`, `freeze:${referenceId}`, now()])
    await connection.commit()
  } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
}

// For non-sys_task Agent jobs, keep the same freeze/settle/refund lifecycle.
export async function settleReservedCredits(workspaceId: number, amount: number, referenceId: string, userId: number, completed: boolean, note: string) {
  if (amount <= 0) return
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.query('SELECT balance, frozen FROM credit_accounts WHERE workspace_id = ? FOR UPDATE', [workspaceId]) as [{ balance: number; frozen: number }[], unknown]
    const account = rows[0]
    if (!account) throw new Error('积分账户不存在')
    const refund = completed ? 0 : amount
    const balanceAfter = account.balance + refund
    await connection.query('UPDATE credit_accounts SET balance = balance + ?, frozen = frozen - ?, updated_at = ? WHERE workspace_id = ?', [refund, amount, now(), workspaceId])
    await connection.query('INSERT INTO credit_ledger (workspace_id, user_id, type, amount, balance_after, reference_type, reference_id, note, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [workspaceId, userId, completed ? 'consume' : 'refund', completed ? -amount : amount, balanceAfter, 'agent', referenceId, note, `${completed ? 'consume' : 'refund'}:${referenceId}`, now()])
    await connection.commit()
  } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
}

export async function settleCredits(taskId: number, completed: boolean) {
  const [task] = await db.select().from(schema.sysTask).where(eq(schema.sysTask.id, taskId))
  if (!task || task.creditStatus !== 'frozen' || !task.creditWorkspaceId || !task.creditCost) return
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.query('SELECT balance FROM credit_accounts WHERE workspace_id = ? FOR UPDATE', [task.creditWorkspaceId]) as [{ balance: number }[], unknown]
    const account = rows[0]
    if (!account) throw new Error('积分账户不存在')
    const refund = completed ? 0 : task.creditCost
    const balanceAfter = account.balance + refund
    await connection.query('UPDATE credit_accounts SET balance = balance + ?, frozen = frozen - ?, updated_at = ? WHERE workspace_id = ?', [refund, task.creditCost, now(), task.creditWorkspaceId])
    await connection.query('INSERT INTO credit_ledger (workspace_id, user_id, type, amount, balance_after, reference_type, reference_id, note, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [task.creditWorkspaceId, task.creditUserId, completed ? 'consume' : 'refund', completed ? -task.creditCost : task.creditCost, balanceAfter, 'task', String(taskId), completed ? `生成任务扣除 ${task.creditCost} 积分` : `生成失败退还 ${task.creditCost} 积分`, `${completed ? 'consume' : 'refund'}:${taskId}`, now()])
    await connection.commit()
    await db.update(schema.sysTask).set({ creditStatus: completed ? 'settled' : 'refunded', updatedAt: now() }).where(eq(schema.sysTask.id, taskId))
  } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
}

export async function consumeCredits(workspaceId: number, userId: number, amount: number, referenceId: string, note: string) {
  if (amount <= 0) return
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.query('SELECT balance FROM credit_accounts WHERE workspace_id = ? FOR UPDATE', [workspaceId]) as [{ balance: number }[], unknown]
    const account = rows[0]
    if (!account || account.balance < amount) throw new Error(`积分不足，还需要 ${amount - (account?.balance || 0)} 积分`)
    const balanceAfter = account.balance - amount
    await connection.query('UPDATE credit_accounts SET balance = balance - ?, updated_at = ? WHERE workspace_id = ?', [amount, now(), workspaceId])
    await connection.query('INSERT INTO credit_ledger (workspace_id, user_id, type, amount, balance_after, reference_type, reference_id, note, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [workspaceId, userId, 'consume', -amount, balanceAfter, 'agent', referenceId, note, `consume:${referenceId}`, now()])
    await connection.commit()
  } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
}

export async function adjustCredits(workspaceId: number, operatorId: number, amount: number, note: string) {
  if (!Number.isInteger(amount) || amount === 0) throw new Error('调账积分必须是非零整数')
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.query('SELECT balance FROM credit_accounts WHERE workspace_id = ? FOR UPDATE', [workspaceId]) as [{ balance: number }[], unknown]
    const account = rows[0]
    if (!account) throw new Error('积分账户不存在')
    const balanceAfter = account.balance + amount
    if (balanceAfter < 0) throw new Error('扣除后积分余额不能低于 0')
    const referenceId = `admin:${operatorId}:${Date.now()}`
    await connection.query('UPDATE credit_accounts SET balance = ?, updated_at = ? WHERE workspace_id = ?', [balanceAfter, now(), workspaceId])
    await connection.query('INSERT INTO credit_ledger (workspace_id, user_id, type, amount, balance_after, reference_type, reference_id, note, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [workspaceId, operatorId, 'admin_adjust', amount, balanceAfter, 'admin', referenceId, note, `admin_adjust:${referenceId}`, now()])
    await connection.commit()
    return balanceAfter
  } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
}

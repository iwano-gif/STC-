import { Hono } from 'hono'
import { verifyToken, generateId, hasRole } from '../utils/helpers'

type Bindings = { DB: D1Database }

async function getUser(c: any) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  return await verifyToken(authHeader.substring(7))
}

export const approvalRoutes = new Hono<{ Bindings: Bindings }>()

// 承認
approvalRoutes.post('/approve', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: '認証が必要です' }, 401)

  const { stepId, comment } = await c.req.json()
  if (!stepId) return c.json({ error: 'ステップIDが必要です' }, 400)

  // Get the step
  const step = await c.env.DB.prepare(
    'SELECT * FROM approval_steps WHERE id = ? AND approver_id = ? AND status = ?'
  ).bind(stepId, user.userId, 'waiting').first()

  if (!step) return c.json({ error: 'この承認ステップは操作できません' }, 400)

  // Get the request
  const request = await c.env.DB.prepare(
    'SELECT * FROM requests WHERE id = ? AND status = ?'
  ).bind(step.request_id, 'pending').first()

  if (!request) return c.json({ error: '対象の申請が見つかりません' }, 400)

  // Verify previous steps are all approved or skipped
  const prevSteps = await c.env.DB.prepare(
    `SELECT * FROM approval_steps 
     WHERE request_id = ? AND version = ? AND step_order < ? AND status NOT IN ('approved', 'skipped')`
  ).bind(step.request_id, step.version, step.step_order).all()

  if (prevSteps.results && prevSteps.results.length > 0) {
    return c.json({ error: '前のステップが完了していません' }, 400)
  }

  // Approve with optimistic locking
  const result = await c.env.DB.prepare(
    `UPDATE approval_steps SET status = 'approved', comment = ?, decided_at = datetime('now')
     WHERE id = ? AND status = 'waiting' AND approver_id = ?`
  ).bind(comment || null, stepId, user.userId).run()

  if (!result.meta.changes || result.meta.changes === 0) {
    return c.json({ error: 'このステップは既に処理されています' }, 409)
  }

  // Check if there are more steps
  const nextStep = await c.env.DB.prepare(
    `SELECT * FROM approval_steps 
     WHERE request_id = ? AND version = ? AND step_order > ? AND status = 'waiting'
     ORDER BY step_order ASC LIMIT 1`
  ).bind(step.request_id, step.version, step.step_order).first()

  if (nextStep) {
    // Update current_step
    await c.env.DB.prepare(
      "UPDATE requests SET current_step = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(nextStep.step_order, step.request_id).run()
  } else {
    // All steps completed - mark request as completed
    await c.env.DB.prepare(
      "UPDATE requests SET status = 'completed', updated_at = datetime('now') WHERE id = ?"
    ).bind(step.request_id).run()
  }

  // Audit log
  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_table, target_id, detail)
     VALUES (?, ?, 'step_approved', 'approval_steps', ?, ?)`
  ).bind(generateId(), user.userId, stepId, JSON.stringify({
    request_id: step.request_id,
    step_order: step.step_order,
    comment: comment || null
  })).run()

  return c.json({ 
    message: nextStep ? '承認しました。次の承認者に回付されます。' : '最終承認が完了しました。',
    completed: !nextStep
  })
})

// 差戻し
approvalRoutes.post('/reject', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: '認証が必要です' }, 401)

  const { stepId, comment } = await c.req.json()
  if (!stepId) return c.json({ error: 'ステップIDが必要です' }, 400)
  if (!comment || comment.trim().length === 0) {
    return c.json({ error: '差戻し理由を入力してください' }, 400)
  }

  const step = await c.env.DB.prepare(
    'SELECT * FROM approval_steps WHERE id = ? AND approver_id = ? AND status = ?'
  ).bind(stepId, user.userId, 'waiting').first()

  if (!step) return c.json({ error: 'この承認ステップは操作できません' }, 400)

  const request = await c.env.DB.prepare(
    'SELECT * FROM requests WHERE id = ? AND status = ?'
  ).bind(step.request_id, 'pending').first()

  if (!request) return c.json({ error: '対象の申請が見つかりません' }, 400)

  // Reject step
  const result = await c.env.DB.prepare(
    `UPDATE approval_steps SET status = 'rejected', comment = ?, decided_at = datetime('now')
     WHERE id = ? AND status = 'waiting' AND approver_id = ?`
  ).bind(comment, stepId, user.userId).run()

  if (!result.meta.changes || result.meta.changes === 0) {
    return c.json({ error: 'このステップは既に処理されています' }, 409)
  }

  // Update request status
  await c.env.DB.prepare(
    "UPDATE requests SET status = 'rejected', updated_at = datetime('now') WHERE id = ?"
  ).bind(step.request_id).run()

  // Audit log
  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_table, target_id, detail)
     VALUES (?, ?, 'step_rejected', 'approval_steps', ?, ?)`
  ).bind(generateId(), user.userId, stepId, JSON.stringify({
    request_id: step.request_id,
    step_order: step.step_order,
    comment
  })).run()

  return c.json({ message: '差戻ししました' })
})

// 事務処理済みに更新
approvalRoutes.post('/process', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: '認証が必要です' }, 401)

  if (!hasRole(user.role, 'clerk') && !hasRole(user.role, 'admin')) {
    return c.json({ error: '権限がありません' }, 403)
  }

  const { requestId } = await c.req.json()
  const request = await c.env.DB.prepare(
    'SELECT * FROM requests WHERE id = ? AND status = ?'
  ).bind(requestId, 'completed').first()

  if (!request) return c.json({ error: '処理済みにできる申請が見つかりません' }, 400)

  await c.env.DB.prepare(
    "UPDATE requests SET status = 'processed', updated_at = datetime('now') WHERE id = ?"
  ).bind(requestId).run()

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_table, target_id)
     VALUES (?, ?, 'request_processed', 'requests', ?)`
  ).bind(generateId(), user.userId, requestId).run()

  return c.json({ message: '処理済みにしました' })
})

// 承認者振替
approvalRoutes.post('/reassign', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: '認証が必要です' }, 401)

  if (!hasRole(user.role, 'admin')) {
    return c.json({ error: '管理者権限が必要です' }, 403)
  }

  const { stepId, newApproverId } = await c.req.json()

  const step = await c.env.DB.prepare(
    "SELECT * FROM approval_steps WHERE id = ? AND status = 'waiting'"
  ).bind(stepId).first()

  if (!step) return c.json({ error: '振替可能なステップが見つかりません' }, 400)

  const newApprover = await c.env.DB.prepare(
    'SELECT * FROM profiles WHERE id = ? AND is_active = 1'
  ).bind(newApproverId).first()

  if (!newApprover) return c.json({ error: '振替先のユーザーが見つかりません' }, 400)

  const oldApproverId = step.approver_id

  await c.env.DB.prepare(
    'UPDATE approval_steps SET approver_id = ?, approver_label = ? WHERE id = ?'
  ).bind(newApproverId, newApprover.display_name, stepId).run()

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_table, target_id, detail)
     VALUES (?, ?, 'step_reassigned', 'approval_steps', ?, ?)`
  ).bind(generateId(), user.userId, stepId, JSON.stringify({
    old_approver_id: oldApproverId,
    new_approver_id: newApproverId,
    request_id: step.request_id
  })).run()

  return c.json({ message: '承認者を振り替えました' })
})

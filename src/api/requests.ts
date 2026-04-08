import { Hono } from 'hono'
import { verifyToken, generateId, hasRole } from '../utils/helpers'

type Bindings = { DB: D1Database }

async function getUser(c: any) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const payload = await verifyToken(authHeader.substring(7))
  if (!payload) return null
  return payload
}

export const requestRoutes = new Hono<{ Bindings: Bindings }>()

// 申請一覧
requestRoutes.get('/', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: '認証が必要です' }, 401)

  const page = parseInt(c.req.query('page') || '1')
  const limit = 20
  const offset = (page - 1) * limit
  const status = c.req.query('status') || ''
  const type = c.req.query('type') || ''
  const keyword = c.req.query('keyword') || ''

  const isAdmin = hasRole(user.role, 'admin')
  let whereClause = isAdmin ? '1=1' : 'r.applicant_id = ?'
  const params: any[] = isAdmin ? [] : [user.userId]

  // Also show requests where user is an approver
  if (!isAdmin) {
    whereClause = `(r.applicant_id = ? OR EXISTS (SELECT 1 FROM approval_steps ast WHERE ast.request_id = r.id AND ast.approver_id = ?))`
    params.push(user.userId)
  }

  if (status) {
    whereClause += ' AND r.status = ?'
    params.push(status)
  }
  if (type) {
    whereClause += ' AND r.type = ?'
    params.push(type)
  }
  if (keyword) {
    whereClause += ' AND (r.title LIKE ? OR r.client_name LIKE ?)'
    params.push(`%${keyword}%`, `%${keyword}%`)
  }

  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM requests r WHERE ${whereClause}`
  ).bind(...params).first()

  const requests = await c.env.DB.prepare(
    `SELECT r.*, p.display_name as applicant_name 
     FROM requests r 
     JOIN profiles p ON r.applicant_id = p.id
     WHERE ${whereClause}
     ORDER BY r.created_at DESC 
     LIMIT ? OFFSET ?`
  ).bind(...params, limit, offset).all()

  return c.json({
    requests: requests.results,
    total: countResult?.total || 0,
    page,
    totalPages: Math.ceil((countResult?.total as number || 0) / limit)
  })
})

// 申請詳細
requestRoutes.get('/:id', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: '認証が必要です' }, 401)

  const id = c.req.param('id')
  const request = await c.env.DB.prepare(
    `SELECT r.*, p.display_name as applicant_name, p.email as applicant_email
     FROM requests r
     JOIN profiles p ON r.applicant_id = p.id
     WHERE r.id = ?`
  ).bind(id).first()

  if (!request) return c.json({ error: '申請が見つかりません' }, 404)

  // Access control
  const isAdmin = hasRole(user.role, 'admin')
  const isApplicant = request.applicant_id === user.userId
  const isApprover = await c.env.DB.prepare(
    'SELECT 1 FROM approval_steps WHERE request_id = ? AND approver_id = ?'
  ).bind(id, user.userId).first()
  const isClerk = hasRole(user.role, 'clerk')

  if (!isAdmin && !isApplicant && !isApprover && !isClerk) {
    return c.json({ error: 'アクセス権限がありません' }, 403)
  }

  // Get approval steps for current version
  const steps = await c.env.DB.prepare(
    `SELECT s.*, p.display_name as approver_name, p.email as approver_email
     FROM approval_steps s
     JOIN profiles p ON s.approver_id = p.id
     WHERE s.request_id = ? AND s.version = ?
     ORDER BY s.step_order ASC`
  ).bind(id, request.version).all()

  // Get files (metadata only, exclude file_data for performance)
  const files = await c.env.DB.prepare(
    'SELECT id, request_id, file_name, file_path, file_size, mime_type, uploaded_at FROM request_files WHERE request_id = ? ORDER BY uploaded_at ASC'
  ).bind(id).all()

  return c.json({
    request,
    steps: steps.results,
    files: files.results
  })
})

// 新規申請
requestRoutes.post('/', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: '認証が必要です' }, 401)

  const body = await c.req.json()
  const { type, title, client_name, amount_with_tax: inputAmountWithTax, tax_rate, remarks, gross_profit_rate } = body

  // Validation
  if (!type || !['estimate', 'invoice'].includes(type)) {
    return c.json({ error: '申請種別を選択してください' }, 400)
  }
  if (!title || title.length > 100) {
    return c.json({ error: '件名は1〜100文字で入力してください' }, 400)
  }
  if (!client_name || client_name.length > 100) {
    return c.json({ error: '取引先名は1〜100文字で入力してください' }, 400)
  }
  if (!inputAmountWithTax || inputAmountWithTax <= 0) {
    return c.json({ error: '金額（税込）は1以上を入力してください' }, 400)
  }
  if (tax_rate === undefined || ![0.10, 0.08, 0.0].includes(tax_rate)) {
    return c.json({ error: '税率を選択してください' }, 400)
  }
  if (remarks && remarks.length > 1000) {
    return c.json({ error: '備考は1000文字以内で入力してください' }, 400)
  }

  // Get active approvers
  const approvers = await c.env.DB.prepare(
    `SELECT am.*, p.display_name, p.email FROM approver_master am
     JOIN profiles p ON am.user_id = p.id
     WHERE am.is_active = 1 AND p.is_active = 1
     ORDER BY am.step_order ASC`
  ).bind().all()

  if (!approvers.results || approvers.results.length === 0) {
    return c.json({ error: '承認者が設定されていないため申請できません。管理者に連絡してください。' }, 400)
  }

  // Check self-approval: filter out steps where approver is the applicant
  const validApprovers = approvers.results.filter((a: any) => a.user_id !== user.userId)
  if (validApprovers.length === 0) {
    return c.json({ error: 'すべての承認者が申請者本人のため申請できません' }, 400)
  }

  // 税込金額から税抜金額を逆算
  const amount_with_tax = Math.round(inputAmountWithTax)
  const amount = tax_rate > 0 ? Math.round(amount_with_tax / (1 + tax_rate)) : amount_with_tax

  // Get next request number
  await c.env.DB.prepare(
    'UPDATE sequences SET current_value = current_value + 1 WHERE name = ?'
  ).bind('request_number').run()
  const seq = await c.env.DB.prepare(
    'SELECT current_value FROM sequences WHERE name = ?'
  ).bind('request_number').first()
  const requestNumber = seq?.current_value as number

  const requestId = generateId()

  // Validate gross_profit_rate (optional, 0-100)
  const profitRate = gross_profit_rate !== undefined && gross_profit_rate !== null && gross_profit_rate !== '' ? parseFloat(gross_profit_rate) : null
  if (profitRate !== null && (isNaN(profitRate) || profitRate < 0 || profitRate > 100)) {
    return c.json({ error: '粗利率は0〜100の範囲で入力してください' }, 400)
  }

  // Insert request
  await c.env.DB.prepare(
    `INSERT INTO requests (id, request_number, type, applicant_id, title, client_name, amount, tax_rate, amount_with_tax, remarks, gross_profit_rate, status, current_step, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 1, 1)`
  ).bind(requestId, requestNumber, type, user.userId, title, client_name, amount, tax_rate, amount_with_tax, remarks || null, profitRate).run()

  // Create approval steps
  let stepOrder = 1
  for (const approver of approvers.results as any[]) {
    const stepStatus = approver.user_id === user.userId ? 'skipped' : 'waiting'
    await c.env.DB.prepare(
      `INSERT INTO approval_steps (id, request_id, step_order, approver_id, approver_label, status, version)
       VALUES (?, ?, ?, ?, ?, ?, 1)`
    ).bind(generateId(), requestId, stepOrder, approver.user_id, approver.label, stepStatus).run()
    stepOrder++
  }

  // Find first non-skipped step and set current_step
  const firstStep = await c.env.DB.prepare(
    `SELECT step_order FROM approval_steps WHERE request_id = ? AND status = 'waiting' AND version = 1 ORDER BY step_order ASC LIMIT 1`
  ).bind(requestId).first()

  if (firstStep) {
    await c.env.DB.prepare(
      'UPDATE requests SET current_step = ? WHERE id = ?'
    ).bind(firstStep.step_order, requestId).run()
  }

  // Audit log
  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_table, target_id, detail)
     VALUES (?, ?, 'request_created', 'requests', ?, ?)`
  ).bind(generateId(), user.userId, requestId, JSON.stringify({ type, title, client_name, amount, request_number: requestNumber })).run()

  return c.json({ id: requestId, request_number: requestNumber })
})

// 取下げ
requestRoutes.post('/:id/withdraw', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: '認証が必要です' }, 401)

  const id = c.req.param('id')
  const request = await c.env.DB.prepare(
    'SELECT * FROM requests WHERE id = ? AND applicant_id = ? AND status = ?'
  ).bind(id, user.userId, 'pending').first()

  if (!request) {
    return c.json({ error: '取下げ可能な申請が見つかりません' }, 404)
  }

  await c.env.DB.prepare(
    "UPDATE requests SET status = 'withdrawn', updated_at = datetime('now') WHERE id = ?"
  ).bind(id).run()

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_table, target_id)
     VALUES (?, ?, 'request_withdrawn', 'requests', ?)`
  ).bind(generateId(), user.userId, id).run()

  return c.json({ message: '申請を取り下げました' })
})

// 申請削除
requestRoutes.post('/:id/delete', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: '認証が必要です' }, 401)

  const id = c.req.param('id')
  const isAdmin = hasRole(user.role, 'admin')

  const request = await c.env.DB.prepare(
    'SELECT * FROM requests WHERE id = ?'
  ).bind(id).first()

  if (!request) {
    return c.json({ error: '申請が見つかりません' }, 404)
  }

  const isApplicant = request.applicant_id === user.userId

  // 権限チェック: 申請者本人 or 管理者のみ
  if (!isApplicant && !isAdmin) {
    return c.json({ error: '削除権限がありません' }, 403)
  }

  // 申請者本人は承認中（pending）の場合削除不可（取り下げを使う）
  // ただし管理者はどのステータスでも削除可能
  if (isApplicant && !isAdmin && request.status === 'pending') {
    return c.json({ error: '承認中の申請は取り下げを行ってください' }, 400)
  }

  // 申請者本人が削除できるステータス: withdrawn, rejected, completed, processed
  // 管理者は全てのステータスで削除可能
  const applicantDeletable = ['withdrawn', 'rejected', 'completed', 'processed']
  if (isApplicant && !isAdmin && !applicantDeletable.includes(request.status as string)) {
    return c.json({ error: 'この申請は削除できません' }, 400)
  }

  // 関連データを全て削除（FK制約の順序: 子テーブルから先に削除）
  // deal_payments → deal_tracking → request_files → approval_steps → notification_logs → requests
  const deals = await c.env.DB.prepare('SELECT id FROM deal_tracking WHERE request_id = ?').bind(id).all()
  for (const deal of (deals.results || [])) {
    await c.env.DB.prepare('DELETE FROM deal_payments WHERE deal_id = ?').bind(deal.id).run()
  }
  await c.env.DB.prepare('DELETE FROM deal_tracking WHERE request_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM notification_logs WHERE request_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM request_files WHERE request_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM approval_steps WHERE request_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM requests WHERE id = ?').bind(id).run()

  // 監査ログ
  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_table, target_id, detail)
     VALUES (?, ?, 'request_deleted', 'requests', ?, ?)`
  ).bind(generateId(), user.userId, id, JSON.stringify({
    request_number: request.request_number,
    title: request.title,
    status: request.status,
    deleted_by: isAdmin && !isApplicant ? 'admin' : 'applicant'
  })).run()

  return c.json({ message: '申請を削除しました' })
})

// 再申請
requestRoutes.post('/:id/resubmit', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: '認証が必要です' }, 401)

  const id = c.req.param('id')
  const request = await c.env.DB.prepare(
    'SELECT * FROM requests WHERE id = ? AND applicant_id = ? AND status = ?'
  ).bind(id, user.userId, 'rejected').first()

  if (!request) {
    return c.json({ error: '再申請可能な申請が見つかりません' }, 404)
  }

  const body = await c.req.json()
  const { type, title, client_name, amount_with_tax, tax_rate, remarks, gross_profit_rate } = body

  // Validation (same as create)
  if (!type || !['estimate', 'invoice'].includes(type)) return c.json({ error: '申請種別を選択してください' }, 400)
  if (!title || title.length > 100) return c.json({ error: '件名は1〜100文字で入力してください' }, 400)
  if (!client_name || client_name.length > 100) return c.json({ error: '取引先名は1〜100文字で入力してください' }, 400)
  if (!amount_with_tax || amount_with_tax <= 0) return c.json({ error: '金額（税込）は1以上を入力してください' }, 400)
  if (tax_rate === undefined || ![0.10, 0.08, 0.0].includes(tax_rate)) return c.json({ error: '税率を選択してください' }, 400)

  // 税込金額から税抜金額を逆算
  const computedAmountWithTax = Math.round(amount_with_tax)
  const amount = tax_rate > 0 ? Math.round(computedAmountWithTax / (1 + tax_rate)) : computedAmountWithTax
  const newVersion = (request.version as number) + 1

  // Validate gross_profit_rate (optional, 0-100)
  const profitRate = gross_profit_rate !== undefined && gross_profit_rate !== null && gross_profit_rate !== '' ? parseFloat(gross_profit_rate) : null
  if (profitRate !== null && (isNaN(profitRate) || profitRate < 0 || profitRate > 100)) {
    return c.json({ error: '粗利率は0〜100の範囲で入力してください' }, 400)
  }

  // Update request
  await c.env.DB.prepare(
    `UPDATE requests SET type=?, title=?, client_name=?, amount=?, tax_rate=?, amount_with_tax=?, remarks=?, gross_profit_rate=?,
     status='pending', current_step=1, version=?, updated_at=datetime('now')
     WHERE id = ?`
  ).bind(type, title, client_name, amount, tax_rate, computedAmountWithTax, remarks || null, profitRate, newVersion, id).run()

  // Create new approval steps with new version
  const approvers = await c.env.DB.prepare(
    `SELECT am.*, p.display_name FROM approver_master am
     JOIN profiles p ON am.user_id = p.id
     WHERE am.is_active = 1 AND p.is_active = 1
     ORDER BY am.step_order ASC`
  ).bind().all()

  let stepOrder = 1
  for (const approver of approvers.results as any[]) {
    const stepStatus = approver.user_id === user.userId ? 'skipped' : 'waiting'
    await c.env.DB.prepare(
      `INSERT INTO approval_steps (id, request_id, step_order, approver_id, approver_label, status, version)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(generateId(), id, stepOrder, approver.user_id, approver.label, stepStatus, newVersion).run()
    stepOrder++
  }

  // Update current_step to first non-skipped
  const firstStep = await c.env.DB.prepare(
    `SELECT step_order FROM approval_steps WHERE request_id = ? AND status = 'waiting' AND version = ? ORDER BY step_order ASC LIMIT 1`
  ).bind(id, newVersion).first()

  if (firstStep) {
    await c.env.DB.prepare('UPDATE requests SET current_step = ? WHERE id = ?').bind(firstStep.step_order, id).run()
  }

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_table, target_id, detail)
     VALUES (?, ?, 'request_resubmitted', 'requests', ?, ?)`
  ).bind(generateId(), user.userId, id, JSON.stringify({ version: newVersion })).run()

  return c.json({ message: '再申請しました' })
})

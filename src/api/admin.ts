import { Hono } from 'hono'
import { verifyToken, generateId, hashPassword, hasRole } from '../utils/helpers'

type Bindings = { DB: D1Database }

async function getAdminUser(c: any) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const payload = await verifyToken(authHeader.substring(7))
  if (!payload || !hasRole(payload.role, 'admin')) return null
  return payload
}

export const adminRoutes = new Hono<{ Bindings: Bindings }>()

// ====== ユーザー管理 ======

// ユーザー一覧
adminRoutes.get('/users', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const users = await c.env.DB.prepare(
    'SELECT id, email, display_name, role, is_active, created_at FROM profiles ORDER BY created_at ASC'
  ).bind().all()

  return c.json({ users: users.results })
})

// ユーザー招待
adminRoutes.post('/users/invite', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const { email, displayName, roles } = await c.req.json()
  if (!displayName) return c.json({ error: '氏名を入力してください' }, 400)

  // If email is empty, generate a login ID from display name (romanized slug)
  let loginId = (email || '').trim()
  if (!loginId) {
    // Generate login ID: user_<random>
    const randomPart = generateId().substring(0, 8)
    loginId = `user_${randomPart}`
  }

  // Check duplicate
  const existing = await c.env.DB.prepare(
    'SELECT id FROM profiles WHERE email = ?'
  ).bind(loginId).first()
  if (existing) return c.json({ error: 'このログインID（メールアドレス）は既に登録されています' }, 400)

  // Ensure applicant role is always included
  const roleArray = Array.isArray(roles) ? roles : ['applicant']
  if (!roleArray.includes('applicant')) roleArray.unshift('applicant')

  const id = generateId()
  // Default password: Workflow2026!
  const passwordHash = await hashPassword('Workflow2026!')

  await c.env.DB.prepare(
    'INSERT INTO profiles (id, email, display_name, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, 1)'
  ).bind(id, loginId, displayName, passwordHash, JSON.stringify(roleArray)).run()

  // Audit log
  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_table, target_id, detail)
     VALUES (?, ?, 'user_invited', 'profiles', ?, ?)`
  ).bind(generateId(), admin.userId, id, JSON.stringify({ email: loginId, roles: roleArray })).run()

  return c.json({ id, message: `ユーザーを追加しました。ログインID: ${loginId}　初期パスワード: Workflow2026!` })
})

// ユーザー更新
adminRoutes.post('/users/:id/update', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const id = c.req.param('id')
  const { displayName, roles, isActive } = await c.req.json()

  const user = await c.env.DB.prepare('SELECT * FROM profiles WHERE id = ?').bind(id).first()
  if (!user) return c.json({ error: 'ユーザーが見つかりません' }, 404)

  const roleArray = Array.isArray(roles) ? roles : JSON.parse(user.role as string)
  if (!roleArray.includes('applicant')) roleArray.unshift('applicant')

  const oldRoles = JSON.parse(user.role as string)

  await c.env.DB.prepare(
    'UPDATE profiles SET display_name = ?, role = ?, is_active = ? WHERE id = ?'
  ).bind(
    displayName || user.display_name,
    JSON.stringify(roleArray),
    isActive !== undefined ? (isActive ? 1 : 0) : user.is_active,
    id
  ).run()

  // If approver role removed, deactivate in approver_master
  if (oldRoles.includes('approver') && !roleArray.includes('approver')) {
    await c.env.DB.prepare(
      'UPDATE approver_master SET is_active = 0 WHERE user_id = ?'
    ).bind(id).run()
  }

  // If user deactivated, deactivate in approver_master
  if (isActive === false) {
    await c.env.DB.prepare(
      'UPDATE approver_master SET is_active = 0 WHERE user_id = ?'
    ).bind(id).run()
  }

  const action = isActive === false ? 'user_deactivated' : 
                 isActive === true && !user.is_active ? 'user_reactivated' : 'user_role_changed'

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_table, target_id, detail)
     VALUES (?, ?, ?, 'profiles', ?, ?)`
  ).bind(generateId(), admin.userId, action, id, JSON.stringify({
    old_roles: oldRoles,
    new_roles: roleArray,
    is_active: isActive
  })).run()

  return c.json({ message: 'ユーザー情報を更新しました' })
})

// ユーザー削除
adminRoutes.post('/users/:id/delete', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const id = c.req.param('id')

  // Check if user has related records
  const hasRequests = await c.env.DB.prepare(
    'SELECT 1 FROM requests WHERE applicant_id = ? LIMIT 1'
  ).bind(id).first()
  const hasSteps = await c.env.DB.prepare(
    'SELECT 1 FROM approval_steps WHERE approver_id = ? LIMIT 1'
  ).bind(id).first()

  if (hasRequests || hasSteps) {
    return c.json({ error: '申請・承認履歴があるため削除できません。無効化をご利用ください。' }, 400)
  }

  await c.env.DB.prepare('DELETE FROM approver_master WHERE user_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM profiles WHERE id = ?').bind(id).run()

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_table, target_id)
     VALUES (?, ?, 'user_deleted', 'profiles', ?)`
  ).bind(generateId(), admin.userId, id).run()

  return c.json({ message: 'ユーザーを削除しました' })
})

// パスワードリセット
adminRoutes.post('/users/:id/reset-password', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const id = c.req.param('id')
  const newHash = await hashPassword('Workflow2026!')

  await c.env.DB.prepare('UPDATE profiles SET password_hash = ? WHERE id = ?').bind(newHash, id).run()

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_table, target_id)
     VALUES (?, ?, 'user_password_reset', 'profiles', ?)`
  ).bind(generateId(), admin.userId, id).run()

  return c.json({ message: 'パスワードをリセットしました。新しいパスワード: Workflow2026!' })
})

// ====== 承認者マスタ管理 ======

// 承認者一覧
adminRoutes.get('/approvers', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const approvers = await c.env.DB.prepare(
    `SELECT am.*, p.display_name, p.email 
     FROM approver_master am 
     JOIN profiles p ON am.user_id = p.id
     ORDER BY am.step_order ASC`
  ).bind().all()

  return c.json({ approvers: approvers.results })
})

// 承認者追加
adminRoutes.post('/approvers', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const { userId, label, stepOrder } = await c.req.json()
  if (!userId || !label) return c.json({ error: 'ユーザーとラベルを入力してください' }, 400)

  // Check user has approver role
  const user = await c.env.DB.prepare('SELECT * FROM profiles WHERE id = ?').bind(userId).first()
  if (!user) return c.json({ error: 'ユーザーが見つかりません' }, 404)

  const roles = JSON.parse(user.role as string)
  if (!roles.includes('approver')) {
    return c.json({ error: 'このユーザーには承認者ロールがありません' }, 400)
  }

  // Auto-determine step order if not provided
  let order = stepOrder
  if (!order) {
    const maxOrder = await c.env.DB.prepare(
      'SELECT MAX(step_order) as max_order FROM approver_master'
    ).bind().first()
    order = ((maxOrder?.max_order as number) || 0) + 1
  }

  const id = generateId()
  await c.env.DB.prepare(
    'INSERT INTO approver_master (id, user_id, step_order, label, is_active) VALUES (?, ?, ?, ?, 1)'
  ).bind(id, userId, order, label).run()

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_table, target_id, detail)
     VALUES (?, ?, 'approver_added', 'approver_master', ?, ?)`
  ).bind(generateId(), admin.userId, id, JSON.stringify({ user_id: userId, label, step_order: order })).run()

  return c.json({ id, message: '承認者を追加しました' })
})

// 承認者更新
adminRoutes.post('/approvers/:id/update', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const id = c.req.param('id')
  const { label, stepOrder, isActive, userId } = await c.req.json()

  // If userId is provided, swap the user for this approver step
  if (userId) {
    const user = await c.env.DB.prepare('SELECT * FROM profiles WHERE id = ?').bind(userId).first()
    if (!user) return c.json({ error: 'ユーザーが見つかりません' }, 404)
    const roles = JSON.parse(user.role as string)
    if (!roles.includes('approver')) {
      return c.json({ error: 'このユーザーには承認者ロールがありません' }, 400)
    }
    await c.env.DB.prepare(
      "UPDATE approver_master SET user_id = ?, label = COALESCE(?, label), step_order = COALESCE(?, step_order), is_active = COALESCE(?, is_active), updated_at = datetime('now') WHERE id = ?"
    ).bind(userId, label || null, stepOrder || null, isActive !== undefined ? (isActive ? 1 : 0) : null, id).run()
  } else {
    await c.env.DB.prepare(
      "UPDATE approver_master SET label = COALESCE(?, label), step_order = COALESCE(?, step_order), is_active = COALESCE(?, is_active), updated_at = datetime('now') WHERE id = ?"
    ).bind(label || null, stepOrder || null, isActive !== undefined ? (isActive ? 1 : 0) : null, id).run()
  }

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_table, target_id, detail)
     VALUES (?, ?, 'approver_updated', 'approver_master', ?, ?)`
  ).bind(generateId(), admin.userId, id, JSON.stringify({ label, stepOrder, isActive, userId })).run()

  return c.json({ message: '承認者を更新しました' })
})

// 承認者削除
adminRoutes.post('/approvers/:id/delete', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const id = c.req.param('id')

  // Check if has approval history
  const approver = await c.env.DB.prepare('SELECT * FROM approver_master WHERE id = ?').bind(id).first()
  if (!approver) return c.json({ error: '承認者が見つかりません' }, 404)

  const hasHistory = await c.env.DB.prepare(
    'SELECT 1 FROM approval_steps WHERE approver_id = ? LIMIT 1'
  ).bind(approver.user_id).first()

  if (hasHistory) {
    // Deactivate instead of delete
    await c.env.DB.prepare('UPDATE approver_master SET is_active = 0 WHERE id = ?').bind(id).run()
    return c.json({ message: '承認履歴があるため無効化しました' })
  }

  await c.env.DB.prepare('DELETE FROM approver_master WHERE id = ?').bind(id).run()

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_table, target_id)
     VALUES (?, ?, 'approver_removed', 'approver_master', ?)`
  ).bind(generateId(), admin.userId, id).run()

  return c.json({ message: '承認者を削除しました' })
})

// 承認者順序一括更新
adminRoutes.post('/approvers/reorder', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const { order } = await c.req.json() // [{id, stepOrder}]
  if (!Array.isArray(order)) return c.json({ error: '順序データが必要です' }, 400)

  for (const item of order) {
    await c.env.DB.prepare(
      "UPDATE approver_master SET step_order = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(item.stepOrder, item.id).run()
  }

  return c.json({ message: '承認順序を更新しました' })
})

// ====== システム設定 ======

adminRoutes.get('/settings', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const settings = await c.env.DB.prepare('SELECT * FROM settings').bind().all()
  const result: Record<string, any> = {}
  for (const s of settings.results as any[]) {
    result[s.key] = JSON.parse(s.value)
  }
  return c.json({ settings: result })
})

adminRoutes.post('/settings', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const { key, value } = await c.req.json()
  await c.env.DB.prepare(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
  ).bind(key, JSON.stringify(value)).run()

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_table, target_id, detail)
     VALUES (?, ?, 'settings_changed', 'settings', ?, ?)`
  ).bind(generateId(), admin.userId, key, JSON.stringify({ key, value })).run()

  return c.json({ message: '設定を更新しました' })
})

// ====== 監査ログ ======

adminRoutes.get('/audit-logs', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const page = parseInt(c.req.query('page') || '1')
  const limit = 20
  const offset = (page - 1) * limit
  const action = c.req.query('action') || ''
  const userId = c.req.query('userId') || ''

  let where = '1=1'
  const params: any[] = []
  if (action) { where += ' AND a.action = ?'; params.push(action) }
  if (userId) { where += ' AND a.user_id = ?'; params.push(userId) }

  const total = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM audit_logs a WHERE ${where}`
  ).bind(...params).first()

  const logs = await c.env.DB.prepare(
    `SELECT a.*, p.display_name as user_name 
     FROM audit_logs a 
     LEFT JOIN profiles p ON a.user_id = p.id
     WHERE ${where}
     ORDER BY a.created_at DESC LIMIT ? OFFSET ?`
  ).bind(...params, limit, offset).all()

  return c.json({
    logs: logs.results,
    total: total?.total || 0,
    page,
    totalPages: Math.ceil((total?.total as number || 0) / limit)
  })
})

// ====== CSV Export ======
adminRoutes.get('/export/requests', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const requests = await c.env.DB.prepare(
    `SELECT r.*, p.display_name as applicant_name
     FROM requests r JOIN profiles p ON r.applicant_id = p.id
     ORDER BY r.created_at DESC`
  ).bind().all()

  const header = '申請番号,種別,件名,取引先,金額(税抜),税率,金額(税込),申請者,ステータス,申請日\n'
  const rows = (requests.results as any[]).map(r =>
    `${r.request_number},${r.type === 'estimate' ? '見積もり' : '請求書'},"${r.title}","${r.client_name}",${r.amount},${r.tax_rate},${r.amount_with_tax},${r.applicant_name},${r.status},${r.created_at}`
  ).join('\n')

  return new Response(header + rows, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="requests_export.csv"'
    }
  })
})

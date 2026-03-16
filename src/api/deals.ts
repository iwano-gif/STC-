import { Hono } from 'hono'
import { verifyToken, generateId, hasRole } from '../utils/helpers'

type Bindings = { DB: D1Database }

async function getAdminUser(c: any) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const payload = await verifyToken(authHeader.substring(7))
  if (!payload || !hasRole(payload.role, 'admin')) return null
  return payload
}

async function getUser(c: any) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  return await verifyToken(authHeader.substring(7))
}

export const dealRoutes = new Hono<{ Bindings: Bindings }>()

// ====== 案件一覧（管理者のみ） ======
dealRoutes.get('/', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const status = c.req.query('status') || ''
  const keyword = c.req.query('keyword') || ''

  let where = '1=1'
  const params: any[] = []

  if (status) {
    where += ' AND d.deal_status = ?'
    params.push(status)
  }
  if (keyword) {
    where += ' AND (r.title LIKE ? OR r.client_name LIKE ?)'
    params.push(`%${keyword}%`, `%${keyword}%`)
  }

  const deals = await c.env.DB.prepare(
    `SELECT d.*, r.request_number, r.type, r.title, r.client_name, 
            r.amount, r.tax_rate, r.amount_with_tax, r.created_at as request_date,
            p.display_name as applicant_name
     FROM deal_tracking d
     JOIN requests r ON d.request_id = r.id
     JOIN profiles p ON r.applicant_id = p.id
     WHERE ${where}
     ORDER BY d.updated_at DESC`
  ).bind(...params).all()

  return c.json({ deals: deals.results })
})

// ====== 案件詳細 ======
dealRoutes.get('/:id', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const id = c.req.param('id')
  const deal = await c.env.DB.prepare(
    `SELECT d.*, r.request_number, r.type, r.title, r.client_name,
            r.amount, r.tax_rate, r.amount_with_tax, r.created_at as request_date, r.remarks,
            p.display_name as applicant_name
     FROM deal_tracking d
     JOIN requests r ON d.request_id = r.id
     JOIN profiles p ON r.applicant_id = p.id
     WHERE d.id = ?`
  ).bind(id).first()

  if (!deal) return c.json({ error: '案件が見つかりません' }, 404)
  return c.json({ deal })
})

// ====== 案件トラッキング開始（承認済み見積もりから自動 or 手動で作成） ======
dealRoutes.post('/create', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const { requestId } = await c.req.json()
  if (!requestId) return c.json({ error: 'リクエストIDが必要です' }, 400)

  // 対象の見積もり申請を確認
  const request = await c.env.DB.prepare(
    "SELECT * FROM requests WHERE id = ? AND type = 'estimate' AND status IN ('completed','processed')"
  ).bind(requestId).first()

  if (!request) {
    return c.json({ error: '承認済みの見積もり申請が見つかりません' }, 404)
  }

  // 重複チェック
  const existing = await c.env.DB.prepare(
    'SELECT id FROM deal_tracking WHERE request_id = ?'
  ).bind(requestId).first()

  if (existing) {
    return c.json({ error: 'この申請の案件トラッキングは既に存在します' }, 400)
  }

  const id = generateId()
  await c.env.DB.prepare(
    `INSERT INTO deal_tracking (id, request_id, deal_status) VALUES (?, ?, 'estimate_approved')`
  ).bind(id, requestId).run()

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_table, target_id, detail)
     VALUES (?, ?, 'deal_created', 'deal_tracking', ?, ?)`
  ).bind(generateId(), admin.userId, id, JSON.stringify({ request_id: requestId })).run()

  return c.json({ id, message: '案件トラッキングを開始しました' })
})

// ====== 案件ステータス更新 ======
dealRoutes.post('/:id/update', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const id = c.req.param('id')
  const body = await c.req.json()
  const {
    deal_status, contract_date, contract_amount,
    construction_start, construction_end,
    invoice_date, invoice_amount, payment_due_date,
    payment_date, payment_amount, notes
  } = body

  const deal = await c.env.DB.prepare('SELECT * FROM deal_tracking WHERE id = ?').bind(id).first()
  if (!deal) return c.json({ error: '案件が見つかりません' }, 404)

  await c.env.DB.prepare(
    `UPDATE deal_tracking SET
      deal_status = COALESCE(?, deal_status),
      contract_date = COALESCE(?, contract_date),
      contract_amount = COALESCE(?, contract_amount),
      construction_start = COALESCE(?, construction_start),
      construction_end = COALESCE(?, construction_end),
      invoice_date = COALESCE(?, invoice_date),
      invoice_amount = COALESCE(?, invoice_amount),
      payment_due_date = COALESCE(?, payment_due_date),
      payment_date = COALESCE(?, payment_date),
      payment_amount = COALESCE(?, payment_amount),
      notes = COALESCE(?, notes),
      updated_at = datetime('now')
    WHERE id = ?`
  ).bind(
    deal_status || null, contract_date || null, contract_amount || null,
    construction_start || null, construction_end || null,
    invoice_date || null, invoice_amount || null, payment_due_date || null,
    payment_date || null, payment_amount || null, notes !== undefined ? notes : null,
    id
  ).run()

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_table, target_id, detail)
     VALUES (?, ?, 'deal_updated', 'deal_tracking', ?, ?)`
  ).bind(generateId(), admin.userId, id, JSON.stringify({
    old_status: deal.deal_status, new_status: deal_status || deal.deal_status, ...body
  })).run()

  return c.json({ message: '案件情報を更新しました' })
})

// ====== 案件削除 ======
dealRoutes.post('/:id/delete', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM deal_tracking WHERE id = ?').bind(id).run()

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_table, target_id)
     VALUES (?, ?, 'deal_deleted', 'deal_tracking', ?)`
  ).bind(generateId(), admin.userId, id).run()

  return c.json({ message: '案件トラッキングを削除しました' })
})

// ====== トラッキング未登録の承認済み見積もり一覧 ======
dealRoutes.get('/untracked/estimates', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const estimates = await c.env.DB.prepare(
    `SELECT r.*, p.display_name as applicant_name
     FROM requests r
     JOIN profiles p ON r.applicant_id = p.id
     WHERE r.type = 'estimate' AND r.status IN ('completed','processed')
       AND NOT EXISTS (SELECT 1 FROM deal_tracking d WHERE d.request_id = r.id)
     ORDER BY r.created_at DESC`
  ).bind().all()

  return c.json({ estimates: estimates.results })
})

// ====== ダッシュボード集計（管理者のみ） ======
dealRoutes.get('/dashboard/summary', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: '認証が必要です' }, 401)
  if (!hasRole(user.role, 'admin')) return c.json({ error: '管理者権限が必要です' }, 403)

  // パイプラインごとの件数と金額
  const pipeline = await c.env.DB.prepare(
    `SELECT d.deal_status,
            COUNT(*) as count,
            SUM(COALESCE(d.contract_amount, r.amount_with_tax)) as total_amount
     FROM deal_tracking d
     JOIN requests r ON d.request_id = r.id
     GROUP BY d.deal_status`
  ).bind().all()

  // 入金予定（今月・来月）
  const now = new Date()
  const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
  const nextMonthStart = now.getMonth() === 11 
    ? `${now.getFullYear()+1}-01-01` 
    : `${now.getFullYear()}-${String(now.getMonth()+2).padStart(2,'0')}-01`
  const twoMonthStart = now.getMonth() >= 10
    ? `${now.getFullYear()+1}-${String(now.getMonth()-9).padStart(2,'0')}-01`
    : `${now.getFullYear()}-${String(now.getMonth()+3).padStart(2,'0')}-01`

  const paymentThisMonth = await c.env.DB.prepare(
    `SELECT COUNT(*) as count, SUM(COALESCE(d.invoice_amount, d.contract_amount, r.amount_with_tax)) as total
     FROM deal_tracking d JOIN requests r ON d.request_id = r.id
     WHERE d.payment_due_date >= ? AND d.payment_due_date < ? AND d.deal_status != 'payment_received' AND d.deal_status != 'lost'`
  ).bind(thisMonthStart, nextMonthStart).first()

  const paymentNextMonth = await c.env.DB.prepare(
    `SELECT COUNT(*) as count, SUM(COALESCE(d.invoice_amount, d.contract_amount, r.amount_with_tax)) as total
     FROM deal_tracking d JOIN requests r ON d.request_id = r.id
     WHERE d.payment_due_date >= ? AND d.payment_due_date < ? AND d.deal_status != 'payment_received' AND d.deal_status != 'lost'`
  ).bind(nextMonthStart, twoMonthStart).first()

  // 入金遅延
  const overdue = await c.env.DB.prepare(
    `SELECT COUNT(*) as count, SUM(COALESCE(d.invoice_amount, d.contract_amount, r.amount_with_tax)) as total
     FROM deal_tracking d JOIN requests r ON d.request_id = r.id
     WHERE d.payment_due_date < date('now') AND d.deal_status NOT IN ('payment_received', 'lost')`
  ).bind().first()

  // 入金済み合計（今年）
  const yearStart = `${now.getFullYear()}-01-01`
  const receivedThisYear = await c.env.DB.prepare(
    `SELECT COUNT(*) as count, SUM(COALESCE(d.payment_amount, d.invoice_amount, d.contract_amount, r.amount_with_tax)) as total
     FROM deal_tracking d JOIN requests r ON d.request_id = r.id
     WHERE d.deal_status = 'payment_received' AND d.payment_date >= ?`
  ).bind(yearStart).first()

  // 月別入金実績（直近12ヶ月）
  const monthlyPayments = await c.env.DB.prepare(
    `SELECT strftime('%Y-%m', d.payment_date) as month,
            SUM(COALESCE(d.payment_amount, d.invoice_amount, d.contract_amount, r.amount_with_tax)) as total,
            COUNT(*) as count
     FROM deal_tracking d JOIN requests r ON d.request_id = r.id
     WHERE d.deal_status = 'payment_received' AND d.payment_date IS NOT NULL
     GROUP BY strftime('%Y-%m', d.payment_date)
     ORDER BY month DESC
     LIMIT 12`
  ).bind().all()

  // 直近の工事予定
  const upcomingConstruction = await c.env.DB.prepare(
    `SELECT d.*, r.title, r.client_name, r.amount_with_tax, r.request_number
     FROM deal_tracking d JOIN requests r ON d.request_id = r.id
     WHERE d.deal_status IN ('contracted', 'construction') AND d.construction_start IS NOT NULL
     ORDER BY d.construction_start ASC
     LIMIT 10`
  ).bind().all()

  return c.json({
    pipeline: pipeline.results,
    paymentThisMonth: { count: paymentThisMonth?.count || 0, total: paymentThisMonth?.total || 0 },
    paymentNextMonth: { count: paymentNextMonth?.count || 0, total: paymentNextMonth?.total || 0 },
    overdue: { count: overdue?.count || 0, total: overdue?.total || 0 },
    receivedThisYear: { count: receivedThisYear?.count || 0, total: receivedThisYear?.total || 0 },
    monthlyPayments: monthlyPayments.results,
    upcomingConstruction: upcomingConstruction.results
  })
})

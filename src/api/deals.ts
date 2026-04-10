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

// 管理者または承認者（閲覧用）
async function getAdminOrApprover(c: any) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const payload = await verifyToken(authHeader.substring(7))
  if (!payload) return null
  if (!hasRole(payload.role, 'admin') && !hasRole(payload.role, 'approver')) return null
  return { ...payload, isAdmin: hasRole(payload.role, 'admin'), isApprover: hasRole(payload.role, 'approver') }
}

async function getUser(c: any) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  return await verifyToken(authHeader.substring(7))
}

export const dealRoutes = new Hono<{ Bindings: Bindings }>()

// ====== 案件一覧（管理者・承認者） ======
dealRoutes.get('/', async (c) => {
  const user = await getAdminOrApprover(c)
  if (!user) return c.json({ error: '権限が必要です' }, 403)

  const status = c.req.query('status') || ''
  const keyword = c.req.query('keyword') || ''

  let where = '1=1'
  const params: any[] = []

  if (status) { where += ' AND d.deal_status = ?'; params.push(status) }
  if (keyword) {
    where += ' AND (r.title LIKE ? OR r.client_name LIKE ?)'
    params.push(`%${keyword}%`, `%${keyword}%`)
  }

  const deals = await c.env.DB.prepare(
    `SELECT d.*, r.request_number, r.type, r.title, r.client_name,
            r.amount, r.tax_rate, r.amount_with_tax, r.gross_profit_rate, r.created_at as request_date,
            p.display_name as applicant_name
     FROM deal_tracking d
     JOIN requests r ON d.request_id = r.id
     JOIN profiles p ON r.applicant_id = p.id
     WHERE ${where}
     ORDER BY d.updated_at DESC`
  ).bind(...params).all()

  // 各案件の入金合計を取得
  const paymentsMap: Record<string, { received: number; expected: number }> = {}
  for (const deal of deals.results as any[]) {
    const payments = await c.env.DB.prepare(
      'SELECT SUM(actual_amount) as received, SUM(expected_amount) as expected FROM deal_payments WHERE deal_id = ?'
    ).bind(deal.id).first()
    paymentsMap[deal.id] = {
      received: (payments?.received as number) || 0,
      expected: (payments?.expected as number) || 0
    }
  }

  return c.json({ deals: deals.results, paymentsMap })
})

// ====== リテラルGETルートを /:id より前に配置 ======

// トラッキング未登録の承認済み見積もり一覧（管理者・承認者）
dealRoutes.get('/untracked/estimates', async (c) => {
  const user = await getAdminOrApprover(c)
  if (!user) return c.json({ error: '権限が必要です' }, 403)

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

// ダッシュボード集計（管理者・承認者）
dealRoutes.get('/dashboard/summary', async (c) => {
  const user = await getAdminOrApprover(c)
  if (!user) return c.json({ error: '権限が必要です' }, 403)

  // パイプラインごとの件数と金額（税抜・税込両方）
  const pipeline = await c.env.DB.prepare(
    `SELECT d.deal_status,
            COUNT(*) as count,
            SUM(COALESCE(d.contract_amount_excl_tax, r.amount)) as total_excl,
            SUM(COALESCE(d.contract_amount, r.amount_with_tax)) as total_incl
     FROM deal_tracking d
     JOIN requests r ON d.request_id = r.id
     GROUP BY d.deal_status`
  ).bind().all()

  // 入金予定（今月・来月）- deal_paymentsベース
  const now = new Date()
  const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
  const nextMonthStart = now.getMonth() === 11
    ? `${now.getFullYear()+1}-01-01`
    : `${now.getFullYear()}-${String(now.getMonth()+2).padStart(2,'0')}-01`
  const twoMonthStart = now.getMonth() >= 10
    ? `${now.getFullYear()+1}-${String(now.getMonth()-9).padStart(2,'0')}-01`
    : `${now.getFullYear()}-${String(now.getMonth()+3).padStart(2,'0')}-01`

  const paymentThisMonth = await c.env.DB.prepare(
    `SELECT COUNT(*) as count, SUM(expected_amount) as total
     FROM deal_payments
     WHERE expected_date >= ? AND expected_date < ? AND actual_date IS NULL`
  ).bind(thisMonthStart, nextMonthStart).first()

  const paymentNextMonth = await c.env.DB.prepare(
    `SELECT COUNT(*) as count, SUM(expected_amount) as total
     FROM deal_payments
     WHERE expected_date >= ? AND expected_date < ? AND actual_date IS NULL`
  ).bind(nextMonthStart, twoMonthStart).first()

  // 入金遅延（deal_paymentsベース）
  const overdue = await c.env.DB.prepare(
    `SELECT COUNT(*) as count, SUM(expected_amount) as total
     FROM deal_payments
     WHERE expected_date < date('now') AND actual_date IS NULL`
  ).bind().first()

  // 入金済み合計（今年、deal_paymentsベース）
  const yearStart = `${now.getFullYear()}-01-01`
  const receivedThisYear = await c.env.DB.prepare(
    `SELECT COUNT(*) as count, SUM(actual_amount) as total
     FROM deal_payments
     WHERE actual_date >= ? AND actual_date IS NOT NULL`
  ).bind(yearStart).first()

  // 月別入金実績（直近12ヶ月, deal_paymentsベース）
  const monthlyPayments = await c.env.DB.prepare(
    `SELECT strftime('%Y-%m', actual_date) as month,
            SUM(actual_amount) as total,
            COUNT(*) as count
     FROM deal_payments
     WHERE actual_date IS NOT NULL
     GROUP BY strftime('%Y-%m', actual_date)
     ORDER BY month DESC
     LIMIT 12`
  ).bind().all()

  // 粗利集計（税抜ベース）
  const profitSummary = await c.env.DB.prepare(
    `SELECT
       COUNT(*) as total_deals,
       SUM(COALESCE(d.contract_amount_excl_tax, r.amount)) as total_revenue_excl,
       SUM(COALESCE(d.contract_amount, r.amount_with_tax)) as total_revenue_incl,
       SUM(d.cost_amount) as total_cost,
       SUM(COALESCE(d.contract_amount_excl_tax, r.amount) - COALESCE(d.cost_amount, 0)) as total_profit
     FROM deal_tracking d
     JOIN requests r ON d.request_id = r.id
     WHERE d.deal_status NOT IN ('lost', 'estimate_approved')`
  ).bind().first()

  // 直近の工事予定（税抜・税込両方取得）
  const upcomingConstruction = await c.env.DB.prepare(
    `SELECT d.*, r.title, r.client_name, r.amount, r.amount_with_tax, r.request_number
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
    profitSummary: {
      total_deals: profitSummary?.total_deals || 0,
      total_revenue_excl: profitSummary?.total_revenue_excl || 0,
      total_revenue_incl: profitSummary?.total_revenue_incl || 0,
      total_cost: profitSummary?.total_cost || 0,
      total_profit: profitSummary?.total_profit || 0,
      avg_profit_rate: profitSummary?.total_revenue_excl
        ? ((profitSummary.total_revenue_excl as number) - ((profitSummary.total_cost as number) || 0)) / (profitSummary.total_revenue_excl as number)
        : 0
    },
    upcomingConstruction: upcomingConstruction.results
  })
})

// ====== CSVエクスポート（管理者・承認者） ======
dealRoutes.get('/export/csv', async (c) => {
  const user = await getAdminOrApprover(c)
  if (!user) return c.json({ error: '権限が必要です' }, 403)

  const statusFilter = c.req.query('status') || ''

  let where = '1=1'
  const params: any[] = []
  if (statusFilter) { where += ' AND d.deal_status = ?'; params.push(statusFilter) }

  // 全案件を取得（入金情報含む）
  const deals = await c.env.DB.prepare(
    `SELECT d.*, r.request_number, r.type, r.title, r.client_name,
            r.amount, r.tax_rate, r.amount_with_tax, r.gross_profit_rate,
            r.prime_contractor_id, r.created_at as request_date, r.remarks,
            p.display_name as applicant_name
     FROM deal_tracking d
     JOIN requests r ON d.request_id = r.id
     JOIN profiles p ON r.applicant_id = p.id
     WHERE ${where}
     ORDER BY d.deal_status, d.updated_at DESC`
  ).bind(...params).all()

  // 各案件の入金情報と協力会社情報を取得
  const dealRows: any[] = []
  for (const deal of deals.results as any[]) {
    const payments = await c.env.DB.prepare(
      `SELECT SUM(actual_amount) as received, SUM(expected_amount) as expected,
              COUNT(*) as payment_count
       FROM deal_payments WHERE deal_id = ?`
    ).bind(deal.id).first()

    // 協力会社情報
    const partners = await c.env.DB.prepare(
      `SELECT dp.role, dp.contract_amount, pc.company_name
       FROM deal_partners dp
       JOIN partner_companies pc ON dp.partner_id = pc.id
       WHERE dp.deal_id = ?
       ORDER BY dp.role ASC, pc.company_name ASC`
    ).bind(deal.id).all()

    // 元請け会社名
    let primeContractorName = ''
    if ((deal as any).prime_contractor_id) {
      const pc = await c.env.DB.prepare('SELECT company_name FROM partner_companies WHERE id = ?')
        .bind((deal as any).prime_contractor_id).first()
      if (pc) primeContractorName = pc.company_name as string
    }

    const subs = (partners.results || []).filter((p: any) => p.role === 'subcontractor')
    const subNames = subs.map((p: any) => p.company_name).join(' / ')
    const subCostTotal = subs.reduce((s: number, p: any) => s + (p.contract_amount || 0), 0)

    dealRows.push({ ...deal, payments, primeContractorName, subNames, subCostTotal })
  }

  // ステータスラベル
  const statusLabel: Record<string, string> = {
    estimate_approved: '見積承認済み',
    contracted: '契約済み',
    construction: '工事中',
    construction_done: '工事完了',
    invoiced: '請求済み',
    payment_received: '入金済み',
    lost: '見送り'
  }

  // CSV生成
  const headers = [
    '申請番号', 'ステータス', '種別', '件名', '取引先', '申請者',
    '元請け会社', '下請け会社', '下請け原価合計',
    '見積金額(税抜)', '税率', '見積金額(税込)', '粗利率(%)',
    '契約金額(税抜)', '契約税率', '契約金額(税込)',
    '原価', '粗利額', '粗利率(実績%)',
    '契約日', '工事開始日', '工事完了日',
    '入金予定合計', '入金済合計', '入金件数',
    '見積日', '備考'
  ]

  const escCsv = (v: any) => {
    if (v === null || v === undefined || v === '') return ''
    const s = String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"'
    }
    return s
  }

  const rows = dealRows.map((d: any) => {
    const exclTax = d.contract_amount_excl_tax || d.amount || 0
    const cost = d.cost_amount || 0
    const profit = exclTax - cost
    const profitRate = exclTax > 0 ? ((profit / exclTax) * 100).toFixed(1) : ''
    const typeLabel = d.type === 'estimate' ? '見積' : '請求'

    return [
      String(d.request_number).padStart(4, '0'),
      statusLabel[d.deal_status] || d.deal_status,
      typeLabel,
      d.title,
      d.client_name,
      d.applicant_name,
      d.primeContractorName || '',
      d.subNames || '',
      d.subCostTotal || '',
      d.amount || '',
      d.tax_rate ? `${Math.round(d.tax_rate * 100)}%` : '',
      d.amount_with_tax || '',
      d.gross_profit_rate != null ? `${d.gross_profit_rate}` : '',
      d.contract_amount_excl_tax || '',
      d.contract_tax_rate ? `${Math.round(d.contract_tax_rate * 100)}%` : '',
      d.contract_amount || '',
      d.cost_amount || '',
      cost > 0 ? profit : '',
      cost > 0 ? profitRate : '',
      d.contract_date || '',
      d.construction_start || '',
      d.construction_end || '',
      d.payments?.expected || '',
      d.payments?.received || '',
      d.payments?.payment_count || 0,
      d.request_date ? d.request_date.substring(0, 10) : '',
      d.remarks || ''
    ].map(escCsv).join(',')
  })

  // BOM付きUTF-8（Excel対応）
  const bom = '\uFEFF'
  const csv = bom + headers.join(',') + '\n' + rows.join('\n')

  const today = new Date().toISOString().substring(0, 10)
  const filename = `案件一覧_${today}.csv`

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
    }
  })
})

// ====== 案件詳細（管理者・承認者） ======
dealRoutes.get('/:id', async (c) => {
  const user = await getAdminOrApprover(c)
  if (!user) return c.json({ error: '権限が必要です' }, 403)

  const id = c.req.param('id')
  const deal = await c.env.DB.prepare(
    `SELECT d.*, r.request_number, r.type, r.title, r.client_name,
            r.amount, r.tax_rate, r.amount_with_tax, r.gross_profit_rate, r.prime_contractor_id,
            r.created_at as request_date, r.remarks,
            p.display_name as applicant_name
     FROM deal_tracking d
     JOIN requests r ON d.request_id = r.id
     JOIN profiles p ON r.applicant_id = p.id
     WHERE d.id = ?`
  ).bind(id).first()

  if (!deal) return c.json({ error: '案件が見つかりません' }, 404)

  // 分割入金一覧
  const payments = await c.env.DB.prepare(
    'SELECT * FROM deal_payments WHERE deal_id = ? ORDER BY expected_date ASC, created_at ASC'
  ).bind(id).all()

  // 協力会社一覧（下請け・元請け）
  const partners = await c.env.DB.prepare(
    `SELECT dp.*, pc.company_name, pc.representative_name, pc.phone, pc.trade_type
     FROM deal_partners dp
     JOIN partner_companies pc ON dp.partner_id = pc.id
     WHERE dp.deal_id = ?
     ORDER BY dp.role ASC, pc.company_name ASC`
  ).bind(id).all()

  // 元請け会社名を取得（prime_contractor_id がある場合）
  let primeContractorName = null
  if ((deal as any).prime_contractor_id) {
    const pc = await c.env.DB.prepare(
      'SELECT company_name FROM partner_companies WHERE id = ?'
    ).bind((deal as any).prime_contractor_id).first()
    if (pc) primeContractorName = pc.company_name
  }

  return c.json({ deal: { ...deal as any, prime_contractor_name: primeContractorName }, payments: payments.results, partners: partners.results })
})

// ====== リテラルPOSTルートを /:id/* より前に配置 ======

// 案件トラッキング開始
dealRoutes.post('/create', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const { requestId } = await c.req.json()
  if (!requestId) return c.json({ error: 'リクエストIDが必要です' }, 400)

  const request = await c.env.DB.prepare(
    "SELECT * FROM requests WHERE id = ? AND type = 'estimate' AND status IN ('completed','processed')"
  ).bind(requestId).first()

  if (!request) return c.json({ error: '承認済みの見積もり申請が見つかりません' }, 404)

  const existing = await c.env.DB.prepare(
    'SELECT id FROM deal_tracking WHERE request_id = ?'
  ).bind(requestId).first()
  if (existing) return c.json({ error: 'この申請の案件トラッキングは既に存在します' }, 400)

  const id = generateId()
  await c.env.DB.prepare(
    `INSERT INTO deal_tracking (id, request_id, deal_status) VALUES (?, ?, 'estimate_approved')`
  ).bind(id, requestId).run()

  // 申請の subcontractor_ids を deal_partners へ自動マッピング
  if ((request as any).subcontractor_ids) {
    try {
      const subIds = JSON.parse((request as any).subcontractor_ids as string)
      if (Array.isArray(subIds)) {
        for (const partnerId of subIds) {
          await c.env.DB.prepare(
            `INSERT INTO deal_partners (id, deal_id, partner_id, role) VALUES (?, ?, ?, 'subcontractor')`
          ).bind(generateId(), id, partnerId).run()
        }
      }
    } catch {}
  }

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_table, target_id, detail)
     VALUES (?, ?, 'deal_created', 'deal_tracking', ?, ?)`
  ).bind(generateId(), admin.userId, id, JSON.stringify({ request_id: requestId })).run()

  return c.json({ id, message: '案件トラッキングを開始しました' })
})

// 見積もりから直接工事決定（トラッキング未登録の承認済み見積もりを一括処理）
dealRoutes.post('/confirm-from-estimate/:requestId', async (c) => {
  const user = await getAdminOrApprover(c)
  if (!user) return c.json({ error: '権限が必要です' }, 403)

  const requestId = c.req.param('requestId')

  // 承認済み見積もりか確認
  const request = await c.env.DB.prepare(
    "SELECT * FROM requests WHERE id = ? AND type = 'estimate' AND status IN ('completed','processed')"
  ).bind(requestId).first()
  if (!request) return c.json({ error: '承認済みの見積もり申請が見つかりません' }, 404)

  // 既にトラッキング済みか確認
  const existing = await c.env.DB.prepare(
    'SELECT id, deal_status FROM deal_tracking WHERE request_id = ?'
  ).bind(requestId).first()

  if (existing) {
    if (existing.deal_status === 'estimate_approved') {
      // トラッキング済みだがまだ estimate_approved → contracted に変更
      await c.env.DB.prepare(
        `UPDATE deal_tracking SET deal_status = 'contracted', updated_at = datetime('now') WHERE id = ?`
      ).bind(existing.id).run()
      await c.env.DB.prepare(
        `INSERT INTO audit_logs (id, user_id, action, target_table, target_id, detail)
         VALUES (?, ?, 'deal_contract_confirmed', 'deal_tracking', ?, ?)`
      ).bind(generateId(), user.userId, existing.id, JSON.stringify({
        confirmed_by: user.displayName || user.userId,
        old_status: 'estimate_approved', new_status: 'contracted'
      })).run()
      return c.json({ id: existing.id, message: '工事決定を確定しました' })
    }
    return c.json({ error: 'この案件は既に工事決定済みまたは別のステータスです' }, 400)
  }

  // 未トラッキング → 新規作成して即 contracted に
  const id = generateId()
  await c.env.DB.prepare(
    `INSERT INTO deal_tracking (id, request_id, deal_status) VALUES (?, ?, 'contracted')`
  ).bind(id, requestId).run()

  // 申請の subcontractor_ids を deal_partners へ自動マッピング
  if ((request as any).subcontractor_ids) {
    try {
      const subIds = JSON.parse((request as any).subcontractor_ids as string)
      if (Array.isArray(subIds)) {
        for (const partnerId of subIds) {
          await c.env.DB.prepare(
            `INSERT INTO deal_partners (id, deal_id, partner_id, role) VALUES (?, ?, ?, 'subcontractor')`
          ).bind(generateId(), id, partnerId).run()
        }
      }
    } catch {}
  }

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_table, target_id, detail)
     VALUES (?, ?, 'deal_confirmed_from_estimate', 'deal_tracking', ?, ?)`
  ).bind(generateId(), user.userId, id, JSON.stringify({
    request_id: requestId,
    confirmed_by: user.displayName || user.userId,
    status: 'contracted'
  })).run()

  return c.json({ id, message: '工事決定を確定しました' })
})

// 見積もりから直接見送り（トラッキング未登録の承認済み見積もりを失注に）
dealRoutes.post('/dismiss-from-estimate/:requestId', async (c) => {
  const user = await getAdminOrApprover(c)
  if (!user) return c.json({ error: '権限が必要です' }, 403)

  const requestId = c.req.param('requestId')

  const request = await c.env.DB.prepare(
    "SELECT * FROM requests WHERE id = ? AND type = 'estimate' AND status IN ('completed','processed')"
  ).bind(requestId).first()
  if (!request) return c.json({ error: '承認済みの見積もり申請が見つかりません' }, 404)

  const existing = await c.env.DB.prepare(
    'SELECT id, deal_status FROM deal_tracking WHERE request_id = ?'
  ).bind(requestId).first()

  if (existing) {
    if (existing.deal_status === 'estimate_approved') {
      await c.env.DB.prepare(
        `UPDATE deal_tracking SET deal_status = 'lost', updated_at = datetime('now') WHERE id = ?`
      ).bind(existing.id).run()
      await c.env.DB.prepare(
        `INSERT INTO audit_logs (id, user_id, action, target_table, target_id, detail)
         VALUES (?, ?, 'deal_dismissed', 'deal_tracking', ?, ?)`
      ).bind(generateId(), user.userId, existing.id, JSON.stringify({
        dismissed_by: user.displayName || user.userId,
        old_status: 'estimate_approved', new_status: 'lost'
      })).run()
      return c.json({ id: existing.id, message: 'この案件を見送りにしました' })
    }
    return c.json({ error: 'この案件は既に処理済みです' }, 400)
  }

  // 未トラッキング → 新規作成して即 lost に
  const id = generateId()
  await c.env.DB.prepare(
    `INSERT INTO deal_tracking (id, request_id, deal_status) VALUES (?, ?, 'lost')`
  ).bind(id, requestId).run()

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_table, target_id, detail)
     VALUES (?, ?, 'deal_dismissed_from_estimate', 'deal_tracking', ?, ?)`
  ).bind(generateId(), user.userId, id, JSON.stringify({
    request_id: requestId,
    dismissed_by: user.displayName || user.userId,
    status: 'lost'
  })).run()

  return c.json({ id, message: 'この案件を見送りにしました' })
})

// ====== パラメータ付きルート ======

// 案件ステータス更新（利益率・原価含む）
dealRoutes.post('/:id/update', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const id = c.req.param('id')
  const body = await c.req.json()
  const {
    deal_status, contract_date, contract_amount, contract_amount_excl_tax, contract_tax_rate,
    construction_start, construction_end,
    cost_amount, profit_rate,
    notes
  } = body

  const deal = await c.env.DB.prepare('SELECT * FROM deal_tracking WHERE id = ?').bind(id).first()
  if (!deal) return c.json({ error: '案件が見つかりません' }, 404)

  await c.env.DB.prepare(
    `UPDATE deal_tracking SET
      deal_status = COALESCE(?, deal_status),
      contract_date = COALESCE(?, contract_date),
      contract_amount = COALESCE(?, contract_amount),
      contract_amount_excl_tax = COALESCE(?, contract_amount_excl_tax),
      contract_tax_rate = COALESCE(?, contract_tax_rate),
      construction_start = COALESCE(?, construction_start),
      construction_end = COALESCE(?, construction_end),
      cost_amount = COALESCE(?, cost_amount),
      profit_rate = COALESCE(?, profit_rate),
      notes = COALESCE(?, notes),
      updated_at = datetime('now')
    WHERE id = ?`
  ).bind(
    deal_status || null, contract_date || null, contract_amount || null,
    contract_amount_excl_tax !== undefined && contract_amount_excl_tax !== '' ? contract_amount_excl_tax : null,
    contract_tax_rate !== undefined && contract_tax_rate !== '' ? contract_tax_rate : null,
    construction_start || null, construction_end || null,
    cost_amount !== undefined && cost_amount !== '' ? cost_amount : null,
    profit_rate !== undefined && profit_rate !== '' ? profit_rate : null,
    notes !== undefined ? notes : null,
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

// 案件削除
dealRoutes.post('/:id/delete', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM deal_partners WHERE deal_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM deal_payments WHERE deal_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM deal_tracking WHERE id = ?').bind(id).run()

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_table, target_id)
     VALUES (?, ?, 'deal_deleted', 'deal_tracking', ?)`
  ).bind(generateId(), admin.userId, id).run()

  return c.json({ message: '案件トラッキングを削除しました' })
})

// 工事決定確定（承認者がトラッキング済み案件の契約確定を押す）
dealRoutes.post('/:id/confirm-contract', async (c) => {
  const user = await getAdminOrApprover(c)
  if (!user) return c.json({ error: '権限が必要です' }, 403)

  const id = c.req.param('id')
  const deal = await c.env.DB.prepare('SELECT * FROM deal_tracking WHERE id = ?').bind(id).first()
  if (!deal) return c.json({ error: '案件が見つかりません' }, 404)

  if (deal.deal_status !== 'estimate_approved') {
    return c.json({ error: 'この案件は既に工事決定済みまたは別のステータスです' }, 400)
  }

  await c.env.DB.prepare(
    `UPDATE deal_tracking SET deal_status = 'contracted', updated_at = datetime('now') WHERE id = ?`
  ).bind(id).run()

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_table, target_id, detail)
     VALUES (?, ?, 'deal_contract_confirmed', 'deal_tracking', ?, ?)`
  ).bind(generateId(), user.userId, id, JSON.stringify({
    confirmed_by: user.displayName || user.userId,
    old_status: 'estimate_approved',
    new_status: 'contracted'
  })).run()

  return c.json({ message: '工事決定を確定しました' })
})

// 見送り（トラッキング済み案件を失注に変更）
dealRoutes.post('/:id/dismiss', async (c) => {
  const user = await getAdminOrApprover(c)
  if (!user) return c.json({ error: '権限が必要です' }, 403)

  const id = c.req.param('id')
  const deal = await c.env.DB.prepare('SELECT * FROM deal_tracking WHERE id = ?').bind(id).first()
  if (!deal) return c.json({ error: '案件が見つかりません' }, 404)

  if (deal.deal_status !== 'estimate_approved') {
    return c.json({ error: 'この案件は既に処理済みです' }, 400)
  }

  await c.env.DB.prepare(
    `UPDATE deal_tracking SET deal_status = 'lost', updated_at = datetime('now') WHERE id = ?`
  ).bind(id).run()

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_table, target_id, detail)
     VALUES (?, ?, 'deal_dismissed', 'deal_tracking', ?, ?)`
  ).bind(generateId(), user.userId, id, JSON.stringify({
    dismissed_by: user.displayName || user.userId,
    old_status: 'estimate_approved',
    new_status: 'lost'
  })).run()

  return c.json({ message: 'この案件を見送りにしました' })
})

// 入金追加
dealRoutes.post('/:id/payments', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const dealId = c.req.param('id')
  const deal = await c.env.DB.prepare('SELECT id FROM deal_tracking WHERE id = ?').bind(dealId).first()
  if (!deal) return c.json({ error: '案件が見つかりません' }, 404)

  const { payment_type, label, expected_amount, expected_date, actual_amount, actual_date, invoice_date, notes } = await c.req.json()

  if (!payment_type || !label) return c.json({ error: '入金種別とラベルは必須です' }, 400)

  const id = generateId()
  await c.env.DB.prepare(
    `INSERT INTO deal_payments (id, deal_id, payment_type, label, expected_amount, expected_date, actual_amount, actual_date, invoice_date, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, dealId, payment_type, label,
    expected_amount || null, expected_date || null,
    actual_amount || null, actual_date || null,
    invoice_date || null, notes || null
  ).run()

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_table, target_id, detail)
     VALUES (?, ?, 'payment_added', 'deal_payments', ?, ?)`
  ).bind(generateId(), admin.userId, id, JSON.stringify({ deal_id: dealId, label, payment_type })).run()

  return c.json({ id, message: '入金情報を追加しました' })
})

// 入金更新
dealRoutes.post('/:id/payments/:paymentId/update', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const paymentId = c.req.param('paymentId')
  const body = await c.req.json()
  const { payment_type, label, expected_amount, expected_date, actual_amount, actual_date, invoice_date, notes } = body

  await c.env.DB.prepare(
    `UPDATE deal_payments SET
      payment_type = COALESCE(?, payment_type),
      label = COALESCE(?, label),
      expected_amount = ?,
      expected_date = ?,
      actual_amount = ?,
      actual_date = ?,
      invoice_date = ?,
      notes = ?,
      updated_at = datetime('now')
    WHERE id = ?`
  ).bind(
    payment_type || null, label || null,
    expected_amount !== undefined ? (expected_amount || null) : null,
    expected_date || null,
    actual_amount !== undefined ? (actual_amount || null) : null,
    actual_date || null,
    invoice_date || null,
    notes !== undefined ? (notes || null) : null,
    paymentId
  ).run()

  return c.json({ message: '入金情報を更新しました' })
})

// 入金削除
dealRoutes.post('/:id/payments/:paymentId/delete', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const paymentId = c.req.param('paymentId')
  await c.env.DB.prepare('DELETE FROM deal_payments WHERE id = ?').bind(paymentId).run()

  return c.json({ message: '入金情報を削除しました' })
})

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

async function getAdminOrApprover(c: any) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const payload = await verifyToken(authHeader.substring(7))
  if (!payload) return null
  if (!hasRole(payload.role, 'admin') && !hasRole(payload.role, 'approver')) return null
  return payload
}

async function getUser(c: any) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  return await verifyToken(authHeader.substring(7))
}

export const partnerRoutes = new Hono<{ Bindings: Bindings }>()

// ====== 協力会社一覧（全ユーザー閲覧可能） ======
partnerRoutes.get('/', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: '認証が必要です' }, 401)

  const keyword = c.req.query('keyword') || ''
  const activeOnly = c.req.query('active') !== '0'

  let where = activeOnly ? 'is_active = 1' : '1=1'
  const params: any[] = []

  if (keyword) {
    where += ' AND (company_name LIKE ? OR trade_type LIKE ? OR representative_name LIKE ?)'
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
  }

  const partners = await c.env.DB.prepare(
    `SELECT * FROM partner_companies WHERE ${where} ORDER BY company_name ASC`
  ).bind(...params).all()

  return c.json({ partners: partners.results })
})

// ====== 協力会社 詳細 ======
partnerRoutes.get('/:id', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: '認証が必要です' }, 401)

  const id = c.req.param('id')
  const partner = await c.env.DB.prepare(
    'SELECT * FROM partner_companies WHERE id = ?'
  ).bind(id).first()

  if (!partner) return c.json({ error: '協力会社が見つかりません' }, 404)

  // この会社が関わっている案件一覧
  const deals = await c.env.DB.prepare(
    `SELECT dp.*, d.deal_status, r.title, r.client_name, r.request_number
     FROM deal_partners dp
     JOIN deal_tracking d ON dp.deal_id = d.id
     JOIN requests r ON d.request_id = r.id
     WHERE dp.partner_id = ?
     ORDER BY dp.created_at DESC`
  ).bind(id).all()

  return c.json({ partner, deals: deals.results })
})

// ====== 協力会社 登録（管理者のみ） ======
partnerRoutes.post('/create', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const body = await c.req.json()
  const { company_name, representative_name, phone, address, trade_type, notes } = body

  if (!company_name?.trim()) {
    return c.json({ error: '会社名は必須です' }, 400)
  }

  const id = generateId()
  await c.env.DB.prepare(
    `INSERT INTO partner_companies (id, company_name, representative_name, phone, address, trade_type, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, company_name.trim(), representative_name || null, phone || null, address || null, trade_type || null, notes || null).run()

  return c.json({ id, message: '協力会社を登録しました' })
})

// ====== 協力会社 更新（管理者のみ） ======
partnerRoutes.post('/:id/update', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const id = c.req.param('id')
  const body = await c.req.json()
  const { company_name, representative_name, phone, address, trade_type, notes, is_active } = body

  if (!company_name?.trim()) {
    return c.json({ error: '会社名は必須です' }, 400)
  }

  await c.env.DB.prepare(
    `UPDATE partner_companies SET
       company_name = ?, representative_name = ?, phone = ?, address = ?,
       trade_type = ?, notes = ?, is_active = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).bind(
    company_name.trim(), representative_name || null, phone || null, address || null,
    trade_type || null, notes || null, is_active !== undefined ? is_active : 1, id
  ).run()

  return c.json({ message: '協力会社を更新しました' })
})

// ====== 協力会社 削除/無効化（管理者のみ） ======
partnerRoutes.post('/:id/delete', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const id = c.req.param('id')

  // 案件で使用中かチェック
  const usage = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM deal_partners WHERE partner_id = ?'
  ).bind(id).first()

  if ((usage?.cnt as number) > 0) {
    // 使用中なら無効化のみ
    await c.env.DB.prepare(
      "UPDATE partner_companies SET is_active = 0, updated_at = datetime('now') WHERE id = ?"
    ).bind(id).run()
    return c.json({ message: '案件で使用中のため無効化しました' })
  }

  await c.env.DB.prepare('DELETE FROM partner_companies WHERE id = ?').bind(id).run()
  return c.json({ message: '協力会社を削除しました' })
})

// ====== 案件の協力会社一覧 ======
partnerRoutes.get('/deal/:dealId', async (c) => {
  const user = await getAdminOrApprover(c)
  if (!user) return c.json({ error: '権限が必要です' }, 403)

  const dealId = c.req.param('dealId')
  const partners = await c.env.DB.prepare(
    `SELECT dp.*, pc.company_name, pc.representative_name, pc.phone, pc.trade_type
     FROM deal_partners dp
     JOIN partner_companies pc ON dp.partner_id = pc.id
     WHERE dp.deal_id = ?
     ORDER BY dp.role ASC, pc.company_name ASC`
  ).bind(dealId).all()

  return c.json({ partners: partners.results })
})

// ====== 案件に協力会社を追加 ======
partnerRoutes.post('/deal/:dealId/add', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const dealId = c.req.param('dealId')
  const body = await c.req.json()
  const { partner_id, role, contract_amount, notes } = body

  if (!partner_id || !role) {
    return c.json({ error: '協力会社と役割は必須です' }, 400)
  }
  if (!['prime_contractor', 'subcontractor'].includes(role)) {
    return c.json({ error: '役割が不正です' }, 400)
  }

  const id = generateId()
  await c.env.DB.prepare(
    `INSERT INTO deal_partners (id, deal_id, partner_id, role, contract_amount, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, dealId, partner_id, role, contract_amount || null, notes || null).run()

  return c.json({ id, message: '協力会社を追加しました' })
})

// ====== 案件の協力会社を更新 ======
partnerRoutes.post('/deal-partner/:dpId/update', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const dpId = c.req.param('dpId')
  const body = await c.req.json()
  const { contract_amount, notes, role } = body

  await c.env.DB.prepare(
    `UPDATE deal_partners SET
       contract_amount = ?, notes = ?, role = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).bind(
    contract_amount !== undefined ? contract_amount : null,
    notes || null,
    role || 'subcontractor',
    dpId
  ).run()

  return c.json({ message: '協力会社情報を更新しました' })
})

// ====== 案件から協力会社を削除 ======
partnerRoutes.post('/deal-partner/:dpId/delete', async (c) => {
  const admin = await getAdminUser(c)
  if (!admin) return c.json({ error: '管理者権限が必要です' }, 403)

  const dpId = c.req.param('dpId')
  await c.env.DB.prepare('DELETE FROM deal_partners WHERE id = ?').bind(dpId).run()
  return c.json({ message: '協力会社を削除しました' })
})

import { Hono } from 'hono'
import { verifyToken, generateId, hasRole } from '../utils/helpers'

type Bindings = { DB: D1Database }

const STAGES = ['inquiry', 'survey', 'estimating', 'submitted', 'negotiation', 'won', 'lost'] as const
const STAGE_LABELS: Record<string, string> = {
  inquiry: '問合せ',
  survey: '現調・ヒアリング',
  estimating: '見積作成中',
  submitted: '見積提出済',
  negotiation: '交渉中',
  won: '受注確定',
  lost: '見送り'
}

async function getAdminOrApprover(c: any) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const payload = await verifyToken(authHeader.substring(7))
  if (!payload) return null
  if (!hasRole(payload.role, 'admin') && !hasRole(payload.role, 'approver')) return null
  return payload
}

export const leadRoutes = new Hono<{ Bindings: Bindings }>()

// リード一覧
leadRoutes.get('/', async (c) => {
  const user = await getAdminOrApprover(c)
  if (!user) return c.json({ error: '権限が必要です' }, 403)

  const stage = c.req.query('stage') || ''
  const owner = c.req.query('owner') || ''
  const keyword = c.req.query('keyword') || ''

  let where = '1=1'
  const params: any[] = []

  if (stage) {
    where += ' AND l.stage = ?'
    params.push(stage)
  }
  if (owner) {
    where += ' AND l.owner_id = ?'
    params.push(owner)
  }
  if (keyword) {
    where += ' AND (l.lead_name LIKE ? OR l.client_name LIKE ?)'
    params.push(`%${keyword}%`, `%${keyword}%`)
  }

  const leads = await c.env.DB.prepare(
    `SELECT l.*, p.display_name as owner_name, pc.company_name as prime_contractor_name
     FROM leads l
     JOIN profiles p ON l.owner_id = p.id
     LEFT JOIN partner_companies pc ON l.prime_contractor_id = pc.id
     WHERE ${where}
     ORDER BY l.updated_at DESC`
  ).bind(...params).all()

  // ステージ別サマリ
  const summary = await c.env.DB.prepare(
    `SELECT stage, COUNT(*) as count, COALESCE(SUM(estimated_amount), 0) as total_amount
     FROM leads WHERE stage NOT IN ('won','lost')
     GROUP BY stage`
  ).bind().all()

  return c.json({
    leads: leads.results,
    summary: summary.results,
    stage_labels: STAGE_LABELS
  })
})

// リード詳細
leadRoutes.get('/:id', async (c) => {
  const user = await getAdminOrApprover(c)
  if (!user) return c.json({ error: '権限が必要です' }, 403)

  const id = c.req.param('id')
  const lead = await c.env.DB.prepare(
    `SELECT l.*, p.display_name as owner_name, pc.company_name as prime_contractor_name,
            cb.display_name as created_by_name
     FROM leads l
     JOIN profiles p ON l.owner_id = p.id
     LEFT JOIN partner_companies pc ON l.prime_contractor_id = pc.id
     JOIN profiles cb ON l.created_by = cb.id
     WHERE l.id = ?`
  ).bind(id).first()

  if (!lead) return c.json({ error: 'リードが見つかりません' }, 404)

  // 活動ログ
  const activities = await c.env.DB.prepare(
    `SELECT la.*, p.display_name as user_name
     FROM lead_activities la
     JOIN profiles p ON la.created_by = p.id
     WHERE la.lead_id = ?
     ORDER BY la.created_at DESC`
  ).bind(id).all()

  // 紐づく申請情報
  let linkedRequest = null
  if ((lead as any).request_id) {
    linkedRequest = await c.env.DB.prepare(
      `SELECT r.id, r.request_number, r.title, r.status, r.amount_with_tax, r.type
       FROM requests r WHERE r.id = ?`
    ).bind((lead as any).request_id).first()
  }

  return c.json({
    lead,
    activities: activities.results,
    linkedRequest,
    stage_labels: STAGE_LABELS
  })
})

// リード作成
leadRoutes.post('/create', async (c) => {
  const user = await getAdminOrApprover(c)
  if (!user) return c.json({ error: '権限が必要です' }, 403)

  const body = await c.req.json()
  const { lead_name, client_name, contact_info, estimated_amount, estimated_profit_rate, stage, probability, source, prime_contractor_id, notes, expected_date, owner_id } = body

  if (!lead_name || lead_name.trim() === '') {
    return c.json({ error: '案件名は必須です' }, 400)
  }

  const validStage = stage && STAGES.includes(stage) ? stage : 'inquiry'
  const ownerId = owner_id || user.userId

  // probability validation
  if (probability !== undefined && probability !== null && probability !== '') {
    const p = parseInt(probability)
    if (isNaN(p) || p < 0 || p > 100) {
      return c.json({ error: '受注確度は0〜100で入力してください' }, 400)
    }
  }

  // profit rate validation
  if (estimated_profit_rate !== undefined && estimated_profit_rate !== null && estimated_profit_rate !== '') {
    const r = parseFloat(estimated_profit_rate)
    if (isNaN(r) || r < 0 || r > 100) {
      return c.json({ error: '想定粗利率は0〜100で入力してください' }, 400)
    }
  }

  const id = generateId()
  await c.env.DB.prepare(
    `INSERT INTO leads (id, lead_name, client_name, contact_info, estimated_amount, estimated_profit_rate, stage, probability, source, prime_contractor_id, notes, expected_date, owner_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, lead_name.trim(), client_name || null, contact_info || null,
    estimated_amount || null, estimated_profit_rate !== undefined && estimated_profit_rate !== null && estimated_profit_rate !== '' ? parseFloat(estimated_profit_rate) : null,
    validStage,
    probability !== undefined && probability !== null && probability !== '' ? parseInt(probability) : null,
    source || null, prime_contractor_id || null, notes || null, expected_date || null,
    ownerId, user.userId
  ).run()

  // 活動ログ
  await c.env.DB.prepare(
    `INSERT INTO lead_activities (id, lead_id, activity_type, content, created_by)
     VALUES (?, ?, 'stage_change', ?, ?)`
  ).bind(generateId(), id, `リードを作成しました（${STAGE_LABELS[validStage]}）`, user.userId).run()

  return c.json({ id, message: 'リードを登録しました' })
})

// リード更新
leadRoutes.post('/:id/update', async (c) => {
  const user = await getAdminOrApprover(c)
  if (!user) return c.json({ error: '権限が必要です' }, 403)

  const id = c.req.param('id')
  const existing = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(id).first()
  if (!existing) return c.json({ error: 'リードが見つかりません' }, 404)

  const body = await c.req.json()
  const { lead_name, client_name, contact_info, estimated_amount, estimated_profit_rate, stage, probability, source, prime_contractor_id, notes, expected_date, owner_id, request_id } = body

  if (!lead_name || lead_name.trim() === '') {
    return c.json({ error: '案件名は必須です' }, 400)
  }

  const validStage = stage && STAGES.includes(stage) ? stage : existing.stage as string

  await c.env.DB.prepare(
    `UPDATE leads SET lead_name=?, client_name=?, contact_info=?, estimated_amount=?, estimated_profit_rate=?,
     stage=?, probability=?, source=?, prime_contractor_id=?, notes=?, expected_date=?, owner_id=?, request_id=?,
     updated_at=datetime('now') WHERE id = ?`
  ).bind(
    lead_name.trim(), client_name || null, contact_info || null,
    estimated_amount || null,
    estimated_profit_rate !== undefined && estimated_profit_rate !== null && estimated_profit_rate !== '' ? parseFloat(estimated_profit_rate) : null,
    validStage,
    probability !== undefined && probability !== null && probability !== '' ? parseInt(probability) : null,
    source || null, prime_contractor_id || null, notes || null, expected_date || null,
    owner_id || existing.owner_id, request_id !== undefined ? (request_id || null) : (existing.request_id as any),
    id
  ).run()

  // ステージ変更があれば活動ログ
  if (validStage !== existing.stage) {
    await c.env.DB.prepare(
      `INSERT INTO lead_activities (id, lead_id, activity_type, content, created_by)
       VALUES (?, ?, 'stage_change', ?, ?)`
    ).bind(generateId(), id, `${STAGE_LABELS[existing.stage as string]} → ${STAGE_LABELS[validStage]}`, user.userId).run()
  }

  return c.json({ message: 'リードを更新しました' })
})

// ステージ変更（一覧から直接）
leadRoutes.post('/:id/stage', async (c) => {
  const user = await getAdminOrApprover(c)
  if (!user) return c.json({ error: '権限が必要です' }, 403)

  const id = c.req.param('id')
  const { stage } = await c.req.json()

  if (!stage || !STAGES.includes(stage)) {
    return c.json({ error: '無効なステージです' }, 400)
  }

  const existing = await c.env.DB.prepare('SELECT stage FROM leads WHERE id = ?').bind(id).first()
  if (!existing) return c.json({ error: 'リードが見つかりません' }, 404)

  if (existing.stage === stage) return c.json({ message: '変更なし' })

  await c.env.DB.prepare(
    `UPDATE leads SET stage = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(stage, id).run()

  await c.env.DB.prepare(
    `INSERT INTO lead_activities (id, lead_id, activity_type, content, created_by)
     VALUES (?, ?, 'stage_change', ?, ?)`
  ).bind(generateId(), id, `${STAGE_LABELS[existing.stage as string]} → ${STAGE_LABELS[stage]}`, user.userId).run()

  return c.json({ message: 'ステージを更新しました' })
})

// メモ追加
leadRoutes.post('/:id/note', async (c) => {
  const user = await getAdminOrApprover(c)
  if (!user) return c.json({ error: '権限が必要です' }, 403)

  const id = c.req.param('id')
  const { content } = await c.req.json()

  if (!content || content.trim() === '') {
    return c.json({ error: 'メモ内容を入力してください' }, 400)
  }

  const existing = await c.env.DB.prepare('SELECT id FROM leads WHERE id = ?').bind(id).first()
  if (!existing) return c.json({ error: 'リードが見つかりません' }, 404)

  await c.env.DB.prepare(
    `INSERT INTO lead_activities (id, lead_id, activity_type, content, created_by)
     VALUES (?, ?, 'note', ?, ?)`
  ).bind(generateId(), id, content.trim(), user.userId).run()

  // updated_atも更新
  await c.env.DB.prepare(
    `UPDATE leads SET updated_at = datetime('now') WHERE id = ?`
  ).bind(id).run()

  return c.json({ message: 'メモを追加しました' })
})

// リード削除
leadRoutes.post('/:id/delete', async (c) => {
  const user = await getAdminOrApprover(c)
  if (!user) return c.json({ error: '権限が必要です' }, 403)

  const id = c.req.param('id')
  const existing = await c.env.DB.prepare('SELECT id FROM leads WHERE id = ?').bind(id).first()
  if (!existing) return c.json({ error: 'リードが見つかりません' }, 404)

  await c.env.DB.prepare('DELETE FROM lead_activities WHERE lead_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM leads WHERE id = ?').bind(id).run()

  return c.json({ message: 'リードを削除しました' })
})

// ダッシュボード集計
leadRoutes.get('/dashboard/summary', async (c) => {
  const user = await getAdminOrApprover(c)
  if (!user) return c.json({ error: '権限が必要です' }, 403)

  // 確定案件（deal_tracking: contracted以上）
  const confirmedDeals = await c.env.DB.prepare(
    `SELECT d.id, d.deal_status, r.title, r.client_name, r.amount as amount_excl_tax, r.amount_with_tax,
            r.gross_profit_rate, r.tax_rate,
            COALESCE(SUM(dp.contract_amount), 0) as subcontractor_cost
     FROM deal_tracking d
     JOIN requests r ON d.request_id = r.id
     LEFT JOIN deal_partners dp ON d.id = dp.deal_id
     WHERE d.deal_status != 'lost'
     GROUP BY d.id`
  ).bind().all()

  // 確定案件の集計
  let confirmedRevenue = 0
  let confirmedProfit = 0
  const confirmedList = (confirmedDeals.results || []).map((d: any) => {
    const revenue = d.amount_excl_tax || 0
    const profitRate = d.gross_profit_rate || 0
    const profit = revenue * (profitRate / 100)
    confirmedRevenue += revenue
    confirmedProfit += profit
    return {
      id: d.id,
      type: 'confirmed',
      name: d.title,
      client: d.client_name,
      amount: revenue,
      amount_with_tax: d.amount_with_tax,
      profit_rate: profitRate,
      profit_amount: Math.round(profit),
      subcontractor_cost: d.subcontractor_cost,
      status: d.deal_status
    }
  })

  // 進行中リード（won/lost以外）
  const activeLeads = await c.env.DB.prepare(
    `SELECT l.id, l.lead_name, l.client_name, l.estimated_amount, l.estimated_profit_rate, l.stage, l.probability,
            p.display_name as owner_name
     FROM leads l
     JOIN profiles p ON l.owner_id = p.id
     WHERE l.stage NOT IN ('won','lost')`
  ).bind().all()

  let leadRevenue = 0
  let leadProfit = 0
  const leadList = (activeLeads.results || []).map((l: any) => {
    const revenue = l.estimated_amount || 0
    const profitRate = l.estimated_profit_rate || 0
    const profit = revenue * (profitRate / 100)
    leadRevenue += revenue
    leadProfit += profit
    return {
      id: l.id,
      type: 'lead',
      name: l.lead_name,
      client: l.client_name || '-',
      amount: revenue,
      profit_rate: profitRate,
      profit_amount: Math.round(profit),
      stage: l.stage,
      stage_label: STAGE_LABELS[l.stage] || l.stage,
      probability: l.probability,
      owner: l.owner_name
    }
  })

  // ステージ別パイプライン
  const pipeline = await c.env.DB.prepare(
    `SELECT stage, COUNT(*) as count, COALESCE(SUM(estimated_amount), 0) as total_amount
     FROM leads
     WHERE stage NOT IN ('won','lost')
     GROUP BY stage
     ORDER BY CASE stage
       WHEN 'inquiry' THEN 1
       WHEN 'survey' THEN 2
       WHEN 'estimating' THEN 3
       WHEN 'submitted' THEN 4
       WHEN 'negotiation' THEN 5
     END`
  ).bind().all()

  const totalRevenue = confirmedRevenue + leadRevenue
  const totalProfit = confirmedProfit + leadProfit

  return c.json({
    confirmed: { revenue: Math.round(confirmedRevenue), profit: Math.round(confirmedProfit), count: confirmedList.length },
    leads: { revenue: Math.round(leadRevenue), profit: Math.round(leadProfit), count: leadList.length },
    total: {
      revenue: Math.round(totalRevenue),
      profit: Math.round(totalProfit),
      profit_rate: totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 1000) / 10 : 0
    },
    details: [...confirmedList, ...leadList],
    pipeline: (pipeline.results || []).map((p: any) => ({
      ...p,
      stage_label: STAGE_LABELS[p.stage] || p.stage
    })),
    stage_labels: STAGE_LABELS
  })
})

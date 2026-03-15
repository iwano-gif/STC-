import { Hono } from 'hono'
import { verifyToken, hasRole } from '../utils/helpers'

type Bindings = { DB: D1Database }

async function getUser(c: any) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  return await verifyToken(authHeader.substring(7))
}

export const dashboardRoutes = new Hono<{ Bindings: Bindings }>()

dashboardRoutes.get('/', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: '認証が必要です' }, 401)

  const isAdmin = hasRole(user.role, 'admin')

  // Summary counts
  let pendingCount, completedCount, rejectedCount

  if (isAdmin) {
    pendingCount = await c.env.DB.prepare("SELECT COUNT(*) as c FROM requests WHERE status = 'pending'").first()
    completedCount = await c.env.DB.prepare("SELECT COUNT(*) as c FROM requests WHERE status IN ('completed','processed')").first()
    rejectedCount = await c.env.DB.prepare("SELECT COUNT(*) as c FROM requests WHERE status = 'rejected'").first()
  } else {
    pendingCount = await c.env.DB.prepare("SELECT COUNT(*) as c FROM requests WHERE applicant_id = ? AND status = 'pending'").bind(user.userId).first()
    completedCount = await c.env.DB.prepare("SELECT COUNT(*) as c FROM requests WHERE applicant_id = ? AND status IN ('completed','processed')").bind(user.userId).first()
    rejectedCount = await c.env.DB.prepare("SELECT COUNT(*) as c FROM requests WHERE applicant_id = ? AND status = 'rejected'").bind(user.userId).first()
  }

  // Pending approvals for this user
  const pendingApprovals = await c.env.DB.prepare(
    `SELECT s.id as step_id, s.step_order, s.approver_label,
            r.id as request_id, r.request_number, r.type, r.title, r.client_name, 
            r.amount, r.amount_with_tax, r.created_at,
            p.display_name as applicant_name
     FROM approval_steps s
     JOIN requests r ON s.request_id = r.id
     JOIN profiles p ON r.applicant_id = p.id
     WHERE s.approver_id = ? AND s.status = 'waiting' AND r.status = 'pending'
       AND s.version = r.version
       AND s.step_order = r.current_step
     ORDER BY r.created_at DESC
     LIMIT 10`
  ).bind(user.userId).all()

  // Recent own requests
  const recentRequests = await c.env.DB.prepare(
    `SELECT r.*, 
       (SELECT s.approver_label FROM approval_steps s 
        WHERE s.request_id = r.id AND s.version = r.version AND s.step_order = r.current_step LIMIT 1) as current_approver
     FROM requests r
     WHERE r.applicant_id = ?
     ORDER BY r.created_at DESC
     LIMIT 10`
  ).bind(user.userId).all()

  return c.json({
    summary: {
      pending: pendingCount?.c || 0,
      completed: completedCount?.c || 0,
      rejected: rejectedCount?.c || 0
    },
    pendingApprovals: pendingApprovals.results,
    recentRequests: recentRequests.results
  })
})

// Approver-eligible users list (for admin forms)
dashboardRoutes.get('/approver-candidates', async (c) => {
  const user = await getUser(c)
  if (!user || !hasRole(user.role, 'admin')) return c.json({ error: '管理者権限が必要です' }, 403)

  const users = await c.env.DB.prepare(
    "SELECT id, email, display_name, role FROM profiles WHERE is_active = 1 AND role LIKE '%approver%'"
  ).bind().all()

  return c.json({ users: users.results })
})

// All active users (for reassignment)
dashboardRoutes.get('/active-users', async (c) => {
  const user = await getUser(c)
  if (!user || !hasRole(user.role, 'admin')) return c.json({ error: '管理者権限が必要です' }, 403)

  const users = await c.env.DB.prepare(
    'SELECT id, email, display_name, role FROM profiles WHERE is_active = 1'
  ).bind().all()

  return c.json({ users: users.results })
})

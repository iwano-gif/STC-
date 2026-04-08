import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authRoutes } from './api/auth'
import { requestRoutes } from './api/requests'
import { approvalRoutes } from './api/approvals'
import { adminRoutes } from './api/admin'
import { dashboardRoutes } from './api/dashboard'
import { fileRoutes } from './api/files'
import { dealRoutes } from './api/deals'
import { renderPage } from './pages/layout'

type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors())

// グローバルエラーハンドラ: 全APIエラーをJSON形式で返す
app.onError((err, c) => {
  console.error('Unhandled error:', err.message, err.stack)
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: err.message || 'サーバーエラーが発生しました' }, 500)
  }
  return c.html(renderPage())
})

// API routes
app.route('/api/auth', authRoutes)
app.route('/api/requests', requestRoutes)
app.route('/api/approvals', approvalRoutes)
app.route('/api/admin', adminRoutes)
app.route('/api/dashboard', dashboardRoutes)
app.route('/api/files', fileRoutes)
app.route('/api/deals', dealRoutes)

// SPA - serve the main page for all non-API routes
app.get('*', (c) => {
  return c.html(renderPage())
})

export default app

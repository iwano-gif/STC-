import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authRoutes } from './api/auth'
import { requestRoutes } from './api/requests'
import { approvalRoutes } from './api/approvals'
import { adminRoutes } from './api/admin'
import { dashboardRoutes } from './api/dashboard'
import { fileRoutes } from './api/files'
import { renderPage } from './pages/layout'

type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors())

// API routes
app.route('/api/auth', authRoutes)
app.route('/api/requests', requestRoutes)
app.route('/api/approvals', approvalRoutes)
app.route('/api/admin', adminRoutes)
app.route('/api/dashboard', dashboardRoutes)
app.route('/api/files', fileRoutes)

// SPA - serve the main page for all non-API routes
app.get('*', (c) => {
  return c.html(renderPage())
})

export default app

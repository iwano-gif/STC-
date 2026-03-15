import { Hono } from 'hono'
import { generateId, hashPassword, verifyPassword, createToken, verifyToken } from '../utils/helpers'

type Bindings = { DB: D1Database }

export const authRoutes = new Hono<{ Bindings: Bindings }>()

// ログイン
authRoutes.post('/login', async (c) => {
  const { email, password } = await c.req.json()
  if (!email || !password) {
    return c.json({ error: 'ログインIDとパスワードを入力してください' }, 400)
  }

  const user = await c.env.DB.prepare(
    'SELECT * FROM profiles WHERE email = ? AND is_active = 1'
  ).bind(email).first()

  if (!user) {
    return c.json({ error: 'ログインIDまたはパスワードが正しくありません' }, 401)
  }

  const valid = await verifyPassword(password, user.password_hash as string)
  if (!valid) {
    return c.json({ error: 'ログインIDまたはパスワードが正しくありません' }, 401)
  }

  const token = await createToken({
    userId: user.id,
    email: user.email,
    displayName: user.display_name,
    role: user.role
  })

  return c.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      role: JSON.parse(user.role as string)
    }
  })
})

// 現在のユーザー情報取得
authRoutes.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: '認証が必要です' }, 401)
  }

  const payload = await verifyToken(authHeader.substring(7))
  if (!payload) {
    return c.json({ error: 'トークンが無効です' }, 401)
  }

  const user = await c.env.DB.prepare(
    'SELECT id, email, display_name, role, is_active FROM profiles WHERE id = ?'
  ).bind(payload.userId).first()

  if (!user || !user.is_active) {
    return c.json({ error: 'ユーザーが見つかりません' }, 404)
  }

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      role: JSON.parse(user.role as string)
    }
  })
})

// パスワード変更
authRoutes.post('/change-password', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: '認証が必要です' }, 401)
  }

  const payload = await verifyToken(authHeader.substring(7))
  if (!payload) {
    return c.json({ error: 'トークンが無効です' }, 401)
  }

  const { currentPassword, newPassword } = await c.req.json()
  if (!currentPassword || !newPassword) {
    return c.json({ error: '現在のパスワードと新しいパスワードを入力してください' }, 400)
  }

  if (newPassword.length < 8) {
    return c.json({ error: 'パスワードは8文字以上で入力してください' }, 400)
  }

  const user = await c.env.DB.prepare(
    'SELECT * FROM profiles WHERE id = ?'
  ).bind(payload.userId).first()

  if (!user) {
    return c.json({ error: 'ユーザーが見つかりません' }, 404)
  }

  const valid = await verifyPassword(currentPassword, user.password_hash as string)
  if (!valid) {
    return c.json({ error: '現在のパスワードが正しくありません' }, 401)
  }

  const newHash = await hashPassword(newPassword)
  await c.env.DB.prepare(
    'UPDATE profiles SET password_hash = ? WHERE id = ?'
  ).bind(newHash, payload.userId).run()

  return c.json({ message: 'パスワードを変更しました' })
})

import { Hono } from 'hono'
import { verifyToken, generateId, hasRole } from '../utils/helpers'

type Bindings = { DB: D1Database }

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_MIME_TYPES = ['application/pdf']

async function getUser(c: any) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  return await verifyToken(authHeader.substring(7))
}

export const fileRoutes = new Hono<{ Bindings: Bindings }>()

// PDFアップロード
fileRoutes.post('/upload', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: '認証が必要です' }, 401)

  try {
    const formData = await c.req.formData()
    const requestId = formData.get('request_id') as string
    const file = formData.get('file') as File | null

    if (!requestId) {
      return c.json({ error: '申請IDが必要です' }, 400)
    }

    // Check request exists and user has access
    const request = await c.env.DB.prepare(
      'SELECT * FROM requests WHERE id = ?'
    ).bind(requestId).first()

    if (!request) {
      return c.json({ error: '申請が見つかりません' }, 404)
    }

    // Only applicant, admin can upload files
    const isApplicant = request.applicant_id === user.userId
    const isAdmin = hasRole(user.role, 'admin')
    if (!isApplicant && !isAdmin) {
      return c.json({ error: 'ファイルのアップロード権限がありません' }, 403)
    }

    // Only allow upload to pending or rejected requests
    if (request.status !== 'pending' && request.status !== 'rejected') {
      return c.json({ error: 'この申請にはファイルをアップロードできません' }, 400)
    }

    if (!file) {
      return c.json({ error: 'ファイルが選択されていません' }, 400)
    }

    // Validate file name extension
    const fileName = file.name || ''
    if (!fileName.toLowerCase().endsWith('.pdf')) {
      return c.json({ error: 'PDFファイル（.pdf）のみアップロード可能です' }, 400)
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return c.json({ error: 'PDFファイル（application/pdf）のみアップロード可能です' }, 400)
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return c.json({ error: 'ファイルサイズは10MB以下にしてください' }, 400)
    }

    // Validate PDF header (magic bytes)
    const arrayBuffer = await file.arrayBuffer()
    const header = new Uint8Array(arrayBuffer.slice(0, 5))
    const pdfMagic = String.fromCharCode(...header)
    if (!pdfMagic.startsWith('%PDF-')) {
      return c.json({ error: '有効なPDFファイルではありません' }, 400)
    }

    // Check max files per request (limit to 10)
    const fileCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM request_files WHERE request_id = ?'
    ).bind(requestId).first()
    if (fileCount && (fileCount.cnt as number) >= 10) {
      return c.json({ error: '1つの申請につき最大10ファイルまでアップロードできます' }, 400)
    }

    const fileId = generateId()

    // Store file data as BLOB in D1
    await c.env.DB.prepare(
      `INSERT INTO request_files (id, request_id, file_name, file_path, file_size, mime_type, file_data)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      fileId,
      requestId,
      fileName,
      `db://${fileId}`, // file_path now points to internal storage
      file.size,
      file.type,
      arrayBuffer
    ).run()

    // Audit log
    await c.env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, target_table, target_id, detail)
       VALUES (?, ?, 'file_uploaded', 'request_files', ?, ?)`
    ).bind(generateId(), user.userId, fileId, JSON.stringify({
      request_id: requestId,
      file_name: fileName,
      file_size: file.size
    })).run()

    return c.json({
      id: fileId,
      file_name: fileName,
      file_size: file.size,
      mime_type: file.type,
      message: 'ファイルをアップロードしました'
    })
  } catch (err: any) {
    console.error('File upload error:', err)
    return c.json({ error: 'ファイルのアップロードに失敗しました: ' + (err.message || '') }, 500)
  }
})

// PDFダウンロード
fileRoutes.get('/:fileId/download', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: '認証が必要です' }, 401)

  const fileId = c.req.param('fileId')

  const file = await c.env.DB.prepare(
    'SELECT * FROM request_files WHERE id = ?'
  ).bind(fileId).first()

  if (!file) {
    return c.json({ error: 'ファイルが見つかりません' }, 404)
  }

  // Check access: applicant, approver on this request, admin, or clerk
  const request = await c.env.DB.prepare(
    'SELECT * FROM requests WHERE id = ?'
  ).bind(file.request_id).first()

  if (!request) {
    return c.json({ error: '申請が見つかりません' }, 404)
  }

  const isAdmin = hasRole(user.role, 'admin')
  const isApplicant = request.applicant_id === user.userId
  const isClerk = hasRole(user.role, 'clerk')
  const isApprover = await c.env.DB.prepare(
    'SELECT 1 FROM approval_steps WHERE request_id = ? AND approver_id = ?'
  ).bind(file.request_id, user.userId).first()

  if (!isAdmin && !isApplicant && !isClerk && !isApprover) {
    return c.json({ error: 'アクセス権限がありません' }, 403)
  }

  if (!file.file_data) {
    return c.json({ error: 'ファイルデータが見つかりません' }, 404)
  }

  // D1 returns BLOB as ArrayBuffer or Buffer-like object
  let responseData: ArrayBuffer | Uint8Array
  if (file.file_data instanceof ArrayBuffer) {
    responseData = file.file_data
  } else if (ArrayBuffer.isView(file.file_data)) {
    responseData = (file.file_data as Uint8Array).buffer
  } else {
    // Fallback: try to convert from whatever D1 returns
    responseData = new Uint8Array(file.file_data as any).buffer
  }

  return new Response(responseData, {
    headers: {
      'Content-Type': file.mime_type as string || 'application/pdf',
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.file_name as string)}"`,
      'Content-Length': String(responseData.byteLength || file.file_size),
      'Cache-Control': 'private, max-age=3600'
    }
  })
})

// PDFプレビュー用（ブラウザ内でPDFを表示）
// iframe対応のためクエリパラメータでもトークンを受け付ける
fileRoutes.get('/:fileId/preview', async (c) => {
  // Try Authorization header first, then query parameter token
  let user = await getUser(c)
  if (!user) {
    const queryToken = c.req.query('token')
    if (queryToken) {
      user = await verifyToken(queryToken)
    }
  }
  if (!user) return c.json({ error: '認証が必要です' }, 401)

  const fileId = c.req.param('fileId')

  const file = await c.env.DB.prepare(
    'SELECT * FROM request_files WHERE id = ?'
  ).bind(fileId).first()

  if (!file) {
    return c.json({ error: 'ファイルが見つかりません' }, 404)
  }

  // Access check (same as download)
  const request = await c.env.DB.prepare(
    'SELECT * FROM requests WHERE id = ?'
  ).bind(file.request_id).first()

  if (!request) {
    return c.json({ error: '申請が見つかりません' }, 404)
  }

  const isAdmin = hasRole(user.role, 'admin')
  const isApplicant = request.applicant_id === user.userId
  const isClerk = hasRole(user.role, 'clerk')
  const isApprover = await c.env.DB.prepare(
    'SELECT 1 FROM approval_steps WHERE request_id = ? AND approver_id = ?'
  ).bind(file.request_id, user.userId).first()

  if (!isAdmin && !isApplicant && !isClerk && !isApprover) {
    return c.json({ error: 'アクセス権限がありません' }, 403)
  }

  if (!file.file_data) {
    return c.json({ error: 'ファイルデータが見つかりません' }, 404)
  }

  let responseData: ArrayBuffer | Uint8Array
  if (file.file_data instanceof ArrayBuffer) {
    responseData = file.file_data
  } else if (ArrayBuffer.isView(file.file_data)) {
    responseData = (file.file_data as Uint8Array).buffer
  } else {
    responseData = new Uint8Array(file.file_data as any).buffer
  }

  return new Response(responseData, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.file_name as string)}"`,
      'Content-Length': String(responseData.byteLength || file.file_size),
      'Cache-Control': 'private, max-age=3600'
    }
  })
})

// ファイル削除
fileRoutes.post('/:fileId/delete', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: '認証が必要です' }, 401)

  const fileId = c.req.param('fileId')

  const file = await c.env.DB.prepare(
    'SELECT * FROM request_files WHERE id = ?'
  ).bind(fileId).first()

  if (!file) {
    return c.json({ error: 'ファイルが見つかりません' }, 404)
  }

  // Check request exists
  const request = await c.env.DB.prepare(
    'SELECT * FROM requests WHERE id = ?'
  ).bind(file.request_id).first()

  if (!request) {
    return c.json({ error: '申請が見つかりません' }, 404)
  }

  // Only applicant or admin can delete files
  const isApplicant = request.applicant_id === user.userId
  const isAdmin = hasRole(user.role, 'admin')
  if (!isApplicant && !isAdmin) {
    return c.json({ error: 'ファイルの削除権限がありません' }, 403)
  }

  // Only allow delete on pending or rejected requests
  if (request.status !== 'pending' && request.status !== 'rejected') {
    return c.json({ error: '承認済みの申請からファイルを削除できません' }, 400)
  }

  await c.env.DB.prepare('DELETE FROM request_files WHERE id = ?').bind(fileId).run()

  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, user_id, action, target_table, target_id, detail)
     VALUES (?, ?, 'file_deleted', 'request_files', ?, ?)`
  ).bind(generateId(), user.userId, fileId, JSON.stringify({
    request_id: file.request_id,
    file_name: file.file_name
  })).run()

  return c.json({ message: 'ファイルを削除しました' })
})

// 申請の添付ファイル一覧（メタデータのみ、file_dataは含まない）
fileRoutes.get('/list/:requestId', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: '認証が必要です' }, 401)

  const requestId = c.req.param('requestId')

  const files = await c.env.DB.prepare(
    'SELECT id, request_id, file_name, file_size, mime_type, uploaded_at FROM request_files WHERE request_id = ? ORDER BY uploaded_at ASC'
  ).bind(requestId).all()

  return c.json({ files: files.results })
})

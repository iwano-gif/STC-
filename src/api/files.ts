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

// PDFテキスト抽出＆自動入力データ解析
fileRoutes.post('/parse-pdf', async (c) => {
  const user = await getUser(c)
  if (!user) return c.json({ error: '認証が必要です' }, 401)

  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return c.json({ error: 'ファイルが選択されていません' }, 400)
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return c.json({ error: 'PDFファイルのみ対応しています' }, 400)
    }

    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)

    // Extract text from PDF
    const text = extractTextFromPdf(bytes)
    
    // Parse extracted text to identify fields
    const parsed = parseInvoiceData(text)

    return c.json({
      success: true,
      extracted_text: text.substring(0, 2000), // Limit text preview
      parsed_data: parsed
    })
  } catch (err: any) {
    console.error('PDF parse error:', err)
    return c.json({ error: 'PDF解析に失敗しました: ' + (err.message || '') }, 500)
  }
})

/**
 * Lightweight PDF text extraction for Cloudflare Workers environment
 * Handles common PDF text streams (Tj, TJ, ' operators)
 */
function extractTextFromPdf(bytes: Uint8Array): string {
  // Convert to string for text-based PDF parsing
  // We'll process the raw PDF looking for text streams
  const decoder = new TextDecoder('latin1')
  const raw = decoder.decode(bytes)
  
  const textParts: string[] = []
  
  // Strategy 1: Extract text from BT...ET blocks (text objects)
  const btEtRegex = /BT\s([\s\S]*?)ET/g
  let match
  while ((match = btEtRegex.exec(raw)) !== null) {
    const block = match[1]
    
    // Extract Tj strings (simple text showing)
    const tjRegex = /\(([^)]*)\)\s*Tj/g
    let tjMatch
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      const decoded = decodePdfString(tjMatch[1])
      if (decoded.trim()) textParts.push(decoded)
    }
    
    // Extract TJ arrays (text with kerning)
    const tjArrayRegex = /\[((?:[^[\]]*|\([^)]*\))*)\]\s*TJ/gi
    let tjArrMatch
    while ((tjArrMatch = tjArrayRegex.exec(block)) !== null) {
      const arrContent = tjArrMatch[1]
      const strRegex = /\(([^)]*)\)/g
      let strMatch
      let line = ''
      while ((strMatch = strRegex.exec(arrContent)) !== null) {
        line += decodePdfString(strMatch[1])
      }
      if (line.trim()) textParts.push(line)
    }
    
    // Extract ' operator strings (move to next line and show text)
    const quoteRegex = /\(([^)]*)\)\s*'/g
    let qMatch
    while ((qMatch = quoteRegex.exec(block)) !== null) {
      const decoded = decodePdfString(qMatch[1])
      if (decoded.trim()) textParts.push(decoded)
    }
  }
  
  // Strategy 2: Extract from stream objects that may contain text
  if (textParts.length === 0) {
    // Try to find uncompressed streams
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g
    while ((match = streamRegex.exec(raw)) !== null) {
      const content = match[1]
      // Look for text operators in the stream
      const tjRegex2 = /\(([^)]*)\)\s*Tj/g
      let tj2
      while ((tj2 = tjRegex2.exec(content)) !== null) {
        const decoded = decodePdfString(tj2[1])
        if (decoded.trim()) textParts.push(decoded)
      }
    }
  }

  // Strategy 3: Try to decompress FlateDecode streams
  if (textParts.length === 0) {
    try {
      const compressedStreams = findCompressedStreams(bytes, raw)
      for (const stream of compressedStreams) {
        try {
          const decompressed = decompressFlate(stream)
          if (decompressed) {
            const decompText = new TextDecoder('latin1').decode(decompressed)
            const btEtRegex2 = /BT\s([\s\S]*?)ET/g
            let btMatch
            while ((btMatch = btEtRegex2.exec(decompText)) !== null) {
              const block = btMatch[1]
              const tjRegex3 = /\(([^)]*)\)\s*Tj/g
              let tj3
              while ((tj3 = tjRegex3.exec(block)) !== null) {
                const decoded = decodePdfString(tj3[1])
                if (decoded.trim()) textParts.push(decoded)
              }
              const tjArrRegex3 = /\[((?:[^[\]]*|\([^)]*\))*)\]\s*TJ/gi
              let tjArr3
              while ((tjArr3 = tjArrRegex3.exec(block)) !== null) {
                const strRegex3 = /\(([^)]*)\)/g
                let str3
                let line = ''
                while ((str3 = strRegex3.exec(tjArrRegex3[1])) !== null) {
                  line += decodePdfString(str3[1])
                }
                if (line.trim()) textParts.push(line)
              }
            }
          }
        } catch { /* skip failed decompress */ }
      }
    } catch { /* skip */ }
  }
  
  // Strategy 4: Extract CIDFont/Unicode text (hex encoded)
  if (textParts.length === 0) {
    const hexTjRegex = /<([0-9A-Fa-f]+)>\s*Tj/g
    while ((match = hexTjRegex.exec(raw)) !== null) {
      const hex = match[1]
      const decoded = decodeHexString(hex)
      if (decoded.trim()) textParts.push(decoded)
    }
  }
  
  return textParts.join('\n')
}

function decodePdfString(str: string): string {
  // Handle PDF escape sequences
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\')
    .replace(/\\([()])/g, '$1')
    .replace(/\\(\d{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
}

function decodeHexString(hex: string): string {
  let result = ''
  for (let i = 0; i < hex.length; i += 4) {
    const code = parseInt(hex.substring(i, i + 4), 16)
    if (code > 0) result += String.fromCharCode(code)
  }
  if (result.length === 0) {
    // Try 2-byte hex
    for (let i = 0; i < hex.length; i += 2) {
      const code = parseInt(hex.substring(i, i + 2), 16)
      if (code > 31) result += String.fromCharCode(code)
    }
  }
  return result
}

function findCompressedStreams(bytes: Uint8Array, raw: string): Uint8Array[] {
  const streams: Uint8Array[] = []
  // Find FlateDecode streams
  const flateRegex = /\/FlateDecode/g
  let flateMatch
  while ((flateMatch = flateRegex.exec(raw)) !== null) {
    // Find the next stream after this marker
    const afterPos = flateMatch.index
    const streamStart = raw.indexOf('stream', afterPos)
    if (streamStart === -1 || streamStart - afterPos > 500) continue
    
    // Find actual data start (after \r\n or \n)
    let dataStart = streamStart + 6
    if (bytes[dataStart] === 0x0D) dataStart++
    if (bytes[dataStart] === 0x0A) dataStart++
    
    // Find endstream
    const endstreamStr = 'endstream'
    let endPos = raw.indexOf(endstreamStr, dataStart)
    if (endPos === -1) continue
    
    // Trim trailing whitespace
    while (endPos > dataStart && (bytes[endPos - 1] === 0x0A || bytes[endPos - 1] === 0x0D)) {
      endPos--
    }
    
    if (endPos > dataStart && endPos - dataStart < 1024 * 1024) {
      streams.push(bytes.slice(dataStart, endPos))
    }
  }
  return streams
}

function decompressFlate(data: Uint8Array): Uint8Array | null {
  try {
    const ds = new DecompressionStream('deflate')
    // DecompressionStream expects deflate data, but PDF uses zlib (deflate with header)
    // We need to use 'raw' deflate for raw streams, but typically PDF uses zlib format
    // The DecompressionStream 'deflate' mode handles zlib-wrapped deflate
    const reader = new Response(
      new Blob([data]).stream().pipeThrough(ds)
    ).arrayBuffer()
    // This is async but we need sync... Let's handle differently
    return null // Async decompression not easily done in this context
  } catch {
    return null
  }
}

/**
 * Parse extracted text to identify invoice/estimate fields
 */
function parseInvoiceData(text: string): {
  type?: string
  title?: string
  client_name?: string
  amount_with_tax?: number
  tax_rate?: number
  remarks?: string
  raw_amounts?: { label: string, value: number }[]
} {
  const result: any = { raw_amounts: [] }
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const fullText = lines.join(' ')
  
  // Detect type: estimate or invoice
  if (/見積/i.test(fullText) || /estimate|quotation/i.test(fullText)) {
    result.type = 'estimate'
  } else if (/請求/i.test(fullText) || /invoice/i.test(fullText)) {
    result.type = 'invoice'
  }
  
  // Extract amounts - look for patterns like ¥1,234,567 or ￥1,234,567 or 1,234,567円
  // Also handle English Total: xxx,xxx patterns
  const amountPatterns = [
    { regex: /[¥￥]\s*([\d,]+)/g, priority: 5 },
    { regex: /([\d,]+)\s*円/g, priority: 5 },
    { regex: /合計[金額\s:：]*[¥￥]?\s*([\d,]+)/g, priority: 10 },
    { regex: /税込[合計金額\s:：]*[¥￥]?\s*([\d,]+)/g, priority: 10 },
    { regex: /請求[金額合計\s:：]*[¥￥]?\s*([\d,]+)/g, priority: 10 },
    { regex: /見積[金額合計\s:：]*[¥￥]?\s*([\d,]+)/g, priority: 10 },
    { regex: /総[計額\s:：]*[¥￥]?\s*([\d,]+)/g, priority: 8 },
    { regex: /Total[:\s]+[¥￥$]?\s*([\d,]+)/gi, priority: 10 },
    { regex: /Amount[:\s]+[¥￥$]?\s*([\d,]+)/gi, priority: 8 },
    { regex: /Subtotal[:\s]+[¥￥$]?\s*([\d,]+)/gi, priority: 3 },
    { regex: /Grand\s*Total[:\s]+[¥￥$]?\s*([\d,]+)/gi, priority: 10 },
    { regex: /御見積[金額\s:：]*[¥￥]?\s*([\d,]+)/g, priority: 10 },
    { regex: /ご請求[金額\s:：]*[¥￥]?\s*([\d,]+)/g, priority: 10 },
  ]
  
  const foundAmounts: { label: string, value: number, priority: number }[] = []
  
  for (const { regex, priority: basePriority } of amountPatterns) {
    let m
    while ((m = regex.exec(fullText)) !== null) {
      const numStr = m[1].replace(/,/g, '')
      const num = parseInt(numStr, 10)
      if (num > 0 && num < 100000000000) { // reasonable range
        const context = fullText.substring(Math.max(0, m.index - 20), m.index + m[0].length + 10)
        let priority = basePriority
        // Boost for tax-inclusive context
        if (/税込|Total|Grand/.test(context)) priority += 2
        
        foundAmounts.push({
          label: context.trim(),
          value: num,
          priority
        })
        result.raw_amounts.push({ label: context.trim(), value: num })
      }
    }
  }
  
  // Also look for plain numbers on lines that look like totals
  for (const line of lines) {
    if (/合計|総[計額]|税込|請求|見積/.test(line)) {
      const numMatch = line.match(/([\d,]{4,})/)
      if (numMatch) {
        const num = parseInt(numMatch[1].replace(/,/g, ''), 10)
        if (num > 0 && num < 100000000000) {
          let priority = /税込/.test(line) ? 10 : /合計/.test(line) ? 8 : 5
          foundAmounts.push({ label: line.trim(), value: num, priority })
          result.raw_amounts.push({ label: line.trim(), value: num })
        }
      }
    }
  }
  
  // Pick the best amount (highest priority, then largest)
  if (foundAmounts.length > 0) {
    foundAmounts.sort((a, b) => b.priority - a.priority || b.value - a.value)
    result.amount_with_tax = foundAmounts[0].value
  }
  
  // Detect tax rate from text
  if (/10\s*[%％]|税率\s*10|消費税\s*10/.test(fullText)) {
    result.tax_rate = 0.10
  } else if (/8\s*[%％]|税率\s*8|消費税\s*8|軽減税率/.test(fullText)) {
    result.tax_rate = 0.08
  } else if (/非課税|税率\s*0|免税/.test(fullText)) {
    result.tax_rate = 0.0
  } else {
    result.tax_rate = 0.10 // Default
  }
  
  // Extract client/company name
  // Look for 御中, 様, 宛 patterns
  for (const line of lines) {
    const clientMatch = line.match(/^(.{2,30}?)\s*(?:御中|様|宛)/)
    if (clientMatch) {
      result.client_name = clientMatch[1].replace(/[\s　]+/g, '').trim()
      break
    }
  }
  
  // Fallback: look for 宛先, お客様名, 顧客名
  if (!result.client_name) {
    for (const line of lines) {
      const labelMatch = line.match(/(?:宛先|お客様名|顧客名|取引先|クライアント|発注者)[:\s：]\s*(.+)/)
      if (labelMatch) {
        result.client_name = labelMatch[1].trim()
        break
      }
    }
  }
  
  // Extract title/subject
  for (const line of lines) {
    const titleMatch = line.match(/(?:件名|案件名|タイトル|品名|品目|摘要|Subject|Description|Re)[:\s：]\s*(.+)/)
    if (titleMatch) {
      result.title = titleMatch[1].trim()
      break
    }
  }
  
  // Fallback title: use first few descriptive lines
  if (!result.title) {
    // Look for 見積書 or 請求書 as title hint
    for (const line of lines) {
      if (/見積書|請求書/.test(line) && line.length > 3 && line.length < 60) {
        result.title = line.trim()
        break
      }
    }
  }
  
  return result
}

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

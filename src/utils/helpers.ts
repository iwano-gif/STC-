// Utility functions for the workflow system

export function generateId(): string {
  return crypto.randomUUID()
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const computed = await hashPassword(password)
  return computed === hash
}

// Base64URL encode/decode that handles UTF-8
function base64UrlEncode(str: string): string {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(str)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4 !== 0) base64 += '='
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}

// Simple JWT-like token using HMAC-SHA256
const SECRET = 'workflow-system-secret-key-2026'

export async function createToken(payload: Record<string, any>): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64UrlEncode(JSON.stringify({ ...payload, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 }))
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${body}`))
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${header}.${body}.${sig}`
}

export async function verifyToken(token: string): Promise<Record<string, any> | null> {
  try {
    const [header, body, sig] = token.split('.')
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    )
    let sigBase64 = sig.replace(/-/g, '+').replace(/_/g, '/')
    while (sigBase64.length % 4 !== 0) sigBase64 += '='
    const signatureBytes = Uint8Array.from(atob(sigBase64), c => c.charCodeAt(0))
    const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(`${header}.${body}`))
    if (!valid) return null
    const payload = JSON.parse(base64UrlDecode(body))
    if (payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export function parseRoles(roleStr: string): string[] {
  try {
    return JSON.parse(roleStr)
  } catch {
    return ['applicant']
  }
}

export function hasRole(roleStr: string, role: string): boolean {
  return parseRoles(roleStr).includes(role)
}

export function formatCurrency(amount: number): string {
  return `¥${amount.toLocaleString()}`
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

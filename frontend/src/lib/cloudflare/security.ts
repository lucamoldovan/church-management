import { getD1 } from '@/lib/cloudflare/db'
import type { AuthContext } from '@/lib/cloudflare/auth-context'

async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function clientIp(request: Request) {
  return request.headers.get('cf-connecting-ip')
    || request.headers.get('x-real-ip')
    || 'unknown'
}

export async function consumeRateLimit(
  request: Request,
  bucket: string,
  maxRequests: number,
  windowSeconds: number,
) {
  const ipHash = await digest(clientIp(request))
  const key = `${bucket}:${ipHash}`
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + windowSeconds
  const db = getD1()

  await db.prepare(`
    INSERT INTO rate_limits (key, window_start, request_count, expires_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      window_start = CASE WHEN rate_limits.expires_at <= ? THEN excluded.window_start ELSE rate_limits.window_start END,
      request_count = CASE WHEN rate_limits.expires_at <= ? THEN 1 ELSE rate_limits.request_count + 1 END,
      expires_at = CASE WHEN rate_limits.expires_at <= ? THEN excluded.expires_at ELSE rate_limits.expires_at END
  `).bind(key, now, expiresAt, now, now, now).run()

  const row = await db.prepare('SELECT request_count, expires_at FROM rate_limits WHERE key = ?').bind(key).first<{ request_count: number; expires_at: number }>()
  const allowed = Boolean(row && row.request_count <= maxRequests)
  return {
    allowed,
    retryAfter: row ? Math.max(0, row.expires_at - now) : windowSeconds,
  }
}

export function rateLimited(retryAfter: number) {
  return new Response(JSON.stringify({ error: 'Too many requests' }), {
    status: 429,
    headers: {
      'content-type': 'application/json',
      'retry-after': String(Math.max(1, retryAfter)),
    },
  })
}

export async function writeAuditLog(
  auth: Pick<AuthContext, 'user'> | null,
  action: string,
  resource: string,
  resourceId?: string | null,
  metadata: Record<string, unknown> = {},
) {
  try {
    await getD1().prepare(
      'INSERT INTO audit_logs (id, user_id, action, resource, resource_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      crypto.randomUUID(),
      auth?.user.id ?? null,
      action,
      resource,
      resourceId ?? null,
      JSON.stringify(metadata),
      new Date().toISOString(),
    ).run()
  } catch (error) {
    console.error('[audit-log]', error)
  }
}

export async function cleanupExpiredRateLimits() {
  try {
    await getD1().prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(Math.floor(Date.now() / 1000)).run()
  } catch {}
}

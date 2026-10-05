/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAuthClient } from 'better-auth/client'

export const authClient = createAuthClient({ basePath: '/api/auth' })

type Filter = { op: string; column: string; value?: unknown }
type Order = { column: string; ascending: boolean }

type ExecutePayload = {
  table: string
  operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert'
  columns?: string
  values?: unknown
  filters?: Filter[]
  or?: string
  orders?: Order[]
  limit?: number
  offset?: number
  single?: boolean
  maybeSingle?: boolean
}

function authError(error: unknown) {
  if (!error) return null
  if (error instanceof Error) return { message: error.message, code: 'AUTH_ERROR' }
  return { message: String(error), code: 'AUTH_ERROR' }
}

class QueryBuilder<T = any> implements PromiseLike<{ data: T; error: any; count?: number }> {
  private payload: ExecutePayload
  private transport: (payload: ExecutePayload) => Promise<any>

  constructor(table: string, transport: (payload: ExecutePayload) => Promise<any>) {
    this.transport = transport
    this.payload = { table, operation: 'select', filters: [], orders: [] }
  }

  select(columns = '*') {
    this.payload.columns = columns
    return this
  }

  insert(values: Record<string, unknown> | Record<string, unknown>[]) {
    this.payload.operation = 'insert'
    this.payload.values = values
    return this
  }

  update(values: Record<string, unknown>) {
    this.payload.operation = 'update'
    this.payload.values = values
    return this
  }

  upsert(values: Record<string, unknown> | Record<string, unknown>[], _options?: unknown) {
    this.payload.operation = 'upsert'
    this.payload.values = values
    return this
  }

  delete() {
    this.payload.operation = 'delete'
    return this
  }

  eq(column: string, value: unknown) { this.payload.filters!.push({ op: 'eq', column, value }); return this }
  neq(column: string, value: unknown) { this.payload.filters!.push({ op: 'neq', column, value }); return this }
  gt(column: string, value: unknown) { this.payload.filters!.push({ op: 'gt', column, value }); return this }
  gte(column: string, value: unknown) { this.payload.filters!.push({ op: 'gte', column, value }); return this }
  lt(column: string, value: unknown) { this.payload.filters!.push({ op: 'lt', column, value }); return this }
  lte(column: string, value: unknown) { this.payload.filters!.push({ op: 'lte', column, value }); return this }
  like(column: string, value: unknown) { this.payload.filters!.push({ op: 'like', column, value }); return this }
  ilike(column: string, value: unknown) { this.payload.filters!.push({ op: 'ilike', column, value }); return this }
  is(column: string, value: unknown) { this.payload.filters!.push({ op: 'is', column, value }); return this }
  in(column: string, value: unknown[]) { this.payload.filters!.push({ op: 'in', column, value }); return this }
  or(expression: string) { this.payload.or = expression; return this }
  order(column: string, options?: { ascending?: boolean }) {
    this.payload.orders!.push({ column, ascending: options?.ascending !== false })
    return this
  }
  limit(value: number) { this.payload.limit = value; return this }
  range(from: number, to: number) { this.payload.offset = from; this.payload.limit = Math.max(0, to - from + 1); return this }
  single() { this.payload.single = true; return this }
  maybeSingle() { this.payload.maybeSingle = true; return this }

  then<TResult1 = { data: T; error: any; count?: number }, TResult2 = never>(
    onfulfilled?: ((value: { data: T; error: any; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.transport(this.payload).then(onfulfilled as any, onrejected as any)
  }
}

class StorageBucket {
  constructor(private bucket: string) {}

  async upload(path: string, file: File, _options?: unknown) {
    const form = new FormData()
    form.append('bucket', this.bucket)
    form.append('path', path)
    form.append('file', file)
    const response = await fetch('/api/storage', { method: 'POST', body: form })
    const body = await response.json().catch(() => ({}))
    return response.ok ? { data: { path }, error: null } : { data: null, error: body.error || { message: 'Upload failed' } }
  }

  getPublicUrl(path: string) {
    const encoded = path.split('/').map(encodeURIComponent).join('/')
    return { data: { publicUrl: `${window.location.origin}/api/storage/${encodeURIComponent(this.bucket)}/${encoded}` } }
  }

  async remove(paths: string[]) {
    const response = await fetch('/api/storage', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket: this.bucket, paths }),
    })
    const body = await response.json().catch(() => ({}))
    return response.ok ? { data: paths, error: null } : { data: null, error: body.error || { message: 'Delete failed' } }
  }
}

export function createClient() {
  const transport = async (payload: ExecutePayload) => {
    const response = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) return { data: null, error: body.error || { message: 'Database request failed' } }
    return body
  }

  return {
    from<T = any>(table: string) { return new QueryBuilder<T>(table, transport) },
    auth: {
      async getUser() {
        const result = await authClient.getSession()
        if (result.error) return { data: { user: null }, error: authError(result.error) }
        const user = result.data?.user
        return { data: { user: user ? { id: user.id, email: user.email, user_metadata: { full_name: user.name } } : null }, error: null }
      },
      async getSession() {
        const result = await authClient.getSession()
        return { data: { session: result.data }, error: result.error ? authError(result.error) : null }
      },
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        const result = await authClient.signIn.email({ email, password })
        return { data: result.data, error: result.error ? authError(result.error) : null }
      },
      async signUp({ email, password, options }: { email: string; password: string; options?: { data?: { full_name?: string } } }) {
        const result = await authClient.signUp.email({ email, password, name: options?.data?.full_name || email.split('@')[0] })
        return { data: result.data, error: result.error ? authError(result.error) : null }
      },
      async signInWithOAuth({ provider, options }: { provider: 'google'; options?: { redirectTo?: string } }) {
        const result = await authClient.signIn.social({ provider, callbackURL: options?.redirectTo || '/dashboard' })
        return { data: result.data, error: result.error ? authError(result.error) : null }
      },
      async signOut() {
        const result = await authClient.signOut()
        return { error: result.error ? authError(result.error) : null }
      },
      async resetPasswordForEmail(email: string, options?: { redirectTo?: string }) {
        const result = await authClient.requestPasswordReset({ email, redirectTo: options?.redirectTo || '/update-password' })
        return { data: result.data, error: result.error ? authError(result.error) : null }
      },
      async updateUser({ password, currentPassword }: { password?: string; currentPassword?: string }) {
        if (!password) return { data: null, error: { message: 'Password is required', code: 'VALIDATION_ERROR' } }
        const token = new URLSearchParams(window.location.search).get('token')
        if (token) {
          const result = await authClient.resetPassword({ newPassword: password, token })
          return { data: result.data, error: result.error ? authError(result.error) : null }
        }
        if (!currentPassword) return { data: null, error: { message: 'Current password is required', code: 'VALIDATION_ERROR' } }
        const result = await authClient.changePassword({ newPassword: password, currentPassword, revokeOtherSessions: false })
        return { data: result.data, error: result.error ? authError(result.error) : null }
      },
    },
    storage: {
      from(bucket: string) { return new StorageBucket(bucket) },
    },
  }
}

'use client'

import { authClient } from '@/lib/auth-client'

type Filter = { op: string; field: string; value?: unknown; operator?: string }
type QueryResult<T = any> = { data: T; error: Error | null; count?: number | null }

class ClientQuery<T = any> implements PromiseLike<QueryResult<T>> {
  private filters: Filter[] = []
  private action: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private columns = '*'
  private payload: any
  private orderBy: { field: string; ascending: boolean } | undefined
  private limitValue: number | undefined
  private singleMode: 'single' | 'maybeSingle' | undefined
  private orValue: string | undefined
  private countMode: 'exact' | undefined
  private headMode = false

  constructor(private table: string) {}

  select(columns = '*', options?: { count?: 'exact'; head?: boolean }) {
    this.columns = columns; this.action = 'select'
    this.countMode = options?.count; this.headMode = options?.head === true
    return this
  }
  insert(payload: any) { this.action = 'insert'; this.payload = payload; return this }
  update(payload: any) { this.action = 'update'; this.payload = payload; return this }
  upsert(payload: any) { this.action = 'upsert'; this.payload = payload; return this }
  delete() { this.action = 'delete'; return this }
  eq(field: string, value: unknown) { this.filters.push({ op: 'eq', field, value }); return this }
  neq(field: string, value: unknown) { this.filters.push({ op: 'neq', field, value }); return this }
  ilike(field: string, value: unknown) { this.filters.push({ op: 'ilike', field, value }); return this }
  is(field: string, value: unknown) { this.filters.push({ op: 'is', field, value }); return this }
  in(field: string, values: unknown[]) { this.filters.push({ op: 'in', field, value: values }); return this }
  not(field: string, operator: string, value: unknown) { this.filters.push({ op: 'not', field, value, operator }); return this }
  order(field: string, options?: { ascending?: boolean }) {
    this.orderBy = { field, ascending: options?.ascending !== false }; return this
  }
  limit(value: number) { this.limitValue = value; return this }
  single() { this.singleMode = 'single'; return this }
  maybeSingle() { this.singleMode = 'maybeSingle'; return this }
  or(value: string) { this.orValue = value; return this }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<QueryResult<any>> {
    try {
      const response = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: this.table, action: this.action, columns: this.columns, filters: this.filters,
          order: this.orderBy, limit: this.limitValue, single: this.singleMode, or: this.orValue,
          payload: this.payload, count: this.countMode, head: this.headMode,
        }),
      })
      const body = (await response.json()) as { data?: any; error?: any; count?: number | null }
      if (!response.ok || body.error) {
        return { data: null, error: new Error(body.error?.message || body.error || 'Database error'), count: body.count ?? null }
      }
      return { data: body.data ?? null, error: null, count: body.count ?? null }
    } catch (error) {
      return { data: null, error: error instanceof Error ? error : new Error('Database error'), count: null }
    }
  }
}

function storage() {
  return {
    from(bucket: string) {
      return {
        async upload(path: string, file: File) {
          const form = new FormData()
          form.set('bucket', bucket); form.set('path', path); form.set('file', file)
          const response = await fetch('/api/storage', { method: 'POST', body: form })
          const body = (await response.json()) as { data?: any; error?: any }
          return { data: body.data ?? null, error: response.ok ? null : new Error(body.error?.message || body.error || 'Upload failed') }
        },
        getPublicUrl(path: string) {
          return { data: { publicUrl: `${window.location.origin}/api/storage?path=${encodeURIComponent(path)}` } }
        },
      }
    },
  }
}

export function createClient() {
  return {
    from: <T = any>(table: string) => new ClientQuery<T>(table),
    auth: {
      getUser: async () => {
        const result = await authClient.getSession()
        return {
          data: { user: result.data?.user ? { id: result.data.user.id, email: result.data.user.email, name: result.data.user.name } : null },
          error: result.error ? new Error(result.error.message) : null,
        }
      },
      getSession: async () => authClient.getSession(),
      signOut: async () => {
        const result = await authClient.signOut()
        return { error: result.error ? new Error(result.error.message) : null }
      },
    },
    storage: storage(),
  }
}

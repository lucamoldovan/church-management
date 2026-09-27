'use client'

import { authClient } from '@/lib/auth-client'

type Filter = { op: string; field: string; value?: unknown }

class ClientQuery {
  private filters: Filter[] = []
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private columns = '*'
  private payload: any
  private orderBy: { field: string; ascending: boolean } | undefined
  private limitValue: number | undefined
  private singleMode: 'single' | 'maybeSingle' | undefined

  constructor(private table: string) {}

  select(columns = '*') { this.columns = columns; this.action = 'select'; return this }
  insert(payload: any) { this.action = 'insert'; this.payload = payload; return this }
  update(payload: any) { this.action = 'update'; this.payload = payload; return this }
  delete() { this.action = 'delete'; return this }
  eq(field: string, value: unknown) { this.filters.push({ op: 'eq', field, value }); return this }
  neq(field: string, value: unknown) { this.filters.push({ op: 'neq', field, value }); return this }
  ilike(field: string, value: unknown) { this.filters.push({ op: 'ilike', field, value }); return this }
  is(field: string, value: unknown) { this.filters.push({ op: 'is', field, value }); return this }
  order(field: string, options?: { ascending?: boolean }) {
    this.orderBy = { field, ascending: options?.ascending !== false }
    return this
  }
  limit(value: number) { this.limitValue = value; return this }
  single() { this.singleMode = 'single'; return this }
  maybeSingle() { this.singleMode = 'maybeSingle'; return this }
  or(value: string) { (this as any).orValue = value; return this }

  then(resolve: any, reject?: any) {
    return this.execute().then(resolve, reject)
  }

  private async execute() {
    try {
      if (this.action === 'insert') {
        const response = await fetch('/api/db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: this.table, action: 'insert', payload: this.payload }),
        })
        const body = await response.json()
        return { data: body.data ?? null, error: body.error ? new Error(body.error.message || body.error) : null }
      }

      const response = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: this.table,
          action: this.action,
          columns: this.columns,
          filters: this.filters,
          order: this.orderBy,
          limit: this.limitValue,
          single: this.singleMode,
          or: (this as any).orValue,
          payload: this.payload,
        }),
      })
      const body = await response.json()
      if (!response.ok || body.error) {
        return { data: null, error: new Error(body.error?.message || body.error || 'Database error') }
      }
      return { data: body.data ?? null, error: null }
    } catch (error) {
      return { data: null, error: error instanceof Error ? error : new Error('Database error') }
    }
  }
}

function storage() {
  return {
    from(bucket: string) {
      return {
        async upload(path: string, file: File) {
          const form = new FormData()
          form.set('bucket', bucket)
          form.set('path', path)
          form.set('file', file)
          const response = await fetch('/api/storage', { method: 'POST', body: form })
          const body = await response.json()
          return { data: body.data ?? null, error: response.ok ? null : new Error(body.error || 'Upload failed') }
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
    from: (table: string) => new ClientQuery(table),
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

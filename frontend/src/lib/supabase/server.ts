import { getEnv } from '@/lib/cloudflare'
import { getAuth } from '@/lib/auth'
import { headers } from 'next/headers'

type Filter = { op: string; field: string; value?: unknown; operator?: string }
type QueryResult<T = any> = { data: T; error: Error | null; count?: number | null }
const ident = (s: string) => /^[A-Za-z_][A-Za-z0-9_.]*$/.test(s) ? s : null

export async function createClient() {
  const env = await getEnv()
  const auth = await getAuth()
  const session = await auth.api.getSession({ headers: await headers() })
  return {
    from: (table: string) => new ServerQuery<any>(env.CHURCH_DB, table),
    auth: { getUser: async () => ({
      data: { user: session?.user ? { id: session.user.id, email: session.user.email, name: session.user.name } : null },
      error: null,
    }) },
  }
}

class ServerQuery<T = any> implements PromiseLike<QueryResult<T>> {
  private filters: Filter[] = []
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private columns = '*'
  private payload: any
  private orderBy: { field: string; ascending: boolean } | undefined
  private limitValue?: number
  private singleMode: 'single' | 'maybeSingle' | undefined

  constructor(private db: D1Database, private table: string) {}

  select(c = '*', _options?: { count?: 'exact'; head?: boolean }) { this.columns = c; this.action = 'select'; return this }
  insert(p: any) { this.action = 'insert'; this.payload = p; return this }
  update(p: any) { this.action = 'update'; this.payload = p; return this }
  delete() { this.action = 'delete'; return this }
  eq(f: string, v: any) { this.filters.push({ op: 'eq', field: f, value: v }); return this }
  neq(f: string, v: any) { this.filters.push({ op: 'neq', field: f, value: v }); return this }
  ilike(f: string, v: any) { this.filters.push({ op: 'ilike', field: f, value: v }); return this }
  is(f: string, v: any) { this.filters.push({ op: 'is', field: f, value: v }); return this }
  in(f: string, v: any[]) { this.filters.push({ op: 'in', field: f, value: v }); return this }
  not(f: string, operator: string, v: any) { this.filters.push({ op: 'not', field: f, value: v, operator }); return this }
  order(f: string, o?: any) { this.orderBy = { field: f, ascending: o?.ascending !== false }; return this }
  limit(n: number) { this.limitValue = n; return this }
  single() { this.singleMode = 'single'; return this }
  maybeSingle() { this.singleMode = 'maybeSingle'; return this }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<QueryResult<any>> {
    try {
      if (this.action === 'select') {
        const clauses: string[] = [], binds: any[] = []
        for (const f of this.filters) {
          const field = ident(f.field); if (!field) continue
          if (f.op === 'eq') { clauses.push(field + ' = ?'); binds.push(f.value) }
          else if (f.op === 'neq') { clauses.push(field + ' != ?'); binds.push(f.value) }
          else if (f.op === 'ilike') { clauses.push('LOWER(' + field + ') LIKE LOWER(?)'); binds.push(f.value) }
          else if (f.op === 'is') clauses.push(field + (f.value === null ? ' IS NULL' : ' IS NOT NULL'))
          else if (f.op === 'in' && Array.isArray(f.value) && f.value.length) { clauses.push(field + ' IN (' + f.value.map(() => '?').join(',') + ')'); binds.push(...f.value) }
          else if (f.op === 'not' && f.operator === 'is' && f.value === null) clauses.push(field + ' IS NOT NULL')
        }
        const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : ''
        const order = this.orderBy?.field && ident(this.orderBy.field) ? ' ORDER BY ' + this.orderBy.field + (this.orderBy.ascending === false ? ' DESC' : ' ASC') : ''
        const limit = this.limitValue ? ' LIMIT ' + Math.min(this.limitValue, 500) : ''
        const cols = this.columns === '*' ? '*' : this.columns.split(',').map(x => ident(x.trim())).filter(Boolean).join(',')
        const r = await this.db.prepare('SELECT ' + (cols || '*') + ' FROM ' + this.table + where + order + limit).bind(...binds).all<any>()
        const rows = r.results || []
        if (this.singleMode === 'single') return { data: rows[0] || null, error: rows.length ? null : new Error('No rows returned') }
        return { data: this.singleMode === 'maybeSingle' ? rows[0] || null : rows, error: null }
      }
      if (this.action === 'insert') {
        const items = Array.isArray(this.payload) ? this.payload : [this.payload], out: any[] = []
        for (const input of items) {
          const row = { ...input }; row.id = row.id || crypto.randomUUID()
          const keys = Object.keys(row).filter(k => ident(k))
          await this.db.prepare('INSERT INTO ' + this.table + ' (' + keys.join(',') + ') VALUES (' + keys.map(() => '?').join(',') + ')').bind(...keys.map(k => row[k] ?? null)).run()
          out.push(row)
        }
        return { data: Array.isArray(this.payload) ? out : out[0] || null, error: null }
      }
      const clauses: string[] = [], binds: any[] = []
      for (const f of this.filters) { const field = ident(f.field); if (field && f.op === 'eq') { clauses.push(field + ' = ?'); binds.push(f.value) } }
      if (!clauses.length) return { data: null, error: new Error('A filter is required') }
      const where = ' WHERE ' + clauses.join(' AND ')
      if (this.action === 'delete') { await this.db.prepare('DELETE FROM ' + this.table + where).bind(...binds).run(); return { data: null, error: null } }
      const keys = Object.keys(this.payload || {}).filter(k => ident(k))
      await this.db.prepare('UPDATE ' + this.table + ' SET ' + keys.map(k => k + '=?').join(',') + where).bind(...keys.map(k => this.payload[k]), ...binds).run()
      return { data: null, error: null }
    } catch (e: any) { return { data: null, error: new Error(e?.message || 'Database error') }
    }
  }
}

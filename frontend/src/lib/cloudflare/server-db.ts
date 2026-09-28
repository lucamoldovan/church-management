import { getAuthContext } from '@/lib/auth'
import { executeDbOperation, getD1, type DbOperation } from '@/lib/cloudflare/db'

type Filter = { op: string; column: string; value?: unknown }
type Order = { column: string; ascending: boolean }

class QueryBuilder<T = any> implements PromiseLike<{ data: T; error: any; count?: number }> {
  private payload: DbOperation
  constructor(table: string) {
    this.payload = { table, operation: 'select', filters: [], orders: [] }
  }
  select(columns = '*') { this.payload.columns = columns; return this }
  insert(values: Record<string, unknown> | Record<string, unknown>[]) { this.payload.operation = 'insert'; this.payload.values = values; return this }
  update(values: Record<string, unknown>) { this.payload.operation = 'update'; this.payload.values = values; return this }
  upsert(values: Record<string, unknown> | Record<string, unknown>[], _options?: unknown) { this.payload.operation = 'upsert'; this.payload.values = values; return this }
  delete() { this.payload.operation = 'delete'; return this }
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
  order(column: string, options?: { ascending?: boolean }) { this.payload.orders!.push({ column, ascending: options?.ascending !== false }); return this }
  limit(value: number) { this.payload.limit = value; return this }
  range(from: number, to: number) { this.payload.offset = from; this.payload.limit = Math.max(0, to - from + 1); return this }
  single() { this.payload.single = true; return this }
  maybeSingle() { this.payload.maybeSingle = true; return this }
  then<TResult1 = { data: T; error: any; count?: number }, TResult2 = never>(onfulfilled?: ((value: { data: T; error: any; count?: number }) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null) {
    return (async () => {
      const auth = await getAuthContext()
      if (!auth) return { data: null, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }
      const result = await executeDbOperation(getD1(), this.payload)
      return result
    })().then(onfulfilled as any, onrejected as any)
  }
}

export async function createClient() {
  return {
    from<T = any>(table: string) { return new QueryBuilder<T>(table) },
  }
}

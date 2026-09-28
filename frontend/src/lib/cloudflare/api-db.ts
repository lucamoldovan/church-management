import { getD1 } from '@/lib/cloudflare/db'

export async function dbFindOne<T = Record<string, unknown>>(table: string, where: Record<string, unknown>): Promise<T | null> {
  const keys = Object.keys(where)
  if (!keys.length) throw new Error('A WHERE clause is required')
  const sql = `SELECT * FROM ${table} WHERE ${keys.map(k => `"${k.replaceAll('"', '""')}" = ?`).join(' AND ')} LIMIT 1`
  return await getD1().prepare(sql).bind(...keys.map(k => normalize(where[k]))).first<T>()
}

export async function dbFindMany<T = Record<string, unknown>>(table: string, where: Record<string, unknown> = {}, columns = '*'): Promise<T[]> {
  const keys = Object.keys(where)
  const sql = `SELECT ${columns} FROM ${table}${keys.length ? ` WHERE ${keys.map(k => `"${k.replaceAll('"', '""')}" = ?`).join(' AND ')}` : ''}`
  const result = await getD1().prepare(sql).bind(...keys.map(k => normalize(where[k]))).all<T>()
  return result.results || []
}

export async function dbUpdate(table: string, values: Record<string, unknown>, where: Record<string, unknown>) {
  const valueKeys = Object.keys(values)
  const whereKeys = Object.keys(where)
  if (!valueKeys.length || !whereKeys.length) throw new Error('Update requires values and WHERE')
  const sql = `UPDATE ${table} SET ${valueKeys.map(k => `"${k.replaceAll('"', '""')}" = ?`).join(', ')} WHERE ${whereKeys.map(k => `"${k.replaceAll('"', '""')}" = ?`).join(' AND ')}`
  return getD1().prepare(sql).bind(...valueKeys.map(k => normalize(values[k])), ...whereKeys.map(k => normalize(where[k]))).run()
}

export async function dbInsert(table: string, values: Record<string, unknown>) {
  const value = { ...values }
  if (!value.id) value.id = crypto.randomUUID()
  const now = new Date().toISOString()
  if (value.created_at === undefined) value.created_at = now
  if (value.updated_at === undefined) value.updated_at = now
  const keys = Object.keys(value)
  const sql = `INSERT INTO ${table} (${keys.map(k => `"${k.replaceAll('"', '""')}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  await getD1().prepare(sql).bind(...keys.map(k => normalize(value[k]))).run()
  return value
}

function normalize(value: unknown) {
  if (value === undefined) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object' && value !== null) return JSON.stringify(value)
  return value
}

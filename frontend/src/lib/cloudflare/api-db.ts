import { getD1 } from '@/lib/cloudflare/db'\n\nfunction identifier(value: string) {\n  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`Invalid identifier: ${value}`)\n  return value\n}\n\nconst CREATED_AT_TABLES = new Set([\n  'profiles', 'departments', 'events', 'event_packages', 'registrations', 'checkins',\n  'bracelets', 'study_groups', 'group_meetings', 'group_announcements', 'sermons',\n  'contact_messages', 'notifications', 'payment_transactions', 'service_plans',\n  'service_items', 'volunteer_assignments', 'connector_devices', 'production_events',\n  'control_center_layouts', 'audit_logs'\n])\n\nconst UPDATED_AT_TABLES = new Set([\n  'payment_transactions', 'integration_tokens', 'service_plans', 'service_items',\n  'connector_devices', 'live_production_state', 'control_center_layouts'\n])

export async function dbFindOne<T = Record<string, unknown>>(table: string, where: Record<string, unknown>): Promise<T | null> {
  const keys = Object.keys(where)
  if (!keys.length) throw new Error('A WHERE clause is required')
  const safeTable = identifier(table)\n  const safeKeys = keys.map(identifier)\n  const sql = `SELECT * FROM ${safeTable} WHERE ${safeKeys.map(k => `"${k}" = ?`).join(' AND ')} LIMIT 1`
  return await getD1().prepare(sql).bind(...keys.map(k => normalize(where[k]))).first<T>()
}

export async function dbFindMany<T = Record<string, unknown>>(table: string, where: Record<string, unknown> = {}, columns = '*'): Promise<T[]> {
  const keys = Object.keys(where)
  const safeTable = identifier(table)\n  const safeColumns = columns === '*' ? '*' : columns.split(',').map(identifier).join(', ')\n  const safeKeys = keys.map(identifier)\n  const sql = `SELECT ${safeColumns} FROM ${safeTable}${keys.length ? ` WHERE ${safeKeys.map(k => `"${k}" = ?`).join(' AND ')}` : ''}`
  const result = await getD1().prepare(sql).bind(...keys.map(k => normalize(where[k]))).all<T>()
  return result.results || []
}

export async function dbUpdate(table: string, values: Record<string, unknown>, where: Record<string, unknown>) {
  const valueKeys = Object.keys(values)
  const whereKeys = Object.keys(where)
  if (!valueKeys.length || !whereKeys.length) throw new Error('Update requires values and WHERE')
  const safeTable = identifier(table)\n  const safeValueKeys = valueKeys.map(identifier)\n  const safeWhereKeys = whereKeys.map(identifier)\n  const sql = `UPDATE ${safeTable} SET ${safeValueKeys.map(k => `"${k}" = ?`).join(', ')} WHERE ${safeWhereKeys.map(k => `"${k}" = ?`).join(' AND ')}`
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

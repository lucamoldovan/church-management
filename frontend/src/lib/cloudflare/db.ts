import { getCloudflareContext } from '@opennextjs/cloudflare'

export type DbUser = { id: string; email: string; role: string | null }

export function getD1(): D1Database {
  const { env } = getCloudflareContext()
  if (!env.CHURCH_DB) throw new Error('Cloudflare D1 binding CHURCH_DB is not configured.')
  return env.CHURCH_DB
}

const PUBLIC_READ_TABLES = new Set([
  'events', 'event_packages', 'sermons', 'social_media', 'social_links',
  'livestream_config', 'study_groups', 'departments', 'group_announcements',
])
const STAFF_TABLES = new Set([
  'profiles', 'registrations', 'bracelets', 'bracelet_assignments', 'checkins',
  'contact_messages', 'payment_transactions', 'integration_tokens', 'notifications',
  'events', 'event_packages', 'sermons', 'social_media', 'social_links',
  'livestream_config', 'study_groups', 'group_members', 'group_announcements',
  'service_plans', 'service_items', 'connector_devices', 'production_events',
  'dashboard_layouts', 'dashboard_widgets', 'audit_logs',
])

function isStaff(role: string | null | undefined) {
  return ['super_admin', 'leadership', 'event_manager', 'checkin_staff'].includes(role || '')
}

function isAdmin(role: string | null | undefined) {
  return ['super_admin', 'leadership'].includes(role || '')
}

function identifier(value: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`Invalid identifier: ${value}`)
  return value
}

function parseSelect(columns = '*') {
  const relationMatch = columns.match(/(?:,|^)\s*(profiles)(?:!inner)?\(([^)]+)\)/)
  const relation = relationMatch ? {
    name: 'profiles',
    inner: columns.includes('profiles!inner'),
    columns: relationMatch[2].split(',').map(s => identifier(s.trim())),
  } : null
  const mainPart = columns.replace(/,?\s*profiles(?:!inner)?\(([^)]+)\)/, '').trim()
  const mainColumns = mainPart === '*' || mainPart === '' ? '*' : mainPart.split(',').map(s => identifier(s.trim())).join(', ')
  return { mainColumns, relation }
}

function relationForeignKey(table: string) {
  const candidates: Record<string, string[]> = {
    registrations: ['user_id'],
    group_members: ['user_id'],
    group_announcements: ['author_id'],
    groups: ['leader_id'],
    bracelet_assignments: ['assigned_by'],
    checkins: ['scanned_by'],
    events: ['created_by'],
  }
  return candidates[table]?.[0] || 'user_id'
}

function addFilter(filters: { sql: string; value?: unknown }[], column: string, op: string, value: unknown) {
  const relationColumn = column.startsWith('profiles.')
  const sqlColumn = relationColumn ? `p.${identifier(column.slice('profiles.'.length))}` : `t.${identifier(column)}`
  switch (op) {
    case 'eq': filters.push({ sql: `${sqlColumn} = ?`, value }); break
    case 'neq': filters.push({ sql: `${sqlColumn} != ?`, value }); break
    case 'gt': filters.push({ sql: `${sqlColumn} > ?`, value }); break
    case 'gte': filters.push({ sql: `${sqlColumn} >= ?`, value }); break
    case 'lt': filters.push({ sql: `${sqlColumn} < ?`, value }); break
    case 'lte': filters.push({ sql: `${sqlColumn} <= ?`, value }); break
    case 'like': filters.push({ sql: `${sqlColumn} LIKE ?`, value }); break
    case 'ilike': filters.push({ sql: `LOWER(${sqlColumn}) LIKE LOWER(?)`, value }); break
    case 'is': filters.push({ sql: value === null ? `${sqlColumn} IS NULL` : `${sqlColumn} IS NOT NULL` }); break
    case 'in': {
      const values = Array.isArray(value) ? value : []
      if (!values.length) { filters.push({ sql: '1 = 0' }); break }
      filters.push({ sql: `${sqlColumn} IN (${values.map(() => '?').join(', ')})`, value: values });
      break
    }
    default: throw new Error(`Unsupported filter: ${op}`)
  }
}

function parseOr(expression: string) {
  const filters: { sql: string; value?: unknown }[] = []
  for (const item of expression.split(',')) {
    const match = item.match(/^([A-Za-z_][A-Za-z0-9_.]*)\.(eq|neq|ilike|like)\.(.*)$/)
    if (!match) continue
    addFilter(filters, match[1], match[2], match[3])
  }
  return filters
}

function normalizeValue(value: unknown) {
  if (value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'object' && value !== null) return JSON.stringify(value)
  return value
}

function denormalizeRow(row: Record<string, unknown>) {
  for (const key of Object.keys(row)) {
    const value = row[key]
    if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
      try { row[key] = JSON.parse(value) } catch { /* ordinary string */ }
    }
    if (row[key] === 0 && ['active', 'checked_in', 'is_active', 'is_free', 'publish_google', 'publish_facebook'].includes(key)) row[key] = false
    if (row[key] === 1 && ['active', 'checked_in', 'is_active', 'is_free', 'publish_google', 'publish_facebook'].includes(key)) row[key] = true
  }
  return row
}

export type DbOperation = {
  table: string
  operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert'
  columns?: string
  values?: unknown
  filters?: { op: string; column: string; value?: unknown }[]
  or?: string
  orders?: { column: string; ascending: boolean }[]
  limit?: number
  offset?: number
  single?: boolean
  maybeSingle?: boolean
}

export async function authorizeDbOperation(operation: DbOperation, user: DbUser | null) {
  const { table, operation: action } = operation
  if (!STAFF_TABLES.has(table) && !PUBLIC_READ_TABLES.has(table)) throw new Error('Table is not available through the application API.')
  if (action === 'select' && PUBLIC_READ_TABLES.has(table)) return
  if (!user) throw new Error('Unauthorized')

  if (action === 'insert' && table === 'contact_messages') return
  if (table === 'profiles') {
    if (action === 'select' || action === 'update') {
      const own = (operation.filters || []).some(f => f.column === 'id' && f.op === 'eq' && f.value === user.id)
      if (own || isStaff(user.role)) return
    }
    throw new Error('Forbidden')
  }
  if (table === 'registrations' || table === 'payment_transactions' || table === 'notifications') {
    if (isStaff(user.role)) return
    const own = (operation.filters || []).some(f => f.column === 'user_id' && f.op === 'eq' && f.value === user.id)
    const insertOwn = action === 'insert' && (() => {
      const values = Array.isArray(operation.values) ? operation.values : [operation.values]
      return values.every(v => !v || (v as Record<string, unknown>).user_id === user.id)
    })()
    if (own || insertOwn) return
    throw new Error('Forbidden')
  }
  if (table === 'contact_messages') {
    if (action === 'insert' || isStaff(user.role)) return
    throw new Error('Forbidden')
  }
  if (table === 'group_members') {
    if (isStaff(user.role)) return
    if (action === 'select') return
    const own = (operation.filters || []).some(f => f.column === 'user_id' && f.op === 'eq' && f.value === user.id)
    if (own) return
    throw new Error('Forbidden')
  }
  if (table === 'events' && action === 'select') return
  if (['study_groups', 'group_announcements'].includes(table) && action === 'select') return
  if (isStaff(user.role)) return
  throw new Error('Forbidden')
}

export async function executeDbOperation(db: D1Database, operation: DbOperation) {
  const table = identifier(operation.table)
  if (operation.operation === 'select') {
    const { mainColumns, relation } = parseSelect(operation.columns || '*')
    const filters: { sql: string; value?: unknown }[] = []
    for (const filter of operation.filters || []) addFilter(filters, filter.column, filter.op, filter.value)
    filters.push(...parseOr(operation.or || ''))

    const relationJoin = relation ? `${relation.inner ? 'JOIN' : 'LEFT JOIN'} profiles p ON p.id = t.${relationForeignKey(table)}` : ''
    const selectSql = mainColumns === '*' ? `t.*` : mainColumns.split(',').map(c => `t.${c.trim()}`).join(', ')
    const relationSql = relation ? `, ${relation.columns.map(c => `p.${c} AS __profile_${c}`).join(', ')}` : ''
    let sql = `SELECT ${selectSql}${relationSql} FROM ${table} t ${relationJoin}`
    if (filters.length) sql += ` WHERE ${filters.map(f => f.sql).join(' AND ')}`
    if (operation.orders?.length) sql += ` ORDER BY ${operation.orders.map(o => `t.${identifier(o.column)} ${o.ascending ? 'ASC' : 'DESC'}`).join(', ')}`
    if (typeof operation.limit === 'number') sql += ` LIMIT ${Math.max(0, Math.floor(operation.limit))}`
    if (typeof operation.offset === 'number') sql += ` OFFSET ${Math.max(0, Math.floor(operation.offset))}`

    const params = filters.flatMap(f => f.sql.includes(' IN (') && Array.isArray(f.value) ? f.value.map(normalizeValue) : f.sql.includes(' IS NULL') || f.sql.includes(' IS NOT NULL') ? [] : [normalizeValue(f.value)])
    const result = await db.prepare(sql).bind(...params).all<Record<string, unknown>>()
    const rows = (result.results || []).map(row => {
      const clean = denormalizeRow({ ...row })
      if (relation) {
        const profile: Record<string, unknown> = {}
        for (const key of relation.columns) profile[key] = clean[`__profile_${key}`]
        for (const key of Object.keys(clean)) if (key.startsWith('__profile_')) delete clean[key]
        clean.profiles = Object.values(profile).every(v => v == null) ? null : profile
      }
      return clean
    })
    if (operation.single && rows.length !== 1) return { data: null, error: { code: 'PGRST116', message: rows.length ? 'Multiple rows returned' : 'No rows returned' } }
    return { data: operation.single || operation.maybeSingle ? (rows[0] || null) : rows, error: null, count: rows.length }
  }

  const values = Array.isArray(operation.values) ? operation.values as Record<string, unknown>[] : [operation.values as Record<string, unknown>]
  if (!values.length || !values[0]) throw new Error('No values supplied')

  const filters: { sql: string; value?: unknown }[] = []
  for (const filter of operation.filters || []) addFilter(filters, filter.column, filter.op, filter.value)
  filters.push(...parseOr(operation.or || ''))
  const where = filters.length ? ` WHERE ${filters.map(f => f.sql).join(' AND ')}` : ''
  const filterParams = filters.flatMap(f => f.sql.includes(' IN (') && Array.isArray(f.value) ? f.value.map(normalizeValue) : f.sql.includes(' IS NULL') || f.sql.includes(' IS NOT NULL') ? [] : [normalizeValue(f.value)])

  if (operation.operation === 'delete') {
    const result = await db.prepare(`DELETE FROM ${table}${where}`).bind(...filterParams).run()
    return { data: null, error: null, count: result.meta.changes }
  }

  const created: Record<string, unknown>[] = []
  for (const raw of values) {
    const value = { ...raw }
    if (!value.id) value.id = crypto.randomUUID()
    const now = new Date().toISOString()
    if (value.created_at === undefined) value.created_at = now
    if (value.updated_at === undefined) value.updated_at = now
    for (const key of Object.keys(value)) value[key] = normalizeValue(value[key])

    const keys = Object.keys(value).map(identifier)
    const placeholders = keys.map(() => '?').join(', ')
    if (operation.operation === 'update') {
      const set = keys.map(k => `${k} = ?`).join(', ')
      await db.prepare(`UPDATE ${table} SET ${set}${where}`).bind(...keys.map(k => value[k]), ...filterParams).run()
      continue
    }

    if (operation.operation === 'upsert') {
      const set = keys.filter(k => k !== 'id').map(k => `${k}=excluded.${k}`).join(', ')
      const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${set || 'id=excluded.id'}`
      await db.prepare(sql).bind(...keys.map(k => value[k])).run()
    } else {
      await db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`).bind(...keys.map(k => value[k])).run()
    }
    created.push(raw.id ? raw : { ...raw, id: value.id, created_at: now, updated_at: now })
  }

  if (operation.operation === 'update') return { data: null, error: null }
  if (operation.columns) {
    const ids = created.map(x => x.id).filter(Boolean)
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(', ')
      const result = await db.prepare(`SELECT * FROM ${table} WHERE id IN (${placeholders})`).bind(...ids).all<Record<string, unknown>>()
      const rows = (result.results || []).map(denormalizeRow)
      return { data: operation.single || operation.maybeSingle ? (rows[0] || null) : rows, error: null }
    }
  }
  return { data: operation.single || operation.maybeSingle ? (created[0] || null) : created, error: null }
}

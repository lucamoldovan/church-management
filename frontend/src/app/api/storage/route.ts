import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, isStaff } from '@/lib/auth'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export const runtime = 'edge'

function safeKey(value: string) {
  const key = value.replace(/^\/+/, '')
  if (!key || key.includes('..') || key.includes('\\')) throw new Error('Invalid storage path')
  return key
}

function bucket() {
  const { env } = getCloudflareContext()
  if (!env.MEDIA) throw new Error('Cloudflare R2 binding MEDIA is not configured.')
  return env.MEDIA
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth || !isStaff(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const form = await request.formData()
    const path = safeKey(String(form.get('path') || ''))
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'File is required' }, { status: 400 })
    await bucket().put(path, file.stream(), { httpMetadata: { contentType: file.type || 'application/octet-stream', cacheControl: 'public, max-age=31536000, immutable' } })
    return NextResponse.json({ data: { path }, error: null })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth || !isStaff(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { paths } = await request.json() as { paths?: string[] }
    await Promise.all((paths || []).map(path => bucket().delete(safeKey(path))))
    return NextResponse.json({ data: paths || [], error: null })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Delete failed' }, { status: 400 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const marker = '/api/storage/'
    const rest = url.pathname.includes(marker) ? url.pathname.slice(url.pathname.indexOf(marker) + marker.length) : ''
    const slash = rest.indexOf('/')
    if (slash < 1) return new NextResponse('Not found', { status: 404 })
    const bucketName = decodeURIComponent(rest.slice(0, slash))
    if (bucketName !== 'posters') return new NextResponse('Not found', { status: 404 })
    const key = safeKey(decodeURIComponent(rest.slice(slash + 1)))
    const object = await bucket().get(key)
    if (!object) return new NextResponse('Not found', { status: 404 })
    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)
    headers.set('cache-control', 'public, max-age=31536000, immutable')
    return new NextResponse(object.body, { headers })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}

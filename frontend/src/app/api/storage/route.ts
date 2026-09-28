import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, isStaff } from '@/lib/auth'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export const runtime = 'edge'

function bucketFromRequest(request: NextRequest) {
  const { env } = getCloudflareContext()
  if (!env.MEDIA) throw new Error('Cloudflare R2 binding MEDIA is not configured.')
  return env.MEDIA
}

function safeKey(value: string) {
  const key = value.replace(/^\/+/, '')
  if (!key || key.includes('..') || key.includes('\\')) throw new Error('Invalid storage path')
  return key
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth || !isStaff(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const form = await request.formData()
    const path = safeKey(String(form.get('path') || ''))
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'File is required' }, { status: 400 })
    const bucket = bucketFromRequest(request)
    await bucket.put(path, file.stream(), {
      httpMetadata: {
        contentType: file.type || 'application/octet-stream',
        cacheControl: 'public, max-age=31536000, immutable',
      },
    })
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
    const bucket = bucketFromRequest(request)
    await Promise.all((paths || []).map(path => bucket.delete(safeKey(path))))
    return NextResponse.json({ data: paths || [], error: null })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Delete failed' }, { status: 400 })
  }
}

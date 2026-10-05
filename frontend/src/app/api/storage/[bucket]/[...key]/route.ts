import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export const runtime = 'edge'

function safeKey(value: string) {
  const key = value.replace(/^\/+/, '')
  if (!key || key.length > 500 || key.includes('..') || key.includes('\\')) throw new Error('Invalid storage path')
  return key
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ bucket: string; key: string[] }> },
) {
  try {
    const { bucket, key } = await params
    if (bucket !== 'posters' || !key?.length) return new NextResponse('Not found', { status: 404 })

    const { env } = getCloudflareContext()
    if (!env.MEDIA) return new NextResponse('Not found', { status: 404 })

    const object = await env.MEDIA.get(safeKey(key.join('/')))
    if (!object) return new NextResponse('Not found', { status: 404 })

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)
    headers.set('cache-control', 'public, max-age=31536000, immutable')
    headers.set('x-content-type-options', 'nosniff')

    return new NextResponse(object.body, { headers })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}

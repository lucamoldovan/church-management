import { NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET() {
  const env = await getEnv()
  const apiKey = env.YOUTUBE_API_KEY
  const channelId = env.YOUTUBE_CHANNEL_ID
  if (!apiKey || !channelId) return NextResponse.json({ configured: false, live: false, video: null })
  const params = new URLSearchParams({ part: 'snippet', channelId, eventType: 'live', type: 'video', maxResults: '1', key: apiKey })
  try {
    const res = await fetch('https://www.googleapis.com/youtube/v3/search?' + params.toString())
    if (!res.ok) return NextResponse.json({ configured: true, live: false, video: null }, { status: 502 })
    const data = await res.json()
    const item = data.items?.[0]
    if (!item?.id?.videoId) return NextResponse.json({ configured: true, live: false, video: null })
    return NextResponse.json({ configured: true, live: true, video: { id: item.id.videoId, title: item.snippet?.title || 'Live', thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || null, url: 'https://www.youtube.com/watch?v=' + item.id.videoId } })
  } catch {
    return NextResponse.json({ configured: true, live: false, video: null }, { status: 502 })
  }
}

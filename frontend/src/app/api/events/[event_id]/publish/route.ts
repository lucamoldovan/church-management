import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, isStaff } from '@/lib/auth'
import { getEnv } from '@/lib/cloudflare'

export const runtime = 'edge'
const TIMEZONE = 'Europe/Bucharest'

function buildEventTimes(event: Record<string, unknown>) {
  const date = event.date as string | null
  const time = event.time as string | null
  if (!date) return null
  if (time) {
    const startDt = new Date(`${date}T${time}`)
    return { start: { dateTime: startDt.toISOString(), timeZone: TIMEZONE }, end: { dateTime: new Date(startDt.getTime() + 2 * 60 * 60 * 1000).toISOString(), timeZone: TIMEZONE } }
  }
  return { start: { date }, end: { date } }
}

async function publishToGoogle(env: CloudflareEnv, event: Record<string, unknown>, calendarId: string): Promise<string> {
  const row = await env.CHURCH_DB.prepare("SELECT tokens FROM integration_tokens WHERE provider=? AND account_id=? LIMIT 1").bind('google_calendar','default').first<{tokens:string}>()
  const tokens = row?.tokens ? JSON.parse(row.tokens) : {}
  let accessToken = tokens.access_token
  if (tokens.refresh_token && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && (!accessToken || !tokens.expiry || Date.parse(tokens.expiry) < Date.now()+60000)) {
    const tokenRes=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:tokens.refresh_token,grant_type:'refresh_token'})})
    const fresh=await tokenRes.json() as any
    if(!fresh.access_token) throw new Error('Google token refresh failed')
    Object.assign(tokens,fresh,{expiry:new Date(Date.now()+(fresh.expires_in||3600)*1000).toISOString()})
    accessToken=tokens.access_token
    await env.CHURCH_DB.prepare("UPDATE integration_tokens SET tokens=?,access_token=?,expires_at=?,updated_at=CURRENT_TIMESTAMP WHERE provider=? AND account_id=?").bind(JSON.stringify(tokens),tokens.access_token,tokens.expiry,'google_calendar','default').run()
  }
  if(!accessToken) throw new Error('Google Calendar nu este conectat.')
  const times=buildEventTimes(event); if(!times) throw new Error('Evenimentul nu are data.')
  const body={summary:event.title,description:`${event.description||''}\\n\\nLocatie: ${event.location||''}`,location:event.location||'',...times}
  const base=`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
  const res=await fetch(event.google_event_id?base+'/'+encodeURIComponent(String(event.google_event_id)):base,{method:event.google_event_id?'PUT':'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:JSON.stringify(body)})
  const data=await res.json() as any
  if(!res.ok) throw new Error(data.error?.message||'Google Calendar error')
  return data.id
}

async function publishToFacebook(env: CloudflareEnv,event:Record<string,unknown>,link:string){
  if(!env.FB_PAGE_ID||!env.FB_PAGE_ACCESS_TOKEN) throw new Error('Facebook nu este configurat.')
  if(!event.poster_url) throw new Error('Lipseste posterul.')
  const form=new URLSearchParams({url:String(event.poster_url),message:`${event.title}\\n\\n${event.description||''}\\n\\nInscrie-te aici: ${link}`,access_token:env.FB_PAGE_ACCESS_TOKEN})
  const res=await fetch(`https://graph.facebook.com/v19.0/${encodeURIComponent(env.FB_PAGE_ID)}/photos`,{method:'POST',body:form})
  const data=await res.json() as any
  if(data.error) throw new Error(data.error.message||'Eroare Facebook')
  return data.post_id||data.id
}

export async function POST(request:NextRequest,{params}:{params:Promise<{event_id:string}>}){
  try{
    const auth=await getAuthContext(); if(!auth)return NextResponse.json({error:'Unauthorized'},{status:401})
    if(!isStaff(auth.role))return NextResponse.json({error:'Forbidden'},{status:403})
    const {event_id}=await params
    if(!/^[0-9a-f-]{36}$/i.test(event_id))return NextResponse.json({error:'Invalid event_id'},{status:400})
    const env=await getEnv()
    const event=await env.CHURCH_DB.prepare('SELECT * FROM events WHERE id=?').bind(event_id).first<Record<string,unknown>>()
    if(!event)return NextResponse.json({error:'Eveniment negasit'},{status:404})
    if(!['approved','published'].includes(String(event.status)))return NextResponse.json({error:'Evenimentul trebuie aprobat înainte de publicare.'},{status:409})
    const origin=new URL(request.url).origin
    const link=`${origin}/events/${event_id}`
    const log:Record<string,unknown>={}; const update:Record<string,unknown>={}
    if(event.publish_google){try{const id=await publishToGoogle(env,event,env.GOOGLE_CALENDAR_ID||'primary');update.google_event_id=id;log.google={ok:true,id}}catch(e){log.google={ok:false,error:(e as Error).message}}}
    if(event.publish_facebook){try{const id=await publishToFacebook(env,event,link);update.facebook_post_id=id;log.facebook={ok:true,id}}catch(e){log.facebook={ok:false,error:(e as Error).message}}}
    if(Object.keys(log).length){update.publish_log=JSON.stringify(log);const keys=Object.keys(update);await env.CHURCH_DB.prepare('UPDATE events SET '+keys.map(k=>k+'=?').join(', ')+' WHERE id=?').bind(...keys.map(k=>update[k]),event_id).run()}
    return NextResponse.json({published:true,log})
  }catch(err){console.error('[events/publish]',err);return NextResponse.json({error:err instanceof Error?err.message:'Internal error'},{status:500})}
}

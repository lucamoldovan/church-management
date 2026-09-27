import { NextResponse } from 'next/server'
import { getEnv } from '@/lib/cloudflare'
import { getAuthContext, isStaff } from '@/lib/auth'

export const runtime='edge'

export async function POST(request:Request){
  const ctx=await getAuthContext()
  if(!ctx||!isStaff(ctx.role))return NextResponse.json({error:'Unauthorized'},{status:401})
  const form=await request.formData()
  const bucket=String(form.get('bucket')||'')
  const path=String(form.get('path')||'')
  const file=form.get('file')
  if(bucket!=='posters' || !path.startsWith('posters/') || !(file instanceof File))return NextResponse.json({error:'Invalid upload'},{status:400})
  const env=await getEnv()
  await env.MEDIA.put(path,await file.arrayBuffer(),{httpMetadata:{contentType:file.type||'application/octet-stream'}})
  return NextResponse.json({data:{path}})
}

export async function GET(request:Request){
  const url=new URL(request.url)
  const path=url.searchParams.get('path')||''
  if(!path.startsWith('posters/'))return new NextResponse('Not found',{status:404})
  const env=await getEnv()
  const object=await env.MEDIA.get(path)
  if(!object)return new NextResponse('Not found',{status:404})
  const headers=new Headers()
  object.writeHttpMetadata(headers);headers.set('etag',object.httpEtag)
  return new Response(object.body,{headers})
}

import { NextResponse } from 'next/server'
import { getEnv } from '@/lib/cloudflare'
import { getAuthContext } from '@/lib/auth'

export const runtime = 'edge'

const TABLES = new Set(['profiles','departments','events','event_packages','registrations','checkins','study_groups','group_members','group_meetings','group_attendance','group_announcements','sermons','livestream_config','social_media','social_links','contact_messages','notifications','payment_transactions','bracelets','bracelet_assignments','integration_tokens','service_plans','service_items','service_volunteers','production_events','connector_devices','production_live_state','production_alerts','audit_logs','production_dashboards','production_widgets','production_permissions'])
const PUBLIC_READ = new Set(['departments','events','event_packages','study_groups','sermons','livestream_config','social_media','social_links'])
const STAFF_TABLES = new Set(['departments','events','event_packages','checkins','sermons','livestream_config','social_media','social_links','notifications','payment_transactions','bracelets','bracelet_assignments','integration_tokens','service_plans','service_items','service_volunteers','production_events','connector_devices','production_live_state','production_alerts','audit_logs','production_dashboards','production_widgets','production_permissions','profiles','study_groups','group_members','group_meetings','group_attendance','group_announcements','registrations'])

const ident=(s:string)=>/^[A-Za-z_][A-Za-z0-9_.]*$/.test(s)?s:null
const id=(s:string)=>ident(s?.replace(/^profiles!?\./,'')||'')
const relation=(columns:string,table:string)=>columns.includes('profiles(')||columns.includes('profiles!')

function selectColumns(columns:string,table:string){
 const raw=columns.trim()
 const nested=relation(raw,table)
 const base=raw==='*'||nested ? '*' : raw.split(',').map(x=>x.trim()).map(ident).filter(Boolean).join(',')
 return {base:base||'*',nested}
}

function addWhere(filters:any[],orValue:string|undefined,table:string,joinProfiles:boolean){
 const clauses:string[]=[];const binds:any[]=[]
 for(const f of filters||[]){
  const field=ident(f.field);if(!field)continue
  const col=field.includes('.') ? field.replace('profiles.','p.') : 't.'+field
  if(f.op==='eq'){clauses.push(col+' = ?');binds.push(f.value)}
  else if(f.op==='neq'){clauses.push(col+' != ?');binds.push(f.value)}
  else if(f.op==='ilike'){clauses.push('LOWER('+col+') LIKE LOWER(?)');binds.push(f.value)}
  else if(f.op==='is'){clauses.push(col+(f.value===null?' IS NULL':' IS NOT NULL'))}
 }
 if(orValue){
  const ors:string[]=[]
  for(const part of String(orValue).split(',')){
   const m=part.match(/^([A-Za-z_][A-Za-z0-9_.]*)\.eq\.(.*)$/)
   if(m){const col=m[1].includes('.')?m[1].replace('profiles.','p.'):'t.'+m[1];ors.push(col+' = ?');binds.push(m[2])}
  }
  if(ors.length)clauses.push('('+ors.join(' OR ')+')')
 }
 return {sql:clauses.length?' WHERE '+clauses.join(' AND '):'',binds}
}

async function currentUser(){return getAuthContext()}

export async function POST(request:Request){
 try{
  const body=(await request.json()) as Record<string, any>
  const table=String(body.table||'')
  const action=body.action||'select'
  if(!TABLES.has(table))return NextResponse.json({error:'Table not allowed'}, {status:400})
  const ctx=await currentUser()
  const staff=!!ctx && ['super_admin','leadership','event_manager','checkin_staff'].includes(ctx.role||'')
  const admin=!!ctx && ['super_admin','leadership'].includes(ctx.role||'')
  if(action!=='select' && !staff && !(table==='registrations'&&action==='insert'&&ctx) && !(table==='group_members'&&ctx) && !(table==='contact_messages'&&action==='insert')) return NextResponse.json({error:'Unauthorized'}, {status:401})
  if(action==='select' && !PUBLIC_READ.has(table) && !staff && !ctx) return NextResponse.json({error:'Unauthorized'}, {status:401})

  const env=await getEnv();const db=env.CHURCH_DB
  if(action==='select'){
   if(table==='profiles'&&!staff&&ctx){body.filters=[...(body.filters||[]),{op:'eq',field:'id',value:ctx.userId}]}
   if(table==='notifications'&&!staff&&ctx){body.filters=[...(body.filters||[]),{op:'eq',field:'user_id',value:ctx.userId}]}
   if(table==='registrations'&&!staff&&ctx){body.filters=[...(body.filters||[]),{op:'eq',field:'user_id',value:ctx.userId}]}
   const {base,nested}=selectColumns(body.columns||'*',table)
   const join= nested && (table==='group_members'||table==='registrations')
   const where=addWhere(body.filters||[],body.or,table,join)
   const order=body.order?.field&&ident(body.order.field)?' ORDER BY t.'+body.order.field+(body.order.ascending===false?' DESC':' ASC'):''
   const limit=Number.isInteger(body.limit)&&body.limit>0?' LIMIT '+Math.min(body.limit,500):''
   const sql='SELECT t.* FROM '+table+' t'+(join?' LEFT JOIN profiles p ON p.id=t.user_id':'')+where.sql+order+limit
   const res=await db.prepare(sql).bind(...where.binds).all<any>()
   let rows=res.results||[]
   if(nested&&join){rows=await Promise.all(rows.map(async row=>{const p=row.user_id?await db.prepare('SELECT full_name,email FROM profiles WHERE id=?').bind(row.user_id).first():null;return {...row,profiles:p||null}}))}
   if(body.single==='single' && rows.length!==1)return NextResponse.json({data:null,error:{message:rows.length?'Multiple rows returned':'No rows returned',code:rows.length?'PGRST116':'PGRST116'}},{status:rows.length?409:404})
   return NextResponse.json({data:body.single?rows[0]||null:rows,error:null})
  }

  if(table==='profiles' && !admin)return NextResponse.json({error:'Admin required'},{status:403})
  if(table==='payment_transactions' || table==='integration_tokens') if(!admin)return NextResponse.json({error:'Admin required'},{status:403})

  if(action==='insert'){
   const items=Array.isArray(body.payload)?body.payload:[body.payload]
   const results:any[]=[]
   for(const input of items){
    const row={...(input||{})} as Record<string,any>
    if(!row.id)row.id=crypto.randomUUID()
    const keys=Object.keys(row).filter(k=>ident(k));if(!keys.length)continue
    const sql='INSERT INTO '+table+' ('+keys.join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')'
    await db.prepare(sql).bind(...keys.map(k=>row[k]===undefined?null:row[k])).run()
    results.push(row)
   }
   return NextResponse.json({data:Array.isArray(body.payload)?results:results[0]||null,error:null})
  }
  if(action==='update'||action==='delete'){
   const where=addWhere(body.filters||[],body.or,table,false)
   if(!where.sql)return NextResponse.json({error:'A filter is required'},{status:400})
   if(action==='delete'){
    const r=await db.prepare('DELETE FROM '+table+where.sql).bind(...where.binds).run()
    return NextResponse.json({data:null,error:null,count:r.meta.changes||0})
   }
   const payload=body.payload||{};const keys=Object.keys(payload).filter(k=>ident(k))
   if(!keys.length)return NextResponse.json({data:null,error:null})
   const sql='UPDATE '+table+' SET '+keys.map(k=>k+' = ?').join(', ')+' WHERE '+where.sql.replace(/^ WHERE /,'')
   await db.prepare(sql).bind(...keys.map(k=>payload[k]),...where.binds).run()
   return NextResponse.json({data:null,error:null})
  }
  return NextResponse.json({error:'Unsupported action'},{status:400})
 }catch(error:any){return NextResponse.json({error:error?.message||'Database error',code:error?.code},{status:500})}
}

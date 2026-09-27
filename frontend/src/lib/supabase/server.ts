import { getEnv } from '@/lib/cloudflare'
import { getAuth } from '@/lib/auth'
import { headers } from 'next/headers'

const ident=(s:string)=>/^[A-Za-z_][A-Za-z0-9_.]*$/.test(s)?s:null
export async function createClient(){
 const env=await getEnv();const auth=await getAuth();const session=await auth.api.getSession({headers:await headers()})
 return {from:(table:string)=>new ServerQuery(env.CHURCH_DB,table),auth:{getUser:async()=>({data:{user:session?.user?{id:session.user.id,email:session.user.email,name:session.user.name}:null},error:null})}}
}
class ServerQuery{
 private filters:any[]=[];private action='select';private columns='*';private payload:any;private orderBy:any;private limitValue?:number;private singleMode:any
 constructor(private db:D1Database,private table:string){}
 select(c='*'){this.columns=c;this.action='select';return this}insert(p:any){this.action='insert';this.payload=p;return this}update(p:any){this.action='update';this.payload=p;return this}delete(){this.action='delete';return this}
 eq(f:string,v:any){this.filters.push({op:'eq',field:f,value:v});return this}neq(f:string,v:any){this.filters.push({op:'neq',field:f,value:v});return this}ilike(f:string,v:any){this.filters.push({op:'ilike',field:f,value:v});return this}is(f:string,v:any){this.filters.push({op:'is',field:f,value:v});return this}order(f:string,o?:any){this.orderBy={field:f,ascending:o?.ascending!==false};return this}limit(n:number){this.limitValue=n;return this}single(){this.singleMode='single';return this}maybeSingle(){this.singleMode='maybeSingle';return this}then(resolve:any,reject?:any){return this.execute().then(resolve,reject)}
 private where(){const c:string[]=[];const b:any[]=[];for(const f of this.filters){const field=ident(f.field);if(!field)continue;const col=field.includes('.')?field:field;if(f.op==='eq'){c.push(col+' = ?');b.push(f.value)}else if(f.op==='neq'){c.push(col+' != ?');b.push(f.value)}else if(f.op==='ilike'){c.push('LOWER('+col+') LIKE LOWER(?)');b.push(f.value)}else if(f.op==='is'){c.push(col+(f.value===null?' IS NULL':' IS NOT NULL'))}}return {sql:c.length?' WHERE '+c.join(' AND '):'',b}}
 async execute(){try{
  if(this.action==='select'){const w=this.where();const order=this.orderBy?.field&&ident(this.orderBy.field)?' ORDER BY '+this.orderBy.field+' '+(this.orderBy.ascending===false?'DESC':'ASC'):'';const cols=this.columns==='*'?'*':this.columns.split(',').map((x:string)=>ident(x.trim())).filter(Boolean).join(',');const limit=this.limitValue?' LIMIT '+Math.min(this.limitValue,500):'';const r=await this.db.prepare('SELECT '+cols+' FROM '+this.table+w.sql+order+limit).bind(...w.b).all<any>();let rows=r.results||[];if(this.columns.includes('profiles(')){rows=await Promise.all(rows.map(async row=>({...row,profiles:row.user_id?await this.db.prepare('SELECT full_name,email FROM profiles WHERE id=?').bind(row.user_id).first():null})))}if(this.singleMode)return {data:rows[0]||null,error:null};return {data:rows,error:null}}
  if(this.action==='insert'){const items=Array.isArray(this.payload)?this.payload:[this.payload];const out:any[]=[];for(const input of items){const row={...input};row.id=row.id||crypto.randomUUID();const keys=Object.keys(row).filter(k=>ident(k));await this.db.prepare('INSERT INTO '+this.table+' ('+keys.join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')').bind(...keys.map(k=>row[k]??null)).run();out.push(row)}return {data:Array.isArray(this.payload)?out:out[0]||null,error:null}}
  const w=this.where();if(!w.sql)return {data:null,error:{message:'A filter is required'}};if(this.action==='delete'){await this.db.prepare('DELETE FROM '+this.table+w.sql).bind(...w.b).run();return {data:null,error:null}}const keys=Object.keys(this.payload||{}).filter(k=>ident(k));await this.db.prepare('UPDATE '+this.table+' SET '+keys.map(k=>k+'=?').join(',')+' WHERE '+w.sql.replace(/^ WHERE /,'')).bind(...keys.map(k=>this.payload[k]),...w.b).run();return {data:null,error:null}
 }catch(e:any){return {data:null,error:{message:e?.message||'Database error',code:e?.code}}}}
}

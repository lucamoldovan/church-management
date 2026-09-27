import { getEnv } from './cloudflare'

const ident=(s:string)=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)?s:null

export async function d1Rest(path:string,options:RequestInit={}){
 const [rawTable,queryString='']=path.split('?');const table=decodeURIComponent(rawTable);if(!ident(table))throw new Error('Invalid table')
 const env=await getEnv();const db=env.CHURCH_DB;const q=new URLSearchParams(queryString)
 const select=(q.get('select')||'*').split(',').map(x=>ident(x.trim())).filter(Boolean).join(',')||'*'
 const filters:string[]=[];const binds:any[]=[]
 for(const [key,value] of q.entries()){
  if(key==='select'||key==='order'||key==='limit')continue
  const m=value.match(/^eq\.(.*)$/);if(m&&ident(key)){filters.push(key+' = ?');binds.push(decodeURIComponent(m[1]))}
 }
 const where=filters.length?' WHERE '+filters.join(' AND '):''
 const method=(options.method||'GET').toUpperCase()
 if(method==='GET'){
  const order=q.get('order');const orderSql=order&&ident(order.split('.')[0])?' ORDER BY '+order.split('.')[0]+' '+(order.endsWith('.desc')?'DESC':'ASC'):'';const limit=q.get('limit');const limitSql=limit?' LIMIT '+Math.min(Number(limit)||100,500):''
  const r=await db.prepare('SELECT '+select+' FROM '+table+where+orderSql+limitSql).bind(...binds).all<any>();return r.results||[]
 }
 const body=options.body?JSON.parse(String(options.body)):{};if(method==='POST'){
  const row={...body};row.id=row.id||crypto.randomUUID();const keys=Object.keys(row).filter(ident);await db.prepare('INSERT INTO '+table+' ('+keys.join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')').bind(...keys.map(k=>row[k]??null)).run();return [row]
 }
 if(method==='PATCH'||method==='PUT'){
  const keys=Object.keys(body).filter(ident);if(!keys.length)return null
  await db.prepare('UPDATE '+table+' SET '+keys.map(k=>k+'=?').join(',')+where).bind(...keys.map(k=>body[k]),...binds).run();return body
 }
 if(method==='DELETE'){await db.prepare('DELETE FROM '+table+where).bind(...binds).run();return null}
 throw new Error('Unsupported method')
}

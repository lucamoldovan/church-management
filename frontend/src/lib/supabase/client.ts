'use client'
import { authClient } from '@/lib/auth-client'
type Filter={op:string;field:string;value:unknown}
class QueryBuilder<T=any>{
 private table:string; private action:'select'|'insert'|'update'|'delete'='select'; private columns='*'; private filters:Filter[]=[]; private orFilter?:string; private orderBy?:{field:string;ascending:boolean}; private limitValue?:number; private payload:any; private singleMode?:'single'|'maybeSingle'
 constructor(table:string){this.table=table}
 select(c='*'){this.action='select';this.columns=c;return this}
 insert(p:any){this.action='insert';this.payload=p;return this}
 update(p:any){this.action='update';this.payload=p;return this}
 delete(){this.action='delete';return this}
 eq(f:string,v:any){this.filters.push({op:'eq',field:f,value:v});return this}
 neq(f:string,v:any){this.filters.push({op:'neq',field:f,value:v});return this}
 ilike(f:string,v:any){this.filters.push({op:'ilike',field:f,value:v});return this}
 is(f:string,v:any){this.filters.push({op:'is',field:f,value:v});return this}
 or(v:string){this.orFilter=v;return this}
 order(f:string,o?:{ascending?:boolean}){this.orderBy={field:f,ascending:o?.ascending!==false};return this}
 limit(n:number){this.limitValue=n;return this}
 single(){this.singleMode='single';return this}
 maybeSingle(){this.singleMode='maybeSingle';return this}
 then(resolve:any,reject?:any){return this.execute().then(resolve,reject)}
 async execute(){const r=await fetch('/api/db',{method:'POST',headers:{'content-type':'application/json'},credentials:'include',body:JSON.stringify({table:this.table,action:this.action,columns:this.columns,filters:this.filters,or:this.orFilter,order:this.orderBy,limit:this.limitValue,payload:this.payload,single:this.singleMode})});const b=await r.json().catch(()=>({}));if(!r.ok)return {data:null,error:{message:b.error||'Database error',code:b.code}};return b}
}
export function createClient(){return {
 from:(table:string)=>new QueryBuilder(table),
 auth:{
  getUser:async()=>{const r=await authClient.getSession();return {data:{user:r.data?.user?{id:r.data.user.id,email:r.data.user.email,name:r.data.user.name}:null},error:r.error}},
  signInWithPassword:async({email,password}:{email:string,password:string})=>{const r=await authClient.signIn.email({email,password});return {data:r.data,error:r.error}},
  signUp:async({email,password,options}:{email:string,password:string,options?:{data?:{full_name?:string}}})=>{const r=await authClient.signUp.email({email,password,name:options?.data?.full_name||''});return {data:r.data,error:r.error}},
  signInWithOAuth:async({provider,options}:{provider:'google'|'github'|'apple',options?:{redirectTo?:string}})=>{const r=await authClient.signIn.social({provider,callbackURL:options?.redirectTo||'/dashboard'});return {data:r.data,error:r.error}},
  signOut:async()=>{const r=await authClient.signOut();return {error:r.error}},
  resetPasswordForEmail:async(email:string,opts?:{redirectTo?:string})=>{const r=await authClient.requestPasswordReset({email,redirectTo:opts?.redirectTo});return {data:r.data,error:r.error}},
  updateUser:async(payload:any)=>{const r=await authClient.updateUser(payload);return {data:r.data,error:r.error}}
 },
 storage:{from:(bucket:string)=>({upload:async(path:string,file:File)=>{const fd=new FormData();fd.append('bucket',bucket);fd.append('path',path);fd.append('file',file);const r=await fetch('/api/storage',{method:'POST',body:fd,credentials:'include'});const b=await r.json();return {data:b.data,error:r.ok?null:{message:b.error}}},getPublicUrl:(path:string)=>({data:{publicUrl:'/api/storage/public?bucket='+encodeURIComponent(bucket)+'&path='+encodeURIComponent(path)}})})}
}}

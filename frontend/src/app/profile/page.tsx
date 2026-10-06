'use client'

import { useEffect, useState } from 'react'
import { User, Save, Shield } from 'lucide-react'

export default function ProfilePage() {
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [msg,setMsg]=useState('')
  const [form,setForm]=useState({full_name:'',phone:'',department:'',date_of_birth:'',emergency_contact:''})
  const [meta,setMeta]=useState({email:'',role:'member',nfc_id:''})

  useEffect(()=>{const load=async()=>{const {createClient}=await import('@/lib/supabase/client');const supabase=createClient();const {data:{user}}=await supabase.auth.getUser();if(!user){window.location.href='/login';return}const {data:p}=await supabase.from('profiles').select('*').eq('id',user.id).single();if(p){setForm({full_name:p.full_name||'',phone:p.phone||'',department:p.department||'',date_of_birth:p.date_of_birth||'',emergency_contact:p.emergency_contact||''});setMeta({email:p.email||user.email||'',role:p.role||'member',nfc_id:p.nfc_id||''})}setLoading(false)};load()},[])
  const save=async(e:React.FormEvent)=>{e.preventDefault();setSaving(true);setMsg('');const {createClient}=await import('@/lib/supabase/client');const supabase=createClient();const {data:{user}}=await supabase.auth.getUser();const {error}=await supabase.from('profiles').update({full_name:form.full_name,phone:form.phone,department:form.department,date_of_birth:form.date_of_birth||null,emergency_contact:form.emergency_contact}).eq('id',user!.id);setMsg(error?'Eroare: '+error.message:'Profil salvat!');setSaving(false)}
  if(loading)return <div className="min-h-[70vh] flex items-center justify-center text-muted-foreground">Se încarcă...</div>
  const field=(label:string,key:keyof typeof form,type='text')=><div><label className="text-sm font-medium mb-1.5 block">{label}</label><input type={type} data-testid={'profile-'+key} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} className="w-full px-4 py-3.5 border border-border rounded-2xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"/></div>
  return <div data-testid="profile-page" className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
    <header className="mb-9 animate-rise"><p className="text-xs font-semibold tracking-[0.18em] uppercase text-primary mb-3">Contul meu</p><h1 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight">Profilul meu</h1><p className="text-muted-foreground mt-3">Păstrează-ți datele actualizate pentru comunitate.</p></header>
    <div className="grid lg:grid-cols-[.7fr_1.3fr] gap-6">
      <aside className="bg-primary text-primary-foreground rounded-[2rem] p-7 soft-shadow"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 mb-7"><User className="h-7 w-7"/></span><p className="font-heading text-2xl font-semibold">{form.full_name||'Membru Casa Pâinii'}</p><p className="text-sm opacity-75 mt-1 break-all">{meta.email}</p><div className="mt-8 pt-6 border-t border-white/15 text-sm"><p className="flex items-center gap-2"><Shield className="h-4 w-4"/>{meta.role}</p></div></aside>
      <form onSubmit={save} className="bg-card border border-border/60 rounded-[2rem] p-7 sm:p-8 soft-shadow flex flex-col gap-4">
        {msg&&<div data-testid="profile-message" className={msg.startsWith('Eroare')?'bg-destructive/10 text-destructive px-4 py-3 rounded-2xl text-sm':'bg-primary/10 text-primary px-4 py-3 rounded-2xl text-sm'}>{msg}</div>}
        {field('Nume complet','full_name')}<div className="grid sm:grid-cols-2 gap-4">{field('Telefon','phone')}{field('Data nașterii','date_of_birth','date')}</div><div className="grid sm:grid-cols-2 gap-4">{field('Departament','department')}{field('Contact de urgență','emergency_contact')}</div>
        <button type="submit" disabled={saving} data-testid="profile-save-button" className="self-start inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-full font-semibold hover:bg-primary/90 transition-all disabled:opacity-50 mt-2"><Save className="h-4 w-4"/>{saving?'Se salvează...':'Salvează modificările'}</button>
      </form>
    </div>
  </div>
}
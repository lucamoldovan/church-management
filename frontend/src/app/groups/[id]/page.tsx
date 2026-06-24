'use client'

import { use, useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Users, Calendar, Clock, MapPin, Check, X, Megaphone, ClipboardCheck } from 'lucide-react'

interface Group { id: string; name: string; description: string | null; leader_id: string | null; meeting_day: string | null; meeting_time: string | null; meeting_location: string | null; capacity: number | null }
interface Member { id: string; user_id: string; status: string; profiles?: { full_name: string | null; email: string | null } }
interface Announcement { id: string; title: string; content: string; created_at: string }

export default function GroupDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [myStatus, setMyStatus] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [isManager, setIsManager] = useState(false)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [ann, setAnn] = useState({ title: '', content: '' })

  const load = useCallback(async () => {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    setUserId(user?.id ?? null)
    const { data: g } = await supabase.from('study_groups').select('*').eq('id', id).single()
    setGroup(g as Group)
    let manager = false
    if (user) {
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      manager = ['super_admin', 'leadership'].includes(prof?.role) || (g as Group)?.leader_id === user.id
      setIsManager(manager)
      const { data: mine } = await supabase.from('group_memberships').select('status').eq('group_id', id).eq('user_id', user.id).maybeSingle()
      setMyStatus(mine?.status ?? null)
    }
    const { data: mem } = await supabase.from('group_memberships').select('id, user_id, status, profiles(full_name, email)').eq('group_id', id)
    setMembers((mem as unknown as Member[]) || [])
    const { data: anns } = await supabase.from('group_announcements').select('*').eq('group_id', id).order('created_at', { ascending: false })
    setAnnouncements((anns as Announcement[]) || [])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const join = async () => {
    if (!userId) { window.location.href = '/login'; return }
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { error } = await supabase.from('group_memberships').insert({ group_id: id, user_id: userId, status: 'pending' })
    setMsg(error ? error.message : 'Cerere trimisă! Așteaptă aprobarea liderului.')
    if (!error) setMyStatus('pending')
  }
  const leave = async () => {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.from('group_memberships').delete().eq('group_id', id).eq('user_id', userId!)
    setMyStatus(null); load()
  }
  const setMemberStatus = async (memberId: string, status: string) => {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    if (status === 'remove') await supabase.from('group_memberships').delete().eq('id', memberId)
    else await supabase.from('group_memberships').update({ status }).eq('id', memberId)
    load()
  }
  const markAttendance = async (memberUserId: string) => {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const today = new Date().toISOString().slice(0, 10)
    const { error } = await supabase.from('group_attendance').upsert({ group_id: id, user_id: memberUserId, meeting_date: today, present: true }, { onConflict: 'group_id,user_id,meeting_date' })
    setMsg(error ? error.message : 'Prezență înregistrată pentru azi.')
  }
  const postAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault()
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { error } = await supabase.from('group_announcements').insert({ group_id: id, leader_id: userId, title: ann.title, content: ann.content })
    if (!error) { setAnn({ title: '', content: '' }); load() }
    else setMsg(error.message)
  }

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">Se încarcă...</div>
  if (!group) return <div className="max-w-3xl mx-auto px-4 py-24 text-center"><h1 className="font-heading text-2xl font-bold mb-3">Grup negăsit</h1><Link href="/groups" className="text-primary">Înapoi la grupuri</Link></div>

  const approved = members.filter(m => m.status === 'approved')
  const pending = members.filter(m => m.status === 'pending')

  return (
    <div data-testid="group-detail-page" className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <Link href="/groups" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"><ArrowLeft className="h-4 w-4" /> Înapoi la grupuri</Link>

      <div className="bg-card border border-border/60 rounded-3xl p-7 soft-shadow mb-6">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4"><Users className="h-6 w-6" /></span>
        <h1 className="font-heading text-3xl font-bold mb-2">{group.name}</h1>
        <p className="text-muted-foreground mb-5 leading-relaxed">{group.description}</p>
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-5">
          {group.meeting_day && <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4 text-primary" />{group.meeting_day}</span>}
          {group.meeting_time && <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-primary" />{String(group.meeting_time).slice(0,5)}</span>}
          {group.meeting_location && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-primary" />{group.meeting_location}</span>}
        </div>
        {msg && <div className="bg-primary/10 text-primary px-4 py-2.5 rounded-2xl text-sm mb-4">{msg}</div>}
        {!myStatus && <button onClick={join} data-testid="group-join-button" className="bg-primary text-primary-foreground px-6 py-3 rounded-full font-semibold hover:bg-primary/90 transition-colors">Cere să te alături</button>}
        {myStatus === 'pending' && <div className="inline-flex items-center gap-2 text-sm bg-secondary px-4 py-2.5 rounded-full">Cerere în așteptare <button onClick={leave} className="text-destructive underline ml-2">Anulează</button></div>}
        {myStatus === 'approved' && <div className="inline-flex items-center gap-2"><span className="text-sm bg-primary/10 text-primary px-4 py-2.5 rounded-full inline-flex items-center gap-1.5"><Check className="h-4 w-4" />Membru activ</span><button onClick={leave} data-testid="group-leave-button" className="text-sm text-destructive underline">Părăsește grupul</button></div>}
      </div>

      <div className="bg-card border border-border/60 rounded-3xl p-7 soft-shadow mb-6">
        <h2 className="font-heading text-xl font-semibold mb-4 flex items-center gap-2"><Megaphone className="h-5 w-5 text-primary" />Anunțuri</h2>
        {isManager && (
          <form onSubmit={postAnnouncement} className="flex flex-col gap-3 mb-5 bg-secondary/40 rounded-2xl p-4">
            <input required placeholder="Titlu anunț" value={ann.title} onChange={e => setAnn({ ...ann, title: e.target.value })} className="px-4 py-2.5 border border-border rounded-xl bg-background text-sm" data-testid="announcement-title" />
            <textarea required placeholder="Mesaj" value={ann.content} onChange={e => setAnn({ ...ann, content: e.target.value })} rows={2} className="px-4 py-2.5 border border-border rounded-xl bg-background text-sm" data-testid="announcement-content" />
            <button type="submit" data-testid="announcement-post" className="self-start bg-primary text-primary-foreground px-5 py-2 rounded-full text-sm font-semibold">Publică</button>
          </form>
        )}
        {announcements.length === 0 ? <p className="text-sm text-muted-foreground">Niciun anunț încă.</p> : (
          <div className="flex flex-col gap-3">{announcements.map(a => (
            <div key={a.id} className="border border-border/60 rounded-2xl p-4"><div className="font-medium text-sm">{a.title}</div><p className="text-sm text-muted-foreground mt-1">{a.content}</p><div className="text-xs text-muted-foreground mt-2">{new Date(a.created_at).toLocaleDateString('ro-RO')}</div></div>
          ))}</div>
        )}
      </div>

      {isManager && (
        <div className="bg-card border border-border/60 rounded-3xl p-7 soft-shadow" data-testid="group-leader-panel">
          <h2 className="font-heading text-xl font-semibold mb-4 flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-primary" />Administrare grup</h2>
          {pending.length > 0 && (
            <div className="mb-6">
              <h3 className="font-medium text-sm mb-3">Cereri în așteptare ({pending.length})</h3>
              <div className="flex flex-col gap-2">{pending.map(m => (
                <div key={m.id} className="flex items-center justify-between bg-secondary/40 rounded-xl px-4 py-2.5">
                  <span className="text-sm">{m.profiles?.full_name || m.profiles?.email || 'Membru'}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setMemberStatus(m.id, 'approved')} data-testid={`approve-${m.id}`} className="p-1.5 rounded-full bg-primary/10 text-primary"><Check className="h-4 w-4" /></button>
                    <button onClick={() => setMemberStatus(m.id, 'rejected')} className="p-1.5 rounded-full bg-destructive/10 text-destructive"><X className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}</div>
            </div>
          )}
          <h3 className="font-medium text-sm mb-3">Membri activi ({approved.length})</h3>
          <div className="flex flex-col gap-2">{approved.map(m => (
            <div key={m.id} className="flex items-center justify-between bg-secondary/40 rounded-xl px-4 py-2.5">
              <span className="text-sm">{m.profiles?.full_name || m.profiles?.email || 'Membru'}</span>
              <div className="flex gap-2">
                <button onClick={() => markAttendance(m.user_id)} data-testid={`attend-${m.id}`} className="text-xs bg-primary/10 text-primary px-3 py-1.5 rounded-full">Prezent azi</button>
                <button onClick={() => setMemberStatus(m.id, 'remove')} className="text-xs text-destructive px-2 py-1.5">Elimină</button>
              </div>
            </div>
          ))}{approved.length === 0 && <p className="text-sm text-muted-foreground">Niciun membru activ.</p>}</div>
        </div>
      )}
    </div>
  )
}

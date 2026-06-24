'use client'

import { useEffect, useState } from 'react'

export interface Profile {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  role: string
  nfc_id: string | null
  department: string | null
  photo_url: string | null
  date_of_birth: string | null
  emergency_contact: string | null
}

const ADMIN_ROLES = ['super_admin', 'leadership']
const STAFF_ROLES = ['super_admin', 'leadership', 'event_manager', 'checkin_staff']

export function useUser() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!mounted) return
      if (!user) {
        setUser(null); setProfile(null); setLoading(false)
        return
      }
      setUser({ id: user.id, email: user.email ?? '' })
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!mounted) return
      setProfile(prof as Profile)
      setLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [])

  const role = profile?.role ?? null
  return {
    user,
    profile,
    role,
    loading,
    isAdmin: !!role && ADMIN_ROLES.includes(role),
    isStaff: !!role && STAFF_ROLES.includes(role),
  }
}

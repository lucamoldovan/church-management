'use client'

import { useEffect, useState } from 'react'
import { authClient } from '@/lib/auth-client'

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
      try {
        const { data: session } = await authClient.getSession()
        const currentUser = session?.user
        if (!mounted) return
        if (!currentUser) {
          setUser(null); setProfile(null); setLoading(false)
          return
        }
        setUser({ id: currentUser.id, email: currentUser.email ?? '' })
        const response = await fetch('/api/profile', { cache: 'no-store' })
        const prof = response.ok ? await response.json() : null
        if (!mounted) return
        setProfile(prof as Profile | null)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    void load()
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

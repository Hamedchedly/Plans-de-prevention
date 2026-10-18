import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { logActivity } from './activity'
import { endSession } from './impersonation'
import type { Profile, Role } from './types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  can: (...roles: Role[]) => boolean
}

const Ctx = createContext<AuthState | undefined>(undefined)


/** Journalise une connexion une fois par onglet et par utilisateur (sessions restaurées comprises). */
function logSessionOnce(userId: string, email: string) {
  const key = `login_logged:${userId}`
  try {
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
  } catch {
    /* stockage indisponible : on journalise sans déduplication */
  }
  void logActivity('LOGIN', 'auth', userId, { email })
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadProfile = async (userId: string | undefined) => {
    if (!userId) { setProfile(null); return }
    const { data, error: err } = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle()
    if (err) setError(err.message)
    setProfile((data as Profile | null) ?? null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadProfile(data.session?.user.id)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, s) => {
      setSession(s)
      if (s && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) logSessionOnce(s.user.id, s.user.email ?? '')
      await loadProfile(s?.user.id)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const value: AuthState = {
    session,
    profile,
    loading,
    error,
    signIn: async (email, password) => {
      setError(null)
      const { data, error: err } = await supabase.auth.signInWithPassword({ email, password })
      if (err) throw err
      if (data.user) logSessionOnce(data.user.id, email)
    },
    signOut: async () => { await endSession() },
    refreshProfile: async () => loadProfile(session?.user.id),
    can: (...roles) => !!profile && profile.is_active && roles.includes(profile.role),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth hors AuthProvider')
  return c
}

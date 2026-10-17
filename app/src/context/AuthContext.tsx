import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthContextType {
  user: User | null
  role: string | null
  operatorCode: string | null // UTIC_CODE linked to this user
  loading: boolean
  logout: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [operatorCode, setOperatorCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const extractMeta = (u: User | null) => {
    if (!u) { setRole(null); setOperatorCode(null); return }
    setRole(u.user_metadata?.role || null)
    setOperatorCode(u.user_metadata?.operator_code || null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      extractMeta(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
      extractMeta(session?.user ?? null)
    })

    return () => subscription?.unsubscribe()
  }, [])

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null); setRole(null); setOperatorCode(null)
  }

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  return (
    <AuthContext.Provider value={{ user, role, operatorCode, loading, logout, login }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

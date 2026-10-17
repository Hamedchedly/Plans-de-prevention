import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  throw new Error('Variables VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY manquantes (fichier app/.env.local).')
}

// Toutes les tables de l'application sont dans le schéma dédié plans_prevention.
export const supabase = createClient(url, anonKey, {
  db: { schema: 'plans_prevention' },
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

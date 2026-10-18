import { supabase } from './supabase'

// Connexion à la place d'un utilisateur (Super Admin). La session de l'administrateur est remplacée :
// pour revenir, l'administrateur se reconnecte. Tout est journalisé (début côté serveur, fin côté client).
const KEY = 'pp-impersonation'

export interface ImpersonationInfo {
  adminId: string
  adminEmail: string | null
  targetId: string
  targetEmail: string
  startedAt: string
}

export function readImpersonation(): ImpersonationInfo | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as ImpersonationInfo) : null
  } catch {
    return null
  }
}

export async function startImpersonation(target: { user_id: string; email: string | null }, admin: { id: string; email: string | null }) {
  const { data, error } = await supabase.functions.invoke<{ token_hash?: string; email?: string; error?: string }>('impersonate', {
    body: { user_id: target.user_id },
  })
  if (error) throw new Error(error.message)
  if (!data?.token_hash) throw new Error(data?.error ?? 'Session impossible')
  const info: ImpersonationInfo = {
    adminId: admin.id, adminEmail: admin.email, targetId: target.user_id,
    targetEmail: target.email ?? data.email ?? '', startedAt: new Date().toISOString(),
  }
  localStorage.setItem(KEY, JSON.stringify(info))
  const { error: vErr } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' })
  if (vErr) { localStorage.removeItem(KEY); throw vErr }
  window.location.reload()
}

/** Fin de session : journalise la fin si une session ouverte est en cours, puis déconnecte. */
export async function endSession() {
  const info = readImpersonation()
  if (info) {
    try {
      await supabase.rpc('log_activity', {
        p_action: 'IMPERSONATION_END', p_entity: 'profiles', p_entity_id: info.targetId,
        p_payload: { admin_id: info.adminId, admin_email: info.adminEmail, target_email: info.targetEmail, started_at: info.startedAt },
      })
    } catch {
      /* journal indisponible : la déconnexion reste effective */
    }
    localStorage.removeItem(KEY)
  }
  await supabase.auth.signOut()
}

import { supabase } from './supabase'
import type { AdminPageKey } from './adminNav'

/** Nombre d'actions en attente par page d'administration (pastilles de la navigation). */
export type AdminPending = Partial<Record<AdminPageKey, number>>

/** Compte les éléments à traiter. Best-effort : une erreur donne 0 pour cette page, sans bloquer l'interface. */
export async function fetchAdminPending(): Promise<AdminPending> {
  const [alerts, refs, scopes, companies, controls] = await Promise.all([
    supabase.from('alerts').select('code', { count: 'exact', head: true }).in('status', ['A_VALIDER', 'APPLIQUE_A_VALIDER']),
    supabase.from('referential_proposals').select('id', { count: 'exact', head: true }).eq('status', 'EN_ATTENTE'),
    supabase.from('orders').select('order_number', { count: 'exact', head: true }).eq('scope_request_status', 'EN_ATTENTE'),
    supabase.rpc('company_proposals_list', { p_status: 'EN_ATTENTE' }),
    supabase.rpc('order_controls'),
  ])
  const validations = (refs.count ?? 0) + (scopes.count ?? 0) + (companies.error ? 0 : (companies.data ?? []).length)
  return {
    alertes: alerts.error ? 0 : (alerts.count ?? 0),
    controles: controls.error ? 0 : (controls.data ?? []).length,
    validations,
  }
}

/** Total des actions à traiter dans l'administration (pastille du lien « Administration »). */
export function totalPending(p: AdminPending): number {
  return Object.values(p).reduce((sum, n) => sum + (n ?? 0), 0)
}

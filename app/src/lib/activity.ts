import { supabase } from './supabase'

/** Journal d'activité : ne bloque jamais l'application. */
export async function logActivity(action: 'LOGIN' | 'IMPORT' | 'ERROR', entity: string, entityId: string, payload: Record<string, unknown> = {}) {
  try {
    await supabase.rpc('log_activity', { p_action: action, p_entity: entity, p_entity_id: entityId, p_payload: payload })
  } catch {
    /* journal indisponible : on ignore */
  }
}

export function logError(context: string, e: unknown) {
  const message = e instanceof Error ? e.message : String(e)
  void logActivity('ERROR', context, '', { message, context })
}

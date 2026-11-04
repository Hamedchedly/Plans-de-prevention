import { supabase } from './supabase'

export type NotificationKind = 'MANUEL' | 'IMPORT'
export interface SiteNotification {
  id: string
  kind: NotificationKind
  title: string
  body: string
  created_at: string
  read: boolean
}

/** Notifications visibles par l'utilisateur, la plus récente d'abord, avec son état de lecture. */
export async function fetchNotifications(userId: string): Promise<SiteNotification[]> {
  const { data, error } = await supabase.from('notifications')
    .select('id,kind,title,body,created_at').order('created_at', { ascending: false }).limit(50)
  if (error) throw error
  const { data: reads, error: readErr } = await supabase.from('notification_reads')
    .select('notification_id').eq('user_id', userId)
  if (readErr) throw readErr
  const readIds = new Set((reads ?? []).map((r) => (r as { notification_id: string }).notification_id))
  return (data ?? []).map((n) => {
    const row = n as Omit<SiteNotification, 'read'>
    return { ...row, read: readIds.has(row.id) }
  })
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.rpc('mark_notifications_read', { p_ids: ids })
  if (error) throw error
}

/** Envoi manuel (Super Admin). `operators` n'est utilisé que pour l'audience CHOIX. */
export async function sendNotification(input: { title: string; body: string; audience: 'TOUS' | 'CHOIX'; operators: string[] }): Promise<void> {
  const { error } = await supabase.rpc('send_notification', {
    p_title: input.title, p_body: input.body, p_audience: input.audience, p_operators: input.operators,
  })
  if (error) throw error
}

/** Notification automatique après un import réussi (responsable ou Super Admin). */
export async function notifyImport(kindLabel: string, fileName: string, inserted: number, updated: number): Promise<void> {
  if (inserted + updated === 0) return
  const { error } = await supabase.rpc('notify_import', {
    p_kind: kindLabel, p_file: fileName, p_inserted: inserted, p_updated: updated,
  })
  if (error) throw error
}

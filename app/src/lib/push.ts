import { supabase } from './supabase'

/** Clé publique VAPID (non secrète) : doit correspondre à la clé privée stockée côté Supabase. */
const VAPID_PUBLIC = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? ''

export type PushState = 'indisponible' | 'refusee' | 'active' | 'inactive'

export function pushSupported(): boolean {
  return VAPID_PUBLIC !== '' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** Enregistre le service worker (sans lui, pas de notification hors site). Échec silencieux. */
export async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
  } catch {
    // Navigateur ou contexte sans service worker : l'application reste utilisable.
  }
}

function urlBase64ToKey(base64url: string): BufferSource {
  const padded = base64url + '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0)) as BufferSource
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'indisponible'
  if (Notification.permission === 'denied') return 'refusee'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub ? 'active' : 'inactive'
}

/** Demande l'autorisation, puis enregistre l'abonnement de cet appareil pour le compte connecté. */
export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Autorisation refusée par le navigateur')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription())
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToKey(VAPID_PUBLIC) })
  const json = sub.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: json.endpoint ?? '', p_p256dh: json.keys?.p256dh ?? '', p_auth: json.keys?.auth ?? '',
  })
  if (error) throw error
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  const { error } = await supabase.rpc('revoke_push_subscription', { p_endpoint: sub.endpoint })
  if (error) throw error
  await sub.unsubscribe()
}

/** Demande l'envoi hors site d'une notification déjà enregistrée. Best effort : ne fait jamais échouer l'action. */
export async function sendPush(notificationId: string): Promise<void> {
  try {
    await supabase.functions.invoke('push-notify', { body: { notification_id: notificationId } })
  } catch {
    // La notification reste visible dans la cloche du site.
  }
}

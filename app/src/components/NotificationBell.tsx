import { useEffect, useState, useCallback } from 'react'
import { Bell } from 'lucide-react'
import { fetchNotifications, markNotificationsRead, type SiteNotification } from '../lib/notifications'
import { disablePush, enablePush, pushState, type PushState } from '../lib/push'

const REFRESH_MS = 120_000

/** Cloche des notifications du site : compteur des non lues, liste déroulante, lecture à l'ouverture. */
export default function NotificationBell({ userId }: { userId: string }) {
  const [items, setItems] = useState<SiteNotification[]>([])
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const [push, setPush] = useState<PushState>('indisponible')
  const [pushBusy, setPushBusy] = useState(false)
  const [pushErr, setPushErr] = useState<string | null>(null)

  const load = useCallback(() => {
    fetchNotifications(userId)
      .then((list) => { setItems(list); setFailed(false) })
      .catch(() => setFailed(true))
  }, [userId])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, REFRESH_MS)
    window.addEventListener('focus', load)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', load) }
  }, [load])

  const unread = items.filter((n) => !n.read).length

  const refreshPush = useCallback(() => {
    pushState().then(setPush).catch(() => setPush('indisponible'))
  }, [])

  const togglePush = async () => {
    setPushBusy(true); setPushErr(null)
    try {
      if (push === 'active') await disablePush(); else await enablePush()
    } catch (e) {
      setPushErr(e instanceof Error ? e.message : 'Activation impossible')
    } finally {
      setPushBusy(false)
      refreshPush()
    }
  }

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) refreshPush()
    if (next && unread > 0) {
      const ids = items.filter((n) => !n.read).map((n) => n.id)
      void markNotificationsRead(ids)
        .then(() => setItems((list) => list.map((n) => ({ ...n, read: true }))))
        .catch(() => undefined)
    }
  }

  if (failed) return null

  return (
    <div className="relative shrink-0">
      <button onClick={toggle} aria-label={unread > 0 ? `Notifications, ${unread} non lue(s)` : 'Notifications'}
        aria-expanded={open} className="relative flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted">
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="dialog" aria-label="Notifications" className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
            <div className="border-b border-border px-3 py-2.5 text-sm font-medium">Notifications</div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">Aucune notification.</p>}
              {items.map((n) => (
                <div key={n.id} className={`border-b border-border px-3 py-2.5 last:border-b-0 ${n.read ? '' : 'bg-primary/5'}`}>
                  <div className="text-sm font-medium">{n.title}</div>
                  {n.body && <div className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">{n.body}</div>}
                  <div className="mt-1 text-[11px] text-muted-foreground">{new Date(n.created_at).toLocaleString('fr-FR')}</div>
                </div>
              ))}
            </div>
            <div className="space-y-2 border-t border-border px-3 py-2.5 text-xs">
              {push === 'indisponible' && (
                <p className="text-muted-foreground">Notifications hors site non disponibles sur ce navigateur. Sur iPhone, ajoutez le site à l’écran d’accueil.</p>
              )}
              {push === 'refusee' && (
                <p className="text-muted-foreground">Notifications bloquées dans le navigateur : autorisez-les dans les réglages du site.</p>
              )}
              {(push === 'inactive' || push === 'active') && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{push === 'active' ? 'Actives sur cet appareil' : 'Inactives sur cet appareil'}</span>
                  <button onClick={() => void togglePush()} disabled={pushBusy}
                    className="rounded-full bg-muted px-3 py-1 font-medium hover:bg-muted/70 disabled:opacity-50">
                    {pushBusy ? '…' : push === 'active' ? 'Désactiver' : 'Activer'}
                  </button>
                </div>
              )}
              {pushErr && <p className="text-destructive">{pushErr}</p>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

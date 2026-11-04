import { useCallback, useEffect, useState } from 'react'
import { fetchOperatorCodes } from '../lib/operators'
import { fetchNotifications, sendNotification, type SiteNotification } from '../lib/notifications'
import { Button, Card, Notice, PageHeader, errMsg, fieldClass } from '../components/ui'
import { MultiSelect } from '../components/MultiSelect'

/** Envoi ponctuel d'une notification du site (Super Admin) et historique. */
export function NotificationsSection({ userId }: { userId: string }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<'TOUS' | 'CHOIX'>('TOUS')
  const [operators, setOperators] = useState<string[]>([])
  const [codes, setCodes] = useState<string[]>([])
  const [history, setHistory] = useState<SiteNotification[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const refresh = useCallback(() => {
    fetchNotifications(userId).then(setHistory).catch((e) => setErr(errMsg(e)))
  }, [userId])

  useEffect(() => {
    refresh()
    fetchOperatorCodes().then(setCodes).catch((e) => setErr(errMsg(e)))
  }, [refresh])

  const canSend = title.trim() !== '' && (audience === 'TOUS' || operators.length > 0) && !busy

  const send = async () => {
    setBusy(true); setErr(null); setMsg(null)
    try {
      await sendNotification({ title, body, audience, operators })
      setMsg('Notification envoyée.')
      setTitle(''); setBody('')
      refresh()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" subtitle="Message ponctuel affiché dans la cloche des utilisateurs concernés." />
      <Card className="max-w-2xl space-y-4">
        {err && <Notice tone="error">{err}</Notice>}
        {msg && <Notice tone="ok">{msg}</Notice>}
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Titre</label>
          <input className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex. Réunion sécurité jeudi" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Message</label>
          <textarea className={`${fieldClass} min-h-24`} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <fieldset className="space-y-2 text-sm">
          <legend className="mb-1 text-xs text-muted-foreground">Destinataires</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="audience" checked={audience === 'TOUS'} onChange={() => setAudience('TOUS')} />
            Tous les utilisateurs actifs
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="audience" checked={audience === 'CHOIX'} onChange={() => setAudience('CHOIX')} />
            Chargés choisis (et responsables)
          </label>
          {audience === 'CHOIX' && (
            <div className="min-w-48 pl-6">
              <MultiSelect label="Chargés" options={codes} value={operators} placeholder="Choisir les chargés"
                onChange={setOperators} />
            </div>
          )}
        </fieldset>
        <Button onClick={() => void send()} disabled={!canSend}>{busy ? 'Envoi…' : 'Envoyer la notification'}</Button>
      </Card>
      <Card className="max-w-2xl space-y-3">
        <h2 className="font-semibold">Dernières notifications</h2>
        {history === null ? <p className="text-sm text-muted-foreground">Chargement…</p>
          : history.length === 0 ? <p className="text-sm text-muted-foreground">Aucune notification envoyée.</p>
          : history.slice(0, 20).map((n) => (
            <div key={n.id} className="border-t border-border pt-2 first:border-t-0 first:pt-0">
              <div className="text-sm font-medium">{n.title}</div>
              {n.body && <div className="whitespace-pre-line text-xs text-muted-foreground">{n.body}</div>}
              <div className="text-[11px] text-muted-foreground">{new Date(n.created_at).toLocaleString('fr-FR')} · {n.kind === 'IMPORT' ? 'Import' : 'Manuel'}</div>
            </div>
          ))}
      </Card>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Bubble } from './Bubble'

type Stamp = { kind: string; file_name: string; created_at: string }

/** Libellés affichés dans la bulle : fichier commandes (ANM_COMD) et fichier de suivi (ANM_SUIVTRXSECT). */
const LABEL: Record<string, string> = { COMMANDES: 'Suivi budgétaire', SUIVI_BUDGET: 'Historique travaux' }

const fmtLong = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const fmtShort = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** Date de la dernière mise à jour de chaque fichier importé ; le détail s'ouvre au clic. */
export default function ImportStamp({ userId, path }: { userId: string | undefined; path: string }) {
  const [latest, setLatest] = useState<Record<string, Stamp>>({})

  useEffect(() => {
    if (!userId) return
    let alive = true
    supabase.from('imports').select('kind,file_name,created_at').eq('status', 'TERMINE')
      .order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => {
        if (!alive) return
        const map: Record<string, Stamp> = {}
        for (const r of (data ?? []) as Stamp[]) if (!map[r.kind]) map[r.kind] = r
        setLatest(map)
      })
    return () => { alive = false }
  }, [userId, path])

  const kinds = Object.keys(LABEL).filter((k) => latest[k])
  if (kinds.length === 0) return null
  const newest = kinds.map((k) => latest[k].created_at).sort()[kinds.length - 1]

  return (
    <div className="hidden shrink-0 md:block">
      <Bubble align="right" label={<>Données du <span className="font-semibold text-foreground">{fmtShort(newest)}</span></>}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dernière mise à jour des fichiers</p>
        <ul className="space-y-2">
          {kinds.map((k) => (
            <li key={k}>
              <div className="font-medium">{LABEL[k]}</div>
              <div className="text-xs text-muted-foreground">mis à jour le {fmtLong(latest[k].created_at)}</div>
            </li>
          ))}
        </ul>
      </Bubble>
    </div>
  )
}

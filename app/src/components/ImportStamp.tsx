import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Stamp = { kind: string; file_name: string; created_at: string }

/** Libellés affichés au survol : fichier commandes (ANM_COMD) et fichier de suivi (ANM_SUIVTRXSECT). */
const LABEL: Record<string, string> = { COMMANDES: 'Suivi budgétaire (ANM_COMD)', SUIVI_BUDGET: 'Historique travaux (ANM_SUIVTRXSECT)' }

const fmt = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Date de la dernière mise à jour de chaque fichier importé, discrète, à côté du profil. */
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
  const tooltip = kinds.map((k) => `${LABEL[k]} : ${latest[k].file_name}\nmis à jour le ${fmt(latest[k].created_at)}`).join('\n\n')
  const newest = kinds.map((k) => latest[k].created_at).sort()[kinds.length - 1]

  return (
    <div title={tooltip} className="hidden shrink-0 cursor-help text-right text-[11px] leading-tight text-muted-foreground md:block">
      <div>Données mises à jour</div>
      <div className="font-medium">{fmt(newest)}</div>
    </div>
  )
}

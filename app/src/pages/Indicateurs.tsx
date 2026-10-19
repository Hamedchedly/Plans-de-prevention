import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchContacts, type Contact } from '../lib/sheet'
import { Card, Notice, PageHeader, errMsg } from '../components/ui'
import { PIPELINE_SEGMENTS, PipelineBar, type PipelineCounts } from '../components/PipelineBar'

type Row = { operator_code: string | null; plan_status: string }

/** Commandes du périmètre, hors corbeille (toutes les lignes, par tranches de 1000). */
async function fetchScopeRows(): Promise<Row[]> {
  const page = 1000
  const out: Row[] = []
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from('orders').select('operator_code,plan_status')
      .eq('scope_status', 'IN_SCOPE').is('trashed_at', null).range(from, from + page - 1)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as Row[]))
    if (!data || data.length < page) break
  }
  return out
}

const emptyCounts = (): PipelineCounts => ({ attente: 0, fait: 0, envoye: 0, retour: 0 })

/** Ajoute une commande au compteur de son statut ; les archivées et envois manuels ne comptent pas. */
function addTo(c: PipelineCounts, status: string) {
  if (status === 'NON_QUALIFIEE') c.attente++
  else if (status === 'A_ENVOYER') c.fait++
  else if (status === 'EN_ATTENTE_RETOUR') c.envoye++
  else if (status === 'SIGNEE') c.retour++
}

export default function Indicateurs() {
  const [rows, setRows] = useState<Row[]>([])
  const [names, setNames] = useState<Map<string, Contact>>(new Map())
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  /** Chargé sélectionné : sa ligne est surlignée et la barre n'affiche que ses commandes. */
  const [focus, setFocus] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchScopeRows()
      .then(async (data) => {
        if (!alive) return
        setRows(data)
        const map = await fetchContacts(data.map((r) => r.operator_code ?? '')).catch(() => new Map<string, Contact>())
        if (alive) setNames(map)
      })
      .catch((e) => { if (alive) setErr(errMsg(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const total = useMemo(() => {
    const c = emptyCounts()
    rows.forEach((r) => addTo(c, r.plan_status))
    return c
  }, [rows])

  const byOperator = useMemo(() => {
    const m = new Map<string, PipelineCounts>()
    for (const r of rows) {
      const code = r.operator_code ?? '—'
      if (!m.has(code)) m.set(code, emptyCounts())
      addTo(m.get(code)!, r.plan_status)
    }
    return [...m.entries()]
      .map(([code, c]) => ({ code, c, sum: c.attente + c.fait + c.envoye + c.retour }))
      .filter((x) => x.sum > 0)
      .sort((a, b) => b.sum - a.sum)
  }, [rows])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Indicateurs chargés"
        subtitle="Responsables et super admin · commandes du périmètre, hors archivées"
      />

      {err && <Notice tone="error">{err}</Notice>}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">{focus ? `Chargé : ${names.get(focus)?.name || focus}` : 'Ensemble des chargés'}</h2>
            <p className="text-xs text-muted-foreground">
              {focus ? 'Barre filtrée sur ce chargé. Cliquez à nouveau sur son nom pour revenir à l’ensemble.' : loading ? 'Chargement…' : `${byOperator.length} chargé(s) avec des commandes`}
            </p>
          </div>
          {focus && <button type="button" onClick={() => setFocus(null)} className="rounded-full bg-muted px-3.5 py-1.5 text-xs font-medium hover:bg-muted/70">Voir tous les chargés</button>}
        </div>
        <PipelineBar counts={focus ? (byOperator.find((x) => x.code === focus)?.c ?? emptyCounts()) : total} />
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Chargé</th>
              <th className="px-4 py-2 text-right font-medium">Commandes</th>
              <th className="px-4 py-2 font-medium">Avancement</th>
              <th className="px-4 py-2 text-right font-medium">En attente de plan</th>
              <th className="px-4 py-2 text-right font-medium">Plan fait</th>
              <th className="px-4 py-2 text-right font-medium">Envoyé, sans retour</th>
              <th className="px-4 py-2 text-right font-medium">Avec retour</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {byOperator.map(({ code, c, sum }) => (
              <tr key={code} className={`align-middle transition-colors ${focus === code ? 'bg-primary/5 ring-1 ring-inset ring-primary/20' : 'hover:bg-muted/40'}`}>
                <td className="px-4 py-2.5">
                  <button type="button" onClick={() => setFocus(focus === code ? null : code)} aria-pressed={focus === code}
                    className="text-left font-medium hover:underline">
                    {names.get(code)?.name || code}
                  </button>
                  {names.get(code)?.name && <div className="font-mono text-[11px] text-muted-foreground">{code}</div>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{sum}</td>
                <td className="px-4 py-2.5">
                  <div className="flex h-2.5 min-w-[160px] overflow-hidden rounded-full bg-muted">
                    {PIPELINE_SEGMENTS.map((s) => (
                      c[s.key] > 0 ? <div key={s.key} style={{ width: `${(c[s.key] / sum) * 100}%`, background: s.color }} title={`${s.label} : ${c[s.key]}`} /> : null
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{c.attente}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{c.fait}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{c.envoye}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{c.retour}</td>
              </tr>
            ))}
            {!loading && byOperator.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">Aucune commande dans le périmètre.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

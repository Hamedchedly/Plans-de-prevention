import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button, Card, Notice, errMsg, fieldClass } from '../components/ui'

interface PurgeCounts { orders: number; companies: number; companies_kept: number }

/** Tables consultables depuis l'admin (lecture seule). */
const TABLES = [
  'natures', 'nature_lots', 'nature_risks', 'nature_measures', 'lots', 'risks', 'measures', 'lot_risks', 'measure_risk_rules',
  'vocabulary', 'alerts', 'naac_corps_etat', 'referential_proposals', 'referentiel_versions',
  'orders', 'order_lots', 'order_risks', 'order_measures', 'budget_tracking', 'import_rows', 'imports',
  'companies', 'company_proposals', 'scope_rules', 'profiles', 'audit_logs', 'trace_highlights',
]
const PAGE = 50

/** Purge des commandes hors périmètre (HO) et des entreprises qui ne leur sont rattachées que. Super Admin, avec confirmation. */
function PurgeCard() {
  const [counts, setCounts] = useState<PurgeCounts | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const refresh = async () => {
    const { data, error } = await supabase.rpc('purge_preview')
    if (error) { setErr(error.message); return }
    setCounts(data as PurgeCounts)
  }
  useEffect(() => { void refresh() }, [])

  const purge = async () => {
    setBusy(true); setErr(null); setMsg(null)
    const { data, error } = await supabase.rpc('purge_out_of_scope')
    setBusy(false)
    if (error) { setErr(error.message); return }
    const r = data as { orders: number; companies: number }
    setMsg(`Purge effectuée : ${r.orders} commande(s) et ${r.companies} entreprise(s) supprimées. Sauvegarde conservée dans purge_log.`)
    setConfirming(false)
    void refresh()
  }

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-semibold">Purge des commandes hors périmètre</h2>
        <p className="text-sm text-muted-foreground">
          Supprime les commandes hors périmètre (HO) et les entreprises qui ne sont rattachées qu’à elles. Les entreprises encore utilisées par une commande dans le périmètre sont conservées.
          Les données supprimées sont sauvegardées dans <span className="font-mono">purge_log</span>.
        </p>
      </div>
      {err && <Notice tone="error">{err}</Notice>}
      {msg && <Notice tone="ok">{msg}</Notice>}
      {counts && (
        <p className="text-sm">
          À supprimer : <strong>{counts.orders}</strong> commande(s) et <strong>{counts.companies}</strong> entreprise(s).
          {counts.companies_kept > 0 && <> Conservées (encore utilisées) : {counts.companies_kept} entreprise(s).</>}
        </p>
      )}
      {!confirming ? (
        <Button variant="ghost" onClick={() => setConfirming(true)} disabled={!counts || (counts.orders === 0 && counts.companies === 0)}>
          Purger…
        </Button>
      ) : (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2">
          <p className="text-sm">
            Confirmer la suppression définitive de <strong>{counts?.orders ?? 0}</strong> commande(s) et <strong>{counts?.companies ?? 0}</strong> entreprise(s) ?
          </p>
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => void purge()} disabled={busy}>Confirmer la purge</Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>Annuler</Button>
          </div>
        </div>
      )}
    </Card>
  )
}

/** Visionneuse de la base : permet de vérifier et d'améliorer les données directement depuis l'admin. */
export function DataSection() {
  const [table, setTable] = useState(TABLES[0])
  const [page, setPage] = useState(0)
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true); setErr(null)
    const run = async () => {
      let req = supabase.from(table).select('*', { count: 'exact' }).range(page * PAGE, page * PAGE + PAGE - 1)
      if (q.trim()) {
        const term = q.trim().replace(/[%,()]/g, ' ')
        const { data: sample } = await supabase.from(table).select('*').limit(1)
        const textCol = sample?.[0] ? Object.keys(sample[0]).find((k) => typeof (sample[0] as Record<string, unknown>)[k] === 'string') : undefined
        if (textCol) req = req.ilike(textCol, `%${term}%`)
      }
      const { data, error, count } = await req
      if (!alive) return
      if (error) { setErr(error.message); setRows([]); setTotal(null) } else { setRows((data ?? []) as Record<string, unknown>[]); setTotal(count ?? null) }
      setLoading(false)
    }
    void run().catch((e) => { if (alive) { setErr(errMsg(e)); setLoading(false) } })
    return () => { alive = false }
  }, [table, page, q])

  const columns = rows[0] ? Object.keys(rows[0]) : []
  const pages = total != null ? Math.max(1, Math.ceil(total / PAGE)) : 1
  const show = (v: unknown) => {
    if (v === null || v === undefined) return <span className="text-muted-foreground">∅</span>
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    return <span title={s}>{s.length > 80 ? s.slice(0, 80) + '…' : s}</span>
  }

  return (
    <div className="space-y-4">
    <PurgeCard />
    <Card className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Table</label>
          <select className={fieldClass} value={table} onChange={(e) => { setTable(e.target.value); setPage(0); setQ('') }}>
            {TABLES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs text-muted-foreground">Filtre (première colonne texte)</label>
          <input className={fieldClass} value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} placeholder="ex. S11" />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Button variant="ghost" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0 || loading}>←</Button>
          <span>Page {page + 1} / {pages}</span>
          <Button variant="ghost" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page + 1 >= pages || loading}>→</Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Lecture seule : {total ?? '…'} ligne(s). Les modifications passent par les écrans métier (validations, import, référentiel) pour garder la traçabilité.
      </p>
      {err && <Notice tone="error">{err}</Notice>}
      {loading ? <p className="text-sm text-muted-foreground">Chargement…</p> : rows.length === 0 ? <Notice>Aucune ligne.</Notice> : (
        <div className="max-h-[70vh] overflow-auto rounded-md border border-border">
          <table className="text-xs">
            <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
              <tr>{columns.map((c) => <th key={c} className="whitespace-nowrap px-2 py-1.5 font-medium">{c}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border align-top">
                  {columns.map((c) => <td key={c} className="whitespace-nowrap px-2 py-1">{show(r[c])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
    </div>
  )
}

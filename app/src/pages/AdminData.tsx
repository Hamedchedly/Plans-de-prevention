import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button, Card, Notice, errMsg, fieldClass } from '../components/ui'

/** Tables consultables depuis l'admin (lecture seule). */
const TABLES = [
  'natures', 'nature_lots', 'nature_risks', 'nature_measures', 'lots', 'risks', 'measures', 'lot_risks', 'measure_risk_rules',
  'vocabulary', 'alerts', 'naac_corps_etat', 'referential_proposals', 'referentiel_versions',
  'orders', 'order_lots', 'order_risks', 'order_measures', 'budget_tracking', 'import_rows', 'imports',
  'companies', 'company_proposals', 'scope_rules', 'profiles', 'audit_logs', 'trace_highlights',
]
const PAGE = 50

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
  )
}

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Badge, Card, Notice, errMsg } from './ui'

type ImportRow = { id: string; kind: string; file_name: string; row_count: number; status: string; created_at: string }
type Line = { import_id: string; order_number: string | null }

/** Lit toutes les lignes (import_id, numéro) d'une table, par tranches de 1000. */
async function fetchLines(table: 'import_rows' | 'budget_tracking'): Promise<Line[]> {
  const page = 1000
  const out: Line[] = []
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from(table).select('import_id,order_number').range(from, from + page - 1)
    if (error) throw new Error(`${table} : ${error.message}`)
    out.push(...((data ?? []) as Line[]))
    if (!data || data.length < page) break
  }
  return out
}

type Analysis = {
  imp: ImportRow
  lines: number
  blank: number
  /** numéros présents plusieurs fois dans ce fichier */
  repeated: string[]
  /** numéros aussi présents dans un autre import du même type */
  shared: string[]
}

/** Analyse des doublons sur tous les imports : répétitions dans un fichier, et numéros présents dans plusieurs imports. */
export default function ImportDuplicates() {
  const [analyses, setAnalyses] = useState<Analysis[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true); setErr(null)
    try {
      const { data: imports, error } = await supabase.from('imports')
        .select('id,kind,file_name,row_count,status,created_at').order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      const list = (imports ?? []) as ImportRow[]
      const [rowsC, rowsB] = await Promise.all([fetchLines('import_rows'), fetchLines('budget_tracking')])
      const byImport = new Map<string, Line[]>()
      for (const l of [...rowsC, ...rowsB]) byImport.set(l.import_id, [...(byImport.get(l.import_id) ?? []), l])

      // numéro -> imports (de même type) qui le contiennent
      const where = new Map<string, Set<string>>()
      for (const imp of list) {
        for (const l of byImport.get(imp.id) ?? []) {
          if (!l.order_number) continue
          const key = `${imp.kind}|${l.order_number}`
          if (!where.has(key)) where.set(key, new Set())
          where.get(key)!.add(imp.id)
        }
      }

      setAnalyses(list.map((imp) => {
        const lines = byImport.get(imp.id) ?? []
        const count = new Map<string, number>()
        let blank = 0
        for (const l of lines) {
          if (!l.order_number) { blank++; continue }
          count.set(l.order_number, (count.get(l.order_number) ?? 0) + 1)
        }
        const repeated = [...count.entries()].filter(([, n]) => n > 1).map(([k]) => k).sort()
        const shared = [...count.keys()].filter((n) => (where.get(`${imp.kind}|${n}`)?.size ?? 0) > 1).sort()
        return { imp, lines: lines.length, blank, repeated, shared }
      }))
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  useEffect(() => { void run() }, [])

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Analyse des doublons</h2>
          <p className="text-sm text-muted-foreground">
            Pour chaque import : numéros répétés dans le fichier, et numéros aussi présents dans un autre import du même type.
          </p>
        </div>
        <Badge>{busy ? 'Analyse…' : analyses ? `${analyses.length} import(s)` : ''}</Badge>
      </div>
      {err && <Notice tone="error">{err}</Notice>}
      {analyses && analyses.length === 0 && <p className="text-sm text-muted-foreground">Aucun import pour l’instant.</p>}
      {analyses && analyses.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Import</th>
                <th className="py-2 pr-3 text-right font-medium">Lignes</th>
                <th className="py-2 pr-3 text-right font-medium">Répétés</th>
                <th className="py-2 pr-3 text-right font-medium">Dans un autre import</th>
                <th className="py-2 pr-3 text-right font-medium">Sans numéro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {analyses.map((a) => (
                <tr key={a.imp.id} className="align-top">
                  <td className="py-2.5 pr-3">
                    <div className="font-medium">{a.imp.file_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.imp.kind === 'COMMANDES' ? 'Commandes' : 'Suivi budgétaire'} · {new Date(a.imp.created_at).toLocaleString('fr-FR')}
                      {a.imp.status !== 'TERMINE' && ` · ${a.imp.status}`}
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{a.lines}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    <Count n={a.repeated.length} list={a.repeated} />
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    <Count n={a.shared.length} list={a.shared} />
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{a.blank}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button type="button" onClick={() => void run()} disabled={busy}
        className="inline-flex h-9 items-center rounded-full bg-card px-4 text-sm font-medium shadow-sm hover:bg-muted disabled:opacity-50">
        Relancer l’analyse
      </button>
    </Card>
  )
}

/** Nombre cliquable : affiche la liste des numéros concernés. */
function Count({ n, list }: { n: number; list: string[] }) {
  const [open, setOpen] = useState(false)
  if (n === 0) return <span className="text-muted-foreground">0</span>
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} className="font-semibold text-amber-700 hover:underline">{n}</button>
      {open && <div className="mt-1 max-h-40 overflow-y-auto text-left font-mono text-xs text-muted-foreground">{list.join(', ')}</div>}
    </div>
  )
}

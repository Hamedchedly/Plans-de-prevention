import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import type { OrderRow } from '../lib/types'
import { Badge, Button, Card, Notice, errMsg, fieldClass } from '../components/ui'

export interface CompanyRow {
  isis_code: string
  name: string | null
  os_email: string | null
  director_name: string | null
  director_email: string | null
  director_phone: string | null
  company_phone: string | null
}

export const COMPANY_FIELDS: { key: keyof Omit<CompanyRow, 'isis_code'>; label: string }[] = [
  { key: 'name', label: 'Nom de l’entreprise' },
  { key: 'os_email', label: 'Email OS' },
  { key: 'director_name', label: 'Nom du dirigeant' },
  { key: 'director_email', label: 'Email du dirigeant' },
  { key: 'director_phone', label: 'Tél. dirigeant' },
  { key: 'company_phone', label: 'Tél. entreprise' },
]

export async function fetchCompanies(): Promise<CompanyRow[]> {
  const { data, error } = await supabase.from('companies').select('*').order('isis_code')
  if (error) throw new Error(error.message)
  return (data ?? []) as CompanyRow[]
}

async function fetchAllOrders(): Promise<OrderRow[]> {
  const page = 1000
  const out: OrderRow[] = []
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from('orders').select('*').order('order_number').range(from, from + page - 1)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as OrderRow[]))
    if (!data || data.length < page) break
  }
  return out
}

const HEADERS = ['N° commande', 'Date', 'Secteur', 'Adresse', 'Nature (source)', 'Entreprise (n°)', 'Nom de l’entreprise', 'Email OS', 'Nom du dirigeant', 'Email du dirigeant', 'Tél. dirigeant', 'Tél. entreprise']

/** Tableau Excel : une ligne par commande, classée par numéro de commande, avec les infos de l'entreprise. */
export function CompaniesSection() {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [q, setQ] = useState('')
  const [missingOnly, setMissingOnly] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<string[]>([])

  const load = async () => {
    setErr(null)
    try { const [o, c] = await Promise.all([fetchAllOrders(), fetchCompanies()]); setOrders(o); setCompanies(c) } catch (e) { setErr(errMsg(e)) }
  }
  useEffect(() => { void load() }, [])

  const byIsis = useMemo(() => new Map(companies.map((c) => [c.isis_code, c])), [companies])
  const countByIsis = useMemo(() => {
    const m = new Map<string, number>()
    orders.forEach((o) => { if (o.isis_code) m.set(o.isis_code, (m.get(o.isis_code) ?? 0) + 1) })
    return m
  }, [orders])
  const isisList = useMemo(() => [...countByIsis.entries()].sort((a, b) => b[1] - a[1]).map(([isis]) => isis), [countByIsis])
  const incomplete = (isis: string) => { const c = byIsis.get(isis); return !c?.name || !c?.os_email }
  const shown = isisList.filter((isis) => {
    const c = byIsis.get(isis)
    if (missingOnly && !incomplete(isis)) return false
    const hay = `${isis} ${c?.name ?? ''} ${c?.os_email ?? ''}`.toLowerCase()
    return !q || hay.includes(q.toLowerCase())
  })

  const exportXlsx = () => {
    const rows = orders.map((o) => {
      const c = o.isis_code ? byIsis.get(o.isis_code) : undefined
      return [o.order_number, o.order_date ?? '', o.sector_code ?? '', [o.address, o.city].filter(Boolean).join(', '),
        o.nature_text ?? '', o.isis_code ?? '', c?.name ?? '', c?.os_email ?? '', c?.director_name ?? '',
        c?.director_email ?? '', c?.director_phone ?? '', c?.company_phone ?? '']
    })
    const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Entreprises')
    XLSX.writeFile(wb, `entreprises_par_commande_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const importXlsx = async (file: File) => {
    setBusy(true); setErr(null); setMsg(null); setConflicts([])
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][]
      const header = (matrix[0] ?? []).map((h) => String(h ?? '').trim())
      const col = (name: string) => header.indexOf(name)
      const iIsis = col('Entreprise (n°)')
      if (iIsis < 0) throw new Error('Colonne « Entreprise (n°) » introuvable dans le fichier.')
      const cols: Record<string, number> = {
        name: col('Nom de l’entreprise'), os_email: col('Email OS'), director_name: col('Nom du dirigeant'),
        director_email: col('Email du dirigeant'), director_phone: col('Tél. dirigeant'), company_phone: col('Tél. entreprise'),
      }
      const merged = new Map<string, Record<string, string | null>>()
      const seen = new Map<string, Record<string, string | null>>()
      const conflictList: string[] = []
      for (const row of matrix.slice(1)) {
        const isis = String(row[iIsis] ?? '').trim()
        if (!isis || isis === 'null') continue
        const values: Record<string, string | null> = {}
        for (const [k, i] of Object.entries(cols)) {
          const v = i >= 0 && row[i] != null ? String(row[i]).trim() : ''
          values[k] = v || null
        }
        const prev = seen.get(isis)
        if (prev) {
          for (const k of Object.keys(values)) {
            if (prev[k] && values[k] && prev[k] !== values[k]) conflictList.push(`${isis} : « ${k} » diffère (« ${prev[k]} » / « ${values[k]} »), la première valeur est gardée`)
          }
        }
        const base = { ...(prev ?? {}) }
        for (const k of Object.keys(values)) if (!base[k] && values[k]) base[k] = values[k]
        seen.set(isis, base)
        merged.set(isis, base)
      }
      const payload = [...merged.entries()].map(([isis_code, v]) => ({ isis_code, ...v }))
      let n = 0
      for (let i = 0; i < payload.length; i += 200) {
        const { data, error } = await supabase.rpc('upsert_companies', { p_rows: payload.slice(i, i + 200) })
        if (error) throw new Error(error.message)
        n += Number(data ?? 0)
      }
      setConflicts(conflictList)
      setMsg(`${n} entreprise(s) importée(s) et validée(s).`)
      await load()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  const remove = async (isis: string) => {
    if (!window.confirm(`Supprimer la fiche de l’entreprise ${isis} ? Les commandes ne sont pas modifiées.`)) return
    const { error } = await supabase.rpc('delete_company', { p_isis: isis })
    if (error) { setErr(error.message); return }
    await load()
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-semibold">Entreprises ({isisList.length} numéros, {companies.length} fiches)</h2>
        <Button variant="ghost" onClick={exportXlsx} disabled={!orders.length}>Exporter Excel</Button>
        <label className="inline-flex cursor-pointer items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted">
          Importer Excel
          <input type="file" accept=".xlsx,.xls" className="hidden" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void importXlsx(f); e.target.value = '' }} />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Exportez le tableau, complétez-le dans Excel (une ligne par commande, colonnes entreprise à remplir) puis réimportez-le sans changer les en-têtes.
        Les fiches sont identifiées par le numéro d’entreprise (ENTN_NUM).
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-xs text-muted-foreground">Recherche (n°, nom, email OS)</label>
          <input className={fieldClass} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} />
          Fiches incomplètes seulement
        </label>
      </div>
      {msg && <Notice tone="ok">{msg}</Notice>}
      {conflicts.length > 0 && (
        <Notice tone="error">
          <p className="font-semibold">{conflicts.length} conflit(s) dans le fichier (même numéro, valeurs différentes) :</p>
          <ul className="mt-1 list-disc pl-5">{conflicts.slice(0, 20).map((c) => <li key={c}>{c}</li>)}</ul>
        </Notice>
      )}
      {err && <Notice tone="error">{err}</Notice>}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Entreprise (n°)</th>
              <th className="px-3 py-2">Commandes</th>
              <th className="px-3 py-2">Nom</th>
              <th className="px-3 py-2">Email OS</th>
              <th className="px-3 py-2">Dirigeant</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, 300).map((isis) => {
              const c = byIsis.get(isis)
              return (
                <tr key={isis} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{isis}</td>
                  <td className="px-3 py-2">{countByIsis.get(isis)}</td>
                  <td className="px-3 py-2">{c?.name ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2">{c?.os_email ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2">{c?.director_name ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2">{incomplete(isis) ? <Badge tone="warn">À compléter</Badge> : <Badge tone="ok">Complète</Badge>}</td>
                  <td className="px-3 py-2 text-right">
                    {c && <Button variant="ghost" onClick={() => void remove(isis)}>Supprimer</Button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {shown.length > 300 && <p className="text-xs text-muted-foreground">300 premiers numéros affichés sur {shown.length}.</p>}
    </Card>
  )
}

interface CompanyProposal { id: number; isis_code: string; payload: Partial<CompanyRow>; created_by: string | null; created_at: string }

/** Propositions des utilisateurs : valider, modifier avant validation, ou refuser. */
export function CompanyProposalsSection() {
  const [rows, setRows] = useState<CompanyProposal[]>([])
  const [drafts, setDrafts] = useState<Record<number, Partial<CompanyRow>>>({})
  const [comments, setComments] = useState<Record<number, string>>({})
  const [err, setErr] = useState<string | null>(null)

  const load = async () => {
    setErr(null)
    const { data, error } = await supabase.from('company_proposals').select('id,isis_code,payload,created_by,created_at')
      .eq('status', 'EN_ATTENTE').order('created_at')
    if (error) { setErr(error.message); return }
    setRows((data ?? []) as CompanyProposal[])
  }
  useEffect(() => { void load() }, [])

  const decide = async (p: CompanyProposal, approve: boolean, modified: boolean) => {
    const fields = modified ? { ...p.payload, ...drafts[p.id] } : null
    const { error } = await supabase.rpc('decide_company_proposal', {
      p_id: p.id, p_approve: approve, p_comment: comments[p.id] || null, p_fields: fields,
    })
    if (error) { setErr(error.message); return }
    await load()
  }

  return (
    <Card className="space-y-3">
      <h3 className="text-sm font-semibold">Fiches entreprise proposées ({rows.length})</h3>
      {err && <Notice tone="error">{err}</Notice>}
      {rows.length === 0 && <Notice>Aucune fiche en attente.</Notice>}
      {rows.map((p) => {
        const draft = { ...p.payload, ...drafts[p.id] }
        return (
          <div key={p.id} className="space-y-2 rounded-md border border-border p-3">
            <p className="text-sm">Entreprise <span className="font-mono">{p.isis_code}</span> · proposée le {new Date(p.created_at).toLocaleDateString('fr-FR')}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {COMPANY_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="mb-1 block text-xs text-muted-foreground">{f.label}</label>
                  <input className={fieldClass} value={(draft[f.key] as string) ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: { ...d[p.id], [f.key]: e.target.value } }))} />
                </div>
              ))}
            </div>
            <input className={fieldClass} placeholder="Commentaire (facultatif)" value={comments[p.id] ?? ''}
              onChange={(e) => setComments((c) => ({ ...c, [p.id]: e.target.value }))} />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void decide(p, true, false)}>Valider telle quelle</Button>
              <Button variant="ghost" onClick={() => void decide(p, true, true)} disabled={!drafts[p.id]}>Valider avec modifications</Button>
              <Button variant="danger" onClick={() => void decide(p, false, false)}>Refuser</Button>
            </div>
          </div>
        )
      })}
    </Card>
  )
}

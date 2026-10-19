import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { Button, Card, Notice, errMsg, fieldClass } from '../components/ui'

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
  const { data, error } = await supabase.rpc('companies_list')
  if (error) throw new Error(error.message)
  return (data ?? []) as CompanyRow[]
}

async function fetchOrderCounts(): Promise<Map<string, number>> {
  const page = 1000
  const out = new Map<string, number>()
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from('orders').select('order_number,isis_code').order('order_number').range(from, from + page - 1)
    if (error) throw new Error(error.message)
    for (const o of (data ?? []) as { isis_code: string | null }[]) if (o.isis_code) out.set(o.isis_code, (out.get(o.isis_code) ?? 0) + 1)
    if (!data || data.length < page) break
  }
  return out
}

/** Champs importants pour les envois mailto : nom de l'entreprise et email OS. */
export const isComplete = (c: CompanyRow | undefined) => Boolean(c?.name && c?.os_email)

// Champs non bloquants : leur absence affiche seulement une pastille jaune.
const INFO_FIELDS = ['company_phone', 'os_email', 'director_name', 'director_email', 'director_phone'] as const

type Tab = 'REMPLIES' | 'A_VERIFIER' | 'A_COMPLETER'
const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: 'REMPLIES', label: 'Remplies', hint: 'Nom et email OS validés' },
  { key: 'A_VERIFIER', label: 'En attente de vérification', hint: 'Informations proposées, pas encore validées' },
  { key: 'A_COMPLETER', label: 'À compléter', hint: 'Nom ou email OS manquant' },
]
const HEADERS = ['Entreprise (n°)', 'Nombre de commandes', 'Nom de l’entreprise', 'Email OS', 'Nom du dirigeant', 'Email du dirigeant', 'Tél. dirigeant', 'Tél. entreprise']

interface Entry { isis: string; count: number; company: CompanyRow | undefined; tab: Tab }
type FieldKey = keyof Omit<CompanyRow, 'isis_code'>

/** Une ligne par entreprise (numéro ENTN_NUM), triable par nombre de commandes, classée par onglet. */
export function CompaniesSection() {
  const [counts, setCounts] = useState<Map<string, number>>(new Map())
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<Tab>('A_COMPLETER')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'COMMANDES' | 'NUMERO'>('COMMANDES')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<string[]>([])
  const [editing, setEditing] = useState(false)
  const [edits, setEdits] = useState<Record<string, Partial<CompanyRow>>>({})
  const [saving, setSaving] = useState(false)

  const valueOf = (e: Entry, k: FieldKey) => (edits[e.isis]?.[k] ?? e.company?.[k] ?? '') as string
  const setField = (isis: string, k: FieldKey, v: string) => setEdits((d) => ({ ...d, [isis]: { ...d[isis], [k]: v } }))
  const dirtyCount = Object.keys(edits).length

  const saveEdits = async () => {
    setSaving(true); setErr(null); setMsg(null)
    let n = 0
    try {
      for (const [isis, changes] of Object.entries(edits)) {
        const base = companies.find((c) => c.isis_code === isis)
        const fields = Object.fromEntries(COMPANY_FIELDS.map((f) => [f.key, changes[f.key] ?? base?.[f.key] ?? null]))
        const { error } = await supabase.rpc('admin_save_company', { p_isis: isis, p_fields: fields })
        if (error) throw new Error(`Entreprise ${isis} : ${error.message}`)
        n++
        setEdits((d) => { const x = { ...d }; delete x[isis]; return x })
      }
      setEditing(false)
      setMsg(`${n} fiche(s) enregistrée(s).`)
      await load()
    } catch (e) {
      setErr(`${errMsg(e)} — ${n} fiche(s) enregistrée(s) avant l’erreur, les autres restent modifiables.`)
      await load()
    } finally { setSaving(false) }
  }

  const discardEdits = () => { setEdits({}); setEditing(false) }

  const load = async () => {
    setErr(null)
    try {
      const [c, comps, prop] = await Promise.all([
        fetchOrderCounts(), fetchCompanies(),
        supabase.rpc('company_proposals_list', { p_status: 'EN_ATTENTE' }),
      ])
      if (prop.error) throw new Error(prop.error.message)
      setCounts(c); setCompanies(comps)
      setPending(new Set(((prop.data ?? []) as { isis_code: string }[]).map((r) => r.isis_code)))
    } catch (e) { setErr(errMsg(e)) }
  }
  useEffect(() => { void load() }, [])

  const entries: Entry[] = useMemo(() => {
    const byIsis = new Map(companies.map((c) => [c.isis_code, c]))
    const all = new Set([...counts.keys(), ...byIsis.keys()])
    return [...all].map((isis) => {
      const company = byIsis.get(isis)
      const tabOf: Tab = pending.has(isis) ? 'A_VERIFIER' : isComplete(company) ? 'REMPLIES' : 'A_COMPLETER'
      return { isis, count: counts.get(isis) ?? 0, company, tab: tabOf }
    })
  }, [counts, companies, pending])

  const numberOf = (t: Tab) => entries.filter((e) => e.tab === t).length
  const shown = entries
    .filter((e) => e.tab === tab)
    .filter((e) => !q || `${e.isis} ${e.company?.name ?? ''} ${e.company?.os_email ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (sort === 'COMMANDES' ? b.count - a.count || a.isis.localeCompare(b.isis) : a.isis.localeCompare(b.isis)))

  const exportXlsx = () => {
    const rows = [...entries].sort((a, b) => b.count - a.count || a.isis.localeCompare(b.isis)).map((e) => [
      e.isis, e.count, e.company?.name ?? '', e.company?.os_email ?? '', e.company?.director_name ?? '',
      e.company?.director_email ?? '', e.company?.director_phone ?? '', e.company?.company_phone ?? '',
    ])
    const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Entreprises')
    XLSX.writeFile(wb, `entreprises_${new Date().toISOString().slice(0, 10)}.xlsx`)
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
      }
      const payload = [...seen.entries()].map(([isis_code, v]) => ({ isis_code, ...v }))
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
    const { error } = await supabase.rpc('archive_company', { p_isis: isis })
    if (error) { setErr(error.message); return }
    await load()
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-semibold">Entreprises ({entries.length})</h2>
        {!editing && <Button variant="ghost" onClick={() => setEditing(true)} disabled={!entries.length}>Modifier le tableau</Button>}
        {editing && (
          <>
            <Button variant="ghost" onClick={discardEdits} disabled={saving}>Annuler</Button>
            <Button onClick={() => void saveEdits()} disabled={saving || dirtyCount === 0}>
              {saving ? 'Enregistrement…' : `Enregistrer (${dirtyCount})`}
            </Button>
          </>
        )}
        <Button variant="ghost" onClick={exportXlsx} disabled={!entries.length || editing}>Exporter Excel</Button>
        <label className={`inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted ${editing ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
          Importer Excel
          <input type="file" accept=".xlsx,.xls" className="hidden" disabled={busy || editing}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void importXlsx(f); e.target.value = '' }} />
        </label>
      </div>
      {editing && (
        <Notice>
          Mode modification : saisissez directement dans les cellules. Les lignes modifiées sont surlignées et seront enregistrées avec le bouton « Enregistrer ».
          Les changements sont tracés dans le journal (COMPANY_SAVED).
        </Notice>
      )}
      <p className="text-xs text-muted-foreground">
        Une ligne par numéro d’entreprise. Exportez, complétez les colonnes d’informations dans Excel, puis réimportez sans changer les en-têtes.
        La colonne « Nombre de commandes » est indicative et n’est pas réimportée.
      </p>

      <div className="flex flex-wrap gap-2 border-b border-border">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} title={t.hint}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.key ? 'border-primary font-semibold' : 'border-transparent text-muted-foreground'}`}>
            {t.label} <span className="text-xs">({numberOf(t.key)})</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{TABS.find((t) => t.key === tab)?.hint}.</p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-xs text-muted-foreground">Recherche (n°, nom, email OS)</label>
          <input className={fieldClass} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Trier par</label>
          <select className={fieldClass} value={sort} onChange={(e) => setSort(e.target.value as 'COMMANDES' | 'NUMERO')}>
            <option value="COMMANDES">Nombre de commandes (décroissant)</option>
            <option value="NUMERO">Numéro d’entreprise</option>
          </select>
        </div>
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
              <th className="px-3 py-2 text-right">Commandes</th>
              {COMPANY_FIELDS.map((f) => <th key={f.key} className="px-3 py-2">{f.label}</th>)}
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, 300).map((e) => {
              const dirty = Boolean(edits[e.isis])
              return (
                <tr key={e.isis} className={`border-t border-border ${dirty ? 'bg-amber-50' : ''}`}>
                  <td className="px-3 py-2 font-mono text-xs">
                    <span className="inline-flex items-center gap-1.5">
                      {e.isis}
                      {INFO_FIELDS.some((k) => !valueOf(e, k)) && (
                        <span className="inline-block h-2 w-2 rounded-full bg-yellow-400" title="Informations complémentaires manquantes (non bloquant)" />
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">{e.count}</td>
                  {COMPANY_FIELDS.map((f) => (
                    <td key={f.key} className="px-2 py-1.5">
                      {editing ? (
                        <input className={`${fieldClass} py-1 text-xs`} value={valueOf(e, f.key)}
                          placeholder={f.key === 'name' || f.key === 'os_email' ? 'à compléter' : ''}
                          onChange={(ev) => setField(e.isis, f.key, ev.target.value)} />
                      ) : (
                        valueOf(e, f.key) || <span className="text-muted-foreground">{f.key === 'name' || f.key === 'os_email' ? 'manquant' : '—'}</span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    {!editing && e.company && <Button variant="ghost" onClick={() => void remove(e.isis)}>Supprimer</Button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {shown.length === 0 && <p className="p-3 text-sm text-muted-foreground">Aucune entreprise dans cet onglet.</p>}
      </div>
      {shown.length > 300 && <p className="text-xs text-muted-foreground">300 premières entreprises affichées sur {shown.length}.</p>}
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
    const { data, error } = await supabase.rpc('company_proposals_list', { p_status: 'EN_ATTENTE' })
    if (error) { setErr(error.message); return }
    setRows((data ?? []) as CompanyProposal[])
  }
  useEffect(() => { void load() }, [])

  const decide = async (p: CompanyProposal, approve: boolean, modified: boolean) => {
    const fields = modified && drafts[p.id] ? { ...p.payload, ...drafts[p.id] } : null
    const { error } = await supabase.rpc('decide_company_proposal', {
      p_id: p.id, p_approve: approve, p_comment: comments[p.id] || null, p_fields: fields,
    })
    if (error) { setErr(error.message); return }
    await load()
  }

  return (
    <Card className="space-y-3">
      <h3 className="text-sm font-semibold">Fiches entreprise proposées ({rows.length})</h3>
      <p className="text-xs text-muted-foreground">Les saisies des chargés sont en surbrillance : vérifiez, complétez ou modifiez avant de valider.</p>
      {err && <Notice tone="error">{err}</Notice>}
      {rows.length === 0 && <Notice>Aucune fiche en attente.</Notice>}
      {rows.map((p) => {
        const draft = { ...p.payload, ...drafts[p.id] }
        return (
          <div key={p.id} className="space-y-2 rounded-md border-2 border-amber-400 bg-amber-50 p-3 dark:bg-amber-950/30">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[11px] font-semibold text-amber-950">Saisie utilisateur à valider</span>
              <p className="text-sm">Entreprise <span className="font-mono">{p.isis_code}</span> · saisie le {new Date(p.created_at).toLocaleDateString('fr-FR')}</p>
            </div>
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
              <Button onClick={() => void decide(p, true, !!drafts[p.id])}>{drafts[p.id] ? 'Valider avec mes modifications' : 'Valider'}</Button>
              <Button variant="danger" onClick={() => void decide(p, false, false)}>Refuser</Button>
            </div>
          </div>
        )
      })}
    </Card>
  )
}

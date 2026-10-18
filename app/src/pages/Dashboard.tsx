import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fold, searchNatures, tokens } from '../lib/rules'
import { getReferentiel, type Referentiel } from '../lib/refdata'
import type { OrderRow } from '../lib/types'
import { Badge, Button, Card, Notice, fieldClass, errMsg } from '../components/ui'
import CompanyDialog from '../components/CompanyDialog'
import { fetchCompanies, type CompanyRow } from './AdminCompanies'
import BulkPlanWizard from '../components/BulkPlanWizard'

type Tab = 'NON_QUALIFIEE' | 'A_ENVOYER' | 'EN_ATTENTE_RETOUR' | 'ARCHIVEE' | 'ENVOYE_MANUELLEMENT' | 'DEMANDES' | 'CORBEILLE'
const TABS: { key: Tab; label: string; managerOnly?: boolean }[] = [
  { key: 'NON_QUALIFIEE', label: 'À qualifier' },
  { key: 'A_ENVOYER', label: 'À envoyer' },
  { key: 'EN_ATTENTE_RETOUR', label: 'En attente retour' },
  { key: 'ARCHIVEE', label: 'Archivées' },
  { key: 'ENVOYE_MANUELLEMENT', label: 'Envoyées manuellement' },
  { key: 'DEMANDES', label: 'Exclusions en attente' },
  { key: 'CORBEILLE', label: 'Corbeille', managerOnly: true },
]
const PAGE = 15
const PLAN_LABEL: Record<string, string> = {
  NON_QUALIFIEE: 'Non qualifiée', A_ENVOYER: 'À envoyer', EN_ATTENTE_RETOUR: 'En attente retour', ARCHIVEE: 'Archivée',
  ENVOYE_MANUELLEMENT: 'Envoyée manuellement',
}
const ACTIONABLE: Tab[] = ['NON_QUALIFIEE', 'A_ENVOYER']

const dayOf = (iso: string) => Math.floor(Date.parse(iso) / 86400000)
const fmtDay = (n: number) => new Date(n * 86400000).toLocaleDateString('fr-FR')

interface Suggestion { nature: string | null; natureId: number | null; group: string | null; lot: number | null; lotName: string | null }

/** Commandes actives (hors corbeille). */
async function fetchAllOrders(): Promise<OrderRow[]> {
  const page = 1000
  const out: OrderRow[] = []
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from('orders').select('*').is('trashed_at', null)
      .order('order_date', { ascending: false, nullsFirst: false }).order('order_number')
      .range(from, from + page - 1)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as OrderRow[]))
    if (!data || data.length < page) break
  }
  return out
}

async function fetchTrashedOrders(): Promise<OrderRow[]> {
  const { data, error } = await supabase.from('orders').select('*').not('trashed_at', 'is', null)
    .order('order_date', { ascending: false, nullsFirst: false }).order('order_number')
  if (error) throw new Error(error.message)
  return (data ?? []) as OrderRow[]
}

export default function Dashboard({ onOpen }: { onOpen: (o: OrderRow) => void }) {
  const { can, profile } = useAuth()
  const isManager = can('RESPONSABLE', 'SUPER_ADMIN')
  const [rows, setRows] = useState<OrderRow[]>([])
  const [ref, setRef] = useState<Referentiel | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('NON_QUALIFIEE')
  const [q, setQ] = useState('')
  const [sector, setSector] = useState('S11')
  const [operator, setOperator] = useState('')
  const [lotFilter, setLotFilter] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [fromDay, setFromDay] = useState<number | null>(null)
  const [toDay, setToDay] = useState<number | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [fileTemplate, setFileTemplate] = useState('{entreprise}_{commande}_{secteur}_Plan de prévention')
  useEffect(() => {
    void supabase.rpc('app_setting_get', { p_key: 'file_name_template' }).then(({ data }) => {
      if (typeof data === 'string' && data.trim()) setFileTemplate(data)
    })
  }, [])
  const [companies, setCompanies] = useState<Map<string, CompanyRow>>(new Map())
  const [companyFor, setCompanyFor] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE)
  const [trashedCount, setTrashedCount] = useState(0)
  const [trashed, setTrashed] = useState<OrderRow[]>([])
  const [version, setVersion] = useState(0)

  const load = async () => {
    setLoading(true); setErr(null)
    try {
      const [orders, referentiel, comps, trashedRes] = await Promise.all([
        fetchAllOrders(), getReferentiel(), fetchCompanies().catch(() => []),
        supabase.from('orders').select('order_number', { count: 'exact', head: true }).not('trashed_at', 'is', null),
      ])
      setRows(orders); setRef(referentiel)
      setCompanies(new Map(comps.map((c) => [c.isis_code, c])))
      setTrashedCount(trashedRes.count ?? 0)
      setVersion((v) => v + 1)
    } catch (e) { setErr(errMsg(e)) } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  // Le contenu de la corbeille n'est chargé que lorsqu'on l'ouvre.
  useEffect(() => {
    if (tab !== 'CORBEILLE' || !isManager) return
    fetchTrashedOrders().then(setTrashed).catch((e) => setErr(errMsg(e)))
  }, [tab, version, isManager])

  const sectors = useMemo(() => [...new Set(rows.map((r) => r.sector_code).filter(Boolean))] as string[], [rows])
  const operators = useMemo(() => [...new Set(rows.map((r) => r.operator_code).filter(Boolean))] as string[], [rows])

  // Nature approximative par commande : nature affectée, sinon meilleure suggestion du référentiel.
  const suggestions = useMemo(() => {
    const out = new Map<string, Suggestion>()
    if (!ref) return out
    const natureById = new Map(ref.natures.map((n) => [n.id, n]))
    for (const o of rows) {
      const assigned = o.nature_id != null ? natureById.get(o.nature_id) : undefined
      if (assigned) {
        const lot = assigned.lots[0] ?? null
        out.set(o.order_number, { nature: assigned.label, natureId: assigned.id, group: assigned.groupLabel, lot, lotName: lot != null ? ref.lotNameByCode.get(lot) ?? null : null })
        continue
      }
      const text = [o.nature_text, o.description].filter(Boolean).join(' ')
      const hit = text ? searchNatures(text, ref.natures, ref.vocab, ref.lotNameByCode, 1)[0] : undefined
      const lot = hit?.nature.lots[0] ?? null
      out.set(o.order_number, {
        nature: hit?.nature.label ?? null,
        natureId: hit?.nature.id ?? null,
        group: hit?.nature.groupLabel ?? null,
        lot,
        lotName: lot != null ? ref.lotNameByCode.get(lot) ?? null : null,
      })
    }
    return out
  }, [rows, ref])

  const lotOptions = useMemo(() => ref?.lots ?? [], [ref])
  const groupOptions = useMemo(
    () => [...new Set([...suggestions.values()].map((s) => s.group).filter(Boolean))] as string[],
    [suggestions])

  // Curseurs de date : bornes = dates présentes dans les commandes.
  const days = useMemo(() => rows.filter((o) => o.order_date).map((o) => dayOf(o.order_date as string)), [rows])
  const minDay = days.length ? Math.min(...days) : 0
  const maxDay = days.length ? Math.max(...days) : 0
  const lo = fromDay ?? minDay
  const hi = toDay ?? maxDay

  const inTab = (o: OrderRow, t: Tab) =>
    t === 'DEMANDES' ? o.scope_request_status === 'EN_ATTENTE'
      : o.scope_status === 'IN_SCOPE' && o.plan_status === t

  const terms = tokens(q)
  const matches = (o: OrderRow) => {
    if (!terms.length) return true
    const hay = fold([o.order_number, o.address, o.city, o.tranche_name, o.nature_text, o.description, o.isis_code].filter(Boolean).join(' '))
    return terms.every((t) => hay.includes(t))
  }
  const matchesFilters = (o: OrderRow) => {
    const sg = suggestions.get(o.order_number)
    if (lotFilter && String(sg?.lot ?? '') !== lotFilter && !(lotFilter === 'NONE' && sg?.lot == null)) return false
    if (groupFilter && sg?.group !== groupFilter) return false
    if (o.order_date) {
      const d = dayOf(o.order_date)
      if (d < lo || d > hi) return false
    }
    return true
  }

  const base = rows.filter((o) => (sector === 'TOUS' || o.sector_code === sector) && (!operator || o.operator_code === operator) && matches(o) && matchesFilters(o))
  const visible = base.filter((o) => inTab(o, tab))
  const count = (t: Tab) => (t === 'CORBEILLE' ? trashedCount : base.filter((o) => inTab(o, t)).length)
  const isTrashView = tab === 'CORBEILLE'
  const list = isTrashView ? trashed.filter(matches) : visible
  const shownRows = list.slice(0, limit)
  const actionableVisible = visible.filter((o) => ACTIONABLE.includes(tab) && o.scope_status === 'IN_SCOPE')

  // Retour à 15 lignes dès qu'on change d'onglet ou de filtre.
  useEffect(() => { setLimit(PAGE) }, [tab, q, sector, operator, lotFilter, groupFilter, fromDay, toDay])

  const changeTab = (t: Tab) => { setTab(t); setSelected(new Set()) }

  const setTrashedState = async (numbers: string[], toTrash: boolean) => {
    if (toTrash && !window.confirm(`Mettre ${numbers.length} commande(s) à la corbeille ? Elles sortent des listes ; elles peuvent être restaurées à tout moment.`)) return
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('set_orders_trashed', { p_orders: numbers, p_trashed: toTrash })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setSelected(new Set())
    setNotice(toTrash ? `${numbers.length} commande(s) mise(s) à la corbeille.` : `${numbers.length} commande(s) restaurée(s).`)
    await load()
  }
  const toggle = (n: string) => setSelected((s) => { const next = new Set(s); next.has(n) ? next.delete(n) : next.add(n); return next })
  const allChecked = actionableVisible.length > 0 && actionableVisible.every((o) => selected.has(o.order_number))
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(actionableVisible.map((o) => o.order_number)))

  const requestExclusion = async (o: OrderRow) => {
    const reason = window.prompt('Motif de l’exclusion du périmètre (obligatoire, 5 caractères minimum) :')
    if (reason === null) return
    const { error } = await supabase.rpc('request_scope_exclusion', { p_order: o.order_number, p_reason: reason })
    if (error) { setErr(error.message); return }
    setRows((rs) => rs.map((r) => (r.order_number === o.order_number ? { ...r, scope_request_status: 'EN_ATTENTE', scope_request_reason: reason.trim() } : r)))
  }

  const reintegrate = async (o: OrderRow) => {
    const { error } = await supabase.rpc('set_order_scope', { p_order: o.order_number, p_scope: 'IN_SCOPE', p_override: true, p_comment: null })
    if (error) { setErr(error.message); return }
    setRows((rs) => rs.map((r) => (r.order_number === o.order_number ? { ...r, scope_status: 'IN_SCOPE', scope_override: true } : r)))
  }

  // Envoi manuel (hors application) : sort la commande des listes à traiter.
  const sendManually = async () => {
    const ids = [...selected]
    if (!ids.length) return
    if (!window.confirm(`Marquer ${ids.length} commande(s) comme envoyée(s) manuellement ?\nElles ne figureront plus dans vos listes à traiter.`)) return
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('mark_sent_manually', { p_orders: ids })
    setBusy(false)
    if (error) { setErr(error.message); return }
    const set = new Set(ids)
    setRows((rs) => rs.map((r) => (set.has(r.order_number) ? { ...r, plan_status: 'ENVOYE_MANUELLEMENT' } : r)))
    setSelected(new Set())
  }

  const restoreManual = async () => {
    const ids = [...selected]
    if (!ids.length) return
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('unmark_sent_manually', { p_orders: ids })
    setBusy(false)
    if (error) { setErr(error.message); return }
    const set = new Set(ids)
    setRows((rs) => rs.map((r) => (set.has(r.order_number) ? { ...r, plan_status: 'NON_QUALIFIEE' } : r)))
    setSelected(new Set())
  }

  const manualTab = tab === 'ENVOYE_MANUELLEMENT'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-xs text-muted-foreground">Recherche (n° commande, adresse, nature…)</label>
          <input className={fieldClass} value={q} onChange={(e) => setQ(e.target.value)} placeholder="ex. robinet cuisine" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Secteur</label>
          <select className={fieldClass} value={sector} onChange={(e) => setSector(e.target.value)}>
            <option value="TOUS">Tous</option>
            {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Lot (suggéré)</label>
          <select className={fieldClass} value={lotFilter} onChange={(e) => setLotFilter(e.target.value)}>
            <option value="">Tous</option>
            <option value="NONE">Sans lot identifié</option>
            {lotOptions.map((l) => <option key={l.code} value={String(l.code)}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Nature (approx.)</label>
          <select className={fieldClass} value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
            <option value="">Toutes</option>
            {groupOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        {isManager && (
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Chargé</label>
            <select className={fieldClass} value={operator} onChange={(e) => setOperator(e.target.value)}>
              <option value="">Tous</option>
              {operators.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        )}
        <Button variant="ghost" onClick={() => void load()} disabled={loading}>Actualiser</Button>
      </div>

      {days.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>Date de commande : du <strong className="text-foreground">{fmtDay(lo)}</strong> au <strong className="text-foreground">{fmtDay(hi)}</strong></span>
            <Button variant="ghost" onClick={() => { setFromDay(null); setToDay(null) }}>Toutes les dates</Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input type="range" aria-label="Date de début" className="w-full accent-primary" min={minDay} max={maxDay} value={lo}
              onChange={(e) => setFromDay(Math.min(Number(e.target.value), hi))} />
            <input type="range" aria-label="Date de fin" className="w-full accent-primary" min={minDay} max={maxDay} value={hi}
              onChange={(e) => setToDay(Math.max(Number(e.target.value), lo))} />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-border">
        {TABS.filter((t) => !t.managerOnly || isManager).map((t) => (
          <button key={t.key} onClick={() => changeTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.key ? 'border-primary font-semibold' : 'border-transparent text-muted-foreground'}`}>
            {t.label} <span className="text-xs">({count(t.key)})</span>
          </button>
        ))}
      </div>

      {(ACTIONABLE.includes(tab) || manualTab) && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{selected.size} sélectionnée(s)</span>
          {ACTIONABLE.includes(tab) && (
            <Button onClick={() => setBulkOpen(true)} disabled={!selected.size || busy || !ref}>
              Créer les fiches
            </Button>
          )}
          {ACTIONABLE.includes(tab) && (
            <Button onClick={() => void sendManually()} disabled={!selected.size || busy}>
              Déjà envoyée manuellement
            </Button>
          )}
          {manualTab && (
            <Button variant="ghost" onClick={() => void restoreManual()} disabled={!selected.size || busy}>
              Remettre à traiter
            </Button>
          )}
          {selected.size > 0 && <Button variant="ghost" onClick={() => setSelected(new Set())}>Tout désélectionner</Button>}
          <span className="text-xs text-muted-foreground">Les commandes envoyées manuellement sortent de vos listes à traiter, sans plan généré par l’application.</span>
        </div>
      )}

      {err && <Notice tone="error">{err}</Notice>}
      {loading ? <p className="text-sm text-muted-foreground">Chargement des commandes…</p> : list.length === 0 ? (
        <Notice>{isTrashView ? 'La corbeille est vide.' : 'Aucune commande dans cette vue.'}</Notice>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                {ACTIONABLE.includes(tab) && (
                  <th className="px-3 py-2"><input type="checkbox" aria-label="Tout sélectionner" checked={allChecked} onChange={toggleAll} /></th>
                )}
                <th className="px-3 py-2">Commande</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Entreprise</th>
                <th className="px-3 py-2">Adresse</th>
                <th className="px-3 py-2">Nature / description</th>
                <th className="px-3 py-2">Lot suggéré</th>
                <th className="px-3 py-2">Chargé</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shownRows.map((o) => {
                const sg = suggestions.get(o.order_number)
                const canSelect = ACTIONABLE.includes(tab) && o.scope_status === 'IN_SCOPE'
                return (
                  <tr key={o.order_number} className="border-t border-border align-top">
                    {ACTIONABLE.includes(tab) && (
                      <td className="px-3 py-2">
                        {canSelect && <input type="checkbox" aria-label={`Sélectionner ${o.order_number}`}
                          checked={selected.has(o.order_number)} onChange={() => toggle(o.order_number)} />}
                      </td>
                    )}
                    <td className="px-3 py-2 font-mono text-xs">{o.order_number}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{o.order_date ?? '—'}</td>
                    <td className="px-3 py-2 text-xs" title={o.isis_code ? `N° ${o.isis_code}` : undefined}>
                      {o.isis_code ? (companies.get(o.isis_code)?.name ?? <span className="font-mono">{o.isis_code}</span>) : '—'}
                    </td>
                    <td className="px-3 py-2">{[o.address, o.city].filter(Boolean).join(', ') || '—'}</td>
                    <td className="px-3 py-2 max-w-md">
                      <div>{o.nature_text ?? '—'}</div>
                      {o.description && <div className="text-xs text-muted-foreground line-clamp-2">{o.description}</div>}
                      {sg?.nature && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {o.nature_id == null ? 'Suggestion : ' : 'Nature : '}{sg.nature}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">{sg?.lotName ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2">{o.operator_code ?? '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {isTrashView && <Badge tone="warn">Corbeille</Badge>}
                        {o.scope_override && <Badge tone="warn">Forcé</Badge>}
                        {o.scope_status === 'IN_SCOPE' && <Badge>{PLAN_LABEL[o.plan_status]}</Badge>}
                        {o.naac_code && <Badge>{o.naac_code}</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {isTrashView ? (
                        isManager && <Button variant="ghost" onClick={() => void setTrashedState([o.order_number], false)} disabled={busy}>Restaurer</Button>
                      ) : (
                        <>
                          {o.isis_code && <Button variant="ghost" onClick={() => setCompanyFor(o.isis_code)} className="mr-2">Infos entreprise</Button>}
                          {o.scope_status === 'IN_SCOPE' && (o.plan_status === 'NON_QUALIFIEE' || o.plan_status === 'A_ENVOYER') && (
                            <Button onClick={() => onOpen(o)} className="mr-2">
                              {o.plan_status === 'NON_QUALIFIEE' ? 'Qualifier' : 'Modifier le plan'}
                            </Button>
                          )}
                          {o.scope_status === 'IN_SCOPE' && o.scope_request_status !== 'EN_ATTENTE' && (
                            <Button variant="ghost" onClick={() => void requestExclusion(o)} className="mr-2">Demander l’exclusion</Button>
                          )}
                          {o.scope_request_status === 'EN_ATTENTE' && <Badge tone="warn">Exclusion en attente</Badge>}
                          {isManager && o.scope_status === 'OUT_OF_SCOPE' && (
                            <Button variant="ghost" onClick={() => void reintegrate(o)} className="mr-2">Réintégrer</Button>
                          )}
                          {isManager && (
                            <Button variant="ghost" onClick={() => void setTrashedState([o.order_number], true)} disabled={busy}>Mettre à la corbeille</Button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {!loading && list.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">Affichage de {shownRows.length} sur {list.length} commande(s)</span>
          {list.length > limit && (
            <Button variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>
              Afficher plus ({Math.min(PAGE, list.length - limit)} de plus)
            </Button>
          )}
        </div>
      )}
      {notice && <Notice tone="ok">{notice}</Notice>}
      {bulkOpen && ref && (
        <BulkPlanWizard
          orders={rows.filter((o) => selected.has(o.order_number))}
          suggestions={suggestions}
          ref={ref}
          companies={companies}
          template={fileTemplate}
          onClose={() => setBulkOpen(false)}
          onDone={(m) => { setBulkOpen(false); setSelected(new Set()); setNotice(m); void load() }}
        />
      )}
      {companyFor && (
        <CompanyDialog isis={companyFor} current={companies.get(companyFor)} onClose={() => setCompanyFor(null)}
          onSent={() => { setCompanyFor(null); setNotice('Informations proposées : elles seront validées par le Super Admin.') }} />
      )}
      <p className="text-xs text-muted-foreground">Connecté comme {profile?.email}.</p>
    </div>
  )
}

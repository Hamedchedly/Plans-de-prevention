import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fold, tokens } from '../lib/rules'
import { getReferentiel, type Referentiel } from '../lib/refdata'
import { buildSuggestion, type OrderSuggestion } from '../lib/natureSuggest'
import type { OrderRow } from '../lib/types'
import { Badge, Button, Card, Notice, fieldClass, errMsg } from '../components/ui'
import CompanyDialog from '../components/CompanyDialog'
import BulkPlanWizard from '../components/BulkPlanWizard'
import OrderActionDialog from '../components/OrderActionDialog'
import { fetchCompanies, type CompanyRow } from './AdminCompanies'

type Tab = 'NON_QUALIFIEE' | 'A_ENVOYER' | 'EN_ATTENTE_RETOUR' | 'ARCHIVEE' | 'ENVOYE_MANUELLEMENT' | 'DEMANDES' | 'CORBEILLE'

const MAIN_TABS: { key: Tab; label: string }[] = [
  { key: 'NON_QUALIFIEE', label: 'À qualifier' },
  { key: 'A_ENVOYER', label: 'À envoyer' },
  { key: 'EN_ATTENTE_RETOUR', label: 'En attente retour' },
]
const MORE_TABS: { key: Tab; label: string; managerOnly?: boolean }[] = [
  { key: 'ARCHIVEE', label: 'Archivées' },
  { key: 'ENVOYE_MANUELLEMENT', label: 'Envoyées manuellement' },
  { key: 'DEMANDES', label: 'Exclusions en attente' },
  { key: 'CORBEILLE', label: 'Corbeille', managerOnly: true },
]
const PLAN_LABEL: Record<string, string> = {
  NON_QUALIFIEE: 'Non qualifiée', A_ENVOYER: 'À envoyer', EN_ATTENTE_RETOUR: 'En attente retour', ARCHIVEE: 'Archivée',
  ENVOYE_MANUELLEMENT: 'Envoyée manuellement',
}
/** Onglets dont les commandes peuvent recevoir une fiche (sélection groupée). */
const ACTIONABLE: Tab[] = ['NON_QUALIFIEE', 'A_ENVOYER']
const PAGE = 15

/** Périodes par rapport à aujourd'hui : commandes passées depuis N jours. */
const PRESETS: { label: string; days: number | null }[] = [
  { label: '2 semaines', days: 14 },
  { label: '1 mois', days: 31 },
  { label: '3 mois', days: 92 },
  { label: '6 mois', days: 183 },
  { label: '1 an', days: 365 },
  { label: 'Tout', days: null },
]
const DEFAULT_PRESET = 0

const dayOf = (iso: string) => Math.floor(Date.parse(iso) / 86400000)
const todayDay = () => Math.floor(Date.now() / 86400000)
const fmtDay = (n: number) => new Date(n * 86400000).toLocaleDateString('fr-FR')

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
  const [trashed, setTrashed] = useState<OrderRow[]>([])
  const [trashedCount, setTrashedCount] = useState(0)
  const [ref, setRef] = useState<Referentiel | null>(null)
  const [companies, setCompanies] = useState<Map<string, CompanyRow>>(new Map())
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)

  const [tab, setTab] = useState<Tab>('NON_QUALIFIEE')
  const [moreOpen, setMoreOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sector, setSector] = useState('S11')
  const [operator, setOperator] = useState('')
  const [lotFilter, setLotFilter] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [preset, setPreset] = useState(DEFAULT_PRESET)
  const [limit, setLimit] = useState(PAGE)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [wizardOrders, setWizardOrders] = useState<OrderRow[] | null>(null)
  const [actionOrder, setActionOrder] = useState<OrderRow | null>(null)
  const [companyFor, setCompanyFor] = useState<string | null>(null)
  const [fileTemplate, setFileTemplate] = useState('{entreprise}_{commande}_{secteur}_Plan de prévention')

  useEffect(() => {
    void supabase.rpc('app_setting_get', { p_key: 'file_name_template' }).then(({ data }) => {
      if (typeof data === 'string' && data.trim()) setFileTemplate(data)
    })
  }, [])

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

  // La corbeille n'est chargée que lorsqu'on l'ouvre.
  useEffect(() => {
    if (tab !== 'CORBEILLE' || !isManager) return
    fetchTrashedOrders().then(setTrashed).catch((e) => setErr(errMsg(e)))
  }, [tab, version, isManager])

  // Une seule logique de proposition de nature, partagée avec la création de fiche et l'éditeur.
  const suggestions = useMemo(() => {
    const out = new Map<string, OrderSuggestion>()
    if (!ref) return out
    for (const o of rows) out.set(o.order_number, buildSuggestion(o, ref))
    return out
  }, [rows, ref])

  const sectors = useMemo(() => [...new Set(rows.map((r) => r.sector_code).filter(Boolean))] as string[], [rows])
  const operators = useMemo(() => [...new Set(rows.map((r) => r.operator_code).filter(Boolean))] as string[], [rows])
  const lotOptions = useMemo(() => ref?.lots ?? [], [ref])
  const groupOptions = useMemo(
    () => [...new Set([...suggestions.values()].filter((s) => s.confident).map((s) => s.group).filter(Boolean))] as string[],
    [suggestions])

  const cutoff = PRESETS[preset].days == null ? null : todayDay() - (PRESETS[preset].days as number)

  const inTab = (o: OrderRow, t: Tab) =>
    o.scope_status === 'IN_SCOPE' && o.plan_status === t

  const terms = tokens(q)
  const matches = (o: OrderRow) => {
    if (!terms.length) return true
    const hay = fold([o.order_number, o.address, o.city, o.tranche_name, o.nature_text, o.description, o.isis_code].filter(Boolean).join(' '))
    return terms.every((t) => hay.includes(t))
  }
  const matchesFilters = (o: OrderRow) => {
    const sg = suggestions.get(o.order_number)
    const lot = sg?.confident ? sg.lot : null
    if (lotFilter && String(lot ?? '') !== lotFilter && !(lotFilter === 'NONE' && lot == null)) return false
    if (groupFilter && (!sg?.confident || sg.group !== groupFilter)) return false
    if (cutoff != null && (!o.order_date || dayOf(o.order_date) < cutoff)) return false
    return true
  }

  const base = rows.filter((o) =>
    (sector === 'TOUS' || o.sector_code === sector) && (!operator || o.operator_code === operator) && matches(o) && matchesFilters(o))
  const visible = base.filter((o) => inTab(o, tab))
  const isTrashView = tab === 'CORBEILLE'
  const list = isTrashView ? trashed.filter(matches) : visible
  const shownRows = list.slice(0, limit)
  const count = (t: Tab) => (t === 'CORBEILLE' ? trashedCount : base.filter((o) => inTab(o, t)).length)
  const actionableVisible = visible.filter((o) => ACTIONABLE.includes(tab) && o.scope_status === 'IN_SCOPE')
  const activeMore = MORE_TABS.find((t) => t.key === tab)

  // Retour à 15 lignes dès qu'on change d'onglet ou de filtre.
  useEffect(() => { setLimit(PAGE) }, [tab, q, sector, operator, lotFilter, groupFilter, preset])

  const changeTab = (t: Tab) => { setTab(t); setSelected(new Set()); setMoreOpen(false) }
  const toggle = (n: string) => setSelected((s) => { const next = new Set(s); next.has(n) ? next.delete(n) : next.add(n); return next })
  const allChecked = actionableVisible.length > 0 && actionableVisible.every((o) => selected.has(o.order_number))
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(actionableVisible.map((o) => o.order_number)))

  const runAction = async (rpc: string, params: Record<string, unknown>, done: string) => {
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc(rpc, params)
    setBusy(false)
    if (error) { setErr(error.message); return }
    setSelected(new Set())
    setNotice(done)
    await load()
  }

  const sendManually = (ids: string[]) => {
    if (!ids.length) return
    if (!window.confirm(`Marquer ${ids.length} commande(s) comme envoyée(s) manuellement ?\nElles ne figureront plus dans vos listes à traiter.`)) return
    void runAction('mark_sent_manually', { p_orders: ids }, `${ids.length} commande(s) marquée(s) comme envoyée(s) manuellement.`)
  }
  const restoreManual = (ids: string[]) => {
    if (!ids.length) return
    void runAction('unmark_sent_manually', { p_orders: ids }, `${ids.length} commande(s) remise(s) à traiter.`)
  }
  const reintegrate = (o: OrderRow) =>
    void runAction('set_order_scope', { p_order: o.order_number, p_scope: 'IN_SCOPE', p_override: true, p_comment: null }, `Commande ${o.order_number} réintégrée au périmètre.`)
  const setTrashedState = (numbers: string[], toTrash: boolean) => {
    if (toTrash && !window.confirm(`Mettre ${numbers.length} commande(s) à la corbeille ? Elles sortent des listes ; elles peuvent être restaurées à tout moment.`)) return
    void runAction('set_orders_trashed', { p_orders: numbers, p_trashed: toTrash },
      toTrash ? `${numbers.length} commande(s) mise(s) à la corbeille.` : `${numbers.length} commande(s) restaurée(s).`)
  }

  const manualTab = tab === 'ENVOYE_MANUELLEMENT'
  const selectedOrders = rows.filter((o) => selected.has(o.order_number))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Commandes</h1>
          <p className="text-xs text-muted-foreground">Connecté comme {profile?.email}</p>
        </div>
        <Button variant="ghost" onClick={() => void load()} disabled={loading}>Actualiser</Button>
      </div>

      <Card className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs text-muted-foreground">Recherche</label>
          <input className={fieldClass} value={q} onChange={(e) => setQ(e.target.value)} placeholder="N° commande, adresse, nature…" />
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
      </Card>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm">
            Commandes passées depuis <span className="font-semibold">{PRESETS[preset].label}</span>
            {cutoff != null && <span className="text-muted-foreground"> · depuis le {fmtDay(cutoff)}</span>}
          </p>
        </div>
        <input type="range" aria-label="Période des commandes" className="w-full accent-primary" min={0} max={PRESETS.length - 1} step={1}
          value={preset} onChange={(e) => setPreset(Number(e.target.value))} />
        <div className="flex justify-between text-xs text-muted-foreground">
          {PRESETS.map((p, i) => (
            <button key={p.label} type="button" onClick={() => setPreset(i)}
              className={i === preset ? 'font-semibold text-foreground' : 'hover:text-foreground'}>{p.label}</button>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        {MAIN_TABS.map((t) => (
          <button key={t.key} onClick={() => changeTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.key ? 'border-primary font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t.label} <span className="text-xs">({count(t.key)})</span>
          </button>
        ))}
        <div className="relative">
          <button onClick={() => setMoreOpen((v) => !v)} aria-haspopup="menu" aria-expanded={moreOpen} aria-label="Autres vues"
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${activeMore ? 'border-primary font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {activeMore ? <>{activeMore.label} <span className="text-xs">({count(activeMore.key)})</span></> : '⋯'}
          </button>
          {moreOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)} />
              <div role="menu" className="absolute left-0 z-20 mt-1 w-64 overflow-hidden rounded-md border border-border bg-card shadow-lg">
                {MORE_TABS.filter((t) => !t.managerOnly || isManager).map((t) => (
                  <button key={t.key} role="menuitem" onClick={() => changeTab(t.key)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted ${tab === t.key ? 'font-semibold' : ''}`}>
                    <span>{t.label}</span><span className="text-xs text-muted-foreground">{count(t.key)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {ACTIONABLE.includes(tab) && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} sélectionnée(s)</span>
          <Button onClick={() => setWizardOrders(selectedOrders)} disabled={busy || !ref}>Créer les fiches</Button>
          <Button variant="ghost" onClick={() => sendManually([...selected])} disabled={busy}>Déjà envoyée manuellement</Button>
          <Button variant="ghost" onClick={() => setSelected(new Set())}>Tout désélectionner</Button>
        </div>
      )}
      {manualTab && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} sélectionnée(s)</span>
          <Button variant="ghost" onClick={() => restoreManual([...selected])} disabled={busy}>Remettre à traiter</Button>
          <Button variant="ghost" onClick={() => setSelected(new Set())}>Tout désélectionner</Button>
        </div>
      )}

      {err && <Notice tone="error">{err}</Notice>}
      {notice && <Notice tone="ok">{notice}</Notice>}

      {loading ? <p className="text-sm text-muted-foreground">Chargement des commandes…</p> : list.length === 0 ? (
        <Notice>{isTrashView ? 'La corbeille est vide.' : 'Aucune commande dans cette vue pour cette période.'}</Notice>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {ACTIONABLE.includes(tab) && (
                    <th className="px-3 py-2"><input type="checkbox" aria-label="Tout sélectionner" checked={allChecked} onChange={toggleAll} /></th>
                  )}
                  <th className="px-3 py-2 font-medium">Commande</th>
                  <th className="px-3 py-2 font-medium">Entreprise</th>
                  <th className="px-3 py-2 font-medium">Adresse</th>
                  <th className="px-3 py-2 font-medium">Nature / description</th>
                  <th className="px-3 py-2 font-medium">Lot</th>
                  <th className="px-3 py-2 font-medium">Chargé</th>
                  <th className="px-3 py-2 font-medium">Statut</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shownRows.map((o) => {
                  const sg = suggestions.get(o.order_number)
                  const assigned = o.nature_id != null
                  const canSelect = ACTIONABLE.includes(tab) && o.scope_status === 'IN_SCOPE'
                  const companyName = o.isis_code ? companies.get(o.isis_code)?.name : null
                  return (
                    <tr key={o.order_number} className="align-top hover:bg-muted/30">
                      {ACTIONABLE.includes(tab) && (
                        <td className="px-3 py-2.5">
                          {canSelect && <input type="checkbox" aria-label={`Sélectionner ${o.order_number}`}
                            checked={selected.has(o.order_number)} onChange={() => toggle(o.order_number)} />}
                        </td>
                      )}
                      <td className="px-3 py-2.5">
                        <div className="font-mono text-xs font-medium">{o.order_number}</div>
                        <div className="whitespace-nowrap text-xs text-muted-foreground">{o.order_date ?? '—'}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm">{companyName ?? o.isis_code ?? '—'}</span>
                          {o.isis_code && (
                            <Button variant="ghost" onClick={() => setCompanyFor(o.isis_code)} className="h-6 px-2 text-xs">Infos</Button>
                          )}
                        </div>
                        {o.isis_code && companyName && <div className="font-mono text-[11px] text-muted-foreground">{o.isis_code}</div>}
                      </td>
                      <td className="px-3 py-2.5">{[o.address, o.city].filter(Boolean).join(', ') || '—'}</td>
                      <td className="max-w-md px-3 py-2.5">
                        <div>{o.nature_text ?? '—'}</div>
                        {o.description && <div className="line-clamp-2 text-xs text-muted-foreground">{o.description}</div>}
                        {sg?.nature && (
                          <div className={`mt-1 text-xs ${assigned ? 'text-foreground' : sg.confident ? 'text-muted-foreground' : 'text-amber-700'}`}>
                            {assigned ? 'Nature : ' : sg.confident ? 'Suggestion : ' : 'À confirmer : '}{sg.nature}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {(assigned || sg?.confident) && sg?.lotName ? sg.lotName : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2.5">{o.operator_code ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {isTrashView && <Badge tone="warn">Corbeille</Badge>}
                          {o.scope_status === 'IN_SCOPE' && <Badge>{PLAN_LABEL[o.plan_status]}</Badge>}
                          {o.scope_status === 'OUT_OF_SCOPE' && <Badge tone="warn">Hors périmètre</Badge>}
                          {o.scope_override && <Badge tone="warn">Forcé</Badge>}
                          {o.scope_request_status === 'EN_ATTENTE' && <Badge tone="warn">Exclusion en attente</Badge>}
                          {o.naac_code && <Badge>{o.naac_code}</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex flex-wrap justify-end gap-1.5 whitespace-nowrap">
                          {isTrashView ? (
                            isManager && <Button variant="ghost" onClick={() => setTrashedState([o.order_number], false)} disabled={busy}>Restaurer</Button>
                          ) : (
                            <>
                              {o.scope_status === 'IN_SCOPE' && o.plan_status === 'NON_QUALIFIEE' && (
                                <Button onClick={() => setWizardOrders([o])} disabled={!ref}>Créer la fiche</Button>
                              )}
                              {o.scope_status === 'IN_SCOPE' && o.plan_status === 'A_ENVOYER' && (
                                <Button onClick={() => onOpen(o)}>Modifier le plan</Button>
                              )}
                              {o.scope_status === 'IN_SCOPE' && (
                                <Button variant="ghost" onClick={() => setActionOrder(o)}>Demander l’exclusion</Button>
                              )}
                              {isManager && o.scope_status === 'OUT_OF_SCOPE' && (
                                <Button variant="ghost" onClick={() => setActionOrder(o)}>Réaffecter</Button>
                              )}
                              {isManager && o.scope_status === 'OUT_OF_SCOPE' && (
                                <Button variant="ghost" onClick={() => reintegrate(o)} disabled={busy}>Réintégrer</Button>
                              )}
                              {isManager && (
                                <Button variant="ghost" onClick={() => setTrashedState([o.order_number], true)} disabled={busy}>Corbeille</Button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm">
            <span className="text-muted-foreground">Affichage de {shownRows.length} sur {list.length} commande(s)</span>
            {list.length > limit && (
              <Button variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>
                Afficher plus ({Math.min(PAGE, list.length - limit)} de plus)
              </Button>
            )}
          </div>
        </div>
      )}

      {wizardOrders && ref && (
        <BulkPlanWizard
          orders={wizardOrders}
          suggestions={suggestions}
          ref={ref}
          companies={companies}
          template={fileTemplate}
          onClose={() => setWizardOrders(null)}
          onDone={(m) => { setWizardOrders(null); setSelected(new Set()); setNotice(m); void load() }}
        />
      )}
      {actionOrder && (
        <OrderActionDialog
          order={actionOrder}
          isManager={isManager}
          operators={operators}
          onClose={() => setActionOrder(null)}
          onDone={(m) => { setActionOrder(null); setNotice(m); void load() }}
        />
      )}
      {companyFor && (
        <CompanyDialog isis={companyFor} current={companies.get(companyFor)} onClose={() => setCompanyFor(null)}
          onSent={() => { setCompanyFor(null); setNotice('Informations proposées : elles seront validées par le Super Admin.') }} />
      )}
    </div>
  )
}

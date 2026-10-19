import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fold, tokens } from '../lib/rules'
import { getReferentiel, type Referentiel } from '../lib/refdata'
import { buildSuggestion, type OrderSuggestion } from '../lib/natureSuggest'
import type { OrderRow } from '../lib/types'
import { Badge, Button, Card, EmptyState, IconButton, Notice, PageHeader, fieldClass, errMsg } from '../components/ui'
import { Bubble } from '../components/Bubble'
import CompanyDialog from '../components/CompanyDialog'
import BulkPlanWizard from '../components/BulkPlanWizard'
import OrderActionDialog from '../components/OrderActionDialog'
import { fetchCompanies, type CompanyRow } from './AdminCompanies'
import { Archive, Ban, ArrowRightLeft, CheckCheck, Download, Eye, Inbox, Info, Mail, Pencil, RotateCcw, SlidersHorizontal, Trash2 } from 'lucide-react'
import { buildSheetPdf, buildSheetsZip, contactFor, downloadBlob, fetchContacts, fetchSavedLines, openPdf, planFileName, readSettings, DEFAULT_MAIL_CORPS, DEFAULT_MAIL_OBJET, type Contact, type Line } from '../lib/sheet'
import MailDialog from '../components/MailDialog'
import { PipelineBar, type PipelineCounts } from '../components/PipelineBar'

type Tab = 'NON_QUALIFIEE' | 'A_ENVOYER' | 'EN_ATTENTE_RETOUR' | 'SIGNEE' | 'ARCHIVEE' | 'ENVOYE_MANUELLEMENT' | 'DEMANDES' | 'EXCLUES' | 'HORS_REGLE' | 'CORBEILLE'
/** Vues hors périmètre : réintégration possible par le responsable. */
const SCOPE_TABS: Tab[] = ['EXCLUES', 'HORS_REGLE']

const MAIN_TABS: { key: Tab; label: string }[] = [
  { key: 'NON_QUALIFIEE', label: 'À qualifier' },
  { key: 'A_ENVOYER', label: 'À envoyer' },
  { key: 'EN_ATTENTE_RETOUR', label: 'En attente retour' },
  { key: 'SIGNEE', label: 'Signées' },
]
const MORE_TABS: { key: Tab; label: string; managerOnly?: boolean }[] = [
  { key: 'ARCHIVEE', label: 'Archivées' },
  { key: 'ENVOYE_MANUELLEMENT', label: 'Envoyées manuellement' },
  { key: 'DEMANDES', label: 'Exclusions en attente' },
  { key: 'EXCLUES', label: 'Exclues manuellement', managerOnly: true },
  { key: 'HORS_REGLE', label: 'Hors périmètre (règle)', managerOnly: true },
  { key: 'CORBEILLE', label: 'Corbeille', managerOnly: true },
]
const PLAN_LABEL: Record<string, string> = {
  NON_QUALIFIEE: 'Non qualifiée', A_ENVOYER: 'À envoyer', EN_ATTENTE_RETOUR: 'En attente retour', SIGNEE: 'Signée', ARCHIVEE: 'Archivée',
  ENVOYE_MANUELLEMENT: 'Envoyée manuellement',
}
// Statut affiché : une fiche enregistrée (A_ENVOYER) est une « Fiche créée », en attente d'envoi.
const STATUS_LABEL: Record<string, string> = { ...PLAN_LABEL, A_ENVOYER: 'Fiche créée' }
/** Onglets dont les commandes peuvent recevoir une fiche (sélection groupée). */
const ACTIONABLE: Tab[] = ['NON_QUALIFIEE', 'A_ENVOYER']
const PAGE = 15

/** Regroupement des commandes dans la liste (pour sélectionner en lot des cas similaires). */
type Grouping = 'NONE' | 'LOT' | 'KEYWORD'
const GROUPINGS: { key: Grouping; label: string }[] = [
  { key: 'NONE', label: 'Sans regroupement' },
  { key: 'LOT', label: 'Par lot' },
  { key: 'KEYWORD', label: 'Par mots-clés (nature)' },
]
type SortKey = 'order_number' | 'order_date' | 'company' | 'address' | 'nature' | 'lot' | 'operator' | 'status'
type Sort = { key: SortKey; dir: 1 | -1 }
type Section = { group: string | null; rows: OrderRow[] }
const SORT_KEYS: SortKey[] = ['order_number', 'order_date', 'company', 'address', 'nature', 'lot', 'operator', 'status']
const TAB_KEYS = [...MAIN_TABS, ...MORE_TABS].map((t) => t.key)

/** Vue de la liste, conservée dans l'adresse : /commandes?onglet=SIGNEE&regroupement=LOT&tri=order_date&sens=desc */
export type DashboardView = { onglet?: string; regroupement?: string; tri?: string; sens?: string }

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
/** En dessous de ce nombre dans l'onglet, la période est élargie automatiquement. */
const MIN_VISIBLE = 3

const dayOf = (iso: string) => Math.floor(Date.parse(iso) / 86400000)
const todayDay = () => Math.floor(Date.now() / 86400000)
const fmtDay = (n: number) => new Date(n * 86400000).toLocaleDateString('fr-FR')
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR')

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

export default function Dashboard({ onOpen, view, setView }: {
  onOpen: (o: OrderRow) => void
  view: DashboardView
  setView: (patch: DashboardView) => void
}) {
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
  const [contacts, setContacts] = useState<Map<string, Contact>>(new Map())
  const [dates, setDates] = useState<Map<string, { drafted: string | null; sent: string | null }>>(new Map())
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [mailOrder, setMailOrder] = useState<OrderRow | null>(null)

  const tab: Tab = TAB_KEYS.includes(view.onglet as Tab) ? (view.onglet as Tab) : 'NON_QUALIFIEE'
  const [moreOpen, setMoreOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sector, setSector] = useState('S11')
  const [operator, setOperator] = useState('')
  const [lotFilter, setLotFilter] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [preset, setPreset] = useState(DEFAULT_PRESET)
  const [limit, setLimit] = useState(PAGE)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const grouping: Grouping = view.regroupement === 'LOT' ? 'LOT' : view.regroupement === 'KEYWORD' ? 'KEYWORD' : 'NONE'
  const sortKey: SortKey = SORT_KEYS.includes(view.tri as SortKey) ? (view.tri as SortKey) : 'order_date'
  const sort: Sort = {
    key: sortKey,
    dir: view.sens === 'asc' ? 1 : view.sens === 'desc' ? -1 : sortKey === 'order_date' ? -1 : 1,
  }

  const [wizard, setWizard] = useState<{ orders: OrderRow[]; initial?: Map<string, Line>; mode: 'create' | 'edit' } | null>(null)
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
      // Archivage automatique à 6 mois (non bloquant si la fonction est indisponible)
      await supabase.rpc('auto_archive_plans')
      const [orders, referentiel, comps, trashedRes] = await Promise.all([
        fetchAllOrders(), getReferentiel(), fetchCompanies().catch(() => []),
        supabase.from('orders').select('order_number', { count: 'exact', head: true }).not('trashed_at', 'is', null),
      ])
      setRows(orders); setRef(referentiel)
      setCompanies(new Map(comps.map((c) => [c.isis_code, c])))
      setTrashedCount(trashedRes.count ?? 0)
      setVersion((v) => v + 1)
      // Personne à alerter (chargé créateur), dates de fiche et modèles
      setContacts(await fetchContacts(orders.map((o) => o.operator_code ?? '')).catch(() => new Map<string, Contact>()))
      const planned = orders.filter((o) => o.plan_status !== 'NON_QUALIFIEE').map((o) => o.order_number)
      const dts = new Map<string, { drafted: string | null; sent: string | null }>()
      if (planned.length) {
        const { data } = await supabase.rpc('plan_dates', { p_orders: planned })
        for (const r of (data ?? []) as { order_number: string; drafted_at: string | null; sent_at: string | null }[]) {
          dts.set(r.order_number, { drafted: r.drafted_at, sent: r.sent_at })
        }
      }
      setDates(dts)
      setSettings(await readSettings())
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

  // Groupes repliés par défaut ; « Tout déplier » / « Tout plier » dans la barre de regroupement
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  useEffect(() => { setOpenGroups(new Set()) }, [grouping])

  // Barre d'avancement : le chargé voit ses propres commandes ; le responsable voit la vue choisie (chargé + secteur)
  const pipelineScope = profile?.role === 'CHARGE_OPERATIONS' ? (profile.operator_code ?? null) : (operator || null)
  const pipeline: PipelineCounts = { attente: 0, fait: 0, envoye: 0, retour: 0 }
  for (const o of rows) {
    if (o.scope_status !== 'IN_SCOPE') continue
    if (sector !== 'TOUS' && o.sector_code !== sector) continue
    if (pipelineScope && o.operator_code !== pipelineScope) continue
    if (o.plan_status === 'NON_QUALIFIEE') pipeline.attente++
    else if (o.plan_status === 'A_ENVOYER') pipeline.fait++
    else if (o.plan_status === 'EN_ATTENTE_RETOUR') pipeline.envoye++
    else if (o.plan_status === 'SIGNEE') pipeline.retour++
  }

  const cutoffOf = (p: number) => PRESETS[p].days == null ? null : todayDay() - (PRESETS[p].days as number)

  const inTab = (o: OrderRow, t: Tab) => {
    if (t === 'EXCLUES') return o.scope_status === 'OUT_OF_SCOPE' && o.scope_override
    if (t === 'HORS_REGLE') return o.scope_status === 'OUT_OF_SCOPE' && !o.scope_override
    return o.scope_status === 'IN_SCOPE' && o.plan_status === t
  }
  const isScopeTab = SCOPE_TABS.includes(tab)
  // Fiches créées ou envoyées dont la personne à alerter n'est pas complète
  const sansContact = rows.filter((o) => o.scope_status === 'IN_SCOPE'
    && (o.plan_status === 'A_ENVOYER' || o.plan_status === 'EN_ATTENTE_RETOUR')
    && !contacts.get(o.operator_code ?? '')?.complete)
  const sansContactCodes = [...new Set(sansContact.map((o) => o.operator_code ?? '—'))]

  const terms = tokens(q)
  const matches = (o: OrderRow) => {
    if (!terms.length) return true
    const hay = fold([o.order_number, o.address, o.city, o.tranche_name, o.nature_text, o.description, o.isis_code].filter(Boolean).join(' '))
    return terms.every((t) => hay.includes(t))
  }
  const matchesFilters = (o: OrderRow, cut: number | null) => {
    const sg = suggestions.get(o.order_number)
    const lot = sg?.confident ? sg.lot : null
    if (lotFilter && String(lot ?? '') !== lotFilter && !(lotFilter === 'NONE' && lot == null)) return false
    if (groupFilter && (!sg?.confident || sg.group !== groupFilter)) return false
    if (cut != null && (!o.order_date || dayOf(o.order_date) < cut)) return false
    return true
  }

  const passesFilters = (o: OrderRow, cut: number | null) =>
    (sector === 'TOUS' || o.sector_code === sector) && (!operator || o.operator_code === operator) && matches(o) && matchesFilters(o, cut)

  // Période : on élargit automatiquement jusqu'à MIN_VISIBLE commandes dans l'onglet courant (filtres inclus).
  const pool = rows.filter((o) => passesFilters(o, null) && inTab(o, tab))
  const countSince = (p: number) => {
    const c = cutoffOf(p)
    return c == null ? pool.length : pool.filter((o) => o.order_date && dayOf(o.order_date) >= c).length
  }
  let activePreset = preset
  while (activePreset < PRESETS.length - 1 && countSince(activePreset) < MIN_VISIBLE) activePreset++
  const cutoff = cutoffOf(activePreset)
  const hiddenOld = pool.length - countSince(activePreset)

  const base = rows.filter((o) => passesFilters(o, cutoff))
  const visible = base.filter((o) => inTab(o, tab))
  const isTrashView = tab === 'CORBEILLE'
  const list = isTrashView ? trashed.filter(matches) : visible
  const canSelectOrder = (o: OrderRow) => (ACTIONABLE.includes(tab) && o.scope_status === 'IN_SCOPE') || (isScopeTab && isManager)
  const colCount = (ACTIONABLE.includes(tab) || isScopeTab ? 1 : 0) + 9
  // Lot affiché (même règle que la colonne « Lot »)
  const lotLabelOf = (o: OrderRow): string | null => {
    const sg = suggestions.get(o.order_number)
    return (o.nature_id != null || sg?.confident) && sg?.lotName ? sg.lotName : null
  }
  const groupOf = (o: OrderRow): string => {
    if (grouping === 'LOT') return lotLabelOf(o) ?? 'Sans lot identifié'
    const sg = suggestions.get(o.order_number)
    return sg?.confident && sg.group ? sg.group : 'Sans mot-clé identifié'
  }
  const sortText = (o: OrderRow, k: SortKey): string => {
    switch (k) {
      case 'order_number': return o.order_number
      case 'order_date': return o.order_date ?? ''
      case 'company': return o.isis_code ? companies.get(o.isis_code)?.name || o.isis_code : ''
      case 'address': return [o.address, o.city].filter(Boolean).join(', ')
      case 'nature': return o.nature_text ?? ''
      case 'lot': return lotLabelOf(o) ?? ''
      case 'operator': return o.operator_code ?? ''
      case 'status': return o.plan_status
    }
  }
  const compareOrders = (a: OrderRow, b: OrderRow) => {
    const va = sortText(a, sort.key), vb = sortText(b, sort.key)
    if ((!va || !vb) && va !== vb) return va ? -1 : 1 // valeurs vides toujours en fin de liste
    return va.localeCompare(vb, 'fr', { numeric: true, sensitivity: 'base' }) * sort.dir
      || a.order_number.localeCompare(b.order_number, 'fr', { numeric: true })
  }
  const ordered = [...list].sort((a, b) => {
    if (grouping !== 'NONE') {
      const ga = groupOf(a), gb = groupOf(b)
      if (ga !== gb) return Number(ga.startsWith('Sans')) - Number(gb.startsWith('Sans')) || ga.localeCompare(gb, 'fr')
    }
    return compareOrders(a, b)
  })
  // Pagination appliquée après tri et regroupement
  const shownRows = ordered.slice(0, limit)
  const sections: Section[] = []
  for (const o of shownRows) {
    const g = grouping === 'NONE' ? null : groupOf(o)
    const last = sections[sections.length - 1]
    if (last && last.group === g) last.rows.push(o)
    else sections.push({ group: g, rows: [o] })
  }
  const groupKeys = grouping === 'NONE' ? [] : [...new Set(list.map(groupOf))]
  const allGroupsOpen = groupKeys.length > 0 && groupKeys.every((g) => openGroups.has(g))
  const toggleAllGroups = () => setOpenGroups(allGroupsOpen ? new Set() : new Set(groupKeys))
  const toggleGroupOpen = (g: string) => setOpenGroups((s) => {
    const next = new Set(s)
    if (next.has(g)) next.delete(g); else next.add(g)
    return next
  })

  // Ligne d'en-tête de groupe : sélection de tous les cas du groupe
  const groupRow = (g: string) => {
    const members = list.filter((o) => canSelectOrder(o) && groupOf(o) === g).map((o) => o.order_number)
    const total = list.filter((o) => groupOf(o) === g).length
    const all = members.length > 0 && members.every((n) => selected.has(n))
    const nSel = members.filter((n) => selected.has(n)).length
    return (
      <tr key={`g-${g}`} className="bg-muted/40">
        <td colSpan={colCount} className="px-3 py-2">
          <div className="flex flex-wrap items-center gap-3 text-sm font-medium">
            {members.length > 0 && (
              <input type="checkbox" aria-label={`Sélectionner le groupe ${g}`} checked={all}
                onChange={() => setSelected((s) => {
                  const next = new Set(s)
                  members.forEach((n) => (all ? next.delete(n) : next.add(n)))
                  return next
                })} />
            )}
            <button type="button" onClick={() => toggleGroupOpen(g)} aria-expanded={openGroups.has(g)}
              className="flex items-center gap-2 text-left hover:text-foreground">
              <span className={`inline-block transition-transform ${openGroups.has(g) ? 'rotate-90' : ''}`} aria-hidden="true">▸</span>
              <span>{g}</span>
            </button>
            <span className="text-xs font-normal text-muted-foreground">
              {total} commande(s){members.length > 0 && ` · ${nSel} sélectionnée(s) sur ${members.length}`}
            </span>
          </div>
        </td>
      </tr>
    )
  }
  const toggleSort = (k: SortKey) => {
    const dir = sort.key === k ? -sort.dir : k === 'order_date' ? -1 : 1
    setView({ tri: k, sens: dir === 1 ? 'asc' : 'desc' })
  }
  const sortTh = (k: SortKey, label: string) => (
    <th className="px-3 py-2 font-medium" aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 uppercase hover:text-foreground ${sort.key === k ? 'text-foreground' : ''}`}>
        {label}<span aria-hidden="true">{sort.key === k ? (sort.dir === 1 ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  )
  const count = (t: Tab) => (t === 'CORBEILLE' ? trashedCount : base.filter((o) => inTab(o, t)).length)
  const actionableVisible = visible.filter((o) => (ACTIONABLE.includes(tab) && o.scope_status === 'IN_SCOPE') || (isScopeTab && isManager))
  const activeMore = MORE_TABS.find((t) => t.key === tab)

  // Retour à 15 lignes dès qu'on change d'onglet ou de filtre.
  useEffect(() => { setLimit(PAGE) }, [tab, q, sector, operator, lotFilter, groupFilter, preset, grouping, sort.key, sort.dir])

  const changeTab = (t: Tab) => { setView({ onglet: t }); setSelected(new Set()); setMoreOpen(false) }
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

  const returnReceived = (o: OrderRow) => {
    if (!window.confirm(`Marquer le retour de l’entreprise pour la commande ${o.order_number} ?\nLa fiche passera en « Signée ».`)) return
    void runAction('advance_plan_status', { p_order: o.order_number, p_to: 'SIGNEE' }, `Retour enregistré : commande ${o.order_number} signée.`)
  }
  const archiveOrder = (o: OrderRow) => {
    if (!window.confirm(`Archiver la commande ${o.order_number} ?`)) return
    void runAction('advance_plan_status', { p_order: o.order_number, p_to: 'ARCHIVEE' }, `Commande ${o.order_number} archivée.`)
  }
  /** Couleur de ligne : rouge = plus d'un mois sans action, gris = obsolète, orange = envoyée sans retour, vert = signée archivée. */
  const rowTone = (o: OrderRow) => {
    if (o.scope_status !== 'IN_SCOPE') return ''
    if (o.plan_status === 'ARCHIVEE') {
      if (o.archive_reason === 'OBSOLETE') return 'bg-zinc-100 text-zinc-500'
      if (o.archive_reason === 'ENVOI_SANS_RETOUR') return 'bg-orange-50'
      if (o.archive_reason === 'SIGNEE_6_MOIS') return 'bg-green-50'
      return ''
    }
    if (o.plan_status === 'NON_QUALIFIEE' && o.order_date && dayOf(o.order_date) < todayDay() - 31) return 'bg-red-50'
    return ''
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
  const reintegrateMany = async (numbers: string[]) => {
    if (!numbers.length) return
    if (!window.confirm(`Réintégrer ${numbers.length} commande(s) au périmètre ?\nElles seront à qualifier.`)) return
    setBusy(true); setErr(null)
    for (const n of numbers) {
      const { error } = await supabase.rpc('set_order_scope', { p_order: n, p_scope: 'IN_SCOPE', p_override: true, p_comment: null })
      if (error) { setErr(`${n} : ${error.message}`); break }
    }
    setBusy(false)
    setSelected(new Set())
    setNotice(`${numbers.length} commande(s) réintégrée(s) au périmètre.`)
    await load()
  }
  const setTrashedState = (numbers: string[], toTrash: boolean) => {
    if (toTrash && !window.confirm(`Mettre ${numbers.length} commande(s) à la corbeille ? Elles sortent des listes ; elles peuvent être restaurées à tout moment.`)) return
    void runAction('set_orders_trashed', { p_orders: numbers, p_trashed: toTrash },
      toTrash ? `${numbers.length} commande(s) mise(s) à la corbeille.` : `${numbers.length} commande(s) restaurée(s).`)
  }

  const manualTab = tab === 'ENVOYE_MANUELLEMENT'
  const selectedOrders = rows.filter((o) => selected.has(o.order_number))
  const companyNameOf = (isis: string | null) => (isis ? companies.get(isis)?.name || isis : '')

  // Fiches enregistrées : prévisualiser, modifier, télécharger (données relues depuis la base)
  const savedLine = async (o: OrderRow): Promise<Line> => {
    if (!ref) throw new Error('Référentiel non chargé')
    const map = await fetchSavedLines([o])
    const l = map.get(o.order_number)
    if (!l) throw new Error('Fiche introuvable')
    return l
  }
  const previewSheet = async (o: OrderRow) => {
    if (!ref) return
    try {
      const l = await savedLine(o)
      openPdf(await buildSheetPdf(l, o, ref, companyNameOf(o.isis_code), contactFor(contacts, o)))
    } catch (e) { setErr(errMsg(e)) }
  }
  const downloadSheet = async (o: OrderRow) => {
    if (!ref) return
    try {
      const l = await savedLine(o)
      const bytes = await buildSheetPdf(l, o, ref, companyNameOf(o.isis_code), contactFor(contacts, o))
      const name = planFileName(fileTemplate, { entreprise: companyNameOf(o.isis_code) || o.order_number, commande: o.order_number, secteur: o.sector_code ?? '' })
      downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), name)
    } catch (e) { setErr(errMsg(e)) }
  }
  const editSheet = async (o: OrderRow) => {
    if (!ref) return
    try {
      const initial = await fetchSavedLines([o])
      setWizard({ orders: [o], initial, mode: 'edit' })
    } catch (e) { setErr(errMsg(e)) }
  }
  const downloadSelectedZip = async () => {
    if (!ref || !selectedOrders.length) return
    setBusy(true); setErr(null)
    try {
      const map = await fetchSavedLines(selectedOrders)
      const lines = selectedOrders.map((o) => map.get(o.order_number)).filter((l): l is Line => !!l)
      const byNumber = new Map(selectedOrders.map((o) => [o.order_number, o]))
      const { blob, count, failures } = await buildSheetsZip(lines, byNumber, ref, companyNameOf, (x) => contactFor(contacts, x), fileTemplate, setNotice)
      if (count > 0) downloadBlob(blob, `fiches_plans_prevention_${new Date().toISOString().slice(0, 10)}.zip`)
      if (failures.length) setErr(`${failures.length} PDF non généré(s) :\n${failures.join('\n')}`)
      else setNotice(`${count} PDF téléchargé(s).`)
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Commandes"
        subtitle={<>
          <span>Connecté comme {profile?.email}</span>
        </>}
        actions={<>
          {!isTrashView && cutoff != null && hiddenOld > 0 && (
            <Bubble tone="warn" label={`${hiddenOld} masquée${hiddenOld > 1 ? 's' : ''}`}>
              <p>{hiddenOld} commande{hiddenOld > 1 ? 's' : ''} plus ancienne{hiddenOld > 1 ? 's' : ''} que le filtre « {PRESETS[activePreset].label} » {hiddenOld > 1 ? 'sont masquées' : 'est masquée'}.</p>
              <Button variant="ghost" size="sm" className="mt-3" onClick={() => setPreset(PRESETS.length - 1)}>Tout afficher</Button>
            </Bubble>
          )}
          <Button variant="ghost" onClick={() => void load()} disabled={loading}>Actualiser</Button>
        </>}
      />

      <Card className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">{profile?.role === 'CHARGE_OPERATIONS' ? 'Mes plans' : 'Avancement des plans'}</h2>
          <p className="text-xs text-muted-foreground">Commandes dans le périmètre. Cliquez sur une partie de la barre pour ouvrir la liste correspondante.</p>
        </div>
        <PipelineBar counts={pipeline} onSelect={(t) => changeTab(t as Tab)} />
      </Card>

      <Card className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2 md:items-end">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Recherche</label>
            <input className={`${fieldClass} w-full`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="N° commande, adresse, nature…" />
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">
              Commandes passées depuis <span className="font-semibold text-foreground">{PRESETS[activePreset].label}</span>
              {cutoff != null && <> · depuis le {fmtDay(cutoff)}</>}
            </p>
            <input type="range" aria-label="Période des commandes" className="w-full accent-primary" min={0} max={PRESETS.length - 1} step={1}
              value={activePreset} onChange={(e) => setPreset(Number(e.target.value))} />
            <div className="flex justify-between text-xs text-muted-foreground">
              {PRESETS.map((p, i) => (
                <button key={p.label} type="button" onClick={() => setPreset(i)}
                  className={i === activePreset ? 'font-semibold text-foreground' : 'hover:text-foreground'}>{p.label}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 items-end gap-3 md:flex md:flex-wrap">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Secteur</label>
          <select className={`${fieldClass} md:w-24`} value={sector} onChange={(e) => setSector(e.target.value)}>
            <option value="TOUS">Tous</option>
            {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {isManager && (
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Chargé</label>
            <select className={`${fieldClass} md:w-32`} value={operator} onChange={(e) => setOperator(e.target.value)}>
              <option value="">Tous</option>
              {operators.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Lot (suggéré)</label>
          <select className={`${fieldClass} md:w-32`} value={lotFilter} onChange={(e) => setLotFilter(e.target.value)}>
            <option value="">Tous</option>
            <option value="NONE">Sans lot identifié</option>
            {lotOptions.map((l) => <option key={l.code} value={String(l.code)}>{l.name}</option>)}
          </select>
        </div>
        <div className="col-span-2 md:col-span-1">
          <label className="mb-1 block text-xs text-muted-foreground">Nature (approx.)</label>
          <select className={`${fieldClass} md:w-32`} value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
            <option value="">Toutes</option>
            {groupOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
          {sansContact.length > 0 && (
            <div className="col-span-2 md:ml-auto md:self-end">
              <Bubble tone="warn" label={`${sansContact.length} fiche${sansContact.length > 1 ? 's' : ''} à compléter`}>
                <p>{sansContact.length} fiche(s) créée(s) ou envoyée(s) dont la personne à alerter n’est pas complète ({sansContactCodes.join(', ')}).</p>
                <p className="mt-2 text-muted-foreground">Le PDF affiche alors « Responsable d’intervention ». Complétez l’identité (Administration › Utilisateurs et chargés ou Vérifier mes infos).</p>
              </Bubble>
            </div>
          )}
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

      {selected.size > 0 && (ACTIONABLE.includes(tab) || manualTab || isScopeTab) && (
        <div className="inline-flex max-w-full flex-wrap items-center gap-2 self-start rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="mr-auto font-medium">{selected.size} sélectionnée(s)</span>
          {tab === 'NON_QUALIFIEE' && <Button onClick={() => setWizard({ orders: selectedOrders, mode: 'create' })} disabled={busy || !ref}>Créer les fiches</Button>}
          {tab === 'A_ENVOYER' && <Button onClick={() => void downloadSelectedZip()} disabled={busy || !ref}>Télécharger les PDF (ZIP)</Button>}
          {ACTIONABLE.includes(tab) && <Button variant="ghost" onClick={() => sendManually([...selected])} disabled={busy}>Déjà envoyée manuellement</Button>}
          {manualTab && <Button variant="ghost" onClick={() => restoreManual([...selected])} disabled={busy}>Remettre à traiter</Button>}
          {isScopeTab && isManager && <Button onClick={() => void reintegrateMany([...selected])} disabled={busy}>Réintégrer au périmètre</Button>}
          <Button variant="ghost" onClick={() => setSelected(new Set())}>Tout désélectionner</Button>
        </div>
      )}

      {err && <Notice tone="error">{err}</Notice>}
      {notice && <Notice tone="ok">{notice}</Notice>}

      {loading ? <p className="text-sm text-muted-foreground">Chargement des commandes…</p> : list.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={isTrashView ? Trash2 : Inbox}
            title={isTrashView ? 'La corbeille est vide.' : 'Aucune commande dans cette vue pour cette période.'}
            hint="Essayez une période plus longue ou modifiez les filtres."
          />
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-sm">
            <span className="text-muted-foreground">Regrouper :</span>
            {GROUPINGS.map((g) => (
              <button key={g.key} type="button" onClick={() => setView({ regroupement: g.key === 'NONE' ? undefined : g.key })} aria-pressed={grouping === g.key}
                className={`rounded-md border px-2.5 py-1 text-xs ${grouping === g.key ? 'border-primary bg-primary/10 font-semibold text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                {g.label}
              </button>
            ))}
            {groupKeys.length > 0 && (
              <button type="button" onClick={toggleAllGroups} className="rounded-md border border-border px-2.5 py-1 text-xs hover:text-foreground">
                {allGroupsOpen ? 'Tout plier' : 'Tout déplier'}
              </button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">Cliquez sur un en-tête pour trier</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-red-300" />Plus d’un mois sans action</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-zinc-300" />Obsolète (6 mois sans action)</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-orange-300" />Envoyée sans retour (archivée 6 mois)</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-green-300" />Signée (archivée 6 mois)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {(ACTIONABLE.includes(tab) || isScopeTab) && (
                    <th className="px-3 py-2"><input type="checkbox" aria-label="Tout sélectionner" checked={allChecked} onChange={toggleAll} /></th>
                  )}
                  {sortTh('order_number', 'Commande')}
                  {sortTh('order_date', 'Date')}
                  {sortTh('company', 'Entreprise')}
                  {sortTh('address', 'Adresse')}
                  {sortTh('nature', 'Nature / description')}
                  {sortTh('lot', 'Lot')}
                  {sortTh('operator', 'Chargé')}
                  {sortTh('status', 'Statut')}
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              {sections.map((sec, si) => (
              <tbody key={si} className="divide-y divide-border">
                {sec.group != null && groupRow(sec.group)}
                {(sec.group == null || openGroups.has(sec.group)) && sec.rows.map((o) => {
                  const sg = suggestions.get(o.order_number)
                  const assigned = o.nature_id != null
                  const canSelect = canSelectOrder(o)
                  const companyName = o.isis_code ? companies.get(o.isis_code)?.name : null
                  return (
                    <tr key={o.order_number} className={`align-top ${rowTone(o) || 'hover:bg-muted/30'}`}>
                      {(ACTIONABLE.includes(tab) || isScopeTab) && (
                        <td className="px-3 py-2.5">
                          {canSelect && <input type="checkbox" aria-label={`Sélectionner ${o.order_number}`}
                            checked={selected.has(o.order_number)} onChange={() => toggle(o.order_number)} />}
                        </td>
                      )}
                      <td className="px-3 py-2.5">
                        <div className="font-mono text-xs font-medium">{o.order_number}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">{o.order_date ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm">{companyName ?? o.isis_code ?? '—'}</span>
                          {o.isis_code && (
                            <IconButton icon={Info} label="Informations sur l’entreprise" onClick={() => setCompanyFor(o.isis_code)} />
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
                          {o.scope_status === 'IN_SCOPE' && <Badge tone={o.plan_status === 'A_ENVOYER' ? 'ok' : 'default'}>{STATUS_LABEL[o.plan_status]}</Badge>}
                          {o.scope_status === 'OUT_OF_SCOPE' && <Badge tone="warn">Hors périmètre</Badge>}
                          {o.scope_override && <Badge tone="warn">Forcé</Badge>}
                          {o.scope_request_status === 'EN_ATTENTE' && <Badge tone="warn">Exclusion en attente</Badge>}
                          {o.naac_code && <Badge>{o.naac_code}</Badge>}
                        </div>
                        {(dates.get(o.order_number)?.drafted || dates.get(o.order_number)?.sent) && (
                          <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                            {dates.get(o.order_number)?.drafted && <div>Rédigée le {fmtDate(dates.get(o.order_number)!.drafted!)}</div>}
                            {dates.get(o.order_number)?.sent && <div>Envoyée le {fmtDate(dates.get(o.order_number)!.sent!)}</div>}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex flex-wrap justify-end gap-1.5 whitespace-nowrap">
                          {isTrashView ? (
                            isManager && <IconButton icon={RotateCcw} label="Restaurer" onClick={() => setTrashedState([o.order_number], false)} disabled={busy} />
                          ) : (
                            <>
                              {o.scope_status === 'IN_SCOPE' && o.plan_status === 'NON_QUALIFIEE' && (
                                <Button onClick={() => setWizard({ orders: [o], mode: 'create' })} disabled={!ref}>Créer la fiche</Button>
                              )}
                              {o.scope_status === 'IN_SCOPE' && o.plan_status === 'A_ENVOYER' && (
                                <>
                                  <IconButton icon={Eye} label="Prévisualiser la fiche" onClick={() => void previewSheet(o)} />
                                  <IconButton icon={Pencil} label="Modifier la fiche" onClick={() => void editSheet(o)} disabled={busy || !ref} />
                                  <IconButton icon={Download} label="Télécharger le PDF" onClick={() => void downloadSheet(o)} />
                                  <IconButton icon={Mail} label="Envoyer par mail" onClick={() => setMailOrder(o)} disabled={busy} />
                                  <IconButton icon={SlidersHorizontal} label="Éditeur avancé (natures, lots, mesures)" onClick={() => onOpen(o)} />
                                </>
                              )}
                              {o.scope_status === 'IN_SCOPE' && o.plan_status === 'SIGNEE' && (
                                <>
                                  <IconButton icon={Eye} label="Prévisualiser la fiche" onClick={() => void previewSheet(o)} />
                                  <IconButton icon={Download} label="Télécharger le PDF" onClick={() => void downloadSheet(o)} />
                                  <IconButton icon={Archive} label="Archiver" onClick={() => archiveOrder(o)} disabled={busy} />
                                </>
                              )}
                              {o.scope_status === 'IN_SCOPE' && o.plan_status === 'EN_ATTENTE_RETOUR' && (
                                <>
                                  <IconButton icon={Eye} label="Prévisualiser la fiche" onClick={() => void previewSheet(o)} />
                                  <IconButton icon={Download} label="Télécharger le PDF" onClick={() => void downloadSheet(o)} />
                                  <IconButton icon={Mail} label="Renvoyer par mail" onClick={() => setMailOrder(o)} disabled={busy} />
                                  <IconButton icon={CheckCheck} label="Retour de l’entreprise reçu" onClick={() => returnReceived(o)} disabled={busy} />
                                </>
                              )}
                              {o.scope_status === 'IN_SCOPE' && (
                                <IconButton icon={Ban} label="Demander l’exclusion" onClick={() => setActionOrder(o)} />
                              )}
                              {isManager && o.scope_status === 'OUT_OF_SCOPE' && (
                                <IconButton icon={ArrowRightLeft} label="Réaffecter" onClick={() => setActionOrder(o)} />
                              )}
                              {isManager && o.scope_status === 'OUT_OF_SCOPE' && (
                                <IconButton icon={RotateCcw} label="Réintégrer au périmètre" onClick={() => reintegrate(o)} disabled={busy} />
                              )}
                              {isManager && (
                                <IconButton icon={Trash2} label="Mettre à la corbeille" onClick={() => setTrashedState([o.order_number], true)} disabled={busy} />
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              ))}
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

      {mailOrder && (
        <MailDialog
          order={mailOrder}
          company={companyNameOf(mailOrder.isis_code) || mailOrder.isis_code || ''}
          osEmail={companies.get(mailOrder.isis_code ?? '')?.os_email ?? ''}
          contact={contactFor(contacts, mailOrder)}
          objet={settings.mail_objet ?? DEFAULT_MAIL_OBJET}
          corps={settings.mail_corps ?? DEFAULT_MAIL_CORPS}
          onDownloadPdf={() => downloadSheet(mailOrder)}
          onDone={(m) => { setMailOrder(null); setNotice(m); void load() }}
          onClose={() => setMailOrder(null)}
        />
      )}
      {wizard && ref && (
        <BulkPlanWizard
          orders={wizard.orders}
          initial={wizard.initial}
          mode={wizard.mode}
          suggestions={suggestions}
          ref={ref}
          companies={companies}
          template={fileTemplate}
          onClose={() => setWizard(null)}
          onDone={(m) => { setWizard(null); setSelected(new Set()); setNotice(m); void load() }}
        />
      )}
      {actionOrder && (
        <OrderActionDialog
          order={actionOrder}
          canReassign={isManager || (!!profile?.operator_code && actionOrder.operator_code === profile.operator_code)}
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

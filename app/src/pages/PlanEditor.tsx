import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { corpsMatch, getReferentiel, lotFromCorpsEtat, type Referentiel } from '../lib/refdata'
import { computeMeasures, fold, proposeRisks, searchNatures, type NatureRef } from '../lib/rules'
import { autoNature } from '../lib/natureSuggest'
import { addressOf, type OrderRow, type PlanStatus } from '../lib/types'
import { Badge, Button, Card, Notice, fieldClass, errMsg } from '../components/ui'
import { useAuth } from '../lib/auth'
import { logActivity, logError } from '../lib/activity'
import { defaultPeriod } from '../lib/period'
import { buildLotTree, type TreeLot } from '../lib/lotTree'

type RiskState = { checked: boolean; origin: 'LOT_DEFAUT' | 'NATURE' | 'MANUEL' }
type MeasureState = { checked: boolean; origin: 'AUTO' | 'MANUEL' }
type LotState = { source: 'NATURE' | 'AUTO_ANALYSIS' | 'BUDGET_TRACKING' | 'MANUAL'; confidence: number | null }

interface Draft {
  lots: Map<number, LotState>
  natures: NatureRef[]
  risks: Map<string, RiskState>
  measures: Map<string, MeasureState>
}

const MIN_CHARS = 1
/** Score minimal pour présélectionner une nature à partir du libellé source de la commande. */

/** Corps d'état sans lot : signalé une fois par commande et par corps d'état (journal des erreurs du Super Admin). */
const reportedUnmatched = new Set<string>()
function reportUnmatched(orderNumber: string, naac: string | null, corps: string) {
  const key = `${orderNumber}|${corps}`
  if (reportedUnmatched.has(key)) return
  reportedUnmatched.add(key)
  void logActivity('ERROR', 'orders', orderNumber, { message: 'Corps d’état non rattaché à un lot', naac, corps })
}
const EDITABLE: PlanStatus[] = ['NON_QUALIFIEE', 'A_ENVOYER']
const STATUS_LABEL: Record<PlanStatus, string> = {
  NON_QUALIFIEE: 'Non qualifiée', A_ENVOYER: 'À envoyer', EN_ATTENTE_RETOUR: 'En attente retour entreprise', SIGNEE: 'Signée', ARCHIVEE: 'Archivée',
  ENVOYE_MANUELLEMENT: 'Envoyée manuellement (hors application)',
}

/** Risques : défauts des lots + écarts des natures retenues. Un choix manuel (MANUEL) n'est jamais écrasé. */
function syncRisks(ref: Referentiel, d: Draft): Map<string, RiskState> {
  const proposed = proposeRisks(ref.lotDefaults, [...d.lots.keys()], d.natures)
  const next = new Map<string, RiskState>()
  for (const [r, st] of d.risks) if (st.origin === 'MANUEL') next.set(r, st)
  for (const [r, origin] of proposed) if (!next.has(r)) next.set(r, { checked: true, origin })
  return next
}

/** Mesures : déduites des risques cochés. Une mesure cochée à la main n'est jamais retirée automatiquement. */
function syncMeasures(ref: Referentiel, risks: Map<string, RiskState>, prev: Map<string, MeasureState>) {
  const checked = new Set([...risks].filter(([, s]) => s.checked).map(([r]) => r))
  const computed = computeMeasures(checked, ref.rules)
  const next = new Map<string, MeasureState>()
  for (const [m, st] of prev) if (st.origin === 'MANUEL') next.set(m, st)
  for (const m of computed) if (!next.has(m)) next.set(m, { checked: true, origin: 'AUTO' })
  const removed = [...prev].filter(([m, s]) => s.origin === 'AUTO' && !computed.has(m) && !next.has(m)).map(([m]) => m)
  return { measures: next, removed }
}

const sameSet = (a: Iterable<number>, b: number[]) => {
  const sa = new Set(a); const sb = new Set(b)
  return sa.size === sb.size && [...sa].every((x) => sb.has(x))
}

export default function PlanEditor({ order, onBack }: { order: OrderRow; onBack: () => void }) {
  const { profile } = useAuth()
  const [ref, setRef] = useState<Referentiel | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [status, setStatus] = useState<PlanStatus>(order.plan_status)
  const [corps, setCorps] = useState<string | null>(null)
  const [detected, setDetected] = useState<{ lot: number; source: 'AUTO_ANALYSIS' | 'BUDGET_TRACKING'; validated: boolean } | null>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [lotQuery, setLotQuery] = useState('')
  const [period, setPeriod] = useState(() => defaultPeriod(order.order_date, order.period_start, order.period_end))
  const [removed, setRemoved] = useState<string[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  // ---- chargement
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await getReferentiel()
        const o = order.order_number
        const [lotsR, risksR, measuresR, budgetR] = await Promise.all([
          supabase.from('order_lots').select('lot_code,source,confidence').eq('order_number', o),
          supabase.from('order_risks').select('risk_code,checked,origin').eq('order_number', o),
          supabase.from('order_measures').select('measure_code,checked,origin').eq('order_number', o),
          supabase.from('budget_tracking').select('raw').eq('order_number', o),
        ])
        for (const x of [lotsR, risksR, measuresR, budgetR]) if (x.error) throw new Error(x.error.message)

        // corps d'état : colonne du suivi budgétaire contenant « corps »
        const corpsLabel = (budgetR.data ?? [])
          .map((row: { raw: Record<string, unknown> }) => Object.entries(row.raw).find(([k, v]) => /corps/i.test(k) && typeof v === 'string')?.[1])
          .find((v): v is string => typeof v === 'string') ?? null
        setCorps(corpsLabel)

        let det: { lot: number; source: 'AUTO_ANALYSIS' | 'BUDGET_TRACKING'; validated: boolean } | null = null
        const m = corpsLabel ? corpsMatch(corpsLabel, r.naacCorps, order.naac_code) : null
        if (m && m.lotCode) det = { lot: m.lotCode, source: 'AUTO_ANALYSIS', validated: m.validated }
        else if (corpsLabel) {
          const fz = lotFromCorpsEtat(corpsLabel, r.lots)
          if (fz) det = { lot: fz.code, source: 'BUDGET_TRACKING', validated: false }
        }
        setDetected(det)
        if (corpsLabel && !det) reportUnmatched(order.order_number, order.naac_code, corpsLabel)

        const hasNature = !!(order.nature_id || order.nature_proposal_id)
        let natures: NatureRef[] = hasNature
          ? r.natures.filter((n) => n.id === order.nature_id || n.proposalId === order.nature_proposal_id)
          : []
        // aucune nature retenue : présélection de la nature la plus proche du libellé source
        if (!hasNature) {
          const auto = autoNature(order, r)
          if (auto) natures = [auto]
        }

        const lots = new Map<number, LotState>()
        for (const l of lotsR.data ?? []) lots.set(l.lot_code, { source: l.source, confidence: l.confidence })
        if (lots.size === 0) {
          // lots repérés automatiquement (corps d'état) + lots portés par la nature suggérée
          if (det) lots.set(det.lot, { source: det.source, confidence: null })
          for (const n of natures) for (const lot of n.lots) if (!lots.has(lot)) lots.set(lot, { source: 'NATURE', confidence: null })
        }
        const risks = new Map<string, RiskState>()
        for (const x of risksR.data ?? []) risks.set(x.risk_code, { checked: x.checked, origin: x.origin })
        const measures = new Map<string, MeasureState>()
        for (const x of measuresR.data ?? []) measures.set(x.measure_code, { checked: x.checked, origin: x.origin === 'MANUEL' ? 'MANUEL' : 'AUTO' })

        const d: Draft = { lots, natures, risks, measures }
        if (risks.size === 0 && lots.size) d.risks = syncRisks(r, d)
        if (measures.size === 0) d.measures = syncMeasures(r, d.risks, new Map()).measures
        if (!alive) return
        setRef(r); setDraft(d)
      } catch (e) {
        logError('chargement du plan', e)
        if (alive) setErr(errMsg(e))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
    // Rechargé seulement quand la commande change ; `order` n'est lu qu'à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.order_number])

  // ---- mise à jour du brouillon
  const commit = (d: Draft, resyncRisks: boolean) => {
    if (!ref) return
    const risks = resyncRisks ? syncRisks(ref, d) : d.risks
    const { measures, removed: gone } = syncMeasures(ref, risks, d.measures)
    setDraft({ ...d, risks, measures })
    setRemoved(gone)
    setMsg(null)
  }

  const applyNatures = (natures: NatureRef[]) => {
    if (!draft) return
    const union = new Set(natures.flatMap((n) => n.lots))
    const lots = new Map<number, LotState>()
    for (const [code, st] of draft.lots) if (st.source !== 'NATURE' || union.has(code)) lots.set(code, st)
    for (const code of union) if (!lots.has(code)) lots.set(code, { source: 'NATURE', confidence: null })
    commit({ ...draft, natures, lots }, true)
  }

  const toggleNature = (n: NatureRef) => {
    if (!draft) return
    const isOn = draft.natures.some((x) => x.id === n.id)
    applyNatures(isOn ? draft.natures.filter((x) => x.id !== n.id) : [...draft.natures, n])
  }

  const toggleLot = (code: number) => {
    if (!draft) return
    const lots = new Map(draft.lots)
    if (lots.has(code)) lots.delete(code)
    else lots.set(code, { source: 'MANUAL', confidence: null })
    commit({ ...draft, lots }, true)
  }

  const toggleRisk = (code: string) => {
    if (!draft) return
    const cur = draft.risks.get(code)
    const risks = new Map(draft.risks)
    risks.set(code, { checked: !(cur?.checked ?? false), origin: 'MANUEL' })
    commit({ ...draft, risks }, false)
  }

  const toggleMeasure = (code: string) => {
    if (!draft) return
    const cur = draft.measures.get(code)
    const measures = new Map(draft.measures)
    measures.set(code, { checked: !(cur?.checked ?? false), origin: 'MANUEL' })
    setDraft({ ...draft, measures })
    setMsg(null)
  }

  // ---- recherche et parcours
  const q = query.trim()
  const searching = fold(q).length >= MIN_CHARS
  const hits = useMemo(() => (ref && searching ? searchNatures(q, ref.natures, ref.vocab, ref.lotNameByCode, 300) : []), [q, ref, searching])

  // natures regroupées par lot
  const groups = useMemo(() => {
    const g = new Map<number, NatureRef[]>()
    if (!ref) return g
    const source = searching ? hits.map((h) => h.nature) : ref.natures
    for (const n of source) for (const lot of n.lots) g.set(lot, [...(g.get(lot) ?? []), n])
    return g
  }, [ref, hits, searching])

  const suggested = detected?.lot ?? null
  const myPending = useMemo(() => (ref ? ref.natures.filter((n) => n.pending) : []), [ref])
  const hitIds = useMemo(() => new Set(hits.map((h) => h.nature.id)), [hits])
  // arbre : famille > corps d'état > lot > natures (parcours). Lots sans corps d'état en bas.
  const tree = useMemo(() => (ref ? buildLotTree(ref.naacCorps, ref.lots) : null), [ref])
  const browse = useMemo(() => {
    if (!tree) return null
    const keep = (lot: TreeLot | null) => !searching || (lot !== null && groups.has(lot.code))
    return {
      families: tree.families.map((f) => ({ ...f, corps: f.corps.filter((c) => keep(c.lot)) })).filter((f) => f.corps.length > 0),
      otherLots: tree.otherLots.filter((l) => keep(l)),
    }
  }, [tree, groups, searching])

  // section 2 : une case par lot (le premier corps d'état qui le porte), filtrée par la recherche
  const lotSection = useMemo(() => {
    if (!tree) return null
    const t = fold(lotQuery)
    const hit = (s: string) => !t || fold(s).includes(t)
    const shown = new Set<number>()
    const families = tree.families
      .map((f) => ({
        ...f,
        corps: f.corps
          .filter((c) => hit(c.label) || (c.lot !== null && hit(c.lot.name)))
          .map((c) => {
            const first = c.lot !== null && !shown.has(c.lot.code)
            if (c.lot) shown.add(c.lot.code)
            return { ...c, first }
          }),
      }))
      .filter((f) => f.corps.length > 0)
    const otherLots = tree.otherLots.filter((l) => hit(l.name))
    return { families, otherLots }
  }, [tree, lotQuery])

  // une ligne de lot dans le parcours : clic = natures du lot
  const lotRow = (lot: TreeLot, ctx: string, indentCls: string) => {
    const key = `${ctx}|${lot.code}`
    const list = groups.get(lot.code) ?? []
    const isOpen = searching || expanded === key
    return (
      <div key={key} className="border-b border-border last:border-b-0">
        <button className={`flex w-full items-center gap-2 py-2 pr-3 text-left text-sm hover:bg-muted ${indentCls}`}
          onClick={() => setExpanded(expanded === key ? null : key)}>
          <span className="flex-1 font-medium">{lotName(lot.code)}</span>
          {lot.code === suggested && <Badge tone="ok">suggéré</Badge>}
          <span className="text-xs text-muted-foreground">{list.length} nature(s)</span>
          <span className="text-muted-foreground">{isOpen ? '▾' : '▸'}</span>
        </button>
        {isOpen && list.map((n) => (
          <label key={`${key}-${n.id}`} className="flex items-center gap-2 px-10 py-1.5 text-sm hover:bg-muted">
            <input type="checkbox" checked={draft?.natures.some((x) => x.id === n.id) ?? false} onChange={() => toggleNature(n)} />
            <span className="flex-1">{n.label}</span>
            {n.pending && <Badge tone="warn">en attente</Badge>}
            {n.groupLabel && !n.pending && <span className="text-xs text-muted-foreground">{n.groupLabel}</span>}
          </label>
        ))}
      </div>
    )
  }

  // ---- actions : proposition de nature, de règle, de correspondance NAAC
  const [newNature, setNewNature] = useState({ label: '', lots: [] as number[], reason: '' })

  const proposeNewNature = async () => {
    if (!ref) return
    setBusy(true); setErr(null); setMsg(null)
    try {
      const lots = newNature.lots
      const risks = [...proposeRisks(ref.lotDefaults, lots, []).keys()]
      const measures = [...computeMeasures(new Set(risks), ref.rules)]
      const { error } = await supabase.rpc('propose_referential', {
        p_kind: 'NATURE_NOUVELLE', p_nature_id: null, p_label: newNature.label.trim(), p_lots: lots,
        p_risks: risks, p_measures: measures, p_reason: newNature.reason.trim() || null,
      })
      if (error) throw new Error(error.message)
      const fresh = await getReferentiel(true)
      setRef(fresh)
      const created = fresh.natures.find((n) => n.pending && n.label === newNature.label.trim())
      if (created && draft) {
        const natures = [...draft.natures, created]
        const lotsMap = new Map(draft.lots)
        created.lots.forEach((l) => { if (!lotsMap.has(l)) lotsMap.set(l, { source: 'NATURE', confidence: null }) })
        commit({ ...draft, natures, lots: lotsMap }, true)
      }
      setMsg('Nature ajoutée pour votre session. Elle sera généralisée après validation du Super Admin.')
      setShowAdd(false); setNewNature({ label: '', lots: [], reason: '' })
    } catch (e) { logError('proposition de nature', e); setErr(errMsg(e)) } finally { setBusy(false) }
  }

  const proposeRuleUpdate = async (n: NatureRef) => {
    if (!draft || !ref) return
    const reason = window.prompt('Motif de la mise à jour de la règle (optionnel) :') ?? null
    const lots = [...draft.lots.keys()]
    const risks = [...draft.risks].filter(([r, s]) => s.checked && (s.origin === 'MANUEL' || n.extraRisks.includes(r))).map(([r]) => r)
    const measures = [...draft.measures].filter(([, s]) => s.checked).map(([m]) => m)
    setBusy(true); setErr(null); setMsg(null)
    try {
      const { error } = await supabase.rpc('propose_referential', {
        p_kind: 'NATURE_REGLE', p_nature_id: n.id, p_label: n.label, p_lots: lots, p_risks: risks, p_measures: measures, p_reason: reason,
      })
      if (error) throw new Error(error.message)
      setRef(await getReferentiel(true))
      setMsg(`Règle proposée pour « ${n.label} ». Elle sera généralisée après validation du Super Admin.`)
    } catch (e) { logError('proposition de règle', e); setErr(errMsg(e)) } finally { setBusy(false) }
  }

  const [pickLot, setPickLot] = useState<number | ''>('')
  const proposeCorps = async () => {
    if (!corps || !order.naac_code || pickLot === '') return
    setBusy(true); setErr(null); setMsg(null)
    try {
      const { error } = await supabase.rpc('propose_corps_naac', {
        p_naac: order.naac_code, p_corps_label: corps, p_lot_code: pickLot, p_reason: null,
      })
      if (error) throw new Error(error.message)
      const fresh = await getReferentiel(true)
      setRef(fresh)
      const hit = corpsMatch(corps, fresh.naacCorps, order.naac_code)
      if (hit?.lotCode) setDetected({ lot: hit.lotCode, source: 'AUTO_ANALYSIS', validated: false })
      setMsg('Correspondance proposée. Elle servira de suggestion pour vous, puis sera validée par le Super Admin.')
    } catch (e) { logError('correspondance NAAC', e); setErr(errMsg(e)) } finally { setBusy(false) }
  }

  // ---- enregistrement et statut
  const save = async () => {
    if (!draft) return
    setBusy(true); setErr(null); setMsg(null)
    try {
      const primary = draft.natures[0]
      const { error } = await supabase.rpc('save_plan', {
        p_order: order.order_number,
        p_nature_id: primary && !primary.pending ? primary.id : null,
        p_proposal_id: primary?.pending ? primary.proposalId ?? null : null,
        p_lots: [...draft.lots].map(([code, v]) => ({ code, source: v.source, confidence: v.confidence })),
        p_risks: [...draft.risks].map(([code, s]) => ({ code, checked: s.checked, origin: s.origin })),
        p_measures: [...draft.measures].map(([code, s]) => ({ code, checked: s.checked, origin: s.origin })),
      })
      if (error) throw new Error(error.message)
      const { error: pErr } = await supabase.rpc('set_plan_period', { p_order: order.order_number, p_start: period.start, p_end: period.end })
      if (pErr) throw new Error(pErr.message)
      if (status === 'NON_QUALIFIEE') setStatus('A_ENVOYER')
      setMsg('Plan enregistré.')
    } catch (e) { logError('enregistrement du plan', e); setErr(errMsg(e)) } finally { setBusy(false) }
  }

  const advance = async (to: PlanStatus) => {
    setBusy(true); setErr(null); setMsg(null)
    try {
      const { error } = await supabase.rpc('advance_plan_status', { p_order: order.order_number, p_to: to })
      if (error) throw new Error(error.message)
      setStatus(to)
      setMsg(`Statut : ${STATUS_LABEL[to]}.`)
    } catch (e) { logError('changement de statut', e); setErr(errMsg(e)) } finally { setBusy(false) }
  }

  // ---- rendu
  if (loading) return <p className="text-sm text-muted-foreground">Chargement du plan…</p>
  if (!ref || !draft) return <Notice tone="error">{err ?? 'Référentiel indisponible.'}</Notice>

  // Assistant : lecture seule (aucune création ni modification de fiche)
  const readOnly = profile?.role === 'ASSISTANT'
  const editable = EDITABLE.includes(status) && !readOnly
  const lotName = (c: number) => ref.lotNameByCode.get(c) ?? `Lot ${c}`
  const riskLabel = (c: string) => ref.riskLabel.get(c) ?? c
  const measureLabel = (c: string) => ref.measures.find((m) => m.code === c)?.label ?? c
  const originLabel: Record<RiskState['origin'], string> = { LOT_DEFAUT: 'lot', NATURE: 'nature', MANUEL: 'manuel' }
  const sourceLabel = (s: string) => ({ NATURE: 'nature', AUTO_ANALYSIS: 'corps d’état / NAAC', BUDGET_TRACKING: 'suivi budgétaire', MANUAL: 'manuel' }[s] ?? s)
  const measuresByFamily = [...ref.measures.reduce((g, m) => g.set(m.family, [...(g.get(m.family) ?? []), m]), new Map<string, Referentiel['measures']>())]

  const differs = (n: NatureRef) =>
    !n.pending && (!sameSet(draft.lots.keys(), n.lots)
      || n.extraRisks.some((r) => !draft.risks.get(r)?.checked)
      || (n.measures ?? []).some((m) => !draft.measures.get(m)?.checked))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={onBack}>← Retour</Button>
        <div className="mr-auto">
          <div className="font-mono text-xs text-muted-foreground">{order.order_number}</div>
          <div className="text-sm font-semibold">{[addressOf(order), order.city].filter(Boolean).join(', ') || 'Adresse non renseignée'}</div>
        </div>
        <Badge tone={status === 'ARCHIVEE' ? 'off' : status === 'NON_QUALIFIEE' ? 'warn' : 'ok'}>{STATUS_LABEL[status]}</Badge>
        {editable && <Button onClick={() => void save()} disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer le plan'}</Button>}
      </div>

      <Card>
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
            <span className="text-muted-foreground">Période d’intervention :</span>
            <input type="date" className={fieldClass + ' w-auto'} value={period.start} disabled={!editable}
              onChange={(e) => setPeriod(defaultPeriod(e.target.value))} />
            <span className="text-muted-foreground">au</span>
            <input type="date" className={fieldClass + ' w-auto'} value={period.end} disabled={!editable}
              onChange={(e) => setPeriod({ start: period.start, end: e.target.value })} />
          </div>
          <div><span className="text-muted-foreground">Code NAAC : </span><strong>{order.naac_code ?? '—'}</strong></div>
          <div className={!detected && corps ? 'rounded bg-amber-100 px-2 py-1 ring-2 ring-amber-400' : ''}>
            <span className="text-muted-foreground">Corps d’état : </span>{corps ?? '—'}
            {!detected && corps && (
              <div className="mt-1 text-xs text-amber-900">Non rattaché à un lot : choisissez les lots à la main. Le Super Admin est alerté.</div>
            )}
          </div>
          <div>
            <span className="text-muted-foreground">Lot détecté : </span>
            {detected ? <strong>{lotName(detected.lot)}</strong> : '—'}
            {detected && <span className="ml-2 text-xs text-muted-foreground">({sourceLabel(detected.source)}{detected.validated ? ', validé' : ', à valider'})</span>}
          </div>
        </div>
        {order.nature_text && (
          <div className="mt-3 border-t border-border pt-3 text-sm">
            <div className="text-xs text-muted-foreground">Libellé source</div>
            {order.nature_text}
            {order.description && <div className="mt-1 text-muted-foreground">{order.description}</div>}
          </div>
        )}
        {corps && order.naac_code && (!detected || !detected.validated) && editable && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm">
            <span className="text-muted-foreground">Lot pour « {corps} » ({order.naac_code}) :</span>
            <select className={fieldClass + ' w-auto'} value={pickLot} onChange={(e) => setPickLot(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Choisir un lot</option>
              {ref.lots.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
            <Button variant="ghost" onClick={() => void proposeCorps()} disabled={busy || pickLot === ''}>Proposer cette correspondance</Button>
          </div>
        )}
      </Card>

      {err && <Notice tone="error">{err}</Notice>}
      {msg && <Notice tone="ok">{msg}</Notice>}
      {removed.length > 0 && <Notice>Mesures retirées car plus justifiées par les risques : {removed.map(measureLabel).join(', ')}.</Notice>}

      <Card>
        <h2 className="mb-2 font-semibold">1. Nature des travaux</h2>
        <div className="flex flex-wrap gap-2">
          <input className={fieldClass + ' flex-1 min-w-[260px]'} value={query} placeholder="Commencer à saisir, ou ouvrir la liste par lot"
            onFocus={() => setOpen(true)} onChange={(e) => { setQuery(e.target.value); setOpen(true) }} disabled={!editable} />
          <Button variant="ghost" onClick={() => { setQuery(order.nature_text ?? ''); setOpen(true) }} disabled={!editable || !order.nature_text}>
            Reprendre le libellé source
          </Button>
          <Button variant="ghost" onClick={() => setOpen(!open)} disabled={!editable}>{open ? 'Fermer' : 'Parcourir par lot'}</Button>
        </div>

        {editable && open && (
          <div className="mt-2 rounded-md border border-border">
            <div className="max-h-52 overflow-y-auto">
              {myPending.length > 0 && (
                <div className="border-b border-border bg-amber-50/50">
                  <div className="px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">Mes propositions (en attente de validation)</div>
                  {myPending.filter((n) => !searching || hitIds.has(n.id)).map((n) => (
                    <label key={`pending-${n.id}`} className="flex items-center gap-2 px-6 py-1.5 text-sm hover:bg-muted">
                      <input type="checkbox" checked={draft.natures.some((x) => x.id === n.id)} onChange={() => toggleNature(n)} />
                      <span className="flex-1">{n.label}</span>
                      <span className="text-xs text-muted-foreground">{n.lots.map(lotName).join(', ')}</span>
                      <Badge tone="warn">en attente</Badge>
                    </label>
                  ))}
                </div>
              )}
              {searching && groups.size === 0 && <p className="p-3 text-sm text-muted-foreground">Aucune nature trouvée. Vous pouvez en proposer une nouvelle ci-dessous.</p>}
              {browse?.families.map((f) => (
                <div key={f.naac} className="border-b border-border last:border-b-0">
                  <div className="bg-muted/40 px-3 pt-2 pb-1 text-xs font-semibold uppercase text-muted-foreground">Famille {f.naac}</div>
                  {f.corps.map((c) => (
                    <div key={`${f.naac}|${c.label}`}>
                      <div className="flex items-center gap-2 px-5 pt-1 text-xs text-muted-foreground">
                        <span>{c.label}</span>
                        {!c.lot && <Badge tone="warn">non rattaché à un lot</Badge>}
                      </div>
                      {c.lot && lotRow(c.lot, `${f.naac}|${c.label}`, 'pl-8')}
                    </div>
                  ))}
                </div>
              ))}
              {browse && browse.otherLots.length > 0 && (
                <div className="border-b border-border last:border-b-0">
                  <div className="bg-muted/40 px-3 pt-2 pb-1 text-xs font-semibold uppercase text-muted-foreground">Autres lots</div>
                  {browse.otherLots.map((l) => lotRow(l, 'autres', 'pl-5'))}
                </div>
              )}
            </div>
            <div className="border-t border-border p-3">
              {!showAdd ? (
                <Button variant="ghost" onClick={() => { setShowAdd(true); setNewNature({ ...newNature, label: q || order.nature_text || '' }) }}>
                  + Ajouter une nouvelle nature
                </Button>
              ) : (
                <div className="space-y-2">
                  <input className={fieldClass} value={newNature.label} onChange={(e) => setNewNature({ ...newNature, label: e.target.value })} placeholder="Libellé de la nature" />
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {ref.lots.map((l) => (
                      <label key={l.code} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={newNature.lots.includes(l.code)}
                          onChange={() => setNewNature({ ...newNature, lots: newNature.lots.includes(l.code) ? newNature.lots.filter((x) => x !== l.code) : [...newNature.lots, l.code] })} />
                        {l.name}
                      </label>
                    ))}
                  </div>
                  <input className={fieldClass} value={newNature.reason} onChange={(e) => setNewNature({ ...newNature, reason: e.target.value })} placeholder="Motif (optionnel)" />
                  <div className="flex gap-2">
                    <Button onClick={() => void proposeNewNature()} disabled={busy || !newNature.label.trim() || newNature.lots.length === 0}>Proposer la nature</Button>
                    <Button variant="ghost" onClick={() => setShowAdd(false)}>Annuler</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-3 space-y-2">
          {draft.natures.length === 0 && <p className="text-sm text-muted-foreground">Aucune nature retenue : vous pouvez choisir les lots directement ci-dessous.</p>}
          {draft.natures.length > 1 && (
            <Notice>Plusieurs natures sur cette fiche : la combinaison ne vaut que pour cette fiche et n’est pas généralisée au référentiel.</Notice>
          )}
          {draft.natures.map((n) => (
            <div key={n.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <span className="font-medium">{n.label}</span>
              {n.pending && <Badge tone="warn">en attente de validation</Badge>}
              <span className="text-xs text-muted-foreground">lots : {n.lots.map(lotName).join(', ')}</span>
              <span className="flex-1" />
              {editable && !n.pending && draft.natures.length === 1 && differs(n) && (
                <Button variant="ghost" onClick={() => void proposeRuleUpdate(n)} disabled={busy}>Mettre à jour la règle</Button>
              )}
              {editable && <Button variant="ghost" onClick={() => toggleNature(n)}>Retirer</Button>}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">2. Lots concernés <span className="text-xs font-normal text-muted-foreground">suggérés, modifiables</span></h2>
        <input className={fieldClass + ' mb-2'} value={lotQuery} onChange={(e) => setLotQuery(e.target.value)} placeholder="Rechercher un lot" disabled={!editable} />
        <div className="max-h-72 overflow-y-auto rounded-md border border-border">
          {lotSection?.families.map((f) => (
            <div key={f.naac} className="border-b border-border last:border-b-0">
              <div className="bg-muted/40 px-3 pt-2 pb-1 text-xs font-semibold uppercase text-muted-foreground">Famille {f.naac}</div>
              {f.corps.map((c) => {
                const st = c.lot ? draft.lots.get(c.lot.code) : undefined
                return (
                  <div key={`${f.naac}|${c.label}`}>
                    <div className="flex items-center gap-2 px-5 pt-1 text-xs text-muted-foreground">
                      <span>{c.label}</span>
                      {!c.lot && <Badge tone="warn">non rattaché à un lot</Badge>}
                      {c.lot && !c.first && <span>→ {lotName(c.lot.code)} (affiché plus haut)</span>}
                    </div>
                    {c.lot && c.first && (
                      <label className="flex items-center gap-2 py-1 pr-3 pl-8 text-sm hover:bg-muted">
                        <input type="checkbox" checked={!!st} onChange={() => toggleLot(c.lot!.code)} disabled={!editable} />
                        <span className="flex-1">{c.lot.name}</span>
                        {c.lot.code === suggested && <Badge tone="ok">suggéré</Badge>}
                        {st && <Badge>{sourceLabel(st.source)}</Badge>}
                      </label>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
          {lotSection && lotSection.otherLots.length > 0 && (
            <div>
              <div className="bg-muted/40 px-3 pt-2 pb-1 text-xs font-semibold uppercase text-muted-foreground">Autres lots</div>
              {lotSection.otherLots.map((l) => {
                const st = draft.lots.get(l.code)
                return (
                  <label key={l.code} className="flex items-center gap-2 py-1 pr-3 pl-5 text-sm hover:bg-muted">
                    <input type="checkbox" checked={!!st} onChange={() => toggleLot(l.code)} disabled={!editable} />
                    <span className="flex-1">{l.name}</span>
                    {l.code === suggested && <Badge tone="ok">suggéré</Badge>}
                    {st && <Badge>{sourceLabel(st.source)}</Badge>}
                  </label>
                )
              })}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">3. Risques <span className="text-xs font-normal text-muted-foreground">proposés selon lots et natures, modifiables</span></h2>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {ref.risks.map((r) => {
            const st = draft.risks.get(r.code)
            return (
              <label key={r.code} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                <input type="checkbox" checked={!!st?.checked} onChange={() => toggleRisk(r.code)} disabled={!editable} />
                <span className="flex-1">{riskLabel(r.code)}</span>
                {st && <Badge tone={st.origin === 'MANUEL' ? 'warn' : 'default'}>{originLabel[st.origin]}</Badge>}
              </label>
            )
          })}
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">4. Mesures de prévention <span className="text-xs font-normal text-muted-foreground">déduites des risques, modifiables</span></h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {measuresByFamily.map(([family, ms]) => (
            <div key={family}>
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{family}</div>
              {ms.map((m) => {
                const st = draft.measures.get(m.code)
                return (
                  <label key={m.code} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                    <input type="checkbox" checked={!!st?.checked} onChange={() => toggleMeasure(m.code)} disabled={!editable} />
                    <span className="flex-1">{m.label}</span>
                    {st && <Badge tone={st.origin === 'MANUEL' ? 'warn' : 'default'}>{st.origin === 'MANUEL' ? 'manuel' : 'auto'}</Badge>}
                  </label>
                )
              })}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">5. Suite du dossier</h2>
        <div className="flex flex-wrap gap-2">
          {status === 'A_ENVOYER' && <Button onClick={() => void advance('EN_ATTENTE_RETOUR')} disabled={busy}>Marquer comme envoyé</Button>}
          {status === 'EN_ATTENTE_RETOUR' && <Button onClick={() => void advance('SIGNEE')} disabled={busy}>Retour reçu (signée)</Button>}
          {status === 'SIGNEE' && <Button onClick={() => void advance('ARCHIVEE')} disabled={busy}>Archiver</Button>}
          <Button variant="ghost" disabled>Aperçu PDF</Button>
          <Button variant="ghost" disabled>Exporter</Button>
          <Button variant="ghost" disabled>Préparer le mail</Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Aperçu PDF, export et préparation du mail seront disponibles avec les phases 8 et 9. Ils restent désactivés d’ici là.
        </p>
      </Card>
    </div>
  )
}

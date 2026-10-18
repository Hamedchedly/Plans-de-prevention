import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { corpsMatch, getReferentiel, lotFromCorpsEtat, type Referentiel } from '../lib/refdata'
import { computeMeasures, fold, proposeRisks, searchNatures, type NatureRef } from '../lib/rules'
import type { OrderRow, PlanStatus } from '../lib/types'
import { Badge, Button, Card, Notice, fieldClass, errMsg } from '../components/ui'

type RiskState = { checked: boolean; origin: 'LOT_DEFAUT' | 'NATURE' | 'MANUEL' }
type MeasureState = { checked: boolean; origin: 'AUTO' | 'MANUEL' }
type LotState = { source: 'NATURE' | 'AUTO_ANALYSIS' | 'BUDGET_TRACKING' | 'MANUAL'; confidence: number | null }

interface Draft {
  lots: Map<number, LotState>
  natures: NatureRef[]
  risks: Map<string, RiskState>
  measures: Map<string, MeasureState>
}

const MIN_CHARS = 4
const EDITABLE: PlanStatus[] = ['NON_QUALIFIEE', 'A_ENVOYER']
const STATUS_LABEL: Record<PlanStatus, string> = {
  NON_QUALIFIEE: 'Non qualifiée', A_ENVOYER: 'À envoyer', EN_ATTENTE_RETOUR: 'En attente retour entreprise', ARCHIVEE: 'Archivée',
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
  const [ref, setRef] = useState<Referentiel | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [status, setStatus] = useState<PlanStatus>(order.plan_status)
  const [corps, setCorps] = useState<string | null>(null)
  const [detected, setDetected] = useState<{ lot: number; source: 'AUTO_ANALYSIS' | 'BUDGET_TRACKING'; validated: boolean } | null>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [lotQuery, setLotQuery] = useState('')
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

        const lots = new Map<number, LotState>()
        for (const l of lotsR.data ?? []) lots.set(l.lot_code, { source: l.source, confidence: l.confidence })
        if (lots.size === 0 && det) lots.set(det.lot, { source: det.source, confidence: null })

        const natures = order.nature_id || order.nature_proposal_id
          ? r.natures.filter((n) => n.id === order.nature_id || n.proposalId === order.nature_proposal_id)
          : []
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
        if (alive) setErr(errMsg(e))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
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
  const lotOrder = useMemo(() => {
    if (!ref) return []
    const all = ref.lots.map((l) => l.code).filter((c) => !searching || groups.has(c))
    return all.sort((a, b) => (a === suggested ? -1 : b === suggested ? 1 : (groups.get(b)?.length ?? 0) - (groups.get(a)?.length ?? 0) || a - b))
  }, [ref, groups, searching, suggested])

  const filteredLots = useMemo(() => {
    if (!ref) return []
    const t = fold(lotQuery)
    return ref.lots.filter((l) => !t || fold(l.name).includes(t))
  }, [ref, lotQuery])

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
      setShowAdd(false); setNewNature({ label: '', lots: [], reason: '' }); setQuery('')
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
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
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
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
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
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
      if (status === 'NON_QUALIFIEE') setStatus('A_ENVOYER')
      setMsg('Plan enregistré.')
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  const advance = async (to: PlanStatus) => {
    setBusy(true); setErr(null); setMsg(null)
    try {
      const { error } = await supabase.rpc('advance_plan_status', { p_order: order.order_number, p_to: to })
      if (error) throw new Error(error.message)
      setStatus(to)
      setMsg(`Statut : ${STATUS_LABEL[to]}.`)
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  // ---- rendu
  if (loading) return <p className="text-sm text-muted-foreground">Chargement du plan…</p>
  if (!ref || !draft) return <Notice tone="error">{err ?? 'Référentiel indisponible.'}</Notice>

  const editable = EDITABLE.includes(status)
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
          <div className="text-sm font-semibold">{[order.address, order.city].filter(Boolean).join(', ') || 'Adresse non renseignée'}</div>
        </div>
        <Badge tone={status === 'ARCHIVEE' ? 'off' : status === 'NON_QUALIFIEE' ? 'warn' : 'ok'}>{STATUS_LABEL[status]}</Badge>
        {editable && <Button onClick={() => void save()} disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer le plan'}</Button>}
      </div>

      <Card>
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <div><span className="text-muted-foreground">Code NAAC : </span><strong>{order.naac_code ?? '—'}</strong></div>
          <div><span className="text-muted-foreground">Corps d’état : </span>{corps ?? '—'}</div>
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
          <input className={fieldClass + ' flex-1 min-w-[260px]'} value={query} placeholder="Saisir au moins 4 lettres, ou ouvrir la liste par lot"
            onFocus={() => setOpen(true)} onChange={(e) => { setQuery(e.target.value); setOpen(true) }} disabled={!editable} />
          <Button variant="ghost" onClick={() => { setQuery(order.nature_text ?? ''); setOpen(true) }} disabled={!editable || !order.nature_text}>
            Reprendre le libellé source
          </Button>
          <Button variant="ghost" onClick={() => setOpen(!open)} disabled={!editable}>{open ? 'Fermer' : 'Parcourir par lot'}</Button>
        </div>

        {editable && open && (
          <div className="mt-2 rounded-md border border-border">
            <div className="max-h-96 overflow-y-auto">
              {searching && groups.size === 0 && <p className="p-3 text-sm text-muted-foreground">Aucune nature trouvée. Vous pouvez en proposer une nouvelle ci-dessous.</p>}
              {lotOrder.map((lot) => {
                const list = groups.get(lot) ?? []
                const isOpen = searching || expanded === lot
                return (
                  <div key={lot} className="border-b border-border last:border-b-0">
                    <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => setExpanded(expanded === lot ? null : lot)}>
                      <span className="flex-1 font-medium">{lotName(lot)}</span>
                      {lot === suggested && <Badge tone="ok">suggéré</Badge>}
                      <span className="text-xs text-muted-foreground">{list.length} nature(s)</span>
                      <span className="text-muted-foreground">{isOpen ? '▾' : '▸'}</span>
                    </button>
                    {isOpen && list.map((n) => (
                      <label key={`${lot}-${n.id}`} className="flex items-center gap-2 px-6 py-1.5 text-sm hover:bg-muted">
                        <input type="checkbox" checked={draft.natures.some((x) => x.id === n.id)} onChange={() => toggleNature(n)} />
                        <span className="flex-1">{n.label}</span>
                        {n.pending && <Badge tone="warn">en attente</Badge>}
                        {n.groupLabel && !n.pending && <span className="text-xs text-muted-foreground">{n.groupLabel}</span>}
                      </label>
                    ))}
                  </div>
                )
              })}
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
          {draft.natures.map((n) => (
            <div key={n.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <span className="font-medium">{n.label}</span>
              {n.pending && <Badge tone="warn">en attente de validation</Badge>}
              <span className="text-xs text-muted-foreground">lots : {n.lots.map(lotName).join(', ')}</span>
              <span className="flex-1" />
              {editable && !n.pending && differs(n) && (
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
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {filteredLots.map((l) => {
            const st = draft.lots.get(l.code)
            return (
              <label key={l.code} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                <input type="checkbox" checked={!!st} onChange={() => toggleLot(l.code)} disabled={!editable} />
                <span className="flex-1">{l.name}</span>
                {l.code === suggested && <Badge tone="ok">suggéré</Badge>}
                {st && <Badge>{sourceLabel(st.source)}</Badge>}
              </label>
            )
          })}
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
          {status === 'EN_ATTENTE_RETOUR' && <Button onClick={() => void advance('ARCHIVEE')} disabled={busy}>Retour reçu, archiver</Button>}
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

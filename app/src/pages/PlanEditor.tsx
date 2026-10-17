import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { getReferentiel, lotFromCorpsEtat, type Referentiel } from '../lib/refdata'
import { computeMeasures, orphanMeasures, proposeRisks, searchNatures, type NatureRef, type SearchHit } from '../lib/rules'
import type { OrderRow } from '../lib/types'
import { Badge, Button, Card, Notice, fieldClass, errMsg } from '../components/ui'

type RiskState = { checked: boolean; origin: 'LOT_DEFAUT' | 'NATURE' | 'MANUEL' }
type MeasureState = { checked: boolean; origin: 'AUTO' | 'MANUEL' }
type LotState = { source: string; confidence: number | null }

interface Draft {
  lots: Map<number, LotState>
  nature: NatureRef | null
  risks: Map<string, RiskState>
  measures: Map<string, MeasureState>
}

/** Risques : défauts des lots + écarts de la nature. Les choix manuels (MANUEL) ne sont jamais écrasés. */
function syncRisks(ref: Referentiel, d: Draft): Map<string, RiskState> {
  const proposed = proposeRisks(ref.lotDefaults, [...d.lots.keys()], d.nature ? [d.nature] : [])
  const next = new Map<string, RiskState>()
  for (const [r, st] of d.risks) if (st.origin === 'MANUEL') next.set(r, st)
  for (const [r, origin] of proposed) if (!next.has(r)) next.set(r, { checked: true, origin })
  return next
}

/** Mesures : dérivées des risques cochés. Une mesure cochée à la main n'est jamais retirée automatiquement. */
function syncMeasures(ref: Referentiel, risks: Map<string, RiskState>, prev: Map<string, MeasureState>) {
  const checked = new Set([...risks].filter(([, s]) => s.checked).map(([r]) => r))
  const computed = computeMeasures(checked, ref.rules)
  const next = new Map<string, MeasureState>()
  for (const [m, st] of prev) if (st.origin === 'MANUEL') next.set(m, st)
  for (const m of computed) if (!next.has(m)) next.set(m, { checked: true, origin: 'AUTO' })
  const autoPrev = new Set([...prev].filter(([, s]) => s.origin === 'AUTO').map(([m]) => m))
  const removed = orphanMeasures(new Set(), autoPrev, computed)
  return { measures: next, removed }
}

export default function PlanEditor({ order, onBack }: { order: OrderRow; onBack: () => void }) {
  const { profile } = useAuth()
  const [ref, setRef] = useState<Referentiel | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [removed, setRemoved] = useState<string[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

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

        const lots = new Map<number, LotState>()
        for (const l of lotsR.data ?? []) lots.set(l.lot_code, { source: l.source, confidence: l.confidence })
        // première proposition : rapprochement du suivi budgétaire (corps d'état → lot)
        if (lots.size === 0) {
          for (const row of budgetR.data ?? []) {
            const label = Object.entries(row.raw as Record<string, unknown>).find(([k]) => /corps|lot/i.test(k))?.[1]
            if (typeof label !== 'string') continue
            const hit = lotFromCorpsEtat(label, r.lots)
            if (hit) lots.set(hit.code, { source: 'BUDGET_TRACKING', confidence: hit.confidence })
          }
        }
        const nature = order.nature_id ? r.natures.find((n) => n.id === order.nature_id) ?? null : null
        const risks = new Map<string, RiskState>()
        for (const x of risksR.data ?? []) risks.set(x.risk_code, { checked: x.checked, origin: x.origin })
        const measures = new Map<string, MeasureState>()
        for (const x of measuresR.data ?? []) measures.set(x.measure_code, { checked: x.checked, origin: x.origin === 'MANUEL' ? 'MANUEL' : 'AUTO' })

        const d: Draft = { lots, nature, risks, measures }
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

  useEffect(() => {
    if (ref) setHits(searchNatures(query, ref.natures, ref.vocab, ref.lotNameByCode))
  }, [query, ref])

  const commit = (d: Draft, resyncRisks: boolean) => {
    if (!ref) return
    const risks = resyncRisks ? syncRisks(ref, d) : d.risks
    const { measures, removed: gone } = syncMeasures(ref, risks, d.measures)
    setDraft({ ...d, risks, measures })
    setRemoved(gone)
    setMsg(null)
  }

  const pickNature = (n: NatureRef) => {
    if (!draft) return
    const lots = new Map<number, LotState>()
    n.lots.forEach((l) => lots.set(l, { source: 'NATURE', confidence: null }))
    commit({ ...draft, lots, nature: n }, true)
    setQuery('')
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

  const measuresByFamily = useMemo(() => {
    const g = new Map<string, Referentiel['measures']>()
    ref?.measures.forEach((m) => g.set(m.family, [...(g.get(m.family) ?? []), m]))
    return [...g]
  }, [ref])

  const save = async () => {
    if (!draft) return
    setSaving(true); setErr(null); setMsg(null)
    const chk = (res: { error: { message: string } | null }) => { if (res.error) throw new Error(res.error.message) }
    try {
      const o = order.order_number
      const by = profile?.user_id
      chk(await supabase.from('order_lots').delete().eq('order_number', o))
      if (draft.lots.size) chk(await supabase.from('order_lots').insert([...draft.lots].map(([lot_code, v]) => ({
        order_number: o, lot_code, source: v.source, confidence: v.confidence, chosen_by: by,
      }))))
      chk(await supabase.from('order_risks').delete().eq('order_number', o))
      if (draft.risks.size) chk(await supabase.from('order_risks').insert([...draft.risks].map(([risk_code, s]) => ({
        order_number: o, risk_code, checked: s.checked, origin: s.origin, updated_by: by,
      }))))
      chk(await supabase.from('order_measures').delete().eq('order_number', o))
      if (draft.measures.size) chk(await supabase.from('order_measures').insert([...draft.measures].map(([measure_code, s]) => ({
        order_number: o, measure_code, checked: s.checked, origin: s.origin, updated_by: by,
      }))))
      chk(await supabase.from('orders').update({ nature_id: draft.nature?.id ?? null, qualification_status: 'QUALIFIED' }).eq('order_number', o))
      setMsg('Plan de prévention enregistré.')
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Chargement du plan…</p>
  if (!ref || !draft) return <Notice tone="error">{err ?? 'Référentiel indisponible.'}</Notice>

  const lotName = (c: number) => ref.lotNameByCode.get(c) ?? `Lot ${c}`
  const riskLabel = (c: string) => ref.riskLabel.get(c) ?? c
  const measureLabel = (c: string) => ref.measures.find((m) => m.code === c)?.label ?? c
  const originLabel: Record<RiskState['origin'], string> = { LOT_DEFAUT: 'lot', NATURE: 'nature', MANUEL: 'manuel' }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={onBack}>← Retour</Button>
        <div className="mr-auto">
          <div className="font-mono text-xs text-muted-foreground">{order.order_number}</div>
          <div className="text-sm font-semibold">{[order.address, order.city].filter(Boolean).join(', ') || 'Adresse non renseignée'}</div>
        </div>
        <Button onClick={() => void save()} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer le plan'}</Button>
      </div>

      {order.nature_text && <Card><div className="text-xs text-muted-foreground">Libellé source</div><div className="text-sm">{order.nature_text}</div>
        {order.description && <div className="mt-2 text-sm text-muted-foreground">{order.description}</div>}</Card>}

      {err && <Notice tone="error">{err}</Notice>}
      {msg && <Notice tone="ok">{msg}</Notice>}
      {removed.length > 0 && <Notice>Mesures retirées car plus justifiées par les risques : {removed.map(measureLabel).join(', ')}.</Notice>}

      <Card>
        <h2 className="mb-2 font-semibold">1. Nature des travaux</h2>
        <input className={fieldClass} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Décrivez les travaux (ex. remplacer robinet cuisine)" />
        {draft.nature ? (
          <p className="mt-2 text-sm">Nature retenue : <strong>{draft.nature.label}</strong> <Badge>{draft.nature.groupLabel ?? 'sans groupe'}</Badge></p>
        ) : <p className="mt-2 text-sm text-muted-foreground">Aucune nature retenue : lots choisis manuellement.</p>}
        {query && hits.length > 0 && (
          <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {hits.map((h) => (
              <li key={h.nature.id}>
                <button className="w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => pickNature(h.nature)}>
                  {h.nature.label}
                  <span className="ml-2 text-xs text-muted-foreground">{h.nature.groupLabel} · lots {h.nature.lots.map(lotName).join(', ')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {query && hits.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Aucune nature trouvée : précisez le descriptif ou choisissez les lots ci-dessous.</p>}
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">2. Lots concernés <span className="text-xs font-normal text-muted-foreground">pré-sélectionnés, modifiables</span></h2>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {ref.lots.map((l) => {
            const st = draft.lots.get(l.code)
            return (
              <label key={l.code} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                <input type="checkbox" checked={!!st} onChange={() => toggleLot(l.code)} />
                <span className="flex-1">{l.name}</span>
                {st && <Badge tone={st.source === 'MANUAL' ? 'default' : 'ok'}>{st.source === 'NATURE' ? 'nature' : st.source === 'BUDGET_TRACKING' ? `budget ${Math.round((st.confidence ?? 0) * 100)} %` : 'manuel'}</Badge>}
              </label>
            )
          })}
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">3. Risques <span className="text-xs font-normal text-muted-foreground">proposés selon lots et nature, modifiables</span></h2>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {ref.risks.map((r) => {
            const st = draft.risks.get(r.code)
            return (
              <label key={r.code} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                <input type="checkbox" checked={!!st?.checked} onChange={() => toggleRisk(r.code)} />
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
                    <input type="checkbox" checked={!!st?.checked} onChange={() => toggleMeasure(m.code)} />
                    <span className="flex-1">{m.label}</span>
                    {st && <Badge tone={st.origin === 'MANUEL' ? 'warn' : 'default'}>{st.origin === 'MANUEL' ? 'manuel' : 'auto'}</Badge>}
                  </label>
                )
              })}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

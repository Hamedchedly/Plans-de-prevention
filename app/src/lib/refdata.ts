import { supabase } from './supabase'
import { fold, type MeasureRule, type NatureRef, type VocabEntry } from './rules'

export interface NaacCorps { naac: string; corpsLabel: string; lotCode: number | null; validated: boolean }

export interface Referentiel {
  lots: { code: number; name: string }[]
  lotNameByCode: Map<number, string>
  risks: { code: string; label: string; family: string }[]
  riskLabel: Map<string, string>
  measures: { code: string; label: string; family: string; ruleType: MeasureRule['ruleType'] }[]
  rules: MeasureRule[]
  lotDefaults: Map<number, string[]>
  natures: NatureRef[]
  vocab: VocabEntry[]
  naacCorps: NaacCorps[]
}

async function run<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return (data ?? []) as T
}

interface ProposalRow {
  id: number
  kind: 'NATURE_NOUVELLE' | 'NATURE_REGLE' | 'CORPS_NAAC'
  nature_id: number | null
  payload: { label?: string; lots?: number[]; risks?: string[]; measures?: string[]; naac?: string; corps_label?: string; lot_code?: number }
}

/**
 * Référentiel commun (validé) + overlay des propositions de la session de l'utilisateur (non validées).
 * Les propositions des autres utilisateurs n'apparaissent qu'après approbation du Super Admin.
 */
export async function loadReferentiel(): Promise<Referentiel> {
  const [lots, risks, measures, mrr, lotRisks, natures, nl, nr, nm, vocab, naac] = await Promise.all([
    run<{ code: number; name: string }[]>(supabase.from('lots').select('code,name').order('code')),
    run<{ code: string; label: string; family: string }[]>(supabase.from('risks').select('code,label,family').order('code')),
    run<{ code: string; label: string; family: string; rule_type: MeasureRule['ruleType'] }[]>(
      supabase.from('measures').select('code,label,family,rule_type').order('code')),
    run<{ measure_code: string; risk_code: string }[]>(supabase.from('measure_risk_rules').select('measure_code,risk_code')),
    run<{ lot_code: number; risk_code: string; is_default: boolean }[]>(supabase.from('lot_risks').select('lot_code,risk_code,is_default')),
    run<{ id: number; label: string; group_label: string | null; model_code: string | null }[]>(
      supabase.from('natures').select('id,label,group_label,model_code').order('label')),
    run<{ nature_id: number; lot_code: number }[]>(supabase.from('nature_lots').select('nature_id,lot_code')),
    run<{ nature_id: number; risk_code: string }[]>(supabase.from('nature_risks').select('nature_id,risk_code')),
    run<{ nature_id: number; measure_code: string }[]>(supabase.from('nature_measures').select('nature_id,measure_code')),
    run<{ term: string; equivalents: string[] }[]>(supabase.from('vocabulary').select('term,equivalents')),
    run<{ naac: string; corps_label: string; lot_code: number | null; validated: boolean }[]>(
      supabase.from('naac_corps_etat').select('naac,corps_label,lot_code,validated')),
  ])

  const group = <T,>(rows: T[], key: (r: T) => number | string, val: (r: T) => string | number) => {
    const m = new Map<number | string, (string | number)[]>()
    rows.forEach((r) => m.set(key(r), [...(m.get(key(r)) ?? []), val(r)]))
    return m
  }
  const lotsByNature = group(nl, (r) => r.nature_id, (r) => r.lot_code) as Map<number, number[]>
  const extraByNature = group(nr, (r) => r.nature_id, (r) => r.risk_code) as Map<number, string[]>
  const measuresByNature = group(nm, (r) => r.nature_id, (r) => r.measure_code) as Map<number, string[]>
  const risksByMeasure = group(mrr, (r) => r.measure_code, (r) => r.risk_code) as Map<string, string[]>
  const lotDefaults = group(lotRisks.filter((r) => r.is_default), (r) => r.lot_code, (r) => r.risk_code) as Map<number, string[]>

  const baseNatures: NatureRef[] = natures.map((n) => ({
    id: n.id, label: n.label, groupLabel: n.group_label, modelCode: n.model_code,
    lots: lotsByNature.get(n.id) ?? [], extraRisks: extraByNature.get(n.id) ?? [], measures: measuresByNature.get(n.id) ?? [],
  }))
  const naacCorps: NaacCorps[] = naac.map((c) => ({ naac: c.naac, corpsLabel: c.corps_label, lotCode: c.lot_code, validated: c.validated }))

  // overlay : propositions en attente de l'utilisateur courant
  const { data: auth } = await supabase.auth.getUser()
  const own = auth.user
    ? await run<ProposalRow[]>(supabase.from('referential_proposals').select('id,kind,nature_id,payload')
        .eq('status', 'EN_ATTENTE').eq('created_by', auth.user.id))
    : []
  const allNatures = [...baseNatures]
  for (const p of own) {
    const pl = p.payload
    if (p.kind === 'NATURE_NOUVELLE') {
      allNatures.push({ id: -p.id, label: pl.label ?? '', groupLabel: 'En attente de validation', modelCode: null,
        lots: pl.lots ?? [], extraRisks: pl.risks ?? [], measures: pl.measures ?? [], pending: true, proposalId: p.id })
    } else if (p.kind === 'NATURE_REGLE') {
      const i = allNatures.findIndex((n) => n.id === p.nature_id)
      if (i >= 0) allNatures[i] = { ...allNatures[i], lots: pl.lots ?? [], extraRisks: pl.risks ?? [], measures: pl.measures ?? [], pending: true, proposalId: p.id }
    } else if (p.kind === 'CORPS_NAAC' && pl.naac && pl.corps_label) {
      const existing = naacCorps.find((c) => c.naac === pl.naac && c.corpsLabel === pl.corps_label)
      if (existing) { existing.lotCode = pl.lot_code ?? null; existing.validated = false }
      else naacCorps.push({ naac: pl.naac, corpsLabel: pl.corps_label, lotCode: pl.lot_code ?? null, validated: false })
    }
  }

  return {
    lots,
    lotNameByCode: new Map(lots.map((l) => [l.code, l.name])),
    risks,
    riskLabel: new Map(risks.map((r) => [r.code, r.label])),
    measures: measures.map((m) => ({ code: m.code, label: m.label, family: m.family, ruleType: m.rule_type })),
    rules: measures.map((m) => ({ code: m.code, label: m.label, family: m.family, ruleType: m.rule_type, risks: risksByMeasure.get(m.code) ?? [] })),
    lotDefaults,
    natures: allNatures,
    vocab,
    naacCorps,
  }
}

/** Corps d'état proche d'un libellé de suivi budgétaire (ex. « (i) Electricité » ≈ « Electricité »). */
export function corpsMatch(label: string, corps: Referentiel['naacCorps'], naac: string | null): NaacCorps | null {
  if (!naac) return null
  const target = fold(label).replace(/\s+/g, ' ').trim()
  for (const c of corps) {
    if (c.naac !== naac) continue
    const bare = fold(c.corpsLabel.replace(/^\([a-z]+\)\s*/i, '')).trim()
    if (fold(c.corpsLabel).trim() === target || (bare && target.includes(bare))) return c
  }
  return null
}

let cache: Promise<Referentiel> | null = null
/** Référentiel chargé une fois par session ; `force` le recharge (après une proposition par exemple). */
export function getReferentiel(force = false): Promise<Referentiel> {
  if (force || !cache) cache = loadReferentiel().catch((e) => { cache = null; throw e })
  return cache
}

/** Rapprochement approximatif libellé → lot (repli quand la correspondance NAAC ne suffit pas). */
export function lotFromCorpsEtat(label: string, lots: { code: number; name: string }[]): { code: number; confidence: number } | null {
  const words = fold(label).split(/\s+/).filter((w) => w.length >= 4)
  let best: { code: number; confidence: number } | null = null
  for (const lot of lots) {
    const lw = fold(lot.name).split(/\s+/).filter((w) => w.length >= 4)
    const hit = words.filter((w) => lw.some((x) => x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5)))).length
    if (hit > 0) {
      const confidence = Math.min(0.95, 0.6 + 0.2 * hit)
      if (!best || confidence > best.confidence) best = { code: lot.code, confidence }
    }
  }
  return best
}

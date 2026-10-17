import { supabase } from './supabase'
import type { MeasureRule, NatureRef, VocabEntry } from './rules'

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
}

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return (res.data ?? []) as T
}

/** Lit tout le référentiel en une fois (quelques centaines de lignes). */
export async function loadReferentiel(): Promise<Referentiel> {
  const [lots, risks, measures, mrr, lotRisks, natures, nl, nr, vocab] = await Promise.all([
    supabase.from('lots').select('code,name').order('code'),
    supabase.from('risks').select('code,label,family').order('code'),
    supabase.from('measures').select('code,label,family,rule_type').order('code'),
    supabase.from('measure_risk_rules').select('measure_code,risk_code'),
    supabase.from('lot_risks').select('lot_code,risk_code,is_default'),
    supabase.from('natures').select('id,label,group_label,model_code').order('label'),
    supabase.from('nature_lots').select('nature_id,lot_code'),
    supabase.from('nature_risks').select('nature_id,risk_code'),
    supabase.from('vocabulary').select('term,equivalents'),
  ].map((p) => p as unknown as Promise<{ data: unknown; error: { message: string } | null }>)) as unknown as [
    { data: { code: number; name: string }[]; error: null | { message: string } },
    { data: { code: string; label: string; family: string }[]; error: null | { message: string } },
    { data: { code: string; label: string; family: string; rule_type: MeasureRule['ruleType'] }[]; error: null | { message: string } },
    { data: { measure_code: string; risk_code: string }[]; error: null | { message: string } },
    { data: { lot_code: number; risk_code: string; is_default: boolean }[]; error: null | { message: string } },
    { data: { id: number; label: string; group_label: string | null; model_code: string | null }[]; error: null | { message: string } },
    { data: { nature_id: number; lot_code: number }[]; error: null | { message: string } },
    { data: { nature_id: number; risk_code: string }[]; error: null | { message: string } },
    { data: { term: string; equivalents: string[] }[]; error: null | { message: string } },
  ]
  const lotsRows = check(lots)
  const riskRows = check(risks)
  const measureRows = check(measures)
  const mrrRows = check(mrr)
  const lotRiskRows = check(lotRisks)
  const natureRows = check(natures)
  const nlRows = check(nl)
  const nrRows = check(nr)
  const vocabRows = check(vocab)

  const lotsByNature = new Map<number, number[]>()
  nlRows.forEach((r) => lotsByNature.set(r.nature_id, [...(lotsByNature.get(r.nature_id) ?? []), r.lot_code]))
  const extraByNature = new Map<number, string[]>()
  nrRows.forEach((r) => extraByNature.set(r.nature_id, [...(extraByNature.get(r.nature_id) ?? []), r.risk_code]))
  const risksByMeasure = new Map<string, string[]>()
  mrrRows.forEach((r) => risksByMeasure.set(r.measure_code, [...(risksByMeasure.get(r.measure_code) ?? []), r.risk_code]))
  const lotDefaults = new Map<number, string[]>()
  lotRiskRows.filter((r) => r.is_default).forEach((r) => lotDefaults.set(r.lot_code, [...(lotDefaults.get(r.lot_code) ?? []), r.risk_code]))

  return {
    lots: lotsRows,
    lotNameByCode: new Map(lotsRows.map((l) => [l.code, l.name])),
    risks: riskRows,
    riskLabel: new Map(riskRows.map((r) => [r.code, r.label])),
    measures: measureRows.map((m) => ({ code: m.code, label: m.label, family: m.family, ruleType: m.rule_type })),
    rules: measureRows.map((m) => ({
      code: m.code, label: m.label, family: m.family, ruleType: m.rule_type,
      risks: risksByMeasure.get(m.code) ?? [],
    })),
    lotDefaults,
    natures: natureRows.map((n) => ({
      id: n.id, label: n.label, groupLabel: n.group_label, modelCode: n.model_code,
      lots: lotsByNature.get(n.id) ?? [], extraRisks: extraByNature.get(n.id) ?? [],
    })),
    vocab: vocabRows,
  }
}

/** Rapprochement suivi budgétaire → lot : mots du libellé de corps d'état comparés aux noms de lots. */
export function lotFromCorpsEtat(label: string, lots: { code: number; name: string }[]): { code: number; confidence: number } | null {
  const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ')
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

let cache: Promise<Referentiel> | null = null
/** Référentiel chargé une seule fois par session (invalidé après un rechargement). */
export function getReferentiel(force = false): Promise<Referentiel> {
  if (force || !cache) cache = loadReferentiel().catch((e) => { cache = null; throw e })
  return cache
}

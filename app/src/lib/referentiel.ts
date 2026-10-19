import { supabase } from './supabase'
import seed from '../data/referentiel_v4.json'
import { computeMeasures, type MeasureRule, type RuleType } from './rules'

/**
 * Charge le référentiel V4 (proposé, non validé) dans le schéma.
 * Idempotent : relancer le chargement ne duplique rien. Les décisions déjà prises sur les alertes sont conservées.
 */
/** Forme du référentiel (même format que le fichier V4 fourni, ou exporté depuis la base). */
export type ReferentielSeed = typeof seed

export async function importReferentielV4(userId: string, input: ReferentielSeed = seed): Promise<string> {
  const s = input

  const chunk = <T,>(xs: T[], n = 400) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))
  const ok = (e: { error: { message: string } | null }) => { if (e.error) throw new Error(e.error.message) }

  ok(await supabase.from('lots').upsert(s.lots.map((l) => ({ code: l.code, name: l.name })), { onConflict: 'code' }))
  ok(await supabase.from('risks').upsert(s.risks, { onConflict: 'code' }))
  ok(await supabase.from('measures').upsert(
    s.measures.map((m) => ({ code: m.code, label: m.label, family: m.family, rule_type: m.rule_type })), { onConflict: 'code' }))

  // règles risque → mesure : remplacement complet (source unique)
  ok(await supabase.from('measure_risk_rules').delete().neq('measure_code', ''))
  const rules = s.measures.flatMap((m) => m.risks.map((r) => ({ measure_code: m.code, risk_code: r })))
  for (const part of chunk(rules)) ok(await supabase.from('measure_risk_rules').insert(part))

  for (const part of chunk(s.lot_risks.map((x) => ({ lot_code: x.lot, risk_code: x.risk, is_default: x.is_default })))) {
    ok(await supabase.from('lot_risks').upsert(part, { onConflict: 'lot_code,risk_code' }))
  }

  // natures : upsert par clé stable ref_key (ancien libellé), le libellé peut donc être reformulé sans doublon
  for (const part of chunk(s.natures)) {
    ok(await supabase.from('natures').upsert(
      part.map((n) => ({ ref_key: n.ref_key, label: n.label, model_code: n.model_code, group_label: n.group_label })),
      { onConflict: 'ref_key' }))
  }
  const { data: natureRows, error: nErr } = await supabase.from('natures').select('id,ref_key')
  if (nErr) throw new Error(nErr.message)
  const idByKey = new Map((natureRows ?? []).map((r: { id: number; ref_key: string }) => [r.ref_key, r.id]))
  const natureIds = s.natures.map((n) => idByKey.get(n.ref_key)).filter((x): x is number => typeof x === 'number')
  ok(await supabase.from('nature_lots').delete().in('nature_id', natureIds))
  ok(await supabase.from('nature_risks').delete().in('nature_id', natureIds))
  ok(await supabase.from('nature_measures').delete().in('nature_id', natureIds))
  // mesures par nature = mesures des risques (défauts des lots + écarts de la nature)
  const defaultsByLot = new Map<number, string[]>()
  s.lot_risks.filter((x) => x.is_default).forEach((x) => defaultsByLot.set(x.lot, [...(defaultsByLot.get(x.lot) ?? []), x.risk]))
  const rulesList: MeasureRule[] = s.measures.map((m) => ({ code: m.code, label: m.label, family: m.family, ruleType: m.rule_type as RuleType, risks: m.risks }))
  const nm: { nature_id: number; measure_code: string }[] = []
  const nl: { nature_id: number; lot_code: number }[] = []
  const nr: { nature_id: number; risk_code: string }[] = []
  for (const n of s.natures) {
    const id = idByKey.get(n.ref_key)
    if (typeof id !== 'number') continue
    n.lots.forEach((lot) => nl.push({ nature_id: id, lot_code: lot }))
    n.extra_risks.forEach((r) => nr.push({ nature_id: id, risk_code: r }))
    const risksOfNature = new Set([...n.lots.flatMap((l) => defaultsByLot.get(l) ?? []), ...n.extra_risks])
    computeMeasures(risksOfNature, rulesList).forEach((m) => nm.push({ nature_id: id, measure_code: m }))
  }
  for (const part of chunk(nl)) ok(await supabase.from('nature_lots').insert(part))
  for (const part of chunk(nr)) ok(await supabase.from('nature_risks').insert(part))
  for (const part of chunk(nm)) ok(await supabase.from('nature_measures').insert(part))

  ok(await supabase.from('vocabulary').upsert(s.vocabulary, { onConflict: 'term' }))
  // alertes : ne jamais écraser une décision existante
  for (const part of chunk(s.alerts)) {
    ok(await supabase.from('alerts').upsert(part, { onConflict: 'code', ignoreDuplicates: true }))
  }
  ok(await supabase.from('referentiel_versions').insert({ label: s.version, source: 'referentiel_v4.json', created_by: userId }))
  return `Référentiel chargé : ${s.lots.length} lots, ${s.risks.length} risques, ${s.measures.length} mesures, ${s.natures.length} natures, ${s.alerts.length} alertes.`
}

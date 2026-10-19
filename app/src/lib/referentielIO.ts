import { supabase } from './supabase'
import type { ReferentielSeed } from './referentiel'

/** Lit toutes les lignes d'une table, par tranches de 1000. */
async function selectAll<T>(table: string, cols: string, order?: string): Promise<T[]> {
  const page = 1000
  const out: T[] = []
  for (let from = 0; ; from += page) {
    let q = supabase.from(table).select(cols).range(from, from + page - 1)
    if (order) q = q.order(order)
    const { data, error } = await q
    if (error) throw new Error(`${table} : ${error.message}`)
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < page) break
  }
  return out
}

/** Dernier chargement du référentiel (date, libellé de version), ou null s'il n'a jamais été chargé. */
export async function lastReferentielLoad(): Promise<{ label: string; created_at: string; by: string | null } | null> {
  const { data, error } = await supabase.from('referentiel_versions')
    .select('label,created_at,created_by').order('created_at', { ascending: false }).limit(1)
  if (error) throw new Error(error.message)
  const row = (data ?? [])[0] as { label: string; created_at: string; created_by: string | null } | undefined
  if (!row) return null
  let by: string | null = null
  if (row.created_by) {
    const { data: p } = await supabase.from('profiles').select('full_name,email').eq('user_id', row.created_by).maybeSingle()
    by = (p as { full_name: string | null; email: string } | null)?.full_name || (p as { email: string } | null)?.email || null
  }
  return { label: row.label, created_at: row.created_at, by }
}

/**
 * Exporte le référentiel actuel de la base dans le format du fichier V4 :
 * rechargeable tel quel par « Importer un référentiel ».
 */
export async function exportReferentiel(): Promise<ReferentielSeed> {
  const [lots, risks, measures, ruleRows, lotRisks, natures, natureLots, natureRisks, vocabulary, alerts, versions] = await Promise.all([
    selectAll<{ code: number; name: string }>('lots', 'code,name', 'code'),
    selectAll<{ code: string; label: string; family: string }>('risks', 'code,label,family', 'code'),
    selectAll<{ code: string; label: string; family: string; rule_type: string }>('measures', 'code,label,family,rule_type', 'code'),
    selectAll<{ measure_code: string; risk_code: string }>('measure_risk_rules', 'measure_code,risk_code'),
    selectAll<{ lot_code: number; risk_code: string; is_default: boolean }>('lot_risks', 'lot_code,risk_code,is_default'),
    selectAll<{ id: number; label: string; model_code: string; group_label: string; ref_key: string }>('natures', 'id,label,model_code,group_label,ref_key', 'id'),
    selectAll<{ nature_id: number; lot_code: number }>('nature_lots', 'nature_id,lot_code'),
    selectAll<{ nature_id: number; risk_code: string }>('nature_risks', 'nature_id,risk_code'),
    selectAll<{ term: string; equivalents: string[] }>('vocabulary', 'term,equivalents', 'term'),
    selectAll<{ code: string; type: string; object: string; finding: string; proposal: string; status: string }>('alerts', 'code,type,object,finding,proposal,status', 'code'),
    selectAll<{ label: string }>('referentiel_versions', 'label', 'created_at'),
  ])

  const rulesBy = new Map<string, string[]>()
  ruleRows.forEach((r) => rulesBy.set(r.measure_code, [...(rulesBy.get(r.measure_code) ?? []), r.risk_code]))
  const lotsBy = new Map<number, number[]>()
  const risksBy = new Map<number, string[]>()
  natureLots.forEach((x) => lotsBy.set(x.nature_id, [...(lotsBy.get(x.nature_id) ?? []), x.lot_code]))
  natureRisks.forEach((x) => risksBy.set(x.nature_id, [...(risksBy.get(x.nature_id) ?? []), x.risk_code]))

  return {
    version: versions.length ? versions[versions.length - 1].label : 'Export',
    lots,
    risks,
    measures: measures.map((m) => ({
      code: m.code, label: m.label, family: m.family, rule_type: m.rule_type, risks: rulesBy.get(m.code) ?? [],
    })),
    lot_risks: lotRisks.map((x) => ({ lot: x.lot_code, risk: x.risk_code, is_default: x.is_default })),
    natures: natures.map((n) => ({
      label: n.label, model_code: n.model_code, group_label: n.group_label, ref_key: n.ref_key,
      lots: lotsBy.get(n.id) ?? [], extra_risks: risksBy.get(n.id) ?? [],
    })),
    vocabulary,
    alerts,
  } as ReferentielSeed
}

/** Vérifie la forme d'un fichier de référentiel avant chargement. */
export function checkReferentielFile(data: unknown): ReferentielSeed {
  const d = data as Record<string, unknown>
  const need = ['lots', 'risks', 'measures', 'lot_risks', 'natures', 'vocabulary', 'alerts']
  const missing = need.filter((k) => !Array.isArray(d?.[k]))
  if (missing.length) throw new Error(`Fichier de référentiel incomplet : ${missing.join(', ')} manquant(s).`)
  return data as ReferentielSeed
}

export function downloadJson(name: string, obj: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

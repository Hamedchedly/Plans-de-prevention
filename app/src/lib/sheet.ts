import JSZip from 'jszip'
import { supabase } from './supabase'
import type { Referentiel } from './refdata'
import { computeMeasures, proposeRisks } from './rules'
import { buildPlanPdf, brandLogo, planFileName, DOTTED_PERIOD, type PlanPdfData } from './planPdf'
import { defaultPeriod, fmtFr } from './period'
import type { OrderRow } from './types'

/**
 * Fiche de prévention : données partagées par l'assistant de création, l'aperçu,
 * la modification et le téléchargement. Une seule règle de construction du PDF et de sauvegarde.
 */
export interface Period { start: string; end: string }
export interface Line {
  orderNumber: string
  natureId: number | null
  lots: number[]
  risks: string[]          // risques cochés
  measures: string[]       // mesures cochées
  companyFills: boolean    // date d'intervention à renseigner par l'entreprise
  period: Period
}
export interface Redactor { name: string; email: string; phone: string }
type ProfileLike = { first_name?: string | null; last_name?: string | null; full_name?: string | null; contact_email?: string | null; email?: string | null; phone?: string | null }

export const unique = <T,>(xs: T[]) => [...new Set(xs)]
export { planFileName }

export function redactorOf(profile: ProfileLike | null | undefined): Redactor | null {
  if (!profile) return null
  return {
    name: [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.full_name || '',
    email: profile.contact_email || profile.email || '',
    phone: profile.phone || '',
  }
}

export const identityIncomplete = (profile: ProfileLike | null | undefined) =>
  !profile || !profile.first_name?.trim() || !profile.last_name?.trim() || !profile.phone?.trim() || !(profile.contact_email?.trim() || profile.email?.trim())

/** Risques proposés pour une nature et des lots, et mesures qui en découlent (mêmes règles que l'éditeur). */
export function derive(ref: Referentiel, natureId: number | null, lots: number[], previousMeasures: string[] = []) {
  const nature = natureId != null ? ref.natures.find((n) => n.id === natureId) : undefined
  const proposal = proposeRisks(ref.lotDefaults, lots, nature ? [nature] : [])
  const risks = [...proposal.keys()]
  return { risks, proposal, measures: measuresFor(ref, risks, previousMeasures) }
}

/** Mesures : calculées à partir des risques cochés, plus les mesures manuelles déjà cochées. */
export function measuresFor(ref: Referentiel, risks: string[], previous: string[]) {
  const computed = computeMeasures(new Set(risks), ref.rules)
  const manual = previous.filter((c) => ref.rules.find((r) => r.code === c)?.ruleType === 'MANUAL')
  return unique([...computed, ...manual])
}

export const periodLabel = (l: Line) =>
  l.companyFills ? 'À renseigner par l’entreprise' : `${fmtFr(l.period.start)} au ${fmtFr(l.period.end)}`

/** Données du PDF pour une fiche. */
export function sheetPdfInput(l: Line, o: OrderRow, ref: Referentiel, companyName: string, redactor: Redactor | null): PlanPdfData {
  const n = l.natureId != null ? ref.natures.find((x) => x.id === l.natureId) : undefined
  return {
    orderNumber: o.order_number,
    orderDate: o.order_date ? fmtFr(o.order_date) : '',
    lotNames: l.lots.map((c) => ref.lotNameByCode.get(c) ?? `Lot ${c}`),
    taskLabel: n?.label ?? o.nature_text ?? '',
    activity: o.nature_text ?? o.description ?? '',
    zone: [o.address, o.city, o.tranche_name].filter(Boolean).join(' · '),
    period: l.companyFills ? DOTTED_PERIOD : `du ${periodLabel(l)}`,
    companyLabel: companyName,
    riskOptions: [...ref.riskLabel.entries()].map(([code, label]) => ({ label, checked: l.risks.includes(code) })),
    measureOptions: ref.measures.map((m) => ({ family: m.family || 'Autres', label: m.label, checked: l.measures.includes(m.code) })),
    redactor,
  }
}

/** Fiche enregistrée relue depuis la base (pour prévisualiser ou modifier). */
export async function fetchSavedLines(orders: OrderRow[], ref: Referentiel): Promise<Map<string, Line>> {
  const numbers = orders.map((o) => o.order_number)
  const out = new Map<string, Line>()
  if (!numbers.length) return out
  const [lotsR, risksR, measuresR] = await Promise.all([
    supabase.from('order_lots').select('order_number,lot_code').in('order_number', numbers),
    supabase.from('order_risks').select('order_number,risk_code,checked').in('order_number', numbers),
    supabase.from('order_measures').select('order_number,measure_code,checked').in('order_number', numbers),
  ])
  for (const r of [lotsR, risksR, measuresR]) if (r.error) throw new Error(r.error.message)
  for (const o of orders) {
    const lots = (lotsR.data ?? []).filter((x) => x.order_number === o.order_number).map((x) => x.lot_code as number)
    const risks = (risksR.data ?? []).filter((x) => x.order_number === o.order_number && x.checked).map((x) => x.risk_code as string)
    const measures = (measuresR.data ?? []).filter((x) => x.order_number === o.order_number && x.checked).map((x) => x.measure_code as string)
    const natureId = o.nature_id ?? (o.nature_proposal_id ? -o.nature_proposal_id : null)
    out.set(o.order_number, {
      orderNumber: o.order_number,
      natureId,
      lots,
      risks,
      measures,
      companyFills: !o.period_start || !o.period_end,
      period: defaultPeriod(o.order_date, o.period_start, o.period_end),
    })
  }
  return out
}

/** Enregistre les fiches (nature, lots, risques, mesures, période). La commande passe à « Fiche créée ». */
export async function savePlans(lines: Line[], byNumber: Map<string, OrderRow>, ref: Referentiel): Promise<string[]> {
  const failures: string[] = []
  for (const l of lines) {
    const o = byNumber.get(l.orderNumber)
    if (!o) continue
    try {
      const n = l.natureId != null ? ref.natures.find((x) => x.id === l.natureId) : undefined
      const proposal = derive(ref, l.natureId, l.lots).proposal
      const computed = new Set(computeMeasures(new Set(l.risks), ref.rules))
      const { error } = await supabase.rpc('save_plan', {
        p_order: o.order_number,
        p_nature_id: n && !n.pending ? n.id : null,
        p_proposal_id: n?.pending ? n.proposalId ?? null : null,
        p_lots: l.lots.map((code) => ({
          code, source: n?.lots.includes(code) ? 'NATURE' : 'AUTO_ANALYSIS', confidence: null,
        })),
        p_risks: l.risks.map((code) => ({ code, checked: true, origin: proposal.get(code) ?? 'MANUEL' })),
        p_measures: l.measures.map((code) => ({ code, checked: true, origin: computed.has(code) ? 'AUTO' : 'MANUEL' })),
      })
      if (error) throw new Error(error.message)
      const { error: pErr } = await supabase.rpc('set_plan_period', {
        p_order: o.order_number,
        p_start: l.companyFills ? null : l.period.start,
        p_end: l.companyFills ? null : l.period.end,
      })
      if (pErr) throw new Error(pErr.message)
    } catch (e) {
      failures.push(`${l.orderNumber} : ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return failures
}

export async function buildSheetPdf(l: Line, o: OrderRow, ref: Referentiel, companyName: string, redactor: Redactor | null): Promise<Uint8Array> {
  return buildPlanPdf(sheetPdfInput(l, o, ref, companyName, redactor), await brandLogo())
}

/** Tous les PDF d'une sélection, regroupés dans un ZIP nommé selon le modèle défini par le Super Admin. */
export async function buildSheetsZip(
  lines: Line[], byNumber: Map<string, OrderRow>, ref: Referentiel, companyNameOf: (isis: string | null) => string,
  redactor: Redactor | null, template: string, onProgress?: (msg: string) => void,
): Promise<{ blob: Blob; count: number; failures: string[] }> {
  const zip = new JSZip()
  const used = new Map<string, number>()
  const failures: string[] = []
  let count = 0
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const o = byNumber.get(l.orderNumber)
    if (!o) continue
    onProgress?.(`Fiche ${i + 1} / ${lines.length} : ${l.orderNumber}`)
    try {
      const company = companyNameOf(o.isis_code) || o.order_number
      const base = planFileName(template, { entreprise: company, commande: o.order_number, secteur: o.sector_code ?? '' })
      const c = used.get(base) ?? 0
      used.set(base, c + 1)
      const name = c ? base.replace(/\.pdf$/, ` (${c + 1}).pdf`) : base
      zip.file(name, await buildSheetPdf(l, o, ref, companyNameOf(o.isis_code), redactor))
      count++
    } catch (e) {
      failures.push(`${l.orderNumber} : ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  return { blob, count, failures }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function openPdf(bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

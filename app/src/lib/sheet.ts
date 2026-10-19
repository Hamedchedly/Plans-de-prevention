import JSZip from 'jszip'
import { supabase } from './supabase'
import type { Referentiel } from './refdata'
import { computeMeasures, proposeRisks } from './rules'
import { buildPlanPdf, brandLogo, planFileName, DOTTED_PERIOD, type PlanHistory, type PlanPdfData } from './planPdf'
import { defaultPeriod, fmtFr } from './period'
import type { OrderRow } from './types'

/**
 * Fiche de prévention : données partagées par l'assistant de création, l'aperçu,
 * la modification et le téléchargement. Une seule règle de construction du PDF et de sauvegarde.
 */
export interface Period { start: string; end: string }
export interface Line {
  orderNumber: string
  natureId: number | null      // nature principale (retenue)
  extraNatures: number[]       // autres natures activées pour la fiche
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

/** Toutes les natures d'une fiche, la retenue en premier. */
export const natureIdsOf = (l: Pick<Line, 'natureId' | 'extraNatures'>): number[] =>
  [...new Set([...(l.natureId != null ? [l.natureId] : []), ...l.extraNatures])]

/** Risques proposés pour des natures et des lots, et mesures qui en découlent (mêmes règles que l'éditeur). */
export function derive(ref: Referentiel, natureIds: number[], lots: number[], previousMeasures: string[] = []) {
  const natures = natureIds.map((id) => ref.natures.find((n) => n.id === id)).filter((n): n is NonNullable<typeof n> => !!n)
  const proposal = proposeRisks(ref.lotDefaults, lots, natures)
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
  const labels = natureIdsOf(l).map((id) => ref.natures.find((x) => x.id === id)?.label).filter((x): x is string => !!x)
  return {
    orderNumber: o.order_number,
    orderDate: o.order_date ? fmtFr(o.order_date) : '',
    lotNames: l.lots.map((c) => ref.lotNameByCode.get(c) ?? `Lot ${c}`),
    taskLabel: labels.join(' ; ') || o.nature_text || '',
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
export async function fetchSavedLines(orders: OrderRow[]): Promise<Map<string, Line>> {
  const numbers = orders.map((o) => o.order_number)
  const out = new Map<string, Line>()
  if (!numbers.length) return out
  const [lotsR, risksR, measuresR] = await Promise.all([
    supabase.from('order_lots').select('order_number,lot_code').in('order_number', numbers),
    supabase.from('order_risks').select('order_number,risk_code,checked').in('order_number', numbers),
    supabase.from('order_measures').select('order_number,measure_code,checked').in('order_number', numbers),
  ])
  // Table des natures multiples (hors types générés) : lecture typée à la main
  const naturesR = await supabase.from('order_natures').select('order_number,nature_id').in('order_number', numbers) as
    unknown as { data: { order_number: string; nature_id: number }[] | null; error: { message: string } | null }
  for (const r of [lotsR, risksR, measuresR, naturesR]) if (r.error) throw new Error(r.error.message)
  for (const o of orders) {
    const lots = (lotsR.data ?? []).filter((x) => x.order_number === o.order_number).map((x) => x.lot_code as number)
    const risks = (risksR.data ?? []).filter((x) => x.order_number === o.order_number && x.checked).map((x) => x.risk_code as string)
    const measures = (measuresR.data ?? []).filter((x) => x.order_number === o.order_number && x.checked).map((x) => x.measure_code as string)
    const natureId = o.nature_id ?? (o.nature_proposal_id ? -o.nature_proposal_id : null)
    const extraNatures = (naturesR.data ?? [])
      .filter((x) => x.order_number === o.order_number && x.nature_id !== natureId)
      .map((x) => x.nature_id as number)
    out.set(o.order_number, {
      orderNumber: o.order_number,
      natureId,
      extraNatures,
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
      const proposal = derive(ref, natureIdsOf(l), l.lots).proposal
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
      const saved = natureIdsOf(l).filter((id) => id > 0)
      const { error: nErr } = await supabase.rpc('save_plan_natures', { p_order: o.order_number, p_natures: saved })
      if (nErr) throw new Error(nErr.message)
    } catch (e) {
      failures.push(`${l.orderNumber} : ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return failures
}

export interface Contact extends Redactor { isActive: boolean; complete: boolean }

/** Contacts des chargés (personne à alerter) pour une liste de codes opérateurs. */
export async function fetchContacts(codes: string[]): Promise<Map<string, Contact>> {
  const out = new Map<string, Contact>()
  const list = unique(codes.filter(Boolean))
  if (!list.length) return out
  const { data, error } = await supabase.rpc('operator_contacts', { p_codes: list })
  if (error) throw new Error(error.message)
  for (const r of (data ?? []) as { operator_code: string; full_name: string | null; phone: string | null; email: string | null; is_active: boolean; complete: boolean }[]) {
    out.set(r.operator_code, { name: r.full_name ?? '', phone: r.phone ?? '', email: r.email ?? '', isActive: r.is_active, complete: r.complete })
  }
  return out
}

/** Personne à alerter d'une commande : le chargé qui l'a créée. */
export function contactFor(contacts: Map<string, Contact>, o: OrderRow): Redactor | null {
  const c = o.operator_code ? contacts.get(o.operator_code) : undefined
  return c ? { name: c.name, email: c.email, phone: c.phone } : null
}

/** Paramètres administrables, relus au plus toutes les 30 secondes. */
let settingsCache: { at: number; values: Record<string, string> } | null = null
export async function readSettings(): Promise<Record<string, string>> {
  if (settingsCache && Date.now() - settingsCache.at < 30000) return settingsCache.values
  const keys = ['pdf_procedure_alerte', 'pdf_pied_de_page', 'mail_objet', 'mail_corps']
  const values: Record<string, string> = {}
  await Promise.all(keys.map(async (k) => {
    const { data } = await supabase.rpc('app_setting_get', { p_key: k })
    if (typeof data === 'string' && data.trim()) values[k] = data
  }))
  settingsCache = { at: Date.now(), values }
  return values
}

export const DEFAULT_MAIL_OBJET = 'Plan de prévention – commande {commande} – {entreprise}'
export const DEFAULT_MAIL_CORPS = 'Bonjour,\n\nVeuillez trouver ci-joint le plan de prévention relatif à la commande {commande} ({nature}).\nPériode d’intervention : {periode}.\n\nMerci de nous le retourner signé.\n\nCordialement,\n{redacteur}'

/** Remplace {variable} par sa valeur (variables inconnues vidées). */
export const fillTemplate = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? '')

export async function buildSheetPdf(l: Line, o: OrderRow, ref: Referentiel, companyName: string, redactor: Redactor | null): Promise<Uint8Array> {
  const [logo, st, hist] = await Promise.all([brandLogo(), readSettings(), fetchPlanHistory(o.order_number)])
  return buildPlanPdf({
    ...sheetPdfInput(l, o, ref, companyName, redactor),
    history: hist ?? undefined,
    alertLine: st.pdf_procedure_alerte,
    footer: st.pdf_pied_de_page,
  }, logo)
}

/** Dates de la fiche (création, envoi, relances, retour) ; null si indisponibles (le PDF reste produit sans l'historique). */
export async function fetchPlanHistory(orderNumber: string): Promise<PlanHistory | null> {
  const { data, error } = await supabase.rpc('plan_history', { p_orders: [orderNumber] })
  if (error) return null
  const r = ((data ?? []) as { created_at: string | null; sent_at: string | null; relances: string[] | null; returned_at: string | null }[])[0]
  if (!r) return null
  return { created: r.created_at, sent: r.sent_at, relances: r.relances ?? [], returned: r.returned_at }
}

/** Tous les PDF d'une sélection, regroupés dans un ZIP nommé selon le modèle défini par le Super Admin. */
export async function buildSheetsZip(
  lines: Line[], byNumber: Map<string, OrderRow>, ref: Referentiel, companyNameOf: (isis: string | null) => string,
  contactOf: (o: OrderRow) => Redactor | null, template: string, onProgress?: (msg: string) => void,
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
      zip.file(name, await buildSheetPdf(l, o, ref, companyNameOf(o.isis_code), contactOf(o)))
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

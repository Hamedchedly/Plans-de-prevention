import { fold, searchNatures, tokens, type NatureRef, type SearchHit } from './rules'
import type { Referentiel } from './refdata'
import type { OrderRow } from './types'
import { supabase } from './supabase'

/**
 * Logique unique de proposition de nature, utilisée partout (liste, création de fiche, éditeur) :
 * - une nature n'est pré-sélectionnée que si son score atteint SUGGEST_MIN_SCORE ;
 * - sinon, les meilleures propositions sont affichées et c'est l'utilisateur qui choisit ;
 * - le libellé de nature est analysé en premier, la description seulement en repli.
 */
export const SUGGEST_MIN_SCORE = 0.5

export interface OrderSuggestion {
  nature: string | null        // libellé de la nature retenue ou proposée
  natureId: number | null
  group: string | null
  lots: number[]               // lots de la commande (export), plusieurs possibles
  lot: number | null           // premier lot (compatibilité)
  lotName: string | null       // libellés des lots, séparés par « · »
  lotStatus: LotStatus         // OK = identifié ; sinon à confirmer
  lotReason: string            // explication affichée au clic sur la pastille
  confident: boolean           // vrai si la nature est affectée ou atteint le seuil
  candidates: NatureRef[]      // propositions à choisir quand la correspondance est faible
}

type OrderText = Pick<OrderRow, 'nature_text' | 'description' | 'nature_id' | 'naac_code'>

/** Corps d'état possibles d'une commande, d'après son code NAAC (fichier d'export), avec le lot de chacun. Vide si inconnu. */
export function poolLotsOf(naacCode: string | null | undefined, ref: Referentiel): Map<number, { validated: boolean; labels: string[] }> {
  const out = new Map<number, { validated: boolean; labels: string[] }>()
  if (!naacCode) return out
  for (const c of ref.naacCorps) {
    if (c.naac !== naacCode || c.lotCode == null) continue
    const e = out.get(c.lotCode) ?? { validated: false, labels: [] }
    e.validated = e.validated || c.validated
    e.labels.push(c.corpsLabel)
    out.set(c.lotCode, e)
  }
  return out
}

export type LotStatus = 'OK' | 'NATURE' | 'NO_EXPORT' | 'UNKNOWN'

/**
 * Lots d'une commande, d'après les corps d'état de son code NAAC (fichier d'export) : tous les corps d'état dont le
 * libellé ou le lot correspond aux mots de la commande (une commande peut toucher plusieurs lots).
 * Sans correspondance, on retient les lots de la nature présents dans les corps d'état, ou aucun lot.
 */
export function lotsOfOrder(order: OrderText, ref: Referentiel, nature?: NatureRef): { lots: number[]; status: LotStatus; reason: string } {
  const pool = poolLotsOf(order.naac_code, ref)
  const natureLots = nature?.lots ?? []
  const names = (ls: number[]) => ls.map((l) => ref.lotNameByCode.get(l) ?? `Lot ${l}`).join(' · ')
  if (!pool.size) {
    return natureLots.length
      ? { lots: natureLots, status: 'NO_EXPORT', reason: 'Pas de code corps d’état (NAAC) dans l’export : lot déduit de la nature, à confirmer.' }
      : { lots: [], status: 'UNKNOWN', reason: 'Pas de code corps d’état dans l’export et pas de nature : lot à choisir.' }
  }
  const text = fold(`${order.nature_text ?? ''} ${order.description ?? ''}`)
  const words = [...new Set(tokens(text))].filter((w) => w.length >= 4)
  // Termes du métier (table lot_terms) : mot ou expression entière dans le texte
  const padded = ` ${text.replace(/[^a-z0-9]+/g, ' ').trim()} `
  const termLots = new Set((ref.lotTerms ?? []).filter((t) => padded.includes(` ${fold(t.term)} `)).map((t) => t.lotCode))
  const matched = [...pool.keys()].filter((lot) => {
    if (termLots.has(lot)) return true
    const hay = fold([ref.lotNameByCode.get(lot) ?? '', ...(pool.get(lot)?.labels ?? [])].join(' '))
    return words.some((w) => hay.includes(w))
  }).sort((a, b) => a - b)
  if (matched.length) return { lots: matched, status: 'OK', reason: `Lot d’après le corps d’état de l’export : ${names(matched)}.` }
  const inPool = natureLots.filter((l) => pool.has(l))
  if (inPool.length) return { lots: inPool, status: 'NATURE', reason: 'Lot déduit de la nature : aucun corps d’état de l’export ne correspond au texte de la commande.' }
  return { lots: [], status: 'UNKNOWN', reason: `Aucun corps d’état de l’export (code ${order.naac_code ?? '—'}) ne correspond au texte de la commande : lot à choisir.` }
}

/** Meilleures natures pour une commande, classées par score. */
export function natureCandidates(order: OrderText, ref: Referentiel, limit = 3): SearchHit[] {
  const primary = (order.nature_text ?? '').trim()
  const fallback = (order.description ?? '').trim()
  const a = primary ? searchNatures(primary, ref.natures, ref.vocab, ref.lotNameByCode, limit) : []
  if (a[0] && a[0].score >= SUGGEST_MIN_SCORE) return a
  const b = fallback ? searchNatures(fallback, ref.natures, ref.vocab, ref.lotNameByCode, limit) : []
  const seen = new Set<number>()
  return [...a, ...b]
    .sort((x, y) => y.score - x.score)
    .filter((h) => (seen.has(h.nature.id) ? false : (seen.add(h.nature.id), true)))
    .slice(0, limit)
}

/** Clé d'un libellé source pour la mémoire des choix (identique côté base : minuscules, espaces simplifiés). */
export const choiceKey = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Mémoire des choix : libellé source → nature retenue la dernière fois. */
export async function loadNatureChoices(): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const { data, error } = await supabase.from('nature_choices').select('label_key,nature_id')
  if (error) return out
  for (const r of (data ?? []) as { label_key: string; nature_id: number }[]) out.set(r.label_key, r.nature_id)
  return out
}

/** Préférences de lots par nature, apprises des décisions : clé `nature:lot` → true (gardé) / false (retiré). */
export type LotPrefs = Map<string, boolean>
export const lotPrefKey = (nature: number, lot: number) => `${nature}:${lot}`

export async function loadNatureLotPreferences(): Promise<LotPrefs> {
  const out: LotPrefs = new Map()
  const { data, error } = await supabase.from('nature_lot_preferences').select('nature_id,lot_code,keep')
  if (error) return out
  for (const r of (data ?? []) as { nature_id: number; lot_code: number; keep: boolean }[]) out.set(lotPrefKey(r.nature_id, r.lot_code), r.keep)
  return out
}

export function recordNatureLotPreference(natureId: number, lot: number, keep: boolean) {
  void supabase.rpc('record_nature_lot_preference', { p_nature_id: natureId, p_lot_code: lot, p_keep: keep })
}

/** Lots ajoutés automatiquement avec une nature : ceux que le chargé a retirés ne le sont plus. Le référentiel n'est pas modifié. */
export function autoLotsOf(nature: { id: number; lots: number[] } | undefined, prefs: LotPrefs): number[] {
  if (!nature) return []
  return nature.lots.filter((lot) => prefs.get(lotPrefKey(nature.id, lot)) !== false)
}

/**
 * Lots proposés pour une fiche : le lot identifié par le corps d'état de l'export s'il existe (et n'a pas été retiré
 * par le chargé pour cette nature) ; sinon les lots de la nature qui figurent dans les corps d'état de la commande.
 * Sans information d'export, on garde les lots de la nature.
 */
export function lotsForFiche(order: OrderText | undefined, ref: Referentiel, nature: NatureRef | undefined, prefs: LotPrefs): number[] {
  const natureLots = autoLotsOf(nature, prefs)
  if (!order) return natureLots
  const r = lotsOfOrder(order, ref, nature)
  if (r.status === 'NO_EXPORT') return natureLots
  return r.lots.filter((l) => !(nature && prefs.get(lotPrefKey(nature.id, l)) === false))
}

/** Suggestion complète pour une commande (nature affectée, puis choix mémorisé pour ce libellé, puis analyse). */
export function buildSuggestion(order: OrderText, ref: Referentiel, learned?: Map<string, number>): OrderSuggestion {
  const toOut = (n: NatureRef | undefined, confident: boolean, candidates: NatureRef[]): OrderSuggestion => {
    const r = lotsOfOrder(order, ref, n)
    return {
      nature: n?.label ?? null,
      natureId: n?.id ?? null,
      group: n?.groupLabel ?? null,
      lots: r.lots,
      lot: r.lots[0] ?? null,
      lotName: r.lots.length ? r.lots.map((l) => ref.lotNameByCode.get(l) ?? `Lot ${l}`).join(' · ') : null,
      lotStatus: r.status,
      lotReason: r.reason,
      confident,
      candidates,
    }
  }
  if (order.nature_id != null) {
    const assigned = ref.natures.find((n) => n.id === order.nature_id)
    if (assigned) return toOut(assigned, true, [])
  }
  const hits = natureCandidates(order, ref, 3)
  const learnedId = learned?.get(choiceKey(order.nature_text))
  const learnedNature = learnedId != null ? ref.natures.find((n) => n.id === learnedId) : undefined
  if (learnedNature) {
    const others = hits.map((h) => h.nature).filter((n) => n.id !== learnedNature.id)
    return toOut(learnedNature, true, [learnedNature, ...others].slice(0, 3))
  }
  const top = hits[0]
  const confident = !!top && top.score >= SUGGEST_MIN_SCORE
  return toOut(top?.nature, confident, hits.map((h) => h.nature))
}

/** Nature pré-sélectionnée à l'ouverture d'une fiche : uniquement si la suggestion est fiable. */
export function autoNature(order: OrderText, ref: Referentiel, learned?: Map<string, number>): NatureRef | null {
  const s = buildSuggestion(order, ref, learned)
  return s.confident && s.natureId != null ? ref.natures.find((n) => n.id === s.natureId) ?? null : null
}

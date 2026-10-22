import { searchNatures, type NatureRef, type SearchHit } from './rules'
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
  lot: number | null
  lotName: string | null
  confident: boolean           // vrai si la nature est affectée ou atteint le seuil
  candidates: NatureRef[]      // propositions à choisir quand la correspondance est faible
}

type OrderText = Pick<OrderRow, 'nature_text' | 'description' | 'nature_id'>

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

/** Suggestion complète pour une commande (nature affectée, puis choix mémorisé pour ce libellé, puis analyse). */
export function buildSuggestion(order: OrderText, ref: Referentiel, learned?: Map<string, number>): OrderSuggestion {
  const toOut = (n: NatureRef | undefined, confident: boolean, candidates: NatureRef[]): OrderSuggestion => {
    const lot = n?.lots[0] ?? null
    return {
      nature: n?.label ?? null,
      natureId: n?.id ?? null,
      group: n?.groupLabel ?? null,
      lot,
      lotName: lot != null ? ref.lotNameByCode.get(lot) ?? null : null,
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

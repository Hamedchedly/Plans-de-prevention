import { supabase } from './supabase'

export interface MatchedOrder {
  order_number: string
  order_date: string
  operator_code: string | null
  sector_code: string | null
  trashed_at: string | null
  kpi_excluded: boolean
}

export type OrderState = 'toutes' | 'actives' | 'corbeille' | 'archivees'
export interface OrderFilter { sectors: string[]; operators: string[]; from: string; to: string; state: OrderState }

const PAGE = 1000
/** Plafond de sécurité pour une sélection (au-delà, l'utilisateur doit affiner ses filtres). */
export const MAX_MATCHES = 5000

/** Commandes correspondant aux filtres, toutes pages confondues (plafonnées à MAX_MATCHES). */
export async function fetchMatchingOrders(f: OrderFilter): Promise<{ rows: MatchedOrder[]; truncated: boolean }> {
  const out: MatchedOrder[] = []
  for (let from = 0; from < MAX_MATCHES; from += PAGE) {
    let q = supabase.from('orders').select('order_number,order_date,operator_code,sector_code,trashed_at,kpi_excluded')
    if (f.sectors.length) q = q.in('sector_code', f.sectors)
    if (f.operators.length) q = q.in('operator_code', f.operators)
    if (f.from) q = q.gte('order_date', f.from)
    if (f.to) q = q.lte('order_date', f.to)
    if (f.state === 'actives') q = q.is('trashed_at', null).eq('kpi_excluded', false)
    if (f.state === 'corbeille') q = q.not('trashed_at', 'is', null)
    if (f.state === 'archivees') q = q.eq('kpi_excluded', true)
    const { data, error } = await q.order('order_number').range(from, from + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as MatchedOrder[]
    out.push(...rows)
    if (rows.length < PAGE) return { rows: out, truncated: false }
  }
  return { rows: out, truncated: true }
}

/** Secteurs présents dans les commandes, pour le filtre. */
export async function fetchSectorCodes(): Promise<string[]> {
  const found = new Set<string>()
  for (let from = 0; from < MAX_MATCHES; from += PAGE) {
    const { data, error } = await supabase.from('orders').select('sector_code')
      .not('sector_code', 'is', null).order('sector_code').range(from, from + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as { sector_code: string }[]
    rows.forEach((r) => found.add(r.sector_code))
    if (rows.length < PAGE) break
  }
  return [...found].sort()
}

import { supabase } from './supabase'
import { fetchMatchingOrders, type MatchedOrder } from './ordersBulk'

export interface TrashedCompany { isis_code: string; name: string | null; trashed_at: string; purged_at: string | null }
export interface TrashCandidate { isis_code: string; name: string | null; orders_total: number }

/** Commandes en corbeille (purgées ou non). */
export async function fetchTrashedOrders(): Promise<MatchedOrder[]> {
  const res = await fetchMatchingOrders({ sectors: [], operators: [], from: '', to: '', state: 'corbeille' })
  return res.rows
}

export async function fetchTrashedCompanies(): Promise<TrashedCompany[]> {
  const { data, error } = await supabase.from('companies')
    .select('isis_code,name,trashed_at,purged_at').not('trashed_at', 'is', null).order('name')
  if (error) throw error
  return (data ?? []) as TrashedCompany[]
}

/** Entreprises sans aucune commande active : candidates à la corbeille. */
export async function fetchTrashCandidates(): Promise<TrashCandidate[]> {
  const { data, error } = await supabase.rpc('company_trash_candidates')
  if (error) throw error
  return (data ?? []) as TrashCandidate[]
}

async function count(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<number> {
  const { data, error } = await p
  if (error) throw error
  return Number(data)
}

export const restoreOrders = (numbers: string[]) => count(supabase.rpc('restore_trashed_orders', { p_orders: numbers }))
export const purgeOrders = (numbers: string[]) => count(supabase.rpc('purge_orders', { p_orders: numbers }))
export const trashCompanies = (isis: string[]) => count(supabase.rpc('set_companies_trashed', { p_isis: isis, p_trashed: true }))
export const restoreCompanies = (isis: string[]) => count(supabase.rpc('set_companies_trashed', { p_isis: isis, p_trashed: false }))
export const purgeCompanies = (isis: string[]) => count(supabase.rpc('purge_companies', { p_isis: isis }))

/** Télécharge une sauvegarde CSV (séparateur « ; », compatible Excel français). */
export function downloadCsv(filename: string, rows: Record<string, string | number | boolean | null>[]): void {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0])
  const esc = (v: string | number | boolean | null) => {
    const s = v === null ? '' : String(v)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const body = [headers.join(';'), ...rows.map((r) => headers.map((h) => esc(r[h])).join(';'))].join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

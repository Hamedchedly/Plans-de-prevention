import { supabase } from './supabase'

/** Années couvertes par les commandes, de la plus récente à la plus ancienne (l'année en cours incluse). */
export async function fetchOrderYears(): Promise<number[]> {
  const [first, last] = await Promise.all([
    supabase.from('orders').select('order_date').not('order_date', 'is', null).order('order_date', { ascending: true }).limit(1),
    supabase.from('orders').select('order_date').not('order_date', 'is', null).order('order_date', { ascending: false }).limit(1),
  ])
  if (first.error) throw first.error
  if (last.error) throw last.error
  return yearsBetween([first.data?.[0]?.order_date, last.data?.[0]?.order_date])
}

/** Années entre la plus ancienne et la plus récente date, année en cours incluse. */
export function yearsBetween(dates: (string | null | undefined)[]): number[] {
  const ys = dates.filter((d): d is string => Boolean(d)).map((d) => Number(d.slice(0, 4)))
  if (ys.length === 0) return []
  const lo = Math.min(...ys)
  const hi = Math.max(...ys, new Date().getFullYear())
  const out: number[] = []
  for (let y = hi; y >= lo; y--) out.push(y)
  return out
}

/** Année d'une date au format AAAA-MM-JJ, ou null. */
export const yearOfIso = (iso: string | null | undefined): number | null => (iso ? Number(iso.slice(0, 4)) : null)

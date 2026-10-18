// Période d'intervention d'une fiche : par défaut du jour de la commande à deux mois plus tard, modifiable.

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function defaultPeriod(orderDate: string | null, start?: string | null, end?: string | null): { start: string; end: string } {
  const s = start ?? orderDate ?? iso(new Date())
  if (end) return { start: s, end }
  const d = new Date(`${s}T00:00:00`)
  d.setMonth(d.getMonth() + 2)
  return { start: s, end: iso(d) }
}

/** Format français : 18/10/2026 */
export function fmtFr(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

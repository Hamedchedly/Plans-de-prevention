// Arbre des lots : groupes hiérarchiques pour la lecture (ordre et indentation). Les codes restent ceux du référentiel.
export const LOT_GROUPS: { label: string; lots: number[] }[] = [
  { label: 'Fermetures', lots: [11, 10, 12] },
  { label: 'Espaces extérieurs', lots: [20, 21] },
  { label: 'Enveloppe du bâtiment', lots: [5, 6, 7, 4, 9] },
  { label: 'Structure et gros œuvre', lots: [1, 2, 3, 8] },
  { label: 'Second œuvre', lots: [13, 14] },
  { label: 'Techniques', lots: [15, 16, 17, 18, 19] },
]

/** Ordre hiérarchique : groupe, puis lots du groupe ; les lots absents de l'arbre sont ajoutés à la fin. */
export function orderLots<T extends { code: number }>(lots: T[]): { group: string; lot: T; indent: boolean }[] {
  const byCode = new Map(lots.map((l) => [l.code, l]))
  const out: { group: string; lot: T; indent: boolean }[] = []
  const used = new Set<number>()
  for (const g of LOT_GROUPS) {
    g.lots.forEach((code, i) => {
      const lot = byCode.get(code)
      if (lot) { out.push({ group: g.label, lot, indent: i > 0 }); used.add(code) }
    })
  }
  for (const lot of lots) if (!used.has(lot.code)) out.push({ group: 'Autres', lot, indent: false })
  return out
}

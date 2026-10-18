// Arbre de lecture : famille NAAC (GT, GE, CP) > corps d'état > lot > natures.
// Les codes de famille sont ceux du référentiel. Un lot peut apparaître sous plusieurs corps d'état :
// l'arbre sert à parcourir, la sélection reste unique par lot.

export interface TreeLot { code: number; name: string }
export interface TreeCorps { naac: string; label: string; lot: TreeLot | null }
export interface TreeFamily { naac: string; corps: TreeCorps[] }
export interface LotTree { families: TreeFamily[]; otherLots: TreeLot[] }

const FAMILY_ORDER = ['GT', 'GE', 'CP']

function familyRank(naac: string): number {
  const i = FAMILY_ORDER.indexOf(naac)
  return i === -1 ? 99 : i
}

/** Lettre du préfixe « (a) … » : ordre alphabétique des corps d'état. */
function corpsKey(label: string): string {
  return (label.match(/^\(([a-z])\)/i)?.[1] ?? '~').toLowerCase() + label
}

export function buildLotTree(
  naacCorps: { naac: string; corpsLabel: string; lotCode: number | null }[],
  lots: TreeLot[],
): LotTree {
  const byCode = new Map(lots.map((l) => [l.code, l]))
  const byFamily = new Map<string, TreeCorps[]>()
  const attached = new Set<number>()
  for (const c of naacCorps) {
    const lot = c.lotCode != null ? byCode.get(c.lotCode) ?? null : null
    if (lot) attached.add(lot.code)
    byFamily.set(c.naac, [...(byFamily.get(c.naac) ?? []), { naac: c.naac, label: c.corpsLabel, lot }])
  }
  const families: TreeFamily[] = [...byFamily.entries()]
    .sort(([a], [b]) => familyRank(a) - familyRank(b) || a.localeCompare(b))
    .map(([naac, corps]) => ({
      naac,
      corps: corps.sort((x, y) => corpsKey(x.label).localeCompare(corpsKey(y.label))),
    }))
  const otherLots = lots.filter((l) => !attached.has(l.code))
  return { families, otherLots }
}

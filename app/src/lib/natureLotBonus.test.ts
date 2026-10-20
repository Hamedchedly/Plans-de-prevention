import { describe, expect, it } from 'vitest'
import { searchNatures, type NatureRef } from './rules'
import { SUGGEST_MIN_SCORE } from './natureSuggest'

// Cas réel : « carrelage plafond cave » ne doit pas pré-sélectionner « Adaptation PMR » (lot CARRELAGE sans rapport).
const natures: NatureRef[] = [
  { id: 1, label: "Adaptation PMR : barres d'appui, sièges et équipements de confort", groupLabel: 'Adaptation', modelCode: null, lots: [30], extraRisks: [], measures: [] },
  { id: 2, label: 'Pose de carrelage mural en salle de bains', groupLabel: 'Carrelage', modelCode: null, lots: [30], extraRisks: [], measures: [] },
]
const lotNames = new Map<number, string>([[30, 'CARRELAGE ET FAIENCE']])

describe('bonus du nom de lot', () => {
  it('un mot de lot seul ne franchit pas le seuil de pré-sélection', () => {
    const hits = searchNatures('carrelage plafond cave', natures, [], lotNames, 3)
    const pmr = hits.find((h) => h.nature.id === 1)
    expect(pmr?.score ?? 0).toBeLessThan(SUGGEST_MIN_SCORE)
  })

  it('une nature dont le libellé correspond reste proposée au premier rang', () => {
    const hits = searchNatures('pose carrelage mural', natures, [], lotNames, 3)
    expect(hits[0].nature.id).toBe(2)
    expect(hits[0].score).toBeGreaterThanOrEqual(SUGGEST_MIN_SCORE)
  })
})

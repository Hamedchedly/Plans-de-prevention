import { describe, it, expect } from 'vitest'
import ref from '../data/referentiel_v4.json'
import { computeMeasures, searchNatures, proposeRisks, type MeasureRule, type NatureRef, type VocabEntry } from './rules'

const riskCode = new Map(ref.risks.map((r) => [r.label, r.code]))
const rules: MeasureRule[] = ref.measures.map((m) => ({
  code: m.code,
  label: m.label,
  family: m.family,
  ruleType: m.rule_type as MeasureRule['ruleType'],
  risks: m.risks, // codes R01..R14 dans le seed
}))
const natures: NatureRef[] = ref.natures.map((n, i) => ({
  id: i + 1, label: n.label, groupLabel: n.group_label, modelCode: n.model_code, lots: n.lots,
  extraRisks: n.extra_risks.map((l: string) => riskCode.get(l)!),
}))
const vocab: VocabEntry[] = ref.vocabulary
const lotNames = new Map(ref.lots.map((l) => [l.code, l.name]))

describe('règles risque → mesure (fiche PLAN_DE_PREVENTION)', () => {
  it('reproduit la fiche d’exemple « Poser une main courante » (SERRURERIE)', () => {
    const checked = new Set(['Chute de hauteur', 'Chute de plain-pied', "Chute d'objet", 'Risque électrique'].map((l) => riskCode.get(l)!))
    const got = computeMeasures(checked, rules)
    // Casque, Chaussure, Garde-corps, Echafaudages, Mise à la terre, Trémies, Matériel électrique,
    // Procédure hauteur, Rangement, Harnais, Protection câbles, Trousse, Lunettes (ajout décidé)
    expect(got.size).toBe(13)
    expect(got.has('M01')).toBe(true)
  })

  it('une mesure MANUAL n’est jamais cochée automatiquement', () => {
    const all = new Set(ref.risks.map((r) => r.code))
    const got = computeMeasures(all, rules)
    for (const m of rules.filter((r) => r.ruleType === 'MANUAL')) expect(got.has(m.code)).toBe(false)
  })

  it('aucun risque coché => aucune mesure automatique', () => {
    expect(computeMeasures(new Set(), rules).size).toBe(0)
  })
})

describe('recherche de nature', () => {
  it('trouve une cloison à partir d’un descriptif libre', () => {
    const hits = searchNatures('démolir une cloison en placo', natures, vocab, lotNames)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.slice(0, 3).some((h) => /cloison|plafond|doublage/i.test(h.nature.label))).toBe(true)
  })
  it('vide => aucun résultat', () => {
    expect(searchNatures('   ', natures, vocab, lotNames)).toEqual([])
  })
})

describe('risques proposés', () => {
  it('union des défauts des lots et écarts des natures', () => {
    const lotDefaults = new Map<number, string[]>([[12, ['R10', 'R13']]])
    const got = proposeRisks(lotDefaults, [12], [{ id: 1, label: 'x', groupLabel: null, modelCode: null, lots: [12], extraRisks: ['R01'] }])
    expect([...got.keys()].sort()).toEqual(['R01', 'R10', 'R13'])
    expect(got.get('R01')).toBe('NATURE')
  })
})

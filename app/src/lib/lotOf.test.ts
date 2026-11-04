import { describe, it, expect, vi } from 'vitest'
import type { Referentiel } from './refdata'
import type { NatureRef } from './rules'

// Le client Supabase n'est pas utilisé ici.
vi.mock('./supabase', () => ({ supabase: {} }))
const { lotsOfOrder, lotsForFiche } = await import('./natureSuggest')
const lotOf = (o: unknown, r: unknown, n: unknown) => lotsOfOrder(o as never, r as never, n as never).lots

// Données réelles (corps d'état des exports, lots, natures) relevées en base.
const lotNames: [number, string][] = [
  [5, 'COUVERTURE'], [6, 'ETANCHEITE'], [7, 'RAVALEMENT DE FACADE / ENDUIT'], [9, 'ISOLATION'],
  [11, 'MENUISERIES EXTERIEURES'], [12, 'FERMETURES / SERRURERIE'], [13, 'CARRELAGE ET FAIENCE'],
  [15, 'PLOMBERIE'], [18, 'ELECTRICITE'], [20, 'ESPACES VERTS'],
]
const naacCorps = [
  { naac: 'CP', corpsLabel: '(m) Carrelage', lotCode: 13, validated: false },
  { naac: 'CP', corpsLabel: '(o) Plomberie', lotCode: 15, validated: false },
  { naac: 'CP', corpsLabel: '(p) Toitures', lotCode: 5, validated: false },
  { naac: 'CP', corpsLabel: '(q) Menuiseries ext', lotCode: 11, validated: false },
  { naac: 'CP', corpsLabel: '(r) Fermetures', lotCode: 12, validated: true },
  { naac: 'CP', corpsLabel: '(u) Etanchéité', lotCode: 6, validated: false },
  { naac: 'CP', corpsLabel: '(w) Isolat extérieure', lotCode: 9, validated: false },
  { naac: 'CP', corpsLabel: '(y) amenagt ext', lotCode: 20, validated: false },
  { naac: 'CP', corpsLabel: '(z) Electricité', lotCode: 18, validated: false },
  { naac: 'GE', corpsLabel: '(f) Ravalement', lotCode: 7, validated: false },
  { naac: 'GE', corpsLabel: '(i) Electricité', lotCode: 18, validated: false },
  { naac: 'GE', corpsLabel: '(j) Couvertures', lotCode: 5, validated: false },
]
const ref = {
  lotNameByCode: new Map(lotNames),
  lotTerms: [{ term: 'vr', lotCode: 11 }, { term: 'volet roulant', lotCode: 11 }, { term: 'volets roulants', lotCode: 11 }, { term: 'motorisation', lotCode: 18 }, { term: 'elec', lotCode: 18 }],
  naacCorps: naacCorps.map((c) => ({ naac: c.naac, corpsLabel: c.corpsLabel, lotCode: c.lotCode, validated: c.validated })),
} as unknown as Referentiel
const nat = (id: number, lots: number[]) => ({ id, label: `n${id}`, lots }) as unknown as NatureRef
const natDemoussage = nat(82, [7])
const natSerrure = nat(230, [11, 12])
const none = undefined
const order = (over: Record<string, unknown>) => ({ nature_text: null, description: null, nature_id: null, naac_code: null, ...over }) as never

describe('lot d’une commande (corps d’état de l’export)', () => {
  it('5099437 : démoussage de couverture → COUVERTURE, pas RAVALEMENT', () => {
    const o = order({ naac_code: 'GE', nature_text: 'Démoussage et entretien de couverture', description: 'Démoussage des Toitures à base de BIOCIDE CURATIF ET PREVENTIF ET HYDROFUGE' })
    expect(lotOf(o, ref, natDemoussage)).toEqual([5])
    expect(lotsForFiche(o, ref, natDemoussage, new Map())).toEqual([5])
  })
  it('5132550 : serrure → FERMETURES / SERRURERIE', () => {
    const o = order({ naac_code: 'CP', nature_text: 'Remplacement serrure entrée piétonne', description: 'Remplacement du système anti-panique non débrayable' })
    expect(lotOf(o, ref, natSerrure)).toEqual([12])
  })
  it('5138644 : menuiseries extérieures → MENUISERIES EXTERIEURES (pas INTERIEURES)', () => {
    const o = order({ naac_code: 'CP', nature_text: 'Menuiseries Extérieures - VRE', description: 'Remplacement de store existant par volet Roulant électrique' })
    expect(lotOf(o, ref, none)).toEqual([11])
  })
  it('5139338 : grille de protection / fermeture → FERMETURES', () => {
    const o = order({ naac_code: 'CP', nature_text: 'CAves Piper - VH - Remplacement grllle protection', description: 'grille fixe ... fermeture pour cadenas' })
    expect(lotOf(o, ref, none)).toEqual([12])
  })
  it('aucun mot ne correspond → aucun lot plutôt qu’un lot au hasard', () => {
    const o = order({ naac_code: 'CP', nature_text: 'Travaux divers', description: 'Prestation non précisée' })
    expect(lotOf(o, ref, none)).toEqual([])
    expect(lotsOfOrder(o, ref, none).status).toBe('UNKNOWN')
  })
  it('5135482 : motorisation VR (volets roulants) → MENUISERIES EXTERIEURES + ELECTRICITE', () => {
    const o = order({ naac_code: 'CP', nature_text: 'Adapt PMR - Motorisation VR', description: 'Motorisation des VR (5u)(yc F+P Kits, Alim Elec, et bouton commande). / Installation conforme PMR / (selon BPU MA-100324)' })
    expect(lotOf(o, ref, none)).toEqual([11, 18])
  })
  it('sans code NAAC : on garde le comportement de la nature', () => {
    expect(lotOf(order({ nature_text: 'x' }), ref, nat(1, [9]))).toEqual([9])
    expect(lotsForFiche(order({ nature_text: 'x' }), ref, nat(1, [9, 10]), new Map())).toEqual([9, 10])
  })
})

import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))
import { buildRecap, buildRecapHtml, fillMailTemplate, mailtoUrl } from './communications'

describe('fillMailTemplate', () => {
  it('remplace les variables connues', () => {
    expect(fillMailTemplate('Bonjour {prenom}, {nouvelles} commande(s).', { prenom: 'Hélène', nouvelles: 12 }))
      .toBe('Bonjour Hélène, 12 commande(s).')
  })

  it('laisse intacte une variable inconnue', () => {
    expect(fillMailTemplate('{inconnue} et {prenom}', { prenom: 'Léa' })).toBe('{inconnue} et Léa')
  })

  it('accepte les espaces autour du nom de variable', () => {
    expect(fillMailTemplate('{ chargé }', { 'chargé': 'Jean Dupont' })).toBe('Jean Dupont')
  })

  it('ne remplace pas une valeur vide par la clé', () => {
    expect(fillMailTemplate('[{fichier}]', { fichier: '' })).toBe('[]')
  })
})

describe('mailtoUrl', () => {
  it('encode l’objet et le corps, sans altérer le destinataire', () => {
    const url = mailtoUrl('a.b@exemple.fr', 'Commandes à traiter', 'Ligne 1\nLigne 2')
    expect(url.startsWith('mailto:a.b%40exemple.fr?')).toBe(true)
    expect(url).toContain('subject=Commandes%20%C3%A0%20traiter')
    expect(url).toContain('body=Ligne%201%0ALigne%202')
  })
})

describe('buildRecap', () => {
  it('présente un tableau aligné sans code chargé', () => {
    const txt = buildRecap([{ name: 'Léa Martin', code: 'LMA', nouvelles: 3, realises: 120, reste: 45 }], 2026)
    const [head, row] = txt.split('\n')
    expect(head).toContain('Réalisés 2026')
    expect(row).toContain('Léa Martin')
    expect(row).not.toContain('LMA')
    expect(row.trim().endsWith('45')).toBe(true)
  })

  it('trie les chargés par nom', () => {
    const lines = buildRecap([
      { name: 'Quentin', code: 'Q', nouvelles: 1, realises: 2, reste: 3 },
      { name: 'Adrien', code: 'A', nouvelles: 0, realises: 0, reste: 0 },
    ], 2026).split('\n')
    expect(lines[1]).toContain('Adrien')
    expect(lines[2]).toContain('Quentin')
  })
})

describe('buildRecapHtml', () => {
  it('produit un tableau HTML et échappe les noms', () => {
    const html = buildRecapHtml([{ name: 'A & B', code: 'X', nouvelles: 1, realises: 2, reste: 3 }], 2026)
    expect(html.startsWith('<table')).toBe(true)
    expect(html).toContain('A &amp; B')
    expect(html).not.toContain('>X<')
  })
})

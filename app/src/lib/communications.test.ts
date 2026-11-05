import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))
import { fillMailTemplate, mailtoUrl } from './communications'

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

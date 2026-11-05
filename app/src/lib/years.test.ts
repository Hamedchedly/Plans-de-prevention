import { describe, expect, it, vi } from 'vitest'
import { yearOfIso, yearsBetween } from './years'

vi.mock('./supabase', () => ({ supabase: {} }))

describe('yearsBetween', () => {
  it('liste les années de la plus récente à la plus ancienne, année en cours incluse', () => {
    const current = new Date().getFullYear()
    const ys = yearsBetween(['2024-03-01', '2025-06-10', null])
    expect(ys[0]).toBe(current)
    expect(ys[ys.length - 1]).toBe(2024)
    expect(ys.length).toBe(current - 2024 + 1)
  })
  it('renvoie une liste vide sans date', () => {
    expect(yearsBetween([null, undefined])).toEqual([])
  })
})

describe('yearOfIso', () => {
  it('lit l’année d’une date AAAA-MM-JJ', () => {
    expect(yearOfIso('2025-12-31')).toBe(2025)
    expect(yearOfIso(null)).toBeNull()
  })
})

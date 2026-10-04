import { describe, expect, it } from 'vitest'
import { analyserIndice, analyserMarche, clesIndice, mediane, realismeRevente, referenceMarche, type Comparable, type SerieCommune } from './marche'

const TOULOUSE: SerieCommune = {
  n: 'Toulouse',
  a: { 2020: [3100, 3000, 3600, 9000], 2021: [3286, 3206, 3758, 9829], 2022: [3349, 3257, 3916, 9772], 2023: [3323, 3235, 3921, 7409], 2024: [3202, 3132, 3636, 6707], 2025: [3250, 3174, 3674, 8049] },
}

const comparable = (prix: number, surface: number): Comparable => ({ date: '2025-01-01', adresse: 'x', surface, pieces: 2, prix, lat: 0, lon: 0, distance: 100 })

describe('analyserMarche', () => {
  it('prend la médiane du type de bien et calcule la croissance sur 5 ans', () => {
    const m = analyserMarche(TOULOUSE, 'appartement')!
    expect(m).toMatchObject({ commune: 'Toulouse', annee: 2025, prixM2: 3174, parType: true, ventes: 8049 })
    expect(m.croissances).toHaveLength(1)
    expect(m.croissances[0]).toMatchObject({ de: 2020, a: 2025 })
    expect(m.croissances[0].taux).toBeCloseTo(Math.pow(3174 / 3000, 1 / 5) - 1, 6)
    expect(analyserMarche(TOULOUSE, 'maison')!.prixM2).toBe(3674)
  })

  it('retombe sur tous les logements quand le type manque, et sur la période disponible', () => {
    const m = analyserMarche({ n: 'Village', a: { 2022: [1500, null, null, 12], 2023: [1550, null, 1600, 9], 2025: [1650, null, null, 11] } }, 'appartement')!
    expect(m).toMatchObject({ prixM2: 1650, parType: false })
    expect(m.croissances[0]).toMatchObject({ de: 2022, a: 2025 })
  })

  it('ne donne rien pour un parking', () => {
    expect(analyserMarche(TOULOUSE, 'parking')).toBeNull()
  })
})

describe('referenceMarche', () => {
  const marche = analyserMarche(TOULOUSE, 'appartement')
  it('préfère les ventes comparables quand il y en a au moins 5', () => {
    const r = referenceMarche(3300, marche, [comparable(200_000, 50), comparable(210_000, 50), comparable(220_000, 50), comparable(230_000, 50), comparable(240_000, 50)])!
    expect(r).toMatchObject({ prixM2: 4400, source: 'ventes comparables proches' })
    expect(r.ecart).toBeCloseTo(-0.25, 6)
  })
  it('utilise sinon la médiane de la commune', () => {
    expect(referenceMarche(3174, marche, [comparable(200_000, 50)])).toMatchObject({ prixM2: 3174, source: 'médiane de la commune', ecart: 0 })
    expect(referenceMarche(3000, null, [])).toBeNull()
  })
})

describe('realismeRevente', () => {
  const marche = analyserMarche(TOULOUSE, 'appartement')
  it('classe l’hypothèse par rapport à l’historique de la commune', () => {
    expect(realismeRevente(0.04, marche)!.niveau).toBe('optimiste')
    expect(realismeRevente(0.012, marche)!.niveau).toBe('réaliste')
    expect(realismeRevente(-0.01, marche)!.niveau).toBe('prudent')
    expect(realismeRevente(0.02, null)).toBeNull()
  })
})

describe('indice Notaires-INSEE', () => {
  it('choisit la série de la zone et calcule la tendance sur 10 et 20 ans', () => {
    expect(clesIndice('75107', 'appartement')[0]).toBe('Paris|Appartements')
    expect(clesIndice('92012', 'maison')[0]).toBe('Hauts-de-Seine|Maisons')
    expect(clesIndice('69387', 'appartement')).toEqual(['Lyon|Appartements', 'Province|Appartements'])
    expect(clesIndice('31555', 'appartement')).toEqual(['Province|Appartements'])
    const i = analyserIndice('Province', { 2005: 87.4, 2015: 100.1, 2025: 132.5 })!
    expect(i.croissances.map((c) => c.de)).toEqual([2015, 2005])
    expect(i.croissances[0].taux).toBeCloseTo(Math.pow(132.5 / 100.1, 0.1) - 1, 6)
  })

  it('sert de référence longue pour juger l’hypothèse de revente', () => {
    const i = analyserIndice('Province', { 2005: 87.4, 2015: 100.1, 2025: 132.5 })
    const r = realismeRevente(0.015, analyserMarche(TOULOUSE, 'appartement'), i)!
    expect(r.niveau).toBe('réaliste')
    expect(r.tauxHistorique).toBeCloseTo(0.0284, 3)
  })
})

describe('mediane', () => {
  it('gère les listes paires, impaires et vides', () => {
    expect(mediane([3, 1, 2])).toBe(2)
    expect(mediane([1, 2, 3, 4])).toBe(2.5)
    expect(mediane([])).toBeNull()
  })
})

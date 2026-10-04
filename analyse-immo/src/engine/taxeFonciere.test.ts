import { describe, expect, it } from 'vitest'
import { loyerEncadre, scenarios, simuler, TAUX_CREDIT, hypothesesParDefaut, type Bien, type LigneEncadrement, type Profil, type Strategie } from './index'
import { communeFiscale, estimerTaxeFonciere } from './taxeFonciere'

describe('estimerTaxeFonciere', () => {
  it('applique le taux voté à une base estimée à partir du loyer de marché', () => {
    // 640 € × 12 × 0,5 (valeur locative) × 0,5 (abattement) × 49,67 % = 954 €
    expect(estimerTaxeFonciere(49.67, 640)).toEqual({ montant: 950, bas: 570, haut: 1340, taux: 49.67 })
    expect(estimerTaxeFonciere(0, 640)).toBeNull()
    expect(estimerTaxeFonciere(30, 0)).toBeNull()
  })
  it('rattache les arrondissements à leur ville', () => {
    expect(communeFiscale('75107')).toBe('75056')
    expect(communeFiscale('69387')).toBe('69123')
    expect(communeFiscale('13208')).toBe('13055')
    expect(communeFiscale('31555')).toBe('31555')
  })
})

describe('loyerEncadre', () => {
  const ligne = (epoque: string, meuble_txt: string, ref: number, max: number, min: number): LigneEncadrement => ({ annee: '2025', nom_quartier: 'Invalides', piece: 2, epoque, meuble_txt, ref, max, min })
  it('moyenne les époques et retient le plafond le plus bas', () => {
    const r = loyerEncadre([ligne('Avant 1946', 'non meublé', 30, 36, 21), ligne('1971-1990', 'non meublé', 28, 34, 20), ligne('Avant 1946', 'meublé', 34, 41, 24)], 40)!
    expect(r).toMatchObject({ loyer: 1160, bas: 820, haut: 1400, plafond: 1360, meuble: 1360 })
    expect(loyerEncadre([], 40)).toBeNull()
  })
})

describe('scénarios et fourchette des loyers', () => {
  const bien: Bien = { prix: 180_000, surface: 55, pieces: 3, type: 'appartement', neuf: false, fraisAgence: 0, travaux: 0, chargesCopro: 1_800, partChargesRecuperables: 0.5, taxeFonciere: 1_100, dpe: 'D' }
  const profil: Profil = { tmi: 0.3, apportDisponible: 40_000, revenusMensuels: 4_500, mensualitesExistantes: 0 }
  const h = { ...hypothesesParDefaut(800), tauxCredit: TAUX_CREDIT }
  const s: Strategie = { mode: 'nu', regime: 'reelFoncier', gestion: 'directe', financement: { apport: 20_000, duree: 20, taux: TAUX_CREDIT[20] } }
  it('garde les écarts fixes sans fourchette, et vise le milieu de la fourchette sinon', () => {
    expect(scenarios(bien, profil, h, s).map((x) => Math.round(x.loyerNu))).toEqual([720, 800, 840])
    expect(scenarios(bien, profil, h, s, { bas: 640, haut: 900 }).map((x) => Math.round(x.loyerNu))).toEqual([720, 800, 850])
    expect(scenarios(bien, profil, h, s, { bas: 700, haut: 1000 })[1].resultat.tri).toBe(simuler(bien, profil, h, s).tri)
  })
})
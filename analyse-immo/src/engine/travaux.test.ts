import { describe, expect, it } from 'vitest'
import { TAUX_CREDIT, hypothesesParDefaut, simuler, type Bien, type Profil, type Strategie } from './index'

const bien: Bien = { prix: 180_000, surface: 55, pieces: 3, type: 'appartement', neuf: false, fraisAgence: 0, travaux: 0, chargesCopro: 1_800, partChargesRecuperables: 0.5, taxeFonciere: 1_100, dpe: 'D' }
const profil: Profil = { tmi: 0.3, apportDisponible: 40_000, revenusMensuels: 4_500, mensualitesExistantes: 0 }
const h = { ...hypothesesParDefaut(850), tauxCredit: TAUX_CREDIT }
const s: Strategie = { mode: 'nu', regime: 'reelFoncier', gestion: 'directe', financement: { apport: 20_000, duree: 20, taux: TAUX_CREDIT[20] } }

describe('travaux avant de louer', () => {
  it('ajoute le montant au coût et retire les mois sans locataire la première année seulement', () => {
    const base = simuler(bien, profil, h, s)
    const avec = simuler({ ...bien, travaux: 15_000, moisTravaux: 3 }, profil, h, s)
    expect(avec.coutTotal).toBeGreaterThan(base.coutTotal + 15_000 - 1)
    expect(base.annees[0].loyers - avec.annees[0].loyers).toBeCloseTo(3 * 850, 6)
    expect(avec.annees[1].loyers).toBeCloseTo(base.annees[1].loyers, 6)
    expect(avec.tri!).toBeLessThan(base.tri!)
  })
})
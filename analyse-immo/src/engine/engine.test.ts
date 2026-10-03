import { describe, expect, it } from 'vitest'
import {
  abattementsDetention,
  calculerImpots,
  hypothesesParDefaut,
  impotPlusValueParticulier,
  impotSociete,
  mensualite,
  optimiser,
  prixMaximum,
  scenarios,
  simuler,
  tableauAmortissement,
  tri,
  type Bien,
  type FluxFiscalAnnuel,
  type Profil,
} from './index'

const fluxVide: FluxFiscalAnnuel = {
  loyers: 0,
  chargesExploitation: 0,
  interets: 0,
  assurance: 0,
  fraisPonctuels: 0,
  travauxDeductibles: 0,
  amortissementBati: 0,
  amortissementMobilier: 0,
  amortissementTravaux: 0,
}
const f = (p: Partial<FluxFiscalAnnuel>): FluxFiscalAnnuel => ({ ...fluxVide, ...p })

describe('crédit', () => {
  it('calcule la mensualité d’un prêt de 200 000 € à 3,5 % sur 20 ans', () => {
    expect(mensualite(200_000, 0.035, 20)).toBeCloseTo(1159.92, 2)
  })
  it('rembourse tout le capital à l’échéance', () => {
    const t = tableauAmortissement(200_000, 0.035, 20)
    expect(t.reduce((s, l) => s + l.capital, 0)).toBeCloseTo(200_000, 4)
    expect(t[19].capitalRestantDu).toBeCloseTo(0, 4)
    // intérêts + capital d'une année = 12 mensualités
    expect(t[0].interets + t[0].capital).toBeCloseTo(12 * 1159.92, 0)
  })
})

describe('TRI', () => {
  it('donne 10 % pour -100 puis +110', () => {
    expect(tri([-100, 110])).toBeCloseTo(0.1, 6)
  })
  it('renvoie null sans mise de fonds et -1 sans aucun gain', () => {
    expect(tri([0, 10, 10])).toBeNull()
    expect(tri([-100, -10])).toBe(-1)
  })
})

describe('fiscalité des revenus', () => {
  it('micro-foncier : abattement de 30 %', () => {
    expect(calculerImpots('microFoncier', [f({ loyers: 10_000 })], 0.3).impots[0]).toBeCloseTo(3304, 6)
  })
  it('micro-BIC meublé longue durée : abattement de 50 %', () => {
    expect(calculerImpots('microBic', [f({ loyers: 12_000 })], 0.3).impots[0]).toBeCloseTo(2832, 6)
  })
  it('réel foncier : déficit imputé sur le revenu global dans la limite de 10 700 €, puis reporté', () => {
    const r = calculerImpots(
      'reelFoncier',
      [f({ loyers: 10_000, interets: 4_000, chargesExploitation: 19_980 }), f({ loyers: 10_000, interets: 4_000, chargesExploitation: 1_980 })],
      0.3,
    )
    // année 1 : 6 000 € après intérêts − 20 000 € de charges (forfait de 20 € inclus) = −14 000 €
    expect(r.impots[0]).toBeCloseTo(-10_700 * 0.3, 6)
    // année 2 : +4 000 € − 3 300 € de déficit reporté = 700 € imposables
    expect(r.impots[1]).toBeCloseTo(700 * 0.472, 6)
    expect(r.deficitReporte).toBeCloseTo(0, 6)
  })
  it('réel foncier : le déficit dû aux intérêts n’est pas imputable sur le revenu global', () => {
    const r = calculerImpots('reelFoncier', [f({ loyers: 3_000, interets: 5_000, chargesExploitation: 1_980 })], 0.3)
    expect(r.impots[0]).toBeCloseTo(-2_000 * 0.3, 6)
    expect(r.deficitReporte).toBeCloseTo(2_000, 6)
  })
  it('LMNP réel : les amortissements ne créent pas de déficit et sont reportés', () => {
    const an = f({ loyers: 12_000, chargesExploitation: 3_000, interets: 2_000, amortissementBati: 8_000 })
    const r = calculerImpots('lmnpReel', [an, an], 0.3)
    expect(r.impots).toEqual([0, 0])
    expect(r.amortissementsDeduits).toBeCloseTo(14_000, 6)
  })
  it('impôt sur les sociétés : 15 % jusqu’à 42 500 €, 25 % au-delà', () => {
    expect(impotSociete(50_000)).toBeCloseTo(8_250, 6)
  })
})

describe('plus-value immobilière des particuliers', () => {
  it('exonère d’impôt sur le revenu après 22 ans et de prélèvements sociaux après 30 ans', () => {
    expect(abattementsDetention(22).ir).toBeCloseTo(1, 9)
    expect(abattementsDetention(30).ps).toBeCloseTo(1, 9)
    expect(abattementsDetention(15)).toEqual({ ir: expect.closeTo(0.6, 9), ps: expect.closeTo(0.165, 9) })
  })
  it('calcule l’impôt avec les forfaits de frais et de travaux', () => {
    const r = impotPlusValueParticulier({
      prixVente: 300_000,
      fraisVente: 0,
      prixAchat: 200_000,
      fraisAcquisitionReels: 10_000, // le forfait de 7,5 % (15 000 €) est plus favorable
      travauxNonDeduits: 0, // forfait de 15 % après 5 ans
      dureeDetention: 10,
      amortissementsReintegres: 0,
    })
    expect(r.plusValueBrute).toBeCloseTo(55_000, 6)
    expect(r.impot).toBeCloseTo(55_000 * 0.7 * 0.19 + 55_000 * 0.9175 * 0.172, 4)
  })
})

const studio: Bien = {
  prix: 100_000,
  surface: 25,
  pieces: 1,
  type: 'appartement',
  neuf: false,
  fraisAgence: 0,
  travaux: 0,
  chargesCopro: 1_000,
  partChargesRecuperables: 0.5,
  taxeFonciere: 800,
  dpe: 'D',
}
const profil: Profil = { tmi: 0.3, apportDisponible: 200_000, revenusMensuels: 4_000, mensualitesExistantes: 0 }

describe('simulation', () => {
  it('achat comptant en location nue au micro-foncier : chiffres vérifiés à la main', () => {
    const h = hypothesesParDefaut(600)
    const r = simuler(studio, profil, h, { mode: 'nu', regime: 'microFoncier', gestion: 'directe', financement: { apport: 107_500, duree: 20, taux: 0.0325 } })
    expect(r.montantEmprunte).toBe(0)
    expect(r.coutTotal).toBeCloseTo(107_500, 6)
    const a1 = r.annees[0]
    expect(a1.loyers).toBeCloseTo(600 * 11.5, 6)
    // 500 € de copropriété non récupérable + 800 € de taxe foncière + 150 € de PNO + 3 % d'entretien
    expect(a1.charges).toBeCloseTo(1_450 + 0.03 * 6_900, 6)
    expect(a1.impot).toBeCloseTo(6_900 * 0.7 * 0.472, 6)
    expect(r.rentaBrute).toBeCloseTo(0.072, 9)
    expect(r.tri).not.toBeNull()
  })
  it('finance à crédit le coût total quand l’apport est nul (110 %)', () => {
    const h = hypothesesParDefaut(600)
    const r = simuler(studio, profil, h, { mode: 'meuble', regime: 'lmnpReel', gestion: 'directe', financement: { apport: 0, duree: 25, taux: 0.034 } })
    expect(r.montantEmprunte).toBeGreaterThan(r.coutTotal - 1)
    expect(r.montantEmprunte).toBeCloseTo(r.coutTotal, 6)
    expect(r.ameublement).toBe(3_000 + 60 * 25)
  })
  it('refuse un régime incompatible avec le mode de location', () => {
    const h = hypothesesParDefaut(600)
    expect(() => simuler(studio, profil, h, { mode: 'nu', regime: 'microBic', gestion: 'directe', financement: { apport: 0, duree: 20, taux: 0.03 } })).toThrow()
  })
})

describe('optimisation', () => {
  const h = hypothesesParDefaut(600)
  it('compare les modes compatibles et retient une stratégie finançable', () => {
    const o = optimiser(studio, profil, h, 'tri')
    expect(o.meilleur.endettementOk).toBe(true)
    // un studio n'est pas éligible à la colocation
    expect(o.parModeRegime.some((r) => r.strategie.mode === 'colocation')).toBe(false)
    expect(o.parModeRegime.length).toBe(4 * 3)
  })
  it('respecte l’apport disponible', () => {
    const o = optimiser(studio, { ...profil, apportDisponible: 15_000 }, h, 'cashflow')
    expect(o.meilleur.strategie.financement.apport).toBeLessThanOrEqual(15_000)
  })
  it('le scénario pessimiste est moins favorable que l’optimiste', () => {
    const o = optimiser(studio, profil, h, 'tri')
    const [p, , opt] = scenarios(studio, profil, h, o.meilleur.strategie)
    expect(p.resultat.cashflowMensuelApresImpot).toBeLessThan(opt.resultat.cashflowMensuelApresImpot)
  })
  it('le prix maximum annule le cash-flow', () => {
    const s = { mode: 'nu' as const, regime: 'reelFoncier' as const, gestion: 'directe' as const, financement: { apport: 10_000, duree: 20, taux: 0.0325 } }
    const pm = prixMaximum(studio, profil, h, s, { type: 'cashflow', valeur: 0 })
    expect(pm).not.toBeNull()
    expect(simuler({ ...studio, prix: pm! }, profil, h, s).cashflowMensuelApresImpot).toBeGreaterThanOrEqual(0)
    expect(simuler({ ...studio, prix: pm! + 2_000 }, profil, h, s).cashflowMensuelApresImpot).toBeLessThan(0)
  })
})

import { BAREMES } from './config'
import type { Regime } from './types'

export interface FluxFiscalAnnuel {
  loyers: number
  chargesExploitation: number // copro non récupérable, taxe foncière, PNO, entretien, gestion, comptabilité, CFE…
  interets: number
  assurance: number
  fraisPonctuels: number // frais de dossier et de garantie, frais d'acquisition déductibles (année 1)
  travauxDeductibles: number // réel foncier uniquement (année des travaux)
  amortissementBati: number
  amortissementMobilier: number
  amortissementTravaux: number
}

export interface ResultatFiscal {
  impots: number[] // négatif = économie d'impôt sur le revenu global
  amortissementsDeduits: number // cumul effectivement déduit (réintégré dans la plus-value en LMNP)
  amortissementsBatiDeduits: number
  deficitReporte: number
  alertes: string[]
}

export function impotSociete(benefice: number): number {
  if (benefice <= 0) return 0
  const { tauxReduit, plafondTauxReduit, tauxNormal } = BAREMES.is
  return Math.min(benefice, plafondTauxReduit) * tauxReduit + Math.max(benefice - plafondTauxReduit, 0) * tauxNormal
}

export function calculerImpots(regime: Regime, flux: FluxFiscalAnnuel[], tmi: number): ResultatFiscal {
  const ps = BAREMES.prelevementsSociaux
  const alertes = new Set<string>()
  const impots: number[] = []
  let amortissementsDeduits = 0
  let amortissementsBatiDeduits = 0
  let deficitReporte = 0 // déficit reportable sur les revenus de même nature
  let amortReporte = 0 // amortissements non déduits, reportables sans limite (LMNP réel)

  for (const f of flux) {
    switch (regime) {
      case 'microFoncier': {
        if (f.loyers > BAREMES.microFoncier.plafondRecettes) alertes.add('Loyers au-dessus du plafond du micro-foncier (15 000 €) : régime réel obligatoire.')
        impots.push(f.loyers * (1 - BAREMES.microFoncier.abattement) * (tmi + ps))
        break
      }
      case 'microBic': {
        if (f.loyers > BAREMES.microBic.plafondRecettes) alertes.add('Loyers au-dessus du plafond du micro-BIC : régime réel obligatoire.')
        impots.push(f.loyers * (1 - BAREMES.microBic.abattement) * (tmi + ps))
        break
      }
      case 'reelFoncier': {
        // Le déficit dû aux intérêts ne s'impute que sur les revenus fonciers ;
        // le reste s'impute sur le revenu global dans la limite de 10 700 €.
        const autresCharges = f.chargesExploitation + f.assurance + f.fraisPonctuels + f.travauxDeductibles + BAREMES.forfaitGestionFoncier
        const apresInterets = f.loyers - f.interets
        let imputableGlobal = 0
        let resultat: number
        if (apresInterets < 0) {
          deficitReporte += -apresInterets
          resultat = -autresCharges
        } else {
          resultat = apresInterets - autresCharges
        }
        if (resultat < 0) {
          imputableGlobal = Math.min(-resultat, BAREMES.deficitFoncierPlafondRevenuGlobal)
          deficitReporte += -resultat - imputableGlobal
          resultat = 0
        }
        const imputationReport = Math.min(resultat, deficitReporte)
        deficitReporte -= imputationReport
        resultat -= imputationReport
        impots.push(resultat * (tmi + ps) - imputableGlobal * tmi)
        break
      }
      case 'lmnpReel': {
        // Les amortissements ne peuvent pas créer de déficit : l'excédent est reporté.
        let resultat = f.loyers - f.chargesExploitation - f.interets - f.assurance - f.fraisPonctuels
        if (resultat < 0) {
          deficitReporte += -resultat
          resultat = 0
        } else {
          const imputation = Math.min(resultat, deficitReporte)
          deficitReporte -= imputation
          resultat -= imputation
        }
        const amortAnnee = f.amortissementBati + f.amortissementMobilier + f.amortissementTravaux
        const disponible = amortAnnee + amortReporte
        const deduit = Math.min(resultat, disponible)
        amortReporte = disponible - deduit
        amortissementsDeduits += deduit
        // part du bâti et des travaux dans l'amortissement déduit, au prorata (réintégrée à la revente)
        const partImmobilier = amortAnnee > 0 ? (f.amortissementBati + f.amortissementTravaux) / amortAnnee : 1
        amortissementsBatiDeduits += deduit * partImmobilier
        resultat -= deduit
        if (f.loyers > BAREMES.seuilRecettesLmp) alertes.add('Loyers au-dessus de 23 000 € : le statut LMP peut s’appliquer si ces recettes dépassent vos autres revenus d’activité.')
        impots.push(resultat * (tmi + ps))
        break
      }
      case 'sciIs': {
        const amort = f.amortissementBati + f.amortissementMobilier + f.amortissementTravaux
        let resultat = f.loyers - f.chargesExploitation - f.interets - f.assurance - f.fraisPonctuels - amort
        amortissementsDeduits += amort
        amortissementsBatiDeduits += f.amortissementBati + f.amortissementTravaux
        if (resultat < 0) {
          deficitReporte += -resultat
          resultat = 0
        } else {
          const imputation = Math.min(resultat, deficitReporte)
          deficitReporte -= imputation
          resultat -= imputation
        }
        impots.push(impotSociete(resultat))
        break
      }
    }
  }
  return { impots, amortissementsDeduits, amortissementsBatiDeduits, deficitReporte, alertes: [...alertes] }
}

// Abattements pour durée de détention (plus-value des particuliers)
export function abattementsDetention(annees: number): { ir: number; ps: number } {
  let ir = 0
  let ps = 0
  for (let a = 6; a <= annees; a++) {
    if (a <= 21) {
      ir += 0.06
      ps += 0.0165
    } else if (a === 22) {
      ir += 0.04
      ps += 0.016
    } else {
      ps += 0.09
    }
  }
  return { ir: Math.min(ir, 1), ps: Math.min(ps, 1) }
}

export function surtaxePlusValue(pvImposableIr: number): number {
  if (pvImposableIr <= 50_000) return 0
  let taux = 0
  for (const t of BAREMES.plusValue.surtaxe) if (pvImposableIr > t.seuil) taux = t.taux
  return pvImposableIr * taux
}

export interface EntreePlusValue {
  prixVente: number
  fraisVente: number
  prixAchat: number
  fraisAcquisitionReels: number
  travauxNonDeduits: number
  dureeDetention: number
  amortissementsReintegres: number // LMNP : amortissements du bâti et des travaux déduits
}

export function impotPlusValueParticulier(e: EntreePlusValue): { plusValueBrute: number; impot: number } {
  const { forfaitFraisAcquisition, forfaitTravaux, tauxIr } = BAREMES.plusValue
  const frais = Math.max(e.fraisAcquisitionReels, e.prixAchat * forfaitFraisAcquisition)
  const travaux = e.dureeDetention > 5 ? Math.max(e.travauxNonDeduits, e.prixAchat * forfaitTravaux) : e.travauxNonDeduits
  const prixRevient = e.prixAchat + frais + travaux - e.amortissementsReintegres
  const pv = e.prixVente - e.fraisVente - prixRevient
  if (pv <= 0) return { plusValueBrute: pv, impot: 0 }
  const ab = abattementsDetention(e.dureeDetention)
  const baseIr = pv * (1 - ab.ir)
  const basePs = pv * (1 - ab.ps)
  return { plusValueBrute: pv, impot: baseIr * tauxIr + basePs * BAREMES.prelevementsSociaux + surtaxePlusValue(baseIr) }
}

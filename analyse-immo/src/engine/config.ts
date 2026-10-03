// Hypothèses et barèmes par défaut, centralisés ici pour être mis à jour chaque année.
// Barèmes fiscaux : règles en vigueur pour les revenus 2025. À vérifier à chaque loi de finances
// (notamment la LFSS 2026, qui relève la CSG sur une partie des revenus du capital).

import type { ModeLocation, Regime } from './types'

export const BAREMES = {
  prelevementsSociaux: 0.172,
  pfu: 0.3,

  microFoncier: { plafondRecettes: 15_000, abattement: 0.3 },
  deficitFoncierPlafondRevenuGlobal: 10_700,
  forfaitGestionFoncier: 20, // € par local, déductible au réel

  // Meublé de longue durée (loi Le Meur) : abattement 50 %, plafond 77 700 €
  microBic: { plafondRecettes: 77_700, abattement: 0.5 },
  seuilRecettesLmp: 23_000,

  is: { tauxReduit: 0.15, plafondTauxReduit: 42_500, tauxNormal: 0.25 },

  plusValue: {
    tauxIr: 0.19,
    forfaitFraisAcquisition: 0.075,
    forfaitTravaux: 0.15, // applicable après 5 ans de détention
    // surtaxe sur les plus-values imposables > 50 000 € (barème simplifié, sans lissage)
    surtaxe: [
      { seuil: 50_000, taux: 0.02 },
      { seuil: 100_000, taux: 0.03 },
      { seuil: 150_000, taux: 0.04 },
      { seuil: 200_000, taux: 0.05 },
      { seuil: 250_000, taux: 0.06 },
    ],
  },

  hcsf: { tauxEndettementMax: 0.35, partLoyersRetenue: 0.7 },
} as const

// Taux de crédit immobilier moyens (hors assurance) : à mettre à jour à la main.
export const TAUX_CREDIT: Record<number, number> = { 15: 0.031, 20: 0.0325, 25: 0.034 }

export const DEFAUTS = {
  fraisNotaireAncien: 0.075,
  fraisNotaireNeuf: 0.025,
  assuranceEmprunteur: 0.003, // % annuel du capital emprunté
  fraisGarantie: 0.01, // caution ou hypothèque, % du capital
  fraisDossier: 800,
  revalorisationLoyers: 0.015,
  revalorisationCharges: 0.02,
  valorisationBien: 0.015,
  fraisRevente: 0.05,
  pno: 150,
  entretien: 0.03, // % des loyers encaissés
  partTerrain: { appartement: 0.15, maison: 0.25, parking: 0.3 },
  dureeAmortissement: { bati: 30, mobilier: 7, travaux: 12 },
  comptabilite: { lmnpReel: 600, sciIs: 1500 },
  cfe: 250, // cotisation foncière des entreprises, loueurs en meublé
  horizon: 20,
}

export interface ParametresMode {
  libelle: string
  meuble: boolean
  coefLoyer: number // par rapport au loyer nu
  vacanceMois: number
  ameublementFixe: number
  ameublementParM2: number
  ameublementParChambre: number
  chargesSpecifiques: number // € / an non refacturées (internet, ménage, consommables)
  gestionAgence: number // % des loyers si gestion déléguée
  piecesMin: number
}

export const MODES: Record<ModeLocation, ParametresMode> = {
  nu: { libelle: 'Location nue', meuble: false, coefLoyer: 1, vacanceMois: 0.5, ameublementFixe: 0, ameublementParM2: 0, ameublementParChambre: 0, chargesSpecifiques: 0, gestionAgence: 0.07, piecesMin: 0 },
  meuble: { libelle: 'Meublé longue durée', meuble: true, coefLoyer: 1.12, vacanceMois: 1, ameublementFixe: 3000, ameublementParM2: 60, ameublementParChambre: 0, chargesSpecifiques: 150, gestionAgence: 0.08, piecesMin: 1 },
  colocation: { libelle: 'Colocation', meuble: true, coefLoyer: 1.3, vacanceMois: 1.5, ameublementFixe: 4000, ameublementParM2: 0, ameublementParChambre: 1500, chargesSpecifiques: 700, gestionAgence: 0.1, piecesMin: 3 },
  etudiant: { libelle: 'Location étudiante', meuble: true, coefLoyer: 1.15, vacanceMois: 2, ameublementFixe: 3000, ameublementParM2: 60, ameublementParChambre: 0, chargesSpecifiques: 200, gestionAgence: 0.08, piecesMin: 1 },
  mobilite: { libelle: 'Bail mobilité', meuble: true, coefLoyer: 1.25, vacanceMois: 2, ameublementFixe: 3500, ameublementParM2: 70, ameublementParChambre: 0, chargesSpecifiques: 600, gestionAgence: 0.12, piecesMin: 1 },
}

export const LIBELLES_REGIMES: Record<Regime, string> = {
  microFoncier: 'Micro-foncier',
  reelFoncier: 'Réel foncier',
  microBic: 'LMNP micro-BIC',
  lmnpReel: 'LMNP réel',
  sciIs: 'SCI à l’IS',
}

export const REGIMES_NU: Regime[] = ['microFoncier', 'reelFoncier', 'sciIs']
export const REGIMES_MEUBLE: Regime[] = ['microBic', 'lmnpReel', 'sciIs']

// Calendrier d'interdiction de louer selon le DPE (loi Climat et résilience)
export const INTERDICTIONS_DPE: Record<string, number> = { G: 2025, F: 2028, E: 2034 }

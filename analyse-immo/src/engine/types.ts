export type ModeLocation = 'nu' | 'meuble' | 'colocation' | 'etudiant' | 'mobilite'
export type Regime = 'microFoncier' | 'reelFoncier' | 'microBic' | 'lmnpReel' | 'sciIs'
export type Gestion = 'directe' | 'agence'
export type TypeBien = 'appartement' | 'maison' | 'parking'
export type ClasseDpe = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'
export type Objectif = 'tri' | 'cashflow' | 'rentabilite'

export interface Bien {
  prix: number
  surface: number
  pieces: number
  type: TypeBien
  neuf: boolean
  fraisAgence: number // € en sus du prix, 0 si le prix est frais d'agence inclus
  travaux: number
  moisTravaux?: number // mois sans loyer la première année, le temps des travaux
  chargesCopro: number // € / an
  partChargesRecuperables: number // 0..1
  taxeFonciere: number // € / an
  dpe: ClasseDpe | null
  dpeApresTravaux?: ClasseDpe | null // classe visée après une rénovation énergétique
  ville?: string
  adresse?: string
  codeInsee?: string // commune ou arrondissement, pour les prix de marché
  latitude?: number
  longitude?: number
}

export interface Profil {
  tmi: number // 0, 0.11, 0.3, 0.41, 0.45
  apportDisponible: number
  revenusMensuels: number // revenus nets du foyer, pour le taux d'endettement
  mensualitesExistantes: number
}

export interface Hypotheses {
  loyerNuMensuel: number // hors charges
  loyersParMode?: Partial<Record<ModeLocation, number>> // saisis par l'utilisateur, sinon dérivés du loyer nu
  revalorisationLoyers: number
  revalorisationCharges: number
  valorisationBien: number
  vacanceSupplementaireMois: number
  fraisRevente: number
  pno: number
  entretien: number
  horizon: number
  tauxCredit: Record<number, number>
  assuranceEmprunteur: number
  fraisGarantie: number
  fraisDossier: number
}

export interface Financement {
  apport: number // € apportés par l'investisseur
  duree: number // années
  taux: number
}

export interface Strategie {
  mode: ModeLocation
  regime: Regime
  gestion: Gestion
  financement: Financement
}

export interface Annee {
  annee: number
  loyers: number
  charges: number
  interets: number
  assurance: number
  capitalRembourse: number
  mensualitesAnnuelles: number
  cashflowAvantImpot: number
  impot: number // négatif = économie d'impôt
  cashflowApresImpot: number
  capitalRestantDu: number
  valeurBien: number
  patrimoineNet: number
}

export interface Resultat {
  strategie: Strategie
  coutTotal: number
  montantEmprunte: number
  mensualiteCredit: number // hors assurance
  mensualiteAssurance: number
  ameublement: number
  rentaBrute: number
  rentaNette: number
  rentaNetteNette: number
  cashflowMensuelAvantImpot: number // année 1
  cashflowMensuelApresImpot: number // moyenne sur l'horizon
  effortEpargneMensuel: number // moyenne sur l'horizon, ≥ 0
  tri: number | null // null : aucune mise de fonds nette, TRI non défini (infini)
  plusValueNette: number
  impotPlusValue: number
  tauxEndettement: number | null
  endettementOk: boolean
  annees: Annee[]
  alertes: string[]
}

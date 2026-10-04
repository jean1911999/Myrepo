// Estimation de la taxe foncière quand l'annonce ne la donne pas.
// Taxe = taux voté (commune + intercommunalité, DGFiP) × base ; la base vaut 50 % de la valeur locative cadastrale.
// La valeur locative cadastrale d'un logement n'est pas publique : on la suppose égale à une fraction du loyer
// de marché annuel. C'est l'étape la plus incertaine, d'où la fourchette large.

export const ABATTEMENT_BASE = 0.5
export const PART_VALEUR_LOCATIVE = 0.5 // valeur locative cadastrale / loyer de marché annuel hors charges
export const INCERTITUDE_TAXE_FONCIERE = 0.4

export interface TaxeFonciereEstimee {
  montant: number // € / an
  bas: number
  haut: number
  taux: number // taux global voté, en %
}

// Les arrondissements de Paris, Lyon et Marseille votent leur taux à l'échelle de la ville.
export function communeFiscale(codeInsee: string): string {
  if (codeInsee.startsWith('751')) return '75056'
  if (codeInsee.startsWith('6938')) return '69123'
  if (codeInsee.startsWith('132')) return '13055'
  return codeInsee
}

export function estimerTaxeFonciere(tauxGlobal: number, loyerMarcheMensuel: number): TaxeFonciereEstimee | null {
  if (!(tauxGlobal > 0) || !(loyerMarcheMensuel > 0)) return null
  const centre = loyerMarcheMensuel * 12 * PART_VALEUR_LOCATIVE * ABATTEMENT_BASE * (tauxGlobal / 100)
  const arrondi = (v: number) => Math.round(v / 10) * 10
  return { montant: arrondi(centre), bas: arrondi(centre * (1 - INCERTITUDE_TAXE_FONCIERE)), haut: arrondi(centre * (1 + INCERTITUDE_TAXE_FONCIERE)), taux: tauxGlobal }
}

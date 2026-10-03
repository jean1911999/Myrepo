import type { TypeBien } from './types'

// Loyers de marché : « Carte des loyers » (loyers d'annonce par commune, €/m² charges comprises).

// Une commune telle que stockée dans public/donnees/loyers : [loyer, bas, haut, 1 si estimé à la commune]
export interface LoyersCommune {
  app12?: [number, number, number, number]
  app3?: [number, number, number, number]
  mai?: [number, number, number, number]
}

export interface LoyerMarche {
  loyer: number // € / mois, hors charges
  bas: number
  haut: number
  m2ChargesComprises: number
  precision: 'commune' | 'communes voisines'
  categorie: string
}

// Les indicateurs sont charges comprises ; le moteur raisonne hors charges.
export const PART_CHARGES_LOCATIVES = 0.1

export function estimerLoyer(c: LoyersCommune, type: TypeBien, pieces: number, surface: number): LoyerMarche | null {
  if (type === 'parking' || !(surface > 0)) return null
  const [cle, categorie] = type === 'maison' ? (['mai', 'maisons'] as const) : pieces <= 2 ? (['app12', 'appartements de 1 ou 2 pièces'] as const) : (['app3', 'appartements de 3 pièces et plus'] as const)
  const v = c[cle]
  if (!v || !(v[0] > 0)) return null
  const mensuel = (m2: number) => Math.round((m2 * surface * (1 - PART_CHARGES_LOCATIVES)) / 10) * 10
  return { loyer: mensuel(v[0]), bas: mensuel(v[1]), haut: mensuel(v[2]), m2ChargesComprises: v[0], precision: v[3] === 1 ? 'commune' : 'communes voisines', categorie }
}

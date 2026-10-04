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
  source: string // d'où vient ce repère, avec son millésime
  plafond?: number // loyer mensuel maximal légal (encadrement des loyers), hors complément de loyer
  meuble?: number // loyer meublé de référence, quand la source le donne
  autres?: { source: string; loyer: number; bas: number; haut: number }[] // repères moins précis, pour comparaison
}

// Une ligne de l'encadrement des loyers de Paris : loyers de référence en €/m² hors charges.
export interface LigneEncadrement {
  annee: string
  nom_quartier: string
  piece: number
  epoque: string
  meuble_txt: string
  ref: number
  max: number // loyer de référence majoré (plafond légal)
  min: number // loyer de référence minoré
}

// L'époque de construction n'est pas connue : on retient la moyenne des époques, et le plafond le plus bas.
export function loyerEncadre(lignes: LigneEncadrement[], surface: number): LoyerMarche | null {
  const nu = lignes.filter((l) => l.meuble_txt.startsWith('non'))
  if (nu.length === 0 || !(surface > 0)) return null
  const meuble = lignes.filter((l) => !l.meuble_txt.startsWith('non'))
  const moyenne = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length
  const mensuel = (m2: number) => Math.round((m2 * surface) / 10) * 10
  return {
    loyer: mensuel(moyenne(nu.map((l) => l.ref))),
    bas: mensuel(moyenne(nu.map((l) => l.min))),
    haut: mensuel(moyenne(nu.map((l) => l.max))),
    plafond: mensuel(Math.min(...nu.map((l) => l.max))),
    meuble: meuble.length ? mensuel(moyenne(meuble.map((l) => l.ref))) : undefined,
    source: `Encadrement des loyers de Paris ${nu[0].annee}, quartier ${nu[0].nom_quartier}, ${nu[0].piece} pièce${nu[0].piece > 1 ? 's' : ''} (loyer de référence, moyenne des époques de construction)`,
  }
}

// Les indicateurs sont charges comprises ; le moteur raisonne hors charges.
export const PART_CHARGES_LOCATIVES = 0.1

export function estimerLoyer(c: LoyersCommune, type: TypeBien, pieces: number, surface: number): LoyerMarche | null {
  if (type === 'parking' || !(surface > 0)) return null
  const [cle, categorie] = type === 'maison' ? (['mai', 'maisons'] as const) : pieces <= 2 ? (['app12', 'appartements de 1 ou 2 pièces'] as const) : (['app3', 'appartements de 3 pièces et plus'] as const)
  const v = c[cle]
  if (!v || !(v[0] > 0)) return null
  const mensuel = (m2: number) => Math.round((m2 * surface * (1 - PART_CHARGES_LOCATIVES)) / 10) * 10
  return {
    loyer: mensuel(v[0]),
    bas: mensuel(v[1]),
    haut: mensuel(v[2]),
    source: `Carte des loyers 2025 (loyers d'annonce, ${categorie}, ${v[3] === 1 ? 'commune' : 'communes voisines'}), charges retirées`,
  }
}

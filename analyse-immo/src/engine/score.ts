import type { Bien, ModeLocation, Resultat } from './types'

// Score financier sur 100 et fiabilité de ce score.
// Le score ne couvre que la rentabilité calculée : l'emplacement et les prix de marché
// (données publiques) l'enrichiront à l'étape 2, ce que la fiabilité signale.

export interface Critere {
  libelle: string
  explication: string
  points: number
  max: number
}

export type NiveauScore = 'bon' | 'moyen' | 'mauvais'

export interface Score {
  total: number // 0..100
  niveau: NiveauScore
  verdict: string
  criteres: Critere[]
}

const lineaire = (v: number, bas: number, haut: number, max: number) => Math.round(Math.min(1, Math.max(0, (v - bas) / (haut - bas))) * max)

const POINTS_DPE: Record<string, number> = { A: 5, B: 5, C: 5, D: 5, E: 3, F: 1, G: 0 }

// ecartMarche : prix au m² de l'annonce par rapport au marché local (0,1 = 10 % plus cher), null si inconnu.
export function calculerScore(r: Resultat, pessimiste: Resultat, prixMaxTri: number | null, bien: Bien, ecartMarche: number | null = null): Score {
  const pointsRentable = (max: number) => (prixMaxTri === null ? 0 : lineaire(prixMaxTri / bien.prix, 0.8, 1.05, max))
  const tri = r.tri ?? 1
  const triPessimiste = pessimiste.tri ?? 1
  const criteres: Critere[] = [
    {
      libelle: 'Rendement',
      explication: 'Ce que rapporte l’opération par an en moyenne, revente comprise',
      points: lineaire(tri, 0, 0.1, 35),
      max: 35,
    },
    {
      libelle: 'Équilibre mensuel',
      explication: 'Ce qu’il reste (ou manque) chaque mois après crédit, charges et impôts',
      points: lineaire(r.cashflowMensuelApresImpot, -400, 50, 25),
      max: 25,
    },
    {
      libelle: 'Prix demandé',
      explication:
        ecartMarche === null
          ? 'Écart entre le prix affiché et le prix qui rend l’opération rentable'
          : 'Écart entre le prix affiché et le prix qui rend l’opération rentable (12 points), et position par rapport aux prix réels du marché local (8 points)',
      // Marché : 0 point à 20 % au-dessus des prix locaux, 8 points à 10 % en dessous.
      points: ecartMarche === null ? pointsRentable(20) : pointsRentable(12) + lineaire(-ecartMarche, -0.2, 0.1, 8),
      max: 20,
    },
    {
      libelle: 'Résistance aux imprévus',
      explication: 'Rendement si les loyers baissent, les taux montent et le bien ne prend pas de valeur',
      points: lineaire(triPessimiste, 0, 0.05, 10),
      max: 10,
    },
    {
      libelle: 'Risques',
      explication: 'Étiquette énergie (DPE) et capacité à obtenir le crédit',
      points: (bien.dpe ? POINTS_DPE[bien.dpe] : 2) + (r.endettementOk ? 5 : 0),
      max: 10,
    },
  ]
  const total = criteres.reduce((s, c) => s + c.points, 0)
  const niveau: NiveauScore = total >= 65 ? 'bon' : total >= 45 ? 'moyen' : 'mauvais'
  const verdict = total >= 80 ? 'Très bonne affaire' : total >= 65 ? 'Bonne affaire' : total >= 45 ? 'Intéressant si vous négociez' : total >= 30 ? 'Peu rentable en l’état' : 'À éviter'
  return { total, niveau, verdict, criteres }
}

export interface Fiabilite {
  pourcentage: number // 0..100
  niveau: 'Bonne' | 'Moyenne' | 'Faible'
  scoreMin: number
  scoreMax: number
  raisons: string[] // ce qui réduit la fiabilité
}

export interface ContexteFiabilite {
  bien: Bien
  modeRetenu: ModeLocation
  loyerModeSaisi: boolean // le loyer du mode retenu a été saisi, pas déduit du loyer nu
  donneesExemple: boolean
  loyerEstime?: boolean // loyer estimé par l'outil faute de donnée dans l'annonce
  champsEstimes?: string[] // autres données absentes de l'annonce et estimées
  marche?: 'comparables' | 'commune' | null // référence de prix de marché utilisée dans le score
  loyerMarche?: { bas: number; haut: number } | null // fourchette des loyers de marché, hors charges
  loyerNu?: number // loyer nu mensuel retenu
  scorePessimiste: number
  scoreOptimiste: number
}

export function calculerFiabilite(c: ContexteFiabilite): Fiabilite {
  const raisons: string[] = []
  let p = 100
  const retirer = (points: number, raison: string) => {
    p -= points
    raisons.push(raison)
  }

  if (c.marche === 'comparables') retirer(8, 'Le quartier (transports, commerces, risques) n’est pas encore pris en compte.')
  else if (c.marche === 'commune') retirer(12, 'Le prix est comparé à la médiane de la commune, faute de ventes comparables proches ; le quartier n’est pas encore pris en compte.')
  else retirer(20, 'L’emplacement et les prix du marché local ne sont pas pris en compte (bien non localisé ou commune sans données).')
  if (c.donneesExemple) retirer(15, 'Les données sont celles d’un exemple, pas d’une annonce vérifiée.')
  if (c.loyerEstime && c.loyerMarche) retirer(8, `Le loyer est estimé d’après les loyers d’annonce de la commune (de ${c.loyerMarche.bas} à ${c.loyerMarche.haut} € par mois), pas constaté pour ce bien.`)
  else if (!c.loyerEstime && c.loyerMarche && c.loyerNu !== undefined && c.loyerNu > c.loyerMarche.haut)
    retirer(10, `Le loyer retenu (${Math.round(c.loyerNu)} € par mois) dépasse la fourchette haute des loyers du marché local (${c.loyerMarche.haut} €).`)
  if (c.loyerEstime && !c.loyerMarche) retirer(20,'Le loyer n’est pas dans l’annonce : il est estimé par l’outil à partir d’un rendement type. Remplacez-le par un loyer constaté.')
  if (c.champsEstimes?.length) retirer(Math.min(15, 5 * c.champsEstimes.length), `Données absentes de l’annonce et estimées par l’outil : ${c.champsEstimes.join(', ')}.`)
  if (c.modeRetenu !== 'nu' && !c.loyerModeSaisi && !c.loyerEstime) retirer(15, 'Le loyer du mode de location recommandé est estimé, pas constaté sur le marché.')
  if (!c.bien.dpe && !c.champsEstimes?.includes('DPE')) retirer(10, 'Le DPE (étiquette énergie) n’est pas renseigné.')
  if (c.bien.taxeFonciere <= 0) retirer(10, 'La taxe foncière n’est pas renseignée.')
  if (c.bien.type === 'appartement' && c.bien.chargesCopro <= 0) retirer(10, 'Les charges de copropriété ne sont pas renseignées.')
  if (c.bien.latitude === undefined || c.bien.longitude === undefined) retirer(5, 'L’adresse du bien n’est pas localisée.')

  const ecart = c.scoreOptimiste - c.scorePessimiste
  if (ecart > 30) retirer(20, 'Le score change beaucoup selon que les choses se passent bien ou mal.')
  else if (ecart > 15) retirer(10, 'Le score change sensiblement selon que les choses se passent bien ou mal.')

  const pourcentage = Math.max(5, p)
  return {
    pourcentage,
    niveau: pourcentage >= 70 ? 'Bonne' : pourcentage >= 45 ? 'Moyenne' : 'Faible',
    scoreMin: Math.min(c.scorePessimiste, c.scoreOptimiste),
    scoreMax: Math.max(c.scorePessimiste, c.scoreOptimiste),
    raisons,
  }
}

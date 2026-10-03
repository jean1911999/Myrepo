import type { TypeBien } from './types'

// Prix de marché : médianes annuelles par commune (DVF) et ventes réelles comparables.

// Série d'une commune telle que stockée dans public/donnees/prix : année -> [tous, appartement, maison, ventes]
export interface SerieCommune {
  n: string
  a: Record<string, [number | null, number | null, number | null, number | null]>
}

export interface Croissance {
  de: number
  a: number
  taux: number // croissance annuelle moyenne
}

export interface Marche {
  commune: string
  annee: number
  prixM2: number // médiane de la dernière année, pour le type de bien si disponible
  parType: boolean
  ventes: number | null
  serie: { annee: number; prix: number }[]
  croissances: Croissance[] // sur 10 ans, 5 ans, ou la plus longue période disponible
}

export function analyserMarche(s: SerieCommune, type: TypeBien): Marche | null {
  if (type === 'parking') return null
  const i = type === 'maison' ? 2 : 1
  const annees = Object.keys(s.a).map(Number).sort((x, y) => x - y)
  const parType = annees.filter((an) => s.a[an][i] !== null).length >= Math.max(1, annees.length - 1)
  const serie = annees.map((annee) => ({ annee, prix: s.a[annee][parType ? i : 0] })).filter((p): p is { annee: number; prix: number } => p.prix !== null && p.prix > 0)
  if (serie.length === 0) return null
  const dernier = serie[serie.length - 1]
  const croissance = (duree: number): Croissance | null => {
    const debut = serie.find((p) => p.annee === dernier.annee - duree)
    return debut ? { de: debut.annee, a: dernier.annee, taux: Math.pow(dernier.prix / debut.prix, 1 / duree) - 1 } : null
  }
  const croissances = [croissance(10), croissance(5)].filter((c): c is Croissance => c !== null)
  if (croissances.length === 0 && serie.length >= 3) {
    const c = croissance(dernier.annee - serie[0].annee)
    if (c) croissances.push(c)
  }
  return { commune: s.n, annee: dernier.annee, prixM2: dernier.prix, parType, ventes: s.a[dernier.annee][3], serie, croissances }
}

export interface Comparable {
  date: string
  adresse: string
  surface: number
  pieces: number
  prix: number
  lat: number
  lon: number
  distance: number // mètres
}

export function mediane(valeurs: number[]): number | null {
  if (valeurs.length === 0) return null
  const t = [...valeurs].sort((a, b) => a - b)
  const m = Math.floor(t.length / 2)
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2
}

export const NB_COMPARABLES_MIN = 5

export interface ReferenceMarche {
  prixM2: number
  source: 'ventes comparables proches' | 'médiane de la commune'
  ecart: number // prix au m² de l'annonce / référence - 1
}

// Référence de prix : les ventes comparables proches si elles sont assez nombreuses, sinon la médiane de la commune.
export function referenceMarche(prixM2Annonce: number, marche: Marche | null, comparables: Comparable[]): ReferenceMarche | null {
  const m = comparables.length >= NB_COMPARABLES_MIN ? mediane(comparables.map((c) => c.prix / c.surface)) : null
  if (m !== null) return { prixM2: m, source: 'ventes comparables proches', ecart: prixM2Annonce / m - 1 }
  if (marche) return { prixM2: marche.prixM2, source: 'médiane de la commune', ecart: prixM2Annonce / marche.prixM2 - 1 }
  return null
}

export interface Realisme {
  niveau: 'prudent' | 'réaliste' | 'optimiste'
  raison: string
  tauxHistorique: number | null // taux proposé pour remplacer l'hypothèse
}

const MARGE = 0.005
const pct = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')} %`

// Compare la hausse annuelle supposée du prix du bien à ce que la commune a réellement connu.
// La tendance longue (indice Notaires-INSEE) sert de référence quand elle existe ; l'historique de la commune,
// souvent court, sert sinon de repère.
export function realismeRevente(valorisation: number, marche: Marche | null, indice: Indice | null = null): Realisme | null {
  const croissances = [...(indice?.croissances ?? []), ...(marche?.croissances ?? [])]
  if (croissances.length === 0) return null
  const taux = croissances.map((c) => c.taux)
  const reference = croissances[0]
  const ou = indice ? `l'indice Notaires-INSEE (${indice.zone})` : `les prix à ${marche?.commune}`
  const periode = `${reference.de}-${reference.a}`
  const reserve = !indice && reference.a - reference.de < 5 ? ' Cette période est courte : c’est un repère, pas une prévision.' : ''
  if (valorisation > Math.max(...taux) + MARGE)
    return { niveau: 'optimiste', raison: `Vous supposez ${pct(valorisation)} de hausse par an, plus que tout ce qui a été constaté : ${ou} a évolué de ${pct(reference.taux)} par an sur ${periode}.${reserve}`, tauxHistorique: reference.taux }
  if (valorisation < Math.min(...taux) - MARGE)
    return { niveau: 'prudent', raison: `Vous supposez ${pct(valorisation)} de hausse par an, moins que tout ce qui a été constaté : ${ou} a évolué de ${pct(reference.taux)} par an sur ${periode}.${reserve}`, tauxHistorique: reference.taux }
  return { niveau: 'réaliste', raison: `Votre hypothèse de ${pct(valorisation)} par an reste dans la fourchette constatée : ${ou} a évolué de ${pct(reference.taux)} par an sur ${periode}.${reserve}`, tauxHistorique: reference.taux }
}

// ---------- Indice Notaires-INSEE des prix des logements anciens (tendance longue) ----------

export interface Indice {
  zone: string
  croissances: Croissance[] // sur 10 ans et 20 ans
}

const DEPARTEMENTS_IDF: Record<string, string> = { '77': 'Seine-et-Marne', '78': 'Yvelines', '91': 'Essonne', '92': 'Hauts-de-Seine', '93': 'Seine-Saint-Denis', '94': 'Val-de-Marne', '95': "Val-d'Oise" }

// Séries à essayer, de la plus précise à la plus large, pour une commune et un type de bien.
export function clesIndice(codeInsee: string, type: TypeBien): string[] {
  const t = type === 'maison' ? 'Maisons' : 'Appartements'
  const dep = codeInsee.slice(0, 2)
  if (dep === '75') return [`Paris|${t}`, `Île-de-France|${t}`]
  if (DEPARTEMENTS_IDF[dep]) return [`${DEPARTEMENTS_IDF[dep]}|${t}`, `Île-de-France|${t}`]
  const cles: string[] = []
  if (codeInsee === '69123' || codeInsee.startsWith('6938')) cles.push(`Lyon|${t}`)
  if (codeInsee === '13055' || codeInsee.startsWith('132')) cles.push(`Marseille|${t}`)
  return [...cles, `Province|${t}`]
}

export function analyserIndice(zone: string, serie: Record<string, number>): Indice | null {
  const annees = Object.keys(serie).map(Number).sort((x, y) => x - y)
  const derniere = annees[annees.length - 1]
  const croissances = [10, 20].filter((d) => serie[derniere - d] !== undefined).map((d) => ({ de: derniere - d, a: derniere, taux: Math.pow(serie[derniere] / serie[derniere - d], 1 / d) - 1 }))
  return croissances.length ? { zone, croissances } : null
}

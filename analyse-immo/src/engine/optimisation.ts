import { MODES, REGIMES_MEUBLE, REGIMES_NU } from './config'
import { coutAmeublement, fraisNotaire, modeCompatible, simuler } from './simulation'
import type { Bien, Gestion, Hypotheses, ModeLocation, Objectif, Profil, Regime, Resultat, Strategie } from './types'

export const PARTS_APPORT = [0, 0.1, 0.2, 0.3, 0.5, 1]
const GESTIONS: Gestion[] = ['directe', 'agence']

export function valeurObjectif(r: Resultat, objectif: Objectif): number {
  switch (objectif) {
    case 'tri':
      return r.tri ?? Number.POSITIVE_INFINITY
    case 'cashflow':
      return r.cashflowMensuelApresImpot
    case 'rentabilite':
      return r.rentaNetteNette
  }
}

export function comparer(objectif: Objectif) {
  return (a: Resultat, b: Resultat) => {
    if (a.endettementOk !== b.endettementOk) return a.endettementOk ? -1 : 1
    const d = valeurObjectif(b, objectif) - valeurObjectif(a, objectif)
    if (d !== 0 && !Number.isNaN(d)) return d
    return b.cashflowMensuelApresImpot - a.cashflowMensuelApresImpot
  }
}

export function regimesPour(mode: ModeLocation): Regime[] {
  return MODES[mode].meuble ? REGIMES_MEUBLE : REGIMES_NU
}

export function optionsApport(bien: Bien, mode: ModeLocation, profil: Profil): number[] {
  const cout = bien.prix + fraisNotaire(bien) + bien.fraisAgence + bien.travaux + (MODES[mode].meuble ? coutAmeublement(mode, bien) : 0)
  const options = PARTS_APPORT.map((p) => Math.round(p * cout)).filter((a) => a <= profil.apportDisponible)
  if (profil.apportDisponible > 0 && profil.apportDisponible < cout) options.push(Math.round(profil.apportDisponible))
  return [...new Set(options)].sort((a, b) => a - b)
}

export interface Optimisation {
  objectif: Objectif
  meilleur: Resultat
  parModeRegime: Resultat[] // meilleure combinaison financement / gestion pour chaque couple mode × régime
  parFinancement: Resultat[] // variantes de financement pour la stratégie retenue
  toutes: number
  aucuneFinancable: boolean
}

export function optimiser(bien: Bien, profil: Profil, h: Hypotheses, objectif: Objectif): Optimisation {
  const ordre = comparer(objectif)
  const durees = Object.keys(h.tauxCredit).map(Number)
  const resultats: Resultat[] = []
  const parCouple = new Map<string, Resultat>()

  for (const mode of Object.keys(MODES) as ModeLocation[]) {
    if (!modeCompatible(mode, bien)) continue
    for (const regime of regimesPour(mode)) {
      for (const gestion of GESTIONS) {
        for (const apport of optionsApport(bien, mode, profil)) {
          for (const duree of durees) {
            const s: Strategie = { mode, regime, gestion, financement: { apport, duree, taux: h.tauxCredit[duree] } }
            const r = simuler(bien, profil, h, s)
            resultats.push(r)
            const cle = `${mode}|${regime}`
            const actuel = parCouple.get(cle)
            if (!actuel || ordre(r, actuel) < 0) parCouple.set(cle, r)
          }
        }
      }
    }
  }
  if (resultats.length === 0) throw new Error('Aucun mode de location compatible avec ce bien')
  resultats.sort(ordre)
  const meilleur = resultats[0]
  const { mode, regime, gestion } = meilleur.strategie
  return {
    objectif,
    meilleur,
    parModeRegime: [...parCouple.values()].sort(ordre),
    parFinancement: resultats.filter((r) => r.strategie.mode === mode && r.strategie.regime === regime && r.strategie.gestion === gestion),
    toutes: resultats.length,
    aucuneFinancable: !meilleur.endettementOk,
  }
}

// ---------- Scénarios et sensibilité ----------

export interface Scenario {
  nom: 'Pessimiste' | 'Réaliste' | 'Optimiste'
  resultat: Resultat
  loyerNu: number // loyer vide mensuel retenu dans ce scénario
}

// fourchetteLoyer : loyers de marché bas et haut (loyer nu mensuel). Quand elle est connue, les scénarios pessimiste
// et optimiste visent le milieu entre le loyer retenu et chaque borne, au lieu d'un écart fixe.
export function scenarios(bien: Bien, profil: Profil, h: Hypotheses, s: Strategie, fourchetteLoyer?: { bas: number; haut: number } | null): Scenario[] {
  const borne = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
  const loyer = h.loyerNuMensuel
  const dPessimiste = fourchetteLoyer && loyer > 0 ? borne((loyer + fourchetteLoyer.bas) / 2 / loyer, 0.75, 0.97) : 0.9
  const dOptimiste = fourchetteLoyer && loyer > 0 ? borne((loyer + fourchetteLoyer.haut) / 2 / loyer, 1.02, 1.2) : 1.05
  const variante = (dLoyer: number, dVacance: number, valo: number, reval: number, dTaux: number): Resultat => {
    const loyersParMode = h.loyersParMode
      ? Object.fromEntries(Object.entries(h.loyersParMode).map(([k, v]) => [k, (v ?? 0) * dLoyer]))
      : undefined
    const h2: Hypotheses = {
      ...h,
      loyerNuMensuel: h.loyerNuMensuel * dLoyer,
      loyersParMode,
      vacanceSupplementaireMois: h.vacanceSupplementaireMois + dVacance,
      valorisationBien: valo,
      revalorisationLoyers: reval,
    }
    return simuler(bien, profil, h2, { ...s, financement: { ...s.financement, taux: s.financement.taux + dTaux } })
  }
  return [
    { nom: 'Pessimiste', resultat: variante(dPessimiste, 1, 0, 0.005, 0.0075), loyerNu: loyer * dPessimiste },
    { nom: 'Réaliste', resultat: simuler(bien, profil, h, s), loyerNu: loyer },
    { nom: 'Optimiste', resultat: variante(dOptimiste, -0.25, h.valorisationBien + 0.01, h.revalorisationLoyers + 0.005, -0.0025), loyerNu: loyer * dOptimiste },
  ]
}

export interface Sensibilite {
  libelle: string
  cashflowMensuel: number
  tri: number | null
}

export function sensibilites(bien: Bien, profil: Profil, h: Hypotheses, s: Strategie): Sensibilite[] {
  const run = (libelle: string, b: Bien, h2: Hypotheses, s2: Strategie): Sensibilite => {
    const r = simuler(b, profil, h2, s2)
    return { libelle, cashflowMensuel: r.cashflowMensuelApresImpot, tri: r.tri }
  }
  const loyers = (k: number): Hypotheses => ({
    ...h,
    loyerNuMensuel: h.loyerNuMensuel * k,
    loyersParMode: h.loyersParMode && Object.fromEntries(Object.entries(h.loyersParMode).map(([m, v]) => [m, (v ?? 0) * k])),
  })
  const taux = (d: number): Strategie => ({ ...s, financement: { ...s.financement, taux: s.financement.taux + d } })
  return [
    run('Hypothèse de base', bien, h, s),
    run('Loyer −10 %', bien, loyers(0.9), s),
    run('Loyer +10 %', bien, loyers(1.1), s),
    run('Vacance +1 mois par an', bien, { ...h, vacanceSupplementaireMois: h.vacanceSupplementaireMois + 1 }, s),
    run('Taux de crédit +1 point', bien, h, taux(0.01)),
    run('Prix d’achat −10 %', { ...bien, prix: bien.prix * 0.9 }, h, s),
    run('Travaux +30 %', { ...bien, travaux: bien.travaux * 1.3 }, h, s),
  ]
}

// Prix d'achat maximum pour lequel la stratégie atteint encore la cible.
export function prixMaximum(bien: Bien, profil: Profil, h: Hypotheses, s: Strategie, cible: { type: 'cashflow' | 'tri'; valeur: number }): number | null {
  const atteint = (prix: number) => {
    const r = simuler({ ...bien, prix }, profil, h, s)
    return cible.type === 'cashflow' ? r.cashflowMensuelApresImpot >= cible.valeur : (r.tri ?? Number.POSITIVE_INFINITY) >= cible.valeur
  }
  let bas = bien.prix * 0.2
  let haut = bien.prix * 2
  if (!atteint(bas)) return null
  if (atteint(haut)) return haut
  for (let i = 0; i < 40; i++) {
    const m = (bas + haut) / 2
    if (atteint(m)) bas = m
    else haut = m
  }
  return Math.floor(bas / 500) * 500
}

export type Verdict = 'Bonne opportunité' | 'À négocier' | 'À éviter'

// Verdict provisoire, avant l'arrivée du scoring multicritère (étape 3).
export function verdict(r: Resultat, prixMaxTri: number | null, prix: number): Verdict {
  const triV = r.tri ?? Number.POSITIVE_INFINITY
  if (triV >= 0.07 && r.cashflowMensuelApresImpot >= 0 && r.endettementOk) return 'Bonne opportunité'
  if (triV >= 0.04 || (prixMaxTri !== null && prixMaxTri >= prix * 0.85)) return 'À négocier'
  return 'À éviter'
}

export const TRI_CIBLE_DEFAUT = 0.07

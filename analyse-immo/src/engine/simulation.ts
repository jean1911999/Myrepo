import { BAREMES, DEFAUTS, INTERDICTIONS_DPE, MODES } from './config'
import { mensualite, tableauAmortissement } from './credit'
import { calculerImpots, impotPlusValueParticulier, impotSociete, type FluxFiscalAnnuel } from './fiscalite'
import { tri } from './tri'
import type { Annee, Bien, Hypotheses, ModeLocation, Profil, Resultat, Strategie } from './types'

export function hypothesesParDefaut(loyerNuMensuel: number): Hypotheses {
  return {
    loyerNuMensuel,
    revalorisationLoyers: DEFAUTS.revalorisationLoyers,
    revalorisationCharges: DEFAUTS.revalorisationCharges,
    valorisationBien: DEFAUTS.valorisationBien,
    vacanceSupplementaireMois: 0,
    fraisRevente: DEFAUTS.fraisRevente,
    pno: DEFAUTS.pno,
    entretien: DEFAUTS.entretien,
    horizon: DEFAUTS.horizon,
    tauxCredit: { 15: 0.031, 20: 0.0325, 25: 0.034 },
    assuranceEmprunteur: DEFAUTS.assuranceEmprunteur,
    fraisGarantie: DEFAUTS.fraisGarantie,
    fraisDossier: DEFAUTS.fraisDossier,
  }
}

export function loyerMensuel(mode: ModeLocation, h: Hypotheses): number {
  return h.loyersParMode?.[mode] ?? h.loyerNuMensuel * MODES[mode].coefLoyer
}

export function coutAmeublement(mode: ModeLocation, bien: Bien): number {
  const p = MODES[mode]
  const chambres = Math.max(bien.pieces - 1, 2)
  return p.ameublementFixe + p.ameublementParM2 * bien.surface + p.ameublementParChambre * (p.ameublementParChambre ? chambres : 0)
}

export function fraisNotaire(bien: Bien): number {
  return bien.prix * (bien.neuf ? DEFAUTS.fraisNotaireNeuf : DEFAUTS.fraisNotaireAncien)
}

export function modeCompatible(mode: ModeLocation, bien: Bien): boolean {
  if (bien.type === 'parking') return mode === 'nu'
  return bien.pieces >= MODES[mode].piecesMin
}

export function alertesDpe(bien: Bien, anneeCourante = new Date().getFullYear()): string[] {
  if (!bien.dpe) return ['DPE non renseigné : impossible de vérifier que le bien reste louable.']
  const interdiction = INTERDICTIONS_DPE[bien.dpe]
  if (!interdiction) return []
  const alertes: string[] = []
  if (interdiction <= anneeCourante) alertes.push(`DPE ${bien.dpe} : location interdite depuis ${interdiction}. Travaux de rénovation énergétique obligatoires avant de louer.`)
  else alertes.push(`DPE ${bien.dpe} : location interdite à partir de ${interdiction}. Prévoir des travaux de rénovation énergétique.`)
  if (bien.dpe === 'F' || bien.dpe === 'G') alertes.push(`DPE ${bien.dpe} : loyers gelés (aucune révision ni augmentation possible).`)
  return alertes
}

export function simuler(bien: Bien, profil: Profil, h: Hypotheses, s: Strategie): Resultat {
  const mode = MODES[s.mode]
  const alertes: string[] = []
  const H = h.horizon
  const meuble = mode.meuble
  if ((s.regime === 'microBic' || s.regime === 'lmnpReel') && !meuble) throw new Error('Régime meublé incompatible avec une location nue')
  if ((s.regime === 'microFoncier' || s.regime === 'reelFoncier') && meuble) throw new Error('Régime foncier incompatible avec une location meublée')

  const notaire = fraisNotaire(bien)
  const ameublement = meuble ? coutAmeublement(s.mode, bien) : 0
  const coutHorsBanque = bien.prix + notaire + bien.fraisAgence + bien.travaux + ameublement

  // Les frais de garantie dépendent du montant emprunté, lui-même fonction du coût total.
  let apport = Math.max(0, s.financement.apport)
  let emprunt = (coutHorsBanque + h.fraisDossier - apport) / (1 - h.fraisGarantie)
  let fraisBancaires = h.fraisDossier + emprunt * h.fraisGarantie
  if (apport >= coutHorsBanque || emprunt <= 0) {
    emprunt = 0
    fraisBancaires = 0
    apport = coutHorsBanque
  }
  const coutTotal = coutHorsBanque + fraisBancaires

  const { taux, duree } = s.financement
  const mens = mensualite(emprunt, taux, duree)
  const assuranceAnnuelle = emprunt * h.assuranceEmprunteur
  const amort = tableauAmortissement(emprunt, taux, duree, H)

  const loyerM = loyerMensuel(s.mode, h)
  const moisLoues = Math.max(0, 12 - mode.vacanceMois - h.vacanceSupplementaireMois)
  const gestionPct = s.gestion === 'agence' ? mode.gestionAgence : 0
  const comptabilite = s.regime === 'lmnpReel' ? DEFAUTS.comptabilite.lmnpReel : s.regime === 'sciIs' ? DEFAUTS.comptabilite.sciIs : 0
  const partTerrain = DEFAUTS.partTerrain[bien.type]
  const { bati: dBati, mobilier: dMob, travaux: dTrav } = DEFAUTS.dureeAmortissement
  const amortissable = s.regime === 'lmnpReel' || s.regime === 'sciIs'

  const flux: FluxFiscalAnnuel[] = []
  const lignes: Omit<Annee, 'impot' | 'cashflowApresImpot' | 'patrimoineNet'>[] = []
  for (let a = 1; a <= H; a++) {
    const rL = Math.pow(1 + h.revalorisationLoyers, a - 1)
    const rC = Math.pow(1 + h.revalorisationCharges, a - 1)
    // Pendant les travaux de départ, le bien n'est pas loué : mois de loyer perdus la première année.
    const loyers = loyerM * (a === 1 ? Math.max(0, moisLoues - (bien.moisTravaux ?? 0)) : moisLoues) * rL
    const charges =
      (bien.chargesCopro * (1 - bien.partChargesRecuperables) + bien.taxeFonciere + h.pno + mode.chargesSpecifiques) * rC +
      loyers * (h.entretien + gestionPct) +
      comptabilite +
      (meuble && a > 1 ? DEFAUTS.cfe : 0)
    const l = amort[a - 1]
    const enCours = a <= duree
    const assurance = enCours ? assuranceAnnuelle : 0
    const mensualitesAnnuelles = l.interets + l.capital
    flux.push({
      loyers,
      chargesExploitation: charges,
      interets: l.interets,
      assurance,
      fraisPonctuels: a === 1 ? fraisBancaires + (amortissable ? notaire + bien.fraisAgence : 0) : 0,
      travauxDeductibles: a === 1 && s.regime === 'reelFoncier' ? bien.travaux : 0,
      amortissementBati: amortissable && a <= dBati ? (bien.prix * (1 - partTerrain)) / dBati : 0,
      amortissementMobilier: amortissable && a <= dMob ? ameublement / dMob : 0,
      amortissementTravaux: amortissable && a <= dTrav ? bien.travaux / dTrav : 0,
    })
    lignes.push({
      annee: a,
      loyers,
      charges,
      interets: l.interets,
      assurance,
      capitalRembourse: l.capital,
      mensualitesAnnuelles,
      cashflowAvantImpot: loyers - charges - mensualitesAnnuelles - assurance,
      capitalRestantDu: l.capitalRestantDu,
      valeurBien: bien.prix * Math.pow(1 + h.valorisationBien, a),
    })
  }

  const fiscal = calculerImpots(s.regime, flux, profil.tmi)
  alertes.push(...fiscal.alertes)

  let cumul = 0
  const annees: Annee[] = lignes.map((l, i) => {
    const impot = fiscal.impots[i]
    const cashflowApresImpot = l.cashflowAvantImpot - impot
    cumul += cashflowApresImpot
    return { ...l, impot, cashflowApresImpot, patrimoineNet: l.valeurBien - l.capitalRestantDu + cumul }
  })

  // Revente à l'horizon
  const derniere = annees[H - 1]
  const prixVente = derniere.valeurBien
  const fraisVente = prixVente * h.fraisRevente
  const crd = derniere.capitalRestantDu
  let impotPlusValue: number
  const fluxInvestisseur: number[] = [-apport]

  if (s.regime === 'sciIs') {
    // Les excédents restent dans la société ; l'associé comble les déficits en compte courant.
    const vnc = bien.prix + bien.travaux + ameublement - fiscal.amortissementsDeduits
    impotPlusValue = impotSociete(prixVente - fraisVente - vnc)
    let tresorerie = 0
    let comptesCourants = 0
    for (const a of annees) {
      const cf = a.cashflowApresImpot
      if (cf >= 0) tresorerie += cf
      else comptesCourants += -cf
      fluxInvestisseur.push(Math.min(0, cf))
    }
    const actifNet = tresorerie + prixVente - fraisVente - crd - impotPlusValue
    const boni = Math.max(0, actifNet - comptesCourants - apport)
    const impotDistribution = boni * BAREMES.pfu
    impotPlusValue += impotDistribution
    fluxInvestisseur[H] += actifNet - impotDistribution
    alertes.push('SCI à l’IS : les excédents restent dans la société jusqu’à la revente ; leur distribution est taxée au prélèvement forfaitaire (30 %).')
  } else {
    impotPlusValue = impotPlusValueParticulier({
      prixVente,
      fraisVente,
      prixAchat: bien.prix,
      fraisAcquisitionReels: s.regime === 'lmnpReel' ? 0 : notaire + bien.fraisAgence,
      travauxNonDeduits: s.regime === 'reelFoncier' ? 0 : bien.travaux,
      dureeDetention: H,
      amortissementsReintegres: s.regime === 'lmnpReel' ? fiscal.amortissementsBatiDeduits : 0,
    }).impot
    for (const a of annees) fluxInvestisseur.push(a.cashflowApresImpot)
    fluxInvestisseur[H] += prixVente - fraisVente - crd - impotPlusValue
  }

  const a1 = annees[0]
  const impotMoyen = annees.reduce((s2, a) => s2 + a.impot, 0) / H
  const cfMoyen = annees.reduce((s2, a) => s2 + a.cashflowApresImpot, 0) / H
  const effortMoyen = annees.reduce((s2, a) => s2 + Math.max(0, -a.cashflowApresImpot), 0) / H

  let tauxEndettement: number | null = null
  let endettementOk = true
  if (profil.revenusMensuels > 0) {
    const { tauxEndettementMax, partLoyersRetenue } = BAREMES.hcsf
    tauxEndettement = (profil.mensualitesExistantes + mens + assuranceAnnuelle / 12) / (profil.revenusMensuels + partLoyersRetenue * loyerM)
    endettementOk = tauxEndettement <= tauxEndettementMax + 1e-9
    if (!endettementOk) alertes.push(`Taux d’endettement de ${(tauxEndettement * 100).toFixed(1)} % : au-dessus de la limite bancaire de 35 %.`)
  }
  if (apport > profil.apportDisponible + 1e-6) alertes.push('Apport supérieur à l’apport disponible.')

  return {
    strategie: { ...s, financement: { ...s.financement, apport } },
    coutTotal,
    montantEmprunte: emprunt,
    mensualiteCredit: mens,
    mensualiteAssurance: assuranceAnnuelle / 12,
    ameublement,
    rentaBrute: (loyerM * 12) / (bien.prix + bien.fraisAgence),
    rentaNette: (a1.loyers - a1.charges) / coutTotal,
    rentaNetteNette: (a1.loyers - a1.charges - impotMoyen) / coutTotal,
    cashflowMensuelAvantImpot: a1.cashflowAvantImpot / 12,
    cashflowMensuelApresImpot: cfMoyen / 12,
    effortEpargneMensuel: effortMoyen / 12,
    tri: tri(fluxInvestisseur),
    plusValueNette: prixVente - fraisVente - (bien.prix + notaire + bien.fraisAgence + bien.travaux) - impotPlusValue,
    impotPlusValue,
    tauxEndettement,
    endettementOk,
    annees,
    alertes,
  }
}

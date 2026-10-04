import { DEFAUTS, MODES, PART_VALEUR_LOCATIVE, type Bien, type Hypotheses, type Resultat } from '../engine'
import type { DonneesMarche } from './Marche'
import { euros, pourcent } from './format'

interface Ligne {
  hypothese: string
  valeur: string
  repere: string
  source: string
  type: 'donnée publique' | 'valeur par défaut' | 'annonce ou saisie'
}

// Toutes les hypothèses du calcul, avec ce sur quoi elles reposent : donnée publique, annonce, ou valeur par défaut de l'outil.
export function SourcesHypotheses({ bien, hypotheses, m, donnees }: { bien: Bien; hypotheses: Hypotheses; m: Resultat; donnees: DonneesMarche }) {
  const { loyer, taxeFonciere, indice, marche } = donnees
  const mode = MODES[m.strategie.mode]
  const fourchette = (bas: number, haut: number) => `de ${euros(bas)} à ${euros(haut)}`
  const lignes: Ligne[] = [
    {
      hypothese: 'Loyer vide, hors charges',
      valeur: `${euros(hypotheses.loyerNuMensuel)} par mois`,
      repere: loyer ? `${euros(loyer.loyer)} (${fourchette(loyer.bas, loyer.haut)})${loyer.plafond !== undefined ? `, plafond légal ${euros(loyer.plafond)}` : ''}` : 'Aucun repère pour cette commune',
      source: loyer?.source ?? 'Saisie',
      type: loyer ? 'donnée publique' : 'annonce ou saisie',
    },
    ...(loyer?.autres ?? []).map(
      (a): Ligne => ({ hypothese: 'Loyer vide, autre repère', valeur: '—', repere: `${euros(a.loyer)} (${fourchette(a.bas, a.haut)})`, source: a.source, type: 'donnée publique' }),
    ),
    ...(loyer?.meuble !== undefined
      ? [{ hypothese: 'Loyer meublé', valeur: `${euros(hypotheses.loyersParMode?.meuble ?? hypotheses.loyerNuMensuel * MODES.meuble.coefLoyer)} par mois`, repere: `${euros(loyer.meuble)} (loyer de référence meublé)`, source: loyer.source, type: 'donnée publique' } satisfies Ligne]
      : [{ hypothese: 'Loyers meublé, colocation, étudiant, mobilité', valeur: 'Loyer vide × coefficient', repere: 'Meublé +12 %, colocation +30 %, étudiant +15 %, mobilité +25 %', source: 'Coefficients de l’outil, sauf loyers saisis', type: 'valeur par défaut' } satisfies Ligne]),
    {
      hypothese: 'Taxe foncière',
      valeur: `${euros(bien.taxeFonciere)} par an`,
      repere: taxeFonciere ? `${euros(taxeFonciere.montant)} (${fourchette(taxeFonciere.bas, taxeFonciere.haut)})` : 'Aucun repère',
      source: taxeFonciere
        ? `Taux voté 2025 de ${String(taxeFonciere.taux).replace('.', ',')} % (DGFiP) × base estimée : la moitié d'une valeur locative supposée égale à ${pourcent(PART_VALEUR_LOCATIVE)} du loyer de marché annuel. Estimation à ±40 %.`
        : 'Annonce ou saisie',
      type: taxeFonciere ? 'donnée publique' : 'annonce ou saisie',
    },
    {
      hypothese: 'Hausse annuelle du prix du bien',
      valeur: pourcent(hypotheses.valorisationBien),
      repere: indice ? indice.croissances.map((c) => `${pourcent(c.taux)} par an de ${c.de} à ${c.a}`).join(', ') : marche?.croissances.length ? `${pourcent(marche.croissances[0].taux)} par an dans la commune` : 'Aucun repère',
      source: indice ? `Indice Notaires-INSEE des logements anciens (${indice.zone})` : marche ? 'Prix médians DVF de la commune' : 'Valeur par défaut',
      type: indice || marche ? 'donnée publique' : 'valeur par défaut',
    },
    {
      hypothese: 'Prix d’achat au m²',
      valeur: bien.surface > 0 ? euros(bien.prix / bien.surface) : '—',
      repere: marche ? `${euros(marche.prixM2)} (médiane ${marche.annee} de ${marche.commune})${donnees.comparables.length ? `, ${donnees.comparables.length} ventes proches` : ''}` : 'Aucun repère',
      source: 'DVF, actes notariés publiés par la DGFiP',
      type: marche ? 'donnée publique' : 'annonce ou saisie',
    },
    { hypothese: 'Charges de copropriété', valeur: `${euros(bien.chargesCopro)} par an`, repere: '25 € par m² et par an quand l’annonce ne dit rien', source: 'Annonce, sinon valeur par défaut de l’outil', type: 'annonce ou saisie' },
    {
      hypothese: 'Taux de crédit',
      valeur: Object.entries(hypotheses.tauxCredit)
        .map(([d, t]) => `${pourcent(t)} sur ${d} ans`)
        .join(', '),
      repere: 'Pessimiste : +0,75 point',
      source: 'Valeurs de l’outil, à mettre à jour à la main avec une offre de banque ou de courtier',
      type: 'valeur par défaut',
    },
    {
      hypothese: 'Mois sans locataire',
      valeur: `${String(mode.vacanceMois + hypotheses.vacanceSupplementaireMois).replace('.', ',')} mois par an (${mode.libelle.toLowerCase()})`,
      repere: 'Pessimiste : un mois de plus',
      source: 'Valeur par défaut de l’outil selon le mode de location',
      type: 'valeur par défaut',
    },
    { hypothese: 'Frais de notaire', valeur: pourcent(bien.neuf ? DEFAUTS.fraisNotaireNeuf : DEFAUTS.fraisNotaireAncien), repere: 'Environ 7 à 8 % dans l’ancien, 2 à 3 % dans le neuf', source: 'Valeur par défaut de l’outil', type: 'valeur par défaut' },
    {
      hypothese: 'Assurance propriétaire, entretien, hausse des charges',
      valeur: `${euros(hypotheses.pno)} par an, ${pourcent(hypotheses.entretien)} des loyers, ${pourcent(hypotheses.revalorisationCharges)} par an`,
      repere: '—',
      source: 'Valeurs par défaut de l’outil',
      type: 'valeur par défaut',
    },
  ]
  return (
    <article className="bloc">
      <h2>Hypothèses et sources</h2>
      <p className="aide">Chaque chiffre du calcul, et ce sur quoi il repose. Tout se modifie dans « Ajuster les données ».</p>
      <div className="tableau-defilant">
        <table className="table-sources">
          <thead>
            <tr>
              <th>Hypothèse</th>
              <th>Valeur retenue</th>
              <th>Repère et fourchette</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.hypothese + l.source}>
                <td>{l.hypothese}</td>
                <td>
                  <strong>{l.valeur}</strong>
                </td>
                <td>{l.repere}</td>
                <td>
                  <span className={`etiquette-source etiquette-${l.type === 'donnée publique' ? 'bon' : l.type === 'valeur par défaut' ? 'moyen' : 'neutre'}`}>{l.type}</span> {l.source}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  )
}

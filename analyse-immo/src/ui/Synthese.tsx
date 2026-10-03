import { LIBELLES_REGIMES, MODES, loyerMensuel, type Bien, type Hypotheses, type Optimisation, type Regime, type Resultat, type Scenario } from '../engine'
import { euros, pourcent, signe, triTexte } from './format'
import { GrapheFlux } from './Graphiques'

const EXPLICATION_REGIME: Record<Regime, string> = {
  microFoncier: 'un abattement forfaitaire de 30 % sur les loyers, sans comptabilité à tenir',
  reelFoncier: 'la déduction des charges réelles, des intérêts d’emprunt et des travaux',
  microBic: 'un abattement forfaitaire de 50 % sur les loyers, sans comptabilité à tenir',
  lmnpReel: 'la déduction des charges et de l’amortissement du bien et des meubles, ce qui efface l’essentiel de l’impôt sur les loyers',
  sciIs: 'l’impôt sur les sociétés, avec amortissement du bien, mais une revente plus taxée',
}

const libelle = (r: Resultat) => `${MODES[r.strategie.mode].libelle} · ${LIBELLES_REGIMES[r.strategie.regime]}`
const impotMoyen = (r: Resultat) => r.annees.reduce((s, a) => s + a.impot, 0) / r.annees.length

// Revente à l'horizon, nette des frais, du crédit restant et de l'impôt sur la plus-value.
function reventeNette(r: Resultat, h: Hypotheses) {
  const d = r.annees[r.annees.length - 1]
  return { prixVente: d.valeurBien, frais: d.valeurBien * h.fraisRevente, credit: d.capitalRestantDu, impot: r.impotPlusValue, net: d.valeurBien * (1 - h.fraisRevente) - d.capitalRestantDu - r.impotPlusValue }
}

interface Props {
  bien: Bien
  hypotheses: Hypotheses
  o: Optimisation
  sc: Scenario[]
  prixMaxTri: number | null
}

export function Synthese({ bien, hypotheses, o, sc, prixMaxTri }: Props) {
  const m = o.meilleur
  const s = m.strategie
  const f = s.financement
  const H = hypotheses.horizon
  const cf = m.cashflowMensuelApresImpot
  const vente = reventeNette(m, hypotheses)
  const totalVerse = f.apport + m.annees.reduce((t, a) => t + Math.max(0, -a.cashflowApresImpot), 0)
  const totalRecu = m.annees.reduce((t, a) => t + Math.max(0, a.cashflowApresImpot), 0) + vente.net

  const autreMode = o.parModeRegime.find((r) => r.strategie.mode !== s.mode)
  const autreRegime = o.parModeRegime.find((r) => r.strategie.mode === s.mode && r.strategie.regime !== s.regime)
  const financables = o.parFinancement.filter((r) => r.endettementOk)
  const plusProche = [...(financables.length ? financables : o.parFinancement)].sort((a, b) => b.cashflowMensuelApresImpot - a.cashflowMensuelApresImpot)[0]
  const autres = o.parModeRegime.slice(1, 4)
  const loyerRetenu = loyerMensuel(s.mode, hypotheses)

  return (
    <article className="bloc">
      <h2>Synthèse de l'analyse</h2>
      <p className="conseil">
        Au prix affiché de <strong>{euros(bien.prix)}</strong>, le projet coûte <strong>{euros(m.coutTotal)}</strong> tout compris (frais de notaire, travaux{m.ameublement > 0 ? ', meubles' : ''}, frais de banque). Avec un loyer de{' '}
        <strong>{euros(loyerRetenu)} par mois</strong>, {cf >= 0 ? `il vous reste en moyenne ${euros(cf)} par mois` : `vous devez remettre en moyenne ${euros(-cf)} par mois de votre poche`}. Sur {H} ans, vous versez au total{' '}
        <strong>{euros(totalVerse)}</strong> et vous récupérez <strong>{euros(totalRecu)}</strong>, revente comprise : c'est un rendement de <strong>{triTexte(m.tri)}</strong> par an. Si les choses se passent mal (loyers plus bas, taux plus haut, bien
        qui ne prend pas de valeur), ce rendement tombe à <strong>{triTexte(sc[0].resultat.tri)}</strong>.
        {prixMaxTri !== null && prixMaxTri < bien.prix && (
          <>
            {' '}
            Pour que l'opération devienne vraiment intéressante, il faudrait l'acheter <strong>{euros(prixMaxTri)}</strong> au plus.
          </>
        )}
      </p>

      <h3>Le choix optimal</h3>
      <p className="conseil">
        Louer en <strong>{MODES[s.mode].libelle.toLowerCase()}</strong>, sous le régime fiscal <strong>{LIBELLES_REGIMES[s.regime]}</strong>, {s.gestion === 'agence' ? 'en confiant la gestion à une agence' : 'en gérant vous-même la location'}. Apporter{' '}
        <strong>{euros(f.apport)}</strong> et emprunter <strong>{euros(m.montantEmprunte)}</strong> sur <strong>{f.duree} ans</strong>, soit <strong>{euros(m.mensualiteCredit + m.mensualiteAssurance)} par mois</strong> de crédit, assurance comprise.
      </p>

      <h3>Pourquoi ce choix</h3>
      <ul className="raisons">
        <li>
          <strong>Mode de location.</strong> {MODES[s.mode].libelle} : loyer de {euros(loyerRetenu)} par mois
          {s.mode !== 'nu' && `, contre ${euros(loyerMensuel('nu', hypotheses))} en location vide`}.
          {autreMode && ` Le meilleur autre mode (${libelle(autreMode)}) donne un rendement de ${triTexte(autreMode.tri)} et ${signe(autreMode.cashflowMensuelApresImpot)} par mois, contre ${triTexte(m.tri)} et ${signe(cf)} ici.`}
        </li>
        <li>
          <strong>Régime fiscal.</strong> {LIBELLES_REGIMES[s.regime]} : {EXPLICATION_REGIME[s.regime]}. Impôt moyen de {euros(impotMoyen(m))} par an
          {autreRegime && `, contre ${euros(impotMoyen(autreRegime))} par an avec ${LIBELLES_REGIMES[autreRegime.strategie.regime]}`}.
        </li>
        <li>
          <strong>Financement.</strong> Apport de {euros(f.apport)} et prêt sur {f.duree} ans : c'est la combinaison qui donne le meilleur résultat pour votre objectif parmi celles que la banque peut accepter.
          {plusProche &&
            plusProche !== m &&
            ` Pour alléger l'effort mensuel, un apport de ${euros(plusProche.strategie.financement.apport)} sur ${plusProche.strategie.financement.duree} ans donnerait ${signe(plusProche.cashflowMensuelApresImpot)} par mois, pour un rendement de ${triTexte(plusProche.tri)}.`}
        </li>
        <li>
          <strong>Gestion.</strong>{' '}
          {s.gestion === 'agence'
            ? `Une agence coûte ${pourcent(MODES[s.mode].gestionAgence)} des loyers, mais reste la meilleure option ici.`
            : `Gérer vous-même évite les frais d'agence (${pourcent(MODES[s.mode].gestionAgence)} des loyers), au prix de votre temps.`}
        </li>
      </ul>

      {autres.length > 0 && (
        <>
          <h3>Les options écartées les plus proches</h3>
          <ul className="raisons">
            {autres.map((r) => (
              <li key={libelle(r)}>
                {libelle(r)} : rendement de {triTexte(r.tri)}, {signe(r.cashflowMensuelApresImpot)} par mois.
              </li>
            ))}
          </ul>
        </>
      )}
      {o.aucuneFinancable && <p className="alerte">Attention : avec vos revenus, la banque risque de refuser ce crédit (endettement supérieur à 35 %).</p>}
    </article>
  )
}

export function TableauFlux({ m, hypotheses }: { m: Resultat; hypotheses: Hypotheses }) {
  const vente = reventeNette(m, hypotheses)
  const apport = m.strategie.financement.apport
  const H = m.annees.length
  const nets = m.annees.map((y) => y.cashflowApresImpot + (y.annee === H ? vente.net : 0))
  const lignes = m.annees.map((y, i) => ({
    ...y,
    credit: y.mensualitesAnnuelles + y.assurance,
    revente: y.annee === H ? vente.net : 0,
    net: nets[i],
    cumul: nets.slice(0, i + 1).reduce((t, v) => t + v, -apport),
  }))
  const cumul = lignes[H - 1].cumul
  const somme = (f: (l: (typeof lignes)[number]) => number) => lignes.reduce((t, l) => t + f(l), 0)
  const montant = (v: number) => (Math.round(v) === 0 ? '—' : signe(v))

  return (
    <article className="bloc">
      <h2>Vos flux d'argent, année par année</h2>
      <p className="aide">Les montants positifs entrent dans votre poche, les négatifs en sortent. L'année 0 est le jour de l'achat.</p>
      <GrapheFlux m={m} hypotheses={hypotheses} />
      <div className="tableau-defilant">
        <table>
          <thead>
            <tr>
              <th>Année</th>
              <th className="num">Investissement</th>
              <th className="num">Loyers</th>
              <th className="num">Charges</th>
              <th className="num">Crédit</th>
              <th className="num">Impôts</th>
              <th className="num">Revente</th>
              <th className="num">Flux net</th>
              <th className="num">Cumul</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>0</td>
              <td className="num">{montant(-apport)}</td>
              <td className="num">—</td>
              <td className="num">—</td>
              <td className="num">—</td>
              <td className="num">—</td>
              <td className="num">—</td>
              <td className="num">{montant(-apport)}</td>
              <td className="num">{montant(-apport)}</td>
            </tr>
            {lignes.map((l) => (
              <tr key={l.annee}>
                <td>{l.annee}</td>
                <td className="num">—</td>
                <td className="num texte-bon">{montant(l.loyers)}</td>
                <td className="num">{montant(-l.charges)}</td>
                <td className="num">{montant(-l.credit)}</td>
                <td className="num">{montant(-l.impot)}</td>
                <td className="num">{montant(l.revente)}</td>
                <td className={`num ${l.net >= 0 ? 'texte-bon' : 'texte-mauvais'}`}>{montant(l.net)}</td>
                <td className="num">{montant(l.cumul)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="ligne-retenue">
              <td>Total</td>
              <td className="num">{montant(-apport)}</td>
              <td className="num">{montant(somme((l) => l.loyers))}</td>
              <td className="num">{montant(-somme((l) => l.charges))}</td>
              <td className="num">{montant(-somme((l) => l.credit))}</td>
              <td className="num">{montant(-somme((l) => l.impot))}</td>
              <td className="num">{montant(vente.net)}</td>
              <td className="num">{montant(cumul)}</td>
              <td className="num">{montant(cumul)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="aide">
        Investissement : votre apport de départ ; le reste du coût ({euros(m.coutTotal)}) est payé par le prêt. Revente en année {H} : prix de vente de {euros(vente.prixVente)}, moins {euros(vente.frais)} de frais, {euros(vente.credit)} de crédit restant à
        rembourser et {euros(vente.impot)} d'impôt sur la plus-value.
        {m.strategie.regime === 'sciIs' && ' En SCI à l’IS, les excédents annuels restent dans la société jusqu’à la revente.'}
      </p>
    </article>
  )
}

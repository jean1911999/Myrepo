import { useMemo } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  TRI_CIBLE_DEFAUT,
  alertesDpe,
  calculerFiabilite,
  calculerScore,
  optimiser,
  prixMaximum,
  referenceMarche,
  scenarios,
  sensibilites,
  type Bien,
  type Hypotheses,
  type Objectif,
  type Profil,
} from '../engine'
import { BlocFiabilite, DetailScore, Jauge } from './Score'
import { Synthese, TableauFlux } from './Synthese'
import { Ameliorations, Lexique, Negociation, RaisonsPrincipales, TriRevente, type Amelioration } from './Decision'
import type { Entree, Resume } from './Historique'
import { SourcesHypotheses } from './Sources'
import { BlocRevente, VentesProches, type DonneesMarche } from './Marche'
import { BudgetMensuel, CascadeRevente, CoutProjet, GrapheScenarios, GrapheSensibilite } from './Graphiques'
import { LIBELLES_CHAMPS, type ChampAnnonce } from '../extraction/extraire'
import { euros, pourcent, signe, triTexte } from './format'

interface Props {
  bien: Bien
  profil: Profil
  hypotheses: Hypotheses
  objectif: Objectif
  donneesExemple: boolean
  estimes: ChampAnnonce[]
  donneesMarche: DonneesMarche
  onValorisation: (taux: number) => void
  historique: Entree[]
  onEnregistrer: (r: Resume) => void
}

type Entrees = Pick<Props, 'bien' | 'profil' | 'hypotheses' | 'objectif' | 'donneesExemple' | 'estimes' | 'donneesMarche'>

function analyserBase({ bien, profil, hypotheses, objectif, donneesExemple, estimes, donneesMarche }: Entrees) {
  // Position du prix au m² par rapport au marché local (ventes comparables, sinon médiane de la commune).
  const reference = bien.surface > 0 ? referenceMarche(bien.prix / bien.surface, donneesMarche.marche, donneesMarche.comparables) : null
  const ecart = reference?.ecart ?? null
  const o = optimiser(bien, profil, hypotheses, objectif)
  const s = o.meilleur.strategie
  const prixMaxCf = prixMaximum(bien, profil, hypotheses, s, { type: 'cashflow', valeur: 0 })
  const prixMaxTri = prixMaximum(bien, profil, hypotheses, s, { type: 'tri', valeur: TRI_CIBLE_DEFAUT })
  const sc = scenarios(bien, profil, hypotheses, s, donneesMarche.loyer)
  const pessimiste = sc[0].resultat
  const score = calculerScore(o.meilleur, pessimiste, prixMaxTri, bien, ecart)
  const fiabilite = calculerFiabilite({
    bien,
    modeRetenu: s.mode,
    loyerModeSaisi: (hypotheses.loyersParMode?.[s.mode] ?? 0) > 0,
    donneesExemple,
    loyerEstime: estimes.includes('loyer'),
    champsEstimes: estimes.filter((c) => c !== 'loyer').map((c) => LIBELLES_CHAMPS[c]),
    loyerMarche: donneesMarche.loyer,
    loyerNu: hypotheses.loyerNuMensuel,
    marche: reference === null ? null : reference.source === 'médiane de la commune' ? 'commune' : 'comparables',
    scorePessimiste: calculerScore(pessimiste, pessimiste, prixMaxTri, bien, ecart).total,
    scoreOptimiste: calculerScore(sc[2].resultat, pessimiste, prixMaxTri, bien, ecart).total,
  })
  return {
    o,
    sc,
    sens: sensibilites(bien, profil, hypotheses, s),
    prixMaxCf,
    prixMaxTri,
    score,
    fiabilite,
    reference,
    alertes: [...new Set([...alertesDpe(bien), ...o.meilleur.alertes, ...alerteEncadrement(hypotheses.loyerNuMensuel, donneesMarche.loyer?.plafond)])],
  }
}


// Encadrement des loyers : au-delà du loyer de référence majoré, le loyer est illégal (hors complément de loyer).
const alerteEncadrement = (loyer: number, plafond?: number) =>
  plafond !== undefined && loyer > plafond ? [`Loyer de ${euros(loyer)} par mois au-dessus du plafond de l'encadrement des loyers (${euros(plafond)} pour l'époque de construction la plus contraignante) : vérifiez l'époque de l'immeuble, un loyer supérieur au plafond est illégal.`] : []

// Variantes rejouées pour montrer ce qui ferait monter le score.
function analyser(p: Entrees) {
  const a = analyserBase(p)
  const { bien, hypotheses } = p
  const scoreDe = (b: Bien, h: Hypotheses) => {
    try {
      return analyserBase({ ...p, bien: b, hypotheses: h }).score.total
    } catch {
      return null
    }
  }
  const ameliorations: Amelioration[] = []
  const ajouter = (libelle: string, score: number | null, note?: string) => {
    if (score !== null && score > a.score.total) ameliorations.push({ libelle, score, note })
  }
  if (a.prixMaxTri !== null && a.prixMaxTri < bien.prix) ajouter(`Acheter ${euros(a.prixMaxTri)} au lieu de ${euros(bien.prix)}`, scoreDe({ ...bien, prix: a.prixMaxTri }, hypotheses))
  ajouter('Acheter 5 % moins cher', scoreDe({ ...bien, prix: bien.prix * 0.95 }, hypotheses))
  const loyersPlus: Hypotheses = {
    ...hypotheses,
    loyerNuMensuel: hypotheses.loyerNuMensuel * 1.1,
    loyersParMode: hypotheses.loyersParMode && Object.fromEntries(Object.entries(hypotheses.loyersParMode).map(([k, v]) => [k, (v ?? 0) * 1.1])),
  }
  ajouter('Louer 10 % plus cher', scoreDe(bien, loyersPlus))
  if (bien.dpe === 'E' || bien.dpe === 'F' || bien.dpe === 'G') ajouter(`Passer le DPE de ${bien.dpe} à D par des travaux`, scoreDe({ ...bien, dpe: 'D' }, hypotheses), '(coût des travaux non compté)')
  if (bien.travaux > 0) ajouter('Réduire les travaux de moitié', scoreDe({ ...bien, travaux: bien.travaux / 2 }, hypotheses))
  return { ...a, ameliorations }
}

export function Rapport(props: Props) {
  const a = useMemo(() => {
    try {
      return analyser(props)
    } catch (e) {
      return { erreur: e instanceof Error ? e.message : 'Analyse impossible' }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.bien, props.profil, props.hypotheses, props.objectif, props.donneesExemple, props.estimes, props.donneesMarche])

  if ('erreur' in a) {
    return (
      <section className="rapport">
        <p className="alerte">Analyse impossible : {a.erreur}. Vérifiez le prix, la surface et le loyer.</p>
      </section>
    )
  }

  const m = a.o.meilleur
  const f = m.strategie.financement
  const cf = m.cashflowMensuelApresImpot
  const patrimoineFinal = m.annees[m.annees.length - 1].patrimoineNet
  const prix = props.bien.prix
  const rabais = a.prixMaxTri === null ? null : 1 - a.prixMaxTri / prix
  const prixPropose = a.prixMaxTri === null ? null : Math.min(a.prixMaxTri, prix)
  const mieuxQue = props.historique.filter((e) => e.score < a.score.total).length
  const donneesGraphe = m.annees.map((y) => ({
    annee: y.annee,
    'Patrimoine net': Math.round(y.patrimoineNet),
    'Cash-flow cumulé': Math.round(m.annees.slice(0, y.annee).reduce((s, x) => s + x.cashflowApresImpot, 0)),
  }))

  return (
    <section className="rapport" aria-live="polite">
      <div className={`resultat resultat-${a.score.niveau}`}>
        <Jauge score={a.score} />
        <div className="resultat-texte">
          <p className="surtitre">Notre avis sur cette annonce</p>
          <p className="verdict-texte">{a.score.verdict}</p>
          <RaisonsPrincipales score={a.score} m={m} pessimiste={a.sc[0].resultat} bien={props.bien} prixMaxTri={a.prixMaxTri} />
          <BlocFiabilite fiabilite={a.fiabilite} />
          {props.historique.length > 0 && (
            <p className="aide">
              Mieux notée que {mieuxQue} des {props.historique.length} annonces enregistrées (<a href="#comparaison">voir la comparaison</a>).
            </p>
          )}
          <div className="actions sans-impression">
            <button type="button" onClick={() => props.onEnregistrer({ score: a.score.total, fiabilite: a.fiabilite.pourcentage, tri: m.tri, cashflow: m.cashflowMensuelApresImpot, prixPropose })}>
              Enregistrer cette analyse
            </button>
            <button type="button" className="bouton-secondaire" onClick={() => window.print()}>
              Imprimer ou enregistrer en PDF
            </button>
          </div>
        </div>
      </div>

      <div className="indicateurs">
        <Indicateur
          libelle="Chaque mois"
          valeur={`${signe(cf)}`}
          detail={cf >= 0 ? 'Ce qu’il vous reste une fois le crédit, les charges et les impôts payés.' : 'Ce que vous devez remettre de votre poche, une fois le loyer encaissé.'}
          ton={cf >= 0 ? 'bon' : 'mauvais'}
        />
        <Indicateur libelle="Rendement par an (TRI investisseur)" valeur={triTexte(m.tri)} detail={`Après impôts, sur l'argent sorti de votre poche, avec revente au bout de ${props.hypotheses.horizon} ans. Comme un placement qui rapporterait ce taux chaque année.`} />
        <Indicateur
          libelle="Prix à proposer"
          valeur={a.prixMaxTri === null ? 'Aucun' : euros(Math.min(a.prixMaxTri, prix))}
          detail={
            rabais === null
              ? 'Avec ce loyer, aucun prix raisonnable ne rend l’opération rentable.'
              : rabais > 0.005
                ? `Soit ${pourcent(rabais)} de moins que le prix affiché, pour que l’opération soit vraiment rentable.`
                : 'Le prix affiché est déjà cohérent avec le loyer.'
          }
        />
        <Indicateur libelle={`Dans ${props.hypotheses.horizon} ans`} valeur={euros(patrimoineFinal)} detail="Ce que vous posséderiez si vous revendiez : valeur du bien moins le crédit restant." />
      </div>

      <div className="duo-blocs">
        <BudgetMensuel m={m} />
        <CoutProjet bien={props.bien} m={m} />
      </div>

      <Synthese bien={props.bien} hypotheses={props.hypotheses} o={a.o} sc={a.sc} prixMaxTri={a.prixMaxTri} />

      {a.alertes.length > 0 && (
        <article className="bloc bloc-vigilance">
          <h2>À vérifier avant d'acheter</h2>
          <ul className="alertes">
            {a.alertes.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </article>
      )}

      <article className="bloc">
        <h2>D'où vient le score</h2>
        <DetailScore score={a.score} />
        <p className="aide">Ce score mesure la rentabilité calculée. {a.reference ? `Le critère « Prix demandé » tient compte des prix réels du marché (${a.reference.source}).` : 'Les prix du marché local ne sont pas pris en compte (bien non localisé ou commune sans données).'} Il ne juge pas encore le quartier (transports, commerces, risques) ni le potentiel d'amélioration du DPE.</p>
      </article>

      <SourcesHypotheses bien={props.bien} hypotheses={props.hypotheses} m={m} donnees={props.donneesMarche} />

      <Ameliorations actuel={a.score.total} liste={a.ameliorations} />

      <Negociation bien={props.bien} hypotheses={props.hypotheses} m={m} prixPropose={prixPropose} alertesDpe={alertesDpe(props.bien)} />

      <TriRevente bien={props.bien} profil={props.profil} hypotheses={props.hypotheses} strategie={m.strategie} prixPropose={prixPropose} />

      <TableauFlux m={m} hypotheses={props.hypotheses} />

      <VentesProches bien={props.bien} donnees={props.donneesMarche} />

      <BlocRevente bien={props.bien} hypotheses={props.hypotheses} m={m} donnees={props.donneesMarche} onValorisation={props.onValorisation} />

      <CascadeRevente m={m} hypotheses={props.hypotheses} />

      <section className="detail-expert">
        <h2 className="titre-section">Détails techniques</h2>
        <p className="aide">Les termes techniques sont définis dans le <a href="#lexique">lexique</a> en bas de page.</p>
        <div className="detail-expert-contenu">
          <article className="bloc">
            <h2>Stratégie recommandée en chiffres</h2>
            <dl className="definitions">
              <Def terme="Coût total du projet" valeur={euros(m.coutTotal)} />
              <Def terme="Prêt" valeur={`${euros(m.montantEmprunte)} sur ${f.duree} ans à ${pourcent(f.taux)}`} />
              <Def terme="Taux d'endettement" valeur={m.tauxEndettement === null ? 'Revenus non renseignés' : pourcent(m.tauxEndettement)} />
              <Def terme="Rentabilité nette-nette" valeur={pourcent(m.rentaNetteNette)} />
              <Def terme="Rentabilité brute / nette" valeur={`${pourcent(m.rentaBrute)} / ${pourcent(m.rentaNette)}`} />
              <Def terme="Effort d'épargne moyen" valeur={`${euros(m.effortEpargneMensuel)}/mois`} />
              {m.ameublement > 0 && <Def terme="Ameublement estimé" valeur={euros(m.ameublement)} />}
              <Def terme="Plus-value nette à la revente" valeur={euros(m.plusValueNette)} />
              <Def terme="Prix maximum pour un cash-flow nul" valeur={a.prixMaxCf === null ? 'Inatteignable avec ce loyer' : euros(a.prixMaxCf)} />
              <Def terme={`Prix maximum pour un TRI de ${pourcent(TRI_CIBLE_DEFAUT)}`} valeur={a.prixMaxTri === null ? 'Inatteignable avec ce loyer' : euros(a.prixMaxTri)} />
            </dl>
          </article>

      <article className="bloc">
        <h2>Financement : apport et durée</h2>
        <div className="tableau-defilant">
          <table>
            <thead>
              <tr>
                <th>Apport</th>
                <th>Durée</th>
                <th className="num">Mensualité</th>
                <th className="num">Cash-flow</th>
                <th className="num">TRI</th>
                <th className="num">Endettement</th>
              </tr>
            </thead>
            <tbody>
              {a.o.parFinancement.map((r) => {
                const rf = r.strategie.financement
                const retenue = rf.apport === f.apport && rf.duree === f.duree
                return (
                  <tr key={`${rf.apport}-${rf.duree}`} className={retenue ? 'ligne-retenue' : undefined}>
                    <td>{euros(rf.apport)}</td>
                    <td>{rf.duree} ans</td>
                    <td className="num">{euros(r.mensualiteCredit + r.mensualiteAssurance)}</td>
                    <td className="num">{signe(r.cashflowMensuelApresImpot)}</td>
                    <td className="num">{triTexte(r.tri)}</td>
                    <td className={`num ${r.endettementOk ? '' : 'texte-mauvais'}`}>{r.tauxEndettement === null ? '—' : pourcent(r.tauxEndettement)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </article>

      <article className="bloc">
        <h2>Scénarios</h2>
        <GrapheScenarios sc={a.sc} />
        <div className="tableau-defilant">
          <table>
            <thead>
              <tr>
                <th>Scénario</th>
                <th className="num">Cash-flow</th>
                <th className="num">Renta. nette-nette</th>
                <th className="num">TRI</th>
                <th className="num">Patrimoine net final</th>
              </tr>
            </thead>
            <tbody>
              {a.sc.map((s) => (
                <tr key={s.nom} className={s.nom === 'Réaliste' ? 'ligne-retenue' : undefined}>
                  <td>{s.nom}</td>
                  <td className="num">{signe(s.resultat.cashflowMensuelApresImpot)}</td>
                  <td className="num">{pourcent(s.resultat.rentaNetteNette)}</td>
                  <td className="num">{triTexte(s.resultat.tri)}</td>
                  <td className="num">{euros(s.resultat.annees[s.resultat.annees.length - 1].patrimoineNet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="aide">
          Pessimiste : loyer vide de {euros(a.sc[0].loyerNu)} par mois, un mois de vacance en plus, bien sans valorisation, taux +0,75 point. Optimiste : loyer vide de {euros(a.sc[2].loyerNu)} par mois, valorisation +1 point.{' '}
          {props.donneesMarche.loyer ? 'Les loyers des scénarios sont tirés de la fourchette des loyers du marché local.' : 'Sans loyers de marché, les écarts de loyer sont fixes (−10 % et +5 %).'}
        </p>
      </article>

      <article className="bloc">
        <h2>Évolution du patrimoine</h2>
        <div className="graphe">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={donneesGraphe} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid stroke="var(--ligne)" strokeDasharray="3 3" />
              <XAxis dataKey="annee" stroke="var(--texte-doux)" tickFormatter={(v) => `an ${v}`} />
              <YAxis stroke="var(--texte-doux)" tickFormatter={(v) => `${Math.round(v / 1000)} k€`} width={64} />
              <Tooltip formatter={(v) => euros(Number(v))} labelFormatter={(l) => `Année ${l}`} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--ligne)' }} />
              <Legend />
              <Line type="monotone" dataKey="Patrimoine net" stroke="var(--serie-1)" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="Cash-flow cumulé" stroke="var(--serie-2)" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="bloc">
        <h2>Sensibilité</h2>
        <GrapheSensibilite sens={a.sens} />
        <div className="tableau-defilant">
          <table>
            <thead>
              <tr>
                <th>Variation</th>
                <th className="num">Cash-flow</th>
                <th className="num">TRI</th>
              </tr>
            </thead>
            <tbody>
              {a.sens.map((s) => (
                <tr key={s.libelle}>
                  <td>{s.libelle}</td>
                  <td className="num">{signe(s.cashflowMensuel)}</td>
                  <td className="num">{triTexte(s.tri)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <details className="bloc" open>
        <summary>
          <h2>Projection année par année</h2>
        </summary>
        <div className="tableau-defilant">
          <table>
            <thead>
              <tr>
                <th>Année</th>
                <th className="num">Loyers</th>
                <th className="num">Charges</th>
                <th className="num">Crédit</th>
                <th className="num">Impôt</th>
                <th className="num">Cash-flow</th>
                <th className="num">Capital dû</th>
                <th className="num">Valeur du bien</th>
              </tr>
            </thead>
            <tbody>
              {m.annees.map((y) => (
                <tr key={y.annee}>
                  <td>{y.annee}</td>
                  <td className="num">{euros(y.loyers)}</td>
                  <td className="num">{euros(y.charges)}</td>
                  <td className="num">{euros(y.mensualitesAnnuelles + y.assurance)}</td>
                  <td className="num">{euros(y.impot)}</td>
                  <td className="num">{signe(y.cashflowApresImpot)}</td>
                  <td className="num">{euros(y.capitalRestantDu)}</td>
                  <td className="num">{euros(y.valeurBien)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
        </div>
      </section>

      <Lexique />

      <p className="pied">{a.o.toutes} combinaisons comparées (modes de location, régimes fiscaux, gestion, apport et durée de prêt). Barèmes fiscaux des revenus 2025, à vérifier avec un professionnel avant toute décision.</p>
    </section>
  )
}

function Indicateur({ libelle, valeur, detail, ton }: { libelle: string; valeur: string; detail: string; ton?: 'bon' | 'mauvais' }) {
  return (
    <div className="indicateur">
      <p className="indicateur-libelle">{libelle}</p>
      <p className={`indicateur-valeur ${ton ? `texte-${ton}` : ''}`}>{valeur}</p>
      <p className="indicateur-detail">{detail}</p>
    </div>
  )
}

function Def({ terme, valeur }: { terme: string; valeur: string }) {
  return (
    <div className="def">
      <dt>{terme}</dt>
      <dd>{valeur}</dd>
    </div>
  )
}

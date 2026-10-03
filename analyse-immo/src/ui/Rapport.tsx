import { useMemo } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  LIBELLES_REGIMES,
  MODES,
  TRI_CIBLE_DEFAUT,
  alertesDpe,
  optimiser,
  prixMaximum,
  scenarios,
  sensibilites,
  verdict,
  type Bien,
  type Hypotheses,
  type Objectif,
  type Profil,
  type Resultat,
} from '../engine'
import { euros, pourcent, signe, triTexte } from './format'

interface Props {
  bien: Bien
  profil: Profil
  hypotheses: Hypotheses
  objectif: Objectif
}

function analyser({ bien, profil, hypotheses, objectif }: Props) {
  const o = optimiser(bien, profil, hypotheses, objectif)
  const s = o.meilleur.strategie
  const prixMaxCf = prixMaximum(bien, profil, hypotheses, s, { type: 'cashflow', valeur: 0 })
  const prixMaxTri = prixMaximum(bien, profil, hypotheses, s, { type: 'tri', valeur: TRI_CIBLE_DEFAUT })
  return {
    o,
    sc: scenarios(bien, profil, hypotheses, s),
    sens: sensibilites(bien, profil, hypotheses, s),
    prixMaxCf,
    prixMaxTri,
    verdict: verdict(o.meilleur, prixMaxTri, bien.prix),
    alertes: [...new Set([...alertesDpe(bien), ...o.meilleur.alertes])],
  }
}

const libelleStrategie = (r: Resultat) => `${MODES[r.strategie.mode].libelle} · ${LIBELLES_REGIMES[r.strategie.regime]}`
const libelleGestion = (r: Resultat) => (r.strategie.gestion === 'agence' ? 'Agence' : 'En direct')

export function Rapport(props: Props) {
  const a = useMemo(() => {
    try {
      return analyser(props)
    } catch (e) {
      return { erreur: e instanceof Error ? e.message : 'Analyse impossible' }
    }
  }, [props])

  if ('erreur' in a) {
    return (
      <section className="rapport">
        <p className="alerte">Analyse impossible : {a.erreur}. Vérifiez le prix, la surface et le loyer.</p>
      </section>
    )
  }

  const m = a.o.meilleur
  const f = m.strategie.financement
  const classeVerdict = a.verdict === 'Bonne opportunité' ? 'bon' : a.verdict === 'À négocier' ? 'moyen' : 'mauvais'
  const donneesGraphe = m.annees.map((y) => ({
    annee: y.annee,
    'Patrimoine net': Math.round(y.patrimoineNet),
    'Cash-flow cumulé': Math.round(m.annees.slice(0, y.annee).reduce((s, x) => s + x.cashflowApresImpot, 0)),
  }))

  return (
    <section className="rapport" aria-live="polite">
      <div className={`verdict verdict-${classeVerdict}`}>
        <div>
          <p className="surtitre">Verdict provisoire</p>
          <p className="verdict-texte">{a.verdict}</p>
        </div>
        <p className="verdict-note">Le score multicritère sur 100 (emplacement, marché, risques) complétera ce verdict à l'étape 3.</p>
      </div>

      <div className="indicateurs">
        <Indicateur libelle="TRI" valeur={triTexte(m.tri)} detail={`sur ${props.hypotheses.horizon} ans, revente incluse`} />
        <Indicateur libelle="Cash-flow après impôt" valeur={`${signe(m.cashflowMensuelApresImpot)}/mois`} detail="moyenne sur la durée" ton={m.cashflowMensuelApresImpot >= 0 ? 'bon' : 'mauvais'} />
        <Indicateur libelle="Rentabilité nette-nette" valeur={pourcent(m.rentaNetteNette)} detail={`brute ${pourcent(m.rentaBrute)} · nette ${pourcent(m.rentaNette)}`} />
        <Indicateur libelle="Effort d'épargne" valeur={`${euros(m.effortEpargneMensuel)}/mois`} detail="moyenne sur la durée" />
      </div>

      <article className="bloc">
        <h2>Stratégie recommandée</h2>
        <dl className="definitions">
          <Def terme="Mode de location" valeur={MODES[m.strategie.mode].libelle} />
          <Def terme="Régime fiscal" valeur={LIBELLES_REGIMES[m.strategie.regime]} />
          <Def terme="Gestion" valeur={libelleGestion(m)} />
          <Def terme="Apport conseillé" valeur={euros(f.apport)} />
          <Def terme="Prêt" valeur={`${euros(m.montantEmprunte)} sur ${f.duree} ans à ${pourcent(f.taux)}`} />
          <Def terme="Mensualité" valeur={`${euros(m.mensualiteCredit + m.mensualiteAssurance)} assurance comprise`} />
          <Def terme="Coût total du projet" valeur={euros(m.coutTotal)} />
          <Def terme="Taux d'endettement" valeur={m.tauxEndettement === null ? 'Revenus non renseignés' : pourcent(m.tauxEndettement)} />
          {m.ameublement > 0 && <Def terme="Ameublement estimé" valeur={euros(m.ameublement)} />}
          <Def terme="Plus-value nette à la revente" valeur={euros(m.plusValueNette)} />
        </dl>
        {a.o.aucuneFinancable && <p className="alerte">Aucune combinaison ne respecte la limite d'endettement de 35 %.</p>}
      </article>

      {a.alertes.length > 0 && (
        <article className="bloc">
          <h2>Points de vigilance</h2>
          <ul className="alertes">
            {a.alertes.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </article>
      )}

      <article className="bloc">
        <h2>Prix à viser pour négocier</h2>
        <dl className="definitions">
          <Def terme="Prix maximum pour un cash-flow nul" valeur={a.prixMaxCf === null ? 'Inatteignable avec ce loyer' : euros(a.prixMaxCf)} />
          <Def terme={`Prix maximum pour un TRI de ${pourcent(TRI_CIBLE_DEFAUT)}`} valeur={a.prixMaxTri === null ? 'Inatteignable avec ce loyer' : euros(a.prixMaxTri)} />
          <Def terme="Prix affiché" valeur={euros(props.bien.prix)} />
        </dl>
      </article>

      <article className="bloc">
        <h2>Comparatif des modes de location et des régimes</h2>
        <p className="aide">Chaque ligne montre le meilleur financement et la meilleure gestion pour ce couple.</p>
        <div className="tableau-defilant">
          <table>
            <thead>
              <tr>
                <th>Stratégie</th>
                <th>Gestion</th>
                <th>Apport</th>
                <th>Durée</th>
                <th className="num">Cash-flow</th>
                <th className="num">Renta. nette-nette</th>
                <th className="num">TRI</th>
              </tr>
            </thead>
            <tbody>
              {a.o.parModeRegime.map((r, i) => (
                <tr key={libelleStrategie(r)} className={i === 0 ? 'ligne-retenue' : undefined}>
                  <td>{libelleStrategie(r)}</td>
                  <td>{libelleGestion(r)}</td>
                  <td>{euros(r.strategie.financement.apport)}</td>
                  <td>{r.strategie.financement.duree} ans</td>
                  <td className="num">{signe(r.cashflowMensuelApresImpot)}</td>
                  <td className="num">{pourcent(r.rentaNetteNette)}</td>
                  <td className="num">{triTexte(r.tri)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
        <p className="aide">Pessimiste : loyer −10 %, un mois de vacance en plus, bien sans valorisation, taux +0,75 point. Optimiste : loyer +5 %, valorisation +1 point.</p>
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
              <Line type="monotone" dataKey="Patrimoine net" stroke="var(--accent)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Cash-flow cumulé" stroke="var(--secondaire)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="bloc">
        <h2>Sensibilité</h2>
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

      <details className="bloc">
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

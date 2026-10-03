import { useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { simuler, type Bien, type Hypotheses, type Profil, type Resultat, type Score, type Strategie } from '../engine'
import { euros, pourcent, triTexte } from './format'

// ---------- Les trois raisons principales du score ----------

interface Raison {
  texte: string
  ton: 'bon' | 'moyen' | 'mauvais'
  poids: number
}

export function RaisonsPrincipales({ score, m, pessimiste, bien, prixMaxTri }: { score: Score; m: Resultat; pessimiste: Resultat; bien: Bien; prixMaxTri: number | null }) {
  const cf = m.cashflowMensuelApresImpot
  const rabais = prixMaxTri === null ? null : 1 - prixMaxTri / bien.prix
  const textes: Record<string, [bon: string, mauvais: string]> = {
    Rendement: [`Rendement solide : ${triTexte(m.tri)} par an.`, `Rendement faible : ${triTexte(m.tri)} par an, alors qu'on vise 7 % ou plus.`],
    'Équilibre mensuel': [`Le loyer couvre presque toutes les dépenses (${euros(cf)} par mois).`, `Il faut remettre ${euros(-cf)} par mois de votre poche.`],
    'Prix demandé': [
      'Le prix affiché est cohérent avec le loyer.',
      rabais === null ? 'Aucun prix raisonnable ne rend l’opération rentable avec ce loyer.' : `Le prix affiché est trop élevé d'environ ${pourcent(Math.max(0, rabais))} par rapport au loyer.`,
    ],
    'Résistance aux imprévus': [`Le projet résiste aux imprévus (rendement de ${triTexte(pessimiste.tri)} si tout va mal).`, `Projet fragile : le rendement tombe à ${triTexte(pessimiste.tri)} si tout va mal.`],
    Risques: [
      'Peu de risques identifiés (énergie, crédit).',
      !m.endettementOk ? 'La banque risque de refuser le crédit (endettement trop élevé).' : `Étiquette énergie ${bien.dpe ?? 'inconnue'} : des travaux ou une interdiction de louer sont à prévoir.`,
    ],
  }
  const raisons: Raison[] = score.criteres
    .map((c) => {
      const r = c.points / c.max
      const [bon, mauvais] = textes[c.libelle] ?? [c.explication, c.explication]
      return { texte: r >= 0.5 ? bon : mauvais, ton: r >= 0.65 ? ('bon' as const) : r >= 0.4 ? ('moyen' as const) : ('mauvais' as const), poids: Math.abs(r - 0.5) * c.max }
    })
    .sort((a, b) => b.poids - a.poids)
    .slice(0, 3)
  return (
    <ul className="raisons-score">
      {raisons.map((r) => (
        <li key={r.texte} className={`puce-${r.ton}`}>
          {r.texte}
        </li>
      ))}
    </ul>
  )
}

// ---------- Ce qu'il faudrait changer pour un meilleur score ----------

export interface Amelioration {
  libelle: string
  score: number
  note?: string
}

export function Ameliorations({ actuel, liste }: { actuel: number; liste: Amelioration[] }) {
  if (liste.length === 0) return null
  return (
    <article className="bloc">
      <h2>Ce qui améliorerait le score</h2>
      <ul className="ameliorations">
        {liste.map((a) => (
          <li key={a.libelle}>
            <span>
              {a.libelle}
              {a.note && <span className="aide"> {a.note}</span>}
            </span>
            <span className="barre barre-score" aria-hidden="true">
              <span className="barre-remplie fond-neutre" style={{ width: `${actuel}%` }} />
              <span className="barre-remplie fond-bon" style={{ width: `${Math.max(0, a.score - actuel)}%` }} />
            </span>
            <strong className={a.score > actuel ? 'texte-bon' : undefined}>
              {a.score} / 100 ({a.score >= actuel ? '+' : ''}
              {a.score - actuel})
            </strong>
          </li>
        ))}
      </ul>
    </article>
  )
}

// ---------- TRI selon l'année de revente, au prix affiché et au prix négocié ----------

const ANNEE_MAX = 30

export function TriRevente({ bien, profil, hypotheses, strategie, prixPropose }: { bien: Bien; profil: Profil; hypotheses: Hypotheses; strategie: Strategie; prixPropose: number | null }) {
  const [annee, setAnnee] = useState(Math.min(ANNEE_MAX, Math.max(1, hypotheses.horizon)))
  const calcul = (prix: number, horizon: number) => {
    try {
      return simuler({ ...bien, prix }, profil, { ...hypotheses, horizon }, strategie)
    } catch {
      return null
    }
  }
  // Gain ou perte cumulés en cas de revente : apport, flux annuels et revente nette.
  const bilan = (r: Resultat) => {
    const d = r.annees[r.annees.length - 1]
    return -r.strategie.financement.apport + r.annees.reduce((t, a) => t + a.cashflowApresImpot, 0) + d.valeurBien * (1 - hypotheses.fraisRevente) - d.capitalRestantDu - r.impotPlusValue
  }
  // Sans aucun flux positif, le TRI n'est pas calculable : on affiche la perte en euros.
  const texteTri = (r: Resultat) => (r.tri !== null && r.tri <= -1 ? `Négatif : perte de ${euros(-bilan(r))}` : triTexte(r.tri))
  const detail = (r: Resultat) => `${bilan(r) >= 0 ? 'Gain total' : 'Perte totale'} de ${euros(Math.abs(bilan(r)))} · ${euros(r.cashflowMensuelApresImpot)} par mois en moyenne`
  const affiche = calcul(bien.prix, annee)
  const avecNegocie = prixPropose !== null && prixPropose < bien.prix
  const negocie = avecNegocie ? calcul(prixPropose, annee) : null
  // TRI en % pour chaque année de revente ; pas de point quand tout l'argent investi est perdu.
  const enPourcent = (r: Resultat | null) => (r && r.tri !== null && r.tri > -1 ? Math.round(r.tri * 1000) / 10 : null)
  const courbe = Array.from({ length: ANNEE_MAX }, (_, i) => ({
    annee: i + 1,
    'Au prix affiché': enPourcent(calcul(bien.prix, i + 1)),
    'Au prix à proposer': avecNegocie ? enPourcent(calcul(prixPropose, i + 1)) : null,
  }))
  return (
    <article className="bloc">
      <h2>Rendement (TRI) selon l'année de revente</h2>
      <p className="aide">
        TRI investisseur : rendement annuel de l'argent que vous sortez de votre poche (apport et efforts mensuels), après impôts, en comptant la revente du bien l'année choisie. Déplacez le curseur pour choisir l'année de revente, de 1 à 30 ans.
      </p>
      <label className="curseur" htmlFor="annee-revente">
        <span>
          Revente après <strong>{annee} {annee > 1 ? 'ans' : 'an'}</strong>
        </span>
        <input id="annee-revente" type="range" min={1} max={ANNEE_MAX} step={1} value={annee} onChange={(e) => setAnnee(Number(e.target.value))} />
      </label>
      <div className="indicateurs">
        <div className="indicateur">
          <p className="indicateur-libelle">Au prix affiché ({euros(bien.prix)})</p>
          <p className="indicateur-valeur">{affiche ? texteTri(affiche) : '—'}</p>
          <p className="indicateur-detail">{affiche ? detail(affiche) : ''}</p>
        </div>
        <div className="indicateur">
          <p className="indicateur-libelle">Au prix à proposer{prixPropose !== null ? ` (${euros(prixPropose)})` : ''}</p>
          <p className="indicateur-valeur">{prixPropose === null ? 'Aucun prix' : negocie ? texteTri(negocie) : affiche ? texteTri(affiche) : '—'}</p>
          <p className="indicateur-detail">
            {prixPropose === null
              ? 'Avec ce loyer, même une forte baisse de prix ne permet pas d’atteindre 7 % de rendement par an : il n’y a pas de prix à proposer.'
              : negocie
                ? detail(negocie)
                : `Le prix affiché donne déjà 7 % par an ou plus à ${hypotheses.horizon} ans : aucun rabais n’est nécessaire, le prix à proposer est le prix affiché.${affiche ? ` ${detail(affiche)}` : ''}`}
          </p>
        </div>
      </div>
      <div className="graphe">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={courbe} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid stroke="var(--ligne)" strokeDasharray="3 3" />
            <XAxis dataKey="annee" stroke="var(--texte-doux)" tickFormatter={(v) => `an ${v}`} />
            <YAxis stroke="var(--texte-doux)" tickFormatter={(v) => `${v} %`} width={56} domain={[-20, 'auto']} allowDataOverflow />
            <Tooltip formatter={(v) => `${Number(v).toFixed(1).replace('.', ',')} %`} labelFormatter={(l) => `Revente après ${l} ans`} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--ligne)' }} />
            <Legend />
            <ReferenceLine x={annee} stroke="var(--texte-doux)" strokeDasharray="4 4" />
            <Line type="monotone" dataKey="Au prix affiché" stroke="var(--serie-2)" strokeWidth={2.5} dot={false} />
            {avecNegocie && <Line type="monotone" dataKey="Au prix à proposer" stroke="var(--serie-1)" strokeWidth={2.5} dot={false} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="aide">Les premières années, une revente fait perdre de l'argent (frais de notaire et de revente pas encore amortis). Tant qu'il n'y a que des pertes, le TRI ne peut pas se calculer : la courbe commence à la première année où il existe, et le curseur affiche la perte en euros.</p>
    </article>
  )
}

// ---------- Arguments de négociation ----------

export function Negociation({ bien, hypotheses, m, prixPropose, alertesDpe }: { bien: Bien; hypotheses: Hypotheses; m: Resultat; prixPropose: number | null; alertesDpe: string[] }) {
  const cf = m.cashflowMensuelApresImpot
  const loyerAnnuel = m.annees[0].loyers
  const fixes = bien.chargesCopro + bien.taxeFonciere
  const args: string[] = []
  if (cf < 0) args.push(`Au prix affiché, le loyer ne couvre pas les dépenses : il manque ${euros(-cf)} par mois, même avec le montage le plus favorable.`)
  if (bien.travaux > 0) args.push(`${euros(bien.travaux)} de travaux sont à financer en plus du prix.`)
  args.push(...alertesDpe)
  if (loyerAnnuel > 0 && fixes / loyerAnnuel > 0.2) args.push(`Charges de copropriété et taxe foncière : ${euros(fixes)} par an, soit ${pourcent(fixes / loyerAnnuel)} des loyers encaissés.`)
  if (bien.surface > 0) args.push(`Prix affiché de ${euros(bien.prix / bien.surface)} par m² : à comparer aux ventes récentes du quartier (données à venir dans l'outil).`)
  const baisse = prixPropose !== null && prixPropose < bien.prix
  return (
    <article className="bloc">
      <h2>Prix à proposer et arguments de négociation</h2>
      <p className="conseil">
        {prixPropose === null ? (
          'Avec ce loyer, aucun prix raisonnable ne rend l’opération rentable : mieux vaut passer à une autre annonce.'
        ) : baisse ? (
          <>
            Proposer <strong>{euros(prixPropose)}</strong> au plus, soit <strong>{euros(bien.prix - prixPropose)}</strong> de moins que le prix affiché ({pourcent(1 - prixPropose / bien.prix)}). C'est le prix qui donne un rendement de 7 % par an sur{' '}
            {hypotheses.horizon} ans.
          </>
        ) : (
          <>Le prix affiché de {euros(bien.prix)} donne déjà un rendement de 7 % par an ou plus : une négociation reste possible, mais elle n'est pas indispensable.</>
        )}
      </p>
      {args.length > 0 && (
        <ul className="raisons">
          {args.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </article>
  )
}

// ---------- Lexique ----------

const LEXIQUE: [string, string][] = [
  ['Apport', 'Somme que vous payez avec votre épargne ; le reste est emprunté.'],
  ['Amortissement', 'Déduction fiscale qui étale le prix du bien et des meubles sur plusieurs années (LMNP réel, SCI à l’IS). Elle réduit l’impôt sans sortie d’argent.'],
  ['Cash-flow', 'Ce qui reste (ou manque) chaque mois : loyers moins charges, crédit et impôts.'],
  ['DPE', 'Diagnostic de performance énergétique, de A (économe) à G. Les logements G, puis F (2028) et E (2034) ne peuvent plus être mis en location.'],
  ['Effort d’épargne', 'Somme à remettre de votre poche quand le loyer ne couvre pas toutes les dépenses.'],
  ['LMNP', 'Loueur en meublé non professionnel : statut fiscal de la location meublée. Micro-BIC : abattement forfaitaire de 50 %. Réel : déduction des charges réelles et des amortissements.'],
  ['Micro-foncier', 'Régime simplifié de la location vide : abattement forfaitaire de 30 % sur les loyers (jusqu’à 15 000 € de loyers par an).'],
  ['Plus-value', 'Gain à la revente : prix de vente moins prix d’achat. Elle est imposée, avec des abattements selon la durée de détention.'],
  ['Réel foncier', 'Régime de la location vide où l’on déduit les charges réelles, les intérêts et les travaux.'],
  ['Rentabilité brute', 'Loyers annuels divisés par le prix d’achat, avant toute dépense.'],
  ['Rentabilité nette', 'Loyers moins charges, divisés par le coût total du projet.'],
  ['Rentabilité nette-nette', 'Rentabilité nette après impôts.'],
  ['SCI à l’IS', 'Société civile immobilière soumise à l’impôt sur les sociétés : les loyers sont imposés dans la société, pas chez vous.'],
  ['Taux d’endettement', 'Part de vos revenus consacrée aux crédits. Les banques refusent en général au-delà de 35 %.'],
  ['TMI', 'Tranche marginale d’imposition : le taux d’impôt sur le revenu appliqué à vos derniers euros gagnés.'],
  ['TRI', 'Taux de rendement interne : rendement annuel moyen de l’argent investi, en tenant compte de toutes les entrées et sorties d’argent, revente comprise. Il se compare au taux d’un placement.'],
  ['Vacance locative', 'Période sans locataire, donc sans loyer.'],
]

export function Lexique() {
  return (
    <article className="bloc" id="lexique">
      <h2>Annexe : lexique</h2>
      <dl className="lexique">
        {LEXIQUE.map(([terme, definition]) => (
          <div key={terme}>
            <dt>{terme}</dt>
            <dd>{definition}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}

import type { Fiabilite, Score } from '../engine'

const RAYON = 80
const CIRCONFERENCE = 2 * Math.PI * RAYON

export function Jauge({ score }: { score: Score }) {
  return (
    <div className={`jauge jauge-${score.niveau}`} role="img" aria-label={`Score ${score.total} sur 100`}>
      <svg viewBox="0 0 200 200">
        <circle className="jauge-fond" cx="100" cy="100" r={RAYON} />
        <circle className="jauge-arc" cx="100" cy="100" r={RAYON} strokeDasharray={`${(score.total / 100) * CIRCONFERENCE} ${CIRCONFERENCE}`} transform="rotate(-90 100 100)" />
      </svg>
      <div className="jauge-texte">
        <span className="jauge-nombre">{score.total}</span>
        <span className="jauge-sur">sur 100</span>
      </div>
    </div>
  )
}

export function BlocFiabilite({ fiabilite }: { fiabilite: Fiabilite }) {
  const ton = fiabilite.niveau === 'Bonne' ? 'bon' : fiabilite.niveau === 'Moyenne' ? 'moyen' : 'mauvais'
  return (
    <div className="fiabilite">
      <p className="fiabilite-titre">
        Fiabilité du score : <strong className={`texte-${ton}`}>{fiabilite.niveau}</strong> ({fiabilite.pourcentage} %)
      </p>
      <div className="barre" aria-hidden="true">
        <div className={`barre-remplie fond-${ton}`} style={{ width: `${fiabilite.pourcentage}%` }} />
      </div>
      <p className="aide">
        Selon que les choses se passent mal ou bien, le score irait de <strong>{fiabilite.scoreMin}</strong> à <strong>{fiabilite.scoreMax}</strong>.
      </p>
      {fiabilite.raisons.length > 0 && (
        <details className="fiabilite-raisons">
          <summary>Pourquoi le score n'est pas sûr à 100 %</summary>
          <ul>
            {fiabilite.raisons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

export function DetailScore({ score }: { score: Score }) {
  return (
    <ul className="criteres">
      {score.criteres.map((c) => (
        <li key={c.libelle} className="critere">
          <div className="critere-entete">
            <span className="critere-libelle">{c.libelle}</span>
            <span className="critere-points">
              {c.points} / {c.max}
            </span>
          </div>
          <div className="barre" aria-hidden="true">
            <div className={`barre-remplie fond-${c.points / c.max >= 0.65 ? 'bon' : c.points / c.max >= 0.4 ? 'moyen' : 'mauvais'}`} style={{ width: `${(c.points / c.max) * 100}%` }} />
          </div>
          <p className="aide">{c.explication}</p>
        </li>
      ))}
    </ul>
  )
}

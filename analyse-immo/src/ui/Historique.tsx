import type { Bien, Hypotheses, ModeLocation } from '../engine'
import { euros, signe, triTexte } from './format'

// Annonces analysées, conservées dans le navigateur (localStorage) : rien n'est envoyé ailleurs.
export interface Entree {
  id: string
  date: string
  titre: string
  lien: string
  bien: Bien
  hyp: Hypotheses
  loyersModes: Partial<Record<ModeLocation, number>>
  score: number
  fiabilite: number
  tri: number | null
  cashflow: number
  prixPropose: number | null
}

export type Resume = Pick<Entree, 'score' | 'fiabilite' | 'tri' | 'cashflow' | 'prixPropose'>

const CLE = 'analyse-immo.historique'

export function lireHistorique(): Entree[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLE) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function ecrireHistorique(h: Entree[]) {
  try {
    localStorage.setItem(CLE, JSON.stringify(h))
  } catch {
    // stockage indisponible (navigation privée) : l'historique reste en mémoire
  }
}

interface Props {
  entrees: Entree[]
  onCharger: (e: Entree) => void
  onSupprimer: (id: string) => void
}

export function Historique({ entrees, onCharger, onSupprimer }: Props) {
  const tri = [...entrees].sort((a, b) => b.score - a.score)
  return (
    <article className="bloc" id="comparaison">
      <h2>Vos annonces analysées, côte à côte</h2>
      {tri.length === 0 ? (
        <p className="aide">Aucune annonce enregistrée. Cliquez sur « Enregistrer cette analyse » pour la garder et la comparer aux suivantes.</p>
      ) : (
        <div className="tableau-defilant">
          <table>
            <thead>
              <tr>
                <th>Annonce</th>
                <th className="num">Score</th>
                <th className="num">Fiabilité</th>
                <th className="num">Prix affiché</th>
                <th className="num">Prix à proposer</th>
                <th className="num">Par mois</th>
                <th className="num">TRI</th>
                <th>Analysée le</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tri.map((e, i) => (
                <tr key={e.id} className={i === 0 ? 'ligne-retenue' : undefined}>
                  <td>
                    {e.lien ? (
                      <a href={e.lien} target="_blank" rel="noreferrer">
                        {e.titre}
                      </a>
                    ) : (
                      e.titre
                    )}
                  </td>
                  <td className="num">{e.score} / 100</td>
                  <td className="num">{e.fiabilite} %</td>
                  <td className="num">{euros(e.bien.prix)}</td>
                  <td className="num">{e.prixPropose === null ? '—' : euros(e.prixPropose)}</td>
                  <td className="num">{signe(e.cashflow)}</td>
                  <td className="num">{triTexte(e.tri)}</td>
                  <td>{new Date(e.date).toLocaleDateString('fr-FR')}</td>
                  <td className="actions">
                    <button type="button" className="bouton-secondaire bouton-petit" onClick={() => onCharger(e)}>
                      Rouvrir
                    </button>
                    <button type="button" className="bouton-secondaire bouton-petit" onClick={() => onSupprimer(e.id)}>
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="aide">Classées par score. Ces annonces sont enregistrées uniquement dans ce navigateur.</p>
    </article>
  )
}

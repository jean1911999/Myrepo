import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  analyserIndice,
  analyserMarche,
  clesIndice,
  communeFiscale,
  estimerLoyer,
  estimerTaxeFonciere,
  loyerEncadre,
  mediane,
  realismeRevente,
  referenceMarche,
  type Bien,
  type Comparable,
  type Hypotheses,
  type Indice,
  type LigneEncadrement,
  type LoyerMarche,
  type LoyersCommune,
  type Marche,
  type Resultat,
  type SerieCommune,
  type TaxeFonciereEstimee,
} from '../engine'
import { euros, pourcent } from './format'

// ---------- Chargement des données de marché ----------

export interface DonneesMarche {
  marche: Marche | null
  comparables: Comparable[]
  indice: Indice | null // tendance longue Notaires-INSEE de la zone
  loyer: LoyerMarche | null // loyer de marché pour ce type de bien
  taxeFonciere?: TaxeFonciereEstimee | null // estimation d'après le taux voté par la commune
  cle?: string // bien pour lequel ces données ont été calculées (voir cleMarche)
  etat: 'absent' | 'chargement' | 'pret'
}

export const cleMarche = (b: Bien) => [b.codeInsee, b.latitude, b.longitude, b.type, b.surface, b.pieces].join('|')

const departement = (insee: string) => (insee.startsWith('97') ? insee.slice(0, 3) : insee.slice(0, 2))

// Prix médians de la commune (fichiers locaux) et ventes réelles proches (DVF, via le serveur local).
export function useMarche(bien: Bien): DonneesMarche {
  const { codeInsee, latitude, longitude, type, surface, pieces } = bien
  const [donnees, setDonnees] = useState<DonneesMarche>({ marche: null, comparables: [], indice: null, loyer: null, etat: 'absent' })
  useEffect(() => {
    if (!codeInsee || type === 'parking') {
      setDonnees({ marche: null, comparables: [], indice: null, loyer: null, etat: 'absent' })
      return
    }
    let actif = true
    const cle = [codeInsee, latitude, longitude, type, surface, pieces].join('|')
    setDonnees((d) => ({ ...d, etat: 'chargement' }))
    const serie = fetch(`/donnees/prix/${departement(codeInsee)}.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((communes: Record<string, SerieCommune>) => (communes[codeInsee] ? analyserMarche(communes[codeInsee], type) : null))
      .catch(() => null)
    const ventes =
      latitude === undefined || longitude === undefined || !(surface > 0)
        ? Promise.resolve<Comparable[]>([])
        : fetch(`/api/ventes?insee=${codeInsee}&lat=${latitude}&lon=${longitude}&surface=${surface}&type=${type}`)
            .then((r) => r.json())
            .then((r) => (r.ok ? (r.ventes as Comparable[]) : []))
            .catch(() => [])
    const indice = fetch('/donnees/indices-notaires-insee.json')
      .then((r) => (r.ok ? r.json() : {}))
      .then((series: Record<string, { a: Record<string, number> }>) => {
        const cle = clesIndice(codeInsee, type).find((c) => series[c])
        return cle ? analyserIndice(cle.split('|')[0], series[cle].a) : null
      })
      .catch(() => null)
    const carteLoyers = fetch(`/donnees/loyers/${departement(codeInsee)}.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((communes: Record<string, LoyersCommune>) => (communes[codeInsee] ? estimerLoyer(communes[codeInsee], type, pieces, surface) : null))
      .catch(() => null)
    // À Paris, l'encadrement des loyers donne un repère par quartier, plus précis que la carte des loyers.
    const encadrement =
      codeInsee.startsWith('751') && latitude !== undefined && longitude !== undefined
        ? fetch(`/api/encadrement?lat=${latitude}&lon=${longitude}&pieces=${pieces}`)
            .then((r) => r.json())
            .then((r) => (r.ok ? loyerEncadre(r.lignes as LigneEncadrement[], surface) : null))
            .catch(() => null)
        : Promise.resolve(null)
    const loyer = Promise.all([encadrement, carteLoyers]).then(([e, c]): LoyerMarche | null => (e ? { ...e, autres: c ? [c] : [] } : c))
    const tauxFoncier = fetch(`/donnees/taxe-fonciere/${departement(codeInsee)}.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((communes: Record<string, [number, number | null]>) => communes[communeFiscale(codeInsee)]?.[0] ?? null)
      .catch(() => null)
    void Promise.all([serie, ventes, indice, loyer, tauxFoncier]).then(([marche, comparables, indice, loyer, tauxFoncier]) => {
      if (actif) setDonnees({ marche, comparables, indice, loyer, taxeFonciere: loyer && tauxFoncier ? estimerTaxeFonciere(tauxFoncier, loyer.loyer) : null, etat: 'pret', cle })
    })
    return () => {
      actif = false
    }
  }, [codeInsee, latitude, longitude, type, surface, pieces])
  return donnees
}

// ---------- Prix de revente : hypothèses et réalisme ----------

interface PropsRevente {
  bien: Bien
  hypotheses: Hypotheses
  m: Resultat
  donnees: DonneesMarche
  onValorisation: (taux: number) => void
}

export function BlocRevente({ bien, hypotheses, m, donnees, onValorisation }: PropsRevente) {
  const { marche, comparables, indice } = donnees
  const H = m.annees.length
  const g = hypotheses.valorisationBien
  const prixM2 = bien.surface > 0 ? bien.prix / bien.surface : 0
  const prixVente = m.annees[H - 1].valeurBien
  const reference = referenceMarche(prixM2, marche, comparables)
  const realisme = realismeRevente(g, marche, indice)
  const historique = realisme?.tauxHistorique ?? null
  const anneeAchat = new Date().getFullYear()
  const ton = realisme?.niveau === 'optimiste' ? 'mauvais' : realisme?.niveau === 'prudent' ? 'bon' : 'moyen'

  // Une seule échelle (€/m²) : marché constaté, puis revente supposée et revente au rythme constaté.
  const courbe = [
    ...(marche?.serie.filter((p) => p.annee < anneeAchat).map((p) => ({ annee: p.annee, 'Marché de la commune': p.prix })) ?? []),
    ...Array.from({ length: H + 1 }, (_, k) => ({
      annee: anneeAchat + k,
      'Votre bien, hypothèse retenue': Math.round(prixM2 * Math.pow(1 + g, k)),
      ...(historique !== null ? { 'Votre bien, au rythme constaté': Math.round(prixM2 * Math.pow(1 + historique, k)) } : {}),
    })),
  ]

  return (
    <article className="bloc">
      <h2>Prix de revente : hypothèses et réalisme</h2>
      {donnees.etat === 'chargement' && <p className="aide">Chargement des prix du marché…</p>}
      {donnees.etat !== 'chargement' && !marche && (
        <p className="aide">
          Pas de prix de marché pour ce bien : {bien.codeInsee ? 'la commune a trop peu de ventes dans les données publiques.' : 'localisez-le d’abord avec son adresse (bouton « Localiser » en haut de page).'} Le prix de revente repose donc
          uniquement sur votre hypothèse de hausse.
        </p>
      )}

      {realisme && (
        <p className={`solde solde-${ton}`}>
          Hypothèse de revente {realisme.niveau === 'réaliste' ? 'réaliste' : realisme.niveau === 'optimiste' ? 'optimiste' : 'prudente'}. <span className="solde-detail">{realisme.raison}</span>
        </p>
      )}

      <div className="indicateurs">
        <div className="indicateur">
          <p className="indicateur-libelle">Prix d'achat au m²</p>
          <p className="indicateur-valeur">{euros(prixM2)}</p>
          <p className="indicateur-detail">
            {reference
              ? `${Math.abs(reference.ecart) < 0.005 ? 'Au niveau' : `${pourcent(Math.abs(reference.ecart))} ${reference.ecart > 0 ? 'au-dessus' : 'en dessous'}`} du marché : ${euros(reference.prixM2)} par m² (${reference.source}).`
              : 'Pas de référence de marché.'}
          </p>
        </div>
        <div className="indicateur">
          <p className="indicateur-libelle">Hausse annuelle supposée</p>
          <p className="indicateur-valeur">{pourcent(g)}</p>
          <p className="indicateur-detail">
            {marche && marche.croissances.length > 0
              ? `Constaté à ${marche.commune} : ${marche.croissances.map((c) => `${pourcent(c.taux)} par an de ${c.de} à ${c.a}`).join(', ')}.`
              : 'Pas d’historique de prix dans la commune.'}
            {indice && ` Indice Notaires-INSEE (${indice.zone}) : ${indice.croissances.map((c) => `${pourcent(c.taux)} par an de ${c.de} à ${c.a}`).join(', ')}.`}
          </p>
        </div>
        <div className="indicateur">
          <p className="indicateur-libelle">Prix de revente dans {H} ans</p>
          <p className="indicateur-valeur">{euros(prixVente)}</p>
          <p className="indicateur-detail">
            Soit {euros(bien.surface > 0 ? prixVente / bien.surface : 0)} par m², {pourcent(prixVente / bien.prix - 1)} de plus qu'à l'achat.
            {historique !== null && ` Au rythme constaté, ce serait ${euros(bien.prix * Math.pow(1 + historique, H))}.`}
          </p>
        </div>
      </div>

      {realisme && historique !== null && Math.abs(historique - g) > 0.0005 && (
        <div className="actions sans-impression">
          <button type="button" className="bouton-secondaire" onClick={() => onValorisation(Math.round(historique * 1000) / 1000)}>
            Utiliser la hausse constatée ({pourcent(historique)} par an)
          </button>
        </div>
      )}

      <div className="graphe">
        <p className="sous-titre">Prix au m² : marché constaté, puis revente supposée</p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={courbe} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid stroke="var(--ligne)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="annee" stroke="var(--texte-doux)" />
            <YAxis stroke="var(--texte-doux)" tickFormatter={(v) => `${Math.round(v).toLocaleString('fr-FR')} €`} width={72} domain={['auto', 'auto']} />
            <Tooltip formatter={(v) => `${euros(Number(v))} par m²`} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--ligne)', borderRadius: 8 }} />
            <Legend />
            <Line type="monotone" dataKey="Marché de la commune" stroke="var(--serie-1)" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="Votre bien, hypothèse retenue" stroke="var(--serie-2)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            {historique !== null && <Line type="monotone" dataKey="Votre bien, au rythme constaté" stroke="var(--serie-3)" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <h3>Le calcul</h3>
      <ol className="raisons">
        <li>
          Prix de revente = prix d'achat × (1 + hausse annuelle) à la puissance du nombre d'années : {euros(bien.prix)} × (1 + {pourcent(g)})<sup>{H}</sup> = <strong>{euros(prixVente)}</strong>. Les travaux ne sont pas ajoutés à la valeur.
        </li>
        <li>
          Frais de vente ({pourcent(hypotheses.fraisRevente)}) : −{euros(prixVente * hypotheses.fraisRevente)}.
        </li>
        <li>Crédit restant à rembourser : −{euros(m.annees[H - 1].capitalRestantDu)}.</li>
        <li>Impôt sur la plus-value (après abattements pour durée de détention) : −{euros(m.impotPlusValue)}.</li>
        <li>
          Reste pour vous : <strong>{euros(prixVente * (1 - hypotheses.fraisRevente) - m.annees[H - 1].capitalRestantDu - m.impotPlusValue)}</strong>.
        </li>
      </ol>
      <p className="aide">
        Sources : prix médians par commune et ventes réelles issus de DVF (actes notariés publiés par la DGFiP, data.gouv.fr, Licence Ouverte 2.0) ; tendance longue : indice Notaires-INSEE des prix des logements anciens (INSEE){marche ? `, dernière année : ${marche.annee}${marche.parType ? '' : ', tous logements confondus'}` : ''}. Les prix
        passés ne garantissent pas les prix futurs.
      </p>
    </article>
  )
}

// ---------- Ventes réelles autour du bien ----------

export function VentesProches({ bien, donnees }: { bien: Bien; donnees: DonneesMarche }) {
  const { comparables } = donnees
  const conteneur = useRef<HTMLDivElement>(null)
  const { latitude, longitude } = bien

  useEffect(() => {
    if (!conteneur.current || latitude === undefined || longitude === undefined || comparables.length === 0) return
    const style = getComputedStyle(document.documentElement)
    const carte = L.map(conteneur.current, { scrollWheelZoom: false })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; contributeurs OpenStreetMap' }).addTo(carte)
    const points: L.LatLngExpression[] = [[latitude, longitude]]
    for (const c of comparables) {
      points.push([c.lat, c.lon])
      L.circleMarker([c.lat, c.lon], { radius: 8, color: '#fff', weight: 2, fillColor: style.getPropertyValue('--serie-1').trim(), fillOpacity: 0.9 })
        .addTo(carte)
        .bindPopup(`${euros(c.prix / c.surface)} par m²<br>${euros(c.prix)} · ${c.surface} m²<br>${c.adresse}<br>${new Date(c.date).toLocaleDateString('fr-FR')}`)
    }
    L.circleMarker([latitude, longitude], { radius: 11, color: '#fff', weight: 3, fillColor: style.getPropertyValue('--serie-8').trim(), fillOpacity: 1 }).addTo(carte).bindPopup('Le bien analysé')
    carte.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 17 })
    return () => void carte.remove()
  }, [comparables, latitude, longitude])

  if (donnees.etat === 'chargement') return null
  if (comparables.length === 0) return null
  const prixM2 = bien.prix / bien.surface
  const med = mediane(comparables.map((c) => c.prix / c.surface)) ?? 0
  const ecart = med > 0 ? prixM2 / med - 1 : 0
  return (
    <article className="bloc">
      <h2>Ventes réelles autour du bien</h2>
      <p className="conseil">
        Les {comparables.length} ventes comparables les plus proches ({bien.type === 'maison' ? 'maisons' : 'appartements'} de surface voisine, 2023 à 2025) se sont faites à <strong>{euros(med)} par m²</strong> en médiane. L'annonce est à{' '}
        <strong>{euros(prixM2)} par m²</strong>, soit{' '}
        <strong className={ecart > 0.05 ? 'texte-mauvais' : ecart < -0.05 ? 'texte-bon' : undefined}>
          {Math.abs(ecart) < 0.005 ? 'au même niveau' : `${pourcent(Math.abs(ecart))} ${ecart > 0 ? 'au-dessus' : 'en dessous'}`}
        </strong>
        .
      </p>
      <div className="carte-ventes" ref={conteneur} />
      <ul className="legende legende-ligne">
        <li>
          <span className="pastille pastille-ronde" style={{ background: 'var(--serie-8)' }} />
          Le bien analysé
        </li>
        <li>
          <span className="pastille pastille-ronde" style={{ background: 'var(--serie-1)' }} />
          Vente comparable (cliquez pour le détail)
        </li>
      </ul>
      <div className="tableau-defilant">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Adresse</th>
              <th className="num">Distance</th>
              <th className="num">Surface</th>
              <th className="num">Pièces</th>
              <th className="num">Prix</th>
              <th className="num">Prix au m²</th>
            </tr>
          </thead>
          <tbody>
            {comparables.map((c) => (
              <tr key={`${c.date}-${c.adresse}-${c.prix}`}>
                <td>{new Date(c.date).toLocaleDateString('fr-FR')}</td>
                <td>{c.adresse}</td>
                <td className="num">{c.distance} m</td>
                <td className="num">{c.surface} m²</td>
                <td className="num">{c.pieces || '—'}</td>
                <td className="num">{euros(c.prix)}</td>
                <td className={`num ${c.prix / c.surface < prixM2 ? 'texte-mauvais' : 'texte-bon'}`}>{euros(c.prix / c.surface)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="ligne-retenue">
              <td colSpan={6}>Médiane des ventes comparables</td>
              <td className="num">{euros(med)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="aide">En vert : vendu plus cher au m² que le prix de l'annonce. En rouge : vendu moins cher. L'état du bien, l'étage et les annexes ne sont pas connus, donc la comparaison reste indicative.</p>
    </article>
  )
}

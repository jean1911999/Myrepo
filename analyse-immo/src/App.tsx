import { useMemo, useState } from 'react'
import {
  MODES,
  TAUX_CREDIT,
  hypothesesParDefaut,
  modeCompatible,
  type Bien,
  type ClasseDpe,
  type Hypotheses,
  type ModeLocation,
  type Objectif,
  type Profil,
  type TypeBien,
} from './engine'
import { Choix, Groupe, Nombre } from './ui/Champs'
import { Rapport } from './ui/Rapport'

// Exemple pré-rempli pour montrer l'outil : à remplacer par les données de l'annonce.
const BIEN_EXEMPLE: Bien = {
  prix: 180_000,
  surface: 55,
  pieces: 3,
  type: 'appartement',
  neuf: false,
  fraisAgence: 0,
  travaux: 10_000,
  chargesCopro: 1_800,
  partChargesRecuperables: 0.5,
  taxeFonciere: 1_100,
  dpe: 'E',
  ville: 'Exemple',
}
const PROFIL_EXEMPLE: Profil = { tmi: 0.3, apportDisponible: 40_000, revenusMensuels: 4_500, mensualitesExistantes: 0 }

const TMI = [0, 0.11, 0.3, 0.41, 0.45].map((t) => ({ valeur: t, libelle: `${Math.round(t * 100)} %` }))
const DPE: { valeur: ClasseDpe | ''; libelle: string }[] = [{ valeur: '', libelle: 'Non renseigné' }, ...(['A', 'B', 'C', 'D', 'E', 'F', 'G'] as ClasseDpe[]).map((c) => ({ valeur: c, libelle: c }))]

export default function App() {
  const [bien, setBien] = useState<Bien>(BIEN_EXEMPLE)
  const [profil, setProfil] = useState<Profil>(PROFIL_EXEMPLE)
  const [hyp, setHyp] = useState<Hypotheses>(() => ({ ...hypothesesParDefaut(850), tauxCredit: { ...TAUX_CREDIT } }))
  const [objectif, setObjectif] = useState<Objectif>('tri')
  const [loyersModes, setLoyersModes] = useState<Partial<Record<ModeLocation, number>>>({})

  const b = <K extends keyof Bien>(k: K) => (v: Bien[K]) => setBien((x) => ({ ...x, [k]: v }))
  const p = <K extends keyof Profil>(k: K) => (v: Profil[K]) => setProfil((x) => ({ ...x, [k]: v }))
  const h = <K extends keyof Hypotheses>(k: K) => (v: Hypotheses[K]) => setHyp((x) => ({ ...x, [k]: v }))

  const hypotheses = useMemo<Hypotheses>(() => {
    const saisis = Object.fromEntries(Object.entries(loyersModes).filter(([, v]) => v && v > 0))
    return { ...hyp, loyersParMode: Object.keys(saisis).length ? saisis : undefined }
  }, [hyp, loyersModes])

  const modes = (Object.keys(MODES) as ModeLocation[]).filter((m) => m !== 'nu' && modeCompatible(m, bien))

  return (
    <div className="page">
      <header className="entete">
        <div>
          <p className="surtitre">Analyse d'investissement locatif</p>
          <h1>Analyse d'annonce</h1>
        </div>
        <p className="entete-note">Saisie manuelle. La lecture d'annonce par lien et la recherche dans vos villes arrivent aux étapes suivantes.</p>
      </header>

      <div className="mise-en-page">
        <form className="formulaire" onSubmit={(e) => e.preventDefault()} aria-label="Données de l'annonce">
          <p className="exemple">Les valeurs affichées sont un exemple : remplacez-les par celles de l'annonce.</p>

          <Groupe titre="Le bien">
            <Nombre id="prix" label="Prix affiché" value={bien.prix} onChange={b('prix')} unite="€" step={1000} />
            <Nombre id="agence" label="Frais d'agence en sus" value={bien.fraisAgence} onChange={b('fraisAgence')} unite="€" aide="0 si le prix est frais d'agence inclus" />
            <Choix<TypeBien>
              id="type"
              label="Type"
              value={bien.type}
              onChange={b('type')}
              options={[
                { valeur: 'appartement', libelle: 'Appartement' },
                { valeur: 'maison', libelle: 'Maison' },
                { valeur: 'parking', libelle: 'Parking / box' },
              ]}
            />
            <Choix<'ancien' | 'neuf'> id="neuf" label="Ancien ou neuf" value={bien.neuf ? 'neuf' : 'ancien'} onChange={(v) => b('neuf')(v === 'neuf')} options={[{ valeur: 'ancien', libelle: 'Ancien' }, { valeur: 'neuf', libelle: 'Neuf' }]} />
            <Nombre id="surface" label="Surface" value={bien.surface} onChange={b('surface')} unite="m²" />
            <Nombre id="pieces" label="Pièces" value={bien.pieces} onChange={b('pieces')} />
            <Choix<ClasseDpe | ''> id="dpe" label="DPE" value={bien.dpe ?? ''} onChange={(v) => b('dpe')(v === '' ? null : v)} options={DPE} />
            <Nombre id="travaux" label="Travaux prévus" value={bien.travaux} onChange={b('travaux')} unite="€" step={500} />
            <Nombre id="copro" label="Charges de copropriété" value={bien.chargesCopro} onChange={b('chargesCopro')} unite="€/an" step={50} />
            <Nombre id="recup" label="Part récupérable sur le locataire" value={bien.partChargesRecuperables} onChange={b('partChargesRecuperables')} pourcentage />
            <Nombre id="tf" label="Taxe foncière" value={bien.taxeFonciere} onChange={b('taxeFonciere')} unite="€/an" step={50} />
          </Groupe>

          <Groupe titre="Loyers">
            <Nombre id="loyer" label="Loyer nu hors charges" value={hyp.loyerNuMensuel} onChange={h('loyerNuMensuel')} unite="€/mois" step={10} aide="Les autres loyers en sont déduits, sauf si vous les saisissez" />
            {modes.map((m) => (
              <Nombre
                key={m}
                id={`loyer-${m}`}
                label={MODES[m].libelle}
                value={loyersModes[m] ?? 0}
                onChange={(v) => setLoyersModes((x) => ({ ...x, [m]: v }))}
                unite="€/mois"
                step={10}
                aide={`Vide : ${Math.round(hyp.loyerNuMensuel * MODES[m].coefLoyer)} € estimés`}
              />
            ))}
          </Groupe>

          <Groupe titre="Votre situation">
            <Choix<number> id="tmi" label="Tranche marginale d'imposition" value={profil.tmi} onChange={p('tmi')} options={TMI} />
            <Nombre id="apport" label="Apport disponible" value={profil.apportDisponible} onChange={p('apportDisponible')} unite="€" step={1000} />
            <Nombre id="revenus" label="Revenus nets du foyer" value={profil.revenusMensuels} onChange={p('revenusMensuels')} unite="€/mois" step={100} aide="Pour vérifier la limite d'endettement de 35 %" />
            <Nombre id="credits" label="Mensualités de crédits en cours" value={profil.mensualitesExistantes} onChange={p('mensualitesExistantes')} unite="€/mois" step={50} />
          </Groupe>

          <Groupe titre="Hypothèses" ouvert={false}>
            <Nombre id="horizon" label="Durée de détention" value={hyp.horizon} onChange={(v) => h('horizon')(Math.min(30, Math.max(5, Math.round(v))))} unite="ans" />
            <Nombre id="valo" label="Valorisation annuelle du bien" value={hyp.valorisationBien} onChange={h('valorisationBien')} pourcentage />
            <Nombre id="reval" label="Hausse annuelle des loyers" value={hyp.revalorisationLoyers} onChange={h('revalorisationLoyers')} pourcentage />
            <Nombre id="vacance" label="Vacance supplémentaire" value={hyp.vacanceSupplementaireMois} onChange={h('vacanceSupplementaireMois')} unite="mois/an" step={0.5} />
            <Nombre id="revente" label="Frais de revente" value={hyp.fraisRevente} onChange={h('fraisRevente')} pourcentage />
            {Object.keys(hyp.tauxCredit).map((d) => (
              <Nombre key={d} id={`taux-${d}`} label={`Taux de crédit sur ${d} ans`} value={hyp.tauxCredit[Number(d)]} onChange={(v) => h('tauxCredit')({ ...hyp.tauxCredit, [d]: v })} pourcentage />
            ))}
            <Nombre id="assurance" label="Assurance emprunteur" value={hyp.assuranceEmprunteur} onChange={h('assuranceEmprunteur')} pourcentage aide="% du capital emprunté par an" />
          </Groupe>

          <Choix<Objectif>
            id="objectif"
            label="Optimiser pour"
            value={objectif}
            onChange={setObjectif}
            options={[
              { valeur: 'tri', libelle: 'Le TRI (rendement global sur la durée)' },
              { valeur: 'cashflow', libelle: 'Le cash-flow mensuel' },
              { valeur: 'rentabilite', libelle: 'La rentabilité nette-nette' },
            ]}
          />
        </form>

        <Rapport bien={bien} profil={profil} hypotheses={hypotheses} objectif={objectif} />
      </div>
    </div>
  )
}

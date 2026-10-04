import { useEffect, useMemo, useRef, useState } from 'react'
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
import { Carte, localiser } from './ui/Carte'
import { Choix, Groupe, Nombre } from './ui/Champs'
import { Historique, ecrireHistorique, lireHistorique, type Entree, type Resume } from './ui/Historique'
import { cleMarche, useMarche, type DonneesMarche } from './ui/Marche'
import { Rapport } from './ui/Rapport'
import { LIBELLES_CHAMPS, appliquerAnnonce, extraireAnnonce, type ChampAnnonce } from './extraction/extraire'
import { euros } from './ui/format'

// Annonce d'exemple pour montrer l'outil, en attendant la lecture automatique du lien.
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
  ville: 'Toulouse',
  adresse: '25 rue de Bayard, 31000 Toulouse',
  codeInsee: '31555',
  latitude: 43.609505,
  longitude: 1.448802,
}
const PROFIL_EXEMPLE: Profil = { tmi: 0.3, apportDisponible: 40_000, revenusMensuels: 4_500, mensualitesExistantes: 0 }

const TMI = [0, 0.11, 0.3, 0.41, 0.45].map((t) => ({ valeur: t, libelle: `${Math.round(t * 100)} %` }))
const DPE: { valeur: ClasseDpe | ''; libelle: string }[] = [{ valeur: '', libelle: 'Non renseigné' }, ...(['A', 'B', 'C', 'D', 'E', 'F', 'G'] as ClasseDpe[]).map((c) => ({ valeur: c, libelle: c }))]
// Bouton de favoris : exécuté par l'utilisateur sur la page d'annonce qu'il consulte lui-même,
// il transmet le code HTML de la page à l'application (et copie son texte, en secours, dans le presse-papiers).
const FAVORI = `javascript:(()=>{const o=${JSON.stringify(location.origin)};const q=s=>[...document.querySelectorAll(s)].map(x=>x.textContent).join('\\n').slice(0,500000);const d={type:'analyse-immo:annonce',url:location.href,html:document.documentElement.outerHTML.slice(0,3000000),texte:(document.title+'\\n'+document.body.innerText).slice(0,300000),ld:q('script[type="application/ld+json"]'),etat:q('script#__NEXT_DATA__')};try{navigator.clipboard.writeText(d.texte)}catch(e){}const w=window.open(o+'/');addEventListener('message',e=>{if(e.source===w&&e.data==='analyse-immo:pret')w.postMessage(d,o)})})()`

const TYPES: Record<TypeBien, string> = { appartement: 'Appartement', maison: 'Maison', parking: 'Parking' }

export default function App() {
  const [bien, setBien] = useState<Bien>(BIEN_EXEMPLE)
  const [profil, setProfil] = useState<Profil>(PROFIL_EXEMPLE)
  const [hyp, setHyp] = useState<Hypotheses>(() => ({ ...hypothesesParDefaut(850), tauxCredit: { ...TAUX_CREDIT } }))
  const [objectif, setObjectif] = useState<Objectif>('tri')
  const [loyersModes, setLoyersModes] = useState<Partial<Record<ModeLocation, number>>>({})
  const [donneesExemple, setDonneesExemple] = useState(true)
  const [lien, setLien] = useState('')
  const [messageLien, setMessageLien] = useState('')
  const [collage, setCollage] = useState(false)
  const [texteAnnonce, setTexteAnnonce] = useState('')
  const [lecture, setLecture] = useState<{ lus: ChampAnnonce[]; estimes: ChampAnnonce[]; originePrix?: string; loyerDeMarche?: boolean; taxeEstimee?: boolean } | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [source, setSource] = useState('')
  const [fichierSource, setFichierSource] = useState('')
  const estimes = useMemo(() => lecture?.estimes ?? [], [lecture])
  const [adresse, setAdresse] = useState(BIEN_EXEMPLE.adresse ?? '')
  const [messageAdresse, setMessageAdresse] = useState('')
  const [historique, setHistorique] = useState<Entree[]>(lireHistorique)

  const titre = `${TYPES[bien.type]}${bien.type !== 'parking' ? ` ${bien.pieces} pièces` : ''} · ${bien.surface} m²${bien.ville ? ` · ${bien.ville}` : ''}`
  const majHistorique = (h: Entree[]) => {
    setHistorique(h)
    ecrireHistorique(h)
  }
  const enregistrer = (r: Resume) => majHistorique([{ id: String(Date.now()), date: new Date().toISOString(), titre, lien: lien.trim(), bien, hyp, loyersModes, ...r }, ...historique])
  const charger = (e: Entree) => {
    setBien(e.bien)
    setHyp(e.hyp)
    setLoyersModes(e.loyersModes)
    setLien(e.lien)
    setAdresse(e.bien.adresse ?? '')
    setDonneesExemple(false)
    setLecture(null)
    window.scrollTo({ top: 0 })
  }

  // Une donnée corrigée à la main n'est plus une estimation.
  const retirerEstime = (c: ChampAnnonce) => setLecture((l) => (l && l.estimes.includes(c) ? { ...l, estimes: l.estimes.filter((x) => x !== c) } : l))

  // Toute modification du bien ou des loyers fait sortir de l'exemple.
  const b = <K extends keyof Bien>(k: K) => (v: Bien[K]) => {
    setDonneesExemple(false)
    retirerEstime(k as ChampAnnonce)
    setBien((x) => ({ ...x, [k]: v }))
  }
  const p = <K extends keyof Profil>(k: K) => (v: Profil[K]) => setProfil((x) => ({ ...x, [k]: v }))
  const h = <K extends keyof Hypotheses>(k: K) => (v: Hypotheses[K]) => setHyp((x) => ({ ...x, [k]: v }))

  const hypotheses = useMemo<Hypotheses>(() => {
    const saisis = Object.fromEntries(Object.entries(loyersModes).filter(([, v]) => v && v > 0))
    return { ...hyp, loyersParMode: Object.keys(saisis).length ? saisis : undefined }
  }, [hyp, loyersModes])

  // Les données de marché d'un bien précédent ne doivent pas servir au bien courant pendant le chargement.
  const marcheBrut = useMarche(bien)
  const donneesMarche = useMemo<DonneesMarche>(
    () => (marcheBrut.etat !== 'pret' || marcheBrut.cle === cleMarche(bien) ? marcheBrut : { marche: null, comparables: [], indice: null, loyer: null, etat: 'chargement' }),
    [marcheBrut, bien],
  )

  // Annonce lue automatiquement : dès que les loyers de marché de la commune sont connus,
  // ils remplacent l'estimation par défaut (rendement type).
  const loyerMarche = donneesMarche.loyer
  useEffect(() => {
    if (!loyerMarche || !lecture?.estimes.includes('loyer') || lecture.loyerDeMarche) return
    setHyp((x) => ({ ...x, loyerNuMensuel: loyerMarche.loyer }))
    setLecture((l) => (l ? { ...l, loyerDeMarche: true } : l))
  }, [loyerMarche, lecture])

  // Même principe pour la taxe foncière absente de l'annonce : estimation d'après le taux voté par la commune.
  const taxeMarche = donneesMarche.taxeFonciere ?? null
  useEffect(() => {
    if (!taxeMarche || !lecture?.estimes.includes('taxeFonciere') || lecture.taxeEstimee) return
    setBien((x) => ({ ...x, taxeFonciere: taxeMarche.montant }))
    setLecture((l) => (l ? { ...l, taxeEstimee: true } : l))
  }, [taxeMarche, lecture])

  // Après une rénovation énergétique, l'analyse (alertes DPE, score) porte sur la classe visée.
  const bienAnalyse = useMemo(() => (bien.dpeApresTravaux ? { ...bien, dpe: bien.dpeApresTravaux } : bien), [bien])

  const modes = (Object.keys(MODES) as ModeLocation[]).filter((m) => m !== 'nu' && modeCompatible(m, bien))

  // Applique une annonce lue (page téléchargée ou texte collé) ; renvoie false si le prix ou la surface manquent.
  const appliquer = async (source: string, donnees?: { ld?: string; etat?: string }) => {
    const r = appliquerAnnonce(extraireAnnonce(source, donnees))
    if (!r) return false
    setBien(r.bien)
    setHyp((x) => ({ ...x, loyerNuMensuel: r.loyerNuMensuel }))
    setLoyersModes({})
    setDonneesExemple(false)
    setLecture({ lus: r.lus, estimes: r.estimes, originePrix: r.originePrix })
    setSource('')
    setFichierSource('')
    setAdresse(r.bien.adresse ?? '')
    setMessageAdresse('')
    if (r.bien.adresse) {
      try {
        const g = await localiser(r.bien.adresse)
        if (g) setBien((x) => ({ ...x, ville: g.ville ?? x.ville, latitude: g.latitude, longitude: g.longitude, codeInsee: g.codeInsee }))
      } catch {
        // la carte reste vide, l'adresse peut être saisie à la main
      }
    }
    return true
  }

  const analyserLien = async () => {
    if (!lien.trim()) {
      setMessageLien('Collez d’abord le lien de l’annonce.')
      return
    }
    setEnCours(true)
    setMessageLien('Lecture de l’annonce…')
    try {
      const r = await (await fetch(`/api/annonce?url=${encodeURIComponent(lien.trim())}`)).json()
      if (r.ok && (await appliquer(r.html))) {
        setSource(`code HTML de la page (${Math.round(r.html.length / 1024)} Ko), téléchargé par le lien`)
        setMessageLien('')
        setCollage(false)
      } else {
        setCollage(true)
        setMessageLien(
          r.ok
            ? 'La page a été lue, mais le prix ou la surface sont introuvables. Collez le texte de l’annonce ci-dessous.'
            : r.raison === 'site'
              ? 'Ce site n’est pas pris en charge pour la lecture automatique. Collez le texte de l’annonce ci-dessous.'
              : r.raison === 'refus'
                ? 'Ce site refuse la lecture automatique de ses annonces. Collez le texte de l’annonce ci-dessous : l’analyse sera la même.'
                : 'Lecture impossible (lien incorrect ou site injoignable). Collez le texte de l’annonce ci-dessous.',
        )
      }
    } catch {
      setCollage(true)
      setMessageLien('Lecture impossible. Collez le texte de l’annonce ci-dessous.')
    }
    setEnCours(false)
  }

  // Réception d'une annonce envoyée par le bouton de favoris depuis l'onglet de l'annonce.
  const favori = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    favori.current?.setAttribute('href', FAVORI)
    const recevoir = async (e: MessageEvent) => {
      if (!window.opener || e.source !== window.opener ||e.data?.type !== 'analyse-immo:annonce' || typeof e.data.texte !== 'string') return
      setLien(typeof e.data.url === 'string' ? e.data.url : '')
      // Source principale : le code HTML de la page ; le texte affiché ne sert que si le HTML ne suffit pas.
      const donnees = { ld: String(e.data.ld ?? ''), etat: String(e.data.etat ?? '') }
      const html = typeof e.data.html === 'string' ? e.data.html : ''
      const parHtml = html !== '' && (await appliquer(html, donnees))
      if (parHtml || (await appliquer(e.data.texte, donnees))) {
        let site = ''
        try {
          site = new URL(e.data.url).hostname
        } catch {
          // lien absent ou invalide
        }
        setSource(`${parHtml ? 'code HTML de la page' : 'texte affiché de la page'}${site ? ` ${site}` : ''}${parHtml ? ` (${Math.round(html.length / 1024)} Ko)` : ''}, capturé le ${new Date().toLocaleString('fr-FR')}`)
        // La page d'origine est conservée sur le disque, dans le dossier sources/.
        if (html) {
          try {
            const s = await (await fetch('/api/source', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: e.data.url, html }) })).json()
            if (s.ok) setFichierSource(s.fichier)
          } catch {
            // l'analyse reste valable même si la source n'a pas pu être enregistrée
          }
        }
        setMessageLien('')
        setCollage(false)
      } else setMessageLien('Annonce reçue, mais le prix ou la surface sont introuvables sur cette page. Ouvrez la page de l’annonce elle-même (pas une liste de résultats).')
    }
    window.addEventListener('message', recevoir)
    window.opener?.postMessage('analyse-immo:pret', '*')
    return () => window.removeEventListener('message', recevoir)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [copie, setCopie] = useState(false)
  const copierFavori = async () => {
    try {
      await navigator.clipboard.writeText(FAVORI)
    } catch {
      // presse-papiers refusé : le code reste sélectionnable dans la zone de texte
    }
    setCopie(true)
  }

  const analyserTexte = async () => {
    if (await appliquer(texteAnnonce)) {
      setSource('texte collé')
      setMessageLien('')
      setCollage(false)
      setTexteAnnonce('')
    } else setMessageLien('Prix ou surface introuvables dans ce texte. Copiez toute la page de l’annonce (Ctrl+A puis Ctrl+C) et collez-la ici.')
  }

  const chercherAdresse = async () => {
    if (!adresse.trim()) return
    setMessageAdresse('Recherche…')
    try {
      const r = await localiser(adresse)
      if (!r) {
        setMessageAdresse('Adresse introuvable. Essayez avec le code postal et la ville.')
        return
      }
      setDonneesExemple(false)
      setBien((x) => ({ ...x, adresse: r.libelle, ville: r.ville ?? x.ville, latitude: r.latitude, longitude: r.longitude, codeInsee: r.codeInsee }))
      setAdresse(r.libelle)
      setMessageAdresse('')
    } catch {
      setMessageAdresse('Localisation impossible pour le moment.')
    }
  }

  return (
    <div className="page">
      <header className="entete">
        <p className="surtitre">Investissement locatif</p>
        <h1>Cette annonce est-elle une bonne affaire ?</h1>
        <form
          className="barre-lien"
          onSubmit={(e) => {
            e.preventDefault()
            void analyserLien()
          }}
        >
          <input type="url" value={lien} onChange={(e) => setLien(e.target.value)} placeholder="Collez ici le lien de l'annonce (SeLoger, Leboncoin, PAP…)" aria-label="Lien de l'annonce" />
          <button type="submit" disabled={enCours}>
            {enCours ? 'Lecture…' : 'Analyser'}
          </button>
        </form>
        {messageLien && <p className="message">{messageLien}</p>}
        {collage ? (
          <form
            className="collage"
            onSubmit={(e) => {
              e.preventDefault()
              void analyserTexte()
            }}
          >
            <label htmlFor="texte-annonce">Sur la page de l'annonce, faites Ctrl+A puis Ctrl+C, et collez ici (Ctrl+V) :</label>
            <textarea id="texte-annonce" rows={5} value={texteAnnonce} onChange={(e) => setTexteAnnonce(e.target.value)} placeholder="Texte de l'annonce" />
            <div className="actions">
              <button type="submit" disabled={!texteAnnonce.trim()}>
                Analyser ce texte
              </button>
              <button type="button" className="bouton-secondaire" onClick={() => setCollage(false)}>
                Fermer
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="lien-bouton" onClick={() => setCollage(true)}>
            Le lien ne marche pas ? Coller le texte de l'annonce
          </button>
        )}
        <p className="favori sans-impression">
          En un clic, sur tous les sites : glissez ce bouton dans la barre de favoris de votre navigateur{' '}
          <a ref={favori} className="favori-bouton" onClick={(e) => e.preventDefault()} title="Glissez-moi dans la barre de favoris">
            Analyser cette annonce
          </a>{' '}
          puis, sur la page d'une annonce, cliquez dessus.
        </p>
        <div className="installer sans-impression">
          <button type="button" onClick={() => void copierFavori()}>
            Copier le code du bouton
          </button>
          {copie && <span className="texte-bon">Code copié : collez-le (Ctrl+V) dans le champ « URL » du favori.</span>}
          <details open={copie}>
            <summary>Le glisser-déposer ne marche pas ? Installer le bouton à la main</summary>
            <ol>
              <li>Cliquez sur « Copier le code du bouton ».</li>
              <li>
                <strong>Edge :</strong> ajoutez cette page aux favoris (Ctrl+D, puis « Terminé »). Faites un clic droit sur ce favori dans la barre de favoris (Ctrl+Maj+B pour l'afficher), choisissez « Modifier », nommez-le « Analyser cette annonce », effacez
                l'URL, collez le code (Ctrl+V) et enregistrez.
              </li>
              <li>
                <strong>Chrome :</strong> clic droit sur la barre de favoris, « Ajouter une page », nom « Analyser cette annonce », collez le code (Ctrl+V) dans « URL », puis « Enregistrer ».
              </li>
              <li>Ouvrez une annonce et cliquez sur ce favori.</li>
            </ol>
            <textarea readOnly rows={3} value={FAVORI} onFocus={(e) => e.target.select()} aria-label="Code du bouton de favoris" />
          </details>
        </div>
      </header>

      <section className="annonce">
        <div className="annonce-fiche">
          {donneesExemple && <span className="etiquette">Annonce d'exemple</span>}
          <h2>{titre}</h2>
          <p className="annonce-prix">{euros(bien.prix)}</p>
          <ul className="annonce-faits">
            <li>
              <span>Loyer estimé</span>
              {euros(hyp.loyerNuMensuel)} / mois
              {estimes.includes('loyer') && <em className="estime">{lecture?.loyerDeMarche ? 'estimé d’après les loyers du marché' : 'estimé par l’outil'}</em>}
              {loyerMarche && (
                <em className={`estime ${hyp.loyerNuMensuel > loyerMarche.haut ? 'texte-mauvais' : 'estime-neutre'}`}>
                  Marché : {euros(loyerMarche.loyer)} (de {euros(loyerMarche.bas)} à {euros(loyerMarche.haut)}){loyerMarche.plafond !== undefined && `, plafond légal ${euros(loyerMarche.plafond)}`}
                </em>
              )}
            </li>
            <li>
              <span>Énergie (DPE)</span>
              {bien.dpe ?? 'Non renseigné'}
              {bien.dpeApresTravaux && ` → ${bien.dpeApresTravaux} après travaux`}
              {estimes.includes('dpe') && <em className="estime">absent de l'annonce</em>}
            </li>
            <li>
              <span>Taxe foncière</span>
              {euros(bien.taxeFonciere)} / an
              {estimes.includes('taxeFonciere') && <em className="estime">{lecture?.taxeEstimee ? 'estimée d’après le taux voté par la commune' : 'estimée par l’outil'}</em>}
              {taxeMarche && (
                <em className="estime estime-neutre">
                  Repère : {euros(taxeMarche.montant)} (de {euros(taxeMarche.bas)} à {euros(taxeMarche.haut)})
                </em>
              )}
            </li>
            <li>
              <span>Prix au m²</span>
              {bien.surface > 0 ? euros(bien.prix / bien.surface) : '—'}
            </li>
          </ul>
          <div className="travaux">
            <p className="travaux-titre">Travaux avant de louer : votre estimation</p>
            <div className="grille-champs">
              <Nombre id="travaux-fiche" label="Montant des travaux" value={bien.travaux} onChange={b('travaux')} unite="€" step={500} />
              <Choix<ClasseDpe | ''> id="dpe-apres" label="DPE visé après travaux" value={bien.dpeApresTravaux ?? ''} onChange={(v) => b('dpeApresTravaux')(v === '' ? null : v)} options={[{ valeur: '', libelle: 'Inchangé' }, ...DPE.slice(1)]} />
              <Nombre id="mois-travaux" label="Durée sans locataire" value={bien.moisTravaux ?? 0} onChange={(v) => b('moisTravaux')(Math.min(12, Math.max(0, v)))} unite="mois" step={0.5} />
            </div>
            <p className="champ-aide">
              {estimes.includes('travaux') && <strong className="texte-moyen">L'annonce évoque des travaux : indiquez votre estimation. </strong>}
              {bien.travaux > 0 || (bien.moisTravaux ?? 0) > 0
                ? `Pris en compte dans toute l'analyse : ${euros(bien.travaux)} ajoutés au coût et au crédit${(bien.moisTravaux ?? 0) > 0 ? `, ${bien.moisTravaux} mois de loyer en moins la première année` : ''}${bien.dpeApresTravaux ? `, DPE ${bien.dpeApresTravaux} retenu pour les alertes et le score` : ''}, déduction fiscale selon le régime, score recalculé.`
                : 'Laissez 0 si le bien peut être loué tel quel.'}
            </p>
          </div>
          {lecture && (
            <p className="lecture">
              {source && (
                <>
                  <strong>Source :</strong> {source}
                  {fichierSource && (
                    <>
                      {' '}
                      (
                      <a href={`/api/source?f=${encodeURIComponent(fichierSource)}`} target="_blank" rel="noreferrer">
                        voir le fichier enregistré
                      </a>
                      )
                    </>
                  )}
                  .{' '}
                </>
              )}
              <strong>Lu dans l'annonce :</strong> {lecture.lus.map((c) => LIBELLES_CHAMPS[c] + (c === 'prix' && lecture.originePrix ? ` (${lecture.originePrix})` : '')).join(', ')}.
              {lecture.estimes.length > 0 && (
                <>
                  {' '}
                  <strong className="texte-moyen">Estimé par l'outil, à vérifier :</strong> {lecture.estimes.map((c) => LIBELLES_CHAMPS[c]).join(', ')}.
                </>
              )}
            </p>
          )}
          <form
            className="adresse"
            onSubmit={(e) => {
              e.preventDefault()
              void chercherAdresse()
            }}
          >
            <label htmlFor="adresse">Adresse du bien</label>
            <div className="adresse-saisie">
              <input id="adresse" value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="Numéro, rue, code postal, ville" />
              <button type="submit" className="bouton-secondaire">
                Localiser
              </button>
            </div>
            {messageAdresse && <p className="message">{messageAdresse}</p>}
          </form>
        </div>
        <Carte latitude={bien.latitude} longitude={bien.longitude} adresse={bien.adresse} />
      </section>

      <details className="ajuster">
        <summary>Ajuster les données (annonce, votre situation, hypothèses)</summary>
        <form className="formulaire" onSubmit={(e) => e.preventDefault()} aria-label="Données de l'annonce">
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
            <Choix<ClasseDpe | ''> id="dpe" label="DPE (étiquette énergie)" value={bien.dpe ?? ''} onChange={(v) => b('dpe')(v === '' ? null : v)} options={DPE} />
            <Nombre id="travaux" label="Travaux avant de louer" value={bien.travaux} onChange={b('travaux')} unite="€" step={500} />
            <Nombre id="copro" label="Charges de copropriété" value={bien.chargesCopro} onChange={b('chargesCopro')} unite="€/an" step={50} />
            <Nombre id="recup" label="Part payée par le locataire" value={bien.partChargesRecuperables} onChange={b('partChargesRecuperables')} pourcentage />
            <Nombre id="tf" label="Taxe foncière" value={bien.taxeFonciere} onChange={b('taxeFonciere')} unite="€/an" step={50} />
          </Groupe>

          <Groupe titre="Votre situation">
            <Choix<number> id="tmi" label="Votre tranche d'impôt sur le revenu" value={profil.tmi} onChange={p('tmi')} options={TMI} />
            <Nombre id="apport" label="Épargne que vous pouvez apporter" value={profil.apportDisponible} onChange={p('apportDisponible')} unite="€" step={1000} />
            <Nombre id="revenus" label="Revenus nets du foyer" value={profil.revenusMensuels} onChange={p('revenusMensuels')} unite="€/mois" step={100} aide="Pour vérifier que la banque peut vous prêter" />
            <Nombre id="credits" label="Crédits déjà en cours" value={profil.mensualitesExistantes} onChange={p('mensualitesExistantes')} unite="€/mois" step={50} />
          </Groupe>

          <Groupe titre="Loyers">
            <Nombre
              id="loyer"
              label="Loyer vide, hors charges"
              value={hyp.loyerNuMensuel}
              onChange={(v) => {
                setDonneesExemple(false)
                retirerEstime('loyer')
                h('loyerNuMensuel')(v)
              }}
              unite="€/mois"
              step={10}
              aide="Les autres loyers en sont déduits, sauf si vous les saisissez"
            />
            {modes.map((m) => (
              <Nombre
                key={m}
                id={`loyer-${m}`}
                label={MODES[m].libelle}
                value={loyersModes[m] ?? 0}
                onChange={(v) => {
                  setDonneesExemple(false)
                  setLoyersModes((x) => ({ ...x, [m]: v }))
                }}
                unite="€/mois"
                step={10}
                aide={`0 : ${Math.round(hyp.loyerNuMensuel * MODES[m].coefLoyer)} € estimés`}
              />
            ))}
          </Groupe>

          <Groupe titre="Hypothèses avancées" ouvert={false}>
            <Nombre id="horizon" label="Durée de détention" value={hyp.horizon} onChange={(v) => h('horizon')(Math.min(30, Math.max(5, Math.round(v))))} unite="ans" />
            <Nombre id="valo" label="Hausse annuelle du prix du bien" value={hyp.valorisationBien} onChange={h('valorisationBien')} pourcentage />
            <Nombre id="reval" label="Hausse annuelle des loyers" value={hyp.revalorisationLoyers} onChange={h('revalorisationLoyers')} pourcentage />
            <Nombre id="vacance" label="Mois sans locataire en plus" value={hyp.vacanceSupplementaireMois} onChange={h('vacanceSupplementaireMois')} unite="mois/an" step={0.5} />
            <Nombre id="revente" label="Frais de revente" value={hyp.fraisRevente} onChange={h('fraisRevente')} pourcentage />
            {Object.keys(hyp.tauxCredit).map((d) => (
              <Nombre key={d} id={`taux-${d}`} label={`Taux de crédit sur ${d} ans`} value={hyp.tauxCredit[Number(d)]} onChange={(v) => h('tauxCredit')({ ...hyp.tauxCredit, [d]: v })} pourcentage />
            ))}
            <Nombre id="assurance" label="Assurance emprunteur" value={hyp.assuranceEmprunteur} onChange={h('assuranceEmprunteur')} pourcentage aide="% du capital emprunté par an" />
            <Choix<Objectif>
              id="objectif"
              label="Ce que vous cherchez avant tout"
              value={objectif}
              onChange={setObjectif}
              options={[
                { valeur: 'tri', libelle: 'Le meilleur rendement global' },
                { valeur: 'cashflow', libelle: 'Le moins d’effort chaque mois' },
                { valeur: 'rentabilite', libelle: 'La meilleure rentabilité après impôts' },
              ]}
            />
          </Groupe>
        </form>
      </details>

      <Rapport bien={bienAnalyse} profil={profil} hypotheses={hypotheses} objectif={objectif} donneesExemple={donneesExemple} estimes={estimes} donneesMarche={donneesMarche} onValorisation={h('valorisationBien')} historique={historique} onEnregistrer={enregistrer} />

      <Historique entrees={historique} onCharger={charger} onSupprimer={(id) => majHistorique(historique.filter((e) => e.id !== id))} />
    </div>
  )
}

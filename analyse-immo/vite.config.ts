import react from '@vitejs/plugin-react'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { defineConfig, type Connect, type Plugin } from 'vite'

// Lecture d'une annonce par son lien : le navigateur ne peut pas lire un autre site,
// donc le serveur local télécharge la page (une requête simple, comme un navigateur)
// et la renvoie à l'application. Si le site refuse, l'application propose de coller le texte.
const SITES_ANNONCES = ['leboncoin.fr', 'seloger.com', 'pap.fr', 'bienici.com', 'logic-immo.com', 'paruvendu.fr', 'ouestfrance-immo.com', 'lefigaro.fr', 'orpi.com', 'century21.fr', 'laforet.com', 'superimmo.com']

const siteAutorise = (u: URL) => u.protocol === 'https:' && SITES_ANNONCES.some((d) => u.hostname === d || u.hostname.endsWith(`.${d}`))

const lectureAnnonce: Connect.NextHandleFunction = async (req, res, next) => {
  if (!req.url?.startsWith('/api/annonce')) return next()
  const repondre = (corps: object) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(corps))
  }
  try {
    const cible = new URL(new URL(req.url, 'http://localhost').searchParams.get('url') ?? '')
    if (!siteAutorise(cible)) return repondre({ ok: false, raison: 'site' })
    const r = await fetch(cible, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', 'Accept-Language': 'fr-FR,fr;q=0.9', Accept: 'text/html' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!siteAutorise(new URL(r.url))) return repondre({ ok: false, raison: 'site' })
    const html = await r.text()
    // Protection anti-robot : on ne la contourne pas, on le signale.
    if (!r.ok || /captcha-delivery|datadome|cf-challenge|Access Denied/i.test(html.slice(0, 5000))) return repondre({ ok: false, raison: 'refus', statut: r.status })
    repondre({ ok: true, html: html.slice(0, 2_000_000) })
  } catch {
    repondre({ ok: false, raison: 'erreur' })
  }
}

// Conservation des pages reçues par le bouton de favoris : chaque page HTML est enregistrée
// dans le dossier sources/ pour garder la source d'origine de l'analyse.
const DOSSIER_SOURCES = join(process.cwd(), 'sources')
const TAILLE_MAX = 15 * 1024 * 1024

const sourcesAnnonces: Connect.NextHandleFunction = async (req, res, next) => {
  if (!req.url?.startsWith('/api/source')) return next()
  const json = (corps: object, statut = 200) => {
    res.statusCode = statut
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(corps))
  }
  try {
    if (req.method === 'POST') {
      // Seule l'application elle-même peut enregistrer une source.
      const origine = req.headers.origin
      if (origine && new URL(origine).host !== req.headers.host) return json({ ok: false }, 403)
      const morceaux: Buffer[] = []
      let taille = 0
      for await (const m of req) {
        taille += m.length
        if (taille > TAILLE_MAX) return json({ ok: false, raison: 'taille' }, 413)
        morceaux.push(m)
      }
      const { url, html } = JSON.parse(Buffer.concat(morceaux).toString('utf8'))
      if (typeof html !== 'string') return json({ ok: false }, 400)
      let site = 'page'
      try {
        site = new URL(url).hostname.replace(/^www\./, '').replace(/[^a-z0-9.-]/gi, '')
      } catch {
        // lien absent : nom générique
      }
      const fichier = `${site}-${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)}.html`
      await mkdir(DOSSIER_SOURCES, { recursive: true })
      await writeFile(join(DOSSIER_SOURCES, fichier), `<!-- Source : ${String(url).replace(/--/g, '')} | Capturée le ${new Date().toISOString()} -->\n${html}`, 'utf8')
      return json({ ok: true, fichier })
    }
    const fichier = new URL(req.url, 'http://localhost').searchParams.get('f') ?? ''
    if (!/^[a-z0-9.-]+\.html$/i.test(fichier) || fichier.includes('..')) return json({ ok: false }, 400)
    // Servi en texte brut : on consulte le code source, on n'exécute pas la page.
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end(await readFile(join(DOSSIER_SOURCES, fichier), 'utf8'))
  } catch {
    json({ ok: false }, 500)
  }
}

// Ventes réelles autour du bien : fichiers DVF géolocalisés par commune (data.gouv.fr, Licence Ouverte 2.0),
// téléchargés à la demande puis gardés dans cache-dvf/.
const DOSSIER_DVF = join(process.cwd(), 'cache-dvf')
const ANNEES_DVF = [2023, 2024, 2025]

interface Vente {
  date: string
  adresse: string
  type: 'appartement' | 'maison'
  surface: number
  pieces: number
  prix: number
  lat: number
  lon: number
}

function lireVentes(csv: string): Vente[] {
  const lignes = csv.split(/\r?\n/).filter(Boolean)
  const col = Object.fromEntries(lignes[0].split(',').map((n, i) => [n, i]))
  // Une vente peut porter sur plusieurs biens : on ne garde que celles d'un seul logement, sinon le prix au m² est faux.
  const parMutation = new Map<string, string[][]>()
  for (const ligne of lignes.slice(1)) {
    const c = ligne.split(',')
    if (c[col.nature_mutation] !== 'Vente') continue
    const liste = parMutation.get(c[col.id_mutation]) ?? []
    liste.push(c)
    parMutation.set(c[col.id_mutation], liste)
  }
  const ventes: Vente[] = []
  for (const lots of parMutation.values()) {
    const logements = lots.filter((c) => c[col.type_local] === 'Appartement' || c[col.type_local] === 'Maison')
    if (logements.length !== 1 || lots.some((c) => c[col.type_local]?.startsWith('Local'))) continue
    const c = logements[0]
    const v: Vente = {
      date: c[col.date_mutation],
      adresse: `${c[col.adresse_numero]} ${c[col.adresse_nom_voie]}`.trim(),
      type: c[col.type_local] === 'Maison' ? 'maison' : 'appartement',
      surface: Number(c[col.surface_reelle_bati]),
      pieces: Number(c[col.nombre_pieces_principales]),
      prix: Number(c[col.valeur_fonciere]),
      lat: Number(c[col.latitude]),
      lon: Number(c[col.longitude]),
    }
    if (v.surface >= 8 && v.prix >= 10_000 && Number.isFinite(v.lat) && Number.isFinite(v.lon) && v.lat !== 0) ventes.push(v)
  }
  return ventes
}

async function ventesCommune(insee: string): Promise<Vente[]> {
  const cache = join(DOSSIER_DVF, `${insee}.json`)
  try {
    return JSON.parse(await readFile(cache, 'utf8'))
  } catch {
    // pas encore en cache
  }
  const dep = insee.startsWith('97') ? insee.slice(0, 3) : insee.slice(0, 2)
  const ventes: Vente[] = []
  for (const annee of ANNEES_DVF) {
    const r = await fetch(`https://files.data.gouv.fr/geo-dvf/latest/csv/${annee}/communes/${dep}/${insee}.csv`, { signal: AbortSignal.timeout(60_000) })
    if (r.ok) ventes.push(...lireVentes(await r.text()))
  }
  await mkdir(DOSSIER_DVF, { recursive: true })
  await writeFile(cache, JSON.stringify(ventes), 'utf8')
  return ventes
}

const distanceM = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const rad = Math.PI / 180
  const x = (lon2 - lon1) * rad * Math.cos(((lat1 + lat2) / 2) * rad)
  const y = (lat2 - lat1) * rad
  return Math.sqrt(x * x + y * y) * 6_371_000
}

const ventesProches: Connect.NextHandleFunction = async (req, res, next) => {
  if (!req.url?.startsWith('/api/ventes')) return next()
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  try {
    const q = new URL(req.url, 'http://localhost').searchParams
    const insee = q.get('insee') ?? ''
    const lat = Number(q.get('lat'))
    const lon = Number(q.get('lon'))
    const surface = Number(q.get('surface'))
    const type = q.get('type')
    if (!/^(\d{5}|2[AB]\d{3})$/.test(insee) || !Number.isFinite(lat) || !Number.isFinite(lon) || !(surface > 0)) return void res.end(JSON.stringify({ ok: false, raison: 'parametres' }))
    // Comparables : même type de bien, surface voisine, les plus proches d'abord.
    const comparables = (await ventesCommune(insee))
      .filter((v) => v.type === type && v.surface >= surface * 0.7 && v.surface <= surface * 1.3)
      .map((v) => ({ ...v, distance: Math.round(distanceM(lat, lon, v.lat, v.lon)) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 15)
    res.end(JSON.stringify({ ok: true, annees: ANNEES_DVF, ventes: comparables }))
  } catch {
    res.end(JSON.stringify({ ok: false, raison: 'erreur' }))
  }
}

const pluginAnnonce: Plugin = {
  name: 'lecture-annonce',
  configureServer: (serveur) => void serveur.middlewares.use(lectureAnnonce).use(sourcesAnnonces).use(ventesProches),
  configurePreviewServer: (serveur) => void serveur.middlewares.use(lectureAnnonce).use(sourcesAnnonces).use(ventesProches),
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), pluginAnnonce],
  // Les pages capturées ne doivent pas faire recharger l'application.
  server: { watch: { ignored: ['**/sources/**', '**/cache-dvf/**'] } },
})

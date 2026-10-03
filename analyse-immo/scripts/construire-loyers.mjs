// Construit les fichiers de loyers de marché par commune (un JSON par département) dans public/donnees/loyers.
// Source : « Carte des loyers », indicateurs de loyers d'annonce par commune en 2025
// (ministère chargé du logement / ANIL, data.gouv.fr, Licence Ouverte 2.0). Loyers en €/m² charges comprises.
// Usage : node scripts/construire-loyers.mjs [dossier contenant loyers-app12.csv, loyers-app3.csv, loyers-mai.csv]
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const BASE = 'https://static.data.gouv.fr/resources/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025'
const FICHIERS = { app12: '20251211-144934/pred-app12-mef-dhup.csv', app3: '20251211-144951/pred-app3-mef-dhup.csv', mai: '20251211-145039/pred-mai-mef-dhup.csv' }
const SORTIE = join(process.cwd(), 'public', 'donnees', 'loyers')

const lire = async (cle) => (process.argv[2] ? readFile(join(process.argv[2], `loyers-${cle}.csv`), 'latin1') : new TextDecoder('latin1').decode(await (await fetch(`${BASE}/${FICHIERS[cle]}`)).arrayBuffer()))
const nb = (v) => Math.round(Number(v.replace(',', '.')) * 100) / 100

// département -> code INSEE -> { app12, app3, mai } avec [loyer, bas, haut, 1 si estimé à la commune (0 : maille de communes voisines)]
const parDepartement = new Map()
for (const cle of Object.keys(FICHIERS)) {
  const lignes = (await lire(cle)).split(/\r?\n/).filter(Boolean)
  const col = Object.fromEntries(lignes[0].split(';').map((n, i) => [n.replaceAll('"', ''), i]))
  for (const ligne of lignes.slice(1)) {
    const c = ligne.split(';').map((v) => v.replaceAll('"', ''))
    const dep = c[col.DEP]
    if (!parDepartement.has(dep)) parDepartement.set(dep, {})
    const communes = parDepartement.get(dep)
    ;(communes[c[col.INSEE_C]] ??= {})[cle] = [nb(c[col.loypredm2]), nb(c[col['lwr.IPm2']]), nb(c[col['upr.IPm2']]), c[col.TYPPRED] === 'commune' ? 1 : 0]
  }
}

await mkdir(SORTIE, { recursive: true })
let total = 0
for (const [dep, communes] of parDepartement) {
  await writeFile(join(SORTIE, `${dep}.json`), JSON.stringify(communes))
  total += Object.keys(communes).length
}
console.log(`${parDepartement.size} départements, ${total} communes écrits dans ${SORTIE}`)

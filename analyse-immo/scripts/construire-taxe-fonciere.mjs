// Construit les taux de taxe foncière par commune (un JSON par département) dans public/donnees/taxe-fonciere.
// Source : « Fiscalité locale des particuliers », DGFiP (data.economie.gouv.fr, Licence Ouverte 2.0), exercice 2025.
// Chaque commune : [taux global de taxe foncière sur le bâti en %, taux plein de taxe d'enlèvement des ordures ménagères en %].
// Usage : node scripts/construire-taxe-fonciere.mjs [chemin du CSV déjà téléchargé]
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const URL_CSV =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/fiscalite-locale-des-particuliers/exports/csv?select=insee_com,taux_global_tfb,taux_plein_teom&where=exercice%3D%222025%22&delimiter=%3B'
const SORTIE = join(process.cwd(), 'public', 'donnees', 'taxe-fonciere')

const csv = process.argv[2] ? await readFile(process.argv[2], 'utf8') : await (await fetch(URL_CSV)).text()
const parDepartement = new Map()
for (const ligne of csv.split(/\r?\n/).slice(1)) {
  const [insee, tfb, teom] = ligne.split(';')
  if (!insee || !tfb) continue
  const dep = insee.startsWith('97') ? insee.slice(0, 3) : insee.slice(0, 2)
  if (!parDepartement.has(dep)) parDepartement.set(dep, {})
  parDepartement.get(dep)[insee] = [Number(tfb), teom ? Number(teom) : null]
}

await mkdir(SORTIE, { recursive: true })
let total = 0
for (const [dep, communes] of parDepartement) {
  await writeFile(join(SORTIE, `${dep}.json`), JSON.stringify(communes))
  total += Object.keys(communes).length
}
console.log(`${parDepartement.size} départements, ${total} communes écrits dans ${SORTIE}`)

// Construit les fichiers de prix au m² par commune (un JSON par département) dans public/donnees/prix.
// Source : « Prix immobilier par commune, ventes 2014 à 2025 (DVF), millésime 2026 », data.gouv.fr, Licence Ouverte 2.0.
// Usage : node scripts/construire-prix.mjs [chemin du CSV déjà téléchargé]
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const URL_CSV = 'https://static.data.gouv.fr/resources/prix-immobilier-par-commune-ventes-2014-a-2025-dvf-millesime-2026/20260908-125927/prix-immobilier-communes-series-2014-2025.csv'
const SORTIE = join(process.cwd(), 'public', 'donnees', 'prix')

const csv = process.argv[2] ? await readFile(process.argv[2], 'utf8') : await (await fetch(URL_CSV)).text()

// Découpe une ligne CSV en tenant compte des guillemets.
function champs(ligne) {
  const r = []
  let c = ''
  let guillemets = false
  for (const ch of ligne) {
    if (ch === '"') guillemets = !guillemets
    else if (ch === ',' && !guillemets) {
      r.push(c)
      c = ''
    } else c += ch
  }
  r.push(c)
  return r
}

const lignes = csv.split(/\r?\n/).filter(Boolean)
const col = Object.fromEntries(champs(lignes[0]).map((n, i) => [n, i]))
const nb = (v) => (v === '' || v === undefined ? null : Number(v))

// departement -> code INSEE -> { n: nom, a: { année: [tous, appartement, maison, ventes] } }
const parDepartement = new Map()
for (const ligne of lignes.slice(1)) {
  const c = champs(ligne)
  const dep = c[col.code_departement]
  const insee = c[col.code_insee]
  if (!parDepartement.has(dep)) parDepartement.set(dep, {})
  const communes = parDepartement.get(dep)
  communes[insee] ??= { n: c[col.commune], a: {} }
  communes[insee].a[c[col.annee]] = [nb(c[col.prix_m2_median]), nb(c[col.prix_m2_median_appartement]), nb(c[col.prix_m2_median_maison]), nb(c[col.ventes])]
}

await mkdir(SORTIE, { recursive: true })
let total = 0
for (const [dep, communes] of parDepartement) {
  await writeFile(join(SORTIE, `${dep}.json`), JSON.stringify(communes))
  total += Object.keys(communes).length
}
console.log(`${parDepartement.size} départements, ${total} communes écrits dans ${SORTIE}`)

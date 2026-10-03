// Construit public/donnees/indices-notaires-insee.json : indices Notaires-INSEE des prix des logements anciens,
// en moyenne annuelle, par zone et type de bien (séries CVS, base 100 en 2015).
// Source : INSEE, Banque de données macroéconomiques, groupe IPLA-IPLNA-2015 (accès libre).
// Usage : node scripts/construire-indices.mjs [chemin du XML déjà téléchargé]
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const URL_XML = 'https://bdm.insee.fr/series/sdmx/data/IPLA-IPLNA-2015?startPeriod=2000'
const xml = process.argv[2] ? await readFile(process.argv[2], 'utf8') : await (await fetch(URL_XML)).text()

const indices = {}
for (const bloc of xml.matchAll(/<Series ([^>]*)>([\s\S]*?)<\/Series>/g)) {
  const titre = bloc[1].match(/TITLE_FR="([^"]+)"/)?.[1] ?? ''
  if (!/^Indice des prix des logements anciens/.test(titre) || !/CVS/i.test(titre)) continue
  // « Indice … - Zone - Type - Base 100 … » ou « … - Île-de-France : Type - … »
  const parties = titre.split(' - ').map((p) => p.trim())
  let zone = parties[1]
  let type = parties.slice(2).find((p) => /^(Appartements|Maisons|Ensemble)$/.test(p))
  const collee = zone.match(/^(.*) : (Appartements|Maisons|Ensemble)$/)
  if (collee) {
    zone = collee[1]
    type = collee[2]
  }
  if (!type || parties.some((p) => /^(Banlieues|Villes centres)$/.test(p))) continue
  zone = zone.replace(/^Île-de-France : (?=\S)/, '').replace(/^Agglomération de /, '')
  const parAnnee = {}
  for (const o of bloc[2].matchAll(/TIME_PERIOD="(\d{4})-Q\d" OBS_VALUE="([\d.]+)"/g)) (parAnnee[o[1]] ??= []).push(Number(o[2]))
  const a = Object.fromEntries(
    Object.entries(parAnnee)
      .filter(([, v]) => v.length === 4) // années complètes seulement
      .map(([an, v]) => [an, Math.round((v.reduce((s, x) => s + x, 0) / 4) * 10) / 10]),
  )
  if (Object.keys(a).length) indices[`${zone}|${type}`] = { idbank: bloc[1].match(/IDBANK="([^"]+)"/)?.[1], a }
}

const dossier = join(process.cwd(), 'public', 'donnees')
await mkdir(dossier, { recursive: true })
await writeFile(join(dossier, 'indices-notaires-insee.json'), JSON.stringify(indices))
console.log(`${Object.keys(indices).length} séries écrites :\n${Object.keys(indices).sort().join('\n')}`)

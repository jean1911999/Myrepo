import type { Bien, ClasseDpe, TypeBien } from '../engine'

// Lecture d'une annonce à partir du HTML de la page ou du texte copié-collé.
// Heuristiques simples : ce qui n'est pas trouvé est estimé et signalé à l'utilisateur.

export type ChampAnnonce = 'prix' | 'surface' | 'pieces' | 'type' | 'dpe' | 'chargesCopro' | 'taxeFonciere' | 'ville' | 'loyer' | 'travaux'

export interface AnnonceLue {
  prix?: number
  surface?: number
  pieces?: number
  type?: TypeBien
  neuf?: boolean
  dpe?: ClasseDpe
  chargesCopro?: number // € / an
  taxeFonciere?: number // € / an
  ville?: string
  codePostal?: string
  titre?: string
  originePrix?: 'données structurées' | 'données embarquées' | 'texte de la page'
  travauxMentionnes: boolean
}

const nombre = (s: string) => Number(s.replace(/[\s  .]/g, '').replace(',', '.'))

const ENTITES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&euro;': '€', '&eacute;': 'é', '&egrave;': 'è', '&sup2;': '²', '&#178;': '²', '&#8364;': '€', '&quot;': '"', '&#39;': "'" }

export function enTexte(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITES[e.toLowerCase()] ?? ' ')
    .replace(/[  ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function meta(html: string, propriete: string): string | undefined {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${propriete}["'][^>]+content=["']([^"']+)["']`, 'i')) ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${propriete}["']`, 'i'))
  return m?.[1]
}

// donnees : données structurées de la page (JSON-LD, état embarqué), transmises par le bouton de favoris.
export function extraireAnnonce(source: string, donnees: { ld?: string; etat?: string } = {}): AnnonceLue {
  const estHtml = /<html|<body|<meta|<div/i.test(source)
  const titre = estHtml ? (meta(source, 'og:title') ?? source.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1])?.trim() : undefined
  const description = estHtml ? (meta(source, 'og:description') ?? meta(source, 'description') ?? '') : ''
  // Le titre et la description passent en premier : ils décrivent le bien, pas les annonces voisines.
  const texte = `${titre ?? ''} ${description} ${estHtml ? enTexte(source) : source.replace(/[  ]/g, ' ').replace(/\s+/g, ' ')}`
  const r: AnnonceLue = { titre, travauxMentionnes: /travaux [àa] pr[ée]voir|[àa] r[ée]nover|[àa] rafra[iî]chir/i.test(texte) }

  // Prix : donnée structurée d'abord, sinon premier montant plausible qui n'est ni un loyer ni un prix au m².
  const PRIX_STRUCTURE = /"price"\s*:\s*\[?\s*"?(\d{4,9})(?:\.\d+)?"?/
  const structure = (estHtml ? source.match(PRIX_STRUCTURE) : null) ?? donnees.ld?.match(PRIX_STRUCTURE)
  if (structure) {
    r.prix = Number(structure[1])
    r.originePrix = 'données structurées'
  } else {
    for (const m of texte.matchAll(/(\d{1,3}(?:[ .]\d{3})+|\d{5,8})\s*(?:€|euros?\b)(?!\s*(?:\/|par)\s*(?:m|mois|an))/gi)) {
      const v = nombre(m[1])
      if (v >= 10_000 && v <= 20_000_000) {
        r.prix = v
        r.originePrix = 'texte de la page'
        break
      }
    }
  }

  // Dernier recours pour le prix : l'état embarqué de la page, qui peut aussi contenir d'autres annonces.
  if (!r.prix) {
    const etat = donnees.etat?.match(PRIX_STRUCTURE)
    if (etat) {
      r.prix = Number(etat[1])
      r.originePrix = 'données embarquées'
    }
  }

  for (const m of texte.matchAll(/(\d{1,4}(?:[.,]\d{1,2})?)\s*m(?:²|2\b)/gi)) {
    const v = nombre(m[1])
    if (v >= 8 && v <= 1000) {
      r.surface = v
      break
    }
  }

  const pieces = texte.match(/(\d{1,2})\s*pi[èe]ces?\b/i) ?? texte.match(/\b[TF](\d)\b/)
  if (pieces) r.pieces = Number(pieces[1])
  else if (/\bstudio\b/i.test(texte)) r.pieces = 1

  const type = texte.match(/\b(appartement|studio|duplex|loft|maison|villa|pavillon|parking|box|garage)\b/i)?.[1].toLowerCase()
  if (type) r.type = ['maison', 'villa', 'pavillon'].includes(type) ? 'maison' : ['parking', 'box', 'garage'].includes(type) ? 'parking' : 'appartement'
  if (/\b(programme neuf|logement neuf|appartement neuf|maison neuve|VEFA)\b/i.test(texte)) r.neuf = true

  const dpe = texte.match(/(?:\bDPE\b|classe [ée]nerg(?:ie|[ée]tique)|performance [ée]nerg[ée]tique|consommation [ée]nerg[ée]tique)\s*(?:\([^)]*\))?\s*[:-]?\s*(?:class[ée]e?\s*)?([A-G])\b/i)
  if (dpe) r.dpe = dpe[1].toUpperCase() as ClasseDpe

  const charges = texte.match(/charges(?: annuelles| courantes| de copropri[ée]t[ée])*[^.\d€]{0,60}?(\d[\d ]{1,6})\s*(?:€|euros?)\s*(?:\/|par)?\s*(an|mois)?/i)
  if (charges) {
    const v = nombre(charges[1])
    const annuel = charges[2]?.toLowerCase() === 'mois' ? v * 12 : v
    if (annuel >= 100 && annuel <= 20_000) r.chargesCopro = annuel
  }

  const tf = texte.match(/taxe fonci[èe]re[^\d€]{0,40}(\d[\d ]{1,6})\s*(?:€|euros?)/i)
  if (tf) {
    const v = nombre(tf[1])
    if (v >= 50 && v <= 20_000) r.taxeFonciere = v
  }

  const lieu = texte.match(/([A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+(?:[ -][A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+){0,3})(?:\s+\d{1,2}\s?(?:er|e|[èe]me))?\s*\(?(\d{5})\)?/)
  const lieuInverse = texte.match(/\b(\d{5})\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+(?:[ -][A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+){0,3})/)
  if (lieu && Number(lieu[2]) >= 1000) {
    r.ville = lieu[1]
    r.codePostal = lieu[2]
  } else if (lieuInverse) {
    r.ville = lieuInverse[2]
    r.codePostal = lieuInverse[1]
  }
  return r
}

// Hypothèses de repli quand l'annonce ne donne pas l'information.
export const ESTIMATIONS = {
  rendementBrut: 0.055, // loyer annuel / prix, moyenne grossière en France
  chargesCoproParM2: 25, // € / m² / an
  taxeFonciereEnMoisDeLoyer: 1,
}

export interface AnnonceAppliquee {
  bien: Bien
  loyerNuMensuel: number
  lus: ChampAnnonce[]
  estimes: ChampAnnonce[]
  originePrix?: AnnonceLue['originePrix']
}

export const LIBELLES_CHAMPS: Record<ChampAnnonce, string> = {
  prix: 'prix',
  surface: 'surface',
  pieces: 'nombre de pièces',
  type: 'type de bien',
  dpe: 'DPE',
  chargesCopro: 'charges de copropriété',
  taxeFonciere: 'taxe foncière',
  ville: 'ville',
  loyer: 'loyer',
  travaux: 'travaux',
}

// Construit le bien à analyser ; renvoie null si le prix ou la surface manquent (analyse impossible).
export function appliquerAnnonce(a: AnnonceLue): AnnonceAppliquee | null {
  if (!a.prix || !a.surface) return null
  const lus: ChampAnnonce[] = ['prix', 'surface']
  const estimes: ChampAnnonce[] = []
  const note = (c: ChampAnnonce, lu: boolean) => (lu ? lus : estimes).push(c)

  const type = a.type ?? 'appartement'
  note('type', a.type !== undefined)
  const pieces = a.pieces ?? Math.max(1, Math.round(a.surface / 22))
  note('pieces', a.pieces !== undefined)
  const loyerNuMensuel = Math.round((a.prix * ESTIMATIONS.rendementBrut) / 12 / 10) * 10
  estimes.push('loyer')
  const chargesCopro = a.chargesCopro ?? (type === 'appartement' ? Math.round((a.surface * ESTIMATIONS.chargesCoproParM2) / 50) * 50 : 0)
  note('chargesCopro', a.chargesCopro !== undefined)
  const taxeFonciere = a.taxeFonciere ?? Math.round((loyerNuMensuel * ESTIMATIONS.taxeFonciereEnMoisDeLoyer) / 50) * 50
  note('taxeFonciere', a.taxeFonciere !== undefined)
  note('dpe', a.dpe !== undefined)
  note('ville', a.ville !== undefined)
  if (a.travauxMentionnes) estimes.push('travaux')

  return {
    bien: {
      prix: a.prix,
      surface: a.surface,
      pieces,
      type,
      neuf: a.neuf ?? false,
      fraisAgence: 0,
      travaux: 0,
      chargesCopro,
      partChargesRecuperables: 0.5,
      taxeFonciere,
      dpe: a.dpe ?? null,
      ville: a.ville,
      adresse: a.ville ? `${a.codePostal ?? ''} ${a.ville}`.trim() : undefined,
    },
    loyerNuMensuel,
    lus,
    estimes,
    originePrix: a.originePrix,
  }
}

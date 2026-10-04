import { describe, expect, it } from 'vitest'
import { appliquerAnnonce, extraireAnnonce } from './extraire'

describe('extraireAnnonce', () => {
  it('lit un texte d’annonce copié-collé', () => {
    const a = extraireAnnonce(
      'Appartement 3 pièces 62,5 m² Nantes (44000) 249 000 € 3 984 €/m² Bel appartement T3 lumineux, travaux à prévoir. Charges de copropriété : 1 440 € / an. Taxe foncière : 980 €. DPE : D GES : B',
    )
    expect(a).toMatchObject({ prix: 249_000, surface: 62.5, pieces: 3, type: 'appartement', dpe: 'D', chargesCopro: 1440, taxeFonciere: 980, ville: 'Nantes', codePostal: '44000', travauxMentionnes: true })
  })

  it('lit le HTML d’une page : titre, données structurées, charges mensuelles', () => {
    const html = `<html><head><title>Maison 5 pièces 110 m² - Annonces</title><meta property="og:title" content="Vente maison 5 pièces 110 m² Angers 49000">
      <script type="application/ld+json">{"@type":"Product","offers":{"price":"315000","priceCurrency":"EUR"}}</script></head>
      <body><div>Loyer estimé 1 200 € / mois</div><p>Classe énergie : C</p><p>Charges : 60 € par mois</p></body></html>`
    const a = extraireAnnonce(html)
    expect(a).toMatchObject({ prix: 315_000, surface: 110, pieces: 5, type: 'maison', dpe: 'C', chargesCopro: 720, ville: 'Angers', codePostal: '49000' })
  })

  it('ne prend pas un loyer ou un prix au m² pour le prix', () => {
    expect(extraireAnnonce('Studio 20 m² loué 650 € / mois, 5 500 € / m², prix 110 000 €').prix).toBe(110_000)
  })

  it('utilise les données structurées transmises par le bouton de favoris', () => {
    const texte = 'Appartement 3 pièces 70 m² Rennes (35000) Prix sur demande'
    expect(extraireAnnonce(texte, { ld: '{"offers":{"price":289000}}' }).prix).toBe(289_000)
    expect(extraireAnnonce(texte, { etat: '{"ad":{"price":[289000]}}' }).prix).toBe(289_000)
  })

  it('lit une ville avec arrondissement', () => {
    expect(extraireAnnonce('Vente appartement 2 pièces 43 m² Lyon 7ème (69007) 235 000 €')).toMatchObject({ ville: 'Lyon', codePostal: '69007', prix: 235_000 })
  })
})

describe('appliquerAnnonce', () => {
  it('estime et signale ce qui manque', () => {
    const r = appliquerAnnonce(extraireAnnonce('Appartement 40 m² 120 000 €'))
    expect(r).not.toBeNull()
    expect(r!.lus).toEqual(expect.arrayContaining(['prix', 'surface', 'type']))
    expect(r!.estimes).toEqual(expect.arrayContaining(['loyer', 'pieces', 'chargesCopro', 'taxeFonciere', 'dpe', 'ville']))
    expect(r!.loyerNuMensuel).toBe(550)
    expect(r!.bien.pieces).toBe(2)
  })

  it('refuse une annonce sans prix ni surface', () => {
    expect(appliquerAnnonce(extraireAnnonce('Bel appartement en centre-ville'))).toBeNull()
  })
})

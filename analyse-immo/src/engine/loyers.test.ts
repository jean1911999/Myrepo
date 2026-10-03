import { describe, expect, it } from 'vitest'
import { estimerLoyer, type LoyersCommune } from './loyers'

const TOULOUSE: LoyersCommune = { app12: [16.33, 13.25, 20.11, 1], app3: [12.83, 9.98, 16.5, 1], mai: [12.86, 9.5, 17.41, 0] }

describe('estimerLoyer', () => {
  it('prend l’indicateur selon le type et le nombre de pièces, et retire les charges', () => {
    // 12,83 €/m² charges comprises × 55 m² × 0,9 = 635 €, arrondi à la dizaine
    expect(estimerLoyer(TOULOUSE, 'appartement', 3, 55)).toMatchObject({ loyer: 640, bas: 490, haut: 820, precision: 'commune', categorie: 'appartements de 3 pièces et plus' })
    expect(estimerLoyer(TOULOUSE, 'appartement', 2, 40)!.loyer).toBe(590)
    expect(estimerLoyer(TOULOUSE, 'maison', 5, 100)).toMatchObject({ loyer: 1160, precision: 'communes voisines' })
  })

  it('ne donne rien sans donnée, pour un parking ou sans surface', () => {
    expect(estimerLoyer({}, 'appartement', 3, 55)).toBeNull()
    expect(estimerLoyer(TOULOUSE, 'parking', 0, 12)).toBeNull()
    expect(estimerLoyer(TOULOUSE, 'appartement', 3, 0)).toBeNull()
  })
})

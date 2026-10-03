export function van(taux: number, flux: number[]): number {
  return flux.reduce((s, f, i) => s + f / Math.pow(1 + taux, i), 0)
}

// Taux de rendement interne par dichotomie.
// Renvoie null quand aucun flux n'est négatif (aucune mise de fonds : TRI infini)
// et -1 quand aucun flux n'est positif (perte totale).
export function tri(flux: number[]): number | null {
  const aNegatif = flux.some((f) => f < 0)
  const aPositif = flux.some((f) => f > 0)
  if (!aNegatif) return null
  if (!aPositif) return -1
  let bas = -0.99
  let haut = 10
  let vBas = van(bas, flux)
  const vHaut = van(haut, flux)
  if (Math.sign(vBas) === Math.sign(vHaut)) return vBas < 0 ? -1 : null
  for (let i = 0; i < 200; i++) {
    const milieu = (bas + haut) / 2
    const v = van(milieu, flux)
    if (Math.abs(v) < 1e-7) return milieu
    if (Math.sign(v) === Math.sign(vBas)) {
      bas = milieu
      vBas = v
    } else {
      haut = milieu
    }
  }
  return (bas + haut) / 2
}

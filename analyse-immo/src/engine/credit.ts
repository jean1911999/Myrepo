export function mensualite(capital: number, tauxAnnuel: number, dureeAnnees: number): number {
  if (capital <= 0) return 0
  const n = dureeAnnees * 12
  const t = tauxAnnuel / 12
  if (t === 0) return capital / n
  return (capital * t) / (1 - Math.pow(1 + t, -n))
}

export interface LigneAmortissement {
  annee: number
  interets: number
  capital: number
  capitalRestantDu: number
}

// Tableau d'amortissement agrégé par année, calculé mois par mois.
export function tableauAmortissement(capital: number, tauxAnnuel: number, dureeAnnees: number, horizon = dureeAnnees): LigneAmortissement[] {
  const m = mensualite(capital, tauxAnnuel, dureeAnnees)
  const t = tauxAnnuel / 12
  let crd = capital
  const lignes: LigneAmortissement[] = []
  for (let a = 1; a <= horizon; a++) {
    let interets = 0
    let rembourse = 0
    for (let mois = 0; mois < 12; mois++) {
      if (crd <= 1e-9) break
      const i = crd * t
      const c = Math.min(m - i, crd)
      interets += i
      rembourse += c
      crd -= c
    }
    lignes.push({ annee: a, interets, capital: rembourse, capitalRestantDu: Math.max(crd, 0) })
  }
  return lignes
}

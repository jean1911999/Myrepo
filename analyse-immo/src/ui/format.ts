const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const pct = new Intl.NumberFormat('fr-FR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })

export const euros = (v: number) => eur.format(Math.round(v))
export const pourcent = (v: number) => pct.format(v)
export const triTexte = (v: number | null) => (v === null ? 'Infini (aucune mise de fonds)' : v <= -1 ? 'Perte totale' : pct.format(v))
export const signe = (v: number) => (v > 0 ? '+' : '') + euros(v)

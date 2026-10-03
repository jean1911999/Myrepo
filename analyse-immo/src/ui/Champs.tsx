import type { ReactNode } from 'react'

interface NombreProps {
  id: string
  label: string
  value: number
  onChange: (v: number) => void
  unite?: string
  step?: number
  aide?: string
  pourcentage?: boolean // affiche et saisit la valeur en %
}

export function Nombre({ id, label, value, onChange, unite, step = 1, aide, pourcentage }: NombreProps) {
  const affiche = pourcentage ? Math.round(value * 10_000) / 100 : value
  return (
    <label className="champ" htmlFor={id}>
      <span className="champ-label">{label}</span>
      <span className="champ-saisie">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={pourcentage ? 0.05 : step}
          value={Number.isFinite(affiche) ? affiche : ''}
          onChange={(e) => {
            const v = e.target.value === '' ? 0 : Number(e.target.value)
            onChange(pourcentage ? v / 100 : v)
          }}
        />
        {(unite || pourcentage) && <span className="unite">{pourcentage ? '%' : unite}</span>}
      </span>
      {aide && <span className="champ-aide">{aide}</span>}
    </label>
  )
}

interface ChoixProps<T extends string | number> {
  id: string
  label: string
  value: T
  options: { valeur: T; libelle: string }[]
  onChange: (v: T) => void
}

export function Choix<T extends string | number>({ id, label, value, options, onChange }: ChoixProps<T>) {
  return (
    <label className="champ" htmlFor={id}>
      <span className="champ-label">{label}</span>
      <select
        id={id}
        value={String(value)}
        onChange={(e) => {
          const o = options.find((x) => String(x.valeur) === e.target.value)
          if (o) onChange(o.valeur)
        }}
      >
        {options.map((o) => (
          <option key={String(o.valeur)} value={String(o.valeur)}>
            {o.libelle}
          </option>
        ))}
      </select>
    </label>
  )
}

export function Groupe({ titre, children, ouvert = true }: { titre: string; children: ReactNode; ouvert?: boolean }) {
  return (
    <details className="groupe" open={ouvert}>
      <summary>{titre}</summary>
      <div className="grille-champs">{children}</div>
    </details>
  )
}

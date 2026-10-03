import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fraisNotaire, type Bien, type Hypotheses, type Resultat, type Scenario, type Sensibilite } from '../engine'
import { euros, pourcent, signe, triTexte } from './format'

// Couleurs des séries : variables CSS (--serie-1…), définies pour le clair et le sombre dans index.css.
const S = (n: number) => `var(--serie-${n})`
const infobulle = { background: 'var(--surface)', border: '1px solid var(--ligne)', borderRadius: 8, color: 'var(--texte)' }
const kEuros = (v: number) => `${Math.round(v / 1000)} k€`

function Legende({ items }: { items: { nom: string; couleur: string; valeur?: string }[] }) {
  return (
    <ul className="legende">
      {items.map((i) => (
        <li key={i.nom}>
          <span className="pastille" style={{ background: i.couleur }} />
          {i.nom}
          {i.valeur && <strong>{i.valeur}</strong>}
        </li>
      ))}
    </ul>
  )
}

// ---------- Coût du projet et financement ----------

export function CoutProjet({ bien, m }: { bien: Bien; m: Resultat }) {
  const notaire = fraisNotaire(bien)
  const banque = m.coutTotal - bien.prix - notaire - bien.fraisAgence - bien.travaux - m.ameublement
  const postes = [
    { nom: 'Prix du bien', valeur: bien.prix, couleur: S(1) },
    { nom: 'Frais de notaire', valeur: notaire, couleur: S(2) },
    { nom: 'Travaux', valeur: bien.travaux, couleur: S(3) },
    { nom: 'Meubles', valeur: m.ameublement, couleur: S(4) },
    { nom: 'Frais de banque et d’agence', valeur: banque + bien.fraisAgence, couleur: S(5) },
  ].filter((p) => p.valeur > 0.5)
  const apport = m.strategie.financement.apport
  const partApport = m.coutTotal > 0 ? apport / m.coutTotal : 0
  return (
    <article className="bloc">
      <h2>Ce que coûte le projet, et qui le paie</h2>
      <div className="duo">
        <div className="anneau">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={postes} dataKey="valeur" nameKey="nom" innerRadius={62} outerRadius={96} paddingAngle={2} stroke="var(--surface)" strokeWidth={2} isAnimationActive={false}>
                {postes.map((p) => (
                  <Cell key={p.nom} fill={p.couleur} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => euros(Number(v))} contentStyle={infobulle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="anneau-centre">
            <strong>{euros(m.coutTotal)}</strong>
            <span>au total</span>
          </div>
        </div>
        <div className="duo-texte">
          <Legende items={postes.map((p) => ({ nom: p.nom, couleur: p.couleur, valeur: `${euros(p.valeur)} · ${pourcent(p.valeur / m.coutTotal)}` }))} />
          <p className="sous-titre">Financement</p>
          <div className="empile" role="img" aria-label={`Apport ${euros(apport)}, prêt ${euros(m.montantEmprunte)}`}>
            {apport > 0 && <span style={{ width: `${partApport * 100}%`, background: S(6) }} />}
            <span style={{ width: `${(1 - partApport) * 100}%`, background: S(7) }} />
          </div>
          <Legende
            items={[
              { nom: 'Votre apport', couleur: S(6), valeur: euros(apport) },
              { nom: `Prêt sur ${m.strategie.financement.duree} ans`, couleur: S(7), valeur: euros(m.montantEmprunte) },
            ]}
          />
        </div>
      </div>
    </article>
  )
}

// ---------- Budget d'un mois type (première année) ----------

export function BudgetMensuel({ m }: { m: Resultat }) {
  // Si des travaux retardent la mise en location, la première année n'est pas représentative : on montre la deuxième.
  const apresTravaux = m.annees.length > 1 && m.annees[0].loyers < m.annees[1].loyers * 0.95
  const a = apresTravaux ? m.annees[1] : m.annees[0]
  const loyer = a.loyers / 12
  const depenses = [
    { nom: 'Crédit et assurance', valeur: (a.mensualitesAnnuelles + a.assurance) / 12, couleur: S(3) },
    { nom: 'Charges, taxe foncière, entretien', valeur: a.charges / 12, couleur: S(2) },
    { nom: 'Impôts', valeur: Math.max(0, a.impot) / 12, couleur: S(4) },
  ].filter((d) => d.valeur > 0.5)
  const total = depenses.reduce((t, d) => t + d.valeur, 0)
  const echelle = Math.max(loyer, total)
  const solde = loyer - total
  return (
    <article className="bloc">
      <h2>{apresTravaux ? 'Un mois type, une fois les travaux finis' : 'Un mois type, la première année'}</h2>
      <div className="budget">
        <div className="budget-ligne">
          <span className="budget-nom">Loyer encaissé</span>
          <div className="empile">
            <span style={{ width: `${(loyer / echelle) * 100}%`, background: S(1) }} />
          </div>
          <strong>{euros(loyer)}</strong>
        </div>
        <div className="budget-ligne">
          <span className="budget-nom">Dépenses</span>
          <div className="empile">
            {depenses.map((d) => (
              <span key={d.nom} style={{ width: `${(d.valeur / echelle) * 100}%`, background: d.couleur }} title={`${d.nom} : ${euros(d.valeur)}`} />
            ))}
          </div>
          <strong>{euros(total)}</strong>
        </div>
      </div>
      <Legende items={depenses.map((d) => ({ nom: d.nom, couleur: d.couleur, valeur: euros(d.valeur) }))} />
      <p className={`solde ${solde >= 0 ? 'solde-bon' : 'solde-mauvais'}`}>
        {solde >= 0 ? `Il vous reste ${euros(solde)} par mois.` : `Il manque ${euros(-solde)} par mois, à sortir de votre poche.`}
        {a.impot < -0.5 && ` S'y ajoute une économie d'impôt de ${euros(-a.impot / 12)} par mois.`}
      </p>
    </article>
  )
}

// ---------- Flux annuels empilés et cumul ----------

export function GrapheFlux({ m, hypotheses }: { m: Resultat; hypotheses: Hypotheses }) {
  const H = m.annees.length
  const d = m.annees[H - 1]
  const revente = d.valeurBien * (1 - hypotheses.fraisRevente) - d.capitalRestantDu - m.impotPlusValue
  const apport = m.strategie.financement.apport
  const nets = m.annees.map((y) => y.cashflowApresImpot + (y.annee === H ? revente : 0))
  const donnees = [
    { annee: 0, Apport: -Math.round(apport), Cumul: -Math.round(apport) },
    ...m.annees.map((y, i) => ({
      annee: y.annee,
      Loyers: Math.round(y.loyers),
      Charges: -Math.round(y.charges),
      Crédit: -Math.round(y.mensualitesAnnuelles + y.assurance),
      Impôts: -Math.round(y.impot),
      Revente: y.annee === H ? Math.round(revente) : 0,
      Cumul: Math.round(nets.slice(0, i + 1).reduce((t, v) => t + v, -apport)),
    })),
  ]
  return (
    <div className="graphe">
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={donnees} stackOffset="sign" margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="var(--ligne)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="annee" stroke="var(--texte-doux)" tickFormatter={(v) => `an ${v}`} />
          <YAxis stroke="var(--texte-doux)" tickFormatter={kEuros} width={64} />
          <Tooltip formatter={(v) => signe(Number(v))} labelFormatter={(l) => `Année ${l}`} contentStyle={infobulle} />
          <Legend />
          <ReferenceLine y={0} stroke="var(--texte-doux)" />
          <Bar dataKey="Apport" stackId="f" fill={S(6)} isAnimationActive={false} />
          <Bar dataKey="Loyers" stackId="f" fill={S(1)} isAnimationActive={false} />
          <Bar dataKey="Revente" stackId="f" fill={S(5)} isAnimationActive={false} />
          <Bar dataKey="Charges" stackId="f" fill={S(2)} isAnimationActive={false} />
          <Bar dataKey="Crédit" stackId="f" fill={S(3)} isAnimationActive={false} />
          <Bar dataKey="Impôts" stackId="f" fill={S(4)} isAnimationActive={false} />
          <Line type="monotone" dataKey="Cumul" stroke="var(--texte)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---------- Revente en cascade ----------

export function CascadeRevente({ m, hypotheses }: { m: Resultat; hypotheses: Hypotheses }) {
  const d = m.annees[m.annees.length - 1]
  const frais = d.valeurBien * hypotheses.fraisRevente
  const net = d.valeurBien - frais - d.capitalRestantDu - m.impotPlusValue
  const etape = (nom: string, retrait: number, dejaRetire: number, couleur: string) => ({ nom, base: Math.round(d.valeurBien - dejaRetire - retrait), valeur: Math.round(retrait), couleur, texte: `−${euros(retrait)}` })
  const donnees = [
    { nom: 'Prix de vente', base: 0, valeur: Math.round(d.valeurBien), couleur: S(1), texte: euros(d.valeurBien) },
    etape('Frais de vente', frais, 0, S(2)),
    etape('Crédit restant', d.capitalRestantDu, frais, S(3)),
    etape('Impôt plus-value', m.impotPlusValue, frais + d.capitalRestantDu, S(4)),
    { nom: 'Reste pour vous', base: 0, valeur: Math.round(Math.max(0, net)), couleur: S(5), texte: euros(net) },
  ]
  return (
    <article className="bloc">
      <h2>La revente au bout de {m.annees.length} ans</h2>
      <div className="graphe">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={donnees} margin={{ top: 24, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid stroke="var(--ligne)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="nom" stroke="var(--texte-doux)" interval={0} tick={{ fontSize: 11 }} />
            <YAxis stroke="var(--texte-doux)" tickFormatter={kEuros} width={64} />
            <Bar dataKey="base" stackId="c" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="valeur" stackId="c" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {donnees.map((x) => (
                <Cell key={x.nom} fill={x.couleur} />
              ))}
              <LabelList dataKey="texte" position="top" fill="var(--texte)" fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  )
}

// ---------- Scénarios ----------

export function GrapheScenarios({ sc }: { sc: Scenario[] }) {
  const couleur = { Pessimiste: 'var(--mauvais)', Réaliste: S(1), Optimiste: 'var(--bon)' }
  const tri = sc.map((s) => ({ nom: s.nom, valeur: s.resultat.tri !== null && s.resultat.tri > -1 ? Math.round(s.resultat.tri * 1000) / 10 : 0, texte: triTexte(s.resultat.tri) }))
  const cf = sc.map((s) => ({ nom: s.nom, valeur: Math.round(s.resultat.cashflowMensuelApresImpot), texte: signe(s.resultat.cashflowMensuelApresImpot) }))
  const mini = (titre: string, donnees: { nom: Scenario['nom']; valeur: number; texte: string }[]) => (
    <div>
      <p className="sous-titre">{titre}</p>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={donnees} margin={{ top: 22, right: 8, bottom: 30, left: 8 }}>
          <XAxis dataKey="nom" stroke="var(--texte-doux)" tick={{ fontSize: 12 }} tickMargin={16} axisLine={false} tickLine={false} />
          <YAxis hide domain={[(min: number) => Math.min(0, min * 1.25), (max: number) => Math.max(0, max * 1.25)]} />
          <ReferenceLine y={0} stroke="var(--texte-doux)" />
          <Bar dataKey="valeur" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {donnees.map((x) => (
              <Cell key={x.nom} fill={couleur[x.nom]} />
            ))}
            <LabelList dataKey="texte" position="top" fill="var(--texte)" fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
  return (
    <div className="petits-multiples">
      {mini('Rendement par an (TRI)', tri)}
      {mini('Résultat par mois', cf)}
    </div>
  )
}

// ---------- Sensibilité : écart de TRI par rapport à l'hypothèse de base ----------

export function GrapheSensibilite({ sens }: { sens: Sensibilite[] }) {
  const base = sens[0]?.tri
  if (base === null || base === undefined || base <= -1) return null
  const donnees = sens
    .slice(1)
    .filter((s) => s.tri !== null && s.tri > -1)
    .map((s) => ({ nom: s.libelle, ecart: Math.round(((s.tri as number) - base) * 1000) / 10 }))
    .sort((a, b) => a.ecart - b.ecart)
  if (donnees.length === 0) return null
  return (
    <div className="graphe">
      <p className="sous-titre">Effet sur le rendement (en points de TRI, par rapport à {pourcent(base)})</p>
      <ResponsiveContainer width="100%" height={donnees.length * 38 + 30}>
        <BarChart data={donnees} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }}>
          <XAxis type="number" hide domain={[(min: number) => Math.min(0, min * 1.2), (max: number) => Math.max(0, max * 1.2)]} />
          <YAxis type="category" dataKey="nom" width={170} stroke="var(--texte-doux)" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
          <ReferenceLine x={0} stroke="var(--texte-doux)" />
          <Tooltip formatter={(v) => `${Number(v) > 0 ? '+' : ''}${String(v).replace('.', ',')} point`} contentStyle={infobulle} cursor={{ fill: 'var(--accent-doux)' }} />
          <Bar dataKey="ecart" name="Écart de TRI" radius={4} isAnimationActive={false}>
            {donnees.map((x) => (
              <Cell key={x.nom} fill={x.ecart >= 0 ? 'var(--bon)' : 'var(--mauvais)'} />
            ))}
            <LabelList dataKey="ecart" position="right" fill="var(--texte)" fontSize={12} formatter={(v) => `${Number(v) > 0 ? '+' : ''}${String(v).replace('.', ',')}`} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

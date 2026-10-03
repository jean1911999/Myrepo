interface Props {
  latitude?: number
  longitude?: number
  adresse?: string
}

// Carte OpenStreetMap intégrée, sans clé ni dépendance.
export function Carte({ latitude, longitude, adresse }: Props) {
  if (latitude === undefined || longitude === undefined) {
    return <div className="carte carte-vide">Indiquez l'adresse du bien pour l'afficher sur la carte.</div>
  }
  const d = 0.006
  const bbox = [longitude - d * 1.5, latitude - d, longitude + d * 1.5, latitude + d].map((v) => v.toFixed(5)).join(',')
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude.toFixed(5)},${longitude.toFixed(5)}`
  return (
    <div className="carte">
      <iframe title={`Carte : ${adresse ?? 'emplacement du bien'}`} src={src} loading="lazy" />
      <a className="carte-lien" href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`} target="_blank" rel="noreferrer">
        Agrandir la carte
      </a>
      <a className="carte-lien carte-lien-google" href={`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`} target="_blank" rel="noreferrer">
        Voir sur Google Maps
      </a>
    </div>
  )
}

// Géocodage par le service public de la Géoplateforme (IGN), limité à la France.
export async function localiser(adresse: string): Promise<{ latitude: number; longitude: number; libelle: string; ville?: string; codeInsee?: string } | null> {
  const r = await fetch(`https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(adresse)}&limit=1`)
  if (!r.ok) throw new Error('Service de localisation indisponible')
  const f = (await r.json()).features?.[0]
  if (!f) return null
  const [longitude, latitude] = f.geometry.coordinates
  return { latitude, longitude, libelle: f.properties.label, ville: f.properties.city, codeInsee: f.properties.citycode }
}

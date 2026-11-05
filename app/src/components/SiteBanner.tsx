import { useEffect, useState } from 'react'
import { fetchActiveBanners, type SiteBannerItem } from '../lib/banner'

const REFRESH_MS = 5 * 60_000
const SEPARATOR = '   •   '

/** Bandeau tout en haut du site : messages configurés, défilant de droite à gauche. Masqué s'il n'y a aucun message. */
export default function SiteBanner() {
  const [items, setItems] = useState<SiteBannerItem[]>([])

  useEffect(() => {
    const load = () => { fetchActiveBanners().then(setItems).catch(() => setItems([])) }
    load()
    const timer = window.setInterval(load, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [])

  if (items.length === 0) return null
  const text = items.map((i) => i.message).join(SEPARATOR)
  // Durée proportionnelle au texte : vitesse de lecture constante.
  const duration = Math.max(20, text.length * 0.3)

  return (
    <div role="region" aria-label="Bandeau d’information" className="group w-full overflow-hidden bg-primary text-primary-foreground">
      <div className="flex w-max animate-site-ticker whitespace-nowrap py-2 text-sm group-hover:[animation-play-state:paused]"
        style={{ animationDuration: `${duration}s` }}>
        <span className="pr-16">{text}</span>
        <span className="pr-16" aria-hidden="true">{text}</span>
      </div>
    </div>
  )
}

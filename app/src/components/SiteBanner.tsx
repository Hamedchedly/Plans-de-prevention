import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { fetchActiveBanners, type SiteBannerItem } from '../lib/banner'

const REFRESH_MS = 5 * 60_000
/** Vitesse de défilement, en pixels par seconde. */
const SPEED_PX_PER_S = 90
const MIN_DURATION_S = 12

/**
 * Bandeau tout en haut du site : messages configurés, qui entrent par le bord droit de la page
 * et sortent à gauche, une seule fois par cycle. Masqué s'il n'y a aucun message.
 */
export default function SiteBanner() {
  const [items, setItems] = useState<SiteBannerItem[]>([])
  const boxRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [duration, setDuration] = useState(MIN_DURATION_S)
  const [sizes, setSizes] = useState({ box: 0, text: 0 })

  useEffect(() => {
    const load = () => { fetchActiveBanners().then(setItems).catch(() => setItems([])) }
    load()
    const timer = window.setInterval(load, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [])

  // Mesure la largeur réelle : le texte doit parcourir toute la largeur du bandeau puis sortir entièrement.
  useLayoutEffect(() => {
    const measure = () => {
      const box = boxRef.current?.offsetWidth ?? 0
      const textW = textRef.current?.offsetWidth ?? 0
      setSizes({ box, text: textW })
      setDuration(Math.max(MIN_DURATION_S, (box + textW) / SPEED_PX_PER_S))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [items])

  if (items.length === 0) return null

  return (
    <div ref={boxRef} role="region" aria-label="Bandeau d’information"
      className="group relative h-9 w-full overflow-hidden bg-primary text-primary-foreground"
      style={{ ['--box-w' as string]: `${sizes.box}px`, ['--text-w' as string]: `${sizes.text}px` }}>
      <span ref={textRef} className="animate-site-ticker absolute left-0 top-0 flex h-9 items-center whitespace-nowrap text-sm group-hover:[animation-play-state:paused]"
        style={{ animationDuration: `${duration}s` }}>
        {items.map((item, idx) => (
          <span key={item.id} className="inline-flex items-center">
            <span className="mr-24">{item.message}</span>
            {idx < items.length - 1 && <span aria-hidden="true" className="mr-24 opacity-60">•</span>}
          </span>
        ))}
      </span>
    </div>
  )
}

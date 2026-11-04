import { useState } from 'react'

/** Pastille jaune « à confirmer » : le survol affiche l'explication (infobulle), un clic l'affiche dans un encadré. */
export function ConfirmDot({ reason }: { reason: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={`À confirmer : ${reason}`}
        title={`À confirmer : ${reason}`}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-400 ring-2 ring-yellow-100 transition-transform hover:scale-125 focus:outline-none focus-visible:ring-yellow-300"
      />
      {open && (
        <span
          role="tooltip"
          onClick={(e) => e.stopPropagation()}
          className="absolute left-4 top-1/2 z-40 w-64 -translate-y-1/2 rounded-lg border border-border bg-card p-2 text-xs font-normal text-foreground shadow-lg"
        >
          <span className="mb-1 block font-semibold text-amber-800">À confirmer</span>
          {reason}
        </span>
      )}
    </span>
  )
}

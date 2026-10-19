import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { fieldClass } from './ui'

/** Liste déroulante à cases à cocher (plusieurs valeurs). */
export function MultiSelect({ label, options, value, onChange, placeholder }: {
  label: string
  options: string[]
  value: string[]
  onChange: (next: string[]) => void
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const summary = value.length === 0 ? placeholder : value.length <= 3 ? value.join(', ') : `${value.length} sélectionnés`
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o])

  return (
    <div ref={ref} className="relative">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className={`${fieldClass} flex w-full items-center justify-between gap-2 text-left`}>
        <span className="truncate">{summary}</span>
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute z-40 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-card p-1 shadow-lg">
          <div className="flex justify-between px-2 py-1 text-xs">
            <button type="button" className="hover:underline" onClick={() => onChange(options)}>Tout</button>
            <button type="button" className="hover:underline" onClick={() => onChange([])}>Aucun</button>
          </div>
          {options.map((o) => (
            <label key={o} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
              <input type="checkbox" checked={value.includes(o)} onChange={() => toggle(o)} />
              {o}
            </label>
          ))}
          {options.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">Aucune valeur</p>}
        </div>
      )}
    </div>
  )
}

import { useState, type ReactNode } from 'react'

/** Petit bouton discret ; un clic ouvre une bulle avec le détail (fermée par un clic ailleurs). */
export function Bubble({ label, tone = 'default', align = 'right', children }: {
  label: ReactNode
  tone?: 'default' | 'warn'
  align?: 'left' | 'right'
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative inline-block">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-medium shadow-sm transition-colors ${
          tone === 'warn' ? 'bg-amber-100 text-amber-900 hover:bg-amber-200' : 'bg-card text-muted-foreground hover:text-foreground'}`}>
        {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div role="dialog" className={`absolute z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card p-4 text-sm text-foreground shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'}`}>
            {children}
          </div>
        </>
      )}
    </div>
  )
}

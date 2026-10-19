import { useState } from 'react'
import { MoreHorizontal, type LucideIcon } from 'lucide-react'

export type MenuItem = { label: string; icon: LucideIcon; onClick: () => void; disabled?: boolean; danger?: boolean }

/** Bouton « ⋯ » : les actions secondaires d'une ligne s'ouvrent dans un petit menu. */
export function RowMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null
  return (
    <div className="relative inline-block">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label="Autres actions" title="Autres actions"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-card text-muted-foreground shadow-sm hover:text-foreground">
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 z-40 mt-1 w-56 overflow-hidden rounded-2xl border border-border bg-card py-1 text-left shadow-lg">
            {items.map((it) => (
              <button key={it.label} type="button" role="menuitem" disabled={it.disabled}
                onClick={() => { setOpen(false); it.onClick() }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50 ${it.danger ? 'text-destructive' : ''}`}>
                <it.icon className="h-4 w-4" aria-hidden="true" />{it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

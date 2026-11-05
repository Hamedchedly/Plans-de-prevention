import { fieldClass } from './ui'

/** Choix d'une année calendaire pour les indicateurs. « Période glissante » = pas d'année, on garde le curseur de période. */
export function YearSelect({ years, value, onChange }: { years: number[]; value: number | null; onChange: (y: number | null) => void }) {
  return (
    <label className="text-xs text-muted-foreground">Année
      <select aria-label="Année des commandes" className={fieldClass + ' mt-1 w-auto'} value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">Période glissante</option>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </label>
  )
}

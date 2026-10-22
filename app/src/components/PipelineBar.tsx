export type PipelineCounts = { attente: number; fait: number; envoye: number; retour: number }

/** Segments de la barre d'avancement, dans l'ordre du parcours. `tab` : onglet ouvert au clic. */
export const PIPELINE_SEGMENTS = [
  { key: 'attente', label: 'En attente de plan', color: '#2b2b2b', text: '#ffffff', tab: 'NON_QUALIFIEE' },
  { key: 'fait', label: 'Fiche créée (non envoyée)', color: '#a3a3a3', text: '#141414', tab: 'A_ENVOYER' },
  { key: 'envoye', label: 'Envoyé, en attente de retour', color: '#f0a24a', text: '#141414', tab: 'EN_ATTENTE_RETOUR' },
  { key: 'retour', label: 'Avec retour (signé)', color: '#3fbf6a', text: '#0b2e18', tab: 'SIGNEE' },
] as const

/** Barre empilée d'avancement. `onSelect` rend chaque segment cliquable (ouvre l'onglet correspondant). */
export function PipelineBar({ counts, onSelect }: { counts: PipelineCounts; onSelect?: (tab: string) => void }) {
  const total = PIPELINE_SEGMENTS.reduce((sum, s) => sum + counts[s.key], 0)
  /** Nombre et part de chaque statut (les quatre statuts se partagent le total). */
  const pctOf = (n: number) => (total ? Math.round((n / total) * 100) : 0)
  return (
    <div className="space-y-3">
      <div className="flex h-11 overflow-hidden rounded-xl bg-muted" role="img" aria-label={`Répartition de ${total} commande(s)`}>
        {total > 0 && PIPELINE_SEGMENTS.map((s) => {
          const n = counts[s.key]
          if (!n) return null
          const share = n / total
          return (
            <div key={s.key} title={`${s.label} : ${n}`}
              onClick={onSelect ? () => onSelect(s.tab) : undefined}
              className={`flex items-center justify-center overflow-hidden whitespace-nowrap text-xs font-semibold ${onSelect ? 'cursor-pointer hover:brightness-110' : ''}`}
              style={{ width: `${share * 100}%`, background: s.color, color: s.text }}>
              {share > 0.14 ? `${n} · ${pctOf(n)} %` : share > 0.05 ? n : ''}
            </div>
          )
        })}
        {total === 0 && <div className="flex w-full items-center justify-center text-xs text-muted-foreground">Aucune commande</div>}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-4">
        {PIPELINE_SEGMENTS.map((s) => (
          <div key={s.key} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <span className="text-foreground">{s.label}</span>
            <span className="font-semibold">{counts[s.key]}</span>
            <span className="text-muted-foreground">({pctOf(counts[s.key])} %)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

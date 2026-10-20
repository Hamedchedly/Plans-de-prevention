/** Graphiques simples en SVG, sans bibliothèque : barres groupées (dans le temps) et barres horizontales (stock). */

export interface Series { name: string; color: string; values: number[] }

/** Libellé court d'une semaine « AAAA-MM-JJ » → « JJ/MM ». */
const shortDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export function GroupedBars({ labels, series, height = 210 }: { labels: string[]; series: Series[]; height?: number }) {
  const W = 640, H = height, PAD_L = 34, PAD_B = 28, PAD_T = 10
  const max = Math.max(1, ...series.flatMap((s) => s.values))
  const innerW = W - PAD_L - 8
  const innerH = H - PAD_T - PAD_B
  const groupW = innerW / Math.max(1, labels.length)
  const barW = Math.max(2, (groupW * 0.8) / Math.max(1, series.length))
  const step = Math.max(1, Math.ceil(labels.length / 14))
  const ticks = [0, Math.round(max / 2), max]

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Graphique en barres">
        {ticks.map((t) => {
          const y = PAD_T + innerH - (t / max) * innerH
          return (
            <g key={t}>
              <line x1={PAD_L} x2={W - 8} y1={y} y2={y} stroke="currentColor" strokeOpacity={0.12} />
              <text x={PAD_L - 6} y={y + 3} textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.55}>{t}</text>
            </g>
          )
        })}
        {labels.map((lab, i) => {
          const gx = PAD_L + i * groupW
          return (
            <g key={`${lab}-${i}`}>
              {series.map((s, j) => {
                const v = s.values[i] ?? 0
                const h = (v / max) * innerH
                return (
                  <rect key={s.name} x={gx + groupW * 0.1 + j * barW} y={PAD_T + innerH - h} width={barW - 1} height={h} fill={s.color} rx={1}>
                    <title>{`${shortDay(lab)} · ${s.name} : ${v}`}</title>
                  </rect>
                )
              })}
              {i % step === 0 && (
                <text x={gx + groupW / 2} y={H - 8} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.6}>{shortDay(lab)}</text>
              )}
            </g>
          )
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />{s.name}
          </span>
        ))}
      </div>
    </div>
  )
}

export function HBars({ items }: { items: { label: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.label} className="grid grid-cols-[150px_1fr_56px] items-center gap-3 text-sm">
          <span className="truncate text-muted-foreground">{i.label}</span>
          <span className="h-3 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full" style={{ width: `${(i.value / max) * 100}%`, background: i.color }} />
          </span>
          <span className="text-right tabular-nums font-medium">{i.value}</span>
        </li>
      ))}
    </ul>
  )
}

/** Courbes d'évolution (valeurs par semaine, souvent cumulées). */
export function LineChart({ labels, series, height = 210 }: { labels: string[]; series: Series[]; height?: number }) {
  const W = 640, H = height, PAD_L = 34, PAD_B = 28, PAD_T = 10
  const max = Math.max(1, ...series.flatMap((s) => s.values))
  const innerW = W - PAD_L - 8
  const innerH = H - PAD_T - PAD_B
  const x = (i: number) => PAD_L + (labels.length <= 1 ? innerW / 2 : (i / (labels.length - 1)) * innerW)
  const y = (v: number) => PAD_T + innerH - (v / max) * innerH
  const step = Math.max(1, Math.ceil(labels.length / 14))
  const ticks = [0, Math.round(max / 2), max]

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Courbes d'évolution">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD_L} x2={W - 8} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={0.12} />
            <text x={PAD_L - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.55}>{t}</text>
          </g>
        ))}
        {series.map((s) => (
          <g key={s.name}>
            <path d={s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')} fill="none" stroke={s.color} strokeWidth={2} />
            {s.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={s.color}>
                <title>{`${shortDay(labels[i])} · ${s.name} : ${v}`}</title>
              </circle>
            ))}
          </g>
        ))}
        {labels.map((lab, i) => (i % step === 0 ? (
          <text key={lab} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.6}>{shortDay(lab)}</text>
        ) : null))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />{s.name}
          </span>
        ))}
      </div>
    </div>
  )
}

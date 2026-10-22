import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchContacts, type Contact } from '../lib/sheet'
import { Card, Notice, PageHeader, errMsg, fieldClass } from '../components/ui'
import { GroupedBars, HBars, LineChart } from '../components/Charts'
import { useAuth } from '../lib/auth'
import { PIPELINE_SEGMENTS, PipelineBar, type PipelineCounts } from '../components/PipelineBar'

type Row = { operator_code: string | null; plan_status: string; order_date: string | null }

/** Commandes du périmètre, hors corbeille (toutes les lignes, par tranches de 1000). */
async function fetchScopeRows(): Promise<Row[]> {
  const page = 1000
  const out: Row[] = []
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from('orders').select('operator_code,plan_status,order_date')
      .eq('scope_status', 'IN_SCOPE').is('trashed_at', null).range(from, from + page - 1)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as Row[]))
    if (!data || data.length < page) break
  }
  return out
}

const emptyCounts = (): PipelineCounts => ({ attente: 0, fait: 0, envoye: 0, retour: 0 })

/** Ajoute une commande au compteur de son statut ; les archivées et envois manuels ne comptent pas. */
function addTo(c: PipelineCounts, status: string) {
  if (status === 'NON_QUALIFIEE') c.attente++
  else if (status === 'A_ENVOYER') c.fait++
  else if (status === 'EN_ATTENTE_RETOUR') c.envoye++
  else if (status === 'SIGNEE') c.retour++
}

const PERIODS = [
  { days: 28, label: '4 semaines' }, { days: 84, label: '12 semaines' }, { days: 182, label: '6 mois' }, { days: 365, label: '1 an' },
]
/** Étapes des fiches, dans l'ordre du parcours. */
const STAGES: { key: string; label: string; color: string }[] = [
  { key: 'NON_QUALIFIEE', label: 'À qualifier', color: '#9ca3af' },
  { key: 'A_ENVOYER', label: 'Fiche créée', color: '#111827' },
  { key: 'EN_ATTENTE_RETOUR', label: 'Envoyée, sans retour', color: '#f59e0b' },
  { key: 'SIGNEE', label: 'Signée', color: '#10b981' },
  { key: 'ARCHIVEE', label: 'Archivée', color: '#6366f1' },
  { key: 'ENVOYE_MANUELLEMENT', label: 'Envoyée manuellement', color: '#d97706' },
  { key: 'NON_CONCERNEE', label: 'Non concernée', color: '#ef4444' },
]

interface Usage {
  kpi: { comptes_actifs: number; connectes: number; connexions: number; jamais_connectes: number }
  connexions_par_semaine: { semaine: string; utilisateurs: number; connexions: number }[]
  connexions_par_charge: { code: string; utilisateurs: number; connexions: number; derniere: string | null }[]
  fiches_par_semaine: { semaine: string; creees: number; envoyees: number; signees: number; archivees: number }[]
  stock: Record<string, number>
  stock_par_charge: { code: string; statuts: Record<string, number> }[]
  chargés: string[]
}

/** Cumul des valeurs d'une série hebdomadaire. */
const cumul = <T extends object>(items: T[], key: keyof T & string): number[] =>
  items.reduce<number[]>((acc, w) => { acc.push((acc[acc.length - 1] ?? 0) + Number((w as Record<string, unknown>)[key] ?? 0)); return acc }, [])

/** Utilisation de l'outil (Super Admin) : connexions, fiches par semaine, stock par étape, filtrables par chargé. */
function UsageSection() {
  const [days, setDays] = useState(84)
  const [operator, setOperator] = useState('')
  const [data, setData] = useState<Usage | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      setBusy(true); setErr(null)
      const to = new Date(Date.now() + 86_400_000)
      const from = new Date(Date.now() - days * 86_400_000)
      const { data: res, error } = await supabase.rpc('indicators_overview', {
        p_from: from.toISOString(), p_to: to.toISOString(), p_operator: operator || null,
      })
      if (!alive) return
      if (error) setErr(error.message); else setData(res as Usage)
      setBusy(false)
    }
    void load()
    return () => { alive = false }
  }, [days, operator])

  const weeks = data?.connexions_par_semaine ?? []
  const fiches = data?.fiches_par_semaine ?? []
  const sum = (k: 'creees' | 'envoyees' | 'signees' | 'archivees') => fiches.reduce((a, w) => a + w[k], 0)
  const stock = data?.stock ?? {}
  const total = Object.values(stock).reduce((a, n) => a + n, 0)
  const qualifiees = total - (stock.NON_QUALIFIEE ?? 0) - (stock.NON_CONCERNEE ?? 0)

  // Tableau par chargé : connexions et stock fusionnés par code.
  const byCharge = new Map<string, { utilisateurs: number; connexions: number; derniere: string | null; statuts: Record<string, number> }>()
  for (const c of data?.connexions_par_charge ?? []) byCharge.set(c.code, { utilisateurs: c.utilisateurs, connexions: c.connexions, derniere: c.derniere, statuts: {} })
  for (const s of data?.stock_par_charge ?? []) {
    const row = byCharge.get(s.code) ?? { utilisateurs: 0, connexions: 0, derniere: null, statuts: {} }
    row.statuts = s.statuts
    byCharge.set(s.code, row)
  }
  const rows = [...byCharge.entries()].sort((a, b) => b[1].connexions - a[1].connexions || a[0].localeCompare(b[0]))

  const kpis: { label: string; value: number; hint?: string }[] = [
    { label: 'Comptes actifs', value: data?.kpi.comptes_actifs ?? 0 },
    { label: 'Connectés sur la période', value: data?.kpi.connectes ?? 0, hint: `${data?.kpi.connexions ?? 0} connexion(s)` },
    { label: 'Jamais connectés', value: data?.kpi.jamais_connectes ?? 0 },
    { label: 'Fiches créées', value: sum('creees'), hint: 'sur la période' },
    { label: 'Fiches envoyées', value: sum('envoyees'), hint: 'sur la période' },
    { label: 'Fiches signées', value: sum('signees'), hint: 'sur la période' },
    { label: 'Qualifiées (stock)', value: qualifiees, hint: `sur ${total} commandes du périmètre` },
  ]

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="text-base font-semibold">Utilisation de l’outil</h2>
          <p className="text-xs text-muted-foreground">Réservé au Super Admin. Connexions d’après le journal ; fiches d’après les actions enregistrées.</p>
        </div>
        <label className="text-xs text-muted-foreground">Période
          <select className={fieldClass + ' mt-1 w-auto'} value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {PERIODS.map((p) => <option key={p.days} value={p.days}>{p.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">Chargé
          <select className={fieldClass + ' mt-1 w-auto'} value={operator} onChange={(e) => setOperator(e.target.value)}>
            <option value="">Tous les chargés</option>
            {(data?.chargés ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>

      {err && <Notice tone="error">{err}</Notice>}
      {busy && !data && <p className="text-sm text-muted-foreground">Chargement des indicateurs…</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-xl border border-border bg-background p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{k.value}</div>
                {k.hint && <div className="text-[11px] text-muted-foreground">{k.hint}</div>}
              </div>
            ))}
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Évolution cumulée des fiches sur la période</h3>
            <LineChart labels={fiches.map((w) => w.semaine)} series={[
              { name: 'Créées', color: '#111827', values: cumul(fiches, 'creees') },
              { name: 'Envoyées', color: '#f59e0b', values: cumul(fiches, 'envoyees') },
              { name: 'Signées', color: '#10b981', values: cumul(fiches, 'signees') },
            ]} />
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Récurrence de connexion par semaine</h3>
              <GroupedBars labels={weeks.map((w) => w.semaine)} series={[
                { name: 'Utilisateurs distincts', color: '#2563eb', values: weeks.map((w) => w.utilisateurs) },
                { name: 'Connexions', color: '#9ca3af', values: weeks.map((w) => w.connexions) },
              ]} />
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Fiches par semaine</h3>
              <GroupedBars labels={fiches.map((w) => w.semaine)} series={[
                { name: 'Créées', color: '#111827', values: fiches.map((w) => w.creees) },
                { name: 'Envoyées', color: '#f59e0b', values: fiches.map((w) => w.envoyees) },
                { name: 'Signées', color: '#10b981', values: fiches.map((w) => w.signees) },
              ]} />
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Stock des commandes par étape</h3>
              <HBars items={STAGES.map((s) => ({ label: s.label, value: stock[s.key] ?? 0, color: s.color }))} />
            </section>
            <section className="max-h-[50vh] space-y-2 overflow-auto">
              <h3 className="text-sm font-semibold">Par chargé</h3>
              <table className="w-full text-xs">
                <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-1.5 pr-2 font-medium">Chargé</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Connexions</th>
                    <th className="py-1.5 pr-2 font-medium">Dernière</th>
                    {STAGES.map((s) => <th key={s.key} className="py-1.5 pr-2 text-right font-medium">{s.label}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map(([code, r]) => (
                    <tr key={code}>
                      <td className="py-1.5 pr-2 font-mono">{code}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{r.connexions}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap text-muted-foreground">{r.derniere ? new Date(r.derniere).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                      {STAGES.map((s) => <td key={s.key} className="py-1.5 pr-2 text-right tabular-nums">{r.statuts[s.key] ?? 0}</td>)}
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={3 + STAGES.length} className="py-3 text-center text-muted-foreground">Aucune donnée.</td></tr>}
                </tbody>
              </table>
            </section>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Période du {new Date(Date.now() - days * 86_400_000).toLocaleDateString('fr-FR')} à aujourd’hui · « Qualifiées » = commandes hors « À qualifier » et « Non concernée ». Les fiches envoyées comprennent celles passées en attente de retour, signées ou archivées.
          </p>
        </>
      )}
    </Card>
  )
}

const PERIOD_STEPS: { months: number | null; label: string }[] = [
  { months: 1, label: '1 mois' }, { months: 3, label: '3 mois' }, { months: 6, label: '6 mois' }, { months: null, label: 'Toujours' },
]
const PAGE_SIZE = 5
type SortKey = 'code' | 'sum' | 'pct' | 'attente' | 'fait' | 'envoye' | 'retour'

export default function Indicateurs() {
  const { can } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [names, setNames] = useState<Map<string, Contact>>(new Map())
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  /** Chargé sélectionné : sa ligne est surlignée et la barre n'affiche que ses commandes. */
  const [focus, setFocus] = useState<string | null>(null)
  /** Curseur de période : index dans PERIOD_STEPS (3 = toujours). */
  const [step, setStep] = useState(3)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'pct', dir: 'desc' })
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let alive = true
    fetchScopeRows()
      .then(async (data) => {
        if (!alive) return
        setRows(data)
        const map = await fetchContacts(data.map((r) => r.operator_code ?? '')).catch(() => new Map<string, Contact>())
        if (alive) setNames(map)
      })
      .catch((e) => { if (alive) setErr(errMsg(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  /** Date de début de la fenêtre (AAAA-MM-JJ), ou null pour « toujours ». */
  const cutoff = useMemo(() => {
    const m = PERIOD_STEPS[step].months
    if (m == null) return null
    const d = new Date()
    d.setMonth(d.getMonth() - m)
    return d.toISOString().slice(0, 10)
  }, [step])

  const scoped = useMemo(() => (cutoff ? rows.filter((r) => (r.order_date ?? '') >= cutoff) : rows), [rows, cutoff])

  const total = useMemo(() => {
    const c = emptyCounts()
    scoped.forEach((r) => addTo(c, r.plan_status))
    return c
  }, [scoped])

  /** « % plans faits » = fiches créées (envoyées, en attente de retour ou signées comprises) / commandes du chargé. */
  const byOperator = useMemo(() => {
    const m = new Map<string, PipelineCounts>()
    for (const r of scoped) {
      const code = r.operator_code ?? '—'
      if (!m.has(code)) m.set(code, emptyCounts())
      addTo(m.get(code)!, r.plan_status)
    }
    return [...m.entries()]
      .map(([code, c]) => {
        const sum = c.attente + c.fait + c.envoye + c.retour
        return { code, c, sum, pct: sum ? (c.fait + c.envoye + c.retour) / sum : 0 }
      })
      .filter((x) => x.sum > 0)
  }, [scoped])

  const sorted = useMemo(() => {
    const value = (x: (typeof byOperator)[number]) =>
      sort.key === 'code' ? x.code : sort.key === 'sum' ? x.sum : sort.key === 'pct' ? x.pct : x.c[sort.key]
    return [...byOperator].sort((a, b) => {
      const va = value(a), vb = value(b)
      let r = typeof va === 'string' ? va.localeCompare(vb as string, 'fr') : (va as number) - (vb as number)
      if (r === 0) r = b.sum - a.sum
      return sort.dir === 'asc' ? r : -r
    })
  }, [byOperator, sort])

  const visible = expanded ? sorted : sorted.slice(0, PAGE_SIZE)
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'code' ? 'asc' : 'desc' }))
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '')
  const nameOf = (code: string) => names.get(code)?.name || code

  const Head = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th className={`px-4 py-2 font-medium ${right ? 'text-right' : ''}`}>
      <button type="button" onClick={() => toggleSort(k)} className="uppercase tracking-wide hover:text-foreground">
        {label}{arrow(k)}
      </button>
    </th>
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Indicateurs chargés"
        subtitle="Responsables et super admin · commandes du périmètre, hors archivées"
      />

      {err && <Notice tone="error">{err}</Notice>}

      {can('SUPER_ADMIN') && <UsageSection />}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">{focus ? `Chargé : ${nameOf(focus)}` : 'Ensemble des chargés'}</h2>
            <p className="text-xs text-muted-foreground">
              {focus ? 'Barre filtrée sur ce chargé. Cliquez à nouveau sur son nom pour revenir à l’ensemble.' : loading ? 'Chargement…' : `${byOperator.length} chargé(s) avec des commandes`}
            </p>
          </div>
          {focus && <button type="button" onClick={() => setFocus(null)} className="rounded-full bg-muted px-3.5 py-1.5 text-xs font-medium hover:bg-muted/70">Voir tous les chargés</button>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">Commandes des</span>
          <input type="range" min={0} max={PERIOD_STEPS.length - 1} step={1} value={step} aria-label="Période des commandes"
            onChange={(e) => { setStep(Number(e.target.value)); setExpanded(false) }} className="w-56 accent-primary" />
          <span className="text-sm font-medium">{PERIOD_STEPS[step].label === 'Toujours' ? 'toutes les commandes' : `les ${PERIOD_STEPS[step].label.toLowerCase()}`}</span>
        </div>
        <PipelineBar counts={focus ? (byOperator.find((x) => x.code === focus)?.c ?? emptyCounts()) : total} />
      </Card>

      <Card className="space-y-3 p-0">
        <div className={`overflow-x-auto ${expanded ? 'max-h-[60vh] overflow-y-auto' : ''}`}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <Head k="code" label="Chargé" />
                <Head k="sum" label="Commandes" right />
                <th className="px-4 py-2 font-medium uppercase tracking-wide">Avancement</th>
                <Head k="pct" label="% plans faits" right />
                <Head k="attente" label="En attente de plan" right />
                <Head k="fait" label="Fiche créée" right />
                <Head k="envoye" label="Envoyé, sans retour" right />
                <Head k="retour" label="Avec retour" right />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map(({ code, c, sum, pct }) => (
                <tr key={code} className={`align-middle transition-colors ${focus === code ? 'bg-primary/5 ring-1 ring-inset ring-primary/20' : 'hover:bg-muted/40'}`}>
                  <td className="px-4 py-2.5">
                    <button type="button" onClick={() => setFocus(focus === code ? null : code)} aria-pressed={focus === code}
                      className="text-left font-medium hover:underline">
                      {nameOf(code)}
                    </button>
                    {names.get(code)?.name && <div className="font-mono text-[11px] text-muted-foreground">{code}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{sum}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex h-2.5 min-w-[160px] overflow-hidden rounded-full bg-muted">
                      {PIPELINE_SEGMENTS.map((s) => (
                        c[s.key] > 0 ? <div key={s.key} style={{ width: `${(c[s.key] / sum) * 100}%`, background: s.color }} title={`${s.label} : ${c[s.key]}`} /> : null
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{Math.round(pct * 100)} %</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c.attente}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c.fait}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c.envoye}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c.retour}</td>
                </tr>
              ))}
              {!loading && sorted.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">Aucune commande dans le périmètre pour cette période.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {sorted.length > PAGE_SIZE && (
          <div className="border-t border-border px-4 py-2 text-center">
            <button type="button" onClick={() => setExpanded((v) => !v)} className="text-xs font-medium text-muted-foreground hover:text-foreground">
              {expanded ? 'Voir moins' : `Voir les ${sorted.length - PAGE_SIZE} autres chargés`}
            </button>
          </div>
        )}
      </Card>
    </div>
  )
}

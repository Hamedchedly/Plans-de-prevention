import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchContacts, type Contact } from '../lib/sheet'
import { Card, Notice, PageHeader, errMsg, fieldClass } from '../components/ui'
import { GroupedBars, HBars } from '../components/Charts'
import { useAuth } from '../lib/auth'
import { PIPELINE_SEGMENTS, PipelineBar, type PipelineCounts } from '../components/PipelineBar'

type Row = { operator_code: string | null; plan_status: string }

/** Commandes du périmètre, hors corbeille (toutes les lignes, par tranches de 1000). */
async function fetchScopeRows(): Promise<Row[]> {
  const page = 1000
  const out: Row[] = []
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from('orders').select('operator_code,plan_status')
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
            <section className="space-y-2 overflow-x-auto">
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

export default function Indicateurs() {
  const { can } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [names, setNames] = useState<Map<string, Contact>>(new Map())
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  /** Chargé sélectionné : sa ligne est surlignée et la barre n'affiche que ses commandes. */
  const [focus, setFocus] = useState<string | null>(null)

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

  const total = useMemo(() => {
    const c = emptyCounts()
    rows.forEach((r) => addTo(c, r.plan_status))
    return c
  }, [rows])

  const byOperator = useMemo(() => {
    const m = new Map<string, PipelineCounts>()
    for (const r of rows) {
      const code = r.operator_code ?? '—'
      if (!m.has(code)) m.set(code, emptyCounts())
      addTo(m.get(code)!, r.plan_status)
    }
    return [...m.entries()]
      .map(([code, c]) => ({ code, c, sum: c.attente + c.fait + c.envoye + c.retour }))
      .filter((x) => x.sum > 0)
      .sort((a, b) => b.sum - a.sum)
  }, [rows])

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
            <h2 className="text-base font-semibold">{focus ? `Chargé : ${names.get(focus)?.name || focus}` : 'Ensemble des chargés'}</h2>
            <p className="text-xs text-muted-foreground">
              {focus ? 'Barre filtrée sur ce chargé. Cliquez à nouveau sur son nom pour revenir à l’ensemble.' : loading ? 'Chargement…' : `${byOperator.length} chargé(s) avec des commandes`}
            </p>
          </div>
          {focus && <button type="button" onClick={() => setFocus(null)} className="rounded-full bg-muted px-3.5 py-1.5 text-xs font-medium hover:bg-muted/70">Voir tous les chargés</button>}
        </div>
        <PipelineBar counts={focus ? (byOperator.find((x) => x.code === focus)?.c ?? emptyCounts()) : total} />
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Chargé</th>
              <th className="px-4 py-2 text-right font-medium">Commandes</th>
              <th className="px-4 py-2 font-medium">Avancement</th>
              <th className="px-4 py-2 text-right font-medium">En attente de plan</th>
              <th className="px-4 py-2 text-right font-medium">Plan fait</th>
              <th className="px-4 py-2 text-right font-medium">Envoyé, sans retour</th>
              <th className="px-4 py-2 text-right font-medium">Avec retour</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {byOperator.map(({ code, c, sum }) => (
              <tr key={code} className={`align-middle transition-colors ${focus === code ? 'bg-primary/5 ring-1 ring-inset ring-primary/20' : 'hover:bg-muted/40'}`}>
                <td className="px-4 py-2.5">
                  <button type="button" onClick={() => setFocus(focus === code ? null : code)} aria-pressed={focus === code}
                    className="text-left font-medium hover:underline">
                    {names.get(code)?.name || code}
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
                <td className="px-4 py-2.5 text-right tabular-nums">{c.attente}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{c.fait}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{c.envoye}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{c.retour}</td>
              </tr>
            ))}
            {!loading && byOperator.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">Aucune commande dans le périmètre.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

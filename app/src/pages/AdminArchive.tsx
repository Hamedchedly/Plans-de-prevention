import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fetchOperatorCodes } from '../lib/operators'
import { MAX_MATCHES, fetchMatchingOrders, fetchSectorCodes, type MatchedOrder, type OrderFilter, type OrderState } from '../lib/ordersBulk'
import { Badge, Button, Card, Notice, PageHeader, errMsg, fieldClass } from '../components/ui'
import { MultiSelect } from '../components/MultiSelect'
import ArchivePeriodCard from '../components/ArchivePeriodCard'

type Action = 'archive' | 'unarchive' | 'trash' | 'restore'
const STATES: { key: OrderState; label: string }[] = [
  { key: 'actives', label: 'Actives' },
  { key: 'archivees', label: 'Archivées' },
  { key: 'corbeille', label: 'En corbeille' },
  { key: 'toutes', label: 'Toutes' },
]
const ACTION_LABEL: Record<Action, string> = {
  archive: 'Archiver',
  unarchive: 'Rétablir (sortir des archives)',
  trash: 'Mettre à la corbeille',
  restore: 'Restaurer de la corbeille',
}
const SHOWN = 300

/** Archivage et purge : on filtre, on sélectionne les commandes, puis on applique une action au groupe. */
export function ArchivePurgeSection() {
  const { profile } = useAuth()
  const canManage = profile?.role === 'SUPER_ADMIN' || profile?.role === 'RESPONSABLE'
  const [sectorOptions, setSectorOptions] = useState<string[]>([])
  const [operatorOptions, setOperatorOptions] = useState<string[]>([])
  const [filter, setFilter] = useState<OrderFilter>({ sectors: [], operators: [], from: '', to: '', state: 'actives' })
  const [rows, setRows] = useState<MatchedOrder[] | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<Action | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchSectorCodes(), fetchOperatorCodes()])
      .then(([s, o]) => { setSectorOptions(s); setOperatorOptions(o) })
      .catch((e) => setErr(errMsg(e)))
  }, [])

  const search = async () => {
    setBusy(true); setErr(null); setMsg(null); setConfirm(null)
    try {
      const res = await fetchMatchingOrders(filter)
      setRows(res.rows)
      setTruncated(res.truncated)
      setSelected(new Set())
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  const chosen = (rows ?? []).filter((r) => selected.has(r.order_number))
  const counts: Record<Action, number> = {
    archive: chosen.filter((r) => !r.kpi_excluded).length,
    unarchive: chosen.filter((r) => r.kpi_excluded).length,
    trash: chosen.filter((r) => !r.trashed_at).length,
    restore: chosen.filter((r) => r.trashed_at).length,
  }

  const toggle = (n: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(n)) next.delete(n); else next.add(n)
    return next
  })
  const toggleAll = () => {
    if (!rows) return
    setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((r) => r.order_number)))
  }

  const run = async (action: Action) => {
    setBusy(true); setErr(null); setMsg(null)
    try {
      const numbers = chosen.map((r) => r.order_number)
      const { data, error } = action === 'archive' || action === 'unarchive'
        ? await supabase.rpc('bulk_archive_orders', { p_orders: numbers, p_archive: action === 'archive' })
        : await supabase.rpc('set_orders_trashed', { p_orders: numbers, p_trashed: action === 'trash' })
      if (error) throw error
      setMsg(`${Number(data)} commande(s) : ${ACTION_LABEL[action].toLowerCase()}.`)
      await search()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  const actionControl = (action: Action) => {
    const n = counts[action]
    if (n === 0) return null
    if (confirm === action) {
      return (
        <div key={action} className="flex flex-wrap items-center gap-2 rounded-2xl bg-muted/50 p-2">
          <span className="text-sm">{ACTION_LABEL[action]} : {n} commande(s) ?</span>
          <Button onClick={() => void run(action)} disabled={busy}>Confirmer</Button>
          <Button variant="ghost" onClick={() => setConfirm(null)} disabled={busy}>Annuler</Button>
        </div>
      )
    }
    return (
      <Button key={action} variant="ghost" onClick={() => setConfirm(action)} disabled={busy}>
        {ACTION_LABEL[action]} ({n})
      </Button>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Archivage et purge" subtitle="Filtrez les commandes, sélectionnez-les, puis appliquez une action au groupe." />
      {err && <Notice tone="error">{err}</Notice>}
      {msg && <Notice tone="ok">{msg}</Notice>}
      {!canManage && <Notice tone="info">Seul un Responsable ou le Super Admin peut archiver ou mettre en corbeille.</Notice>}

      <Card className="space-y-4">
        <h2 className="font-semibold">1. Sélectionner</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48">
            <label className="mb-1 block text-xs text-muted-foreground">Secteur</label>
            <MultiSelect label="Secteur" options={sectorOptions} value={filter.sectors} placeholder="Tous les secteurs"
              onChange={(sectors) => setFilter({ ...filter, sectors })} />
          </div>
          <div className="min-w-48">
            <label className="mb-1 block text-xs text-muted-foreground">Chargé</label>
            <MultiSelect label="Chargé" options={operatorOptions} value={filter.operators} placeholder="Tous les chargés"
              onChange={(operators) => setFilter({ ...filter, operators })} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Du</label>
            <input type="date" className={fieldClass} value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Au</label>
            <input type="date" className={fieldClass} value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">État</label>
            <select className={fieldClass} value={filter.state} onChange={(e) => setFilter({ ...filter, state: e.target.value as OrderState })}>
              {STATES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <Button onClick={() => void search()} disabled={busy}>{busy ? 'Recherche…' : 'Rechercher'}</Button>
        </div>

        {rows && (
          <>
            {truncated && <Notice tone="warn">Plus de {MAX_MATCHES} commandes correspondent : affinez les filtres avant de sélectionner.</Notice>}
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span><strong>{rows.length}</strong> commande(s) correspondent · <strong>{selected.size}</strong> sélectionnée(s)</span>
              <Button variant="ghost" size="sm" onClick={toggleAll} disabled={rows.length === 0}>
                {selected.size === rows.length && rows.length > 0 ? 'Tout désélectionner' : `Tout sélectionner (${rows.length})`}
              </Button>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="w-10 px-3 py-2" />
                    <th className="px-3 py-2 font-medium">Commande</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Chargé</th>
                    <th className="px-3 py-2 font-medium">Secteur</th>
                    <th className="px-3 py-2 font-medium">État</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, SHOWN).map((r) => (
                    <tr key={r.order_number} className="border-t border-border">
                      <td className="px-3 py-2">
                        <input type="checkbox" aria-label={`Sélectionner ${r.order_number}`} checked={selected.has(r.order_number)} onChange={() => toggle(r.order_number)} />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{r.order_number}</td>
                      <td className="px-3 py-2">{r.order_date}</td>
                      <td className="px-3 py-2">{r.operator_code ?? '—'}</td>
                      <td className="px-3 py-2">{r.sector_code ?? '—'}</td>
                      <td className="px-3 py-2">
                        {r.trashed_at ? <Badge tone="off">Corbeille</Badge> : r.kpi_excluded ? <Badge tone="info">Archivée</Badge> : <Badge tone="ok">Active</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > SHOWN && (
              <p className="text-xs text-muted-foreground">Affichage des {SHOWN} premières lignes ; la sélection porte sur les {rows.length} commandes.</p>
            )}
          </>
        )}
      </Card>

      {rows && (
        <Card className="space-y-4">
          <h2 className="font-semibold">2. Appliquer une action</h2>
          {selected.size === 0 ? (
            <p className="text-sm text-muted-foreground">Sélectionnez des commandes pour voir les actions possibles.</p>
          ) : canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              {(['archive', 'unarchive', 'trash', 'restore'] as Action[]).map((a) => actionControl(a))}
            </div>
          ) : null}
          <div className="space-y-2 rounded-2xl bg-muted/50 p-3 text-sm">
            <p><strong>Purge définitive</strong> : non disponible pour l’instant.</p>
            <p className="text-muted-foreground">
              Le projet interdit de supprimer des commandes importées : elles sont seulement marquées. Une purge demande une exception explicite,
              avec sauvegarde et confirmation. Elle ne sera pas activée tant que cette exception n’est pas validée.
            </p>
          </div>
        </Card>
      )}

      <ArchivePeriodCard />
    </div>
  )
}

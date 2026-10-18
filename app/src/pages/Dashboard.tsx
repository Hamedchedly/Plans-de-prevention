import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fold, tokens } from '../lib/rules'
import type { OrderRow } from '../lib/types'
import { Badge, Button, Card, Notice, fieldClass, errMsg } from '../components/ui'

type Tab = 'NON_QUALIFIEE' | 'A_ENVOYER' | 'EN_ATTENTE_RETOUR' | 'ARCHIVEE' | 'DEMANDES' | 'HORS_PERIMETRE'
const TABS: { key: Tab; label: string }[] = [
  { key: 'NON_QUALIFIEE', label: 'À qualifier' },
  { key: 'A_ENVOYER', label: 'À envoyer' },
  { key: 'EN_ATTENTE_RETOUR', label: 'En attente retour' },
  { key: 'ARCHIVEE', label: 'Archivées' },
  { key: 'DEMANDES', label: 'Exclusions en attente' },
  { key: 'HORS_PERIMETRE', label: 'Hors périmètre' },
]
const PLAN_LABEL: Record<string, string> = {
  NON_QUALIFIEE: 'Non qualifiée', A_ENVOYER: 'À envoyer', EN_ATTENTE_RETOUR: 'En attente retour', ARCHIVEE: 'Archivée',
}

async function fetchAllOrders(): Promise<OrderRow[]> {
  const page = 1000
  const out: OrderRow[] = []
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from('orders').select('*')
      .order('order_date', { ascending: false, nullsFirst: false }).order('order_number')
      .range(from, from + page - 1)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as OrderRow[]))
    if (!data || data.length < page) break
  }
  return out
}

export default function Dashboard({ onOpen }: { onOpen: (o: OrderRow) => void }) {
  const { can, profile } = useAuth()
  const isManager = can('RESPONSABLE', 'SUPER_ADMIN')
  const [rows, setRows] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('NON_QUALIFIEE')
  const [q, setQ] = useState('')
  const [sector, setSector] = useState('S11')
  const [operator, setOperator] = useState('')

  const load = async () => {
    setLoading(true); setErr(null)
    try { setRows(await fetchAllOrders()) } catch (e) { setErr(errMsg(e)) } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const sectors = useMemo(() => [...new Set(rows.map((r) => r.sector_code).filter(Boolean))] as string[], [rows])
  const operators = useMemo(() => [...new Set(rows.map((r) => r.operator_code).filter(Boolean))] as string[], [rows])

  const inTab = (o: OrderRow, t: Tab) =>
    t === 'HORS_PERIMETRE' ? o.scope_status === 'OUT_OF_SCOPE'
      : t === 'DEMANDES' ? o.scope_request_status === 'EN_ATTENTE'
        : o.scope_status === 'IN_SCOPE' && o.plan_status === t

  const terms = tokens(q)
  const matches = (o: OrderRow) => {
    if (!terms.length) return true
    const hay = fold([o.order_number, o.address, o.city, o.tranche_name, o.nature_text, o.description].filter(Boolean).join(' '))
    return terms.every((t) => hay.includes(t))
  }

  const base = rows.filter((o) => (sector === 'TOUS' || o.sector_code === sector) && (!operator || o.operator_code === operator) && matches(o))
  const visible = base.filter((o) => inTab(o, tab))
  const count = (t: Tab) => base.filter((o) => inTab(o, t)).length

  const requestExclusion = async (o: OrderRow) => {
    const reason = window.prompt('Motif de l’exclusion du périmètre (obligatoire, 5 caractères minimum) :')
    if (reason === null) return
    const { error } = await supabase.rpc('request_scope_exclusion', { p_order: o.order_number, p_reason: reason })
    if (error) { setErr(error.message); return }
    setRows((rs) => rs.map((r) => (r.order_number === o.order_number ? { ...r, scope_request_status: 'EN_ATTENTE', scope_request_reason: reason.trim() } : r)))
  }

  const reintegrate = async (o: OrderRow) => {
    const { error } = await supabase.rpc('set_order_scope', { p_order: o.order_number, p_scope: 'IN_SCOPE', p_override: true, p_comment: null })
    if (error) { setErr(error.message); return }
    setRows((rs) => rs.map((r) => (r.order_number === o.order_number ? { ...r, scope_status: 'IN_SCOPE', scope_override: true } : r)))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-xs text-muted-foreground">Recherche (n° commande, adresse, nature…)</label>
          <input className={fieldClass} value={q} onChange={(e) => setQ(e.target.value)} placeholder="ex. robinet cuisine" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Secteur</label>
          <select className={fieldClass} value={sector} onChange={(e) => setSector(e.target.value)}>
            <option value="TOUS">Tous</option>
            {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {isManager && (
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Chargé</label>
            <select className={fieldClass} value={operator} onChange={(e) => setOperator(e.target.value)}>
              <option value="">Tous</option>
              {operators.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        )}
        <Button variant="ghost" onClick={() => void load()} disabled={loading}>Actualiser</Button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.key ? 'border-primary font-semibold' : 'border-transparent text-muted-foreground'}`}>
            {t.label} <span className="text-xs">({count(t.key)})</span>
          </button>
        ))}
      </div>

      {err && <Notice tone="error">{err}</Notice>}
      {loading ? <p className="text-sm text-muted-foreground">Chargement des commandes…</p> : visible.length === 0 ? (
        <Notice>Aucune commande dans cette vue.</Notice>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Commande</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Adresse</th>
                <th className="px-3 py-2">Nature / description</th>
                <th className="px-3 py-2">Chargé</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, 300).map((o) => (
                <tr key={o.order_number} className="border-t border-border align-top">
                  <td className="px-3 py-2 font-mono text-xs">{o.order_number}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{o.order_date ?? '—'}</td>
                  <td className="px-3 py-2">{[o.address, o.city].filter(Boolean).join(', ') || '—'}</td>
                  <td className="px-3 py-2 max-w-md">
                    <div>{o.nature_text ?? '—'}</div>
                    {o.description && <div className="text-xs text-muted-foreground line-clamp-2">{o.description}</div>}
                  </td>
                  <td className="px-3 py-2">{o.operator_code ?? '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={o.scope_status === 'IN_SCOPE' ? 'ok' : 'off'}>{o.scope_status === 'IN_SCOPE' ? 'Périmètre' : 'Hors périmètre'}</Badge>
                      {o.scope_override && <Badge tone="warn">Forcé</Badge>}
                      {o.scope_status === 'IN_SCOPE' && <Badge>{PLAN_LABEL[o.plan_status]}</Badge>}
                      {o.naac_code && <Badge>{o.naac_code}</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {o.scope_status === 'IN_SCOPE' && (o.plan_status === 'NON_QUALIFIEE' || o.plan_status === 'A_ENVOYER') && (
                      <Button onClick={() => onOpen(o)} className="mr-2">
                        {o.plan_status === 'NON_QUALIFIEE' ? 'Qualifier' : 'Modifier le plan'}
                      </Button>
                    )}
                    {o.scope_status === 'IN_SCOPE' && o.scope_request_status !== 'EN_ATTENTE' && (
                      <Button variant="ghost" onClick={() => void requestExclusion(o)}>Demander l’exclusion</Button>
                    )}
                    {o.scope_request_status === 'EN_ATTENTE' && <Badge tone="warn">Exclusion en attente</Badge>}
                    {isManager && o.scope_status === 'OUT_OF_SCOPE' && (
                      <Button variant="ghost" onClick={() => void reintegrate(o)}>Réintégrer</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length > 300 && <p className="p-3 text-xs text-muted-foreground">300 premières lignes affichées sur {visible.length} : affinez la recherche.</p>}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Connecté comme {profile?.email}.</p>
    </div>
  )
}

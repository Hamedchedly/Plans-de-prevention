import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Badge, Button, Card, Notice, fieldClass } from '../components/ui'

interface Control {
  order_number: string
  reason: string
  audit_status: string
  charge_name: string
  audit_date: string | null
  comment: string | null
  plan_status: string | null
  scope_status: string | null
}

type Json = Record<string, unknown>
interface Detail {
  order: Json | null
  audit: Json | null
  budget: { import_id: string; row_no: number; raw: Json }[]
  imports: { kind: string; file: string; row_no: number; raw: Json }[]
  history: { action: string; at: string; payload: Json | null }[]
}

const AUDIT_LABEL: Record<string, string> = { ENVOYE: 'Envoyé', SIGNE: 'Signé', SANS_PLAN: 'Sans plan' }
const PLAN_LABEL: Record<string, string> = {
  NON_QUALIFIEE: 'À qualifier', A_ENVOYER: 'Fiche créée', EN_ATTENTE_RETOUR: 'En attente retour', SIGNEE: 'Signée', ARCHIVEE: 'Archivée',
  ENVOYE_MANUELLEMENT: 'Envoyée manuellement',
}
/** Champs de la commande modifiables depuis le contrôle, dans l'ordre d'affichage. */
const FIELDS: { key: string; label: string; type?: string }[] = [
  { key: 'order_date', label: 'Date de commande', type: 'date' },
  { key: 'sector_code', label: 'Secteur' },
  { key: 'tranche_name', label: 'Tranche' },
  { key: 'address', label: 'Adresse' },
  { key: 'city', label: 'Ville' },
  { key: 'isis_code', label: 'Code entreprise (ISIS)' },
  { key: 'operator_code', label: 'Chargé (code)' },
  { key: 'nature_text', label: 'Nature des travaux' },
  { key: 'description', label: 'Description' },
  { key: 'amount_ttc', label: 'Montant TTC', type: 'number' },
]

const text = (v: unknown) => (v === null || v === undefined || v === '' ? '' : String(v))

/** Contrôles : commandes dont l'audit importé ne correspond pas à leur état, avec toutes les données rattachées. */
export function ControlsSection() {
  const [list, setList] = useState<Control[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [comment, setComment] = useState('')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const loadList = async () => {
    const { data, error } = await supabase.rpc('order_controls')
    if (error) { setErr(error.message); return }
    setList((data ?? []) as Control[])
  }
  // Chargement unique au montage ; la liste est relue après chaque enregistrement.
  useEffect(() => { void loadList() }, [])

  const open = async (numero: string) => {
    const n = numero.trim()
    if (!n) return
    setSel(n); setErr(null); setNotice(null)
    const { data, error } = await supabase.rpc('order_control_detail', { p_order: n })
    if (error) { setErr(error.message); return }
    const d = data as Detail
    setDetail(d)
    const o = d.order ?? {}
    setFields(Object.fromEntries(FIELDS.map((f) => [f.key, text(o[f.key])])))
    setComment('')
  }

  const save = async () => {
    if (!sel) return
    setBusy(true); setErr(null)
    const payload = Object.fromEntries(Object.entries(fields).filter(([, v]) => v.trim() !== ''))
    const { error } = await supabase.rpc('complete_order', { p_order: sel, p_fields: payload, p_comment: comment || null })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setNotice('Commande enregistrée. L’audit a été réappliqué.')
    await loadList()
    await open(sel)
  }

  const setScope = async (scope: 'IN_SCOPE' | 'OUT_OF_SCOPE') => {
    if (!sel) return
    if (scope === 'OUT_OF_SCOPE' && !window.confirm(`Mettre la commande ${sel} hors périmètre ?`)) return
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('set_order_scope', { p_order: sel, p_scope: scope, p_override: true, p_comment: comment || null })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setNotice(scope === 'OUT_OF_SCOPE' ? 'Commande mise hors périmètre.' : 'Commande réintégrée au périmètre.')
    await loadList()
    await open(sel)
  }

  const control = list?.find((c) => c.order_number === sel) ?? null
  const order = detail?.order ?? null

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="mr-auto font-semibold">Incohérences d’audit ({list?.length ?? '…'})</h2>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void open(search) }}>
            <input className={fieldClass + ' w-40'} placeholder="N° de commande" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Button variant="ghost" type="submit" disabled={!search.trim()}>Ouvrir</Button>
          </form>
        </div>
        <p className="text-xs text-muted-foreground">
          Commandes déclarées envoyées ou signées dans l’audit, mais absentes des exports ou dont l’état ne correspond pas.
        </p>
        {err && <Notice tone="error">{err}</Notice>}
        {list && list.length === 0 && <Notice tone="ok">Aucune incohérence : tous les états d’audit sont appliqués.</Notice>}
        {list && list.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Commande</th>
                  <th className="py-2 pr-3 font-medium">Audit</th>
                  <th className="py-2 pr-3 font-medium">Chargé</th>
                  <th className="py-2 pr-3 font-medium">Motif</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((c) => (
                  <tr key={c.order_number} className={sel === c.order_number ? 'bg-muted/50' : ''}>
                    <td className="py-2 pr-3 font-mono text-xs">{c.order_number}</td>
                    <td className="py-2 pr-3">{AUDIT_LABEL[c.audit_status] ?? c.audit_status}{c.audit_date ? ` · ${c.audit_date}` : ''}</td>
                    <td className="py-2 pr-3">{c.charge_name}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{c.reason}</td>
                    <td className="py-2 text-right"><Button variant="ghost" onClick={() => void open(c.order_number)}>Ouvrir</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {sel && detail && (
        <Card className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="mr-auto font-semibold">Commande <span className="font-mono">{sel}</span></h3>
            {order ? (
              <>
                <Badge>{PLAN_LABEL[text(order.plan_status)] ?? text(order.plan_status)}</Badge>
                <Badge tone={order.scope_status === 'IN_SCOPE' ? 'default' : 'warn'}>{text(order.scope_status) === 'IN_SCOPE' ? 'Dans le périmètre' : 'Hors périmètre'}</Badge>
              </>
            ) : <Badge tone="warn">Absente des exports</Badge>}
          </div>

          {control && (
            <Notice tone="warn">
              <strong>Raison de l’incohérence :</strong> {control.reason}
            </Notice>
          )}
          {notice && <Notice tone="ok">{notice}</Notice>}
          {err && <Notice tone="error">{err}</Notice>}

          <section>
            <h4 className="mb-2 text-sm font-semibold">Audit importé</h4>
            {detail.audit ? (
              <div className="grid gap-2 text-sm md:grid-cols-4">
                <div><span className="text-xs text-muted-foreground">Statut</span><div>{AUDIT_LABEL[text(detail.audit.audit_status)] ?? text(detail.audit.audit_status)}</div></div>
                <div><span className="text-xs text-muted-foreground">Chargé</span><div>{text(detail.audit.charge_name)}</div></div>
                <div><span className="text-xs text-muted-foreground">Date d’audit</span><div>{text(detail.audit.audit_date) || '—'}</div></div>
                <div><span className="text-xs text-muted-foreground">Commentaire</span><div>{text(detail.audit.comment) || '—'}</div></div>
              </div>
            ) : <p className="text-sm text-muted-foreground">Aucune ligne d’audit pour cette commande.</p>}
          </section>

          <section className="space-y-3">
            <h4 className="text-sm font-semibold">Commande {order ? '' : '(à compléter : elle sera créée à l’enregistrement)'}</h4>
            <div className="grid gap-3 md:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="mb-1 block text-xs text-muted-foreground">{f.label}</label>
                  <input className={fieldClass + ' w-full'} type={f.type ?? 'text'} value={fields[f.key] ?? ''}
                    onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} />
                </div>
              ))}
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Commentaire de la décision (journalisé)</label>
              <input className={fieldClass + ' w-full'} value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void save()} disabled={busy}>{order ? 'Enregistrer' : 'Créer et appliquer l’audit'}</Button>
              {order && order.scope_status === 'IN_SCOPE' && (
                <Button variant="ghost" onClick={() => void setScope('OUT_OF_SCOPE')} disabled={busy}>Mettre hors périmètre</Button>
              )}
              {order && order.scope_status === 'OUT_OF_SCOPE' && (
                <Button variant="ghost" onClick={() => void setScope('IN_SCOPE')} disabled={busy}>Réintégrer au périmètre</Button>
              )}
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-sm font-semibold">Suivi budgétaire ({detail.budget.length})</h4>
            {detail.budget.length === 0 ? <p className="text-sm text-muted-foreground">Aucune ligne.</p> : detail.budget.map((b, i) => (
              <details key={i} className="mb-1 text-xs"><summary className="cursor-pointer">Ligne {b.row_no}</summary><pre className="mt-1 overflow-x-auto rounded bg-muted p-2">{JSON.stringify(b.raw, null, 2)}</pre></details>
            ))}
          </section>

          <section>
            <h4 className="mb-2 text-sm font-semibold">Lignes des exports ({detail.imports.length})</h4>
            {detail.imports.length === 0 ? <p className="text-sm text-muted-foreground">Aucune ligne dans les imports.</p> : detail.imports.map((r, i) => (
              <details key={i} className="mb-1 text-xs"><summary className="cursor-pointer">{r.kind === 'COMMANDES' ? 'Commandes' : 'Suivi budgétaire'} · {r.file} · ligne {r.row_no}</summary><pre className="mt-1 overflow-x-auto rounded bg-muted p-2">{JSON.stringify(r.raw, null, 2)}</pre></details>
            ))}
          </section>

          <section>
            <h4 className="mb-2 text-sm font-semibold">Historique</h4>
            {detail.history.length === 0 ? <p className="text-sm text-muted-foreground">Aucune action enregistrée.</p> : (
              <ul className="space-y-1 text-xs">
                {detail.history.map((h, i) => (
                  <li key={i}><span className="font-mono">{new Date(h.at).toLocaleString('fr-FR')}</span> · {h.action}{h.payload ? ` · ${JSON.stringify(h.payload)}` : ''}</li>
                ))}
              </ul>
            )}
          </section>
        </Card>
      )}
    </div>
  )
}

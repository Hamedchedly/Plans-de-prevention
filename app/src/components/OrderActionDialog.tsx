import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { OrderRow } from '../lib/types'
import { Button, Notice, fieldClass } from './ui'

type Choice = 'EXCLUSION' | 'REAFFECTER' | 'MANUEL'

/** Panneau de validation unique pour une commande : demande d'exclusion, réaffectation ou envoi manuel. */
export default function OrderActionDialog({
  order, canReassign, operators, onClose, onDone,
}: {
  order: OrderRow
  canReassign: boolean
  operators: string[]
  onClose: () => void
  onDone: (message: string) => void
}) {
  const inScope = order.scope_status === 'IN_SCOPE'
  const exclusionPending = order.scope_request_status === 'EN_ATTENTE'
  const options: { key: Choice; title: string; hint: string; available: boolean }[] = [
    { key: 'EXCLUSION', title: 'Demander l’exclusion du périmètre', hint: 'Le Super Admin décide après votre motif.', available: inScope && !exclusionPending },
    { key: 'REAFFECTER', title: 'Réaffecter à un autre chargé', hint: 'La commande change de chargé d’opérations.', available: canReassign },
    { key: 'MANUEL', title: 'Envoyée manuellement', hint: 'Hors application : la commande sort des listes à traiter.', available: inScope },
  ]
  const firstAvailable = options.find((o) => o.available)?.key ?? 'EXCLUSION'
  const [choice, setChoice] = useState<Choice>(firstAvailable)
  const [reason, setReason] = useState('')
  const [operator, setOperator] = useState(order.operator_code ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const valid =
    choice === 'EXCLUSION' ? reason.trim().length >= 5
      : choice === 'REAFFECTER' ? operator.trim().length > 0 && operator.trim() !== (order.operator_code ?? '')
      : true

  const submit = async () => {
    setBusy(true); setErr(null)
    let error: { message: string } | null = null
    let message = ''
    if (choice === 'EXCLUSION') {
      ({ error } = await supabase.rpc('request_scope_exclusion', { p_order: order.order_number, p_reason: reason.trim() }))
      message = `Demande d’exclusion envoyée pour la commande ${order.order_number}.`
    } else if (choice === 'REAFFECTER') {
      ({ error } = await supabase.rpc('reassign_order', { p_order: order.order_number, p_operator: operator.trim() }))
      message = `Commande ${order.order_number} réaffectée à ${operator.trim()}.`
    } else {
      ({ error } = await supabase.rpc('mark_sent_manually', { p_orders: [order.order_number] }))
      message = `Commande ${order.order_number} marquée comme envoyée manuellement.`
    }
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDone(message)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Actions sur la commande">
      <div className="w-full max-w-lg space-y-4 rounded-xl border border-border bg-card p-5 shadow-xl">
        <div>
          <h2 className="font-semibold">Commande {order.order_number}</h2>
          <p className="text-sm text-muted-foreground">{[order.address, order.city].filter(Boolean).join(', ') || '—'}</p>
        </div>

        <div className="space-y-2" role="radiogroup" aria-label="Action">
          {options.map((o) => (
            <label key={o.key}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${choice === o.key ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'} ${o.available ? '' : 'pointer-events-none opacity-40'}`}>
              <input type="radio" className="mt-1 accent-primary" name="order-action" checked={choice === o.key} disabled={!o.available}
                onChange={() => setChoice(o.key)} />
              <span>
                <span className="block text-sm font-medium">{o.title}</span>
                <span className="block text-xs text-muted-foreground">{o.available ? o.hint : 'Non disponible pour cette commande'}</span>
              </span>
            </label>
          ))}
        </div>

        {choice === 'EXCLUSION' && (
          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground">Motif (5 caractères minimum)</label>
            <textarea className={fieldClass + ' min-h-[80px]'} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
        {choice === 'REAFFECTER' && (
          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground">Nouveau chargé (code UTIC)</label>
            <input className={fieldClass} list="operator-codes" value={operator} onChange={(e) => setOperator(e.target.value)} />
            <datalist id="operator-codes">
              {operators.map((o) => <option key={o} value={o} />)}
            </datalist>
          </div>
        )}
        {choice === 'MANUEL' && (
          <p className="text-sm text-muted-foreground">La commande n’aura pas de plan généré par l’application. Vous pourrez la remettre à traiter depuis « Envoyées manuellement ».</p>
        )}

        {err && <Notice tone="error">{err}</Notice>}

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Annuler</Button>
          <Button onClick={() => void submit()} disabled={busy || !valid || !options.find((o) => o.key === choice)?.available}>
            {busy ? 'Enregistrement…' : 'Valider'}
          </Button>
        </div>
        {exclusionPending && <p className="text-xs text-muted-foreground">Une demande d’exclusion est déjà en attente pour cette commande.</p>}
      </div>
    </div>
  )
}

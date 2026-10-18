import { useState } from 'react'
import { Download, Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { OrderRow } from '../lib/types'
import { fillTemplate, type Redactor } from '../lib/sheet'
import { fmtFr } from '../lib/period'
import { Button, Notice, errMsg, fieldClass } from './ui'

/** Envoi du plan de prévention par messagerie (mailto) : le PDF se joint à la main, puis la commande passe « En attente retour ». */
export default function MailDialog({
  order, company, osEmail, contact, objet, corps, onDownloadPdf, onDone, onClose,
}: {
  order: OrderRow
  company: string
  osEmail: string
  contact: Redactor | null
  objet: string
  corps: string
  onDownloadPdf: () => Promise<void>
  onDone: (message: string) => void
  onClose: () => void
}) {
  const vars = {
    commande: order.order_number,
    entreprise: company,
    nature: order.nature_text ?? '',
    periode: order.period_start && order.period_end ? `du ${fmtFr(order.period_start)} au ${fmtFr(order.period_end)}` : 'à renseigner par l’entreprise',
    redacteur: contact?.name || 'Le chargé d’opérations',
  }
  const [to, setTo] = useState(osEmail)
  const [subject, setSubject] = useState(fillTemplate(objet, vars))
  const [body, setBody] = useState(fillTemplate(corps, vars))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const openMail = () => {
    const url = `mailto:${encodeURIComponent(to.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.location.href = url
  }

  const markSent = async () => {
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('advance_plan_status', { p_order: order.order_number, p_to: 'EN_ATTENTE_RETOUR' })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDone(`Commande ${order.order_number} envoyée à ${company || 'l’entreprise'} : en attente du retour.`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Envoi du plan de prévention">
      <div className="w-full max-w-xl space-y-4 rounded-xl border border-border bg-card p-5 shadow-xl">
        <div>
          <h2 className="font-semibold">Envoyer le plan de prévention</h2>
          <p className="text-xs text-muted-foreground">Commande {order.order_number}</p>
        </div>

        {!osEmail && <Notice tone="warn">Aucune adresse OS pour cette entreprise : saisissez le destinataire.</Notice>}

        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Destinataire</span>
          <input className={fieldClass} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Objet</span>
          <input className={fieldClass} value={subject} onChange={(e) => setSubject(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Message</span>
          <textarea className={`${fieldClass} h-auto min-h-[180px] py-2`} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>

        <Notice>
          Étapes : 1) téléchargez le PDF, 2) ouvrez le message et joignez le PDF, 3) une fois le mail envoyé, marquez la commande comme envoyée.
        </Notice>

        {err && <Notice tone="error">{err}</Notice>}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => void onDownloadPdf()} disabled={busy}><Download className="h-4 w-4" aria-hidden="true" />Télécharger le PDF</Button>
          <Button variant="ghost" onClick={openMail} disabled={busy || !to.trim()}><Mail className="h-4 w-4" aria-hidden="true" />Ouvrir le mail</Button>
          <Button onClick={() => void markSent()} disabled={busy}>Marquer comme envoyée</Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Fermer</Button>
        </div>
      </div>
    </div>
  )
}

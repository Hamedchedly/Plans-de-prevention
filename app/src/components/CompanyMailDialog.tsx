import { useState } from 'react'
import { Download, Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { OrderRow } from '../lib/types'
import type { Redactor } from '../lib/sheet'
import { Button, Notice, fieldClass } from './ui'

export type CompanyMailItem = { order: string; nature: string; period: string }

/**
 * Envoi groupé à une entreprise : un seul mail qui liste toutes ses commandes avec leur nature.
 * Le ZIP des plans se télécharge depuis ce dialogue puis se joint à la main (mailto).
 */
export default function CompanyMailDialog({
  orders, items, company, osEmail, contact, onDownloadZip, onDone, onClose,
}: {
  orders: OrderRow[]
  items: CompanyMailItem[]
  company: string
  osEmail: string
  contact: Redactor | null
  onDownloadZip: () => Promise<void>
  onDone: (message: string) => void
  onClose: () => void
}) {
  const n = orders.length
  const listed = items.map((i) => `- ${i.order} : ${i.nature || 'nature à préciser'}${i.period ? ` (${i.period})` : ''}`).join('\n')
  const [to, setTo] = useState(osEmail)
  const [subject, setSubject] = useState(`Plans de prévention – ${n} commande(s) – ${company}`)
  const [body, setBody] = useState(
    `Bonjour,\n\nVeuillez trouver ci-joint les plans de prévention relatifs aux commandes suivantes :\n${listed}\n\nMerci de nous les retourner signés.\n\nCordialement,\n${contact?.name || 'Le chargé d’opérations'}`,
  )
  const [done, setDone] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const openMail = () => {
    window.location.href = `mailto:${encodeURIComponent(to.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  // Passe chaque commande « En attente retour » ; une reprise ne refait que les commandes restantes.
  const markAll = async () => {
    setBusy(true); setErr(null)
    const failures: string[] = []
    const now = new Set(done)
    for (const o of orders) {
      if (now.has(o.order_number)) continue
      const { error } = await supabase.rpc('advance_plan_status', { p_order: o.order_number, p_to: 'EN_ATTENTE_RETOUR' })
      if (error) failures.push(`${o.order_number} : ${error.message}`)
      else now.add(o.order_number)
    }
    setDone(now)
    setBusy(false)
    if (failures.length) { setErr(`${failures.length} commande(s) non mise(s) à jour :\n${failures.join('\n')}`); return }
    onDone(`${n} commande(s) envoyée(s) à ${company || 'l’entreprise'} : en attente du retour.`)
  }

  const downloadZip = async () => {
    setBusy(true); setErr(null)
    try { await onDownloadZip() } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Envoi groupé à l’entreprise">
      <div className="w-full max-w-xl space-y-4 rounded-xl border border-border bg-card p-5 shadow-xl">
        <div>
          <h2 className="font-semibold">Envoyer à {company || 'l’entreprise'}</h2>
          <p className="text-xs text-muted-foreground">{n} commande(s) dans un seul mail</p>
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
          <textarea className={`${fieldClass} h-auto min-h-[200px] py-2`} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>

        <Notice>Étapes : 1) téléchargez le ZIP des plans, 2) ouvrez le mail et joignez le ZIP, 3) une fois le mail envoyé, marquez les {n} commandes comme envoyées.</Notice>

        {err && <Notice tone="error">{err}</Notice>}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => void downloadZip()} disabled={busy}><Download className="h-4 w-4" aria-hidden="true" />Télécharger le ZIP</Button>
          <Button variant="ghost" onClick={openMail} disabled={busy || !to.trim()}><Mail className="h-4 w-4" aria-hidden="true" />Ouvrir le mail</Button>
          <Button onClick={() => void markAll()} disabled={busy}>Marquer les {n} commandes comme envoyées</Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Fermer</Button>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button, Notice, fieldClass } from './ui'
import { COMPANY_FIELDS, type CompanyRow } from '../pages/AdminCompanies'

/** Saisie d'informations sur une entreprise : elles sont proposées, puis validées par le Super Admin. */
export default function CompanyDialog({ isis, current, onClose, onSent }: {
  isis: string
  current: CompanyRow | undefined
  onClose: () => void
  onSent: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>(
    () => Object.fromEntries(COMPANY_FIELDS.map((f) => [f.key, (current?.[f.key] as string) ?? ''])))
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const send = async () => {
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('propose_company', { p_isis: isis, p_fields: values })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSent()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg space-y-4 rounded-lg border border-border bg-card p-5 shadow-lg">
        <div>
          <h2 className="font-semibold">Entreprise {isis}</h2>
          <p className="text-xs text-muted-foreground">Vos informations seront proposées au Super Admin avant d’être utilisées pour les envois.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {COMPANY_FIELDS.map((f) => (
            <div key={f.key} className={f.key === 'name' ? 'sm:col-span-2' : ''}>
              <label className="mb-1 block text-xs text-muted-foreground">{f.label}</label>
              <input className={fieldClass} value={values[f.key]} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
            </div>
          ))}
        </div>
        {err && <Notice tone="error">{err}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={() => void send()} disabled={busy}>Proposer</Button>
        </div>
      </div>
    </div>
  )
}

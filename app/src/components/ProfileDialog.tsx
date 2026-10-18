import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button, Notice, errMsg, fieldClass } from './ui'

/** Identité d'un utilisateur : utilisée dans les fiches (rédacteur, personne à alerter). Chacun renseigne la sienne ; le Super Admin peut renseigner celle de tous. */
export default function ProfileDialog({ userId, isSelf, onClose }: { userId: string; isSelf: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [loginEmail, setLoginEmail] = useState('')
  const [v, setV] = useState({ first: '', last: '', phone: '', contact: '' })

  useEffect(() => {
    void supabase.from('profiles').select('first_name,last_name,phone,contact_email,email').eq('user_id', userId).maybeSingle()
      .then(({ data, error }) => {
        if (error) setErr(error.message)
        if (data) {
          setLoginEmail(data.email ?? '')
          setV({ first: data.first_name ?? '', last: data.last_name ?? '', phone: data.phone ?? '', contact: data.contact_email ?? '' })
        }
        setLoading(false)
      })
  }, [userId])

  const save = async () => {
    setBusy(true); setErr(null); setMsg(null)
    const { error } = await supabase.rpc('update_profile_identity', {
      p_user_id: userId, p_first: v.first, p_last: v.last, p_phone: v.phone, p_contact_email: v.contact,
    })
    setBusy(false)
    if (error) setErr(error.message); else setMsg('Identité enregistrée.')
  }

  const complete = !!(v.first.trim() && v.last.trim() && v.phone.trim() && (v.contact.trim() || loginEmail))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-5 shadow-lg">
        <h2 className="font-semibold">{isSelf ? 'Mon profil' : 'Identité de l’utilisateur'}</h2>
        <p className="text-sm text-muted-foreground">Ces informations apparaissent sur les fiches que vous rédigez (rédacteur et personne à alerter).</p>
        {loading ? <p className="text-sm text-muted-foreground">Chargement…</p> : (
          <div className="space-y-3">
            {err && <Notice tone="error">{err}</Notice>}
            {msg && <Notice tone="ok">{msg}</Notice>}
            {!complete && <Notice>Prénom, nom, téléphone et mail sont nécessaires pour créer des fiches.</Notice>}
            <label className="block text-sm">Prénom
              <input className={fieldClass} value={v.first} onChange={(e) => setV({ ...v, first: e.target.value })} />
            </label>
            <label className="block text-sm">Nom
              <input className={fieldClass} value={v.last} onChange={(e) => setV({ ...v, last: e.target.value })} />
            </label>
            <label className="block text-sm">Téléphone
              <input className={fieldClass} value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
            </label>
            <label className="block text-sm">Adresse mail de contact
              <input className={fieldClass} value={v.contact} onChange={(e) => setV({ ...v, contact: e.target.value })} placeholder={loginEmail} />
            </label>
            <p className="text-xs text-muted-foreground">Identifiant de connexion : {loginEmail || '—'}</p>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Fermer</Button>
          <Button onClick={() => void save()} disabled={busy || loading}>{busy ? 'Enregistrement…' : 'Enregistrer'}</Button>
        </div>
      </div>
    </div>
  )
}

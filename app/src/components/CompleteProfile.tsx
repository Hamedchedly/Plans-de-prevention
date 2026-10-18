import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { Button, Card, Notice, errMsg, fieldClass } from './ui'

/** Écran affiché après l'ouverture d'un lien d'invitation : mot de passe puis identité. */
export default function CompleteProfile() {
  const { session, signOut } = useAuth()
  const userId = session?.user.id ?? ''
  const loginEmail = session?.user.email ?? ''
  const [v, setV] = useState({ password: '', confirm: '', first: '', last: '', phone: '', contact: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const passwordOk = v.password.length >= 8 && v.password === v.confirm
  const identityOk = !!(v.first.trim() && v.last.trim() && v.phone.trim())

  const submit = async () => {
    setBusy(true); setErr(null)
    try {
      const { error: pwErr } = await supabase.auth.updateUser({ password: v.password, data: { needs_setup: false } })
      if (pwErr) throw new Error(pwErr.message)
      const { error: idErr } = await supabase.rpc('update_profile_identity', {
        p_user_id: userId, p_first: v.first, p_last: v.last, p_phone: v.phone, p_contact_email: v.contact || loginEmail,
      })
      if (idErr) throw new Error(idErr.message)
      window.location.reload()
    } catch (e) {
      setErr(errMsg(e))
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto mt-10 max-w-md px-4 pb-16">
      <Card className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Bienvenue</h1>
          <p className="text-sm text-muted-foreground">Avant de commencer, choisissez votre mot de passe et renseignez votre identité. Elle apparaît sur les fiches que vous rédigez.</p>
          <p className="mt-1 text-xs text-muted-foreground">Identifiant : {loginEmail}</p>
        </div>
        {err && <Notice tone="error">{err}</Notice>}
        <div className="space-y-3">
          <label className="block text-sm">Mot de passe (8 caractères minimum)
            <input className={fieldClass} type="password" autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} />
          </label>
          <label className="block text-sm">Confirmer le mot de passe
            <input className={fieldClass} type="password" autoComplete="new-password" value={v.confirm} onChange={(e) => setV({ ...v, confirm: e.target.value })} />
          </label>
          {v.confirm && v.password !== v.confirm && <p className="text-xs text-destructive">Les mots de passe ne correspondent pas.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">Prénom
              <input className={fieldClass} value={v.first} onChange={(e) => setV({ ...v, first: e.target.value })} />
            </label>
            <label className="block text-sm">Nom
              <input className={fieldClass} value={v.last} onChange={(e) => setV({ ...v, last: e.target.value })} />
            </label>
          </div>
          <label className="block text-sm">Téléphone
            <input className={fieldClass} value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
          </label>
          <label className="block text-sm">Adresse mail de contact
            <input className={fieldClass} value={v.contact} onChange={(e) => setV({ ...v, contact: e.target.value })} placeholder={loginEmail} />
          </label>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => void signOut()} disabled={busy}>Plus tard</Button>
          <Button onClick={() => void submit()} disabled={busy || !passwordOk || !identityOk}>
            {busy ? 'Enregistrement…' : 'Terminer mon profil'}
          </Button>
        </div>
      </Card>
    </div>
  )
}

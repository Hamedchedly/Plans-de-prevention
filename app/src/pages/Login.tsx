import { useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { Button, Card, Notice, fieldClass, errMsg } from '../components/ui'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try { await signIn(email.trim(), password) } catch (x) { setErr(errMsg(x)) } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm px-4">
      <Card>
        <h1 className="mb-1 text-lg font-semibold">Plans de prévention</h1>
        <p className="mb-4 text-sm text-muted-foreground">Secteur 11 · connexion</p>
        <form onSubmit={submit} className="space-y-3">
          <input className={fieldClass} type="email" placeholder="Adresse e-mail" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
          <input className={fieldClass} type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          {err && <Notice tone="error">{err}</Notice>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</Button>
        </form>
        <p className="mt-4 text-xs text-muted-foreground">Les comptes sont créés par un Super Admin.</p>
      </Card>
    </div>
  )
}

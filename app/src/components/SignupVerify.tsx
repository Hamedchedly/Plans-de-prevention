import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button, Card, Notice, errMsg } from './ui'

/**
 * Page /signup ouverte depuis le lien d'invitation ou de renouvellement.
 * Le jeton est validé ici, directement auprès de Supabase : aucune redirection vers une autre adresse.
 * Une fois la session ouverte, l'écran « Bienvenue » (mot de passe, identité) s'affiche via la garde de App.tsx.
 */
export default function SignupVerify() {
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const params = new URLSearchParams(window.location.search)
    const tokenHash = params.get('token_hash')
    const type = params.get('type')
    if (!tokenHash || type !== 'magiclink') {
      setBusy(false)
      setErr('Lien incomplet. Demandez à votre administrateur de vous en envoyer un nouveau.')
      return
    }
    void supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' }).then(({ error }) => {
      if (error) {
        setBusy(false)
        setErr(`Ce lien n’est plus valable (${error.message}). Demandez à votre administrateur un nouveau lien.`)
        return
      }
      // Session ouverte : on quitte l'adresse porteuse du jeton et on recharge l'application.
      window.location.replace('/')
    }).catch((e) => { setBusy(false); setErr(errMsg(e)) })
  }, [])

  return (
    <div className="mx-auto mt-10 max-w-md px-4 pb-16">
      <Card className="space-y-4">
        <h1 className="text-lg font-semibold">Configuration de votre accès</h1>
        {busy && !err && <p className="text-sm text-muted-foreground">Vérification du lien…</p>}
        {err && (
          <>
            <Notice tone="error">{err}</Notice>
            <Button variant="ghost" onClick={() => window.location.replace('/')}>Retour à l’accueil</Button>
          </>
        )}
      </Card>
    </div>
  )
}

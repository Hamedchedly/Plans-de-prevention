import { useState } from 'react'
import { useAuth } from './lib/auth'
import { readImpersonation } from './lib/impersonation'
import type { OrderRow } from './lib/types'
import { Button, Card, Notice } from './components/ui'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import PlanEditor from './pages/PlanEditor'
import ImportPage from './pages/Import'
import Admin from './pages/Admin'

type Page = 'commandes' | 'import' | 'administration'

export default function App() {
  const { session, profile, loading, signOut } = useAuth()
  const [page, setPage] = useState<Page>('commandes')
  const [editing, setEditing] = useState<OrderRow | null>(null)

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Chargement…</div>
  if (!session) return <Login />

  if (!profile || !profile.is_active) {
    return (
      <div className="mx-auto mt-16 max-w-md px-4">
        <Card>
          <h1 className="mb-2 text-lg font-semibold">Accès non disponible</h1>
          <p className="mb-4 text-sm text-muted-foreground">
            {profile ? 'Ce compte est désactivé.' : 'Aucun profil n’est associé à ce compte.'} Demandez à un Super Admin de l’activer.
          </p>
          <Button variant="ghost" onClick={() => signOut()}>Se déconnecter</Button>
        </Card>
      </div>
    )
  }

  const isManager = profile.role === 'RESPONSABLE' || profile.role === 'SUPER_ADMIN'
  const navItems: { key: Page; label: string; show: boolean }[] = [
    { key: 'commandes', label: 'Commandes', show: true },
    { key: 'import', label: 'Import', show: isManager },
    { key: 'administration', label: 'Administration', show: isManager },
  ]

  const imp = readImpersonation()

  return (
    <div className="min-h-screen">
      {imp && (
        <div className="flex flex-wrap items-center gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-900">
          <span className="mr-auto">Session ouverte en tant que <strong>{imp.targetEmail}</strong> (par {imp.adminEmail ?? 'un Super Admin'}). Toutes les actions sont journalisées.</span>
          <Button variant="ghost" onClick={() => signOut()}>Quitter la session</Button>
        </div>
      )}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="mr-auto">
            <div className="text-sm font-semibold">Plans de prévention · Secteur 11</div>
            <div className="text-xs text-muted-foreground">{profile.full_name || profile.email} · {profile.role}</div>
          </div>
          {navItems.filter((n) => n.show).map((n) => (
            <Button key={n.key} variant={page === n.key && !editing ? 'primary' : 'ghost'} onClick={() => { setEditing(null); setPage(n.key) }}>
              {n.label}
            </Button>
          ))}
          <Button variant="ghost" onClick={() => signOut()}>Quitter</Button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        {editing ? (
          <PlanEditor order={editing} onBack={() => setEditing(null)} />
        ) : page === 'commandes' ? (
          <Dashboard onOpen={setEditing} />
        ) : page === 'import' && isManager ? (
          <ImportPage />
        ) : page === 'administration' && isManager ? (
          <Admin />
        ) : (
          <Notice tone="error">Accès refusé.</Notice>
        )}
      </main>
    </div>
  )
}

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
import ProfileDialog from './components/ProfileDialog'
import CompleteProfile from './components/CompleteProfile'

type Page = 'commandes' | 'import' | 'administration'

export default function App() {
  const { session, profile, loading, signOut } = useAuth()
  const [page, setPage] = useState<Page>('commandes')
  const [editing, setEditing] = useState<OrderRow | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [userMenu, setUserMenu] = useState(false)

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Chargement…</div>
  if (!session) return <Login />
  if (session.user.user_metadata?.needs_setup === true) return <CompleteProfile />

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
  const initials = (profile.full_name || profile.email || '?').split(/\s+|@/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  const roleLabel: Record<string, string> = { SUPER_ADMIN: 'Super Admin', RESPONSABLE: 'Responsable', CHARGE_OPERATIONS: 'Chargé d’opérations' }

  return (
    <div className="min-h-screen bg-background">
      {imp && (
        <div className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:px-6">
          <span className="mr-auto">Session ouverte en tant que <strong>{imp.targetEmail}</strong> (par {imp.adminEmail ?? 'un Super Admin'}). Toutes les actions sont journalisées.</span>
          <Button variant="ghost" size="sm" onClick={() => signOut()}>Quitter la session</Button>
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground shadow-sm">PP</span>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-foreground">Plans de prévention</div>
              <div className="text-[11px] text-muted-foreground">Secteur 11</div>
            </div>
          </div>
          <nav aria-label="Navigation principale" className="flex items-center gap-1 rounded-lg bg-muted p-1">
            {navItems.filter((n) => n.show).map((n) => {
              const active = page === n.key && !editing
              return (
                <button key={n.key} onClick={() => { setEditing(null); setPage(n.key) }} aria-current={active ? 'page' : undefined}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                  {n.label}
                </button>
              )
            })}
          </nav>
          <div className="relative ml-auto">
            <button onClick={() => setUserMenu((v) => !v)} aria-haspopup="menu" aria-expanded={userMenu}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1 hover:bg-muted">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials}</span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-sm font-medium text-foreground">{profile.full_name || profile.email}</span>
                <span className="block text-[11px] text-muted-foreground">{roleLabel[profile.role] ?? profile.role}</span>
              </span>
            </button>
            {userMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenu(false)} />
                <div role="menu" className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                  <div className="border-b border-border px-3 py-2.5">
                    <div className="truncate text-sm font-medium">{profile.full_name || profile.email}</div>
                    <div className="truncate text-xs text-muted-foreground">{profile.email}</div>
                  </div>
                  <button role="menuitem" onClick={() => { setUserMenu(false); setProfileOpen(true) }} className="block w-full px-3 py-2 text-left text-sm hover:bg-muted">Vérifier mes infos</button>
                  <button role="menuitem" onClick={() => signOut()} className="block w-full px-3 py-2 text-left text-sm text-destructive hover:bg-muted">Se déconnecter</button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>
      {profileOpen && session && <ProfileDialog userId={session.user.id} isSelf onClose={() => setProfileOpen(false)} />}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
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

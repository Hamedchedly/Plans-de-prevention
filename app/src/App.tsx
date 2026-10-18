import { useState } from 'react'
import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { BarChart3, LayoutGrid, Settings2 } from 'lucide-react'
import { useAuth } from './lib/auth'
import { readImpersonation } from './lib/impersonation'
import { Button, Card } from './components/ui'
import Login from './pages/Login'
import ProfileDialog from './components/ProfileDialog'
import CompleteProfile from './components/CompleteProfile'

const NAV = [
  { to: '/commandes', label: 'Commandes', icon: LayoutGrid, managerOnly: false },
  { to: '/indicateurs', label: 'Indicateurs chargés', icon: BarChart3, managerOnly: true },
  { to: '/administration', label: 'Administration', icon: Settings2, managerOnly: true },
] as const

/** Mise en page commune : contrôle d'accès, barre latérale et contenu. Le contenu de chaque page vient du routeur. */
export function RootLayout() {
  const { session, profile, loading, signOut } = useAuth()
  const path = useRouterState({ select: (s) => s.location.pathname })
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
  const imp = readImpersonation()
  const initials = (profile.full_name || profile.email || '?').split(/\s+|@/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  const roleLabel: Record<string, string> = { SUPER_ADMIN: 'Super Admin', RESPONSABLE: 'Responsable', CHARGE_OPERATIONS: 'Chargé d’opérations' }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4 p-3 md:flex-row md:gap-5 md:p-5">
        <aside className="flex shrink-0 flex-row items-center gap-2 rounded-[2rem] bg-card p-3 shadow-sm md:sticky md:top-5 md:h-[calc(100vh-2.5rem)] md:w-60 md:flex-col md:items-stretch md:gap-1 md:p-4">
          <div className="hidden items-center gap-3 px-2 pb-6 pt-1 md:flex">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-sm font-bold text-primary-foreground">PP</span>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-foreground">Plans de prévention</div>
              <div className="text-[11px] text-muted-foreground">Secteur 11</div>
            </div>
          </div>
          <nav aria-label="Navigation principale" className="flex min-w-0 flex-1 gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {NAV.filter((n) => !n.managerOnly || isManager).map((n) => {
              // La fiche d'une commande (/commandes/:numero) n'active aucun onglet.
              const active = n.to === '/commandes' ? path === '/commandes' : path.startsWith(n.to)
              const Icon = n.icon
              return (
                <Link key={n.to} to={n.to} aria-current={active ? 'page' : undefined}
                  className={`flex shrink-0 items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition-colors ${active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'}`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {n.label}
                </Link>
              )
            })}
          </nav>
          <div className="relative shrink-0 md:mt-auto">
            <button onClick={() => setUserMenu((v) => !v)} aria-haspopup="menu" aria-expanded={userMenu}
              className="flex w-full items-center gap-2.5 rounded-2xl px-2 py-2 hover:bg-background/60">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{initials}</span>
              <span className="hidden min-w-0 text-left leading-tight md:block">
                <span className="block truncate text-sm font-medium text-foreground">{profile.full_name || profile.email}</span>
                <span className="block text-[11px] text-muted-foreground">{roleLabel[profile.role] ?? profile.role}</span>
              </span>
            </button>
            {userMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenu(false)} />
                <div role="menu" className="absolute bottom-full right-0 z-50 mb-2 w-56 overflow-hidden rounded-2xl border border-border bg-card shadow-lg md:left-0 md:right-auto">
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
        </aside>

        <div className="min-w-0 flex-1 space-y-4">
          {imp && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
              <span className="mr-auto">Session ouverte en tant que <strong>{imp.targetEmail}</strong> (par {imp.adminEmail ?? 'un Super Admin'}). Toutes les actions sont journalisées.</span>
              <Button variant="ghost" size="sm" onClick={() => signOut()}>Quitter la session</Button>
            </div>
          )}
          {profileOpen && session && <ProfileDialog userId={session.user.id} isSelf onClose={() => setProfileOpen(false)} />}
          <main className="min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}

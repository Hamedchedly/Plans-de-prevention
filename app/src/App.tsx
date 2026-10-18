import { useEffect, useState } from 'react'
import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { BarChart3, LayoutGrid, Settings2 } from 'lucide-react'
import { useAuth } from './lib/auth'
import { readImpersonation } from './lib/impersonation'
import { Button, Card } from './components/ui'
import { visibleAdminGroups } from './lib/adminNav'
import { fetchAdminPending, type AdminPending } from './lib/adminPending'
import Login from './pages/Login'
import ProfileDialog from './components/ProfileDialog'
import CompleteProfile from './components/CompleteProfile'

/** Pastille du nombre d'actions à traiter (affichée seulement s'il y en a). */
function PendingBadge({ n }: { n: number }) {
  if (n <= 0) return null
  return (
    <span aria-label={`${n} à traiter`} className="ml-1.5 inline-flex min-w-[1.25rem] justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold leading-5 text-white">{n}</span>
  )
}

const NAV = [
  { to: '/commandes', label: 'Commandes', icon: LayoutGrid, managerOnly: false },
  { to: '/indicateurs', label: 'Indicateurs chargés', icon: BarChart3, managerOnly: true },
  { to: '/administration', label: 'Administration', icon: Settings2, managerOnly: true },
] as const

/** Mise en page commune : contrôle d'accès, barre de navigation en haut et contenu. Le contenu vient du routeur. */
export function RootLayout() {
  const { session, profile, loading, signOut } = useAuth()
  const path = useRouterState({ select: (s) => s.location.pathname })
  const [profileOpen, setProfileOpen] = useState(false)
  const [userMenu, setUserMenu] = useState(false)
  const [pending, setPending] = useState<AdminPending>({})
  const userId = session?.user.id
  const canAdmin = profile?.role === 'RESPONSABLE' || profile?.role === 'SUPER_ADMIN'
  const inAdminPath = path.startsWith('/administration')

  // Pastilles : nombre d'actions à traiter, relues à chaque entrée ou changement de page d'administration.
  useEffect(() => {
    if (!userId || !canAdmin || !inAdminPath) return
    let alive = true
    fetchAdminPending().then((p) => { if (alive) setPending(p) }).catch(() => {})
    return () => { alive = false }
  }, [userId, canAdmin, inAdminPath, path])

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
  const adminGroups = visibleAdminGroups(profile.role === 'SUPER_ADMIN')
  const inAdmin = inAdminPath
  // Page d'administration ouverte : /administration/:section
  const adminKey = inAdmin ? path.split('/')[2] ?? '' : ''
  const currentGroup = adminGroups.find((g) => g.pages.some((p) => p.key === adminKey)) ?? adminGroups[0]
  const imp = readImpersonation()
  const initials = (profile.full_name || profile.email || '?').split(/\s+|@/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  const roleLabel: Record<string, string> = { SUPER_ADMIN: 'Super Admin', RESPONSABLE: 'Responsable', CHARGE_OPERATIONS: 'Chargé d’opérations' }
  const pill = (on: boolean, small = false) =>
    `shrink-0 whitespace-nowrap rounded-full transition-colors ${small ? 'px-3 py-1 text-xs' : 'px-4 py-2 text-sm'} font-medium ${on ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4 p-3 md:p-5">
        <header className="flex items-center gap-3 rounded-[2rem] bg-card px-3 py-2.5 shadow-sm md:px-4">
          <div className="flex shrink-0 items-center gap-2.5 pl-1 pr-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary text-xs font-bold text-primary-foreground">PP</span>
            <div className="hidden leading-tight lg:block">
              <div className="text-sm font-semibold text-foreground">Plans de prévention</div>
              <div className="text-[11px] text-muted-foreground">Secteur 11</div>
            </div>
          </div>
          <nav aria-label="Navigation principale" className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-full bg-muted p-1">
            {NAV.filter((n) => !n.managerOnly || isManager).map((n) => {
              // La fiche d'une commande (/commandes/:numero) n'active aucun onglet.
              const active = n.to === '/commandes' ? path === '/commandes' : path.startsWith(n.to)
              const Icon = n.icon
              return (
                <Link key={n.to} to={n.to} aria-current={active ? 'page' : undefined} className={`flex items-center gap-2 ${pill(active)}`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {n.label}
                </Link>
              )
            })}
          </nav>
          <div className="relative shrink-0">
            <button onClick={() => setUserMenu((v) => !v)} aria-haspopup="menu" aria-expanded={userMenu}
              className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2 hover:bg-muted">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{initials}</span>
              <span className="hidden text-left leading-tight md:block">
                <span className="block max-w-[10rem] truncate text-sm font-medium text-foreground">{profile.full_name || profile.email}</span>
                <span className="block text-[11px] text-muted-foreground">{roleLabel[profile.role] ?? profile.role}</span>
              </span>
            </button>
            {userMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenu(false)} />
                <div role="menu" className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
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
        </header>

        {inAdmin && (
          <div className="space-y-2 rounded-[1.5rem] bg-card px-3 py-2.5 shadow-sm">
            <nav aria-label="Groupes d’administration" className="flex gap-1 overflow-x-auto">
              {adminGroups.map((g) => (
                <Link key={g.label} to="/administration/$section" params={{ section: g.pages[0].key }}
                  aria-current={g === currentGroup ? 'page' : undefined} className={pill(g === currentGroup)}>
                  {g.label}
                  <PendingBadge n={g.pages.reduce((sum, p) => sum + (pending[p.key] ?? 0), 0)} />
                </Link>
              ))}
            </nav>
            {currentGroup && (
              <nav aria-label="Pages du groupe" className="flex gap-1 overflow-x-auto border-t border-border pt-2">
                {currentGroup.pages.map((p) => (
                  <Link key={p.key} to="/administration/$section" params={{ section: p.key }}
                    aria-current={p.key === adminKey ? 'page' : undefined} className={pill(p.key === adminKey, true)}>
                    {p.label}
                    <PendingBadge n={pending[p.key] ?? 0} />
                  </Link>
                ))}
              </nav>
            )}
          </div>
        )}

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
  )
}

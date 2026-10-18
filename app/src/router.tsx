import { useEffect, useState, type ReactNode } from 'react'
import { createRootRoute, createRoute, createRouter, Link, redirect, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { RootLayout } from './App'
import { useAuth } from './lib/auth'
import { supabase } from './lib/supabase'
import type { OrderRow } from './lib/types'
import { Notice } from './components/ui'
import Dashboard, { type DashboardView } from './pages/Dashboard'
import PlanEditor from './pages/PlanEditor'
import ImportPage from './pages/Import'
import Admin from './pages/Admin'
import Indicateurs from './pages/Indicateurs'

/** Paramètres de la liste des commandes, conservés dans l'adresse (onglet, regroupement, tri). */
function validateOrdersSearch(s: Record<string, unknown>): DashboardView {
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
  return { onglet: str(s.onglet), regroupement: str(s.regroupement), tri: str(s.tri), sens: str(s.sens) }
}

function CommandesPage() {
  const view = useSearch({ from: '/commandes' })
  const navigate = useNavigate()
  return (
    <Dashboard
      view={view}
      setView={(patch) => navigate({ to: '/commandes', search: (prev) => ({ ...prev, ...patch }) })}
      onOpen={(o: OrderRow) => navigate({ to: '/commandes/$numero', params: { numero: o.order_number } })}
    />
  )
}

/** Fiche d'une commande : la commande est relue depuis la base à partir du numéro de l'adresse. */
function OrderPage() {
  const { numero } = useParams({ from: '/commandes/$numero' })
  const navigate = useNavigate()
  const [order, setOrder] = useState<OrderRow | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setOrder(null)
    setErr(null)
    supabase.from('orders').select('*').eq('order_number', numero).maybeSingle().then(({ data, error }) => {
      if (!alive) return
      if (error) setErr(error.message)
      else if (!data) setErr(`Commande ${numero} introuvable.`)
      else setOrder(data as OrderRow)
    })
    return () => { alive = false }
  }, [numero])

  if (err) return <Notice tone="error">{err}</Notice>
  if (!order) return <p className="text-sm text-muted-foreground">Chargement de la commande…</p>
  return <PlanEditor order={order} onBack={() => navigate({ to: '/commandes' })} />
}

function ManagerOnly({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  if (profile?.role !== 'RESPONSABLE' && profile?.role !== 'SUPER_ADMIN') return <Notice tone="error">Accès refusé.</Notice>
  return <>{children}</>
}

function NotFound() {
  return (
    <Notice tone="error">
      Page introuvable. <Link to="/commandes" className="underline">Retour aux commandes</Link>
    </Notice>
  )
}

const rootRoute = createRootRoute({ component: RootLayout })

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => { throw redirect({ to: '/commandes' }) },
})
const commandesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/commandes',
  validateSearch: validateOrdersSearch,
  component: CommandesPage,
})
const orderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/commandes/$numero',
  component: OrderPage,
})
const importRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/import',
  component: () => <ManagerOnly><ImportPage /></ManagerOnly>,
})
const indicateursRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/indicateurs',
  component: () => <ManagerOnly><Indicateurs /></ManagerOnly>,
})
const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/administration',
  component: () => <ManagerOnly><Admin /></ManagerOnly>,
})

const routeTree = rootRoute.addChildren([indexRoute, commandesRoute, orderRoute, importRoute, indicateursRoute, adminRoute])

export const router = createRouter({ routeTree, defaultNotFoundComponent: NotFound })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

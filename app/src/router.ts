import { RootRoute, Router, Route } from '@tanstack/react-router'
import App from './App'
import Dashboard from '@/pages/Dashboard'
import Import from '@/pages/Import'
import Qualification from '@/pages/Qualification'
import Admin from '@/pages/Admin'
import Login from '@/pages/Login'

const rootRoute = new RootRoute({
  component: App,
})

const loginRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: Login,
})

const dashboardRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Dashboard,
})

const importRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/import',
  component: Import,
})

const qualificationRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/qualification',
  component: Qualification,
})

const adminRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/admin',
  component: Admin,
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  dashboardRoute,
  importRoute,
  qualificationRoute,
  adminRoute,
])

export const router = new Router({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

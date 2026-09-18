import { useAuth } from '@/context/AuthContext'

export default function Dashboard() {
  const { user, role, logout } = useAuth()

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Plans de Prévention V6</h1>
          <div className="flex items-center gap-4">
            <div className="text-sm">
              <p className="font-medium">{user?.email}</p>
              <p className="text-muted-foreground">{role || 'No role'}</p>
            </div>
            <button
              onClick={logout}
              className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:opacity-90 transition"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* KPI Cards */}
          <div className="bg-card p-6 rounded-lg border">
            <p className="text-sm text-muted-foreground mb-2">Sans plan</p>
            <p className="text-3xl font-bold">0</p>
          </div>
          <div className="bg-card p-6 rounded-lg border">
            <p className="text-sm text-muted-foreground mb-2">Plans envoyés</p>
            <p className="text-3xl font-bold">0</p>
          </div>
          <div className="bg-card p-6 rounded-lg border">
            <p className="text-sm text-muted-foreground mb-2">Retours reçus</p>
            <p className="text-3xl font-bold">0</p>
          </div>
          <div className="bg-card p-6 rounded-lg border">
            <p className="text-sm text-muted-foreground mb-2">À qualifier</p>
            <p className="text-3xl font-bold">0</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-card border rounded-lg">
          <div className="border-b border-border">
            <div className="flex space-x-8 px-6">
              <button className="py-4 border-b-2 border-primary text-primary font-medium">
                Sans plan
              </button>
              <button className="py-4 text-muted-foreground hover:text-foreground">
                Plans envoyés
              </button>
              <button className="py-4 text-muted-foreground hover:text-foreground">
                Retours reçus
              </button>
              <button className="py-4 text-muted-foreground hover:text-foreground">
                À qualifier
              </button>
            </div>
          </div>
          <div className="p-6">
            <p className="text-center text-muted-foreground py-12">
              Aucune commande pour le moment
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

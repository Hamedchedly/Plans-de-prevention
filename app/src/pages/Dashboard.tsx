import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { useNavigate } from '@tanstack/react-router'

export default function Dashboard() {
  const { user, role, logout } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('sans-plan')
  const [stats, setStats] = useState({ sansPlan: 0, qualifier: 0, filtered: 0, archived: 0 })
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [operators, setOperators] = useState<string[]>([])
  const [selectedOperator, setSelectedOperator] = useState<string>('')

  useEffect(() => {
    loadOperators()
    loadData()
  }, [activeTab, selectedOperator])

  const loadOperators = async () => {
    const { data } = await supabase
      .from('pp_orders')
      .select('owner_user_id')
      .neq('owner_user_id', null)

    if (data) {
      const uniqueOps = Array.from(new Set(data.map((d) => d.owner_user_id)))
      setOperators(uniqueOps as string[])
    }
  }

  const loadData = async () => {
    setLoading(true)

    // Get counts
    let countQuery = supabase.from('pp_orders').select('*', { count: 'exact', head: true })
    if (selectedOperator) {
      countQuery = countQuery.eq('owner_user_id', selectedOperator)
    }

    const { count: sansPlan } = await countQuery.eq('qualification_status', 'PENDING')

    let countQuery2 = supabase.from('pp_orders').select('*', { count: 'exact', head: true })
    if (selectedOperator) {
      countQuery2 = countQuery2.eq('owner_user_id', selectedOperator)
    }

    const { count: qualifier } = await countQuery2.eq('qualification_status', 'PENDING')

    let countQuery3 = supabase.from('pp_orders').select('*', { count: 'exact', head: true })
    if (selectedOperator) {
      countQuery3 = countQuery3.eq('owner_user_id', selectedOperator)
    }

    const { count: filtered } = await countQuery3.eq('scope_status', 'OUT_OF_SCOPE')

    setStats({
      sansPlan: sansPlan || 0,
      qualifier: qualifier || 0,
      filtered: filtered || 0,
      archived: 0,
    })

    // Get orders for current tab
    let query = supabase.from('pp_orders').select('*').limit(20)

    if (selectedOperator) {
      query = query.eq('owner_user_id', selectedOperator)
    }

    if (activeTab === 'sans-plan') {
      query = query.eq('qualification_status', 'PENDING')
    } else if (activeTab === 'qualifier') {
      query = query.eq('qualification_status', 'PENDING')
    } else if (activeTab === 'filtered') {
      query = query.eq('scope_status', 'OUT_OF_SCOPE')
    }

    const { data } = await query

    setOrders(data || [])
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold">Plans de Prévention V6</h1>
            <div className="flex items-center gap-4">
              <div className="text-sm text-right">
                <p className="font-medium text-gray-900">{user?.email}</p>
                <p className="text-gray-600">{role || 'No role'}</p>
              </div>
              {role === 'SUPER_ADMIN' && (
                <>
                  <button
                    onClick={() => navigate({ to: '/import' })}
                    className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 font-medium"
                  >
                    📤 Import
                  </button>
                  <button
                    onClick={() => navigate({ to: '/admin' })}
                    className="px-4 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 font-medium"
                  >
                    ⚙️ Config
                  </button>
                </>
              )}
              <button
                onClick={() => navigate({ to: '/qualification' })}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
              >
                ✓ Qualifier
              </button>
              <button
                onClick={() => navigate({ to: '/plan-preparation' })}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 font-medium"
              >
                📄 Préparer le Plan
              </button>
              <button
                onClick={logout}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 font-medium"
              >
                Déconnexion
              </button>
            </div>
          </div>

          {role === 'RESPONSABLE' && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Filtrer par opérateur:</label>
              <select
                value={selectedOperator}
                onChange={(e) => setSelectedOperator(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">Tous les opérateurs</option>
                {operators.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* KPI Cards */}
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition">
            <p className="text-sm text-gray-600 mb-2">Sans plan</p>
            <p className="text-3xl font-bold text-blue-600">{stats.sansPlan}</p>
          </div>
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition">
            <p className="text-sm text-gray-600 mb-2">À QUALIFIER</p>
            <p className="text-3xl font-bold text-orange-600">{stats.qualifier}</p>
          </div>
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition">
            <p className="text-sm text-gray-600 mb-2">Filtrés (Hors périmètre)</p>
            <p className="text-3xl font-bold text-gray-600">{stats.filtered}</p>
          </div>
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition">
            <p className="text-sm text-gray-600 mb-2">Archivés</p>
            <p className="text-3xl font-bold text-purple-600">{stats.archived}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="border-b border-gray-200">
            <div className="flex space-x-8 px-6">
              {[
                { id: 'sans-plan', label: 'Sans plan' },
                { id: 'qualifier', label: 'À QUALIFIER' },
                { id: 'filtered', label: 'Filtrés' },
                { id: 'archived', label: 'Archivés' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 border-b-2 font-medium transition ${
                    activeTab === tab.id
                      ? 'text-blue-600 border-blue-600'
                      : 'text-gray-600 hover:text-gray-900 border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-6 text-center text-gray-600">Chargement...</div>
            ) : orders.length === 0 ? (
              <div className="p-6 text-center text-gray-600">Aucune commande pour le moment</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium text-gray-700">N° Commande</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-700">Date</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-700">Nature</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-700">Entreprise</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-700">Adresse</th>
                    <th className="px-6 py-3 text-left font-medium text-gray-700">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-t border-gray-200 hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-900">{order.order_number}</td>
                      <td className="px-6 py-3 text-gray-600 text-xs">{order.order_date}</td>
                      <td className="px-6 py-3 text-gray-600">{order.work_nature}</td>
                      <td className="px-6 py-3 text-gray-600">{order.company_id}</td>
                      <td className="px-6 py-3 text-gray-600 text-xs">{order.site_address}</td>
                      <td className="px-6 py-3">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            order.qualification_status === 'QUALIFIED'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {order.qualification_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { useNavigate } from '@tanstack/react-router'
import { EXCLUDED_BUDGET_NATURES, HIDDEN_BUDGET_NATURES } from '@/lib/import-service'

type TabId = 'sans-plan' | 'qualifier' | 'filtered' | 'archived'

export default function Dashboard() {
  const { user, role, operatorCode, logout } = useAuth()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<TabId>('sans-plan')
  const [stats, setStats] = useState({ sansPlan: 0, qualifier: 0, filtered: 0, archived: 0 })
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [operators, setOperators] = useState<string[]>([])
  const [selectedOperator, setSelectedOperator] = useState<string>('')
  const [showHidden, setShowHidden] = useState(false) // toggle AC visibility

  // CHARGE_OPERATIONS users are locked to their own operator code
  const isLockedOperator = role === 'CHARGE_OPERATIONS'
  const effectiveOperator = isLockedOperator ? (operatorCode || '') : selectedOperator

  useEffect(() => {
    if (!isLockedOperator) loadOperators()
  }, [isLockedOperator])

  useEffect(() => {
    loadData()
  }, [activeTab, effectiveOperator, showHidden])

  const loadOperators = async () => {
    const { data } = await supabase
      .from('pp_orders')
      .select('owner_user_id')
      .not('budget_nature', 'in', `(${EXCLUDED_BUDGET_NATURES.join(',')})`)
      .neq('owner_user_id', null)

    if (data) {
      const unique = [...new Set(data.map(d => d.owner_user_id))].filter(Boolean).sort()
      setOperators(unique as string[])
    }
  }

  // Build base query with common filters
  const baseQuery = () => {
    let q = supabase
      .from('pp_orders')
      .select('*', { count: 'exact', head: true })
      // Always exclude HO
      .not('budget_nature', 'in', `(${EXCLUDED_BUDGET_NATURES.join(',')})`)

    if (!showHidden) {
      // Also exclude AC when toggle is off
      q = q.not('budget_nature', 'in', `(${HIDDEN_BUDGET_NATURES.join(',')})`)
    }

    if (effectiveOperator) {
      q = q.eq('owner_user_id', effectiveOperator)
    }

    return q
  }

  const loadData = async () => {
    setLoading(true)

    const [r1, r2, r3] = await Promise.all([
      baseQuery().eq('qualification_status', 'PENDING').eq('scope_status', 'IN_SCOPE'),
      baseQuery().eq('qualification_status', 'PENDING'),
      baseQuery().eq('scope_status', 'OUT_OF_SCOPE'),
    ])

    setStats({
      sansPlan: r1.count || 0,
      qualifier: r2.count || 0,
      filtered: r3.count || 0,
      archived: 0,
    })

    // Fetch orders for current tab
    let q = supabase
      .from('pp_orders')
      .select('*')
      .not('budget_nature', 'in', `(${EXCLUDED_BUDGET_NATURES.join(',')})`)
      .limit(50)

    if (!showHidden) {
      q = q.not('budget_nature', 'in', `(${HIDDEN_BUDGET_NATURES.join(',')})`)
    }

    if (effectiveOperator) q = q.eq('owner_user_id', effectiveOperator)

    if (activeTab === 'sans-plan') {
      q = q.eq('qualification_status', 'PENDING').eq('scope_status', 'IN_SCOPE')
    } else if (activeTab === 'qualifier') {
      q = q.eq('qualification_status', 'PENDING')
    } else if (activeTab === 'filtered') {
      q = q.eq('scope_status', 'OUT_OF_SCOPE')
    }

    const { data } = await q
    setOrders(data || [])
    setLoading(false)
  }

  const tabs = [
    { id: 'sans-plan' as TabId, label: 'Sans plan', count: stats.sansPlan, color: 'blue' },
    { id: 'qualifier' as TabId, label: 'À qualifier', count: stats.qualifier, color: 'orange' },
    { id: 'filtered' as TabId, label: 'Hors périmètre', count: stats.filtered, color: 'gray' },
    { id: 'archived' as TabId, label: 'Archivés', count: stats.archived, color: 'purple' },
  ]

  const statusBadge = (order: any) => {
    if (order.qualification_status === 'QUALIFIED') return 'bg-green-100 text-green-800'
    if (order.scope_status === 'OUT_OF_SCOPE') return 'bg-gray-100 text-gray-600'
    return 'bg-yellow-100 text-yellow-800'
  }

  const statusLabel = (order: any) => {
    if (order.qualification_status === 'QUALIFIED') return 'Qualifié'
    if (order.scope_status === 'OUT_OF_SCOPE') return 'Hors périmètre'
    return 'À qualifier'
  }

  const natureBadgeColor = (nature: string) => {
    if (nature === 'GT') return 'bg-blue-100 text-blue-700'
    if (nature === 'GE') return 'bg-indigo-100 text-indigo-700'
    if (nature === 'CP') return 'bg-purple-100 text-purple-700'
    if (HIDDEN_BUDGET_NATURES.includes(nature)) return 'bg-orange-100 text-orange-700'
    return 'bg-gray-100 text-gray-600'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Plans de Prévention V6</h1>
              <p className="text-xs text-gray-500 mt-0.5">{user?.email} · {role}</p>
            </div>
            <div className="flex items-center gap-2">
              {role === 'SUPER_ADMIN' && (
                <>
                  <button
                    onClick={() => navigate({ to: '/import' })}
                    className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                  >
                    Import
                  </button>
                  <button
                    onClick={() => navigate({ to: '/admin' })}
                    className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium"
                  >
                    Config
                  </button>
                </>
              )}
              <button
                onClick={() => navigate({ to: '/qualification' })}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Qualifier
              </button>
              <button
                onClick={logout}
                className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
              >
                Déconnexion
              </button>
            </div>
          </div>

          {/* Filters row */}
          <div className="flex items-center gap-4 flex-wrap">
            {/* Operator filter — only for SUPER_ADMIN and RESPONSABLE */}
            {(role === 'SUPER_ADMIN' || role === 'RESPONSABLE') && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600 whitespace-nowrap">Chargé d'opérations :</label>
                <select
                  value={selectedOperator}
                  onChange={(e) => setSelectedOperator(e.target.value)}
                  className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white min-w-[160px]"
                >
                  <option value="">Tous les opérateurs</option>
                  {operators.map(op => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Show locked operator label for CHARGE_OPERATIONS */}
            {isLockedOperator && operatorCode && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-600">Opérateur :</span>
                <span className="px-2.5 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm font-mono">
                  {operatorCode}
                </span>
              </div>
            )}

            {/* AC toggle */}
            <button
              onClick={() => setShowHidden(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                showHidden
                  ? 'bg-orange-50 border-orange-300 text-orange-700'
                  : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${showHidden ? 'bg-orange-500' : 'bg-gray-300'}`} />
              {showHidden ? 'Masquer les AC' : 'Afficher les AC'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* KPI cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`bg-white p-5 rounded-xl border-2 text-left transition-all hover:shadow-md ${
                activeTab === tab.id ? 'border-blue-500 shadow-sm' : 'border-transparent shadow-sm'
              }`}
            >
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{tab.label}</p>
              <p className={`text-3xl font-bold text-${tab.color}-600`}>{tab.count}</p>
            </button>
          ))}
        </div>

        {/* Orders table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              {tabs.find(t => t.id === activeTab)?.label}
              <span className="ml-2 text-gray-400 font-normal">({orders.length} commandes affichées)</span>
            </h2>
            {showHidden && (
              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full font-medium">
                AC inclus
              </span>
            )}
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-400">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-sm">Chargement...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <p className="text-sm">Aucune commande pour ce filtre</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">N° Cmd</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Nature</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Travaux</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Entreprise</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Chargé Op.</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Montant</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orders.map(order => (
                    <tr key={order.id} className="hover:bg-gray-50 cursor-pointer">
                      <td className="px-5 py-3 font-mono text-xs font-semibold text-gray-800">{order.order_number}</td>
                      <td className="px-5 py-3 text-xs text-gray-500">
                        {order.order_date ? new Date(order.order_date).toLocaleDateString('fr-FR') : '-'}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${natureBadgeColor(order.budget_nature)}`}>
                          {order.budget_nature}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-600 max-w-xs truncate" title={order.work_nature}>
                        {order.work_nature}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-600">{order.company_id}</td>
                      <td className="px-5 py-3 font-mono text-xs text-gray-600">{order.owner_user_id}</td>
                      <td className="px-5 py-3 text-right text-xs font-medium text-gray-700">
                        {order.amount_ttc != null
                          ? order.amount_ttc.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
                          : '-'}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(order)}`}>
                          {statusLabel(order)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

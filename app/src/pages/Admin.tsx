import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useNavigate } from '@tanstack/react-router'
import AdminUsers from '@/components/admin/AdminUsers'
import AdminTrades from '@/components/admin/AdminTrades'
import AdminMeasures from '@/components/admin/AdminMeasures'
import AdminScopeRules from '@/components/admin/AdminScopeRules'

export default function Admin() {
  const { user, role } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('users')

  useEffect(() => {
    if (role !== 'SUPER_ADMIN') {
      navigate({ to: '/' })
    }
  }, [role, navigate])

  if (role !== 'SUPER_ADMIN') {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">⚙️ Configuration & Administration</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate({ to: '/' })}
              className="px-4 py-2 text-sm bg-gray-200 text-gray-900 rounded hover:bg-gray-300 font-medium"
            >
              ← Retour au Dashboard
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="border-b border-gray-200">
            <div className="flex space-x-8 px-6">
              {[
                { id: 'users', label: '👥 Utilisateurs' },
                { id: 'trades', label: '🏗️ Corps d\'État' },
                { id: 'measures', label: '🛡️ Mesures' },
                { id: 'scope', label: '🎯 Périmètre' },
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

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'users' && <AdminUsers />}
            {activeTab === 'trades' && <AdminTrades />}
            {activeTab === 'measures' && <AdminMeasures />}
            {activeTab === 'scope' && <AdminScopeRules />}
          </div>
        </div>
      </main>
    </div>
  )
}

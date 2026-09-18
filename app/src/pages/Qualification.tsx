import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { qualifyOrder } from '@/lib/import-service'
import { useAuth } from '@/context/AuthContext'

interface Order {
  id: string
  order_number: string
  work_nature: string
  work_description: string
  site_address: string
}

interface Trade {
  id: string
  code: string
  name: string
}

export default function Qualification() {
  const { user } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedTrades, setSelectedTrades] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    // Get orders needing qualification
    const { data: ordersData } = await supabase
      .from('pp_orders')
      .select('id, order_number, work_nature, work_description, site_address')
      .eq('qualification_status', 'PENDING')
      .limit(100)

    // Get trades
    const { data: tradesData } = await supabase
      .from('pp_trades')
      .select('id, code, name')
      .eq('active', true)

    setOrders(ordersData || [])
    setTrades(tradesData || [])
    setLoading(false)
  }

  const currentOrder = orders[currentIndex]

  const filteredTrades = trades.filter(
    (t) =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.code.includes(searchTerm)
  )

  const handleQualify = async () => {
    if (!currentOrder || selectedTrades.length === 0) return

    setSaving(true)
    try {
      await qualifyOrder(currentOrder.id, selectedTrades, user?.id || '')
      // Move to next
      setSelectedTrades([])
      if (currentIndex < orders.length - 1) {
        setCurrentIndex(currentIndex + 1)
      } else {
        setOrders(orders.filter((_, i) => i !== currentIndex))
      }
    } catch (error) {
      console.error('Error qualifying order:', error)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">Chargement...</div>
  }

  if (orders.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-8 text-center">
          <h1 className="text-3xl font-bold text-green-600 mb-2">✓ Terminé!</h1>
          <p className="text-gray-600">Toutes les commandes ont été qualifiées.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Progress */}
        <div className="mb-6 text-sm text-gray-600">
          Qualification {currentIndex + 1} / {orders.length}
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Order info */}
          <div className="col-span-2 bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-bold mb-4">{currentOrder?.order_number}</h2>

            <div className="space-y-4 text-sm">
              <div>
                <p className="text-gray-600">Nature des travaux</p>
                <p className="font-medium">{currentOrder?.work_nature}</p>
              </div>

              <div>
                <p className="text-gray-600">Description</p>
                <p className="text-gray-700">{currentOrder?.work_description}</p>
              </div>

              <div>
                <p className="text-gray-600">Adresse</p>
                <p className="text-gray-700">{currentOrder?.site_address}</p>
              </div>
            </div>

            {/* Trade selection */}
            <div className="mt-6 pt-6 border-t">
              <p className="font-medium mb-3">Sélectionnez les corps d'état</p>

              <input
                type="text"
                placeholder="Chercher par nom ou code (ex: 0301 ou menuiserie)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4"
              />

              <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-3 bg-gray-50">
                {filteredTrades.map((trade) => (
                  <label key={trade.id} className="flex items-center p-2 hover:bg-blue-50 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedTrades.includes(trade.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTrades([...selectedTrades, trade.id])
                        } else {
                          setSelectedTrades(selectedTrades.filter((id) => id !== trade.id))
                        }
                      }}
                      className="mr-3"
                    />
                    <span className="flex-1">
                      <span className="font-medium">{trade.code}</span> - {trade.name}
                    </span>
                  </label>
                ))}
              </div>

              {selectedTrades.length > 0 && (
                <div className="mt-4 p-3 bg-blue-50 rounded text-sm text-blue-700">
                  {selectedTrades.length} corps d'état sélectionné(s)
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="mt-6 flex gap-4">
              <button
                onClick={handleQualify}
                disabled={selectedTrades.length === 0 || saving}
                className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400"
              >
                {saving ? 'Sauvegarde...' : 'Valider et Continuer'}
              </button>

              <button
                onClick={() => {
                  setCurrentIndex(currentIndex + 1)
                  setSelectedTrades([])
                }}
                disabled={currentIndex >= orders.length - 1}
                className="px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                Passer
              </button>
            </div>
          </div>

          {/* Stats sidebar */}
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-bold mb-4">Statistiques</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Restantes</span>
                  <span className="font-bold">{orders.length - currentIndex}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Complétées</span>
                  <span className="font-bold text-green-600">{currentIndex}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${(currentIndex / orders.length) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-bold mb-3">Corps d'état populaires</h3>
              <div className="space-y-2 text-sm">
                {trades.slice(0, 5).map((trade) => (
                  <button
                    key={trade.id}
                    onClick={() => {
                      if (!selectedTrades.includes(trade.id)) {
                        setSelectedTrades([...selectedTrades, trade.id])
                      }
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 rounded text-blue-600 text-xs font-medium"
                  >
                    + {trade.code} {trade.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

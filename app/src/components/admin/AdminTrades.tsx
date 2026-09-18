import { useState, useEffect } from 'react'
import { listTrades, createTrade, updateTrade, mergeTrades } from '@/lib/admin-service'

interface Trade {
  id: string
  code: string
  name: string
  description?: string
  active: boolean
}

export default function AdminTrades() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [mergeMode, setMergeMode] = useState(false)
  const [sourceTradeId, setSourceTradeId] = useState('')
  const [targetTradeId, setTargetTradeId] = useState('')

  useEffect(() => {
    loadTrades()
  }, [])

  const loadTrades = async () => {
    try {
      setLoading(true)
      const data = await listTrades()
      setTrades(data)
    } catch (err) {
      setError('Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTrade = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!code || !name) {
      setError('Code et nom requis')
      return
    }

    try {
      await createTrade(code, name, description)
      setSuccess('Corps d\'état créé')
      setCode('')
      setName('')
      setDescription('')
      setShowForm(false)
      loadTrades()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  const handleMergeTrades = async () => {
    if (!sourceTradeId || !targetTradeId) {
      setError('Sélectionnez source et cible')
      return
    }

    if (sourceTradeId === targetTradeId) {
      setError('Source et cible doivent être différentes')
      return
    }

    if (!confirm('Fusionner ces corps d\'état? Les commandes seront réaffectées.')) return

    try {
      setError('')
      await mergeTrades(sourceTradeId, targetTradeId)
      setSuccess('Corps d\'état fusionnés')
      setSourceTradeId('')
      setTargetTradeId('')
      setMergeMode(false)
      loadTrades()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la fusion')
    }
  }

  const filteredTrades = trades.filter((t) =>
    t.code.includes(searchTerm) || t.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) return <div className="text-center py-8">Chargement...</div>

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Gestion des corps d'état</h2>
        <div className="flex gap-2">
          {!mergeMode && (
            <>
              <button
                onClick={() => setShowForm(!showForm)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium text-sm"
              >
                + Ajouter
              </button>
              <button
                onClick={() => setMergeMode(true)}
                className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 font-medium text-sm"
              >
                🔗 Fusionner
              </button>
            </>
          )}
          {mergeMode && (
            <button
              onClick={() => setMergeMode(false)}
              className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500 font-medium text-sm"
            >
              Annuler fusion
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700">
          {success}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreateTrade} className="bg-gray-50 p-6 rounded-lg space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="0301"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nom</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Menuiserie"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg h-20"
              placeholder="Description optionnelle"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium"
            >
              Créer
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 bg-gray-300 text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-400 font-medium"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      {mergeMode && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-6 space-y-4">
          <p className="font-medium text-orange-900">Mode fusion: sélectionnez source et cible</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">À fusionner (source)</label>
              <select
                value={sourceTradeId}
                onChange={(e) => setSourceTradeId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Sélectionnez...</option>
                {trades.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} - {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Fusionner vers (cible)</label>
              <select
                value={targetTradeId}
                onChange={(e) => setTargetTradeId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Sélectionnez...</option>
                {trades.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} - {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleMergeTrades}
              className="flex-1 bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 font-medium"
            >
              🔗 Fusionner
            </button>
          </div>
        </div>
      )}

      <div>
        <input
          type="text"
          placeholder="Chercher par code ou nom..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4"
        />

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 border border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left font-medium text-gray-700">Code</th>
                <th className="px-6 py-3 text-left font-medium text-gray-700">Nom</th>
                <th className="px-6 py-3 text-left font-medium text-gray-700">Description</th>
                <th className="px-6 py-3 text-left font-medium text-gray-700">Statut</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrades.map((trade) => (
                <tr
                  key={trade.id}
                  className={`border-t border-gray-200 hover:bg-gray-50 ${
                    mergeMode ? 'cursor-pointer' : ''
                  }`}
                >
                  <td className="px-6 py-3 font-medium text-gray-900">{trade.code}</td>
                  <td className="px-6 py-3 text-gray-700">{trade.name}</td>
                  <td className="px-6 py-3 text-gray-600 text-xs">{trade.description || '-'}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      trade.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {trade.active ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

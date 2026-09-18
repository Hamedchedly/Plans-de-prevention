import { useState, useEffect } from 'react'
import { listMeasures, createMeasure, updateMeasure } from '@/lib/admin-service'

interface Measure {
  id: string
  code: string
  description: string
  category?: string
  active: boolean
}

export default function AdminMeasures() {
  const [measures, setMeasures] = useState<Measure[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    loadMeasures()
  }, [])

  const loadMeasures = async () => {
    try {
      setLoading(true)
      const data = await listMeasures()
      setMeasures(data)
    } catch (err) {
      setError('Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateMeasure = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!code || !description) {
      setError('Code et description requis')
      return
    }

    try {
      await createMeasure(code, description, category)
      setSuccess('Mesure créée')
      setCode('')
      setDescription('')
      setCategory('')
      setShowForm(false)
      loadMeasures()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  const filteredMeasures = measures.filter((m) =>
    m.code.includes(searchTerm) || m.description.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) return <div className="text-center py-8">Chargement...</div>

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Gestion des mesures de sécurité</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium text-sm"
        >
          + Ajouter mesure
        </button>
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
        <form onSubmit={handleCreateMeasure} className="bg-gray-50 p-6 rounded-lg space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="M001"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Catégorie</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="EPI, Signalisation..."
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
              placeholder="Description complète de la mesure"
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

      <div>
        <input
          type="text"
          placeholder="Chercher par code ou description..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4"
        />

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 border border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left font-medium text-gray-700">Code</th>
                <th className="px-6 py-3 text-left font-medium text-gray-700">Catégorie</th>
                <th className="px-6 py-3 text-left font-medium text-gray-700">Description</th>
                <th className="px-6 py-3 text-left font-medium text-gray-700">Statut</th>
              </tr>
            </thead>
            <tbody>
              {filteredMeasures.map((measure) => (
                <tr key={measure.id} className="border-t border-gray-200 hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{measure.code}</td>
                  <td className="px-6 py-3 text-gray-700 text-xs">{measure.category || '-'}</td>
                  <td className="px-6 py-3 text-gray-600 text-sm">{measure.description}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      measure.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {measure.active ? 'Actif' : 'Inactif'}
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

import { useState, useEffect } from 'react'
import { listScopeRules, createScopeRule, addScopeRuleValue, removeScopeRuleValue } from '@/lib/admin-service'

interface ScopeRule {
  id: string
  name: string
  description?: string
  active: boolean
  pp_command_scope_rule_values?: Array<{ id: string; value: string }>
}

export default function AdminScopeRules() {
  const [rules, setRules] = useState<ScopeRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [expandedRule, setExpandedRule] = useState<string | null>(null)
  const [newValue, setNewValue] = useState<{ [key: string]: string }>({})

  useEffect(() => {
    loadRules()
  }, [])

  const loadRules = async () => {
    try {
      setLoading(true)
      const data = await listScopeRules()
      setRules(data)
    } catch (err) {
      setError('Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!name) {
      setError('Nom requis')
      return
    }

    try {
      await createScopeRule(name, description)
      setSuccess('Règle créée')
      setName('')
      setDescription('')
      setShowForm(false)
      loadRules()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  const handleAddValue = async (ruleId: string) => {
    const value = newValue[ruleId]
    if (!value) {
      setError('Valeur requise')
      return
    }

    try {
      setError('')
      await addScopeRuleValue(ruleId, value)
      setSuccess('Valeur ajoutée')
      setNewValue({ ...newValue, [ruleId]: '' })
      loadRules()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  const handleRemoveValue = async (valueId: string) => {
    if (!confirm('Supprimer cette valeur?')) return

    try {
      setError('')
      await removeScopeRuleValue(valueId)
      setSuccess('Valeur supprimée')
      loadRules()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  if (loading) return <div className="text-center py-8">Chargement...</div>

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Gestion des règles de périmètre</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium text-sm"
        >
          + Ajouter règle
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
        <form onSubmit={handleCreateRule} className="bg-gray-50 p-6 rounded-lg space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Nom</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Budget Actif"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
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

      <div className="space-y-4">
        {rules.map((rule) => (
          <div key={rule.id} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpandedRule(expandedRule === rule.id ? null : rule.id)}
              className="w-full bg-gray-50 p-4 text-left hover:bg-gray-100 flex justify-between items-center"
            >
              <div>
                <h3 className="font-bold text-gray-900">{rule.name}</h3>
                <p className="text-sm text-gray-600">{rule.description || '-'}</p>
              </div>
              <span className={`text-xl transform transition ${expandedRule === rule.id ? 'rotate-180' : ''}`}>
                ▼
              </span>
            </button>

            {expandedRule === rule.id && (
              <div className="p-4 bg-white border-t border-gray-200 space-y-4">
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Valeurs acceptées</h4>
                  <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                    {rule.pp_command_scope_rule_values?.map((val) => (
                      <div key={val.id} className="flex justify-between items-center bg-gray-50 p-3 rounded">
                        <span className="text-gray-900 font-medium">{val.value}</span>
                        <button
                          onClick={() => handleRemoveValue(val.id)}
                          className="text-red-600 hover:text-red-800 text-sm font-medium"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newValue[rule.id] || ''}
                      onChange={(e) => setNewValue({ ...newValue, [rule.id]: e.target.value })}
                      placeholder="Ajouter une valeur (ex: GT, GE, CP)"
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <button
                      onClick={() => handleAddValue(rule.id)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

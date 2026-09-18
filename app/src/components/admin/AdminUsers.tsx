import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { createUser, updateUserRole, deleteUser } from '@/lib/admin-service'

interface User {
  id: string
  email?: string
  user_metadata?: { role?: string; operator_code?: string }
  created_at?: string
}

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('CHARGE_OPERATIONS')
  const [operatorCode, setOperatorCode] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => { loadUsers() }, [])

  const loadUsers = async () => {
    try {
      setLoading(true)
      const { data } = await supabase.auth.admin.listUsers()
      setUsers(data?.users || [])
    } catch {
      setError('Erreur lors du chargement des utilisateurs')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setSuccess('')
    if (!email || !password) { setError('Email et mot de passe requis'); return }
    try {
      await createUser(email, password, role, operatorCode || undefined)
      setSuccess('Utilisateur créé avec succès')
      setEmail(''); setPassword(''); setRole('CHARGE_OPERATIONS'); setOperatorCode('')
      setShowForm(false)
      loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création')
    }
  }

  const handleChangeRole = async (userId: string, newRole: string, currentCode: string | undefined) => {
    try {
      await updateUserRole(userId, newRole, currentCode)
      setSuccess('Rôle mis à jour')
      loadUsers()
    } catch {
      setError('Erreur lors de la mise à jour')
    }
  }

  const handleChangeOperatorCode = async (userId: string, role: string, newCode: string) => {
    try {
      await updateUserRole(userId, role, newCode)
      setSuccess('Code opérateur mis à jour')
      loadUsers()
    } catch {
      setError('Erreur lors de la mise à jour')
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Êtes-vous sûr?')) return
    try {
      await deleteUser(userId)
      setSuccess('Utilisateur supprimé')
      loadUsers()
    } catch {
      setError('Erreur lors de la suppression')
    }
  }

  if (loading) return <div className="text-center py-8 text-gray-500">Chargement...</div>

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-900">Gestion des utilisateurs</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
        >
          + Ajouter
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 text-sm">{success}</div>}

      {showForm && (
        <form onSubmit={handleCreateUser} className="bg-gray-50 border border-gray-200 p-5 rounded-xl space-y-4">
          <h3 className="font-semibold text-gray-700 text-sm">Nouvel utilisateur</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="user@example.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Mot de passe</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="••••••••" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Rôle</label>
              <select value={role} onChange={e => setRole(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                <option value="CHARGE_OPERATIONS">Chargé d'opération</option>
                <option value="RESPONSABLE">Responsable</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Code opérateur <span className="text-gray-400">(UTIC_CODE, ex: CKO)</span>
              </label>
              <input type="text" value={operatorCode} onChange={e => setOperatorCode(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                placeholder="CKO" maxLength={10} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium text-sm">
              Créer
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="flex-1 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 font-medium text-sm">
              Annuler
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Email</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Rôle</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Code opérateur</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Créé</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 text-gray-800 font-medium">{u.email}</td>
                <td className="px-5 py-3">
                  <select
                    value={u.user_metadata?.role || 'CHARGE_OPERATIONS'}
                    onChange={e => handleChangeRole(u.id, e.target.value, u.user_metadata?.operator_code)}
                    className="px-2 py-1 border border-gray-300 rounded text-sm bg-white"
                  >
                    <option value="CHARGE_OPERATIONS">Chargé d'opération</option>
                    <option value="RESPONSABLE">Responsable</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                  </select>
                </td>
                <td className="px-5 py-3">
                  <input
                    type="text"
                    defaultValue={u.user_metadata?.operator_code || ''}
                    onBlur={e => {
                      const v = e.target.value.toUpperCase().trim()
                      if (v !== (u.user_metadata?.operator_code || '')) {
                        handleChangeOperatorCode(u.id, u.user_metadata?.role || 'CHARGE_OPERATIONS', v)
                      }
                    }}
                    className="w-24 px-2 py-1 border border-gray-300 rounded text-sm font-mono"
                    placeholder="CKO"
                    maxLength={10}
                  />
                </td>
                <td className="px-5 py-3 text-xs text-gray-500">
                  {u.created_at ? new Date(u.created_at).toLocaleDateString('fr-FR') : '-'}
                </td>
                <td className="px-5 py-3">
                  <button onClick={() => handleDeleteUser(u.id)}
                    className="text-red-500 hover:text-red-700 text-sm font-medium">
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

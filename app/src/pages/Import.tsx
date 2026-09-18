import { useState } from 'react'
import { parseOrdersFile, parseTrackingFile, validateOrders, detectDuplicates } from '@/lib/excel-parser'
import { importOrders } from '@/lib/import-service'
import { useAuth } from '@/context/AuthContext'

export default function Import() {
  const { user } = useAuth()
  const [ordersFile, setOrdersFile] = useState<File | null>(null)
  const [trackingFile, setTrackingFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const handleImport = async () => {
    if (!ordersFile || !trackingFile) {
      setError('Veuillez sélectionner les deux fichiers Excel')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      // Parse files
      const orders = await parseOrdersFile(ordersFile)
      const tracking = await parseTrackingFile(trackingFile)

      // Validate
      const { valid, errors: validationErrors } = validateOrders(orders)
      if (validationErrors.length > 0) {
        setError(`Validation errors: ${validationErrors.join(', ')}`)
        setLoading(false)
        return
      }

      // Detect duplicates
      const { unique, duplicates } = detectDuplicates(valid)
      if (duplicates.length > 0) {
        setError(`Found ${duplicates.length} duplicate orders: ${duplicates.slice(0, 5).join(', ')}...`)
        setLoading(false)
        return
      }

      // Import
      const importResult = await importOrders(unique, tracking)

      setResult({
        ...importResult,
        totalOrders: unique.length,
        matchedOrders: unique.length - importResult.qualifyingOrders.length,
      })
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-8">
        <h1 className="text-3xl font-bold mb-6">Importation de Commandes</h1>

        <div className="space-y-6">
          {/* File uploads */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fichier de Commandes (ANM_COMD_TRAV_ER.xlsx)
              </label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setOrdersFile(e.target.files?.[0] || null)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
              {ordersFile && <p className="text-sm text-green-600 mt-1">✓ {ordersFile.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fichier de Suivi Budget (ANM_SUIVTRXSECT.xlsx)
              </label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setTrackingFile(e.target.files?.[0] || null)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
              {trackingFile && <p className="text-sm text-green-600 mt-1">✓ {trackingFile.name}</p>}
            </div>
          </div>

          {/* Import button */}
          <button
            onClick={handleImport}
            disabled={!ordersFile || !trackingFile || loading}
            className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Importation en cours...' : 'Lancer l\'importation'}
          </button>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              <p className="font-medium">Erreur</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h2 className="text-lg font-bold text-blue-900 mb-4">Résultats d'importation</h2>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white p-4 rounded border-l-4 border-blue-500">
                  <p className="text-sm text-gray-600">Importées</p>
                  <p className="text-2xl font-bold text-blue-600">{result.imported}</p>
                </div>

                <div className="bg-white p-4 rounded border-l-4 border-yellow-500">
                  <p className="text-sm text-gray-600">À qualifier</p>
                  <p className="text-2xl font-bold text-yellow-600">{result.qualifyingOrders.length}</p>
                </div>

                <div className="bg-white p-4 rounded border-l-4 border-green-500">
                  <p className="text-sm text-gray-600">Reconciliées</p>
                  <p className="text-2xl font-bold text-green-600">
                    {result.imported - result.qualifyingOrders.length}
                  </p>
                </div>

                <div className="bg-white p-4 rounded border-l-4 border-gray-400">
                  <p className="text-sm text-gray-600">Doublons</p>
                  <p className="text-2xl font-bold text-gray-600">{result.skipped}</p>
                </div>
              </div>

              {result.qualifyingOrders.length > 0 && (
                <div className="bg-white p-4 rounded">
                  <p className="text-sm font-medium text-gray-700 mb-2">À qualifier ({result.qualifyingOrders.length})</p>
                  <ul className="text-xs text-gray-600 space-y-1 max-h-40 overflow-y-auto">
                    {result.qualifyingOrders.slice(0, 20).map((order: string) => (
                      <li key={order}>• {order}</li>
                    ))}
                    {result.qualifyingOrders.length > 20 && <li>... et {result.qualifyingOrders.length - 20} autres</li>}
                  </ul>
                </div>
              )}

              {result.errors.length > 0 && (
                <div className="bg-red-50 p-4 rounded mt-4">
                  <p className="text-sm font-medium text-red-700 mb-2">Erreurs</p>
                  <ul className="text-xs text-red-600 space-y-1">
                    {result.errors.slice(0, 5).map((err: string, i: number) => (
                      <li key={i}>• {err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

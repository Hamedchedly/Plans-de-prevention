import { useState, useRef, useCallback } from 'react'
import { parseOrdersFile, parseTrackingFile, validateOrders, detectDuplicates, OrderRow, TrackingRow } from '@/lib/excel-parser'
import { importOrders } from '@/lib/import-service'

type Step = 'upload' | 'preview' | 'importing' | 'done'

interface FileState {
  file: File | null
  parsed: boolean
  count: number
  error: string | null
}

interface PreviewData {
  orders: OrderRow[]
  tracking: TrackingRow[]
  matched: number
  toQualify: number
  byBudgetNature: Record<string, number>
  bySector: Record<string, number>
}

function DropZone({ label, hint, fileState, onFile, accept }: {
  label: string
  hint: string
  fileState: FileState
  onFile: (f: File) => void
  accept: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }, [onFile])

  const statusColor = fileState.error ? 'border-red-400 bg-red-50' :
    fileState.parsed ? 'border-green-400 bg-green-50' :
    dragging ? 'border-blue-400 bg-blue-50' :
    'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50'

  return (
    <div
      className={`relative border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all ${statusColor}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }}
      />
      <div className="flex flex-col items-center text-center space-y-3">
        {fileState.parsed ? (
          <>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-green-700">{fileState.file?.name}</p>
              <p className="text-sm text-green-600">{fileState.count} lignes détectées</p>
            </div>
            <p className="text-xs text-gray-500">Cliquer pour changer de fichier</p>
          </>
        ) : fileState.error ? (
          <>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-red-700">Erreur de lecture</p>
              <p className="text-sm text-red-600">{fileState.error}</p>
            </div>
          </>
        ) : (
          <>
            <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-gray-700">{label}</p>
              <p className="text-sm text-gray-500">{hint}</p>
            </div>
            <p className="text-xs text-gray-400">Glisser-déposer ou cliquer pour sélectionner</p>
          </>
        )}
      </div>
    </div>
  )
}

function StatCard({ value, label, color }: { value: number | string, label: string, color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
    red: 'bg-red-50 border-red-200 text-red-700',
  }
  return (
    <div className={`border rounded-xl p-4 ${colors[color] || colors.gray}`}>
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-sm mt-1 font-medium opacity-80">{label}</p>
    </div>
  )
}

export default function Import() {
  const [step, setStep] = useState<Step>('upload')
  const [ordersState, setOrdersState] = useState<FileState>({ file: null, parsed: false, count: 0, error: null })
  const [trackingState, setTrackingState] = useState<FileState>({ file: null, parsed: false, count: 0, error: null })
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [importProgress, setImportProgress] = useState(0)
  const [importResult, setImportResult] = useState<any>(null)
  const [globalError, setGlobalError] = useState<string | null>(null)

  const parsedOrders = useRef<OrderRow[]>([])
  const parsedTracking = useRef<TrackingRow[]>([])

  const handleOrdersFile = async (file: File) => {
    setOrdersState({ file, parsed: false, count: 0, error: null })
    try {
      const rows = await parseOrdersFile(file)
      parsedOrders.current = rows
      setOrdersState({ file, parsed: true, count: rows.length, error: null })
    } catch (e) {
      setOrdersState({ file, parsed: false, count: 0, error: String(e) })
    }
  }

  const handleTrackingFile = async (file: File) => {
    setTrackingState({ file, parsed: false, count: 0, error: null })
    try {
      const rows = await parseTrackingFile(file)
      parsedTracking.current = rows
      setTrackingState({ file, parsed: true, count: rows.length, error: null })
    } catch (e) {
      setTrackingState({ file, parsed: false, count: 0, error: String(e) })
    }
  }

  const handleAnalyze = () => {
    const orders = parsedOrders.current
    const tracking = parsedTracking.current

    const trackingNums = new Set(tracking.map(t => t.order_number))
    const matched = orders.filter(o => trackingNums.has(o.order_number)).length
    const toQualify = orders.length - matched

    const byBudgetNature: Record<string, number> = {}
    orders.forEach(o => {
      const n = o.budget_nature || 'N/A'
      byBudgetNature[n] = (byBudgetNature[n] || 0) + 1
    })

    const bySector: Record<string, number> = {}

    setPreview({ orders, tracking, matched, toQualify, byBudgetNature, bySector })
    setStep('preview')
  }

  const handleImport = async () => {
    setStep('importing')
    setGlobalError(null)
    setImportProgress(0)

    try {
      const { valid } = validateOrders(parsedOrders.current)
      const { unique } = detectDuplicates(valid)

      // Simulate progress steps
      const progressInterval = setInterval(() => {
        setImportProgress(p => Math.min(p + 2, 90))
      }, 200)

      const result = await importOrders(unique, parsedTracking.current)

      clearInterval(progressInterval)
      setImportProgress(100)

      setImportResult({
        ...result,
        total: unique.length,
      })
      setStep('done')
    } catch (e) {
      setGlobalError(String(e))
      setStep('preview')
    }
  }

  const handleReset = () => {
    setStep('upload')
    setOrdersState({ file: null, parsed: false, count: 0, error: null })
    setTrackingState({ file: null, parsed: false, count: 0, error: null })
    setPreview(null)
    setImportResult(null)
    setImportProgress(0)
    setGlobalError(null)
    parsedOrders.current = []
    parsedTracking.current = []
  }

  const canAnalyze = ordersState.parsed && trackingState.parsed

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-5">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900">Importation de Commandes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Importez les fichiers Excel pour synchroniser les commandes et le suivi budgétaire
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="bg-white border-b border-gray-100 px-8 py-4">
        <div className="max-w-4xl mx-auto flex items-center space-x-2">
          {(['upload', 'preview', 'done'] as const).map((s, i) => {
            const labels = { upload: 'Fichiers', preview: 'Aperçu', done: 'Résultats' }
            const isActive = step === s || (step === 'importing' && s === 'preview')
            const isDone = (step === 'preview' && i === 0) ||
              (step === 'importing' && i <= 1) ||
              (step === 'done' && i < 2)
            return (
              <div key={s} className="flex items-center">
                {i > 0 && <div className={`w-12 h-px mx-2 ${isDone ? 'bg-blue-500' : 'bg-gray-200'}`} />}
                <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-100 text-blue-700' :
                  isDone ? 'text-green-600' :
                  'text-gray-400'
                }`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                    isDone ? 'bg-green-500 text-white' :
                    isActive ? 'bg-blue-500 text-white' :
                    'bg-gray-200 text-gray-500'
                  }`}>
                    {isDone ? '✓' : i + 1}
                  </span>
                  <span>{labels[s]}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-8 py-8">
        {globalError && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3">
            <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-semibold text-red-700">Erreur d'importation</p>
              <p className="text-sm text-red-600 mt-1">{globalError}</p>
            </div>
          </div>
        )}

        {/* STEP 1: Upload */}
        {step === 'upload' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Commandes <span className="text-gray-400 font-normal">(ANM_COMD_TRAV_ER.xlsx)</span>
                </label>
                <DropZone
                  label="Fichier de commandes"
                  hint="ANM_COMD_TRAV_ER_*.xlsx"
                  fileState={ordersState}
                  onFile={handleOrdersFile}
                  accept=".xlsx,.xls"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Suivi Budget <span className="text-gray-400 font-normal">(ANM_SUIVTRXSECT.xlsx)</span>
                </label>
                <DropZone
                  label="Fichier de suivi budget"
                  hint="ANM_SUIVTRXSECT_*.xlsx"
                  fileState={trackingState}
                  onFile={handleTrackingFile}
                  accept=".xlsx,.xls"
                />
              </div>
            </div>

            {canAnalyze && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-blue-700 font-medium">
                    {ordersState.count} commandes + {trackingState.count} lignes de suivi prêtes à analyser
                  </span>
                </div>
                <button
                  onClick={handleAnalyze}
                  className="bg-blue-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors text-sm"
                >
                  Analyser →
                </button>
              </div>
            )}

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Format attendu</p>
              <div className="grid grid-cols-2 gap-4 text-xs text-gray-600">
                <div>
                  <p className="font-medium text-gray-700 mb-1">Commandes</p>
                  <p>Colonnes: COMN_NUM, COMD_DATE, WNATURE, ENTN_NUM, UTIC_CODE, NAAC_CODE, COMN_MT_DEVIS…</p>
                </div>
                <div>
                  <p className="font-medium text-gray-700 mb-1">Suivi Budget</p>
                  <p>Colonnes: COMN_NUM, STSC_CORPSETAT, NAAC_CODE…</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Preview */}
        {(step === 'preview' || step === 'importing') && preview && (
          <div className="space-y-6">
            {/* Summary stats */}
            <div className="grid grid-cols-4 gap-4">
              <StatCard value={preview.orders.length} label="Commandes à importer" color="blue" />
              <StatCard value={preview.matched} label="Réconciliées automatiquement" color="green" />
              <StatCard value={preview.toQualify} label="À qualifier manuellement" color="yellow" />
              <StatCard value={preview.tracking.length} label="Lignes suivi budget" color="purple" />
            </div>

            {/* Budget nature breakdown */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                Répartition par nature budgétaire
              </h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(preview.byBudgetNature)
                  .sort((a, b) => b[1] - a[1])
                  .map(([nature, count]) => (
                  <div key={nature} className="flex items-center space-x-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
                    <span className="font-mono text-sm font-bold text-gray-700">{nature}</span>
                    <span className="text-sm text-gray-500">{count} cmd</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sample orders table */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  Aperçu des commandes
                </h3>
                <span className="text-xs text-gray-400">10 premières lignes</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">N° Commande</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Date</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Entreprise</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Chargé Op.</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Nature</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Montant TTC</th>
                      <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500">Suivi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.orders.slice(0, 10).map((order) => {
                      const hasTracking = new Set(preview.tracking.map(t => t.order_number)).has(order.order_number)
                      return (
                        <tr key={order.order_number} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-mono text-xs font-semibold text-gray-700">{order.order_number}</td>
                          <td className="px-4 py-2 text-xs text-gray-600">{order.order_date}</td>
                          <td className="px-4 py-2 text-xs text-gray-600">{order.company_id}</td>
                          <td className="px-4 py-2 text-xs font-mono text-gray-600">{order.owner_user_id}</td>
                          <td className="px-4 py-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                              {order.budget_nature}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-xs text-gray-700 font-medium">
                            {order.amount_ttc.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                          </td>
                          <td className="px-4 py-2 text-center">
                            {hasTracking ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">✓ Réconcilié</span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">À qualifier</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {preview.orders.length > 10 && (
                <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 text-center">
                  ... et {preview.orders.length - 10} autres commandes
                </div>
              )}
            </div>

            {/* Action buttons */}
            {step === 'preview' && (
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStep('upload')}
                  className="text-sm text-gray-500 hover:text-gray-700 flex items-center space-x-1"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span>Changer les fichiers</span>
                </button>
                <button
                  onClick={handleImport}
                  className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center space-x-2"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 11l3 3m0 0l3-3m-3 3V8" />
                  </svg>
                  <span>Lancer l'importation ({preview.orders.length} commandes)</span>
                </button>
              </div>
            )}

            {/* Import progress */}
            {step === 'importing' && (
              <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
                <div className="mb-4">
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${importProgress}%` }}
                    />
                  </div>
                </div>
                <p className="text-sm font-medium text-gray-700">
                  Importation en cours... {importProgress}%
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Traitement de {preview.orders.length} commandes, veuillez patienter
                </p>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Done */}
        {step === 'done' && importResult && (
          <div className="space-y-6">
            <div className="bg-white border border-green-200 rounded-xl p-6 flex items-center space-x-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Importation terminée</h2>
                <p className="text-sm text-gray-500">{importResult.total} commandes traitées avec succès</p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <StatCard value={importResult.imported} label="Importées / mises à jour" color="blue" />
              <StatCard value={importResult.imported - importResult.qualifyingOrders.length} label="Réconciliées automatiquement" color="green" />
              <StatCard value={importResult.qualifyingOrders.length} label="À qualifier manuellement" color="yellow" />
              <StatCard value={importResult.errors.length} label="Erreurs" color={importResult.errors.length > 0 ? 'red' : 'gray'} />
            </div>

            {importResult.qualifyingOrders.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-yellow-800 mb-3 flex items-center space-x-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>Commandes à qualifier ({importResult.qualifyingOrders.length})</span>
                </h3>
                <div className="max-h-40 overflow-y-auto">
                  <div className="flex flex-wrap gap-1.5">
                    {importResult.qualifyingOrders.map((num: string) => (
                      <span key={num} className="font-mono text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded border border-yellow-200">
                        {num}
                      </span>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-yellow-700 mt-3">
                  Rendez-vous sur la page <strong>Qualification</strong> pour assigner manuellement les corps d'état.
                </p>
              </div>
            )}

            {importResult.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-red-800 mb-3">
                  Erreurs ({importResult.errors.length})
                </h3>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {importResult.errors.map((err: string, i: number) => (
                    <p key={i} className="text-xs text-red-700 font-mono">{err}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                onClick={handleReset}
                className="text-sm text-gray-500 hover:text-gray-700 flex items-center space-x-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Nouvelle importation</span>
              </button>
              <a
                href="/qualification"
                className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors text-sm"
              >
                Aller à la Qualification →
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

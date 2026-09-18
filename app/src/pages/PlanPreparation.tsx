import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

interface Order {
  id: string
  order_number: string
  work_nature: string
  company_id: string
  owner_user_id: string
  amount_ttc: number
}

interface Risk {
  id: string
  code: string
  name: string
}

interface Measure {
  id: string
  code: string
  name: string
}

interface Company {
  id: string
  name: string
  address: string
}

interface PlanData {
  order: Order
  company: Company | null
  selectedRisks: Risk[]
  selectedMeasures: Measure[]
}

export default function PlanPreparation() {
  const { user } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [allRisks, setAllRisks] = useState<Risk[]>([])
  const [allMeasures, setAllMeasures] = useState<Measure[]>([])
  const [currentPlan, setCurrentPlan] = useState<PlanData | null>(null)
  const [selectedRisks, setSelectedRisks] = useState<string[]>([])
  const [selectedMeasures, setSelectedMeasures] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      // Get orders that are qualified
      const { data: ordersData } = await supabase
        .from('pp_orders')
        .select('id, order_number, work_nature, company_id, owner_user_id, amount_ttc')
        .eq('qualification_status', 'QUALIFIED')
        .limit(20)

      // Get risks and measures
      const { data: risksData } = await supabase
        .from('pp_risk_catalog')
        .select('id, code, name')
        .eq('active', true)

      const { data: measuresData } = await supabase
        .from('pp_measure_catalog')
        .select('id, code, name')
        .eq('active', true)

      setOrders(ordersData || [])
      setAllRisks(risksData || [])
      setAllMeasures(measuresData || [])
    } catch (e) {
      console.error('Error loading data:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectOrder = async (order: Order) => {
    const { data: company } = await supabase
      .from('pp_companies')
      .select('id, name, address')
      .eq('code_isis', order.company_id)
      .single()

    setCurrentPlan({ order, company, selectedRisks: [], selectedMeasures: [] })
    setSelectedRisks([])
    setSelectedMeasures([])
  }

  const handleRiskToggle = (riskId: string) => {
    setSelectedRisks(prev =>
      prev.includes(riskId) ? prev.filter(id => id !== riskId) : [...prev, riskId]
    )
  }

  const handleMeasureToggle = (measureId: string) => {
    setSelectedMeasures(prev =>
      prev.includes(measureId) ? prev.filter(id => id !== measureId) : [...prev, measureId]
    )
  }

  const generatePDF = async () => {
    if (!currentPlan) return

    setGenerating(true)
    try {
      // Get selected risks and measures data
      const selectedRisksData = allRisks.filter(r => selectedRisks.includes(r.id))
      const selectedMeasuresData = allMeasures.filter(m => selectedMeasures.includes(m.id))

      // Create PDF
      const doc = new jsPDF()
      let yPosition = 20

      // Header
      doc.setFontSize(20)
      doc.text('PLAN DE PRÉVENTION', 20, yPosition)
      yPosition += 15

      // Order info
      doc.setFontSize(12)
      doc.text(`Commande: ${currentPlan.order.order_number}`, 20, yPosition)
      yPosition += 7
      doc.text(`Nature des travaux: ${currentPlan.order.work_nature}`, 20, yPosition)
      yPosition += 7
      doc.text(`Montant: ${currentPlan.order.amount_ttc.toLocaleString('fr-FR')} €`, 20, yPosition)
      yPosition += 7

      if (currentPlan.company) {
        doc.text(`Entreprise: ${currentPlan.company.name}`, 20, yPosition)
        yPosition += 7
        doc.text(`Adresse: ${currentPlan.company.address}`, 20, yPosition)
        yPosition += 7
      }

      // Risques section
      yPosition += 5
      doc.setFontSize(14)
      doc.text('RISQUES IDENTIFIÉS', 20, yPosition)
      yPosition += 8

      doc.setFontSize(11)
      if (selectedRisksData.length > 0) {
        selectedRisksData.forEach((risk, index) => {
          if (yPosition > 270) {
            doc.addPage()
            yPosition = 20
          }
          doc.text(`${index + 1}. [${risk.code}] ${risk.name}`, 25, yPosition)
          yPosition += 6
        })
      } else {
        doc.text('Aucun risque sélectionné', 25, yPosition)
        yPosition += 6
      }

      // Mesures section
      yPosition += 5
      doc.setFontSize(14)
      doc.text('MESURES DE PRÉVENTION', 20, yPosition)
      yPosition += 8

      doc.setFontSize(11)
      if (selectedMeasuresData.length > 0) {
        selectedMeasuresData.forEach((measure, index) => {
          if (yPosition > 270) {
            doc.addPage()
            yPosition = 20
          }
          doc.text(`${index + 1}. [${measure.code}] ${measure.name}`, 25, yPosition)
          yPosition += 6
        })
      } else {
        doc.text('Aucune mesure sélectionnée', 25, yPosition)
        yPosition += 6
      }

      // Save PDF
      doc.save(`plan-prevention-${currentPlan.order.order_number}.pdf`)

      // Save to database
      const { error } = await supabase
        .from('pp_prevention_plans')
        .upsert({
          order_id: currentPlan.order.id,
          status: 'DRAFT',
          drafted_by: user?.id,
          created_at: new Date().toISOString()
        })

      if (!error) {
        alert('Plan de prévention créé et exporté avec succès!')
        loadData()
        setCurrentPlan(null)
        setSelectedRisks([])
        setSelectedMeasures([])
      }
    } catch (e) {
      console.error('Error generating PDF:', e)
      alert('Erreur lors de la génération du PDF')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">Chargement...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Préparation du Plan de Prévention</h1>

        <div className="grid grid-cols-3 gap-6">
          {/* Orders list */}
          <div className="bg-white rounded-lg shadow p-6 col-span-1">
            <h2 className="text-lg font-bold mb-4 text-gray-900">Commandes Qualifiées</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {orders.length === 0 ? (
                <p className="text-gray-500 text-sm">Aucune commande qualifiée</p>
              ) : (
                orders.map(order => (
                  <button
                    key={order.id}
                    onClick={() => handleSelectOrder(order)}
                    className={`w-full text-left p-3 rounded border transition-colors ${
                      currentPlan?.order.id === order.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-medium text-sm">{order.order_number}</div>
                    <div className="text-xs text-gray-600">{order.work_nature}</div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Plan details */}
          <div className="col-span-2 space-y-6">
            {currentPlan ? (
              <>
                {/* Order info */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-bold mb-4 text-gray-900">Détails de la Commande</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Numéro</p>
                      <p className="font-medium">{currentPlan.order.order_number}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Montant</p>
                      <p className="font-medium">{currentPlan.order.amount_ttc.toLocaleString('fr-FR')} €</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-gray-600">Nature des travaux</p>
                      <p className="font-medium">{currentPlan.order.work_nature}</p>
                    </div>
                    {currentPlan.company && (
                      <div className="col-span-2">
                        <p className="text-gray-600">Entreprise</p>
                        <p className="font-medium">{currentPlan.company.name}</p>
                        <p className="text-xs text-gray-500 mt-1">{currentPlan.company.address}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Risks selection */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-bold mb-4 text-gray-900">Risques Identifiés</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-3 bg-gray-50">
                    {allRisks.map(risk => (
                      <label key={risk.id} className="flex items-center p-2 hover:bg-blue-50 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedRisks.includes(risk.id)}
                          onChange={() => handleRiskToggle(risk.id)}
                          className="mr-3"
                        />
                        <span className="text-sm">
                          <span className="font-medium">[{risk.code}]</span> {risk.name}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {selectedRisks.length} risque(s) sélectionné(s)
                  </p>
                </div>

                {/* Measures selection */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-bold mb-4 text-gray-900">Mesures de Prévention</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-3 bg-gray-50">
                    {allMeasures.map(measure => (
                      <label key={measure.id} className="flex items-center p-2 hover:bg-green-50 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedMeasures.includes(measure.id)}
                          onChange={() => handleMeasureToggle(measure.id)}
                          className="mr-3"
                        />
                        <span className="text-sm">
                          <span className="font-medium">[{measure.code}]</span> {measure.name}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {selectedMeasures.length} mesure(s) sélectionnée(s)
                  </p>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={generatePDF}
                    disabled={generating || selectedRisks.length === 0 || selectedMeasures.length === 0}
                    className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400"
                  >
                    {generating ? 'Génération...' : '📄 Générer et Exporter PDF'}
                  </button>
                  <button
                    onClick={() => setCurrentPlan(null)}
                    className="flex-1 bg-gray-200 text-gray-800 px-6 py-3 rounded-lg font-medium hover:bg-gray-300"
                  >
                    Annuler
                  </button>
                </div>
              </>
            ) : (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center col-span-2">
                <p className="text-blue-800">Sélectionnez une commande pour commencer la préparation du plan</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

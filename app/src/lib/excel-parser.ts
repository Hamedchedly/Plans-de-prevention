import * as XLSX from 'xlsx'

export interface OrderRow {
  order_number: string
  order_date: string
  work_nature: string
  work_description: string
  company_id: string
  owner_user_id: string
  budget_nature: string
  intervention_code: string
  site_city_zip: string
  site_address: string
  amount_ttc: number
}

export interface TrackingRow {
  order_number: string
  trade_name: string
  budget_nature: string
}

export async function parseOrdersFile(file: File): Promise<OrderRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(sheet)

        const parsed: OrderRow[] = rows.map((row: any) => ({
          order_number: String(row.COMN_NUM || '').trim(),
          order_date: String(row.COMD_DATE || '').trim(),
          work_nature: String(row.WNATURE || '').trim(),
          work_description: String(row.WNOTES || '').trim(),
          company_id: String(row.ENTN_NUM || '').trim(),
          owner_user_id: String(row.UTIC_CODE || '').trim(),
          budget_nature: String(row.NAAC_CODE || '').trim(),
          intervention_code: String(row.INTC_CODE || '').trim(),
          site_city_zip: String(row.WCOMMUNE || '').trim(),
          site_address: String(row.WADRESSE || '').trim(),
          amount_ttc: parseFloat(String(row.COMN_MT_DEVIS || 0)),
        }))

        resolve(parsed.filter(r => r.order_number)) // Remove empty rows
      } catch (error) {
        reject(error)
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

export async function parseTrackingFile(file: File): Promise<TrackingRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(sheet)

        const parsed: TrackingRow[] = rows.map((row: any) => ({
          order_number: String(row.COMN_NUM || '').trim(),
          trade_name: String(row.CORPS_ETAT || '').trim(),
          budget_nature: String(row.NATURE_BUDGET || '').trim(),
        }))

        resolve(parsed.filter(r => r.order_number))
      } catch (error) {
        reject(error)
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

export function validateOrders(orders: OrderRow[]): { valid: OrderRow[], errors: string[] } {
  const errors: string[] = []
  const valid: OrderRow[] = []

  orders.forEach((order, index) => {
    if (!order.order_number) {
      errors.push(`Row ${index + 1}: Missing order number`)
      return
    }
    if (!order.company_id) {
      errors.push(`Row ${index + 1}: Missing company ID`)
      return
    }
    valid.push(order)
  })

  return { valid, errors }
}

export function detectDuplicates(orders: OrderRow[]): { unique: OrderRow[], duplicates: string[] } {
  const seen = new Set<string>()
  const duplicates: string[] = []
  const unique: OrderRow[] = []

  orders.forEach(order => {
    if (seen.has(order.order_number)) {
      duplicates.push(order.order_number)
    } else {
      seen.add(order.order_number)
      unique.push(order)
    }
  })

  return { unique, duplicates }
}

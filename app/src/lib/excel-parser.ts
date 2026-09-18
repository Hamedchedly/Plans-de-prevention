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

// Helper to get a column value regardless of suffix (handles COLNAME or COLNAME.SUFFIX)
function getCol(row: any, base: string): any {
  if (row[base] !== undefined) return row[base]
  const key = Object.keys(row).find(k => k === base || k.startsWith(base + '.'))
  return key ? row[key] : undefined
}

// Convert Excel date serial number to ISO string
function excelDateToISO(serial: any): string {
  if (!serial) return ''
  const num = Number(serial)
  if (isNaN(num) || num === 0) return String(serial)
  // Excel serial: days since 1900-01-01 (accounting for 1900 leap year bug)
  const date = new Date((num - 25569) * 86400 * 1000)
  return date.toISOString().split('T')[0]
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

        const parsed: OrderRow[] = rows.map((row: any) => {
          const orderNum = getCol(row, 'COMN_NUM')
          const orderDate = getCol(row, 'COMD_DATE')
          return {
            order_number: orderNum != null ? String(orderNum).trim() : '',
            order_date: excelDateToISO(orderDate),
            work_nature: String(getCol(row, 'WNATURE') || '').trim(),
            work_description: String(getCol(row, 'WNOTES') || '').trim(),
            company_id: String(getCol(row, 'ENTN_NUM') || '').trim(),
            owner_user_id: String(getCol(row, 'UTIC_CODE') || '').trim(),
            budget_nature: String(getCol(row, 'NAAC_CODE') || '').trim(),
            intervention_code: String(getCol(row, 'INTC_CODE') || '').trim(),
            site_city_zip: String(getCol(row, 'WCOMMUNE') || '').trim(),
            site_address: String(getCol(row, 'WNOM_ADRESSE') || getCol(row, 'WADRESSE') || '').trim(),
            amount_ttc: parseFloat(String(getCol(row, 'COMN_MT_DEVIS') || 0)) || 0,
          }
        })

        resolve(parsed.filter(r => r.order_number && r.order_number !== 'undefined'))
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

        const parsed: TrackingRow[] = rows.map((row: any) => {
          const orderNum = getCol(row, 'COMN_NUM')
          return {
            order_number: orderNum != null ? String(orderNum).trim() : '',
            trade_name: String(getCol(row, 'STSC_CORPSETAT') || getCol(row, 'CORPS_ETAT') || '').trim(),
            budget_nature: String(getCol(row, 'NAAC_CODE') || getCol(row, 'NATURE_BUDGET') || '').trim(),
          }
        })

        resolve(parsed.filter(r => r.order_number && r.order_number !== 'undefined'))
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

// Fiche « Plan de prévention » en PDF, dans la structure du modèle de référence (reference/sample-plan-prevention.pdf).
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

export interface PlanPdfData {
  orderNumber: string
  lotNames: string[]
  taskLabel: string
  activity: string
  zone: string
  companyLabel: string
  risks: string[]
  measures: { family: string; label: string }[]
  redactor: { name: string; email: string } | null
  date: string
}

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 40
const CONTENT_W = PAGE_W - 2 * MARGIN
const LABEL_W = 170

/** WinAnsi (Helvetica) : les caractères hors jeu de police deviennent « ? ». */
const clean = (s: string) => s.replace(/[^\x00-\xFFŒœ‘’“”–—€]/g, '?')

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let cur = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word
      if (font.widthOfTextAtSize(next, size) <= maxW) cur = next
      else { if (cur) out.push(cur); cur = word }
    }
    out.push(cur)
  }
  return out.length ? out : ['']
}

export async function buildPlanPdf(d: PlanPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const blue = rgb(0.1, 0.2, 0.5)
  const grey = rgb(0.75, 0.75, 0.75)

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - MARGIN
  const newPage = () => { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN }
  const ensure = (h: number) => { if (y - h < MARGIN) newPage() }

  const rule = () => page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_W, y }, thickness: 0.5, color: grey })

  // en-tête
  ensure(60)
  page.drawText('PLAN DE PRÉVENTION', { x: MARGIN, y: y - 16, size: 16, font: bold, color: blue })
  page.drawText(clean(`Commande n° ${d.orderNumber}`), { x: MARGIN, y: y - 34, size: 10, font })
  y -= 50
  rule()

  const row = (label: string, value: string) => {
    const lines = wrap(clean(value || '—'), font, 10, CONTENT_W - LABEL_W - 6)
    const h = lines.length * 13 + 8
    ensure(h)
    page.drawText(clean(label), { x: MARGIN, y: y - 12, size: 9, font: bold })
    lines.forEach((l, i) => page.drawText(l, { x: MARGIN + LABEL_W, y: y - 12 - i * 13, size: 10, font }))
    y -= h
    rule()
  }

  const section = (title: string) => {
    ensure(28)
    y -= 14
    page.drawText(clean(title), { x: MARGIN, y, size: 11, font: bold, color: blue })
    y -= 8
  }

  // cases cochées : deux colonnes
  const checklist = (items: string[], empty: string) => {
    if (!items.length) { ensure(16); page.drawText(empty, { x: MARGIN, y: y - 11, size: 9, font }); y -= 16; return }
    const colW = CONTENT_W / 2
    for (let i = 0; i < items.length; i += 2) {
      ensure(16)
      for (let c = 0; c < 2; c++) {
        const label = items[i + c]
        if (!label) continue
        const x = MARGIN + c * colW
        page.drawRectangle({ x, y: y - 10, width: 8, height: 8, borderColor: rgb(0.3, 0.3, 0.3), borderWidth: 0.7 })
        page.drawText('X', { x: x + 1.5, y: y - 8.5, size: 7, font: bold })
        const lines = wrap(clean(label), font, 9, colW - 16)
        lines.slice(0, 2).forEach((l, k) => page.drawText(l, { x: x + 13, y: y - 9 - k * 11, size: 9, font }))
      }
      y -= 22
    }
  }

  y -= 6
  row('Lot travaux', d.lotNames.join(', ') || '—')
  row('Libellé de la tâche', d.taskLabel)
  row('Numéro de bon de commande', d.orderNumber)
  row('Entreprise', d.companyLabel)
  row('Nature de l’activité', d.activity)
  row('Zone concernée', d.zone)

  section('Procédure en cas d’accident / incident')
  row('Personne à alerter', 'Responsable d’intervention')
  row('Procédure d’alerte', '15 SAMU · 18 POMPIERS · 114 URGENCES · 17 POLICE SECOURS')

  section('Risques identifiés')
  checklist(d.risks, 'Aucun risque coché.')

  section('Mesures de prévention mises en place')
  const families = [...new Set(d.measures.map((m) => m.family))]
  if (!d.measures.length) checklist([], 'Aucune mesure cochée.')
  for (const f of families) {
    ensure(18)
    page.drawText(clean(f.toUpperCase()), { x: MARGIN, y: y - 10, size: 8, font: bold, color: blue })
    y -= 16
    checklist(d.measures.filter((m) => m.family === f).map((m) => m.label), '')
  }

  section('Validation de la fiche')
  row('Rédacteur de la fiche', d.redactor?.name ?? '—')
  row('Adresse mail', d.redactor?.email ?? '—')
  row('Date de rédaction', d.date)
  row('Signature de l’entreprise', ' ')

  return doc.save()
}

/** Nom de fichier : modèle administrable ({entreprise}, {commande}, {secteur}), caractères interdits retirés. */
export function planFileName(template: string, v: { entreprise: string; commande: string; secteur: string }): string {
  const base = template
    .split('{entreprise}').join(v.entreprise)
    .split('{commande}').join(v.commande)
    .split('{secteur}').join(v.secteur)
  const clean = base.replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)
  return `${clean || 'plan_de_prevention'}.pdf`
}

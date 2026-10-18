// Fiche « Plan de prévention » en PDF : mise en page du modèle xlsx, logo et couleurs du bailleur.
import { PDFDocument, StandardFonts, rgb, type Color, type PDFFont, type PDFPage } from 'pdf-lib'

export interface PlanPdfData {
  orderNumber: string
  orderDate: string                                   // dd/mm/yyyy, '' si inconnue
  lotNames: string[]
  taskLabel: string                                   // Nature Travaux
  activity: string
  zone: string
  period: string                                      // texte affiché (ou pointillés si l'entreprise renseigne)
  companyLabel: string
  riskOptions: { label: string; checked: boolean }[]  // tous les risques du référentiel, cochés selon la fiche
  measureOptions: { family: string; label: string; checked: boolean }[]
  redactor: { name: string; email: string; phone: string } | null
  alertLine?: string   // procédure d'alerte (modèle administrable)
  footer?: string      // pied de page (modèle administrable, {commande} remplacé)
}

export const DEFAULT_ALERT = '15 SAMU · 18 POMPIERS · 114 URGENCES · 17 POLICE SECOURS'
export const DEFAULT_FOOTER = 'Plan de prévention · commande {commande} · S11'

/** Période à compléter par l'entreprise. */
export const DOTTED_PERIOD = '...... / ...... / ............  au  ...... / ...... / ............'

const PAGE_W = 595.28
const PAGE_H = 841.89
// Marges réduites, selon la maquette validée
const MX = 23
const MT = 12
const MB = 12
const CW = PAGE_W - 2 * MX
const LOGO_H = 90
const FOOTER_H = 14
const CONTENT_BOTTOM = PAGE_H - MB - FOOTER_H

// Couleurs du logo
const RED = rgb(230 / 255, 9 / 255, 78 / 255)
const NAVY = rgb(20 / 255, 59 / 255, 104 / 255)
const LINE = rgb(185 / 255, 195 / 255, 208 / 255)
const TINT = rgb(241 / 255, 244 / 255, 248 / 255)
const INK = rgb(27 / 255, 35 / 255, 48 / 255)
const MUTED = rgb(122 / 255, 133 / 255, 148 / 255)

/** WinAnsi (Helvetica) : les caractères hors jeu de police deviennent « ? ». */
/** Remplace par « ? » les caractères hors Latin-1 que la police standard du PDF ne sait pas écrire. */
const clean = (s: string) => Array.from(s, (ch) => (ch.codePointAt(0) ?? 0) < 0x100 || '‘’“”–—€Œœ'.includes(ch) ? ch : '?').join('')

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

/** Logo du bailleur (PNG), chargé une seule fois par session. */
export async function loadBrandLogo(): Promise<Uint8Array | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}brand/plurial-novilia.png`)
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null
  } catch {
    return null
  }
}
let logoCache: Promise<Uint8Array | null> | null = null
export const brandLogo = () => (logoCache ??= loadBrandLogo())

/** Fiche sur une seule page : on resserre l'espacement par paliers tant que le contenu déborde. */
export async function buildPlanPdf(d: PlanPdfData, logo: Uint8Array | null = null): Promise<Uint8Array> {
  let last: Uint8Array | null = null
  for (const k of [1, 0.9, 0.8, 0.7]) {
    const r = await renderPlan(d, logo, k)
    last = r.bytes
    if (r.pages === 1) break
  }
  return last as Uint8Array
}

async function renderPlan(d: PlanPdfData, logo: Uint8Array | null, k: number): Promise<{ bytes: Uint8Array; pages: number }> {
  const LH = LOGO_H * k
  const fs = 0.6 + 0.4 * k            // taille du texte des cases à cocher
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const pages: PDFPage[] = []
  let page = doc.addPage([PAGE_W, PAGE_H])
  pages.push(page)
  let top = MT
  const newPage = () => { page = doc.addPage([PAGE_W, PAGE_H]); pages.push(page); top = MT }
  const ensure = (h: number) => { if (top + h > CONTENT_BOTTOM) newPage() }
  const yOf = (t: number) => PAGE_H - t

  const text = (s: string, x: number, baseline: number, size: number, f: PDFFont, color: Color = INK) =>
    page.drawText(clean(s), { x, y: yOf(baseline), size, font: f, color })
  const fillRect = (x: number, t: number, w: number, h: number, color: Color) =>
    page.drawRectangle({ x, y: yOf(t + h), width: w, height: h, color })
  const frame = (x: number, t: number, w: number, h: number) =>
    page.drawRectangle({ x, y: yOf(t + h), width: w, height: h, borderColor: LINE, borderWidth: 0.6 })
  const vline = (x: number, t: number, h: number) =>
    page.drawLine({ start: { x, y: yOf(t) }, end: { x, y: yOf(t + h) }, thickness: 0.6, color: LINE })

  // En-tête : logo à gauche, titre et référence de commande à droite
  if (logo) {
    try {
      const img = await doc.embedPng(logo)
      page.drawImage(img, { x: MX, y: yOf(MT + LH), width: (LH * img.width) / img.height, height: LH })
    } catch {
      text('Plurial Novilia', MX, MT + 20, 16, bold, RED)
    }
  } else {
    text('Plurial Novilia', MX, MT + 20, 16, bold, RED)
  }
  const title = 'PLAN DE PRÉVENTION'
  text(title, PAGE_W - MX - bold.widthOfTextAtSize(clean(title), 16), MT + LH - 20, 16, bold, NAVY)
  const sub = `relatif à la commande n° ${d.orderNumber}`
  text(sub, PAGE_W - MX - bold.widthOfTextAtSize(clean(sub), 8.5), MT + LH - 6, 8.5, bold, RED)
  const ruleT = MT + LH + 8
  page.drawLine({ start: { x: MX, y: yOf(ruleT) }, end: { x: PAGE_W - MX, y: yOf(ruleT) }, thickness: 1.6, color: RED })
  top = ruleT + 14 * k

  // Tableau à libellés sur une seule ligne
  type Inline = { label: string; value: string; flex?: number; strong?: boolean }
  const inlineRow = (cells: Inline[]) => {
    const total = cells.reduce((a, c) => a + (c.flex ?? 1), 0)
    const lineH = 11
    const measured = cells.map((c) => {
      const w = (CW * (c.flex ?? 1)) / total
      const lblW = bold.widthOfTextAtSize(clean(c.label), 7) + 12
      const f = c.strong ? bold : font
      const size = c.strong ? 10 : 9
      return { w, lblW, size, f, lines: wrap(clean(c.value || '—'), f, size, w - lblW - 12) }
    })
    const h = Math.max(22 * k, Math.max(...measured.map((m) => m.lines.length)) * lineH + 9 * k)
    ensure(h)
    let x = MX
    measured.forEach((m, i) => {
      fillRect(x, top, m.lblW, h, TINT)
      text(cells[i].label, x + 6, top + h / 2 + 2.5, 7, bold, NAVY)
      const first = top + (h - m.lines.length * lineH) / 2 + lineH - 2
      m.lines.forEach((l, k) => text(l, x + m.lblW + 6, first + k * lineH, m.size, m.f))
      if (i > 0) vline(x, top, h)
      x += m.w
    })
    frame(MX, top, CW, h)
    top += h
  }

  // Tableau à titres au-dessus du contenu
  type Block = { title: string; value: string; alert?: boolean; flex?: number }
  const blockRow = (cells: Block[]) => {
    const total = cells.reduce((a, c) => a + (c.flex ?? 1), 0)
    const measured = cells.map((c) => {
      const w = (CW * (c.flex ?? 1)) / total
      return { w, lines: wrap(clean(c.value || '—'), font, 8.8, w - 14) }
    })
    const h = Math.max(38 * k, 20 + Math.max(...measured.map((m) => m.lines.length)) * 11 + 4 * k)
    ensure(h)
    let x = MX
    measured.forEach((m, i) => {
      const c = cells[i]
      text(c.title, x + 7, top + 11, 7, bold, c.alert ? RED : NAVY)
      m.lines.forEach((l, k) => text(l, x + 7, top + 22 + k * 11, 8.8, font))
      if (i > 0) vline(x, top, h)
      x += m.w
    })
    frame(MX, top, CW, h)
    top += h
  }

  const gap = (g: number) => { top += g * k }
  const contact = d.redactor
    ? [d.redactor.name || 'Responsable d’intervention', [d.redactor.phone && `Tél. ${d.redactor.phone}`, d.redactor.email].filter(Boolean).join(' · ')].filter(Boolean).join('\n')
    : 'Responsable d’intervention'

  inlineRow([{ label: 'Nature Travaux', value: d.taskLabel, flex: 1, strong: true }])
  gap(7)
  inlineRow([
    { label: 'Lot', value: d.lotNames.join(', ') },
    { label: 'N° de bon de commande', value: d.orderNumber },
    { label: 'Date de la commande', value: d.orderDate },
  ])
  gap(7)
  inlineRow([
    { label: 'Nom de l’entreprise', value: d.companyLabel },
    { label: 'Période d’intervention', value: d.period, flex: 1.4 },
  ])
  gap(7)
  blockRow([
    { title: 'Nature de l’activité', value: d.activity },
    { title: 'Zone concernée', value: d.zone },
  ])
  gap(7)
  blockRow([
    { title: 'Personne à alerter', value: contact, alert: true },
    { title: 'Procédure d’alerte', value: d.alertLine || DEFAULT_ALERT, alert: true },
  ])

  // Cases à cocher
  const COLS = 4
  const CELL_W = CW / COLS
  const drawBox = (x: number, boxTop: number, checked: boolean) => {
    page.drawRectangle({ x, y: yOf(boxTop + 7.5), width: 7.5, height: 7.5, borderColor: NAVY, borderWidth: 0.7 })
    if (checked) {
      const p = (dx: number, dy: number) => ({ x: x + dx, y: yOf(boxTop + dy) })
      page.drawLine({ start: p(1.6, 4), end: p(3.2, 6.2), thickness: 1.3, color: RED })
      page.drawLine({ start: p(3.2, 6.2), end: p(6.2, 1.8), thickness: 1.3, color: RED })
    }
  }
  const sectionTitle = (title: string) => {
    ensure(30)
    gap(9)
    fillRect(MX, top + 1, 2.5, 11, RED)
    text(title, MX + 8, top + 10, 9.5, bold, NAVY)
    top += 17 * k
  }
  const familyHeader = (f: string) => {
    ensure(16)
    fillRect(MX, top, CW, 14 * k, TINT)
    frame(MX, top, CW, 14 * k)
    text(f.toUpperCase(), MX + 6, top + 10 * k + 0.5, 6.5, bold, NAVY)
    top += 14 * k
  }
  const checkGrid = (items: { label: string; checked: boolean }[]) => {
    for (let i = 0; i < items.length; i += COLS) {
      const chunk = items.slice(i, i + COLS)
      const lines = chunk.map((c) => wrap(clean(c.label), font, 7.6 * fs, CELL_W - 20))
      const lineH = 9.2 * fs
      const h = Math.max(17 * k, Math.max(...lines.map((l) => l.length)) * lineH + 6 * k)
      ensure(h)
      chunk.forEach((c, n) => {
        const x = MX + n * CELL_W
        frame(x, top, CELL_W, h)
        drawBox(x + 6, top + (h - 7.5) / 2, c.checked)
        const first = top + h / 2 - ((lines[n].length - 1) * lineH) / 2 + 2.6 * fs
        lines[n].forEach((l, j) => text(l, x + 17, first + j * lineH, 7.6 * fs, font))
      })
      top += h
    }
  }

  sectionTitle('Risques identifiés')
  checkGrid(d.riskOptions)

  sectionTitle('Mesures de prévention mises en place')
  for (const f of [...new Set(d.measureOptions.map((m) => m.family))]) {
    familyHeader(f)
    checkGrid(d.measureOptions.filter((m) => m.family === f))
  }

  // Bas de page à droite : nom de l'entreprise, puis « Signature » en gris clair
  const SIG_H = 70
  const sigTop = CONTENT_BOTTOM - SIG_H
  if (top + 8 > sigTop) newPage()
  const nameW = bold.widthOfTextAtSize(clean(d.companyLabel || ' '), 10)
  text(d.companyLabel, PAGE_W - MX - nameW, sigTop + 12, 10, bold, NAVY)
  const sigLabel = 'Signature'
  const sigW = font.widthOfTextAtSize(sigLabel, 8)
  text(sigLabel, PAGE_W - MX - sigW, sigTop + SIG_H - 2, 8, font, MUTED)

  // Pied de page
  pages.forEach((p, i) => {
    const base = (d.footer || DEFAULT_FOOTER).split('{commande}').join(d.orderNumber)
    const label = `${base}${pages.length > 1 ? ` · page ${i + 1}/${pages.length}` : ''}`
    p.drawText(clean(label), { x: MX, y: MB, size: 6.5, font, color: MUTED })
  })

  return { bytes: await doc.save(), pages: pages.length }
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

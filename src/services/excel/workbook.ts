import ExcelJS from 'exceljs'
import { formats, rules, newMapping } from '../../models/workspace'
import type { Payload, Workspace } from '../../models/workspace'
import { decodeText, encodeChunks, endings, splitLines } from './codec'
import { assertWorkspaceSize, MAX_ROWS, validateArchive } from './limits'
import { normalizeSupplementaryUnicode, prepareUnicodeForExport } from './unicode'

const SHEETS = ['Source Request', 'Target Request', 'Field Mapping', 'Analysis Notes'] as const
const WORKBOOK_NAME = 'MaptelaBridge'
const LINE_HEADER = ['Line', 'Part', 'Payload Text', 'Line Ending']
const MAPPING_HEADER = ['No', 'Source Field', 'Target Field', 'Transformation Rule', 'Required', 'Default Value', 'Description', 'Part']
const fail = (message: string): never => { throw new Error(`Invalid ${WORKBOOK_NAME} workbook: ${message}`) }
function text(cell: ExcelJS.Cell): string {
  if (cell.value === null || cell.value === undefined) return ''
  if (typeof cell.value !== 'string') return fail(`${cell.address} must contain plain text.`)
  return cell.value
}
function integer(cell: ExcelJS.Cell): number {
  if (typeof cell.value !== 'number' || !Number.isSafeInteger(cell.value) || cell.value < 1) return fail(`invalid sequence at ${cell.address}.`)
  return cell.value
}
function header(sheet: ExcelJS.Worksheet, row: number, values: string[]) {
  values.forEach((value, i) => { if (text(sheet.getCell(row, i + 1)) !== value) fail(`unexpected headers on ${sheet.name}.`) })
}
function styleHeader(row: ExcelJS.Row) {
  row.height = 24
  row.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF243343' } }
    cell.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.alignment = { vertical: 'middle' }
  })
}
function createSheet(book: ExcelJS.Workbook, name: string, kind: string) {
  const sheet = book.addWorksheet(name)
  sheet.addRow([WORKBOOK_NAME, '1', kind])
  sheet.getRow(1).font = { name: 'Calibri', bold: true, color: { argb: 'FF426433' } }
  return sheet
}
function writeMeta(sheet: ExcelJS.Worksheet, entries: [string, string][]) {
  for (const [label, value] of entries) encodeChunks(value).forEach((part, index) => sheet.addRow([label, part, index + 1]))
}
function readMeta(sheet: ExcelJS.Worksheet, labels: string[]): { values: string[]; next: number } {
  let row = 2
  const values = labels.map(label => {
    let part = 1
    const chunks: string[] = []
    while (row <= sheet.rowCount && text(sheet.getCell(row, 1)) === label) {
      if (integer(sheet.getCell(row, 3)) !== part++) fail(`metadata parts are out of order on ${sheet.name}.`)
      chunks.push(text(sheet.getCell(row++, 2)))
    }
    if (!chunks.length) fail(`missing ${label} on ${sheet.name}.`)
    return decodeText(chunks.join(''))
  })
  return { values, next: row }
}
function writeLines(sheet: ExcelJS.Worksheet, content: string, label = 'Payload Text') {
  const head = sheet.addRow(['Line', 'Part', label, 'Line Ending'])
  styleHeader(head)
  const start = head.number
  splitLines(content).forEach((line, index) => {
    const chunks = encodeChunks(line.text)
    chunks.forEach((chunk, part) => sheet.addRow([index + 1, part + 1, chunk, part === chunks.length - 1 ? line.ending : 'CONT']))
  })
  sheet.columns = [{ width: 9 }, { width: 9 }, { width: 110 }, { width: 16 }]
  sheet.getColumn(3).font = { name: 'Consolas', size: 10 }
  sheet.getColumn(3).numFmt = '@'
  sheet.views = [{ state: 'frozen', ySplit: start }]
}
function readLines(sheet: ExcelJS.Worksheet, start: number, label = 'Payload Text'): string {
  header(sheet, start, label === 'Payload Text' ? LINE_HEADER : ['Line', 'Part', label, 'Line Ending'])
  let line = 1, part = 1, finished = false
  const result: string[] = []
  for (let row = start + 1; row <= sheet.rowCount; row++) {
    if (finished || integer(sheet.getCell(row, 1)) !== line || integer(sheet.getCell(row, 2)) !== part) fail(`text parts are missing or out of order on ${sheet.name}.`)
    result.push(decodeText(text(sheet.getCell(row, 3))))
    const ending = text(sheet.getCell(row, 4))
    if (ending === 'CONT') { part++; continue }
    if (!Object.hasOwn(endings, ending)) fail(`unknown line ending on ${sheet.name}.`)
    result.push(endings[ending as keyof typeof endings])
    finished = ending === 'NONE'
    line++; part = 1
  }
  if (!finished) fail(`incomplete text on ${sheet.name}.`)
  return result.join('')
}
function writePayload(book: ExcelJS.Workbook, name: string, side: 'Source' | 'Target', workspace: Workspace) {
  const payload = side === 'Source' ? workspace.source : workspace.target
  const sheet = createSheet(book, name, side.toLowerCase())
  writeMeta(sheet, [['Integration Name', workspace.integrationName], [`${side} System`, payload.system], ['Payload Format', payload.format]])
  writeLines(sheet, payload.content)
}
function readPayload(sheet: ExcelJS.Worksheet, side: 'Source' | 'Target'): { name: string; payload: Payload } {
  const { values: [name, system, format], next } = readMeta(sheet, ['Integration Name', `${side} System`, 'Payload Format'])
  if (!formats.includes(format as Payload['format'])) fail(`unsupported ${side} payload format.`)
  return { name, payload: { system, format: format as Payload['format'], content: readLines(sheet, next) } }
}
export async function exportWorkbook(workspace: Workspace): Promise<ArrayBuffer> {
  assertWorkspaceSize(workspace)
  const book = new ExcelJS.Workbook()
  book.creator = WORKBOOK_NAME
  writePayload(book, SHEETS[0], 'Source', workspace)
  writePayload(book, SHEETS[1], 'Target', workspace)
  const mapping = createSheet(book, SHEETS[2], 'mapping')
  styleHeader(mapping.addRow(MAPPING_HEADER))
  workspace.mappings.forEach((item, index) => {
    const fields = [item.source, item.target, item.rule, item.required ? 'Yes' : 'No', item.defaultValue, item.description].map(encodeChunks)
    const parts = Math.max(...fields.map(field => field.length))
    for (let part = 0; part < parts; part++) mapping.addRow([index + 1, ...fields.map(field => field[part] ?? ''), part + 1])
  })
  mapping.columns = [8, 32, 32, 24, 12, 28, 80, 9].map(width => ({ width }))
  mapping.views = [{ state: 'frozen', ySplit: 2, xSplit: 1 }]
  mapping.autoFilter = { from: 'A2', to: `G${Math.max(2, mapping.rowCount)}` }
  mapping.eachRow((row, i) => { if (i > 2) { row.alignment = { vertical: 'top', wrapText: true }; row.eachCell(cell => { cell.numFmt = '@' }) } })
  const notes = createSheet(book, SHEETS[3], 'notes')
  writeMeta(notes, [['Integration Name', workspace.integrationName]])
  writeLines(notes, workspace.notes, 'Analysis Notes')
  for (const sheet of book.worksheets) if (sheet.rowCount > MAX_ROWS) throw new Error('A sheet exceeds the 200,000-row limit. Split the analysis into smaller workspaces.')
  const buffer = await book.xlsx.writeBuffer()
  return prepareUnicodeForExport(new Uint8Array(buffer).slice().buffer)
}
export async function importWorkbook(buffer: ArrayBuffer): Promise<Workspace> {
  validateArchive(buffer)
  const book = new ExcelJS.Workbook()
  try { await book.xlsx.load(await normalizeSupplementaryUnicode(buffer)) } catch { throw new Error('Unable to read this Excel file. It may be damaged or password protected.') }
  if (book.worksheets.length !== 4 || SHEETS.some(name => !book.getWorksheet(name))) fail('expected the four original MaptelaBridge sheets.')
  for (const [index, name] of SHEETS.entries()) {
    const sheet = book.getWorksheet(name)!
    if (sheet.rowCount > MAX_ROWS || sheet.columnCount > (index === 2 ? 8 : 4)) fail(`sheet ${name} is too large or has unexpected columns.`)
    // Never use cached formula results, links or rich text as user content.
    sheet.eachRow(row => row.eachCell(cell => {
      if (cell.value !== null && typeof cell.value !== 'string' && typeof cell.value !== 'number') fail('formulas, links and non-text values are not supported.')
      if (typeof cell.value === 'string' && cell.value.length > 32767) fail('a cell exceeds the Excel text limit.')
    }))
    header(sheet, 1, [WORKBOOK_NAME, '1', ['source', 'target', 'mapping', 'notes'][index]])
  }
  const source = readPayload(book.getWorksheet(SHEETS[0])!, 'Source')
  const target = readPayload(book.getWorksheet(SHEETS[1])!, 'Target')
  const noteSheet = book.getWorksheet(SHEETS[3])!
  const meta = readMeta(noteSheet, ['Integration Name'])
  if (source.name !== target.name || source.name !== meta.values[0]) fail('integration names do not match between sheets.')
  const sheet = book.getWorksheet(SHEETS[2])!
  header(sheet, 2, MAPPING_HEADER)
  const mappings: Workspace['mappings'] = []
  let row = 3
  while (row <= sheet.rowCount) {
    if (mappings.length >= 10_000) fail('too many mappings.')
    const no = mappings.length + 1
    const fields = ['', '', '', '', '', '']
    let part = 1
    do {
      if (integer(sheet.getCell(row, 1)) !== no || integer(sheet.getCell(row, 8)) !== part++) fail('mapping parts are missing or out of order.')
      fields.forEach((_, index) => { fields[index] += text(sheet.getCell(row, index + 2)) })
      row++
    } while (row <= sheet.rowCount && sheet.getCell(row, 1).value === no)
    const [source, target, rule, required, defaultValue, description] = fields.map(decodeText)
    if (!rules.includes(rule as typeof rules[number]) || !['Yes', 'No'].includes(required)) fail('invalid transformation rule or required flag.')
    mappings.push({ ...newMapping(), source, target, rule: rule as typeof rules[number], required: required === 'Yes', defaultValue, description })
  }
  const result: Workspace = { integrationName: source.name, source: source.payload, target: target.payload, mappings, notes: readLines(noteSheet, meta.next, 'Analysis Notes') }
  assertWorkspaceSize(result)
  return result
}

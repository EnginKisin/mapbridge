import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { blankWorkspace, newMapping, reviewStatuses, sampleWorkspace } from '../../models/workspace'
import type { Workspace } from '../../models/workspace'
import { exportWorkbook, importWorkbook } from './workbook'
import { excelFilename } from './filename'
import { CELL_LIMIT, decodeText, encodeChunks } from './codec'
import { MAX_FILE_BYTES, validateArchive } from './limits'

function comparable(workspace: Workspace) {
  return { ...workspace, mappings: workspace.mappings.map(({ id: _id, ...row }) => row) }
}
async function modify(workspace: Workspace, mutate: (book: ExcelJS.Workbook) => void) {
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(await exportWorkbook(workspace))
  mutate(book)
  return new Uint8Array(await book.xlsx.writeBuffer()).slice().buffer
}
describe('Excel round trip', () => {
  it('exports exactly four readable sheets and restores every workspace field', async () => {
    const original = sampleWorkspace()
    original.mappings.forEach((row, index) => { row.reviewStatus = reviewStatuses[index] })
    const buffer = await exportWorkbook(original)
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(buffer)
    expect(book.creator).toBe('MaptelaBridge')
    expect(book.worksheets.map(sheet => sheet.name)).toEqual(['Source Request', 'Target Request', 'Field Mapping', 'Analysis Notes'])
    expect(book.worksheets.map(sheet => sheet.getCell('A1').value)).toEqual(Array(4).fill('MaptelaBridge'))
    expect(book.getWorksheet('Field Mapping')?.autoFilter).toBeDefined()
    expect(book.getWorksheet('Field Mapping')?.views[0].state).toBe('frozen')
    expect(comparable(await importWorkbook(buffer))).toEqual(comparable(original))
  })
  it('preserves mixed CRLF/LF/CR, empty lines, tabs, trailing whitespace, Unicode and final newline', async () => {
    const original = sampleWorkspace()
    original.integrationName = 'İstanbul — sipariş, şğüöç 😃'
    original.source.system = 'Kaynak Türkçe'
    original.source.content = '  ilk\t satır  \r\n\n\rÜrün & <ürün> \' " 😃\r\n\rson\n'
    original.target.content = 'bozuk JSON/XML is also allowed { < &'
    original.target.format = 'IDoc XML'
    original.notes = 'Notlar\r\nİkinci satır\rSon satır \t\n'
    original.mappings[0].description = 'Açıklama\r\nAlt satır\r\n'
    original.mappings[0].defaultValue = '\t =1+1\r'
    expect(comparable(await importWorkbook(await exportWorkbook(original)))).toEqual(comparable(original))
  })
  it('handles empty payloads, empty integration/system names, empty notes and zero mappings', async () => {
    const original = blankWorkspace()
    original.integrationName = ''; original.source.system = ''; original.target.system = ''
    expect(comparable(await importWorkbook(await exportWorkbook(original)))).toEqual(comparable(original))
  })
  it('splits long single lines, long notes, metadata and mapping fields without loss', async () => {
    const original = sampleWorkspace()
    const long = 'İğ😀\t <&>~\r'.repeat(9000)
    original.integrationName = 'x'.repeat(40_000)
    original.source.system = 'S'.repeat(40_000)
    original.source.content = 'x😀'.repeat(60_000) + '\r\n' + long
    original.target.content = '<IDOC>' + 'Ö'.repeat(100_000) + '</IDOC>'
    original.notes = long
    original.mappings[0].source = long
    original.mappings[0].target = long
    original.mappings[0].defaultValue = long
    original.mappings[0].description = long
    original.mappings[0].reviewStatus = 'Needs clarification'
    const buffer = await exportWorkbook(original)
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(buffer)
    book.eachSheet(sheet => sheet.eachRow(row => row.eachCell(cell => { if (typeof cell.value === 'string') expect(cell.value.length).toBeLessThanOrEqual(32767) })))
    const zip = await JSZip.loadAsync(buffer)
    const raw = await zip.file('xl/sharedStrings.xml')!.async('string')
    expect(raw.includes('\ufffd'), 'Exported XML must not contain replacement characters').toBe(false)
    const restored = await importWorkbook(buffer)
    expect(restored.mappings[0].reviewStatus).toBe('Needs clarification')
    const compareString = (actual: string, expected: string, label: string) => {
      let index = 0
      while (index < Math.min(actual.length, expected.length) && actual[index] === expected[index]) index++
      expect(actual === expected, `${label}: lengths ${actual.length}/${expected.length}, first mismatch ${index}, actual ${JSON.stringify(actual.slice(index, index + 30))}, expected ${JSON.stringify(expected.slice(index, index + 30))}`).toBe(true)
    }
    compareString(restored.integrationName, original.integrationName, 'name')
    compareString(restored.source.system, original.source.system, 'source system')
    compareString(restored.source.content, original.source.content, 'source content')
    compareString(restored.target.content, original.target.content, 'target content')
    compareString(restored.notes, original.notes, 'notes')
    for (let i = 0; i < original.mappings.length; i++) {
      for (const key of ['source', 'target', 'defaultValue', 'description'] as const) compareString(restored.mappings[i][key], original.mappings[i][key], `mapping ${i} ${key}`)
    }
  })
  it('preserves a large multiline payload and mapping order', async () => {
    const original = sampleWorkspace()
    original.source.content = Array.from({ length: 10_000 }, (_, i) => `  "ürün${i}": ${i},`).join('\r\n')
    original.mappings = Array.from({ length: 100 }, (_, i) => ({ ...newMapping(), source: `items[${i}].id`, target: `E1EDP01[${i}].MATNR`, description: `Öğe ${i}` }))
    expect(comparable(await importWorkbook(await exportWorkbook(original)))).toEqual(comparable(original))
  })
  it('stores formula-like content as strings, never formulas', async () => {
    const original = blankWorkspace()
    original.integrationName = '=HYPERLINK("https://example.com")'
    original.source.content = '=1+1\n+SUM(A1:A2)\n-1\n@SUM(A1)'
    original.target.content = original.source.content
    original.notes = original.source.content
    original.mappings = [{ ...newMapping(), source: '=1+1', target: '+A1', defaultValue: '-3', description: '@SUM(A1)' }]
    const buffer = await exportWorkbook(original)
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(buffer)
    book.eachSheet(sheet => sheet.eachRow(row => row.eachCell(cell => expect(cell.type).not.toBe(ExcelJS.ValueType.Formula))))
    expect(book.getWorksheet('Source Request')!.getCell('C6').value).toBe('=1+1')
    expect(comparable(await importWorkbook(buffer))).toEqual(comparable(original))
  })
  it('losslessly escapes XML-illegal characters, literal escapes, CR and lone surrogates', async () => {
    const original = blankWorkspace()
    original.source.content = '\u0000\u0001\u000b\u007f\ufffe\uffff~000d\ud800~\r\n_x0041_ _x000D_ _x005F_x0041_ ~d83d~de00'
    original.notes = original.source.content
    original.mappings = [{ ...newMapping(), description: original.source.content }]
    expect(comparable(await importWorkbook(await exportWorkbook(original)))).toEqual(comparable(original))
  })
})
describe('Workbook validation', () => {
  it('restores workbooks without a review column with Draft states', async () => {
    const original = sampleWorkspace()
    original.mappings[0].description = 'Long description '.repeat(5000)
    const buffer = await modify(original, book => { book.getWorksheet('Field Mapping')!.spliceColumns(8, 1) })
    expect(comparable(await importWorkbook(buffer))).toEqual(comparable(original))
  })
  it('defaults empty review cells to Draft and rejects unknown states or broken mapping parts', async () => {
    const buffer = await modify(sampleWorkspace(), book => { book.getWorksheet('Field Mapping')!.getCell('H3').value = '' })
    expect((await importWorkbook(buffer)).mappings[0].reviewStatus).toBe('Draft')
    await expect(importWorkbook(await modify(sampleWorkspace(), book => { book.getWorksheet('Field Mapping')!.getCell('H3').value = 'Approved automatically' }))).rejects.toThrow('review status')
    await expect(importWorkbook(await modify(sampleWorkspace(), book => { book.getWorksheet('Field Mapping')!.getCell('I3').value = 2 }))).rejects.toThrow('out of order')
  })
  it('rejects non-XLSX and corrupt files', async () => {
    await expect(importWorkbook(new TextEncoder().encode('not excel').buffer)).rejects.toThrow('archive')
    await expect(importWorkbook(new ArrayBuffer(0))).rejects.toThrow('archive')
  })
  it('rejects missing sheets and unexpected schemas', async () => {
    await expect(importWorkbook(await modify(sampleWorkspace(), book => { book.removeWorksheet('Analysis Notes') }))).rejects.toThrow('four original')
    await expect(importWorkbook(await modify(sampleWorkspace(), book => { book.getWorksheet('Source Request')!.getCell('B1').value = '2' }))).rejects.toThrow('headers')
  })
  it('rejects unrelated or inconsistent workbook identities', async () => {
    await expect(importWorkbook(await modify(sampleWorkspace(), book => {
      book.eachSheet(sheet => { sheet.getCell('A1').value = 'Unrelated workbook' })
    }))).rejects.toThrow('headers')
    await expect(importWorkbook(await modify(sampleWorkspace(), book => {
      book.getWorksheet('Target Request')!.getCell('A1').value = 'Different workbook'
    }))).rejects.toThrow('headers')
  })
  it('rejects formulas even if a cached result is provided', async () => {
    const buffer = await modify(sampleWorkspace(), book => { book.getWorksheet('Source Request')!.getCell('C6').value = { formula: '1+1', result: 2 } })
    await expect(importWorkbook(buffer)).rejects.toThrow('formulas')
  })
  it('rejects missing/reordered payload chunks and invalid line endings', async () => {
    await expect(importWorkbook(await modify(sampleWorkspace(), book => { book.getWorksheet('Source Request')!.getCell('B6').value = 2 }))).rejects.toThrow('out of order')
    await expect(importWorkbook(await modify(sampleWorkspace(), book => { book.getWorksheet('Source Request')!.getCell('D6').value = '__proto__' }))).rejects.toThrow('line ending')
  })
  it('rejects mismatched names, invalid formats and invalid mapping rules', async () => {
    await expect(importWorkbook(await modify(sampleWorkspace(), book => { book.getWorksheet('Target Request')!.getCell('B2').value = 'different' }))).rejects.toThrow('names')
    await expect(importWorkbook(await modify(sampleWorkspace(), book => { book.getWorksheet('Source Request')!.getCell('B4').value = 'YAML' }))).rejects.toThrow('format')
    await expect(importWorkbook(await modify(sampleWorkspace(), book => { book.getWorksheet('Field Mapping')!.getCell('D3').value = 'Execute' }))).rejects.toThrow('rule')
  })
  it('rejects files exceeding the import limit before decompressing', () => {
    expect(() => validateArchive(new ArrayBuffer(MAX_FILE_BYTES + 1))).toThrow('50 MB')
  })
  it('rejects archives with excessive declared expanded size', async () => {
    const buffer = await exportWorkbook(blankWorkspace())
    const bytes = new DataView(buffer)
    for (let i = 0; i < buffer.byteLength - 46; i++) {
      if (bytes.getUint32(i, true) === 0x02014b50) { bytes.setUint32(i + 24, 200 * 1024 * 1024, true); break }
    }
    await expect(importWorkbook(buffer)).rejects.toThrow('160 MB')
  })
})
describe('Text codec and file names', () => {
  it('chunks without splitting escape sequences or emoji', () => {
    const content = '~\u0000😀'.repeat(10_000)
    const chunks = encodeChunks(content)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every(chunk => chunk.length <= CELL_LIMIT)).toBe(true)
    expect(chunks.map(decodeText).join('')).toBe(content)
  })
  it('sanitizes filenames and uses the local calendar date', () => {
    expect(excelFilename('SAP/SAG:Retter*?', new Date(2026, 10, 21, 1))).toBe('SAP_SAG_Retter___2026-11-21.xlsx')
    expect(excelFilename('', new Date(2026, 10, 21))).toBe('MaptelaBridge_2026-11-21.xlsx')
  })
})

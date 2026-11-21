import JSZip from 'jszip'

async function normalizeXml(buffer: ArrayBuffer, exporting: boolean): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(buffer)
  let changed = false
  for (const entry of Object.values(zip.files)) {
    if (!/^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(entry.name)) continue
    const xml = new TextDecoder().decode(await entry.async('uint8array'))
    const normalized = exporting
      ? xml.replace(/~(d[89ab][0-9a-f]{2})~(d[cdef][0-9a-f]{2})/g, (_, high: string, low: string) => `&#${(parseInt(high, 16) - 0xd800) * 1024 + parseInt(low, 16) - 0xdc00 + 0x10000};`)
      : xml.replace(/[\u{10000}-\u{10ffff}]/gu, character => `&#${character.codePointAt(0)};`)
    if (normalized !== xml) { zip.file(entry.name, normalized); changed = true }
  }
  return changed ? zip.generateAsync({ type: 'arraybuffer', compression: exporting ? 'DEFLATE' : 'STORE' }) : buffer
}
export const normalizeSupplementaryUnicode = (buffer: ArrayBuffer) => normalizeXml(buffer, false)
export const prepareUnicodeForExport = (buffer: ArrayBuffer) => normalizeXml(buffer, true)

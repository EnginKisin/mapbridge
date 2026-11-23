import type { PayloadFormat, Side } from '../../models/workspace'

const fileTypes: Record<PayloadFormat, { extension: string; mimeType: string }> = {
  JSON: { extension: 'json', mimeType: 'application/json;charset=utf-8' },
  XML: { extension: 'xml', mimeType: 'application/xml;charset=utf-8' },
  'IDoc XML': { extension: 'xml', mimeType: 'application/xml;charset=utf-8' },
  SQL: { extension: 'sql', mimeType: 'application/sql;charset=utf-8' },
  'Plain Text': { extension: 'txt', mimeType: 'text/plain;charset=utf-8' },
}

export function payloadFileInfo(name: string, side: Side, format: PayloadFormat, date = new Date()) {
  const clean = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[ .]+$/g, '').trim().slice(0, 100) || 'MaptelaBridge'
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const { extension, mimeType } = fileTypes[format]
  return { filename: `${clean}_${side}_${stamp}.${extension}`, mimeType }
}

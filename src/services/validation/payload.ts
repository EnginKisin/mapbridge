import { findJsonErrorOffset } from './jsonLocation'
import type { PayloadFormat } from '../../models/workspace'

export interface ValidationResult { state: 'valid' | 'invalid' | 'empty' | 'text'; message: string; line?: number; column?: number }
export function parseXml(content: string): Document {
  if (/<!DOCTYPE\s|<!ENTITY\s/i.test(content)) throw new Error('DTD and entity declarations are not supported. The original text can still be exported.')
  const document = new DOMParser().parseFromString(content, 'application/xml')
  const error = document.getElementsByTagName('parsererror')[0]
  if (error) throw new Error((error.textContent || 'Invalid XML').trim().slice(0, 350))
  if (!document.documentElement) throw new Error('XML requires a root element.')
  return document
}
export function validatePayload(content: string, format: PayloadFormat): ValidationResult {
  if (!content.trim()) return { state: 'empty', message: 'Empty payload' }
  if (format === 'Plain Text' || format === 'SQL') return { state: 'text', message: format === 'SQL' ? 'SQL · text only, never executed' : 'Plain text · no validation' }
  try {
    if (format === 'JSON') JSON.parse(content); else parseXml(content)
    return { state: 'valid', message: `Valid ${format}` }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid payload'
    const location = /line\s+(\d+)\s+(?:at\s+)?column\s+(\d+)/i.exec(message) || /^(\d+):(\d+):/.exec(message)
    const position = /position (\d+)/i.exec(message)
    const offset = position ? Number(position[1]) : format === 'JSON' && !location ? findJsonErrorOffset(content) : undefined
    const lines = offset !== undefined ? content.slice(0, offset).split(/\r\n|\r|\n/) : undefined
    return { state: 'invalid', message, line: location ? +location[1] : lines?.length ?? 1, column: location ? +location[2] : lines ? lines[lines.length - 1].length + 1 : 1 }
  }
}

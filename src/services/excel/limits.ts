import type { Workspace } from '../../models/workspace'

export const MAX_FILE_BYTES = 50 * 1024 * 1024
export const MAX_TEXT_BYTES = 40 * 1024 * 1024
export const MAX_ROWS = 200_000
export function assertWorkspaceSize(workspace: Workspace) {
  if (workspace.mappings.length > 10_000) throw new Error('A workspace can contain at most 10,000 mapping rows.')
  if (new TextEncoder().encode(JSON.stringify(workspace)).length > MAX_TEXT_BYTES) throw new Error('Workspace exceeds the 40 MB text limit. Split the analysis into smaller workspaces.')
}

export function validateArchive(buffer: ArrayBuffer) {
  if (buffer.byteLength > MAX_FILE_BYTES) throw new Error('Excel file exceeds the 50 MB import limit.')
  const data = new DataView(buffer)
  let end = -1
  for (let p = buffer.byteLength - 22; p >= Math.max(0, buffer.byteLength - 65557); p--) {
    if (data.getUint32(p, true) === 0x06054b50 && p + 22 + data.getUint16(p + 20, true) === buffer.byteLength) { end = p; break }
  }
  if (end < 0) throw new Error('This file is not a readable .xlsx archive.')
  const count = data.getUint16(end + 10, true)
  let offset = data.getUint32(end + 16, true)
  if (count > 4096 || data.getUint16(end + 4, true) || data.getUint16(end + 6, true)) throw new Error('Unsupported or oversized Excel archive.')
  let expanded = 0
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || data.getUint32(offset, true) !== 0x02014b50) throw new Error('Corrupt Excel archive directory.')
    if (data.getUint16(offset + 8, true) & 1) throw new Error('Encrypted workbooks are not supported.')
    expanded += data.getUint32(offset + 24, true)
    if (expanded > 160 * 1024 * 1024) throw new Error('Expanded Excel file exceeds the 160 MB safety limit.')
    offset += 46 + data.getUint16(offset + 28, true) + data.getUint16(offset + 30, true) + data.getUint16(offset + 32, true)
  }
}

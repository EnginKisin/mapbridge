import { exportWorkbook, importWorkbook } from './workbook'
import type { Workspace } from '../../models/workspace'

self.onmessage = async (event: MessageEvent<{ type: 'export'; workspace: Workspace } | { type: 'import'; buffer: ArrayBuffer }>) => {
  try {
    const result = event.data.type === 'export' ? await exportWorkbook(event.data.workspace) : await importWorkbook(event.data.buffer)
    if (result instanceof ArrayBuffer) self.postMessage({ result }, { transfer: [result] })
    else self.postMessage({ result })
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Excel operation failed.' }) }
}

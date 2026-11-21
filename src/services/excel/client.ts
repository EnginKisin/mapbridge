import ExcelWorker from './excel.worker?worker'
import type { Workspace } from '../../models/workspace'

function runWorker<T>(request: { type: 'export'; workspace: Workspace } | { type: 'import'; buffer: ArrayBuffer }): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new ExcelWorker()
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('Excel operation timed out. Try a smaller workbook.')) }, 120_000)
    const cleanup = () => { clearTimeout(timer); worker.terminate() }
    worker.onmessage = (event: MessageEvent<{ result: T; error?: string }>) => {
      cleanup()
      if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.result)
    }
    worker.onerror = () => { cleanup(); reject(new Error('Unable to process Excel. Check the file and try again.')) }
    worker.postMessage(request, request.type === 'import' ? [request.buffer] : [])
  })
}
export const exportExcel = (workspace: Workspace) => runWorker<ArrayBuffer>({ type: 'export', workspace })
export const importExcel = (buffer: ArrayBuffer) => runWorker<Workspace>({ type: 'import', buffer })

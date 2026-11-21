import { useEffect, useMemo, useState } from 'react'
import type { Payload } from '../models/workspace'
import DiscoveryWorker from '../services/discovery/discovery.worker?worker'
import { emptyDiscovery } from '../services/discovery/types'
import type { FieldDiscovery } from '../services/discovery/types'

export function useFieldDiscovery({ content, format }: Payload): FieldDiscovery {
  const [snapshot, setSnapshot] = useState<{ content: string; result: FieldDiscovery } | null>(null)
  useEffect(() => {
    if (!content.trim() || format === 'Plain Text' || format === 'SQL') return
    let worker: Worker | undefined
    let active = true
    const timeout = setTimeout(() => {
      worker?.terminate()
      if (active) setSnapshot({ content, result: emptyDiscovery(format, 'limited', 'Field discovery timed out. Manual mappings are kept; edit the payload to retry.') })
    }, 15_000)
    const timer = setTimeout(() => {
      try {
        worker = new DiscoveryWorker()
        worker.onmessage = (event: MessageEvent<FieldDiscovery>) => {
          if (active) setSnapshot({ content, result: event.data })
          clearTimeout(timeout); worker?.terminate()
        }
        worker.onerror = event => {
          event.preventDefault()
          if (active) setSnapshot({ content, result: emptyDiscovery(format, 'limited', 'Field discovery is unavailable. Manual mappings are kept; edit the payload to retry.') })
          clearTimeout(timeout); worker?.terminate()
        }
        worker.postMessage({ content, format })
      } catch {
        clearTimeout(timeout)
        if (active) setSnapshot({ content, result: emptyDiscovery(format, 'limited', 'Field discovery is unavailable. Manual mapping remains available.') })
      }
    }, 500)
    return () => { active = false; clearTimeout(timer); clearTimeout(timeout); worker?.terminate() }
  }, [content, format])
  return useMemo(() => {
    if (!content.trim()) return emptyDiscovery(format, 'empty', 'Paste a payload to discover fields.')
    if (format === 'Plain Text' || format === 'SQL') return emptyDiscovery(format, 'unsupported', 'Field discovery is available for JSON, XML, and IDoc XML.')
    if (snapshot?.content === content && snapshot.result.format === format) return snapshot.result
    return emptyDiscovery(format, 'pending', 'Scanning payload…')
  }, [content, format, snapshot])
}

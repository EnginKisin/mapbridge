import { discoverFields } from './discover'
import { indexFields } from '../navigation/fields'
import type { PayloadFormat } from '../../models/workspace'

self.onmessage = (event: MessageEvent<{ content: string; format: PayloadFormat }>) => {
  const { content, format } = event.data
  const result = discoverFields(content, format)
  self.postMessage({ ...result, navigation: result.state === 'invalid' ? { state: 'invalid', locations: [] } : indexFields(content, format) })
}

import { Setting } from '@shared/types'
import { DEFAULT_RSS_SOURCES, MORNING_WINDOW } from '@shared/constants'

export function getDefaultSettings(): { key: string; value: string; isEncrypted: boolean }[] {
  return [
    { key: 'nickname', value: '', isEncrypted: false },
    { key: 'morningStart', value: MORNING_WINDOW.start, isEncrypted: false },
    { key: 'morningEnd', value: MORNING_WINDOW.end, isEncrypted: false },
    { key: 'llmBaseUrl', value: '', isEncrypted: false },
    { key: 'llmModel', value: '', isEncrypted: false },
    { key: 'llmApiKey', value: '', isEncrypted: true },
    { key: 'newsProviders', value: JSON.stringify(DEFAULT_RSS_SOURCES), isEncrypted: false },
    { key: 'lastMorningRoutine', value: '', isEncrypted: false },
  ]
}

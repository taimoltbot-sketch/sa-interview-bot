import type { GraphState } from '../../types/index'
import { CONSOLIDATE_PROMPT } from '../prompts'
import type { TabManager } from '../tabManager'
import { notifyStatus } from '../notify'

export async function consolidateInfoNode(
  state: GraphState,
  tabManager: TabManager
): Promise<Partial<GraphState>> {
  notifyStatus('正在整合所有對話資訊...')
  const conversationStr = state.conversationHistory
    .map(m => `${m.role === 'bot' ? 'AI問題' : 'SA回答'}: ${m.content}`)
    .join('\n\n')

  const allData = JSON.stringify({
    systemName: state.systemName || '',
    systemOverview: state.systemOverview || '',
    userRoles: state.userRoles,
    features: state.features,
    verifiedLogics: state.verified_logics,
    integrations: state.integrations || '',
    businessRules: state.businessRules || '',
    analyzedData: state.analyzedData,
    fullConversation: conversationStr,
  }, null, 2)

  const raw = await tabManager.sendToTab('understanding', CONSOLIDATE_PROMPT(allData))
  const jsonMatch = raw.match(/\{[\s\S]*\}/)

  // Extract systemName from the consolidate response so state (and any
  // downstream filename / HTML title) gets populated. Gemini may also truncate
  // the response mid-JSON (saw 123-char "GEMINI_STUCK" cut-off in the wild),
  // so fall back to a regex grab on the raw text when JSON.parse fails.
  let systemName = state.systemName
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { systemName?: string }
      if (parsed.systemName) systemName = parsed.systemName
    } catch {
      const nameMatch = raw.match(/"systemName"\s*:\s*"([^"]+)"/)
      if (nameMatch && nameMatch[1]) systemName = nameMatch[1]
    }
  }

  return {
    consolidatedJson: jsonMatch ? jsonMatch[0] : allData,
    systemName,
  }
}

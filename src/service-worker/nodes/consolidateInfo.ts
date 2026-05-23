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
    integrations: state.integrations || '',
    businessRules: state.businessRules || '',
    analyzedData: state.analyzedData,
    fullConversation: conversationStr,
  }, null, 2)

  const raw = await tabManager.sendToTab('understanding', CONSOLIDATE_PROMPT(allData))
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  return { consolidatedJson: jsonMatch ? jsonMatch[0] : allData }
}

import type { GraphState } from '../../types/index'
import { DECIDE_NEXT_QUESTION_PROMPT } from '../prompts'
import type { TabManager } from '../tabManager'

export async function decideNextQuestionNode(
  state: GraphState,
  tabManager: TabManager
): Promise<Partial<GraphState>> {
  const stateStr = JSON.stringify({
    phase: state.phase,
    systemOverview: state.systemOverview,
    userRoles: state.userRoles,
    featureList: state.featureList,
    currentFeatureIndex: state.currentFeatureIndex,
    features: state.features,
    integrations: state.integrations,
    businessRules: state.businessRules,
    missingInfo: state.missingInfo,
  }, null, 2)

  const raw = await tabManager.sendToTab('decision', DECIDE_NEXT_QUESTION_PROMPT(stateStr))
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return { pendingQuestion: '請描述一下這個系統的主要目的是什麼？', pendingSuggestions: [], pendingMultiSelect: false }
  const parsed = JSON.parse(jsonMatch[0]) as { nextPhase?: string; question?: string; suggestions?: string[]; multiSelect?: boolean }
  return {
    phase: (parsed.nextPhase || 'overview') as GraphState['phase'],
    pendingQuestion: parsed.question || '請描述一下這個系統的主要目的是什麼？',
    pendingSuggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    pendingMultiSelect: parsed.multiSelect === true,
  }
}

import type { GraphState, ChatMessage } from '../../types/index'
import { UNDERSTAND_ANSWER_PROMPT } from '../prompts'
import type { TabManager } from '../tabManager'

export async function understandAnswerNode(
  state: GraphState,
  tabManager: TabManager,
  userAnswer: string
): Promise<Partial<GraphState>> {
  const context = JSON.stringify({
    phase: state.phase,
    currentFeatureIndex: state.currentFeatureIndex,
    featureList: state.featureList,
  })
  const raw = await tabManager.sendToTab(
    'understanding',
    UNDERSTAND_ANSWER_PROMPT(state.pendingQuestion, userAnswer, context)
  )

  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  const parsed = jsonMatch
    ? JSON.parse(jsonMatch[0]) as { extractedInfo: Record<string, unknown>; needsClarification: boolean; clarificationQuestion: string; currentFeatureName?: string }
    : { extractedInfo: {}, needsClarification: false, clarificationQuestion: '', currentFeatureName: undefined }

  const userMessage: ChatMessage = { role: 'user', content: userAnswer, timestamp: Date.now() }
  const newHistory = [...state.conversationHistory, userMessage]

  if (parsed.needsClarification) {
    return { conversationHistory: newHistory, pendingQuestion: parsed.clarificationQuestion }
  }

  const update: Partial<GraphState> = { conversationHistory: newHistory }
  const info = parsed.extractedInfo

  if (typeof parsed.currentFeatureName === 'string' && parsed.currentFeatureName.trim()) {
    update.currentFeatureName = parsed.currentFeatureName.trim()
  }

  switch (state.phase) {
    case 'overview':
      update.systemOverview = (info.systemOverview as string) ?? userAnswer
      update.systemName = (info.systemName as string) ?? ''
      break
    case 'roles':
      update.userRoles = (info.userRoles as string[]) ?? [userAnswer]
      break
    case 'features':
      update.featureList = (info.featureList as string[]) ?? userAnswer.split(/[,，、\n]/).map(s => s.trim())
      break
    case 'integration':
      update.integrations = userAnswer
      break
    case 'rules':
      update.businessRules = userAnswer
      break
  }

  return update
}

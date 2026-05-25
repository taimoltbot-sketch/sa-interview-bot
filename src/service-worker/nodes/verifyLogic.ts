import type { GraphState, VerifiedLogic } from '../../types/index'
import { VERIFY_LOGIC_PROMPT } from '../prompts'
import type { TabManager } from '../tabManager'
import { notifyStatus } from '../notify'

export async function verifyLogicNode(
  state: GraphState,
  tabManager: TabManager
): Promise<VerifiedLogic | null> {
  notifyStatus('正在整理剛才釐清的業務邏輯...')
  const conversationSlice = state.conversationHistory
    .slice(-12)
    .map(m => `${m.role === 'bot' ? 'AI' : 'SA'}: ${m.content}`)
    .join('\n')
  const raw = await tabManager.sendToTab(
    'understanding',
    VERIFY_LOGIC_PROMPT(state.currentFeatureName ?? '', conversationSlice)
  )
  const json = raw.match(/\{[\s\S]*\}/)?.[0]
  if (!json) {
    console.warn('[verifyLogic] no JSON found in response')
    return null
  }
  try {
    const p = JSON.parse(json) as Record<string, unknown>
    return {
      featureName: typeof p.featureName === 'string' && p.featureName ? p.featureName : (state.currentFeatureName ?? ''),
      trigger: typeof p.trigger === 'string' ? p.trigger : '',
      mainFlow: Array.isArray(p.mainFlow) ? p.mainFlow as string[] : [],
      decisionPoints: Array.isArray(p.decisionPoints) ? p.decisionPoints as VerifiedLogic['decisionPoints'] : [],
      exceptionFlow: Array.isArray(p.exceptionFlow) ? p.exceptionFlow as VerifiedLogic['exceptionFlow'] : [],
      endStates: Array.isArray(p.endStates) ? p.endStates as string[] : [],
      verifiedAt: Date.now(),
    }
  } catch {
    console.warn('[verifyLogic] JSON parse failed')
    return null
  }
}

import type { GraphState, FlowReadiness } from '../../types/index'
import { DECIDE_NEXT_QUESTION_PROMPT } from '../prompts'
import type { TabManager } from '../tabManager'

const DEFAULT_READINESS: FlowReadiness = {
  ready: false,
  decisionPointsCount: 0,
  hasExceptionFlow: false,
  endStatesCount: 0,
  reason: '',
}

function normalizeReadiness(raw: unknown): FlowReadiness {
  if (!raw || typeof raw !== 'object') return DEFAULT_READINESS
  const r = raw as Record<string, unknown>
  return {
    ready: r.ready === true,
    decisionPointsCount: typeof r.decisionPointsCount === 'number' ? r.decisionPointsCount : 0,
    hasExceptionFlow: r.hasExceptionFlow === true,
    endStatesCount: typeof r.endStatesCount === 'number' ? r.endStatesCount : 0,
    reason: typeof r.reason === 'string' ? r.reason : '',
  }
}

export async function decideNextQuestionNode(
  state: GraphState,
  tabManager: TabManager
): Promise<Partial<GraphState>> {
  // Include recent conversation so the brain can judge flow richness from real Q&A
  const recentConvo = state.conversationHistory
    .slice(-10)
    .map(m => `${m.role === 'bot' ? 'AI' : 'SA'}: ${m.content}`)
    .join('\n')

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
    recentConversation: recentConvo,
  }, null, 2)

  const raw = await tabManager.sendToTab('decision', DECIDE_NEXT_QUESTION_PROMPT(stateStr))
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return {
    pendingQuestion: '請描述一下這個系統的主要目的是什麼？',
    pendingSuggestions: [],
    pendingMultiSelect: false,
    flowReadiness: DEFAULT_READINESS,
  }
  const parsed = JSON.parse(jsonMatch[0]) as {
    nextPhase?: string
    question?: string
    suggestions?: string[]
    multiSelect?: boolean
    flowReadiness?: unknown
    logicReadiness?: { ready?: boolean; reason?: string }
    currentFeatureName?: string
  }
  return {
    phase: (parsed.nextPhase || 'overview') as GraphState['phase'],
    pendingQuestion: parsed.question || '請描述一下這個系統的主要目的是什麼？',
    pendingSuggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    pendingMultiSelect: parsed.multiSelect === true,
    flowReadiness: normalizeReadiness(parsed.flowReadiness),
    logicReadiness: {
      ready: parsed.logicReadiness?.ready === true,
      reason: parsed.logicReadiness?.reason ?? '',
    },
    ...(typeof parsed.currentFeatureName === 'string' && parsed.currentFeatureName.trim()
      ? { currentFeatureName: parsed.currentFeatureName.trim() }
      : {}),
  }
}

import type { GraphState } from '../types/index'

const STORAGE_KEY = 'graphState'

export async function saveState(state: GraphState): Promise<void> {
  await chrome.storage.session.set({ [STORAGE_KEY]: state })
}

export async function loadState(): Promise<GraphState | null> {
  const result = await chrome.storage.session.get(STORAGE_KEY)
  return (result[STORAGE_KEY] as GraphState) ?? null
}

export async function clearState(): Promise<void> {
  await chrome.storage.session.set({ [STORAGE_KEY]: null })
}

export function createInitialState(): GraphState {
  return {
    phase: 'upload',
    systemName: '',
    uploadedFiles: [],
    analyzedData: {},
    missingInfo: [],
    systemOverview: '',
    userRoles: [],
    featureList: [],
    currentFeatureIndex: 0,
    features: [],
    integrations: '',
    businessRules: '',
    consolidatedJson: '',
    generatedDocument: '',
    generatedHtmlContent: '',
    generatedMermaid: '',
    conversationHistory: [],
    pendingQuestion: '',
    pendingSuggestions: [],
    pendingMultiSelect: false,
    flowReadiness: {
      ready: false,
      decisionPointsCount: 0,
      hasExceptionFlow: false,
      endStatesCount: 0,
      reason: '',
    },
    revisionTarget: '',
    answerCountAtLastOutput: 0,
    awaitingConfirmation: false,
    awaitingDiagramConfirmation: false,
  }
}

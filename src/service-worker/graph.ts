import { StateGraph, Annotation, END, START } from '@langchain/langgraph'
import type { GraphState } from '../types/index'
import type { TabManager } from './tabManager'
import { saveState } from './stateStorage'
import { initialSetupNode } from './nodes/initialSetup'
import { decideNextQuestionNode } from './nodes/decideNextQuestion'
import { askQuestionNode } from './nodes/askQuestion'
import { consolidateInfoNode } from './nodes/consolidateInfo'
import { generateDocumentNode } from './nodes/generateDocument'
import { generateMermaidNode } from './nodes/generateMermaid'

const GraphStateAnnotation = Annotation.Root({
  phase: Annotation<GraphState['phase']>({ reducer: (_a, b) => b, default: () => 'upload' }),
  systemName: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
  uploadedFiles: Annotation<GraphState['uploadedFiles']>({ reducer: (_a, b) => b, default: () => [] }),
  analyzedData: Annotation<Record<string, unknown>>({ reducer: (_a, b) => b, default: () => ({}) }),
  missingInfo: Annotation<string[]>({ reducer: (_a, b) => b, default: () => [] }),
  systemOverview: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
  userRoles: Annotation<string[]>({ reducer: (_a, b) => b, default: () => [] }),
  featureList: Annotation<string[]>({ reducer: (_a, b) => b, default: () => [] }),
  currentFeatureIndex: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }),
  features: Annotation<GraphState['features']>({ reducer: (_a, b) => b, default: () => [] }),
  integrations: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
  businessRules: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
  consolidatedJson: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
  generatedDocument: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
  generatedMermaid: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
  conversationHistory: Annotation<GraphState['conversationHistory']>({ reducer: (_a, b) => b, default: () => [] }),
  pendingQuestion: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
  pendingSuggestions: Annotation<string[]>({ reducer: (_a, b) => b, default: () => [] }),
  revisionTarget: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
  answerCountAtLastOutput: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }),
})

// Graph 1: Interview flow
// First run (any):   initial_setup → ask_question  (1 Gemini call: analyze + gaps + first Q)
// Subsequent runs:   decide_next_question → ask_question  (1 Gemini call)
export function buildInterviewGraph(tabManager: TabManager) {
  return new StateGraph(GraphStateAnnotation)
    .addNode('initial_setup', async (state) => {
      const update = await initialSetupNode(state as GraphState, tabManager)
      await saveState({ ...state, ...update } as GraphState)
      return update
    })
    .addNode('decide_next_question', async (state) => {
      const update = await decideNextQuestionNode(state as GraphState, tabManager)
      await saveState({ ...state, ...update } as GraphState)
      return update
    })
    .addNode('ask_question', (state) => askQuestionNode(state as GraphState))
    .addConditionalEdges(START, (state) => {
      const s = state as GraphState
      // First run: missingInfo not yet populated → run combined setup
      return s.missingInfo.length === 0 ? 'initial_setup' : 'decide_next_question'
    })
    .addEdge('initial_setup', 'ask_question')
    .addEdge('decide_next_question', 'ask_question')
    .addEdge('ask_question', END)
    .compile()
}

// Graph 2: Output flow (START → consolidate → generate_doc → generate_mermaid → END)
export function buildOutputGraph(tabManager: TabManager) {
  return new StateGraph(GraphStateAnnotation)
    .addNode('consolidate_info', async (state) => {
      const update = await consolidateInfoNode(state as GraphState, tabManager)
      await saveState({ ...state, ...update } as GraphState)
      return update
    })
    .addNode('generate_document', async (state) => {
      const update = await generateDocumentNode(state as GraphState, tabManager)
      await saveState({ ...state, ...update } as GraphState)
      return update
    })
    .addNode('generate_mermaid', async (state) => {
      const update = await generateMermaidNode(state as GraphState, tabManager)
      await saveState({ ...state, ...update } as GraphState)
      return update
    })
    .addEdge(START, 'consolidate_info')
    .addEdge('consolidate_info', 'generate_document')
    .addEdge('generate_document', 'generate_mermaid')
    .addEdge('generate_mermaid', END)
    .compile()
}

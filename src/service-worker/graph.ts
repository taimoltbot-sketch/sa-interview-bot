import { StateGraph, Annotation, END, START } from '@langchain/langgraph'
import type { GraphState } from '../types/index'
import type { TabManager } from './tabManager'
import { saveState } from './stateStorage'
import { analyzeFilesNode } from './nodes/analyzeFiles'
import { identifyGapsNode } from './nodes/identifyGaps'
import { decideNextQuestionNode } from './nodes/decideNextQuestion'
import { routeRevisionNode } from './nodes/routeRevision'
import { askQuestionNode } from './nodes/askQuestion'
import { consolidateInfoNode } from './nodes/consolidateInfo'
import { generateDocumentNode } from './nodes/generateDocument'
import { generateMermaidNode } from './nodes/generateMermaid'

// 定義狀態 annotation
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
  revisionTarget: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
})

export function buildGraph(tabManager: TabManager) {
  // Use method chaining so TypeScript can accumulate node name types
  // for type-safe edge definitions.
  const compiled = new StateGraph(GraphStateAnnotation)
    .addNode('analyze_files', async (state) => {
      const update = await analyzeFilesNode(state as GraphState, tabManager)
      await saveState({ ...state, ...update } as GraphState)
      return update
    })
    .addNode('identify_gaps', async (state) => {
      const update = await identifyGapsNode(state as GraphState, tabManager)
      await saveState({ ...state, ...update } as GraphState)
      return update
    })
    .addNode('decide_next_question', async (state) => {
      const update = await decideNextQuestionNode(state as GraphState, tabManager)
      await saveState({ ...state, ...update } as GraphState)
      return update
    })
    .addNode('ask_question', (state) => {
      return askQuestionNode(state as GraphState)
    })
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
    .addNode('route_revision', async (state) => {
      const update = await routeRevisionNode(state as GraphState, tabManager)
      await saveState({ ...state, ...update } as GraphState)
      return update
    })
    // Main interview flow
    .addEdge(START, 'analyze_files')
    .addEdge('analyze_files', 'identify_gaps')
    .addEdge('identify_gaps', 'decide_next_question')
    .addEdge('decide_next_question', 'ask_question')
    .addEdge('ask_question', END)
    // Revision routing: either continue questioning or move to output
    .addConditionalEdges('route_revision', (state) => {
      if ((state as GraphState).phase === 'output') return 'consolidate_info'
      return 'decide_next_question'
    })
    // Output generation flow
    .addEdge('consolidate_info', 'generate_document')
    .addEdge('generate_document', 'generate_mermaid')
    .addEdge('generate_mermaid', END)
    .compile()

  return compiled
}

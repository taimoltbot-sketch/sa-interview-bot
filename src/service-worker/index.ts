import { TabManager } from './tabManager'
import { buildGraph } from './graph'
import { loadState, saveState, createInitialState } from './stateStorage'
import { understandAnswerNode } from './nodes/understandAnswer'
import type { GraphState, MessageType, UploadedFile } from '../types/index'

let tabManager: TabManager | null = null
let compiledGraph: ReturnType<typeof buildGraph> | null = null

async function getOrInitGraph() {
  if (!tabManager || !compiledGraph) {
    tabManager = new TabManager()
    await tabManager.init()
    compiledGraph = buildGraph(tabManager)
  }
  return { tabManager, graph: compiledGraph }
}

function notifySidePanel(message: MessageType) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Side panel may not be open, ignore
  })
}

chrome.runtime.onMessage.addListener((message: MessageType, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch(err => {
      sendResponse({ error: (err as Error).message })
      notifySidePanel({ type: 'ERROR', payload: (err as Error).message })
    })
  return true // keep channel open for async
})

async function handleMessage(message: MessageType): Promise<unknown> {
  switch (message.type) {
    case 'INIT_SESSION': {
      const { graph } = await getOrInitGraph()
      const state = createInitialState()
      await saveState(state)
      const result = await graph.invoke(state) as GraphState
      const lastMsg = result.conversationHistory[result.conversationHistory.length - 1]
      if (lastMsg) notifySidePanel({ type: 'BOT_MESSAGE', payload: lastMsg })
      return { ok: true }
    }

    case 'FILE_UPLOAD': {
      const { graph } = await getOrInitGraph()
      const savedState = await loadState()
      const state: GraphState = {
        ...(savedState ?? createInitialState()),
        uploadedFiles: message.payload as UploadedFile[],
      }
      await saveState(state)
      const result = await graph.invoke(state) as GraphState
      const lastMsg = result.conversationHistory[result.conversationHistory.length - 1]
      if (lastMsg) notifySidePanel({ type: 'BOT_MESSAGE', payload: lastMsg })
      return { ok: true }
    }

    case 'USER_ANSWER': {
      const { tabManager: tm, graph } = await getOrInitGraph()
      const savedState = await loadState()
      if (!savedState) throw new Error('No active session. Please start a new session.')

      if (savedState.phase === 'review' && (message.payload as string).includes('修改')) {
        const newState: GraphState = {
          ...savedState,
          revisionTarget: message.payload as string,
          phase: 'review',
        }
        await saveState(newState)
        const result = await graph.invoke(newState) as GraphState
        notifySidePanel({
          type: 'PREVIEW_READY',
          payload: { document: result.generatedDocument, mermaid: result.generatedMermaid },
        })
        return { ok: true }
      }

      const update = await understandAnswerNode(savedState, tm!, message.payload as string)
      const updatedState: GraphState = { ...savedState, ...update }

      const allFeaturesComplete =
        updatedState.featureList.length > 0 &&
        updatedState.currentFeatureIndex >= updatedState.featureList.length
      const hasRequiredInfo = updatedState.businessRules && updatedState.integrations

      if (allFeaturesComplete && hasRequiredInfo) {
        const outputState: GraphState = { ...updatedState, phase: 'output' }
        await saveState(outputState)
        const result = await graph.invoke(outputState) as GraphState
        notifySidePanel({
          type: 'PREVIEW_READY',
          payload: { document: result.generatedDocument, mermaid: result.generatedMermaid },
        })
      } else {
        await saveState(updatedState)
        const result = await graph.invoke(updatedState) as GraphState
        const lastMsg = result.conversationHistory[result.conversationHistory.length - 1]
        if (lastMsg) notifySidePanel({ type: 'BOT_MESSAGE', payload: lastMsg })
      }
      return { ok: true }
    }

    case 'REQUEST_DOWNLOAD': {
      const savedState = await loadState()
      if (!savedState) throw new Error('No active session')
      return {
        document: savedState.generatedDocument,
        mermaid: savedState.generatedMermaid,
        systemName: savedState.systemName,
      }
    }

    default:
      return { error: 'Unknown message type' }
  }
}

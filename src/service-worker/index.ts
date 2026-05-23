import { TabManager } from './tabManager'
import { buildInterviewGraph, buildOutputGraph } from './graph'
import { loadState, saveState, createInitialState } from './stateStorage'
import { understandAnswerNode } from './nodes/understandAnswer'
import { routeRevisionNode } from './nodes/routeRevision'
import type { GraphState, MessageType, UploadedFile } from '../types/index'

// Open side panel when toolbar icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id! })
})

let tabManager: TabManager | null = null
let interviewGraph: ReturnType<typeof buildInterviewGraph> | null = null
let outputGraph: ReturnType<typeof buildOutputGraph> | null = null

async function getOrInit() {
  if (!tabManager || !interviewGraph || !outputGraph) {
    tabManager = new TabManager()
    const restored = await tabManager.tryRestore()
    if (!restored) await tabManager.init()
    interviewGraph = buildInterviewGraph(tabManager)
    outputGraph = buildOutputGraph(tabManager)
  }
  return { tabManager, interviewGraph, outputGraph }
}

function notifySidePanel(message: MessageType) {
  chrome.runtime.sendMessage(message).catch(() => {})
}

chrome.runtime.onMessage.addListener((message: MessageType, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch(err => {
      sendResponse({ error: (err as Error).message })
      notifySidePanel({ type: 'ERROR', payload: (err as Error).message })
    })
  return true
})

async function handleMessage(message: MessageType): Promise<unknown> {
  switch (message.type) {
    case 'INIT_SESSION': {
      const { interviewGraph: ig } = await getOrInit()
      const state = createInitialState()
      await saveState(state)
      const result = await ig.invoke(state) as GraphState
      const lastMsg = result.conversationHistory[result.conversationHistory.length - 1]
      if (lastMsg) notifySidePanel({ type: 'BOT_MESSAGE', payload: lastMsg })
      return { ok: true }
    }

    case 'FILE_UPLOAD': {
      const { interviewGraph: ig } = await getOrInit()
      const savedState = await loadState()
      const state: GraphState = {
        ...(savedState ?? createInitialState()),
        uploadedFiles: message.payload as UploadedFile[],
      }
      await saveState(state)
      const result = await ig.invoke(state) as GraphState
      const lastMsg = result.conversationHistory[result.conversationHistory.length - 1]
      if (lastMsg) notifySidePanel({ type: 'BOT_MESSAGE', payload: lastMsg })
      return { ok: true }
    }

    case 'USER_ANSWER': {
      const { tabManager: tm, interviewGraph: ig, outputGraph: og } = await getOrInit()
      const savedState = await loadState()
      if (!savedState) throw new Error('No active session. Please start a new session.')

      if (savedState.phase === 'review' && (message.payload as string).includes('修改')) {
        const newState: GraphState = { ...savedState, revisionTarget: message.payload as string }
        await saveState(newState)
        const routeUpdate = await routeRevisionNode(newState, tm!)
        const routedState: GraphState = { ...newState, ...routeUpdate }
        await saveState(routedState)
        // Route to output or interview graph based on revision target
        const isOutputRevision = routedState.phase === 'output'
        const result = isOutputRevision
          ? await og.invoke(routedState) as GraphState
          : await ig.invoke(routedState) as GraphState
        notifySidePanel({
          type: 'PREVIEW_READY',
          payload: { document: result.generatedDocument, mermaid: result.generatedMermaid },
        })
        return { ok: true }
      }

      const update = await understandAnswerNode(savedState, tm!, message.payload as string)
      const updatedState: GraphState = { ...savedState, ...update }

      await saveState(updatedState)
      const result = await ig.invoke(updatedState) as GraphState
      const lastMsg = result.conversationHistory[result.conversationHistory.length - 1]

      // Auto-trigger output: only count answers SINCE last output, so subsequent
      // module discussions don't re-trigger immediately
      const totalAnswers = result.conversationHistory.filter(m => m.role === 'user').length
      const newAnswers = totalAnswers - (result.answerCountAtLastOutput ?? 0)
      const isDone = result.phase === 'done'
      const hasEnoughInfo =
        (result.featureList.length > 0 || result.systemOverview) &&
        result.businessRules &&
        result.integrations
      const reachedLimit = newAnswers >= 6

      if (isDone || (hasEnoughInfo && newAnswers >= 3) || reachedLimit) {
        notifySidePanel({ type: 'GENERATING_OUTPUT' })
        const outputState: GraphState = { ...result, phase: 'output' }
        await saveState(outputState)
        const outputResult = await og.invoke(outputState) as GraphState
        // Remember answer count so next module's auto-trigger only counts new answers
        const finalState: GraphState = { ...outputResult, answerCountAtLastOutput: totalAnswers }
        await saveState(finalState)
        notifySidePanel({
          type: 'PREVIEW_READY',
          payload: { document: outputResult.generatedDocument, mermaid: outputResult.generatedMermaid },
        })
      } else {
        if (lastMsg) notifySidePanel({ type: 'BOT_MESSAGE', payload: lastMsg })
      }
      return { ok: true }
    }

    case 'CONTINUE_DISCUSSION': {
      const savedState = await loadState()
      if (!savedState) throw new Error('No active session')

      // Keep accumulated features/system info; ask for the next module
      const botMsg = {
        role: 'bot' as const,
        content: '好的！請告訴我下一個您想討論的模組或功能是什麼？',
        timestamp: Date.now(),
        suggestions: undefined,
      }
      const continued: GraphState = {
        ...savedState,
        phase: 'features',
        pendingQuestion: botMsg.content,
        pendingSuggestions: [],
        conversationHistory: [...savedState.conversationHistory, botMsg],
      }
      await saveState(continued)
      notifySidePanel({ type: 'BOT_MESSAGE', payload: botMsg })
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

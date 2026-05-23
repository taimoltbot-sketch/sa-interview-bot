import { TabManager } from './tabManager'
import { buildInterviewGraph, buildOutputGraph } from './graph'
import { loadState, saveState, createInitialState } from './stateStorage'
import { understandAnswerNode } from './nodes/understandAnswer'
import { routeRevisionNode } from './nodes/routeRevision'
import { generatePreviewFlowchart } from './nodes/generatePreviewFlowchart'
import { notifyStatus } from './notify'
import type { GraphState, MessageType, UploadedFile, ChatMessage } from '../types/index'

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

// Mermaid syntax sniffer — used to validate that a fenced block actually
// contains a diagram (rather than e.g. JSON or stray prose Gemini wrapped in ```).
const MERMAID_KEYWORDS = /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|mindmap|timeline|quadrantChart|requirementDiagram)/m

// Split GENERATE_MERMAID_PROMPT output into individual {title, code} diagrams.
// Mirrors htmlReport.ts:extractDiagrams so SA's chat review and the downloaded
// report show the same set. Accepts ``` blocks with OR without the "mermaid"
// language tag — Gemini occasionally emits plain ``` (sometimes preceded by
// "Code snippet" from its own UI), but if the content starts with flowchart /
// sequenceDiagram / etc. it's still a valid diagram.
function parseDiagrams(mermaidText: string): Array<{ title: string; code: string }> {
  if (!mermaidText) return []
  const out: Array<{ title: string; code: string }> = []
  const sections = mermaidText.split(/(?=^##\s+)/m).filter(s => s.trim())
  for (const section of sections) {
    const titleMatch = section.match(/^##\s+(.+)/m)
    // Walk every fenced block in the section, keep the first one that looks
    // like mermaid (skips "Code snippet" pseudo-fences or other prose).
    const allFences = [...section.matchAll(/```(?:mermaid)?\s*\n([\s\S]*?)```/g)]
    for (const m of allFences) {
      const code = m[1].trim()
      if (MERMAID_KEYWORDS.test(code)) {
        out.push({ title: titleMatch ? titleMatch[1].trim() : '流程圖', code })
        break
      }
    }
  }
  if (out.length === 0) {
    const fences = [...mermaidText.matchAll(/```(?:mermaid)?\s*\n([\s\S]*?)```/g)]
    fences.forEach((m, i) => {
      const code = m[1].trim()
      if (MERMAID_KEYWORDS.test(code)) {
        out.push({ title: `圖 ${i + 1}`, code })
      }
    })
  }
  return out
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
      notifyStatus('正在開啟 Gemini 大腦...')
      const { interviewGraph: ig } = await getOrInit()
      const state = createInitialState()
      await saveState(state)
      notifyStatus('正在準備第一個問題...')
      const result = await ig.invoke(state) as GraphState
      const lastMsg = result.conversationHistory[result.conversationHistory.length - 1]
      if (lastMsg) notifySidePanel({ type: 'BOT_MESSAGE', payload: lastMsg })
      return { ok: true }
    }

    case 'FILE_UPLOAD': {
      notifyStatus('正在開啟 Gemini 大腦...')
      const { interviewGraph: ig } = await getOrInit()
      const savedState = await loadState()
      const state: GraphState = {
        ...(savedState ?? createInitialState()),
        uploadedFiles: message.payload as UploadedFile[],
      }
      await saveState(state)
      notifyStatus('正在分析您上傳的資料...')
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
          payload: { document: result.generatedDocument, mermaid: result.generatedMermaid, systemName: result.systemName, htmlContent: result.generatedHtmlContent },
        })
        return { ok: true }
      }

      // Special: user confirmed the inline flowchart preview → run full output now
      if (savedState.awaitingConfirmation && message.payload === '__CONFIRM_OUTPUT__') {
        notifySidePanel({ type: 'GENERATING_OUTPUT' })
        const outputState: GraphState = { ...savedState, phase: 'output', awaitingConfirmation: false }
        await saveState(outputState)
        const outputResult = await og.invoke(outputState) as GraphState
        const totalAnswers = outputResult.conversationHistory.filter(m => m.role === 'user').length

        const diagrams = parseDiagrams(outputResult.generatedMermaid)

        // No diagrams parsed → skip review, go straight to preview screen
        if (diagrams.length === 0) {
          const finalState: GraphState = { ...outputResult, answerCountAtLastOutput: totalAnswers, awaitingConfirmation: false, awaitingDiagramConfirmation: false }
          await saveState(finalState)
          notifySidePanel({
            type: 'PREVIEW_READY',
            payload: { document: outputResult.generatedDocument, mermaid: outputResult.generatedMermaid, systemName: outputResult.systemName, htmlContent: outputResult.generatedHtmlContent },
          })
          return { ok: true }
        }

        // Show all diagrams in chat for review; only emit PREVIEW_READY after SA confirms
        const reviewMsg: ChatMessage = {
          role: 'bot',
          content: `我已產出 ${diagrams.length} 張流程圖，請逐一檢查（點圖可放大、拖曳、縮放）。確認無誤後點下方按鈕產出完整報告：`,
          timestamp: Date.now(),
          diagrams,
          actions: [
            { label: '✓ 全部正確，產出完整報告', value: '__CONFIRM_DIAGRAMS__' },
            { label: '需要修改', value: '我覺得某些流程圖需要調整，請繼續追問細節' },
          ],
        }
        const reviewState: GraphState = {
          ...outputResult,
          answerCountAtLastOutput: totalAnswers,
          awaitingConfirmation: false,
          awaitingDiagramConfirmation: true,
          conversationHistory: [...outputResult.conversationHistory, reviewMsg],
        }
        await saveState(reviewState)
        notifySidePanel({ type: 'BOT_MESSAGE', payload: reviewMsg })
        return { ok: true }
      }

      // Special: user confirmed all diagrams → emit PREVIEW_READY now
      if (savedState.awaitingDiagramConfirmation && message.payload === '__CONFIRM_DIAGRAMS__') {
        const finalState: GraphState = { ...savedState, awaitingDiagramConfirmation: false }
        await saveState(finalState)
        notifySidePanel({
          type: 'PREVIEW_READY',
          payload: { document: savedState.generatedDocument, mermaid: savedState.generatedMermaid, systemName: savedState.systemName, htmlContent: savedState.generatedHtmlContent },
        })
        return { ok: true }
      }

      // If user typed a normal reply while awaiting confirmation → treat as revision request, continue interview
      const stateForFlow: GraphState = (savedState.awaitingConfirmation || savedState.awaitingDiagramConfirmation)
        ? { ...savedState, awaitingConfirmation: false, awaitingDiagramConfirmation: false }
        : savedState

      notifyStatus('正在理解您的回答...')
      const update = await understandAnswerNode(stateForFlow, tm!, message.payload as string)
      const updatedState: GraphState = { ...stateForFlow, ...update }

      await saveState(updatedState)
      notifyStatus('正在思考下一個問題...')
      const result = await ig.invoke(updatedState) as GraphState
      const lastMsg = result.conversationHistory[result.conversationHistory.length - 1]

      // Auto-trigger flowchart preview: defer to the decision brain's own assessment
      // of whether the current module's flow has enough branching to be useful
      const totalAnswers = result.conversationHistory.filter(m => m.role === 'user').length
      const newAnswers = totalAnswers - (result.answerCountAtLastOutput ?? 0)
      const isDone = result.phase === 'done'
      const flowReady = result.flowReadiness?.ready === true
        && result.flowReadiness.decisionPointsCount >= 2
        && result.flowReadiness.hasExceptionFlow === true
      const reachedLimit = newAnswers >= 8 // hard ceiling so we don't loop forever

      if (isDone || (flowReady && newAnswers >= 3) || reachedLimit) {
        // STAGE 1: generate quick inline flowchart for SA confirmation (don't run full output yet)
        notifySidePanel({ type: 'GENERATING_OUTPUT' })
        notifyStatus('正在繪製主流程預覽圖...')
        const previewMermaid = await generatePreviewFlowchart(result, tm!)
        const confirmMsg: ChatMessage = {
          role: 'bot',
          content: '我已根據您的回答整理出主業務流程，請確認流程是否正確：',
          timestamp: Date.now(),
          mermaidPreview: previewMermaid,
          actions: [
            { label: '✓ 正確，產出完整報告', value: '__CONFIRM_OUTPUT__' },
            { label: '需要修改', value: '我覺得流程有些地方需要調整，請繼續追問細節' },
          ],
        }
        const confirmState: GraphState = {
          ...result,
          awaitingConfirmation: true,
          conversationHistory: [...result.conversationHistory, confirmMsg],
        }
        await saveState(confirmState)
        notifySidePanel({ type: 'BOT_MESSAGE', payload: confirmMsg })
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

import { TabManager } from './tabManager'
import { buildInterviewGraph, buildOutputGraph } from './graph'
import { loadState, saveState, createInitialState } from './stateStorage'
import { understandAnswerNode } from './nodes/understandAnswer'
import { routeRevisionNode } from './nodes/routeRevision'
import { generatePreviewFlowchart } from './nodes/generatePreviewFlowchart'
import { verifyLogicNode } from './nodes/verifyLogic'
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

async function enterDiagramReviewOrPreview(
  outputResult: GraphState,
  totalAnswers: number
): Promise<void> {
  const diagrams = parseDiagrams(outputResult.generatedMermaid)
  if (diagrams.length === 0) {
    const finalState: GraphState = { ...outputResult, answerCountAtLastOutput: totalAnswers, awaitingConfirmation: false, awaitingDiagramConfirmation: false }
    await saveState(finalState)
    notifySidePanel({
      type: 'PREVIEW_READY',
      payload: { document: outputResult.generatedDocument, mermaid: outputResult.generatedMermaid, systemName: outputResult.systemName, htmlContent: outputResult.generatedHtmlContent },
    })
    return
  }
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
        await enterDiagramReviewOrPreview(outputResult, totalAnswers)
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

      // Special: user confirmed a verify_logic slice → store it, then decide
      // whether to continue interviewing or auto-fire the output graph.
      if (savedState.awaitingLogicConfirmation && message.payload === '__CONFIRM_LOGIC__') {
        const slice = savedState.pendingLogicSlice
        if (!slice) {
          notifySidePanel({ type: 'ERROR', payload: 'pendingLogicSlice 遺失，請重新回答一次' })
          return { ok: true }
        }
        const updated: GraphState = {
          ...savedState,
          verified_logics: [...savedState.verified_logics, slice],
          awaitingLogicConfirmation: false,
          pendingLogicSlice: null,
          currentFeatureAnswerCount: 0,
        }
        await saveState(updated)
        notifySidePanel({ type: 'BOT_MESSAGE', payload: {
          role: 'bot',
          content: `✓ 已記錄「${slice.featureName}」邏輯。已累計 ${updated.verified_logics.length} 個切片。`,
          timestamp: Date.now(),
        }})

        const result = await ig.invoke(updated) as GraphState
        const lastMsg = result.conversationHistory[result.conversationHistory.length - 1]
        const interviewDone = result.flowReadiness?.ready === true && result.verified_logics.length >= 2

        if (interviewDone) {
          notifySidePanel({ type: 'GENERATING_OUTPUT' })
          notifyStatus('正在彙整所有已確認邏輯，產出完整報告...')
          const outputState: GraphState = { ...result, phase: 'output' }
          await saveState(outputState)
          const outputResult = await og.invoke(outputState) as GraphState
          const totalAnswers = outputResult.conversationHistory.filter(m => m.role === 'user').length
          await enterDiagramReviewOrPreview(outputResult, totalAnswers)
        } else {
          if (lastMsg) notifySidePanel({ type: 'BOT_MESSAGE', payload: lastMsg })
        }
        return { ok: true }
      }

      // If user typed a normal reply while awaiting confirmation → treat as revision request, continue interview
      const stateForFlow: GraphState = (savedState.awaitingConfirmation || savedState.awaitingDiagramConfirmation || savedState.awaitingLogicConfirmation)
        ? { ...savedState, awaitingConfirmation: false, awaitingDiagramConfirmation: false, awaitingLogicConfirmation: false, pendingLogicSlice: null }
        : savedState

      notifyStatus('正在理解您的回答...')
      const update = await understandAnswerNode(stateForFlow, tm!, message.payload as string)
      const newFeatureName = update.currentFeatureName ?? stateForFlow.currentFeatureName
      const featureChanged = !!newFeatureName && newFeatureName !== stateForFlow.currentFeatureName
      const countAfter = featureChanged ? 1 : (stateForFlow.currentFeatureAnswerCount ?? 0) + 1
      const updatedState: GraphState = {
        ...stateForFlow,
        ...update,
        currentFeatureName: newFeatureName,
        currentFeatureAnswerCount: countAfter,
      }

      await saveState(updatedState)
      notifyStatus('正在思考下一個問題...')
      const result = await ig.invoke(updatedState) as GraphState
      const lastMsg = result.conversationHistory[result.conversationHistory.length - 1]

      // After interview graph runs, decide whether to fire a verify_logic
      // checkpoint. Replaces the old generatePreviewFlowchart trigger.
      // (generatePreviewFlowchart.ts is kept as dead code for now.)
      const logicReady = result.logicReadiness?.ready === true
      const cnt = result.currentFeatureAnswerCount ?? 0
      const reachedCap = cnt >= 6 && (cnt - 6) % 3 === 0

      if (logicReady || reachedCap) {
        notifySidePanel({ type: 'GENERATING_OUTPUT' })
        const slice = await verifyLogicNode(result, tm!)
        if (!slice) {
          if (lastMsg) notifySidePanel({ type: 'BOT_MESSAGE', payload: lastMsg })
          return { ok: true }
        }
        const verifyMsg: ChatMessage = {
          role: 'bot',
          content: `請確認以下「${slice.featureName}」的業務邏輯是否正確：`,
          timestamp: Date.now(),
          logicSlice: slice,
          actions: [
            { label: '✓ 沒錯，記錄此邏輯', value: '__CONFIRM_LOGIC__' },
            { label: '❌ 不對，我要調整', value: '我覺得這個邏輯有錯，請繼續追問細節' },
          ],
        }
        const verifyState: GraphState = {
          ...result,
          awaitingLogicConfirmation: true,
          pendingLogicSlice: slice,
          conversationHistory: [...result.conversationHistory, verifyMsg],
        }
        await saveState(verifyState)
        notifySidePanel({ type: 'BOT_MESSAGE', payload: verifyMsg })
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

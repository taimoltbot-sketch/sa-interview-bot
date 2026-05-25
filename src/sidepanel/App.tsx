import { useState, useEffect, useCallback, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import ChatPanel from './components/ChatPanel'
import FileUpload from './components/FileUpload'
import Preview from './components/Preview'
import type { ChatMessage, MessageType, UploadedFile } from '../types/index'

type AppView = 'chat' | 'preview'

const fadeSlide = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.16, ease: 'easeIn' } },
}

export default function App() {
  const [view, setView] = useState<AppView>('chat')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingStatus, setLoadingStatus] = useState('')
  const [queue, setQueue] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const [previewData, setPreviewData] = useState({ document: '', mermaid: '', systemName: '', htmlContent: '' })
  const [sessionStarted, setSessionStarted] = useState(false)

  // Refs mirror state so handleUserSend can check current values synchronously
  // (avoids race conditions when SA fires multiple messages rapidly)
  const loadingRef = useRef(false)
  const queueRef = useRef<string[]>([])
  useEffect(() => { loadingRef.current = loading }, [loading])
  useEffect(() => { queueRef.current = queue }, [queue])

  // Mark the first queued user message as no-longer-queued (used when we drain the queue)
  const markFirstQueuedAsSent = (msgs: ChatMessage[]): ChatMessage[] => {
    const idx = msgs.findIndex(m => m.role === 'user' && m.queued)
    if (idx === -1) return msgs
    return msgs.map((m, i) => i === idx ? { ...m, queued: false } : m)
  }

  // After a BOT_MESSAGE arrives, drain one item from the queue if any remain.
  // Returns whether we still have work in flight.
  const drainQueue = (): boolean => {
    const q = queueRef.current
    if (q.length === 0) return false
    const [next, ...rest] = q
    setQueue(rest)
    queueRef.current = rest
    setMessages(prev => markFirstQueuedAsSent(prev))
    chrome.runtime.sendMessage({ type: 'USER_ANSWER', payload: next })
    return true
  }

  useEffect(() => {
    const listener = (message: MessageType) => {
      if (message.type === 'BOT_MESSAGE') {
        setMessages(prev => [...prev, message.payload])
        // A bot message arriving means we're past any GENERATING_OUTPUT phase
        // (e.g. the inline flowchart confirmation step). Unlock the input.
        setGenerating(false)
        // Drain queue OR mark idle
        const stillBusy = drainQueue()
        if (!stillBusy) {
          setLoading(false)
          setLoadingStatus('')
        }
      } else if (message.type === 'STATUS_UPDATE') {
        setLoadingStatus(message.payload)
      } else if (message.type === 'GENERATING_OUTPUT') {
        setGenerating(true)
        setLoading(true)
      } else if (message.type === 'PREVIEW_READY') {
        setPreviewData(prev => ({ ...prev, ...message.payload }))
        setView('preview')
        setLoading(false)
        setLoadingStatus('')
        setGenerating(false)
        setQueue([])
        queueRef.current = []
      } else if (message.type === 'RESET_DONE') {
        // New project: wipe all local UI state back to the welcome screen.
        setMessages([])
        setQueue([])
        queueRef.current = []
        setPreviewData({ document: '', mermaid: '', systemName: '', htmlContent: '' })
        setView('chat')
        setSessionStarted(false)
        setLoading(false)
        loadingRef.current = false
        setLoadingStatus('')
        setGenerating(false)
      } else if (message.type === 'ERROR') {
        setMessages(prev => [...prev, {
          role: 'bot' as const,
          content: `錯誤：${message.payload}`,
          timestamp: Date.now(),
        }])
        // Drop the queue on error — chain is interrupted
        setLoading(false)
        setLoadingStatus('')
        setGenerating(false)
        setQueue([])
        queueRef.current = []
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startSession = useCallback(async () => {
    setLoading(true)
    loadingRef.current = true
    setSessionStarted(true)
    await chrome.runtime.sendMessage({ type: 'INIT_SESSION' })
  }, [])

  const handleUserSend = useCallback(async (text: string, displayText?: string) => {
    const content = displayText ?? text
    const wasBusy = loadingRef.current

    if (wasBusy) {
      // Queue: append user message with queued flag + push text to queue
      setMessages(prev => [...prev, {
        role: 'user' as const,
        content,
        timestamp: Date.now(),
        queued: true,
      }])
      setQueue(prev => {
        const next = [...prev, text]
        queueRef.current = next
        return next
      })
    } else {
      // Send immediately
      loadingRef.current = true
      setLoading(true)
      setMessages(prev => [...prev, {
        role: 'user' as const,
        content,
        timestamp: Date.now(),
      }])
      await chrome.runtime.sendMessage({ type: 'USER_ANSWER', payload: text })
    }
  }, [])

  const handleFileUpload = useCallback(async (files: UploadedFile[]) => {
    setSessionStarted(true)
    setLoading(true)
    loadingRef.current = true
    await chrome.runtime.sendMessage({ type: 'FILE_UPLOAD', payload: files })
  }, [])

  const handleRevision = useCallback(async (request: string) => {
    setView('chat')
    setMessages(prev => [...prev, { role: 'user' as const, content: request, timestamp: Date.now() }])
    setLoading(true)
    loadingRef.current = true
    await chrome.runtime.sendMessage({ type: 'USER_ANSWER', payload: request })
  }, [])

  const handleContinueDiscussion = useCallback(async () => {
    setView('chat')
    setLoading(true)
    loadingRef.current = true
    await chrome.runtime.sendMessage({ type: 'CONTINUE_DISCUSSION' })
  }, [])

  const handleResetAll = useCallback(async () => {
    const ok = window.confirm('會清除目前專案的所有對話並開啟全新大腦（換討論不同專案時用）。確定要全部刷新嗎？')
    if (!ok) return
    setLoading(true)
    loadingRef.current = true
    setLoadingStatus('正在清除目前專案並開啟全新大腦...')
    await chrome.runtime.sendMessage({ type: 'RESET_ALL' })
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-brand">
          <div className="header-icon">✦</div>
          <h1>SA Interview Bot</h1>
        </div>
        <div className="header-actions">
          {view === 'preview' && (
            <button className="back-btn" onClick={() => setView('chat')}>← 返回</button>
          )}
          <button className="reset-btn" onClick={handleResetAll} title="清除目前專案、開啟全新大腦" disabled={loading}>🔄 新專案</button>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {!sessionStarted ? (
          <motion.div key="welcome" className="welcome" {...fadeSlide}>
            <div className="welcome-icon">✦</div>
            <div className="welcome-text">
              <h2>系統分析訪談助手</h2>
              <p>引導你描述系統功能，自動產出業務流程文件與 Mermaid 圖表</p>
            </div>
            <div className="welcome-actions">
              <FileUpload onUpload={handleFileUpload} disabled={loading} variant="welcome" />
              <button onClick={startSession} disabled={loading} className="start-btn">
                {loading ? '初始化中...' : '開始對話'}
              </button>
            </div>
          </motion.div>
        ) : view === 'chat' ? (
          <motion.div key="chat" className="chat-view" {...fadeSlide}>
            <FileUpload onUpload={handleFileUpload} disabled={generating} />
            <ChatPanel messages={messages} onSend={handleUserSend} disabled={generating} loading={loading} loadingStatus={loadingStatus} queueCount={queue.length} />
          </motion.div>
        ) : (
          <motion.div key="preview" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }} {...fadeSlide}>
            <Preview
              document={previewData.document}
              mermaidText={previewData.mermaid}
              systemName={previewData.systemName}
              htmlContent={previewData.htmlContent}
              onRequestRevision={handleRevision}
              onContinueDiscussion={handleContinueDiscussion}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

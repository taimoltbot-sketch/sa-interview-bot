import { useState, useEffect, useCallback } from 'react'
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
  const [previewData, setPreviewData] = useState({ document: '', mermaid: '', systemName: '' })
  const [sessionStarted, setSessionStarted] = useState(false)

  useEffect(() => {
    const listener = (message: MessageType) => {
      if (message.type === 'BOT_MESSAGE') {
        setMessages(prev => [...prev, message.payload])
        setLoading(false)
        setLoadingStatus('')
      } else if (message.type === 'STATUS_UPDATE') {
        setLoadingStatus(message.payload)
      } else if (message.type === 'GENERATING_OUTPUT') {
        setLoading(true)
      } else if (message.type === 'PREVIEW_READY') {
        setPreviewData(prev => ({ ...prev, ...message.payload }))
        setView('preview')
        setLoading(false)
        setLoadingStatus('')
      } else if (message.type === 'ERROR') {
        setMessages(prev => [...prev, {
          role: 'bot' as const,
          content: `錯誤：${message.payload}`,
          timestamp: Date.now(),
        }])
        setLoading(false)
        setLoadingStatus('')
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  const startSession = useCallback(async () => {
    setLoading(true)
    setSessionStarted(true)
    await chrome.runtime.sendMessage({ type: 'INIT_SESSION' })
  }, [])

  const handleUserSend = useCallback(async (text: string, displayText?: string) => {
    setMessages(prev => [...prev, { role: 'user' as const, content: displayText ?? text, timestamp: Date.now() }])
    setLoading(true)
    await chrome.runtime.sendMessage({ type: 'USER_ANSWER', payload: text })
  }, [])

  const handleFileUpload = useCallback(async (files: UploadedFile[]) => {
    setSessionStarted(true)
    setLoading(true)
    await chrome.runtime.sendMessage({ type: 'FILE_UPLOAD', payload: files })
  }, [])

  const handleRevision = useCallback(async (request: string) => {
    setView('chat')
    setMessages(prev => [...prev, { role: 'user' as const, content: request, timestamp: Date.now() }])
    setLoading(true)
    await chrome.runtime.sendMessage({ type: 'USER_ANSWER', payload: request })
  }, [])

  const handleContinueDiscussion = useCallback(async () => {
    setView('chat')
    setLoading(true)
    await chrome.runtime.sendMessage({ type: 'CONTINUE_DISCUSSION' })
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-brand">
          <div className="header-icon">✦</div>
          <h1>SA Interview Bot</h1>
        </div>
        {view === 'preview' && (
          <button className="back-btn" onClick={() => setView('chat')}>← 返回</button>
        )}
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
            <FileUpload onUpload={handleFileUpload} disabled={loading} />
            <ChatPanel messages={messages} onSend={handleUserSend} disabled={loading} loading={loading} loadingStatus={loadingStatus} />
          </motion.div>
        ) : (
          <motion.div key="preview" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }} {...fadeSlide}>
            <Preview
              document={previewData.document}
              mermaidText={previewData.mermaid}
              systemName={previewData.systemName}
              onRequestRevision={handleRevision}
              onContinueDiscussion={handleContinueDiscussion}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

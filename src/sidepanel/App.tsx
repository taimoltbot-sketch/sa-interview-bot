import { useState, useEffect, useCallback } from 'react'
import ChatPanel from './components/ChatPanel'
import FileUpload from './components/FileUpload'
import Preview from './components/Preview'
import type { ChatMessage, MessageType, UploadedFile } from '../types/index'

type AppView = 'chat' | 'preview'

export default function App() {
  const [view, setView] = useState<AppView>('chat')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [previewData, setPreviewData] = useState({ document: '', mermaid: '', systemName: '' })
  const [sessionStarted, setSessionStarted] = useState(false)

  useEffect(() => {
    const listener = (message: MessageType) => {
      if (message.type === 'BOT_MESSAGE') {
        setMessages(prev => [...prev, message.payload])
        setLoading(false)
      } else if (message.type === 'PREVIEW_READY') {
        setPreviewData(prev => ({ ...prev, ...message.payload }))
        setView('preview')
        setLoading(false)
      } else if (message.type === 'ERROR') {
        setMessages(prev => [...prev, {
          role: 'bot' as const,
          content: `錯誤：${message.payload}`,
          timestamp: Date.now(),
        }])
        setLoading(false)
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

  const handleUserSend = useCallback(async (text: string) => {
    setLoading(true)
    await chrome.runtime.sendMessage({ type: 'USER_ANSWER', payload: text })
  }, [])

  const handleFileUpload = useCallback(async (files: UploadedFile[]) => {
    setLoading(true)
    await chrome.runtime.sendMessage({ type: 'FILE_UPLOAD', payload: files })
  }, [])

  const handleRevision = useCallback(async (request: string) => {
    setView('chat')
    setLoading(true)
    await chrome.runtime.sendMessage({ type: 'USER_ANSWER', payload: request })
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <h1>SA Interview Bot</h1>
        {view === 'preview' && (
          <button onClick={() => setView('chat')}>← 返回對話</button>
        )}
      </header>

      {!sessionStarted ? (
        <div className="welcome">
          <p>這個工具會引導你描述系統功能，並自動產出業務流程文件與 Mermaid 圖。</p>
          <p>你可以先上傳截圖或 Excel，Bot 會幫你分析並開始引導。</p>
          <FileUpload onUpload={handleFileUpload} disabled={loading} />
          <button onClick={startSession} disabled={loading} className="start-btn">
            {loading ? '初始化中...' : '開始對話'}
          </button>
        </div>
      ) : view === 'chat' ? (
        <div className="chat-view">
          <FileUpload onUpload={handleFileUpload} disabled={loading} />
          <ChatPanel messages={messages} onSend={handleUserSend} disabled={loading} />
          {loading && <div className="loading">Bot 思考中...</div>}
        </div>
      ) : (
        <Preview
          document={previewData.document}
          mermaidText={previewData.mermaid}
          systemName={previewData.systemName}
          onRequestRevision={handleRevision}
        />
      )}
    </div>
  )
}

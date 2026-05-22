import { useState, useRef, useEffect } from 'react'
import type { ChatMessage } from '../../types/index'

interface Props {
  messages: ChatMessage[]
  onSend: (text: string) => void
  disabled?: boolean
}

export default function ChatPanel({ messages, onSend, disabled }: Props) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    const text = input.trim()
    if (!text || disabled) return
    onSend(text)
    setInput('')
  }

  return (
    <div className="chat-panel">
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message message-${msg.role}`}>
            <div className="bubble">{msg.content}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="input-row">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="輸入回答（Enter 送出，Shift+Enter 換行）"
          disabled={disabled}
          rows={3}
        />
        <button onClick={handleSend} disabled={disabled || !input.trim()}>
          送出
        </button>
      </div>
    </div>
  )
}

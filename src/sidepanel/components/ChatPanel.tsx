import { useState, useRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ChatMessage } from '../../types/index'

interface Props {
  messages: ChatMessage[]
  onSend: (text: string) => void
  disabled?: boolean
  loading?: boolean
}

function TypingIndicator() {
  return (
    <motion.div
      className="typing-wrap"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.2 }}
    >
      <div className="bot-header">
        <div className="bot-avatar">AI</div>
        <span className="bot-name">Assistant</span>
      </div>
      <div className="typing-indicator">
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            className="typing-dot"
            animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.22, ease: 'easeInOut' }}
          />
        ))}
      </div>
    </motion.div>
  )
}

const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
)

export default function ChatPanel({ messages, onSend, disabled, loading }: Props) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleSend = () => {
    const text = input.trim()
    if (!text || disabled) return
    onSend(text)
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  return (
    <div className="chat-panel">
      <div className="messages">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              className={`message message-${msg.role}`}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              {msg.role === 'bot' && (
                <div className="bot-header">
                  <div className="bot-avatar">AI</div>
                  <span className="bot-name">Assistant</span>
                </div>
              )}
              <div className="bubble">{msg.content}</div>
            </motion.div>
          ))}
          {loading && <TypingIndicator key="typing" />}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      <div className="input-row">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="輸入回答（Enter 送出，Shift+Enter 換行）"
          disabled={disabled}
          rows={2}
        />
        <motion.button
          className="send-btn"
          onClick={handleSend}
          disabled={disabled || !input.trim()}
          whileTap={{ scale: 0.92 }}
        >
          <SendIcon />
        </motion.button>
      </div>
    </div>
  )
}

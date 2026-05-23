import type { GraphState, ChatMessage } from '../../types/index'

export function askQuestionNode(state: GraphState): Partial<GraphState> {
  const content = state.pendingQuestion || '請描述一下這個系統的主要目的是什麼？'
  const botMessage: ChatMessage = {
    role: 'bot',
    content,
    timestamp: Date.now(),
    suggestions: state.pendingSuggestions?.length ? state.pendingSuggestions : undefined,
  }
  return {
    conversationHistory: [...state.conversationHistory, botMessage],
  }
}

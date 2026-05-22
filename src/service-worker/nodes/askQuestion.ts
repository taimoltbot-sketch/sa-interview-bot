import type { GraphState, ChatMessage } from '../../types/index'

export function askQuestionNode(state: GraphState): Partial<GraphState> {
  const botMessage: ChatMessage = {
    role: 'bot',
    content: state.pendingQuestion,
    timestamp: Date.now(),
  }
  return {
    conversationHistory: [...state.conversationHistory, botMessage],
  }
}

export type TabRole = 'decision' | 'understanding' | 'output'

export interface TabRegistry {
  decision: number
  understanding: number
  output: number
}

export interface UploadedFile {
  type: 'image' | 'excel'
  name: string
  content: string        // base64（圖片）或 Markdown 表格（Excel）
  mimeType: string
}

export interface FeatureInfo {
  name: string
  trigger: string
  mainFlow: string[]
  exceptionFlow: string[]
  dataFields: string[]
  endState: string
}

export interface VerifiedLogic {
  featureName: string
  trigger: string
  mainFlow: string[]
  decisionPoints: Array<{
    condition: string
    branches: Array<{ case: string; result: string }>
  }>
  exceptionFlow: Array<{ name: string; trigger: string; handling: string }>
  endStates: string[]
  verifiedAt: number
}

export interface GraphState {
  phase: 'upload' | 'overview' | 'roles' | 'features' | 'integration' | 'rules' | 'output' | 'review' | 'done'
  systemName: string
  uploadedFiles: UploadedFile[]
  analyzedData: Record<string, unknown>
  missingInfo: string[]
  systemOverview: string
  userRoles: string[]
  featureList: string[]
  currentFeatureIndex: number
  features: FeatureInfo[]
  integrations: string
  businessRules: string
  consolidatedJson: string
  generatedDocument: string
  generatedHtmlContent: string
  generatedMermaid: string
  conversationHistory: ChatMessage[]
  pendingQuestion: string
  pendingSuggestions: string[]
  pendingMultiSelect: boolean
  flowReadiness: FlowReadiness
  revisionTarget: string
  answerCountAtLastOutput: number
  awaitingConfirmation: boolean
  awaitingDiagramConfirmation: boolean
  verified_logics: VerifiedLogic[]
  awaitingLogicConfirmation: boolean
  pendingLogicSlice: VerifiedLogic | null
  currentFeatureName: string
  currentFeatureAnswerCount: number
  logicReadiness: { ready: boolean; reason: string }
}

export interface FlowReadiness {
  ready: boolean
  decisionPointsCount: number
  hasExceptionFlow: boolean
  endStatesCount: number
  reason: string
}

export interface ChatMessage {
  role: 'bot' | 'user'
  content: string
  timestamp: number
  suggestions?: string[]
  multiSelect?: boolean
  mermaidPreview?: string
  diagrams?: Array<{ title: string; code: string }>
  logicSlice?: VerifiedLogic
  actions?: Array<{ label: string; value: string }>
  queued?: boolean
}

export type MessageType =
  | { type: 'INIT_SESSION' }
  | { type: 'USER_ANSWER'; payload: string }
  | { type: 'FILE_UPLOAD'; payload: UploadedFile[] }
  | { type: 'REQUEST_DOWNLOAD' }
  | { type: 'CONTINUE_DISCUSSION' }
  | { type: 'RESET_ALL' }
  | { type: 'RESET_DONE' }
  | { type: 'BOT_MESSAGE'; payload: ChatMessage }
  | { type: 'STATE_UPDATE'; payload: Partial<GraphState> }
  | { type: 'PREVIEW_READY'; payload: { document: string; mermaid: string; systemName?: string; htmlContent?: string } }
  | { type: 'GENERATING_OUTPUT' }
  | { type: 'STATUS_UPDATE'; payload: string }
  | { type: 'ERROR'; payload: string }

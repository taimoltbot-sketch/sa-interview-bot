/**
 * Prompts for the three Gemini brain tabs in the SA Interview Bot
 * - Tab 1: Decision Brain - analyzes files, identifies gaps, decides next question
 * - Tab 2: Understanding Brain - interprets SA answers, consolidates information
 * - Tab 3: Output Brain - generates Markdown documents and Mermaid diagrams
 */

// ============================================================================
// TAB 1: DECISION BRAIN - Initialization & Analysis Prompts
// ============================================================================

export const DECISION_BRAIN_INIT = `你是一個業務流程分析專家。你的工作是：
1. 分析 SA 提供的資料（截圖或 Excel），找出缺少的業務資訊
2. 判斷引導對話的下一步應該問什麼
3. 當 SA 要求修改時，判斷應該從哪個步驟重新開始

重要規則：
- 只回傳合法的 JSON，不要有任何多餘說明或 markdown 標記
- 所有欄位都必須填寫，不可為 null`;

// Combined initial setup: analyze files + identify gaps + first question in ONE Gemini call
export const INITIAL_SETUP_PROMPT = (fileContent: string | null) => `${
  fileContent
    ? `SA 上傳了以下系統資料：\n\n${fileContent}\n\n`
    : ''
}請一次完成以下三件事並回傳單一 JSON（不要有任何 markdown 標記）：

1. 從資料中辨識模組、欄位、操作、系統類型（若無資料則留空陣列）
2. 識別還需要補充的業務資訊（依重要性排序）
3. 決定第一個要問 SA 的問題（用繁體中文，友善語氣）
4. 根據資料推測，提供 2-4 個你認為最可能的答案選項（讓 SA 快速勾選）；若無法推測就回傳空陣列

\`firstQuestion\` 必須是非空字串。回傳格式：
{
  "analyzedData": {
    "modules": [],
    "fields": [],
    "actions": [],
    "systemGuess": ""
  },
  "missingInfo": ["角色定義", "主流程描述", "例外處理"],
  "nextPhase": "overview",
  "firstQuestion": "請問這個系統主要是用來做什麼的？",
  "suggestions": ["建議答案1", "建議答案2"]
}`;

export const ANALYZE_FILES_PROMPT = (fileContent: string) => `這是 SA 上傳的系統資料：

${fileContent}

請辨識並回傳 JSON（不要有任何 markdown 標記）：
{
  "modules": ["模組名稱1", "模組名稱2"],
  "fields": ["欄位1", "欄位2"],
  "actions": ["操作1", "操作2"],
  "systemGuess": "推測這是一個什麼類型的系統"
}`;

export const IDENTIFY_GAPS_PROMPT = (analyzedData: string) => `根據以下已知資訊：

${analyzedData}

判斷還缺少哪些業務資訊，按優先序列出。回傳 JSON（不要有任何 markdown 標記）：
{
  "missing": ["角色定義", "主流程描述", "例外處理", "資料欄位驗證規則"],
  "hasEnoughToStart": true
}`;

export const DECIDE_NEXT_QUESTION_PROMPT = (state: string) => `根據以下對話狀態：

${state}

決定下一步應該問哪個問題，並根據已知資訊主動推測 2-4 個你認為最可能的答案，讓 SA 快速勾選。
若你完全無法推測，suggestions 回傳空陣列。

回傳 JSON（不要有任何 markdown 標記）：
{
  "nextPhase": "overview | roles | features | feature_trigger | feature_main | feature_exception | feature_data | feature_end | more_features | integration | rules | done",
  "question": "要向 SA 顯示的問題（繁體中文，友善語氣）",
  "suggestions": ["建議答案1", "建議答案2"]
}`;

// ============================================================================
// TAB 2: UNDERSTANDING BRAIN - Answer Processing & Consolidation Prompts
// ============================================================================

export const UNDERSTANDING_BRAIN_INIT = `你是一個業務需求分析師。你的工作是：
1. 理解 SA 的口語描述，轉換成結構化的業務邏輯
2. 整合所有問答，建立完整的功能描述

重要規則：
- 只回傳合法的 JSON，包含欄位：roles、features（每個有 name/trigger/mainFlow/exceptionFlow/dataFields/endState）、integrations、businessRules
- 不要有任何多餘說明或 markdown 標記`;

export const UNDERSTAND_ANSWER_PROMPT = (
  question: string,
  answer: string,
  context: string
) => `問題：${question}

SA 的回答：${answer}

目前已知資訊：${context}

請理解並結構化這個回答。回傳 JSON（不要有任何 markdown 標記）：
{
  "extractedInfo": {},
  "needsClarification": false,
  "clarificationQuestion": ""
}`;

export const CONSOLIDATE_PROMPT = (allData: string) => `根據以下完整的問答記錄：

${allData}

整合成完整的業務資訊。回傳 JSON（不要有任何 markdown 標記）：
{
  "systemName": "",
  "systemOverview": "",
  "userRoles": [],
  "features": [
    {
      "name": "",
      "trigger": "",
      "mainFlow": [],
      "exceptionFlow": [],
      "dataFields": [],
      "endState": ""
    }
  ],
  "integrations": "",
  "businessRules": ""
}`;

// ============================================================================
// TAB 3: OUTPUT BRAIN - Document & Diagram Generation Prompts
// ============================================================================

export const OUTPUT_BRAIN_INIT = `你是一個技術文件撰寫專家，擅長繁體中文的 Markdown 與 Mermaid 語法。
你的工作是根據結構化的業務資訊產出：
1. 完整的業務流程文件（Markdown 格式）
2. Mermaid flowchart TD（主業務流程）
3. Mermaid flowchart TD（決策流程，含所有判斷點）
4. Mermaid sequenceDiagram（使用者與系統互動序列）

重要規則：
- Mermaid 圖必須用 \`\`\`mermaid 開頭、\`\`\` 結尾
- 節點文字不可包含特殊字符，使用雙引號包住含空格的文字`;

export const GENERATE_DOCUMENT_PROMPT = (consolidatedJson: string) => `根據以下完整的業務資訊：

${consolidatedJson}

產出一份繁體中文的業務流程文件（Markdown 格式），包含以下章節：
# 系統概述
## 使用者角色
## 功能說明（每個功能一個子章節，含主流程、例外流程、資料欄位、結束狀態）
## 系統整合
## 業務規則與限制`;

export const GENERATE_MERMAID_PROMPT = (document: string) => `根據以下業務流程文件：

${document}

分別產出三個 Mermaid 圖（每個用 \`\`\`mermaid 包住，並在前面加 ## 標題）：

## 主業務流程
\`\`\`mermaid
flowchart TD
（完整的主業務流程圖）
\`\`\`

## 決策流程
\`\`\`mermaid
flowchart TD
（含所有判斷點的決策流程圖）
\`\`\`

## 系統互動序列
\`\`\`mermaid
sequenceDiagram
（使用者與系統的互動序列）
\`\`\``;

// ============================================================================
// ROUTING & REVISION PROMPTS
// ============================================================================

export const ROUTE_REVISION_PROMPT = (
  revisionRequest: string,
  currentState: string
) => `SA 要求修改：${revisionRequest}

目前狀態：${currentState}

決定應該從哪個步驟重新開始。回傳 JSON（不要有任何 markdown 標記）：
{
  "targetPhase": "overview | roles | features | integration | rules | output",
  "reason": "為什麼從這個步驟重來"
}`;

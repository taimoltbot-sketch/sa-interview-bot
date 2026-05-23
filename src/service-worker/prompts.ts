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
5. 判斷這題的選項是「**單選**」還是「**複選**」：
   - 互斥/二選一（例如 是/否、A/B/C 三擇一）→ multiSelect = false
   - 可以同時都成立（例如「有哪些角色？」、「整合哪些系統？」）→ multiSelect = true

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
  "firstQuestion": "請問這個系統有哪些使用者角色？",
  "suggestions": ["{角色佔位符 A}", "{角色佔位符 B}", "{角色佔位符 C}"],
  "multiSelect": true
}

⚠️ suggestions 必須依 SA 上傳的資料或對話內容推測角色，禁止照抄佔位符或預設「管理員/工地/現場/工人/員工」等通用詞 — 若無上下文可推測，回傳空陣列 \`[]\`。`;

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

請同時完成 **A、B、C** 三件事：

────────────────────────────────────────
**A) 決定下一個要問 SA 的問題**

並根據已知資訊主動推測 2-4 個你認為最可能的答案讓 SA 快速勾選（若你完全無法推測，suggestions 回傳空陣列）。

也要判斷這題是「**單選**」還是「**複選**」：
- 互斥/二選一（是/否、A/B/C 三擇一）→ multiSelect = false
- 可同時都成立（有哪些角色？整合哪些系統？）→ multiSelect = true

────────────────────────────────────────
**B) 評估「目前討論的這個模組/功能」的流程豐富度**

判斷現在累積的資訊夠不夠生成一張**對 developer 真正有用**的流程圖。

「**對 developer 有用**」的標準（不只一條線，要有分支）：
- ✅ 主流程至少 3-5 步
- ✅ **至少 2 個決策點**（if/else 分支）—— 例如：權限判斷、資料驗證、條件檢查、是否符合規則
- ✅ 至少 1 條異常路徑（錯誤處理、被拒絕、超時、回退）
- ✅ 多個結束狀態（成功、失敗、待審核、跳轉⋯⋯）

如果流程**還太單線**（只有 happy path），請主動把問題導向：
- 「這一步驗證失敗會怎麼處理？」
- 「有哪些情況會中斷流程？」
- 「不同角色操作到這一步行為一樣嗎？」
- 「資料不符合 X 條件時系統怎麼回應？」

不要急著結束。問問題的時候優先**問判斷條件、邊界情況、錯誤流程**。

────────────────────────────────────────
**C) 判斷整體訪談是否該收尾**（nextPhase = "done"）

只有當當前模組已經 ready=true、且 SA 沒有要繼續討論其他模組時才 done。

────────────────────────────────────────

回傳 JSON（不要有任何 markdown 標記）：
{
  "nextPhase": "overview | roles | features | feature_trigger | feature_main | feature_exception | feature_data | feature_end | more_features | integration | rules | done",
  "question": "要向 SA 顯示的問題（繁體中文，友善語氣）",
  "suggestions": ["建議答案1", "建議答案2"],
  "multiSelect": false,
  "flowReadiness": {
    "ready": false,
    "decisionPointsCount": 1,
    "hasExceptionFlow": false,
    "endStatesCount": 1,
    "reason": "目前只有單線主流程，缺少權限驗證失敗的處理與審核拒絕後的流向"
  }
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

整合成 developer-ready 的結構化業務資訊。**這份資料會被用來產出流程圖給工程師看，必須具體到「誰點哪個按鈕、系統如何回應、連到哪個模組」**。

**重要 — 每個 mainFlow / exceptionFlow 步驟必須是「角色 → 操作 → 系統反應」三段式**，結構範例（佔位符，請依 SA 實際描述的領域與用詞填入，不要套用本範例的營造/施工/購物車等情境）：
- ✅ "{角色名} 在「{頁面名}」頁面，於「{欄位名}」{下拉選單/輸入框/按鈕} {選/填/點} {值} → 系統 {從「{來源模組}」讀取 / 寫入「{目標資料表}」/ 觸發「{後續模組}」}"
- ❌ "{單一動詞}"（缺角色、UI 位置、後台行為）

⚠️ 嚴禁：若 SA 沒提到營造、施工、工地、人機料、購物車、班別、日報等詞，輸出絕對不可出現這些字 — 它們只是本 prompt 的結構示意，不是預設領域。

**每個功能必須列出 decisionPoints**（讓決策流程圖有東西畫）：
- 系統檢查什麼欄位/值/權限
- 不同分支走到哪
- 資料來自哪個模組

回傳 JSON（不要有任何 markdown 標記）：
{
  "systemName": "",
  "systemOverview": "2-3 句說明系統做什麼、給誰用、解決什麼業務問題",
  "userRoles": [
    { "name": "角色名稱", "responsibility": "職責 + 主要操作範圍" }
  ],
  "features": [
    {
      "name": "功能名稱",
      "trigger": "誰在什麼情境下進入這個功能",
      "mainFlow": [
        "（角色） 在 X 頁面 點/填/選 Y → 系統 Z（觸發後台邏輯、寫入哪個資料、連到哪個模組）"
      ],
      "decisionPoints": [
        {
          "condition": "系統檢查的欄位/條件",
          "dataSource": "資料從哪個模組讀的",
          "branches": [
            { "case": "為 true 時", "result": "走 X 分支，系統做 Y" },
            { "case": "為 false 時", "result": "彈出 X 對話框，要求 Y" }
          ]
        }
      ],
      "exceptionFlow": [
        {
          "name": "例外名稱",
          "trigger": "什麼狀況觸發",
          "userExperience": "使用者看到什麼",
          "systemHandling": "系統怎麼處理/回復/補償"
        }
      ],
      "dataFields": [
        { "name": "field_name", "type": "型別", "purpose": "用途" }
      ],
      "moduleConnections": ["完成後資料送到 X 模組", "通知服務推播給 Y 角色"],
      "endStates": ["成功完成（資料寫入 X）", "失敗（顯示錯誤）", "待審（進入 Y 隊列）"]
    }
  ],
  "integrations": [
    { "system": "外部系統名", "interface": "API/Webhook/檔案匯入", "purpose": "用途" }
  ],
  "businessRules": [
    { "category": "規則類別", "rule": "規則內容", "scope": "適用範圍" }
  ]
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

// Quick flowchart for inline chat confirmation (before full document generation)
export const PREVIEW_FLOWCHART_PROMPT = (state: string, conversation: string) => `請根據下方的 **對話歷史** 為主要依據，產出一張「**目前正在討論的那個模組/功能**」的主業務流程圖，讓 SA 快速確認流程是否正確。

**⚠️ 重要**：
- **以「對話歷史」為主要事實來源**——SA 在對話中提到的所有具體流程、判斷條件、欄位校驗、累加/編輯/Audit 等規則細節都要反映到流程圖
- **不要畫通用的「登入 → CRUD → 存資料庫」流程**——那是廢話，看了等於沒看
- 反映 SA 真的講過的：誰做什麼、什麼條件下走哪裡、有哪些判斷分支
- 含 **2-4 個 decision diamond**（判斷分支），不要單線流程
- 含至少一條異常/錯誤路徑

────────────────────────────────────────
**對話歷史**（這是事實來源，請以此為主）：

${conversation}

────────────────────────────────────────
**結構化狀態**（輔助參考，可能不完整）：

${state}

────────────────────────────────────────

**重要格式規則**：請把整段 mermaid 程式碼放在 ===MMD_START=== 與 ===MMD_END=== 兩行之間。
不要有任何說明文字、不要加 \`\`\`mermaid 區塊標記、不要其他 markdown。

⚠️ 嚴禁：下方範例只示範「結構」（起點 → 多個步驟 → 多個 decision diamond → 多種結束狀態），請完全依 SA 對話內容填入真實的角色名、頁面名、欄位名與判斷條件。範例中的「現場人員 / 日報 / 班別 / 工料」若 SA 沒提到，輸出不可出現。

結構範例（佔位符）：

===MMD_START===
flowchart TD
  Start(["{角色 A} 觸發 {動作} 起點"]) --> A["{頁面 X}：填寫/選擇 {欄位 1, 欄位 2, 欄位 3}"]
  A --> B{"{第一個檢查條件，例如：權限 / 配置 / 範圍}"}
  B -->|"不通過"| Reject(["{失敗結果，例如：拒絕 / 退回}"])
  B -->|"通過"| C["{下一步：填寫 / 選擇 {欄位群}}"]
  C --> D{"{第二個檢查條件，例如：欄位完整性 / 業務規則}"}
  D -->|"否"| C
  D -->|"是"| E["{送出 / 提交 / 寫入動作}"]
  E --> F["{後台行為，例如：寫入 {資料表名} / 觸發 {模組名}}"]
  F --> G["{副作用，例如：Log / 通知 / Webhook}"]
  G --> End(["{成功結束狀態}"])
  F --> H{"{後續可變更條件，例如：使用者可編輯？}"}
  H -->|"是"| F
===MMD_END===`;

export const GENERATE_DOCUMENT_PROMPT = (consolidatedJson: string) => `根據以下完整的業務資訊：

${consolidatedJson}

產出一份繁體中文的業務流程文件（純 Markdown，不要包含 mermaid 區塊）。

────────────────────────────────────────
**🔴 Markdown 格式規則（必須嚴格遵守，否則排版會破）**

1. **清單項目寫成單行**：\`- **項目名**：描述\`，不要把 \`-\` 和描述拆成兩行
2. **清單項目之間不要加空行**：連續寫
3. **段落之間用一個空行**，標題與內容之間用一個空行
4. **不要用 trailing dash 標記**（不要 \`項目：\n -\n\`）

✅ 正確格式範例（角色名只是佔位示意，請替換成 SA 對話中真實的角色）：
\`\`\`
## 使用者角色

- **{角色 A}**：{職責 + 主要操作範圍，一行寫完}
- **{角色 B}**：{職責 + 主要操作範圍}
- **{角色 C}**：{職責 + 主要操作範圍}
\`\`\`

❌ 錯誤格式（會被 markdown 解析破壞）：
\`\`\`
-

**{角色 A}**：{描述}

-

**{角色 B}**：...
\`\`\`

────────────────────────────────────────
**🔴 內容深度規則（每個主流程步驟必須三段式）**

每個 mainFlow / exceptionFlow 步驟必須說清楚：
- **誰** （哪個角色） 在 **哪個畫面/位置**
- **做什麼操作**（點哪個按鈕、填什麼欄位、選什麼項目）
- **系統怎麼回應**（觸發什麼後台邏輯、寫入哪個資料表、連到哪個模組）

✅ 結構範例（佔位符示意，**不要照抄領域內容**）：
> 1. **{角色 A}** 在「{頁面 A}」頁面，從「{欄位 X}」{下拉/輸入框} {選/填} {值} → 系統從「{來源模組}」讀取對應的「{相關資料}」並顯示於下方
> 2. **{角色 A}** 在每列勾選/修改後，點「{按鈕名}」 → 系統將該筆暫存到 {前端狀態 / Session}（尚未寫入後台）
> 3. **{角色 A}** 點「{送出按鈕}」 → 系統 POST 到「{目標模組}」，並觸發「{後續服務}」推播給「{接收角色}」

❌ 不夠具體：
> 1. {單一動詞 + 名詞}
> 2. {單一動詞}
> 3. {單一動詞}

⚠️ 嚴禁：若 SA 沒提到營造、施工、工地、人機料、購物車、班別、日報等詞，輸出絕對不可出現這些字 — 它們只是本 prompt 的結構示意，不是預設領域。請完全依照 SA 對話中講過的角色名、頁面名、模組名、欄位名來填充。

────────────────────────────────────────
**章節骨架**（請按照這個結構撰寫）

# 系統概述

（2-3 句說明系統做什麼、給誰用、解決什麼業務問題）

## 使用者角色

- **角色名**：職責 + 主要操作範圍（一行寫完）

## 功能說明

### 1. 功能名稱

**觸發條件**：誰在什麼情境下進入這個功能

**主流程**：

1. （角色） 在 X 頁面 點/填/選 Y → 系統 Z
2. ...

**決策點**：

- 在第 N 步，系統檢查「X 欄位 / 條件 / 權限」（資料來自 \`Y 模組\`）
  - 為 \`true\` → 走 A 分支：系統做 ...
  - 為 \`false\` → 走 B 分支：彈出 X 對話框，要求 ...

**例外流程**：

- **例外名稱**：觸發條件 → 使用者看到什麼 → 系統如何處理

**資料欄位**：

- \`field_name\` (型別)：用途說明
- \`field_name_2\` (型別)：...

**模組關聯**：本功能完成後資料會送到哪些其他模組、觸發什麼後續動作

**結束狀態**：可能的終止狀態（成功 / 失敗 / 待審 / 跳轉至 X 模組）

### 2. 下一個功能

（同樣結構）

## 系統整合

- **外部系統名**：透過 X 介面（API/Webhook/檔案匯入），用途為 Y

## 業務規則與限制

- **規則類別**：規則內容 + 適用範圍

────────────────────────────────────────

**重要格式規則**：請把整份輸出放在 ===DOC_START=== 與 ===DOC_END=== 兩行之間，標記之外不要任何說明文字。

===DOC_START===
（你的完整 markdown 在這裡）
===DOC_END===`;

export const GENERATE_HTML_REPORT_PROMPT = (document: string) => `將以下業務流程 markdown 文件轉換成乾淨、語意正確的 HTML 片段（**只輸出 body 內容，不要包 \`<html>\`/\`<head>\`/\`<body>\` 標籤**）：

${document}

────────────────────────────────────────
**🔴 為什麼需要你做這件事**
原本是用 \`marked.js\` 直接把 markdown 轉成 HTML，但 LLM 偶爾會在 list 之間留下孤立的 \`- \` 行，marked.js 會解析成 \`<p>- </p>\`，破壞排版。請你直接讀懂結構，產出**乾淨的 \`<ul>\` / \`<ol>\` / \`<li>\` / \`<h2>\` / \`<p>\`** 等語意 HTML。

**🔴 Tailwind class 規則（必須照寫，整份報告會用 Tailwind CDN 渲染）**

| 元素 | class |
|------|-------|
| 第一個 \`<h1>\` | \`text-3xl font-bold mt-0 mb-4 pb-2 border-b-2 border-slate-200 text-slate-900\` |
| 其他 \`<h1>\` | \`text-3xl font-bold mt-8 mb-4 pb-2 border-b-2 border-slate-200 text-slate-900\` |
| \`<h2>\` | \`text-2xl font-semibold mt-7 mb-3 text-indigo-600\` |
| \`<h3>\` | \`text-lg font-semibold mt-5 mb-2 text-slate-900\` |
| \`<h4>\` | \`text-base font-semibold mt-4 mb-2 text-slate-600\` |
| \`<p>\` | \`my-3 text-slate-800 leading-relaxed\` |
| \`<ul>\` | \`pl-6 my-3 list-disc space-y-1.5\` |
| \`<ol>\` | \`pl-6 my-3 list-decimal space-y-1.5\` |
| \`<li>\` | \`text-slate-800 leading-relaxed\` |
| \`<strong>\` | \`font-semibold text-slate-900\` |
| \`<code>\` | \`bg-slate-100 px-1.5 py-0.5 rounded text-sm font-mono text-indigo-600\` |
| \`<table>\` | \`w-full border-collapse my-4 text-sm\` |
| \`<thead>\` | （無 class） |
| \`<th>\` | \`bg-slate-50 px-3 py-2 border border-slate-200 text-left font-semibold text-slate-700\` |
| \`<td>\` | \`px-3 py-2 border border-slate-200 align-top\` |
| \`<blockquote>\` | \`border-l-4 border-indigo-600 pl-4 pr-2 py-2 my-3 text-slate-600 bg-slate-50\` |
| \`<hr>\` | \`my-6 border-slate-200\` |

**🔴 嚴禁**
1. 出現任何孤立的 \`-\` 或 \`*\` 字元當段落內容（一律包成 \`<li>\` 在 \`<ul>\` 內）
2. 用 \`<p>**xxx**：</p>\` 模擬 list（請用 \`<li>\`）
3. 嵌套錯誤（\`<li>\` 內若還要列舉，請用嵌套 \`<ul class="pl-5 mt-1 list-circle">\`）
4. 跳階層（h1 → h3）
5. 包 \`<html>\`/\`<head>\`/\`<body>\`/\`<style>\`/\`<script>\` — 只輸出內容本身
6. 套用 markdown 殘留語法（不要 \`**xxx**\` 或 \`# xxx\`）

**🔴 內容保真**
- 不要刪減原 markdown 任何一句話
- 不要重新詮釋語意，只做格式轉換
- 數字編號（1./2./3.）一律用 \`<ol>\` 維持順序

**重要格式規則**：請把整份 HTML 放在 ===HTML_START=== 與 ===HTML_END=== 兩行之間，標記之外不要任何說明文字、不要 \`\`\`html 區塊標記。

===HTML_START===
<h1 class="text-3xl font-bold mt-0 mb-4 pb-2 border-b-2 border-slate-200 text-slate-900">系統概述</h1>
<p class="my-3 text-slate-800 leading-relaxed">（內容）</p>
<h2 class="text-2xl font-semibold mt-7 mb-3 text-indigo-600">使用者角色</h2>
<ul class="pl-6 my-3 list-disc space-y-1.5">
  <li class="text-slate-800 leading-relaxed"><strong class="font-semibold text-slate-900">角色名</strong>：職責描述</li>
</ul>
（完整 HTML…）
===HTML_END===`;

export const GENERATE_MERMAID_PROMPT = (document: string) => `根據以下業務流程文件：

${document}

**🔴 產出規則**：
1. 找出文件中 \`## 功能說明\` 底下的所有 \`### N. 功能名稱\` 小節，**每個功能各產出兩張圖**：
   - **{功能名} — 主流程**：flowchart TD，含主要步驟（誰在哪個畫面做什麼 → 系統怎麼回應）
   - **{功能名} — 決策流程**：flowchart TD，含所有決策點與異常路徑（decision diamond、例外流程）
2. 最後加一張 **系統互動序列**：sequenceDiagram，涵蓋所有功能的跨角色互動
3. 若文件只有一個功能，也要產出兩張功能圖 + 一張序列圖，共三張
4. **Mermaid 語法規則**：節點 ID 只用英文字母/數字/底線；含中文或空格的標籤用雙引號包住；不要用括號在箭頭 label 外

**重要格式規則**：請把整份輸出放在 ===MMD_START=== 與 ===MMD_END=== 兩行之間。
每個 mermaid 區塊都用 \`\`\`mermaid 包住，並在前面加 ## 標題（標題即圖名，必須用文件中真實的功能名）。
只輸出格式，標記之外不要任何說明文字。

⚠️ 嚴禁：下方範例只示範「結構」(每個功能一張主流程 + 一張決策流程，最後一張序列圖)，請完全使用文件中真實出現的功能名、角色名、欄位名、模組名來填充。範例中的佔位符不要照抄。

結構範例（佔位符）：

===MMD_START===
## {功能 1 名稱} — 主流程
\`\`\`mermaid
flowchart TD
  Start(["{角色 A} 進入 {頁面 X}"]) --> A["{步驟 1：操作描述}"]
  A --> B["{步驟 2：操作描述}"]
  B --> C{"{是否需要二次確認 / 條件判斷}"}
  C -->|"是"| D["{執行核心動作，例如：寫入 {資料表} / 觸發 {模組}}"]
  C -->|"否"| End(["{結束狀態}"])
  D --> E["{後續動作，例如：通知 / 刷新 / 跳轉}"]
  E --> End
\`\`\`

## {功能 1 名稱} — 決策流程
\`\`\`mermaid
flowchart TD
  Start(["{觸發動作}"]) --> Check1{"{權限 / 角色檢查}"}
  Check1 -->|"不通過"| Reject["{顯示拒絕訊息}"]
  Check1 -->|"通過"| Check2{"{業務規則檢查，例如：欄位 / 狀態}"}
  Check2 -->|"分支 A"| ResultA["{結果 A}"]
  Check2 -->|"分支 B"| ResultB["{結果 B}"]
  Check2 -->|"例外"| Err["{錯誤處理，例如：Rollback / Log}"]
\`\`\`

## {功能 2 名稱} — 主流程
\`\`\`mermaid
flowchart TD
  …（同上結構）
\`\`\`

## {功能 2 名稱} — 決策流程
\`\`\`mermaid
flowchart TD
  …（同上結構）
\`\`\`

## 系統互動序列
\`\`\`mermaid
sequenceDiagram
  actor U as {角色名}
  participant UI as {前端}
  participant SVC as {核心服務 / 模組}
  participant DB as {資料儲存}
  U->>UI: {動作描述}
  UI->>SVC: {請求描述}
  SVC->>DB: {讀取 / 寫入}
  DB-->>SVC: {回應}
  SVC-->>UI: {結果}
  UI-->>U: {呈現}
\`\`\`
===MMD_END===`;

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

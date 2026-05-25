# Challenge Mode + verify_logic Checkpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 SA 訪談 bot 問得更深（hypothesis-driven challenge mode）並在訪談中逐一向 SA 確認結構化「邏輯切片」，確保最終流程圖 100% 基於 SA 簽過字的內容。

**Architecture:** Out-of-graph `verifyLogicNode`（同 `generatePreviewFlowchart` 的位置與模式）在 interview graph 跑完後被 handleMessage 條件觸發。SA 確認的切片進 `verified_logics[]`，供 output graph 的 consolidate 階段優先採用。Challenge mode 純改 `DECIDE_NEXT_QUESTION_PROMPT`。

**Tech Stack:** TypeScript, LangGraph.js, Vitest（`npx vitest run <file>`）, Chrome MV3 service worker, 3 Gemini brain tabs via DOM automation。

**Spec:** `docs/superpowers/specs/2026-05-23-challenge-mode-verify-logic-design.md`

**測試說明:** 此專案 `npm test` 是 placeholder，請用 `npx vitest run <path>` 跑單檔。Pure-function / node 邏輯走 TDD；prompt 改動與 SW orchestration glue 以 `npx tsc --noEmit` + `npx vite build` + 手動跑兩輪訪談驗證。

---

## File Structure

| 檔案 | 動作 | 責任 |
|------|------|------|
| `src/types/index.ts` | Modify | 加 `VerifiedLogic` type、6 個 GraphState 欄位、`ChatMessage.logicSlice`、PREVIEW_READY 已含 htmlContent |
| `src/service-worker/stateStorage.ts` | Modify | `createInitialState` 補新欄位預設值 |
| `src/service-worker/graph.ts` | Modify | `GraphStateAnnotation` 加 6 個欄位 annotation |
| `src/service-worker/prompts.ts` | Modify | challenge mode 段落、`VERIFY_LOGIC_PROMPT`（新）、CONSOLIDATE 加註、schema 加 logicReadiness/currentFeatureName |
| `src/service-worker/nodes/verifyLogic.ts` | Create | 新 node：抽結構化邏輯切片 JSON |
| `src/service-worker/nodes/consolidateInfo.ts` | Modify | payload 加 verified_logics |
| `src/service-worker/nodes/understandAnswer.ts` | Modify | 回傳 currentFeatureName |
| `src/service-worker/index.ts` | Modify | 抽 `enterDiagramReviewOrPreview` helper、verifyLogic 觸發、`__CONFIRM_LOGIC__` handler、rejection flag 清理 |
| `src/sidepanel/components/ChatPanel.tsx` | Modify | 渲染 logic slice card |
| `src/sidepanel/App.css` | Modify | `.logic-slice-card` 樣式 |
| `tests/nodes/verifyLogic.test.ts` | Create | verifyLogicNode 單元測試 |
| `tests/_fixtures.ts` | Create | 共用 baseState fixture（含全部新欄位），修現有測試編譯 |
| `tests/nodes/generateDocument.test.ts` | Modify | 改用共用 fixture |

---

## Task 1: Types + state scaffolding

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/service-worker/stateStorage.ts`
- Modify: `src/service-worker/graph.ts`

- [ ] **Step 1: 加 VerifiedLogic type + ChatMessage.logicSlice**

在 `src/types/index.ts` 的 `FeatureInfo` interface 後面加：

```typescript
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
```

在 `ChatMessage` interface 內（`diagrams?` 那行後）加：

```typescript
  logicSlice?: VerifiedLogic
```

- [ ] **Step 2: 加 GraphState 6 個欄位**

在 `src/types/index.ts` 的 `GraphState` interface 內，`awaitingDiagramConfirmation: boolean` 後面加：

```typescript
  verified_logics: VerifiedLogic[]
  awaitingLogicConfirmation: boolean
  pendingLogicSlice: VerifiedLogic | null
  currentFeatureName: string
  currentFeatureAnswerCount: number
  logicReadiness: { ready: boolean; reason: string }
```

- [ ] **Step 3: createInitialState 補預設值**

在 `src/service-worker/stateStorage.ts` 的 `createInitialState` return object 內，`awaitingDiagramConfirmation: false,` 後面加：

```typescript
    verified_logics: [],
    awaitingLogicConfirmation: false,
    pendingLogicSlice: null,
    currentFeatureName: '',
    currentFeatureAnswerCount: 0,
    logicReadiness: { ready: false, reason: '' },
```

- [ ] **Step 4: graph.ts annotation 加 6 個欄位**

在 `src/service-worker/graph.ts` 的 `GraphStateAnnotation` 內，`awaitingDiagramConfirmation` annotation 那行後面加：

```typescript
  verified_logics: Annotation<GraphState['verified_logics']>({ reducer: (_a, b) => b, default: () => [] }),
  awaitingLogicConfirmation: Annotation<boolean>({ reducer: (_a, b) => b, default: () => false }),
  pendingLogicSlice: Annotation<GraphState['pendingLogicSlice']>({ reducer: (_a, b) => b, default: () => null }),
  currentFeatureName: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
  currentFeatureAnswerCount: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }),
  logicReadiness: Annotation<GraphState['logicReadiness']>({ reducer: (_a, b) => b, default: () => ({ ready: false, reason: '' }) }),
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -v "framer-motion\|App.tsx(1[7-9]" | grep -E "src/.*error"`
Expected: 無 `src/` 內的 error（tests/ 的 fixture error 留到 Task 9 修）

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/service-worker/stateStorage.ts src/service-worker/graph.ts
git commit -m "feat: add VerifiedLogic type + verify-logic state fields"
```

---

## Task 2: VERIFY_LOGIC_PROMPT + verifyLogicNode (TDD)

**Files:**
- Modify: `src/service-worker/prompts.ts`
- Create: `src/service-worker/nodes/verifyLogic.ts`
- Create: `tests/nodes/verifyLogic.test.ts`

- [ ] **Step 1: 寫 VERIFY_LOGIC_PROMPT**

在 `src/service-worker/prompts.ts` 的 `GENERATE_MERMAID_PROMPT` export 前面加：

```typescript
export const VERIFY_LOGIC_PROMPT = (featureName: string, recentConversation: string) => `你正在和 SA 確認「${featureName}」這個功能的業務邏輯。

請從以下最近的對話中，抽出 SA 已經講清楚的邏輯，整理成結構化 JSON。

對話：
${recentConversation}

🔴 重要原則
- 只抽 SA 真的講過、或明確同意過的內容
- 沒講過的欄位寫空字串 "" 或空陣列 []，不要腦補
- 不要套用其他領域慣例（建設/施工/工地/購物車等）除非 SA 自己提到

回傳 JSON（不要有任何 markdown 標記）：
{
  "featureName": "${featureName}",
  "trigger": "什麼角色在什麼情境下進入這個功能",
  "mainFlow": ["（角色） 在 X 頁面 操作 → 系統 反應", "..."],
  "decisionPoints": [
    { "condition": "系統檢查什麼", "branches": [{ "case": "為 true 時", "result": "走 X 分支" }, { "case": "為 false 時", "result": "走 Y 分支" }] }
  ],
  "exceptionFlow": [{ "name": "例外名", "trigger": "什麼狀況觸發", "handling": "系統如何處理" }],
  "endStates": ["成功時的狀態", "失敗時的狀態"]
}`;
```

- [ ] **Step 2: 寫 failing test**

Create `tests/nodes/verifyLogic.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeBaseState } from '../_fixtures'

const mockTabManager = { sendToTab: vi.fn() }
beforeEach(() => vi.resetAllMocks())

describe('verifyLogicNode', () => {
  it('parses structured JSON slice and stamps verifiedAt', async () => {
    mockTabManager.sendToTab.mockResolvedValue(`好的，整理如下：
{
  "featureName": "點工項目管理",
  "trigger": "總部經理進入點工頁面",
  "mainFlow": ["經理填寫工種與單價 → 系統校驗"],
  "decisionPoints": [{ "condition": "單價>0", "branches": [{ "case": "true", "result": "寫入" }, { "case": "false", "result": "阻擋" }] }],
  "exceptionFlow": [{ "name": "重複名稱", "trigger": "工種已存在", "handling": "阻擋並提示" }],
  "endStates": ["成功寫入", "校驗失敗"]
}`)
    const { verifyLogicNode } = await import('../../src/service-worker/nodes/verifyLogic')
    const state = makeBaseState({ currentFeatureName: '點工項目管理', conversationHistory: [
      { role: 'bot', content: '單價規則?', timestamp: 1 },
      { role: 'user', content: '單價必須大於0', timestamp: 2 },
    ]})
    const result = await verifyLogicNode(state, mockTabManager as any)
    expect(result).not.toBeNull()
    expect(result!.featureName).toBe('點工項目管理')
    expect(result!.decisionPoints).toHaveLength(1)
    expect(typeof result!.verifiedAt).toBe('number')
    expect(mockTabManager.sendToTab).toHaveBeenCalledWith('understanding', expect.stringContaining('點工項目管理'))
  })

  it('returns null when no JSON present', async () => {
    mockTabManager.sendToTab.mockResolvedValue('抱歉我無法處理')
    const { verifyLogicNode } = await import('../../src/service-worker/nodes/verifyLogic')
    const result = await verifyLogicNode(makeBaseState({}), mockTabManager as any)
    expect(result).toBeNull()
  })

  it('returns null when JSON is malformed', async () => {
    mockTabManager.sendToTab.mockResolvedValue('{ "featureName": "x", "trigger": ')
    const { verifyLogicNode } = await import('../../src/service-worker/nodes/verifyLogic')
    const result = await verifyLogicNode(makeBaseState({}), mockTabManager as any)
    expect(result).toBeNull()
  })
})
```

> 注意：此 test 依賴 `tests/_fixtures.ts` 的 `makeBaseState`，於 Task 9 Step 1 建立。若先跑此 task，請先做 Task 9 Step 1。建議實作順序：Task 9 Step 1 → Task 2。

- [ ] **Step 3: 確認 test 失敗**

Run: `npx vitest run tests/nodes/verifyLogic.test.ts`
Expected: FAIL — `Cannot find module '../../src/service-worker/nodes/verifyLogic'`

- [ ] **Step 4: 寫 verifyLogicNode**

Create `src/service-worker/nodes/verifyLogic.ts`:

```typescript
import type { GraphState, VerifiedLogic } from '../../types/index'
import { VERIFY_LOGIC_PROMPT } from '../prompts'
import type { TabManager } from '../tabManager'
import { notifyStatus } from '../notify'

export async function verifyLogicNode(
  state: GraphState,
  tabManager: TabManager
): Promise<VerifiedLogic | null> {
  notifyStatus('正在整理剛才釐清的業務邏輯...')
  const conversationSlice = state.conversationHistory
    .slice(-12)
    .map(m => `${m.role === 'bot' ? 'AI' : 'SA'}: ${m.content}`)
    .join('\n')
  const raw = await tabManager.sendToTab(
    'understanding',
    VERIFY_LOGIC_PROMPT(state.currentFeatureName ?? '', conversationSlice)
  )
  const json = raw.match(/\{[\s\S]*\}/)?.[0]
  if (!json) {
    console.warn('[verifyLogic] no JSON found in response')
    return null
  }
  try {
    const parsed = JSON.parse(json) as Omit<VerifiedLogic, 'verifiedAt'>
    return { ...parsed, verifiedAt: Date.now() }
  } catch {
    console.warn('[verifyLogic] JSON parse failed')
    return null
  }
}
```

- [ ] **Step 5: 確認 test 通過**

Run: `npx vitest run tests/nodes/verifyLogic.test.ts`
Expected: PASS (3 passed)

- [ ] **Step 6: Commit**

```bash
git add src/service-worker/prompts.ts src/service-worker/nodes/verifyLogic.ts tests/nodes/verifyLogic.test.ts
git commit -m "feat: add verifyLogicNode + VERIFY_LOGIC_PROMPT with unit tests"
```

---

## Task 3: consolidateInfo feeds verified_logics (TDD)

**Files:**
- Modify: `src/service-worker/nodes/consolidateInfo.ts`
- Modify: `src/service-worker/prompts.ts`
- Create: `tests/nodes/consolidateInfo.test.ts`

- [ ] **Step 1: 寫 failing test**

Create `tests/nodes/consolidateInfo.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeBaseState } from '../_fixtures'

const mockTabManager = { sendToTab: vi.fn() }
beforeEach(() => vi.resetAllMocks())

describe('consolidateInfoNode', () => {
  it('includes verified_logics in the payload sent to understanding tab', async () => {
    mockTabManager.sendToTab.mockResolvedValue('{"systemName":"X","systemOverview":"y"}')
    const { consolidateInfoNode } = await import('../../src/service-worker/nodes/consolidateInfo')
    const state = makeBaseState({
      verified_logics: [{
        featureName: '點工項目管理', trigger: 't', mainFlow: ['a'],
        decisionPoints: [], exceptionFlow: [], endStates: ['s'], verifiedAt: 1,
      }],
    })
    await consolidateInfoNode(state, mockTabManager as any)
    expect(mockTabManager.sendToTab).toHaveBeenCalledWith('understanding', expect.stringContaining('點工項目管理'))
    expect(mockTabManager.sendToTab).toHaveBeenCalledWith('understanding', expect.stringContaining('verifiedLogics'))
  })

  it('extracts systemName from response into state', async () => {
    mockTabManager.sendToTab.mockResolvedValue('{"systemName":"ThmLineBot","systemOverview":"y"}')
    const { consolidateInfoNode } = await import('../../src/service-worker/nodes/consolidateInfo')
    const result = await consolidateInfoNode(makeBaseState({}), mockTabManager as any)
    expect(result.systemName).toBe('ThmLineBot')
  })
})
```

- [ ] **Step 2: 確認 test 失敗**

Run: `npx vitest run tests/nodes/consolidateInfo.test.ts`
Expected: FAIL — 第一個 test 找不到 'verifiedLogics' 字串（payload 還沒含）。第二個應已通過（systemName 抽取在 v1.14.3 已做）。

- [ ] **Step 3: payload 加 verified_logics**

在 `src/service-worker/nodes/consolidateInfo.ts` 的 `allData` object 內，`features: state.features,` 後面加：

```typescript
    verifiedLogics: state.verified_logics,
```

- [ ] **Step 4: CONSOLIDATE_PROMPT 加註**

在 `src/service-worker/prompts.ts` 的 `CONSOLIDATE_PROMPT` 內，緊接在 `${allData}` 後面（「整合成 developer-ready」那段前）加：

```
🔴 verifiedLogics 是 SA 已逐一明確簽字畫押的邏輯切片。
- 整合 features[] 時，verifiedLogics 內容**優先採用**作為事實基礎
- conversationHistory 與 features[] 用來補充 verifiedLogics 沒覆蓋的面向
- 若兩者衝突，以 verifiedLogics 為準
```

- [ ] **Step 5: 確認 test 通過**

Run: `npx vitest run tests/nodes/consolidateInfo.test.ts`
Expected: PASS (2 passed)

- [ ] **Step 6: Commit**

```bash
git add src/service-worker/nodes/consolidateInfo.ts src/service-worker/prompts.ts tests/nodes/consolidateInfo.test.ts
git commit -m "feat: feed verified_logics into consolidate payload + prompt"
```

---

## Task 4: Challenge mode prompt + schema

**Files:**
- Modify: `src/service-worker/prompts.ts`

- [ ] **Step 1: 加 challenge mode 段落到 DECIDE_NEXT_QUESTION_PROMPT**

先讀現有 `DECIDE_NEXT_QUESTION_PROMPT`（`grep -n "DECIDE_NEXT_QUESTION_PROMPT" src/service-worker/prompts.ts` 找位置）。在「問什麼」指引之後、回傳 JSON 範例之前，插入：

```
🔴 問題寫法規則（每題都必須符合）

每個 question 必須是「Hypothesis + Edge Case + 選項」三段式，禁止開放式漫談：

✅ 範例：
「我猜你的 {功能名} 流程是 {hypothesis 一句話}。但在這類系統，通常會遇到三個邊界狀況：
 (A) {edge case A}
 (B) {edge case B}
 (C) {edge case C}
請問你的系統各自怎麼處理？或還有其他要補的？」

❌ 禁止寫法：
- 純開放式：「請說明這個功能的流程」
- 沒 hypothesis：「有什麼 edge case？」（要 SA 自己想）
- 沒選項：「會發生什麼？」（讓 SA 漫無目的講）

🔴 Hypothesis 來源：從 systemOverview、已知 features、SA 剛答的內容自推。推不出來時明說：「我目前對 X 還沒概念，請先講一下這部分大概在做什麼」。
🔴 Edge case 來源：常見軟體 anti-pattern（權限、併發、資料不一致、外部失敗、超量、退回）自生。不要硬塞與當前 feature 無關的。
⚠️ 嚴禁用建設/施工/工地/購物車當例子（會污染 hypothesis）—— SA 沒提到就不准出現。

suggestions 必須對應上述 (A)(B)(C) 三個 edge case + 一個「其他（請說明）」。
```

- [ ] **Step 2: 在回傳 JSON schema 加 currentFeatureName + logicReadiness**

在 `DECIDE_NEXT_QUESTION_PROMPT` 的回傳 JSON 範例內加兩個欄位（沿用既有 flowReadiness 的寫法位置）：

```
  "currentFeatureName": "目前聚焦討論的功能名（從 systemOverview / features / 對話自推；無法判斷時給空字串）",
  "logicReadiness": {
    "ready": true/false,
    "reason": "為什麼判定這個 feature 的核心邏輯已成熟（主流程 + ≥1 decision branch + ≥1 例外路徑）"
  },
```

- [ ] **Step 3: Type-check + build（prompt 是字串，靠 build 確認沒語法破）**

Run: `npx tsc --noEmit 2>&1 | grep "prompts.ts"`
Expected: 無輸出

- [ ] **Step 4: Commit**

```bash
git add src/service-worker/prompts.ts
git commit -m "feat: challenge-mode questioning + logicReadiness/currentFeatureName schema"
```

---

## Task 5: understandAnswer tracks currentFeatureName

**Files:**
- Modify: `src/service-worker/prompts.ts`
- Modify: `src/service-worker/nodes/understandAnswer.ts`

- [ ] **Step 1: UNDERSTAND_ANSWER_PROMPT 回應加 currentFeatureName**

在 `src/service-worker/prompts.ts` 的 `UNDERSTAND_ANSWER_PROMPT` 回傳 JSON 內，`"extractedInfo": {},` 後面加：

```
  "currentFeatureName": "這次回答主要在描述哪個功能（沒有明確功能時給空字串）",
```

- [ ] **Step 2: understandAnswerNode 把 currentFeatureName 寫進 update**

先讀 `src/service-worker/nodes/understandAnswer.ts` 看它怎麼解析回應（`update.systemOverview = ...` 那段）。在解析 `info` 後，若 `info.currentFeatureName` 為非空字串，加到 update：

```typescript
    if (typeof info.currentFeatureName === 'string' && info.currentFeatureName.trim()) {
      update.currentFeatureName = info.currentFeatureName.trim()
    }
```

（`update` object 的精確型別與既有寫法對齊；若既有用 `Partial<GraphState>` 直接賦值即可。）

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "understandAnswer.ts"`
Expected: 無輸出

- [ ] **Step 4: Commit**

```bash
git add src/service-worker/prompts.ts src/service-worker/nodes/understandAnswer.ts
git commit -m "feat: understandAnswer extracts currentFeatureName"
```

---

## Task 6: Extract enterDiagramReviewOrPreview helper

**Files:**
- Modify: `src/service-worker/index.ts`

目的：把現有 `__CONFIRM_OUTPUT__` handler 後半段（outputResult → parseDiagrams → 多圖 review or PREVIEW_READY）抽成共用 helper，讓 Task 7 的 auto-trigger 路徑共用同一條代碼路徑。

- [ ] **Step 1: 讀現有 __CONFIRM_OUTPUT__ handler**

Run: `grep -n "__CONFIRM_OUTPUT__\|parseDiagrams\|PREVIEW_READY\|reviewMsg" src/service-worker/index.ts`
辨識出 outputResult 之後到 return 的那段（parseDiagrams + diagrams.length 判斷 + reviewMsg 推送）。

- [ ] **Step 2: 抽 helper function**

在 `src/service-worker/index.ts` 的 `parseDiagrams` function 後面加：

```typescript
// Shared: after output graph runs, either show the multi-diagram review or
// (if no diagrams parsed) jump straight to the preview screen. Used by both
// the __CONFIRM_OUTPUT__ path and the auto-trigger-after-verify path.
async function enterDiagramReviewOrPreview(
  outputResult: GraphState,
  totalAnswers: number
): Promise<void> {
  const diagrams = parseDiagrams(outputResult.generatedMermaid)
  if (diagrams.length === 0) {
    const finalState: GraphState = { ...outputResult, answerCountAtLastOutput: totalAnswers, awaitingConfirmation: false, awaitingDiagramConfirmation: false }
    await saveState(finalState)
    notifySidePanel({
      type: 'PREVIEW_READY',
      payload: { document: outputResult.generatedDocument, mermaid: outputResult.generatedMermaid, systemName: outputResult.systemName, htmlContent: outputResult.generatedHtmlContent },
    })
    return
  }
  const reviewMsg: ChatMessage = {
    role: 'bot',
    content: `我已產出 ${diagrams.length} 張流程圖，請逐一檢查（點圖可放大、拖曳、縮放）。確認無誤後點下方按鈕產出完整報告：`,
    timestamp: Date.now(),
    diagrams,
    actions: [
      { label: '✓ 全部正確，產出完整報告', value: '__CONFIRM_DIAGRAMS__' },
      { label: '需要修改', value: '我覺得某些流程圖需要調整，請繼續追問細節' },
    ],
  }
  const reviewState: GraphState = {
    ...outputResult,
    answerCountAtLastOutput: totalAnswers,
    awaitingConfirmation: false,
    awaitingDiagramConfirmation: true,
    conversationHistory: [...outputResult.conversationHistory, reviewMsg],
  }
  await saveState(reviewState)
  notifySidePanel({ type: 'BOT_MESSAGE', payload: reviewMsg })
}
```

- [ ] **Step 3: 改 __CONFIRM_OUTPUT__ handler 改用 helper**

把現有 `__CONFIRM_OUTPUT__` handler 內「const diagrams = parseDiagrams(...)」到該 if 區塊結尾、return 之前的那段，整段替換為：

```typescript
        const totalAnswers = outputResult.conversationHistory.filter(m => m.role === 'user').length
        await enterDiagramReviewOrPreview(outputResult, totalAnswers)
        return { ok: true }
```

- [ ] **Step 4: Build 確認沒破**

Run: `npx vite build 2>&1 | tail -3`
Expected: 看到 `✓ built` 或無 error（chunk size warning 可忽略）

- [ ] **Step 5: Commit**

```bash
git add src/service-worker/index.ts
git commit -m "refactor: extract enterDiagramReviewOrPreview shared helper"
```

---

## Task 7: handleMessage — verify trigger + __CONFIRM_LOGIC__ + rejection

**Files:**
- Modify: `src/service-worker/index.ts`

- [ ] **Step 1: import verifyLogicNode**

在 `src/service-worker/index.ts` 頂部 import 區，`generatePreviewFlowchart` import 那行後面加：

```typescript
import { verifyLogicNode } from './nodes/verifyLogic'
```

- [ ] **Step 2: rejection flag 清理加 awaitingLogicConfirmation**

找到 `const stateForFlow: GraphState = (savedState.awaitingConfirmation || savedState.awaitingDiagramConfirmation)` 那行，整段替換為：

```typescript
      const stateForFlow: GraphState = (savedState.awaitingConfirmation || savedState.awaitingDiagramConfirmation || savedState.awaitingLogicConfirmation)
        ? { ...savedState, awaitingConfirmation: false, awaitingDiagramConfirmation: false, awaitingLogicConfirmation: false, pendingLogicSlice: null }
        : savedState
```

- [ ] **Step 3: 加 __CONFIRM_LOGIC__ handler**

在 `__CONFIRM_DIAGRAMS__` handler 區塊後面（`__CONFIRM_OUTPUT__` 也行，任一個 special handler 之後），加：

```typescript
      // Special: user confirmed a verify_logic slice → store it, then decide
      // whether to continue interviewing or auto-fire the output graph.
      if (savedState.awaitingLogicConfirmation && message.payload === '__CONFIRM_LOGIC__') {
        const slice = savedState.pendingLogicSlice
        if (!slice) {
          notifySidePanel({ type: 'ERROR', payload: 'pendingLogicSlice 遺失，請重新回答一次' })
          return { ok: true }
        }
        const updated: GraphState = {
          ...savedState,
          verified_logics: [...savedState.verified_logics, slice],
          awaitingLogicConfirmation: false,
          pendingLogicSlice: null,
          currentFeatureAnswerCount: 0,
        }
        await saveState(updated)
        notifySidePanel({ type: 'BOT_MESSAGE', payload: {
          role: 'bot',
          content: `✓ 已記錄「${slice.featureName}」邏輯。已累計 ${updated.verified_logics.length} 個切片。`,
          timestamp: Date.now(),
        }})

        const result = await ig.invoke(updated) as GraphState
        const lastMsg = result.conversationHistory[result.conversationHistory.length - 1]
        const interviewDone = result.flowReadiness?.ready === true && result.verified_logics.length >= 2

        if (interviewDone) {
          notifySidePanel({ type: 'GENERATING_OUTPUT' })
          notifyStatus('正在彙整所有已確認邏輯，產出完整報告...')
          const outputState: GraphState = { ...result, phase: 'output' }
          await saveState(outputState)
          const outputResult = await og.invoke(outputState) as GraphState
          const totalAnswers = outputResult.conversationHistory.filter(m => m.role === 'user').length
          await enterDiagramReviewOrPreview(outputResult, totalAnswers)
        } else {
          if (lastMsg) notifySidePanel({ type: 'BOT_MESSAGE', payload: lastMsg })
        }
        return { ok: true }
      }
```

- [ ] **Step 4: 改正常 USER_ANSWER 路徑 — 加 feature 追蹤 + verify 觸發**

找到正常路徑的 `const update = await understandAnswerNode(stateForFlow, tm!, message.payload as string)` 與其後的 `const updatedState: GraphState = { ...stateForFlow, ...update }`。把 updatedState 改成：

```typescript
      const update = await understandAnswerNode(stateForFlow, tm!, message.payload as string)
      const newFeatureName = update.currentFeatureName ?? stateForFlow.currentFeatureName
      const featureChanged = !!newFeatureName && newFeatureName !== stateForFlow.currentFeatureName
      const countAfter = featureChanged ? 1 : (stateForFlow.currentFeatureAnswerCount ?? 0) + 1
      const updatedState: GraphState = {
        ...stateForFlow,
        ...update,
        currentFeatureName: newFeatureName,
        currentFeatureAnswerCount: countAfter,
      }
```

- [ ] **Step 5: 替換現有「flowchart preview 觸發」區塊為 verifyLogic 觸發**

找到 `// Auto-trigger flowchart preview` 到該 `if (isDone || ...)` 整個 if/else 區塊。整段替換為：

```typescript
      // After interview graph runs, decide whether to fire a verify_logic
      // checkpoint. Replaces the old generatePreviewFlowchart trigger.
      // (generatePreviewFlowchart.ts is kept as dead code for now.)
      const logicReady = result.logicReadiness?.ready === true
      const reachedCap = (result.currentFeatureAnswerCount ?? 0) >= 6

      if (logicReady || reachedCap) {
        notifySidePanel({ type: 'GENERATING_OUTPUT' })
        const slice = await verifyLogicNode(result, tm!)
        if (!slice) {
          // Couldn't extract a slice — degrade to a normal next question.
          if (lastMsg) notifySidePanel({ type: 'BOT_MESSAGE', payload: lastMsg })
          return { ok: true }
        }
        const verifyMsg: ChatMessage = {
          role: 'bot',
          content: `請確認以下「${slice.featureName}」的業務邏輯是否正確：`,
          timestamp: Date.now(),
          logicSlice: slice,
          actions: [
            { label: '✓ 沒錯，記錄此邏輯', value: '__CONFIRM_LOGIC__' },
            { label: '❌ 不對，我要調整', value: '我覺得這個邏輯有錯，請繼續追問細節' },
          ],
        }
        const verifyState: GraphState = {
          ...result,
          awaitingLogicConfirmation: true,
          pendingLogicSlice: slice,
          conversationHistory: [...result.conversationHistory, verifyMsg],
        }
        await saveState(verifyState)
        notifySidePanel({ type: 'BOT_MESSAGE', payload: verifyMsg })
      } else {
        if (lastMsg) notifySidePanel({ type: 'BOT_MESSAGE', payload: lastMsg })
      }
      return { ok: true }
```

> 註：原本區塊內的 `generatePreviewFlowchart` 呼叫與 `awaitingConfirmation`+`__CONFIRM_OUTPUT__` 訊息都移除（generatePreviewFlowchart.ts 檔案保留不刪）。`__CONFIRM_OUTPUT__` handler 仍存在，給 auto-trigger 與 revision 流程用。

- [ ] **Step 6: Type-check + build**

Run: `npx tsc --noEmit 2>&1 | grep "index.ts" ; npx vite build 2>&1 | tail -3`
Expected: 無 index.ts error；build 成功

- [ ] **Step 7: Commit**

```bash
git add src/service-worker/index.ts
git commit -m "feat: wire verifyLogic trigger + __CONFIRM_LOGIC__ + auto-output"
```

---

## Task 8: ChatPanel logic slice card + CSS

**Files:**
- Modify: `src/sidepanel/components/ChatPanel.tsx`
- Modify: `src/sidepanel/App.css`

- [ ] **Step 1: 渲染 logicSlice card**

在 `src/sidepanel/components/ChatPanel.tsx`，找到 `{msg.diagrams && msg.diagrams.length > 0 && (...)}` 那段渲染區塊後面，加：

```tsx
                {msg.logicSlice && (
                  <div className="logic-slice-card">
                    <div className="ls-row"><strong>1. 觸發：</strong>{msg.logicSlice.trigger}</div>
                    <div className="ls-row"><strong>2. 主流程：</strong>
                      <ol>{msg.logicSlice.mainFlow.map((s, k) => <li key={k}>{s}</li>)}</ol>
                    </div>
                    {msg.logicSlice.decisionPoints.length > 0 && (
                      <div className="ls-row"><strong>3. 決策點：</strong>
                        {msg.logicSlice.decisionPoints.map((dp, k) => (
                          <div key={k} className="ls-dp">
                            <em>{dp.condition}</em>
                            <ul>{dp.branches.map((b, j) => <li key={j}>{b.case} → {b.result}</li>)}</ul>
                          </div>
                        ))}
                      </div>
                    )}
                    {msg.logicSlice.exceptionFlow.length > 0 && (
                      <div className="ls-row"><strong>4. 例外：</strong>
                        <ul>{msg.logicSlice.exceptionFlow.map((ef, k) => <li key={k}><strong>{ef.name}</strong>：{ef.trigger} → {ef.handling}</li>)}</ul>
                      </div>
                    )}
                    {msg.logicSlice.endStates.length > 0 && (
                      <div className="ls-row"><strong>5. 結束狀態：</strong>
                        <ul>{msg.logicSlice.endStates.map((s, k) => <li key={k}>{s}</li>)}</ul>
                      </div>
                    )}
                  </div>
                )}
```

- [ ] **Step 2: 加 CSS**

在 `src/sidepanel/App.css` 的 `.diagram-review-card` 區塊後面加：

```css
/* ── verify_logic slice card ── */
.logic-slice-card {
  margin-top: 10px;
  background: white;
  border: 1px solid var(--border-light);
  border-left: 3px solid var(--ai-accent);
  border-radius: 12px;
  padding: 14px;
  font-size: 14px;
  line-height: 1.6;
}
.logic-slice-card .ls-row { margin-bottom: 10px; }
.logic-slice-card .ls-row:last-child { margin-bottom: 0; }
.logic-slice-card strong { color: var(--ai-accent); }
.logic-slice-card ol, .logic-slice-card ul { padding-left: 1.3rem; margin: 4px 0; }
.logic-slice-card li { margin: 2px 0; }
.logic-slice-card .ls-dp { margin: 6px 0; }
.logic-slice-card .ls-dp em { color: #475569; font-style: normal; font-weight: 500; }
```

- [ ] **Step 3: Type-check + build**

Run: `npx tsc --noEmit 2>&1 | grep "ChatPanel" ; npx vite build 2>&1 | tail -3`
Expected: 無 ChatPanel error；build 成功

- [ ] **Step 4: Commit**

```bash
git add src/sidepanel/components/ChatPanel.tsx src/sidepanel/App.css
git commit -m "feat: render verify_logic slice card in chat"
```

---

## Task 9: Fix test fixtures + full suite green

**Files:**
- Create: `tests/_fixtures.ts`
- Modify: `tests/nodes/generateDocument.test.ts`
- Modify: `tests/nodes/analyzeFiles.test.ts`
- Modify: `tests/stateStorage.test.ts`

- [ ] **Step 1: 建立共用 fixture（含全部新欄位）**

Create `tests/_fixtures.ts`:

```typescript
import type { GraphState } from '../src/types/index'

export function makeBaseState(overrides: Partial<GraphState> = {}): GraphState {
  return {
    phase: 'features',
    systemName: 'TestSystem',
    uploadedFiles: [],
    analyzedData: {},
    missingInfo: [],
    systemOverview: '',
    userRoles: [],
    featureList: [],
    currentFeatureIndex: 0,
    features: [],
    integrations: '',
    businessRules: '',
    consolidatedJson: '{"systemName":"TestSystem","features":[]}',
    generatedDocument: '',
    generatedHtmlContent: '',
    generatedMermaid: '',
    conversationHistory: [],
    pendingQuestion: '',
    pendingSuggestions: [],
    pendingMultiSelect: false,
    flowReadiness: { ready: false, decisionPointsCount: 0, hasExceptionFlow: false, endStatesCount: 0, reason: '' },
    revisionTarget: '',
    answerCountAtLastOutput: 0,
    awaitingConfirmation: false,
    awaitingDiagramConfirmation: false,
    verified_logics: [],
    awaitingLogicConfirmation: false,
    pendingLogicSlice: null,
    currentFeatureName: '',
    currentFeatureAnswerCount: 0,
    logicReadiness: { ready: false, reason: '' },
    ...overrides,
  }
}
```

> 注意：上面欄位需與 `src/types/index.ts:GraphState` 完全一致。若 tsc 報缺欄位，以 GraphState 定義為準補齊。

- [ ] **Step 2: 改 generateDocument.test.ts 用共用 fixture**

把 `tests/nodes/generateDocument.test.ts` 內的整段 `const baseState: GraphState = {...}` 刪掉，改成：

```typescript
import { makeBaseState } from '../_fixtures'
const baseState = makeBaseState({ phase: 'output' })
```

（保留檔案其餘 import 與 describe 區塊）

- [ ] **Step 3: 同樣修 analyzeFiles.test.ts 與 stateStorage.test.ts**

讀這兩個檔，若有內聯的 `GraphState` literal 造成缺欄位編譯錯，改用 `makeBaseState({...})`。若沒有則跳過。

- [ ] **Step 4: 跑全測試**

Run: `npx vitest run`
Expected: 全綠（若 generateMermaid/notifyStatus 因 chrome mock 失敗，檢查 tests/setup.ts 是否 mock 了 chrome.runtime.sendMessage；必要時在 setup.ts 補 mock）

- [ ] **Step 5: Type-check 全乾淨（除既有 framer-motion）**

Run: `npx tsc --noEmit 2>&1 | grep -v "framer-motion\|App.tsx(1[7-9]"`
Expected: 無 error

- [ ] **Step 6: Commit**

```bash
git add tests/
git commit -m "test: shared baseState fixture covering new verify-logic fields"
```

---

## Task 10: Manual verification + release

**Files:** none (verification + release)

- [ ] **Step 1: Build dist**

Run: `npx vite build 2>&1 | tail -3`
Expected: build 成功

- [ ] **Step 2: 手動測試（兩個不同領域）**

載入 dist 到 chrome://extensions（重新整理擴充功能）。跑兩輪訪談：
1. 一個營造類系統、一個非營造（例如 SaaS dashboard / 電商後台）
2. 檢查 challenge mode：問題是否為「hypothesis + 3 edge case + 選項」格式，不再油膩開放式
3. 檢查 verify_logic：聊到一個 feature 邏輯成熟時是否跳出邏輯切片卡片（5 段式）
4. 按「✓ 沒錯」→ 確認 ack 訊息出現、切片計數增加
5. 按「❌ 不對」→ 確認回到訪談繼續追問
6. 累積 ≥2 切片 + flowReadiness ready → 確認自動進 output graph（不需手動按）
7. 多圖 review 仍正常、HTML 報告 title 正確、無孤立 dash
8. SW console 檢查無非預期 `[verifyLogic]` warning

- [ ] **Step 3: Zip dist**

Run: `rm -f dist.zip && cd dist && zip -r ../dist.zip . > /dev/null && cd ..`

- [ ] **Step 4: Release v1.15.0**

```bash
gh release create v1.15.0 dist.zip --title "v1.15.0 - Challenge mode 深挖 + verify_logic 階段確認" --notes "見 docs/superpowers/specs/2026-05-23-challenge-mode-verify-logic-design.md"
```

- [ ] **Step 5: graphify update**

Run: `graphify update . 2>&1 | tail -2`

---

## Self-Review Notes

- Spec coverage：challenge mode (Task 4)、verify_logic node (Task 2)、trigger 混合 (Task 7 Step 5)、JSON+自然語言渲染 (Task 2 + Task 8)、砍 inline 預覽保留多圖 (Task 7 Step 5 移除 generatePreviewFlowchart 觸發)、rejection 快路 (Task 7 Step 2)、propagation 補充 consolidatedJson (Task 3)、自動觸發 output (Task 7 Step 3 __CONFIRM_LOGIC__)、graph.ts annotation (Task 1 Step 4)、currentFeatureName precedence (Task 7 Step 4 用 update.currentFeatureName ?? stateForFlow) ✓
- 型別一致：`VerifiedLogic`、`logicReadiness`、`pendingLogicSlice`、`verified_logics` 跨 task 命名一致 ✓
- 已知相依：Task 2 的 test 依賴 Task 9 Step 1 的 `makeBaseState` — 已在 Task 2 Step 2 註明建議先做 Task 9 Step 1
- 保留項：`generatePreviewFlowchart.ts` 不刪（dead code 觀察期）；`__CONFIRM_OUTPUT__` handler 保留給 auto-trigger 與 revision

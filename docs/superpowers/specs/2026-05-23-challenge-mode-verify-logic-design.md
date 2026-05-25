# Design — Challenge Mode + verify_logic Checkpoint

**Date:** 2026-05-23
**Author:** marmottai + Claude (brainstorming session)
**Status:** Approved (ready for implementation plan)

## Problem

兩個 root cause 讓 v1.14.3 產出的流程圖「看似漂亮，實則空洞」：

1. **問得不夠深** — `decideNextQuestion` 的 prompt 沒有強制 hypothesis-driven 寫法，decision brain 順著 SA 表面回答漂走，挖不出 edge case / 例外路徑 / decision branch。
2. **沒有階段性對齊** — SA 在訪談的前 70% 完全盲飛，要等 `generatePreviewFlowchart` 開牌才知道 bot 有沒有聽懂。錯了要靠 `routeRevision` 大改，代價高。

## Solution（two-pronged）

### A. Challenge mode（depth）
改 `DECIDE_NEXT_QUESTION_PROMPT`，強制每題用「hypothesis + 3 edge cases + 對應 suggestions」格式。Pure prompt 改動，無 state machine 變動。

### B. verify_logic checkpoint（mid-stream verification）
在 Interview Graph 跑完後加一個 out-of-graph node `verifyLogicNode`（同 `generatePreviewFlowchart` 的位置與模式）。當 decision brain 自評「這個 sub-module 邏輯成熟了」或硬上限 6 個 SA 回答觸發後，停下來向 SA 用結構化文字確認「觸發 / 主流程 / 決策點 / 例外 / 結束狀態」。SA 簽過字的切片進 `verified_logics[]`，供 output graph consolidate 階段優先採用。

## Scope decisions（brainstorming session 已敲定）

| 議題 | 決定 |
|------|------|
| 範圍 | challenge mode + verify_logic checkpoint 一起做 |
| Trigger | 混合：decision brain 自評 `logicReadiness.ready === true` OR 硬上限 `currentFeatureAnswerCount >= 6` |
| 切片格式 | 結構化 JSON internal + 自然語言條列渲染給 SA |
| 既有 gate | 砍 inline 預覽圖 (`generatePreviewFlowchart`)、保留多圖 review |
| Rejection | 快路：清 flag → 回到正常 USER_ANSWER → decision brain 接續追問 |
| Propagation | 補充 `consolidatedJson`（非取代 features[]）+ CONSOLIDATE_PROMPT 加註「verifiedLogics 優先採用」 |
| 架構模式 | Approach 3 — out-of-graph，直接替換 `generatePreviewFlowchart` slot |
| 出 output graph 時機 | 自動：`flowReadiness.ready && verified_logics.length >= 2` |
| `generatePreviewFlowchart.ts` | 暫不刪檔（dead code），觀察一週穩定再清理 |

## State additions

**`src/types/index.ts` — `GraphState`：**

```typescript
verified_logics: VerifiedLogic[]                       // 累計，跨 cycle 持久
awaitingLogicConfirmation: boolean                     // SA 確認中時鎖 input
pendingLogicSlice: VerifiedLogic | null                // 當前未確認的切片暫存
currentFeatureName: string                             // decideNextQuestion / understandAnswer 維護
currentFeatureAnswerCount: number                      // 硬上限計數
logicReadiness: { ready: boolean; reason: string }     // decideNextQuestion 評估
```

**新 type：**

```typescript
interface VerifiedLogic {
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

**新 `ChatMessage` 欄位：**

```typescript
logicSlice?: VerifiedLogic   // verify_logic message 帶這個給 ChatPanel 渲染卡片
```

**`createInitialState` 同步補預設值。**

**`graph.ts:GraphStateAnnotation` 同步加 6 個新欄位的 `Annotation.<T>({ reducer: (_a, b) => b, default: () => ... })`** — LangGraph 不認識 annotation 外的欄位，會在 graph.invoke() 時丟掉。

## Prompt changes

### DECIDE_NEXT_QUESTION_PROMPT（challenge mode + logicReadiness）

新增段落「🔴 問題寫法規則」，要求每個 question 必須是「Hypothesis + 3 Edge Cases + 對應選項」三段式：

```
✅ 範例：
「我猜你的 {功能名} 流程是 {hypothesis 一句話}。但在這類系統，通常會遇到三個邊界狀況：
 (A) {edge case A}
 (B) {edge case B}
 (C) {edge case C}
請問你的系統各自怎麼處理？或還有其他要補的？」

❌ 禁止寫法：
- 純開放式：「請說明這個功能的流程」
- 沒 hypothesis：「有什麼 edge case？」
- 沒選項：「會發生什麼？」
```

Hypothesis 來源：systemOverview、已知 features、SA 剛才答的內容自推。  
Edge case 來源：常見軟體 anti-pattern（權限、併發、不一致、外部失敗、超量、退回）自生。  
推不出來時明說：「我目前對 X 還沒概念，請先講一下這部分大概在做什麼」。

⚠️ 嚴禁用建設/施工/工地/購物車當例子（會污染 hypothesis）。

`suggestions` 規範：對應 (A)(B)(C) 三個 edge case + 一個「其他（請說明）」。

**回應 JSON schema 新增：**

```json
{
  "currentFeatureName": "目前聚焦的 feature 名（從上下文推）",
  "logicReadiness": { "ready": true/false, "reason": "為什麼判定成熟" },
  ...既有欄位
}
```

### UNDERSTAND_ANSWER_PROMPT（追蹤 currentFeatureName）

新增 `currentFeatureName` 欄位於回應 JSON，讓 SW 可在 understandAnswer 之後追蹤 feature 切換並 reset `currentFeatureAnswerCount`。

**Precedence**：understandAnswer 與 decideNextQuestion 都會回 currentFeatureName。順序是 understandAnswer 先跑（給粗略推測，因為它先看 SA 答了什麼），接著 ig.invoke() 跑 decideNextQuestion（後跑、更權威，因為它已看過 understandAnswer 更新後的整個 state）。在 SW handler 內以 `result.currentFeatureName ?? updatedState.currentFeatureName` 取，後者為前者的 fallback。

### VERIFY_LOGIC_PROMPT（新 prompt）

```
你正在和 SA 確認「${featureName}」這個功能的業務邏輯。

請從以下最近的對話中，抽出 SA 已經講清楚的邏輯，整理成結構化 JSON。

對話：
${recentConversation}      // 最近 12 句（6 對話輪）

🔴 重要原則
- 只抽 SA 真的講過、或明確同意過的內容
- 沒講過的欄位寫空字串 "" 或空陣列 []，不要腦補
- 不要套用其他領域慣例（建設/施工等）除非 SA 自己提到

回傳 JSON：
{
  "featureName": "${featureName}",
  "trigger": "什麼角色在什麼情境下進入這個功能",
  "mainFlow": ["（角色） 在 X 頁面 操作 → 系統 反應", "..."],
  "decisionPoints": [
    { "condition": "...", "branches": [{ "case": "...", "result": "..." }] }
  ],
  "exceptionFlow": [{ "name": "...", "trigger": "...", "handling": "..." }],
  "endStates": ["..."]
}
```

Brain：**understanding**（同性質：把對話結構化成 JSON）。

### CONSOLIDATE_PROMPT 加註

```
🔴 verifiedLogics 是 SA 已逐一明確簽字畫押的邏輯切片。
- 整合 features[] 時，verifiedLogics 內容**優先採用**作為事實基礎
- conversationHistory 與 features[] 用來補充 verifiedLogics 沒覆蓋的面向
- 若兩者衝突，以 verifiedLogics 為準
```

並在 `consolidateInfoNode` 把 `verifiedLogics: state.verified_logics` 加入 `allData` payload。

## New node — `nodes/verifyLogic.ts`

```typescript
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

## ChatPanel rendering — logic slice card

新 CSS class `.logic-slice-card` 渲染卡片，欄位以五段式呈現：

```tsx
{msg.logicSlice && (
  <div className="logic-slice-card">
    <div className="ls-row"><strong>1. 觸發：</strong>{slice.trigger}</div>
    <div className="ls-row"><strong>2. 主流程：</strong>
      <ol>{slice.mainFlow.map((s, i) => <li key={i}>{s}</li>)}</ol>
    </div>
    <div className="ls-row"><strong>3. 決策點：</strong>
      {slice.decisionPoints.map((dp, i) => (
        <div key={i}>
          <em>{dp.condition}</em>
          <ul>{dp.branches.map((b, j) => <li key={j}>{b.case} → {b.result}</li>)}</ul>
        </div>
      ))}
    </div>
    <div className="ls-row"><strong>4. 例外：</strong>
      <ul>{slice.exceptionFlow.map((ef, i) => <li key={i}><strong>{ef.name}</strong>：{ef.trigger} → {ef.handling}</li>)}</ul>
    </div>
    <div className="ls-row"><strong>5. 結束狀態：</strong>
      <ul>{slice.endStates.map((s, i) => <li key={i}>{s}</li>)}</ul>
    </div>
  </div>
)}
```

Action 按鈕：
- `✓ 沒錯，記錄此邏輯` → value `__CONFIRM_LOGIC__`
- `❌ 不對，我要調整` → value 是 free-text revision 訊息（走正常 USER_ANSWER 路徑）

## handleMessage glue（in `src/service-worker/index.ts`）

### Trigger（USER_ANSWER 正常路徑）

```typescript
// 1. understandAnswer + 追蹤 feature 切換
const update = await understandAnswerNode(stateForFlow, tm!, payload)
const newFeatureName = update.currentFeatureName ?? state.currentFeatureName
const featureChanged = newFeatureName && newFeatureName !== state.currentFeatureName
const countAfter = featureChanged ? 1 : (state.currentFeatureAnswerCount ?? 0) + 1
const updatedState = {
  ...state, ...update,
  currentFeatureName: newFeatureName,
  currentFeatureAnswerCount: countAfter,
}

// 2. interview graph 跑一次
const result = await ig.invoke(updatedState)
const lastMsg = result.conversationHistory[result.conversationHistory.length - 1]

// 3. 評估閘門
const logicReady = result.logicReadiness?.ready === true
const reachedCap = result.currentFeatureAnswerCount >= 6

if (logicReady || reachedCap) {
  notifySidePanel({ type: 'GENERATING_OUTPUT' })
  const slice = await verifyLogicNode(result, tm!)
  if (!slice) {
    // 抽不出 → fallback 推正常下一題（safe degradation）
    notifySidePanel({ type: 'BOT_MESSAGE', payload: lastMsg })
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
```

### __CONFIRM_LOGIC__ handler

```typescript
if (savedState.awaitingLogicConfirmation && message.payload === '__CONFIRM_LOGIC__') {
  const slice = savedState.pendingLogicSlice
  if (!slice) {
    // 不該發生，但 safe degradation
    notifySidePanel({ type: 'ERROR', payload: 'pendingLogicSlice 遺失' })
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

  // 推 ack 訊息（純通知）
  notifySidePanel({ type: 'BOT_MESSAGE', payload: {
    role: 'bot',
    content: `✓ 已記錄「${slice.featureName}」邏輯。已累計 ${updated.verified_logics.length} 個切片。`,
    timestamp: Date.now(),
  }})

  // 跑 interview graph 評估接下來該做什麼
  const result = await ig.invoke(updated)
  const lastMsg = result.conversationHistory[result.conversationHistory.length - 1]

  // 自動觸發 output graph 條件
  const interviewDone = result.flowReadiness?.ready === true && result.verified_logics.length >= 2

  if (interviewDone) {
    notifySidePanel({ type: 'GENERATING_OUTPUT' })
    notifyStatus('正在彙整所有已確認邏輯，產出完整報告...')
    const outputState: GraphState = { ...result, phase: 'output' }
    await saveState(outputState)
    const outputResult = await og.invoke(outputState)
    // 完全沿用 v1.14.3 既有 `__CONFIRM_OUTPUT__` handler 的後半段：
    // 1. parseDiagrams(outputResult.generatedMermaid)
    // 2. 若 diagrams.length === 0 → 直接 PREVIEW_READY
    // 3. 否則送 BOT_MESSAGE with diagrams 陣列 + actions（既有的 review flow）
    // 抽成 helper function `enterDiagramReviewOrPreview(outputResult)` 讓
    // __CONFIRM_OUTPUT__ 和此處共用同一條代碼路徑，避免兩處不一致漂移。
  } else {
    if (lastMsg) notifySidePanel({ type: 'BOT_MESSAGE', payload: lastMsg })
  }
  return { ok: true }
}
```

### Rejection（任何一個 `awaiting*` flag 期間打 free-text）

```typescript
const stateForFlow: GraphState = (savedState.awaitingConfirmation || savedState.awaitingDiagramConfirmation || savedState.awaitingLogicConfirmation)
  ? {
      ...savedState,
      awaitingConfirmation: false,
      awaitingDiagramConfirmation: false,
      awaitingLogicConfirmation: false,
      pendingLogicSlice: null,
    }
  : savedState
```

注意：rejection **不** reset `currentFeatureAnswerCount`（還在同 feature 繼續挖）。

## What stays / what changes

### Stays
- Interview Graph 三節點（initial_setup / decide_next_question / ask_question）
- Output Graph 四節點（consolidate / document / html / mermaid）
- 多圖 review（output graph 跑完仍逐張過）
- `__CONFIRM_OUTPUT__` 流程（給 revision flow 用）
- `generatePreviewFlowchart.ts` 檔案（dead code，觀察期保留）

### Changes
- `DECIDE_NEXT_QUESTION_PROMPT` — 加 challenge mode 段落 + schema 加 currentFeatureName / logicReadiness
- `UNDERSTAND_ANSWER_PROMPT` — 加 currentFeatureName 欄位於回應
- `CONSOLIDATE_PROMPT` — 加 verifiedLogics 優先採用段落
- `consolidateInfoNode` — payload 加 verified_logics
- `handleMessage` USER_ANSWER 路徑 — 砍 generatePreviewFlowchart 觸發、新增 verifyLogicNode 觸發
- `handleMessage` — 新增 `__CONFIRM_LOGIC__` handler、修 rejection flag 清理

### Added
- `nodes/verifyLogic.ts`（新）
- `VERIFY_LOGIC_PROMPT`（新 export）
- `GraphState` 6 個新欄位 + `VerifiedLogic` type
- `ChatMessage.logicSlice`（新欄位）
- `ChatPanel` 邏輯切片卡片渲染 + CSS

## Failure modes & degradation

| 情境 | 行為 |
|------|------|
| `verifyLogicNode` 回 null（JSON 抽不到） | Fallback 推正常下一題；console.warn 提示診斷 |
| Gemini 回應截斷導致 verifyLogic JSON 不完整 | JSON.parse 失敗 → 同上 fallback |
| 所有 verify 都被 reject | `verified_logics.length` 永遠 < 2 → 不自動進 output；SA 想結案要打字觸發 revision flow |
| flowReadiness 永遠不 ready | 同上；SA 可以打字「產出報告」走 revision 把 phase 改 output |
| `pendingLogicSlice` 在確認時遺失 | 推 ERROR；不應發生（state 持久化保險） |

## Out of scope

- 自動偵測「應該開新討論」並 spawn 多 verify 切片
- Per-decision-point 的細粒度 verify（目前單位是 feature）
- Cross-feature consistency check（兩個 verified_logics 邏輯互打架時的 detection）
- Mermaid mini-flowchart 嵌入 verify card（已決定純文字渲染）
- 刪除 `generatePreviewFlowchart.ts`（觀察期保留，後續清理）

## Testing approach

- 手動：跑兩輪訪談（不同領域：營造 vs SaaS dashboard），確認 challenge mode 問題不再油膩、verify 切片內容對應 SA 真的講過的話
- Log 檢查：SW console 應出現 `[verifyLogic]` 相關訊息（成功路徑無 warning，失敗路徑明確 warn）
- 既有 tests/ 目錄因 GraphState 加新欄位會編譯失敗（已知 pre-existing 問題），更新 test fixture

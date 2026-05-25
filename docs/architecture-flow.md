# SA Interview Bot — 架構流程圖

> 用於 architecture review。涵蓋 v1.14.3 的完整訊息流：訊息進 SW → 走 LangGraph → 出 BOT_MESSAGE / PREVIEW_READY。

## 系統節點清單

### A. Interview Graph（`buildInterviewGraph` in `src/service-worker/graph.ts:47`）
| Node | 檔案 | LLM brain |
|------|------|-----------|
| `initial_setup` | `nodes/initialSetup.ts` | decision（第一輪合併：分析資料 + 找缺口 + 第一題） |
| `decide_next_question` | `nodes/decideNextQuestion.ts` | decision（決定下題 + 自評 `flowReadiness`） |
| `ask_question` | `nodes/askQuestion.ts` | 無 LLM（純邏輯，包 ChatMessage 推進 history） |

### B. Out-of-graph 節點（在 `src/service-worker/index.ts:handleMessage` 直接呼叫）
| Node | 觸發 | LLM brain |
|------|------|-----------|
| `understandAnswer` | 每次 USER_ANSWER **進 interview graph 之前** | understanding（結構化回答 + 更新 phase / systemOverview / userRoles） |
| `generatePreviewFlowchart` | decision brain 自評 ready 且滿足門檻時，**取代正常 ask_question** | output（inline 預覽流程圖） |
| `routeRevision` | `phase=review` 期間 SA 訊息含「修改」 | decision（判斷該回哪個 phase 重來） |

### C. Output Graph（`buildOutputGraph` in `src/service-worker/graph.ts:72`）
| Node | 檔案 | LLM brain |
|------|------|-----------|
| `consolidate_info` | `nodes/consolidateInfo.ts` | understanding（整合對話 + 抽 systemName） |
| `generate_document` | `nodes/generateDocument.ts` | output（產 Markdown + 後處理清孤立 dash） |
| `generate_html` | `nodes/generateHtmlContent.ts` | output（產 Tailwind 語意 HTML，繞過 marked.js） |
| `generate_mermaid` | `nodes/generateMermaid.ts` | output（每功能 2 張圖 + 1 張互動序列） |

---

## 完整流程圖

```mermaid
flowchart TD
  %% ============ ENTRY ============
  Start(["SA 開啟 side panel"]) --> Router{"chrome.runtime<br/>訊息類型?"}

  Router -->|INIT_SESSION| Init["建立空 state<br/>跑 Interview Graph"]
  Router -->|FILE_UPLOAD| Init
  Router -->|USER_ANSWER| UAGate{"savedState 旗標?"}
  Router -->|CONTINUE_DISCUSSION| Cont["重置 phase=features<br/>推 BOT_MESSAGE 詢問下個模組"]

  %% ============ USER_ANSWER 旗標判斷 ============
  UAGate -->|"awaitingConfirmation<br/>&& '__CONFIRM_OUTPUT__'"| OGStart
  UAGate -->|"awaitingDiagramConfirmation<br/>&& '__CONFIRM_DIAGRAMS__'"| PreviewReady
  UAGate -->|"phase=review<br/>&& 含 '修改'"| Revision
  UAGate -->|其他正常回答| UA

  %% ============ INTERVIEW GRAPH ============
  UA["understandAnswer<br/>out-of-graph<br/>understanding brain"] --> IGEntry
  Init --> IGEntry["Interview Graph START"]
  IGEntry --> CondEdge{"missingInfo<br/>是否為空?"}
  CondEdge -->|"是（第一輪）"| InitialSetup["initial_setup<br/>decision brain<br/>分析 + 缺口 + 第一題"]
  CondEdge -->|"否（第 N 輪）"| DecideNext["decide_next_question<br/>decision brain<br/>下個問題 + flowReadiness 自評"]
  InitialSetup --> AskQ["ask_question<br/>純邏輯<br/>包 ChatMessage 推進 history"]
  DecideNext --> AskQ
  AskQ --> IGEnd["Interview Graph END<br/>回到 handleMessage"]

  %% ============ 預覽流程圖閘門 ============
  IGEnd --> ReadyGate{"flowReadiness 達標?<br/>ready && decisionPoints≥2<br/>&& hasExceptionFlow<br/>&& newAnswers≥3<br/>OR newAnswers≥8 OR phase=done"}
  ReadyGate -->|否| BotMsg["BOT_MESSAGE<br/>繼續訪談"]
  ReadyGate -->|是| GenPreview["generatePreviewFlowchart<br/>out-of-graph · output brain<br/>畫預覽圖"]
  GenPreview --> InlineConfirm["BOT_MESSAGE with mermaidPreview<br/>+ 按鈕：✓ 正確 / 需要修改<br/>awaitingConfirmation=true"]

  BotMsg --> Wait1((回到 chat<br/>等待 SA))
  InlineConfirm --> Wait2((等待 SA 按按鈕))

  %% ============ OUTPUT GRAPH ============
  OGStart["GENERATING_OUTPUT<br/>送 lock UI"] --> OG1["consolidate_info<br/>understanding brain<br/>整合 + 抽 systemName"]
  OG1 --> OG2["generate_document<br/>output brain<br/>產 Markdown<br/>+ fixOrphanListMarkers"]
  OG2 --> OG3["generate_html<br/>output brain<br/>產 Tailwind 語意 HTML"]
  OG3 --> OG4["generate_mermaid<br/>output brain<br/>每功能 2 張 + 互動序列"]
  OG4 --> ParseDiag["parseDiagrams<br/>切成 {title, code}[]<br/>容錯：```mermaid 或 ``` + 首行關鍵字驗證"]

  ParseDiag --> DiagGate{"diagrams.length > 0?"}
  DiagGate -->|否| PreviewReady
  DiagGate -->|是| ReviewMsg["BOT_MESSAGE with diagrams 陣列<br/>+ 按鈕：✓ 全部正確 / 需要修改<br/>awaitingDiagramConfirmation=true"]
  ReviewMsg --> Wait3((等待 SA 確認所有圖))

  PreviewReady["PREVIEW_READY<br/>payload: document, html, mermaid, systemName"] --> PreviewScreen(["Preview 畫面<br/>下載 HTML / .md / .mmd<br/>每張圖可點擊放大 zoom+pan"])

  %% ============ REVISION 路徑 ============
  Revision["routeRevision<br/>decision brain<br/>判斷該回哪個 phase"] --> RevBranch{"routedState.phase<br/>= output?"}
  RevBranch -->|是| OG1
  RevBranch -->|否| IGEntry

  Cont --> Wait1

  %% ============ STYLING ============
  classDef decision fill:#fef3c7,stroke:#d97706
  classDef understanding fill:#dbeafe,stroke:#2563eb
  classDef output fill:#dcfce7,stroke:#16a34a
  classDef purelogic fill:#f3f4f6,stroke:#6b7280
  classDef state fill:#fce7f3,stroke:#db2777

  class InitialSetup,DecideNext,Revision decision
  class UA,OG1 understanding
  class GenPreview,OG2,OG3,OG4 output
  class AskQ,ParseDiag,Cont,Init,Router,UAGate,CondEdge,ReadyGate,DiagGate,RevBranch purelogic
  class InlineConfirm,ReviewMsg,PreviewReady,BotMsg state
```

---

## 關鍵狀態旗標

| 旗標 | 設立時機 | 清除時機 | 用途 |
|------|---------|---------|------|
| `awaitingConfirmation` | inline 預覽圖送出後 | SA 按 `__CONFIRM_OUTPUT__` 或回任意訊息 | 鎖住 input，引導 SA 用按鈕 |
| `awaitingDiagramConfirmation` | 多圖 review 訊息送出後 | SA 按 `__CONFIRM_DIAGRAMS__` 或回任意訊息 | 同上 |
| `flowReadiness` | 每次 `decide_next_question` 評估 | 同上 | 觸發 generatePreviewFlowchart 的閘門 |

## 三個 Gemini brain tab（`tabManager.ts`）
- **decision** — initialSetup / decideNextQuestion / routeRevision
- **understanding** — understandAnswer / consolidateInfo
- **output** — generatePreviewFlowchart / generateDocument / generateHtmlContent / generateMermaid

每個 brain tab 有自己的 session URL（持久化在 `chrome.storage.session`），SW 重啟可 restore。

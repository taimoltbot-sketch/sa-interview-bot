# Graph Report - .  (2026-05-23)

## Corpus Check
- Corpus is ~11,940 words - fits in a single context window. You may not need a graph.

## Summary
- 271 nodes · 532 edges · 19 communities (14 shown, 5 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 33 edges (avg confidence: 0.87)
- Token cost: 124,150 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_LangGraph Dispatcher Core|LangGraph Dispatcher Core]]
- [[_COMMUNITY_Output Generation & Notify|Output Generation & Notify]]
- [[_COMMUNITY_Extension Manifest & Concepts|Extension Manifest & Concepts]]
- [[_COMMUNITY_Input Analysis & Question Planning|Input Analysis & Question Planning]]
- [[_COMMUNITY_Build Toolchain (devDependencies)|Build Toolchain (devDependencies)]]
- [[_COMMUNITY_Sidepanel UI & Runtime Protocol|Sidepanel UI & Runtime Protocol]]
- [[_COMMUNITY_Gemini DOM Automation|Gemini DOM Automation]]
- [[_COMMUNITY_Preview Rendering & Runtime Deps|Preview Rendering & Runtime Deps]]
- [[_COMMUNITY_TabManager Lifecycle|TabManager Lifecycle]]
- [[_COMMUNITY_TypeScript Build Config|TypeScript Build Config]]
- [[_COMMUNITY_TabManager Tests|TabManager Tests]]
- [[_COMMUNITY_ChatPanel Internals|ChatPanel Internals]]
- [[_COMMUNITY_FileUpload Internals|FileUpload Internals]]
- [[_COMMUNITY_Gemini DOM Tests|Gemini DOM Tests]]
- [[_COMMUNITY_StateStorage Tests|StateStorage Tests]]
- [[_COMMUNITY_Isolated Bridge Script|Isolated Bridge Script]]
- [[_COMMUNITY_Gemini Selector Test File|Gemini Selector Test File]]

## God Nodes (most connected - your core abstractions)
1. `TabManager` - 29 edges
2. `GraphState` - 21 edges
3. `TabManager.sendToTab (retry loop)` - 16 edges
4. `handleMessage()` - 14 edges
5. `App()` - 12 edges
6. `initialSetupNode()` - 11 edges
7. `notifyStatus()` - 10 edges
8. `compilerOptions` - 9 edges
9. `sendPromptWithImages()` - 9 edges
10. `sendPromptAndGetResponse()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Project README` --references--> `Chrome MV3 Side Panel Extension`  [EXTRACTED]
  README.md → manifest.json
- `buildHtmlReport()` --calls--> `marked`  [INFERRED]
  src/sidepanel/htmlReport.ts → package.json
- `Preview()` --calls--> `marked`  [INFERRED]
  src/sidepanel/components/Preview.tsx → package.json
- `extractMermaidBlocks` --semantically_similar_to--> `extractDiagrams()`  [INFERRED] [semantically similar]
  src/sidepanel/components/Preview.tsx → src/sidepanel/htmlReport.ts
- `generatePreviewFlowchart()` --semantically_similar_to--> `generateMermaidNode()`  [INFERRED] [semantically similar]
  src/service-worker/nodes/generatePreviewFlowchart.ts → src/service-worker/nodes/generateMermaid.ts

## Hyperedges (group relationships)
- **Interview LangGraph pipeline (START -> initial_setup|decide_next_question -> ask_question -> END)** — service_worker_graph_buildinterviewgraph, nodes_initialsetup_initialsetupnode, nodes_decidenextquestion_decidenextquestionnode, nodes_askquestion_askquestionnode [EXTRACTED 1.00]
- **Output LangGraph pipeline (consolidate -> generate_document -> generate_mermaid)** — service_worker_graph_buildoutputgraph, nodes_consolidateinfo_consolidateinfonode, nodes_generatedocument_generatedocumentnode, nodes_generatemermaid_generatemermaidnode [EXTRACTED 1.00]
- **Service worker to Gemini DOM bridge (SW -> isolated bridge -> MAIN world Gemini automation)** — service_worker_tabmanager_sendtotab, content_script_isolatedbridge_listener, content_script_gemini_sendpromptandgetresponse [INFERRED 0.95]
- **Async user-message queue/drain across UI and SW** — sidepanel_app_handleusersend, sidepanel_app_drainqueue, sidepanel_app_markfirstqueuedassent, sidepanel_app_runtimelistener, concept_runtime_message_protocol [INFERRED 0.85]
- **Document/Mermaid preview & download pipeline** — sidepanel_components_preview_preview, sidepanel_htmlreport_buildhtmlreport, sidepanel_htmlreport_extractdiagrams, sidepanel_components_preview_extractmermaidblocks [INFERRED 0.85]
- **Test suite shares Chrome API mocking harness** — tests_setup_chromemock, tests_statestorage_test, tests_tabmanager_test, tests_nodes_analyzefiles_test, tests_nodes_generatedocument_test [EXTRACTED 1.00]

## Communities (19 total, 5 thin omitted)

### Community 0 - "LangGraph Dispatcher Core"
Cohesion: 0.10
Nodes (31): baseState, mockTabManager, state, askQuestionNode(), baseState, mockTabManager, state, routeRevisionNode() (+23 more)

### Community 1 - "Output Generation & Notify"
Cohesion: 0.13
Nodes (27): consolidateInfoNode(), extractBetweenMarkers(), generateDocumentNode(), extractBetweenMarkers(), generateMermaidNode(), clearSubStatus(), logEvent(), logReceived() (+19 more)

### Community 2 - "Extension Manifest & Concepts"
Cohesion: 0.08
Nodes (26): Gemini DOM automation (no API key), Chrome MV3 Side Panel Extension, Three Gemini Brains Architecture (Decision/Understanding/Output), Project README, action, default_title, background, service_worker (+18 more)

### Community 3 - "Input Analysis & Question Planning"
Cohesion: 0.13
Nodes (21): analyzeFilesNode(), buildExcelSummary(), parseJsonResponse(), decideNextQuestionNode(), DEFAULT_READINESS, normalizeReadiness(), extractBetweenMarkers(), generatePreviewFlowchart() (+13 more)

### Community 4 - "Build Toolchain (devDependencies)"
Cohesion: 0.08
Nodes (24): author, description, devDependencies, @crxjs/vite-plugin, jsdom, playwright, @testing-library/jest-dom, @testing-library/react (+16 more)

### Community 5 - "Sidepanel UI & Runtime Protocol"
Cohesion: 0.13
Nodes (21): User-message queue/drain pattern, chrome.runtime message protocol (BOT_MESSAGE/STATUS_UPDATE/GENERATING_OUTPUT/PREVIEW_READY/ERROR/USER_ANSWER/FILE_UPLOAD/INIT_SESSION/CONTINUE_DISCUSSION), App(), drainQueue, handleContinueDiscussion, handleFileUpload, handleRevision, handleUserSend (+13 more)

### Community 6 - "Gemini DOM Automation"
Cohesion: 0.25
Nodes (18): clickSend(), countResponseElements(), findElement(), getAllResponseElements(), getLastResponseText(), injectImage(), injectPrompt(), INPUT_SELECTORS (+10 more)

### Community 7 - "Preview Rendering & Runtime Deps"
Cohesion: 0.16
Nodes (13): Preview(), Props, dependencies, framer-motion, @langchain/langgraph, marked, mermaid, react (+5 more)

### Community 9 - "TypeScript Build Config"
Cohesion: 0.18
Nodes (10): compilerOptions, jsx, lib, module, moduleResolution, skipLibCheck, strict, target (+2 more)

### Community 10 - "TabManager Tests"
Cohesion: 0.33
Nodes (5): AnyMock, caught, initPromise, manager, sendPromise

### Community 13 - "Gemini DOM Tests"
Cohesion: 0.40
Nodes (3): btn, el, response

### Community 14 - "StateStorage Tests"
Cohesion: 0.40
Nodes (4): getMock, mockState, setMock, state

## Knowledge Gaps
- **92 isolated node(s):** `name`, `version`, `description`, `main`, `test` (+87 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `App()` connect `Sidepanel UI & Runtime Protocol` to `LangGraph Dispatcher Core`, `Extension Manifest & Concepts`?**
  _High betweenness centrality (0.294) - this node is a cross-community bridge._
- **Why does `ReactDOM root mount` connect `Extension Manifest & Concepts` to `Sidepanel UI & Runtime Protocol`?**
  _High betweenness centrality (0.197) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _92 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `LangGraph Dispatcher Core` be split into smaller, more focused modules?**
  _Cohesion score 0.10299003322259136 - nodes in this community are weakly interconnected._
- **Should `Output Generation & Notify` be split into smaller, more focused modules?**
  _Cohesion score 0.12857142857142856 - nodes in this community are weakly interconnected._
- **Should `Extension Manifest & Concepts` be split into smaller, more focused modules?**
  _Cohesion score 0.07936507936507936 - nodes in this community are weakly interconnected._
- **Should `Input Analysis & Question Planning` be split into smaller, more focused modules?**
  _Cohesion score 0.1339031339031339 - nodes in this community are weakly interconnected._
# SA Interview Bot

Chrome Extension，透過對話訪談 System Analyst，自動產出**業務流程文件（Markdown）**與 **Mermaid 流程圖**。

---

## 運作原理

Extension 在背景開啟 3 個 Gemini 分頁作為 AI 引擎：

| 角色 | 功能 |
|------|------|
| Decision Brain | 決定下一個問題、判斷資訊是否足夠 |
| Understanding Brain | 解析 SA 的回答、萃取結構化資訊 |
| Output Brain | 生成業務流程文件與 Mermaid 圖 |

你只需要在側邊欄對話，Extension 自動協調三個 AI 完成訪談與文件產出。

---

## 安裝步驟

### 前置條件

- Google Chrome 瀏覽器
- Node.js 18+（需要 build）
- 已登入 Google 帳號（用於 Gemini）

---

### 方法一：直接使用 dist（已 build 好）

1. **下載 Repo**

   ```bash
   git clone https://github.com/taimoltbot-sketch/sa-interview-bot.git
   cd sa-interview-bot
   ```

2. **安裝依賴並 Build**

   ```bash
   npm install
   npx vite build
   ```

3. **載入 Extension**

   - 開啟 Chrome，網址列輸入 `chrome://extensions`
   - 右上角開啟「**開發人員模式**」
   - 點「**載入未封裝項目**」
   - 選擇專案裡的 **`dist`** 資料夾

4. **確認安裝成功**

   Extension 清單中出現「SA Interview Bot」即完成。

---

## 使用方式

### Step 1：開啟側邊欄

- 點擊 Chrome 工具列的 Extension 圖示
- 選「**開啟側邊欄**」

或：對任意頁面按右鍵 → 「SA Interview Bot」→「開啟側邊欄」

---

### Step 2：登入 Gemini（首次使用）

Extension 會自動在背景開啟 3 個 Gemini 分頁。若尚未登入，Chrome 會跳出 Google 登入畫面，請先完成登入。

> **注意**：這 3 個 Gemini 分頁是 AI 引擎，請不要關閉它們。

---

### Step 3：開始訪談

**上傳截圖或 Excel（可選）**

如果你有系統截圖或 Excel 需求文件，可以先上傳，Bot 會自動分析後開始提問。

**直接開始對話**

點「**開始對話**」，Bot 會引導你描述：
1. 系統概述（這個系統是做什麼的？）
2. 使用者角色（誰會用這個系統？各有什麼權限？）
3. 主要功能流程（各功能如何操作？）
4. 系統整合（有哪些外部系統串接？）
5. 業務規則（有哪些限制或規則？）

---

### Step 4：產出文件

回答約 6 個問題後，Bot 自動生成：

- **業務流程文件**（Markdown 格式）
- **Mermaid 流程圖**

可直接下載 `.md` 與 `.mmd` 檔案。

---

## 遇到 CAPTCHA？

Gemini 偶爾會出現 CAPTCHA 驗證。請直接在跳出的 Gemini 分頁手動完成驗證，之後 Extension 會自動繼續運作。

---

## 開發指令

```bash
# 安裝依賴
npm install

# Build（產生 dist/）
npx vite build

# 修改程式碼後需要重新 build，
# 然後到 chrome://extensions 點「重新整理」
```

---

## 專案結構

```
src/
├── sidepanel/          # 聊天介面（React + framer-motion）
├── service-worker/     # 核心邏輯（LangGraph + TabManager）
│   └── nodes/          # 各 AI 節點（分析/提問/生成）
├── content-script/     # Gemini DOM 自動化
└── types/              # TypeScript 型別定義
```

---

## 技術棧

- **Chrome Extension** Manifest V3
- **React 19** + **framer-motion**（UI）
- **LangGraph.js**（AI 流程編排）
- **Gemini**（透過 DOM 自動化，無需 API Key）
- **Vite** + **TypeScript**

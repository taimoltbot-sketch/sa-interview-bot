/**
 * Real Gemini integration test.
 * First run: logs you into Gemini, then saves the session.
 * Subsequent runs: reuses the saved session.
 *
 * Usage: node test-real-gemini.mjs
 */

import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXTENSION_PATH = path.resolve(__dirname, 'dist')
const USER_DATA_DIR = path.resolve(__dirname, '.test-chrome-profile-2')

// Test file — use a real SA screenshot if available, otherwise a minimal PNG
const TEST_IMAGE = fs.existsSync('/tmp/sa-screenshot-1.png')
  ? '/tmp/sa-screenshot-1.png'
  : (() => {
      const png = Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
        '0000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
        'hex'
      )
      fs.writeFileSync('/tmp/sa-test.png', png)
      return '/tmp/sa-test.png'
    })()

async function main() {
  console.log('Launching Chrome with extension from:', EXTENSION_PATH)
  console.log('User data dir:', USER_DATA_DIR)

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    args: [
      `--load-extension=${EXTENSION_PATH}`,
      `--disable-extensions-except=${EXTENSION_PATH}`,
      '--no-sandbox',
      '--window-size=1280,800',
      '--disable-blink-features=AutomationControlled',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    acceptDownloads: true,
  })

  // Get extension ID — service worker may already be registered before we listen,
  // so try both approaches and also fall back to chrome://extensions scraping
  let extensionId = context.serviceWorkers()[0]?.url().split('/')[2]
  if (!extensionId) {
    const sw = await context.waitForEvent('serviceworker', { timeout: 8000 }).catch(() => null)
    extensionId = sw?.url().split('/')[2]
  }
  if (!extensionId) {
    // Navigate to chrome://extensions and scrape the ID
    const extPage = await context.newPage()
    await extPage.goto('chrome://extensions/', { waitUntil: 'domcontentloaded' })
    await extPage.waitForTimeout(1500)
    extensionId = await extPage.evaluate(() => {
      // Extensions page uses a shadow DOM
      const manager = document.querySelector('extensions-manager')
      const container = manager?.shadowRoot?.querySelector('extensions-item-list')
      const items = container?.shadowRoot?.querySelectorAll('extensions-item')
      if (!items) return null
      for (const item of items) {
        const name = item.shadowRoot?.querySelector('#name')?.textContent ?? ''
        if (name.includes('SA') || name.includes('Interview') || name.includes('interview')) {
          return item.getAttribute('id')
        }
      }
      // Fallback: just grab the first non-Chrome extension ID
      for (const item of items) {
        const id = item.getAttribute('id')
        if (id && id.length === 32) return id
      }
      return null
    })
    await extPage.close()
  }
  if (!extensionId) throw new Error('Could not detect extension ID. Is the extension built? Run: npx vite build')
  console.log('Extension ID:', extensionId)

  // Check Gemini login status
  const checkPage = await context.newPage()
  await checkPage.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await checkPage.waitForTimeout(3000)

  const isLoggedIn = await checkPage.evaluate(() => {
    // Gemini shows a textarea or chat input when logged in
    return !!document.querySelector('rich-textarea, [contenteditable="true"], textarea')
  })

  if (!isLoggedIn) {
    console.log('\n⚠️  Not logged into Gemini.')
    console.log('Please log in to your Google account in the browser window that just opened.')
    console.log('After logging in, press Enter here to continue...')
    await new Promise(resolve => process.stdin.once('data', resolve))
    await checkPage.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded' })
    await checkPage.waitForTimeout(3000)
  } else {
    console.log('✓ Already logged into Gemini')
  }
  await checkPage.close()

  // Open side panel
  const sidePanelUrl = `chrome-extension://${extensionId}/src/sidepanel/index.html`
  const page = await context.newPage()
  await page.setViewportSize({ width: 420, height: 720 })
  await page.goto(sidePanelUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
  await page.waitForTimeout(1000)

  await page.screenshot({ path: 'real-1-welcome.png' })
  console.log('\nScreenshot 1: Welcome')

  // Upload the SA screenshot
  console.log('Uploading SA screenshot...')
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(TEST_IMAGE)

  // Give TabManager time to open Gemini tabs (sequential, 3s each = ~12s total)
  await page.waitForTimeout(15000)

  // Check for CAPTCHA and wait for user to solve if needed
  const allPagesCaptcha = context.pages()
  const captchaPages = allPagesCaptcha.filter(p => p.url().includes('sorry'))
  if (captchaPages.length > 0) {
    console.log(`\n⚠️  ${captchaPages.length} Gemini tab(s) hit CAPTCHA!`)
    console.log('Please solve the CAPTCHA in the Chrome browser window(s), then press Enter here...')
    await new Promise(resolve => process.stdin.once('data', resolve))
    // Wait for CAPTCHA tabs to redirect back to Gemini
    await Promise.all(
      captchaPages.map(p =>
        p.waitForURL('https://gemini.google.com/**', { timeout: 60000 }).catch(() => {})
      )
    )
    console.log('CAPTCHA resolved, continuing...')
    await page.waitForTimeout(3000)
  }

  // Snapshot all open pages
  const allPages = context.pages()
  console.log(`Open pages (${allPages.length}):`)
  for (let i = 0; i < allPages.length; i++) {
    const url = allPages[i].url()
    console.log(`  [${i}] ${url.substring(0, 80)}`)
    if (url.includes('gemini')) {
      await allPages[i].screenshot({ path: `/tmp/gemini-init-tab${i}.png` }).catch(() => {})
      const inputState = await allPages[i].evaluate(() => {
        const input = document.querySelector('.ql-editor')
        const btn = document.querySelector('button[aria-label="傳送訊息"]')
        return { hasInput: !!input, inputText: input?.textContent?.trim()?.substring(0, 50) || '', btnDisabled: btn?.getAttribute('aria-disabled') === 'true' }
      }).catch(e => ({ error: e.message }))
      console.log(`  → Input state: ${JSON.stringify(inputState)}`)
    }
  }

  // Service worker will open 3 Gemini tabs + send init prompts — wait generously
  console.log('Waiting for TabManager to initialize 3 Gemini tabs and send prompts...')
  await page.waitForSelector('textarea:not([disabled])', { timeout: 180000 })
  await page.waitForTimeout(500)

  await page.screenshot({ path: 'real-2-bot-first-question.png' })
  console.log('Screenshot 2: Bot first question (real Gemini response)')

  // Pre-scripted answers covering all key SA information areas
  const ANSWERS = [
    '這是一個建築工程管理後台系統，用來管理施工進度、人員出勤記錄、材料進場記錄。主要使用者是工地主任和管理員。',
    '使用者角色有：工地主任（可新增/編輯/刪除施工項目、審核材料進場）、管理員（系統設定、報表匯出）、現場工人（唯讀，只能查看任務與回報進度）。',
    '施工項目管理的流程：工地主任登入後進入施工項目管理頁，看到所有項目清單（含編號、項目名稱、狀態、責任人）。點新增項目，填寫名稱、責任工班、預計開始/完工日期、備註，儲存後系統自動通知相關現場工人。工人收到通知後可進入系統查看自己的任務，完成後點「回報完成」，工地主任再審核確認。如有問題可在備註欄加附說明。',
    '出勤記錄管理：記錄每天現場工人出勤，包含姓名、出勤時間、工種、工資計算。材料管理：記錄材料名稱、數量、進場日期、供應商，並與廠商資料連動查詢聯絡方式。',
    '系統整合：與廠商管理系統整合查詢聯絡資訊；報表功能與 Excel 匯出整合；手機 App 通知整合讓工人收到任務提醒。',
    '業務規則：施工項目狀態流程為 待開始→進行中→完成→已審核；材料入場需工地主任審核；工人只能查看自己的任務；管理員可設定每月工資計算基準；所有操作需記錄在系統日誌中。',
  ]

  let answerIndex = 0
  let gotPreview = false

  // Keep answering until preview appears (up to all pre-scripted answers)
  while (!gotPreview && answerIndex < ANSWERS.length) {
    const answer = ANSWERS[answerIndex]
    console.log(`\nAnswering question ${answerIndex + 1}...`)
    await page.fill('textarea', answer)
    await page.screenshot({ path: `real-answer${answerIndex + 1}.png` })
    await page.keyboard.press('Enter')
    answerIndex++

    const outcome = await Promise.race([
      page.waitForSelector('.preview', { timeout: 180000 }).then(() => 'preview'),
      page.waitForSelector('textarea:not([disabled])', { timeout: 180000 }).then(() => 'chat'),
    ])
    console.log(`After answer ${answerIndex}: outcome = ${outcome}`)

    if (outcome === 'preview') {
      gotPreview = true
    }
  }

  if (!gotPreview) {
    // All pre-scripted answers exhausted but no preview — force output by describing we're done
    console.log('All pre-scripted answers used, waiting for preview...')
    await page.fill('textarea', '我已經描述了所有主要功能，請根據以上資訊生成業務流程文件。')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.preview', { timeout: 300000 })
  }

  await page.waitForTimeout(3000) // let mermaid render
  await page.screenshot({ path: 'real-7-preview-document.png' })
  console.log('Screenshot 7: Preview - Business document (REAL Gemini output)')

  await page.evaluate(() => {
    const preview = document.querySelector('.preview')
    if (preview) preview.scrollTop = preview.scrollHeight / 2
  })
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'real-8-preview-mermaid.png' })
  console.log('Screenshot 8: Preview - Mermaid flowchart (REAL Gemini output)')

  // Scroll to top to see download buttons
  await page.evaluate(() => {
    const preview = document.querySelector('.preview')
    if (preview) preview.scrollTop = 0
  })
  await page.waitForTimeout(300)

  // Download .md
  const [dl1] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    page.getByText('下載 .md').click(),
  ])
  const mdPath = `/tmp/${dl1.suggestedFilename()}`
  await dl1.saveAs(mdPath)
  console.log(`\nDownloaded .md → ${mdPath}`)

  // Download .mmd
  const [dl2] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    page.getByText('下載 .mmd').click(),
  ])
  const mmdPath = `/tmp/${dl2.suggestedFilename()}`
  await dl2.saveAs(mmdPath)
  console.log(`Downloaded .mmd → ${mmdPath}`)

  await page.screenshot({ path: 'real-9-downloaded.png' })
  console.log('Screenshot 9: After download')

  console.log('\n=== .md content ===')
  console.log(fs.readFileSync(mdPath, 'utf8'))
  console.log('\n=== .mmd content ===')
  console.log(fs.readFileSync(mmdPath, 'utf8'))

  console.log('\n✅ Done! Real Gemini files:', mdPath, mmdPath)

  await context.close()
}

main().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})

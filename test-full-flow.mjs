/**
 * Full end-to-end flow test with per-step screenshots.
 * Browser opens in non-headless mode — log in / solve CAPTCHA manually if prompted.
 * No stdin required: uses waitForURL/waitForSelector timeouts instead.
 */

import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXTENSION_PATH = path.resolve(__dirname, 'dist')
const USER_DATA_DIR = path.resolve(__dirname, '.test-chrome-profile-ff')
const SHOTS_DIR = '/tmp/sa-flow-shots'
fs.mkdirSync(SHOTS_DIR, { recursive: true })

let shotIndex = 0
async function shot(page, label) {
  const file = `${SHOTS_DIR}/${String(++shotIndex).padStart(2, '0')}-${label}.png`
  await page.screenshot({ path: file, fullPage: false })
  console.log(`📸 [${shotIndex}] ${label} → ${file}`)
  return file
}

// Minimal 1×1 PNG for file upload
const TEST_IMAGE = (() => {
  const p = '/tmp/sa-test-ff.png'
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
      '0000000a49444154789c6260000000020001e221bc330000000049454e44ae426082', 'hex'
    ))
  }
  return p
})()

async function getExtensionId(context) {
  let id = context.serviceWorkers()[0]?.url().split('/')[2]
  if (!id) {
    const sw = await context.waitForEvent('serviceworker', { timeout: 8000 }).catch(() => null)
    id = sw?.url().split('/')[2]
  }
  if (!id) {
    const p = await context.newPage()
    await p.goto('chrome://extensions/', { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(1500)
    id = await p.evaluate(() => {
      const mgr = document.querySelector('extensions-manager')
      const list = mgr?.shadowRoot?.querySelector('extensions-item-list')
      const items = list?.shadowRoot?.querySelectorAll('extensions-item') ?? []
      for (const item of items) {
        const name = item.shadowRoot?.querySelector('#name')?.textContent ?? ''
        if (name.includes('SA') || name.includes('Interview')) return item.getAttribute('id')
      }
      for (const item of items) {
        const id = item.getAttribute('id')
        if (id?.length === 32) return id
      }
      return null
    })
    await p.close()
  }
  return id
}

async function main() {
  console.log('Building extension first...')
  const { execSync } = await import('child_process')
  execSync('npx vite build', { cwd: __dirname, stdio: 'inherit' })

  console.log('\nLaunching Chrome...')
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    args: [
      `--load-extension=${EXTENSION_PATH}`,
      `--disable-extensions-except=${EXTENSION_PATH}`,
      '--no-sandbox',
      '--window-size=1400,900',
      '--disable-blink-features=AutomationControlled',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    acceptDownloads: true,
  })

  const extensionId = await getExtensionId(context)
  if (!extensionId) throw new Error('Extension ID not found. Is dist/ built?')
  console.log('Extension ID:', extensionId)

  // ── Step 1: Check Gemini login ──────────────────────────────────────────────
  const checkPage = await context.newPage()
  await checkPage.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await checkPage.waitForTimeout(3000)

  const isLoggedIn = await checkPage.evaluate(() =>
    !!document.querySelector('rich-textarea, [contenteditable="true"], textarea')
  )

  if (!isLoggedIn) {
    console.log('\n⚠️  Not logged in. Please log in to Google in the browser window.')
    console.log('    Waiting up to 3 minutes for login to complete...')
    await checkPage.waitForURL('https://gemini.google.com/app**', { timeout: 180000 }).catch(() => {})
    await checkPage.waitForTimeout(2000)
  } else {
    console.log('✓ Already logged in to Gemini')
  }
  await checkPage.close()

  // ── Step 2: Open side panel UI ──────────────────────────────────────────────
  const sidePanelUrl = `chrome-extension://${extensionId}/src/sidepanel/index.html`
  const page = await context.newPage()
  await page.setViewportSize({ width: 400, height: 720 })
  await page.goto(sidePanelUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
  await page.waitForTimeout(800)

  await shot(page, 'welcome-screen')

  // ── Step 3: Upload file ──────────────────────────────────────────────────────
  console.log('\nUploading SA screenshot...')
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(TEST_IMAGE)
  await page.waitForTimeout(500)
  await shot(page, 'after-file-upload')

  // Give TabManager time to open Gemini tabs (sequential, 3s each ≈ 12s)
  console.log('Waiting for TabManager to open Gemini tabs (~15s)...')
  await page.waitForTimeout(15000)

  // ── Step 4: Handle CAPTCHA ───────────────────────────────────────────────────
  const captchaPages = context.pages().filter(p => p.url().includes('sorry'))
  if (captchaPages.length > 0) {
    console.log(`\n⚠️  ${captchaPages.length} tab(s) hit CAPTCHA!`)
    console.log('    Please solve the CAPTCHA in the browser, then the test continues automatically.')
    for (const cp of captchaPages) {
      await cp.screenshot({ path: `${SHOTS_DIR}/captcha-detected.png` }).catch(() => {})
    }
    await Promise.all(
      captchaPages.map(p =>
        p.waitForURL('https://gemini.google.com/**', { timeout: 300000 }).catch(() => {})
      )
    )
    console.log('CAPTCHA resolved, continuing...')
    await page.waitForTimeout(3000)
  } else {
    console.log('✓ No CAPTCHA detected')
  }

  // Snapshot all open Gemini tabs
  const allPages = context.pages()
  console.log(`\nOpen pages (${allPages.length}):`)
  for (let i = 0; i < allPages.length; i++) {
    const url = allPages[i].url()
    console.log(`  [${i}] ${url.substring(0, 80)}`)
    if (url.includes('gemini')) {
      await allPages[i].screenshot({ path: `${SHOTS_DIR}/gemini-tab-${i}.png` }).catch(() => {})
    }
  }

  // ── Step 5: Wait for bot first question ──────────────────────────────────────
  console.log('\nWaiting for bot first question (up to 3 min)...')
  await page.waitForSelector('textarea:not([disabled])', { timeout: 180000 })
  await page.waitForTimeout(600)
  await shot(page, 'bot-first-question')

  // ── Step 6: Q&A loop ─────────────────────────────────────────────────────────
  const ANSWERS = [
    '這是一個建築工程管理後台系統，用來管理施工進度、人員出勤記錄、材料進場記錄。主要使用者是工地主任和管理員。',
    '使用者角色有：工地主任（可新增/編輯/刪除施工項目、審核材料進場）、管理員（系統設定、報表匯出）、現場工人（唯讀，只能查看任務與回報進度）。',
    '施工項目管理的流程：工地主任登入後進入施工項目管理頁，看到所有項目清單（含編號、項目名稱、狀態、責任人）。點新增項目，填寫名稱、責任工班、預計開始/完工日期、備註，儲存後系統自動通知相關現場工人。工人收到通知後可進入系統查看自己的任務，完成後點「回報完成」，工地主任再審核確認。',
    '出勤記錄管理：記錄每天現場工人出勤，包含姓名、出勤時間、工種、工資計算。材料管理：記錄材料名稱、數量、進場日期、供應商，並與廠商資料連動查詢聯絡方式。',
    '系統整合：與廠商管理系統整合查詢聯絡資訊；報表功能與 Excel 匯出整合；手機 App 通知整合讓工人收到任務提醒。',
    '業務規則：施工項目狀態流程為 待開始→進行中→完成→已審核；材料入場需工地主任審核；工人只能查看自己的任務；管理員可設定每月工資計算基準；所有操作需記錄在系統日誌中。',
  ]

  let gotPreview = false
  for (let i = 0; i < ANSWERS.length && !gotPreview; i++) {
    console.log(`\nSending answer ${i + 1}...`)
    await page.fill('textarea', ANSWERS[i])
    await shot(page, `answer-${i + 1}-filled`)

    await page.keyboard.press('Enter')

    // Wait for either: chat (bot asks next question) OR preview (output ready)
    // Also watch for generating-output state (textarea disabled, no new message expected quickly)
    const outcome = await Promise.race([
      page.waitForSelector('.preview', { timeout: 360000 }).then(() => 'preview'),
      page.waitForSelector('textarea:not([disabled])', { timeout: 360000 }).then(() => 'chat'),
    ])
    console.log(`  → outcome: ${outcome}`)
    await page.waitForTimeout(600)
    await shot(page, `after-answer-${i + 1}-${outcome}`)

    if (outcome === 'preview') {
      gotPreview = true
    } else if (i === ANSWERS.length - 1) {
      // Last answer — service worker may be generating output (textarea re-enabled by GENERATING_OUTPUT)
      // Wait up to 6 minutes for preview to arrive
      console.log('  Last answer sent — waiting up to 6 min for output generation...')
      const preview = await page.waitForSelector('.preview', { timeout: 360000 }).catch(() => null)
      if (preview) {
        gotPreview = true
        await shot(page, 'preview-arrived-after-last-answer')
      }
    }
  }

  // ── Step 7: Preview ──────────────────────────────────────────────────────────
  await page.waitForTimeout(3000) // let mermaid render
  await shot(page, 'preview-document-top')

  await page.evaluate(() => {
    const p = document.querySelector('.preview')
    if (p) p.scrollTop = p.scrollHeight / 2
  })
  await page.waitForTimeout(500)
  await shot(page, 'preview-mermaid-diagram')

  await page.evaluate(() => {
    const p = document.querySelector('.preview')
    if (p) p.scrollTop = 0
  })
  await page.waitForTimeout(300)

  // ── Step 8: Download ─────────────────────────────────────────────────────────
  // Debug DOM state before download
  const domState = await page.evaluate(() => {
    const preview = document.querySelector('.preview')
    const header = document.querySelector('.preview-header')
    const dlDiv = document.querySelector('.download-buttons')
    const btns = document.querySelectorAll('.download-buttons button')
    const view = document.querySelector('.app')?.dataset?.view ?? 'unknown'
    return {
      hasPreview: !!preview,
      previewDisplay: preview ? getComputedStyle(preview).display : 'none',
      previewOpacity: preview ? getComputedStyle(preview).opacity : '?',
      hasHeader: !!header,
      hasDlDiv: !!dlDiv,
      btnCount: btns.length,
      btnTexts: Array.from(btns).map(b => b.textContent?.trim()),
      bodyHTML: document.body.innerHTML.substring(0, 300),
    }
  })
  console.log('\nDOM state before download:', JSON.stringify(domState, null, 2))
  await shot(page, 'pre-download-debug')

  // Use evaluate-based download (bypasses visibility check)
  const [dl1] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.evaluate(() => {
      const btns = document.querySelectorAll('.download-buttons button')
      if (btns[0]) btns[0].click()
    }),
  ])
  const mdPath = `/tmp/${dl1.suggestedFilename()}`
  await dl1.saveAs(mdPath)
  console.log(`\nDownloaded .md → ${mdPath}`)

  const [dl2] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.evaluate(() => {
      const btns = document.querySelectorAll('.download-buttons button')
      if (btns[1]) btns[1].click()
    }),
  ])
  const mmdPath = `/tmp/${dl2.suggestedFilename()}`
  await dl2.saveAs(mmdPath)
  console.log(`Downloaded .mmd → ${mmdPath}`)

  await shot(page, 'after-download')

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('\n✅ COMPLETE')
  console.log('Screenshot dir:', SHOTS_DIR)
  console.log('MD file:', mdPath)
  console.log('MMD file:', mmdPath)
  console.log('\n=== .md ===')
  console.log(fs.readFileSync(mdPath, 'utf8'))
  console.log('\n=== .mmd ===')
  console.log(fs.readFileSync(mmdPath, 'utf8'))

  await context.close()
}

main().catch(err => {
  console.error('❌', err.message)
  process.exit(1)
})

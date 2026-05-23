import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import mermaid from 'mermaid'
import { marked } from 'marked'
import { buildHtmlReport } from '../htmlReport'

// Don't enable `breaks` — converting every newline to <br> mangles malformed
// markdown (turns `-` on its own line into a visible dash). Standard paragraph
// break rules (blank line) are enough.
marked.setOptions({ gfm: true })

interface Props {
  document: string
  mermaidText: string
  systemName: string
  onRequestRevision: (request: string) => void
  onContinueDiscussion: () => void
}

mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' })

function extractMermaidBlocks(text: string): string[] {
  const matches = text.match(/```mermaid\n([\s\S]*?)```/g) ?? []
  return matches.map(block =>
    block.replace(/```mermaid\n/, '').replace(/```$/, '').trim()
  )
}

export default function Preview({ document, mermaidText, systemName, onRequestRevision, onContinueDiscussion }: Props) {
  const mermaidRef = useRef<HTMLDivElement>(null)
  const [zoomedSvg, setZoomedSvg] = useState<string | null>(null)
  const [zoomScale, setZoomScale] = useState(1)

  useEffect(() => {
    if (!mermaidRef.current || !mermaidText) return
    const blocks = extractMermaidBlocks(mermaidText)
    mermaidRef.current.innerHTML = blocks
      .map((block, i) => `<div class="mermaid" id="mermaid-${i}">${block}</div>`)
      .join('')
    mermaid.run({ nodes: Array.from(mermaidRef.current.querySelectorAll('.mermaid')) })
      .then(() => {
        if (!mermaidRef.current) return
        mermaidRef.current.querySelectorAll<HTMLElement>('.mermaid').forEach(el => {
          el.classList.add('mermaid-zoomable')
          el.title = '點擊放大'
          el.addEventListener('click', () => {
            const svg = el.querySelector('svg')
            if (svg) { setZoomScale(1); setZoomedSvg(svg.outerHTML) }
          })
        })
      })
      .catch(() => {})
  }, [mermaidText])

  const downloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = window.document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const dateStr = new Date().toISOString().split('T')[0]
  const safeName = systemName || '未命名系統'

  return (
    <div className="preview">
      <div className="preview-header">
        <h2>產出預覽</h2>
        <div className="download-buttons">
          <button
            className="download-btn-primary"
            onClick={() => downloadFile(
              buildHtmlReport(document, mermaidText, safeName),
              `業務流程報告_${safeName}_${dateStr}.html`,
              'text/html'
            )}
          >
            下載 HTML 報告
          </button>
          <button onClick={() => downloadFile(document, `業務流程_${safeName}_${dateStr}.md`, 'text/markdown')}>
            .md
          </button>
          <button onClick={() => downloadFile(mermaidText, `流程圖_${safeName}_${dateStr}.mmd`, 'text/plain')}>
            .mmd
          </button>
        </div>
      </div>

      <section className="doc-preview">
        <h3>業務流程文件</h3>
        <div
          className="markdown-body"
          dangerouslySetInnerHTML={{ __html: marked(document) as string }}
        />
      </section>

      <section className="mermaid-preview">
        <h3>流程圖</h3>
        <div ref={mermaidRef} />
      </section>

      {zoomedSvg && createPortal(
        <div className="mermaid-zoom-overlay" onClick={() => setZoomedSvg(null)}>
          <button className="mermaid-zoom-close" onClick={() => setZoomedSvg(null)}>✕</button>
          <div
            className="mermaid-zoom-inner"
            onClick={e => e.stopPropagation()}
            onWheel={e => {
              e.preventDefault()
              setZoomScale(s => Math.min(5, Math.max(0.3, s - e.deltaY * 0.001)))
            }}
          >
            <div
              style={{ transform: `scale(${zoomScale})`, transformOrigin: 'center top', transition: 'transform 0.1s ease' }}
              dangerouslySetInnerHTML={{ __html: zoomedSvg }}
            />
          </div>
        </div>,
        window.document.body
      )}

      <section className="revision">
        <h3>還想做什麼？</h3>
        <div className="revision-actions">
          <button className="revision-btn" onClick={onContinueDiscussion}>
            繼續討論下一個模組
          </button>
          <button className="revision-btn revision-btn-secondary" onClick={() => onRequestRevision('請回到對話模式，我需要修改部分內容')}>
            返回修改
          </button>
        </div>
      </section>
    </div>
  )
}

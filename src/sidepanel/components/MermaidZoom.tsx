import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  svgHtml: string
  onClose: () => void
}

export function MermaidZoom({ svgHtml, onClose }: Props) {
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const viewportRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  // Fit-to-viewport on mount so user starts seeing the whole diagram, not a tiny corner
  useEffect(() => {
    const viewport = viewportRef.current
    const canvas = canvasRef.current
    if (!viewport || !canvas) return
    const svg = canvas.querySelector<SVGSVGElement>('svg')
    if (!svg) return
    svg.style.maxWidth = 'none'
    svg.style.maxHeight = 'none'
    requestAnimationFrame(() => {
      const w = svg.getBoundingClientRect().width
      const h = svg.getBoundingClientRect().height
      if (w === 0 || h === 0) return
      const vw = viewport.clientWidth
      const vh = viewport.clientHeight
      const fit = Math.min(vw / w, vh / h) * 0.95
      setScale(fit)
    })
  }, [svgHtml])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const startDrag = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return
    e.preventDefault()
    setIsDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
  }, [pan])

  const onMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    setPan({
      x: dragStart.current.panX + (e.clientX - dragStart.current.x),
      y: dragStart.current.panY + (e.clientY - dragStart.current.y),
    })
  }, [isDragging])

  const stopDrag = useCallback(() => setIsDragging(false), [])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setScale(s => Math.min(10, Math.max(0.1, s - e.deltaY * 0.001)))
  }, [])

  const reset = () => { setScale(1); setPan({ x: 0, y: 0 }) }

  const openInNewTab = () => {
    const html = `<!doctype html><html lang="zh-TW"><head><meta charset="utf-8"><title>流程圖</title>
<style>html,body{margin:0;height:100%;background:#fafafa;display:flex;align-items:center;justify-content:center}svg{max-width:100vw;max-height:100vh;height:auto;width:auto}</style>
</head><body>${svgHtml}</body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const tabsApi = (globalThis as { chrome?: { tabs?: { create?: (props: { url: string }) => void } } }).chrome?.tabs
    if (tabsApi?.create) {
      tabsApi.create({ url })
    } else {
      window.open(url, '_blank')
    }
  }

  return createPortal(
    <div className="mermaid-zoom-overlay">
      <div className="mermaid-zoom-toolbar">
        <button onClick={reset} title="重設縮放">⟲ {Math.round(scale * 100)}%</button>
        <button onClick={openInNewTab} title="在新分頁全螢幕開啟">⤢ 新分頁</button>
        <button onClick={onClose} title="關閉 (Esc)">✕</button>
      </div>
      <div
        ref={viewportRef}
        className={`mermaid-zoom-viewport${isDragging ? ' dragging' : ''}`}
        onMouseDown={startDrag}
        onMouseMove={onMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onWheel={onWheel}
        onAuxClick={(e) => e.preventDefault()}
      >
        <div
          ref={canvasRef}
          className="mermaid-zoom-canvas"
          style={{ transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
          dangerouslySetInnerHTML={{ __html: svgHtml }}
        />
      </div>
      <div className="mermaid-zoom-hint">拖曳：左鍵/中鍵 · 縮放：滾輪 · 關閉：Esc</div>
    </div>,
    window.document.body
  )
}

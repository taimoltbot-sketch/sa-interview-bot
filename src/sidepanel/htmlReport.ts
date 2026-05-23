import { marked } from 'marked'

// Split mermaid text by "## heading" then pull the ```mermaid block from each section
function extractDiagrams(text: string): Array<{ title: string; code: string }> {
  const sections = text.split(/(?=^##\s+)/m).filter(s => s.trim())
  const diagrams: Array<{ title: string; code: string }> = []
  for (const section of sections) {
    const titleMatch = section.match(/^##\s+(.+)/m)
    const codeMatch = section.match(/```mermaid\n([\s\S]*?)```/)
    if (codeMatch) {
      diagrams.push({
        title: titleMatch ? titleMatch[1].trim() : '流程圖',
        code: codeMatch[1].trim(),
      })
    }
  }
  // Fallback: no ## headings but has ```mermaid blocks → wrap them with generic titles
  if (diagrams.length === 0) {
    const fences = text.match(/```mermaid\n([\s\S]*?)```/g) ?? []
    fences.forEach((f, i) => {
      diagrams.push({
        title: `圖 ${i + 1}`,
        code: f.replace(/```mermaid\n/, '').replace(/```$/, '').trim(),
      })
    })
  }
  return diagrams
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildHtmlReport(document: string, mermaidText: string, systemName: string): string {
  const date = new Date().toISOString().split('T')[0]
  const docHtml = marked(document) as string
  const diagrams = extractDiagrams(mermaidText)

  const diagramsHtml = diagrams.map((d, i) => `
    <div class="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div class="text-xs uppercase tracking-wider text-indigo-600 font-semibold mb-1">圖 ${i + 1}</div>
      <h3 class="text-lg font-semibold text-slate-900 mb-5">${escapeHtml(d.title)}</h3>
      <pre class="mermaid flex justify-center">${escapeHtml(d.code)}</pre>
    </div>
  `).join('\n')

  const safeSystemName = escapeHtml(systemName || '未命名系統')

  return `<!doctype html>
<html lang="zh-TW">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>業務流程報告 — ${safeSystemName}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script type="module">
    import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
    mermaid.initialize({
      startOnLoad: true,
      theme: "neutral",
      securityLevel: "loose",
      flowchart: { useMaxWidth: true, htmlLabels: true },
      sequence: { useMaxWidth: true }
    });
    // Zoom lightbox: viewport + draggable/zoomable canvas
    document.addEventListener('DOMContentLoaded', () => {
      const openLightbox = (svg) => {
        let scale = 1, panX = 0, panY = 0;
        let dragging = false, sx = 0, sy = 0, spanX = 0, spanY = 0;

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,0.92)';

        const viewport = document.createElement('div');
        viewport.style.cssText = 'position:absolute;inset:0;overflow:hidden;cursor:grab;user-select:none';

        const canvas = document.createElement('div');
        canvas.style.cssText = 'position:absolute;top:50%;left:50%;transform-origin:center center;will-change:transform;background:white;border-radius:8px;padding:12px;box-shadow:0 8px 32px rgba(0,0,0,0.4)';
        canvas.innerHTML = svg.outerHTML;
        const cloneSvg = canvas.querySelector('svg');
        cloneSvg.style.cssText = 'display:block;max-width:none;max-height:none;height:auto;pointer-events:none';

        const applyTransform = () => {
          canvas.style.transform = 'translate(-50%, -50%) translate(' + panX + 'px, ' + panY + 'px) scale(' + scale + ')';
          pct.textContent = '⟲ ' + Math.round(scale * 100) + '%';
        };

        // Toolbar
        const tb = document.createElement('div');
        tb.style.cssText = 'position:fixed;top:12px;right:12px;z-index:10000;display:flex;gap:6px';
        const btnCss = 'background:white;border:none;border-radius:6px;padding:6px 12px;font-size:13px;font-weight:500;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);color:#334155';
        const pct = document.createElement('button'); pct.style.cssText = btnCss; pct.title = '重設縮放';
        const newtab = document.createElement('button'); newtab.style.cssText = btnCss; newtab.textContent = '⤢ 新分頁'; newtab.title = '在新分頁全螢幕開啟';
        const close = document.createElement('button'); close.style.cssText = btnCss; close.textContent = '✕'; close.title = '關閉 (Esc)';
        tb.appendChild(pct); tb.appendChild(newtab); tb.appendChild(close);

        const hint = document.createElement('div');
        hint.textContent = '拖曳：左鍵/中鍵 · 縮放：滾輪 · 關閉：Esc';
        hint.style.cssText = 'position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:10000;background:rgba(255,255,255,0.9);padding:6px 14px;border-radius:999px;font-size:12px;color:#475569;pointer-events:none';

        viewport.appendChild(canvas);
        overlay.appendChild(viewport);
        overlay.appendChild(tb);
        overlay.appendChild(hint);
        document.body.appendChild(overlay);

        // Fit to viewport
        requestAnimationFrame(() => {
          const r = cloneSvg.getBoundingClientRect();
          if (r.width && r.height) {
            scale = Math.min(viewport.clientWidth / r.width, viewport.clientHeight / r.height) * 0.95;
          }
          applyTransform();
        });

        const onWheel = (e) => {
          e.preventDefault();
          scale = Math.min(10, Math.max(0.1, scale - e.deltaY * 0.001));
          applyTransform();
        };
        const onDown = (e) => {
          if (e.button !== 0 && e.button !== 1) return;
          e.preventDefault();
          dragging = true; sx = e.clientX; sy = e.clientY; spanX = panX; spanY = panY;
          viewport.style.cursor = 'grabbing';
        };
        const onMove = (e) => {
          if (!dragging) return;
          panX = spanX + (e.clientX - sx); panY = spanY + (e.clientY - sy);
          applyTransform();
        };
        const onUp = () => { dragging = false; viewport.style.cursor = 'grab'; };
        const onKey = (e) => { if (e.key === 'Escape') cleanup(); };

        viewport.addEventListener('wheel', onWheel, { passive: false });
        viewport.addEventListener('mousedown', onDown);
        viewport.addEventListener('mousemove', onMove);
        viewport.addEventListener('mouseup', onUp);
        viewport.addEventListener('mouseleave', onUp);
        viewport.addEventListener('auxclick', e => e.preventDefault());
        document.addEventListener('keydown', onKey);

        const cleanup = () => {
          document.removeEventListener('keydown', onKey);
          overlay.remove();
        };
        close.addEventListener('click', cleanup);
        pct.addEventListener('click', () => { scale = 1; panX = 0; panY = 0; applyTransform(); });
        newtab.addEventListener('click', () => {
          const html = '<!doctype html><html><head><meta charset="utf-8"><title>流程圖</title>' +
            '<style>html,body{margin:0;height:100%;background:#fafafa;display:flex;align-items:center;justify-content:center}svg{max-width:100vw;max-height:100vh;height:auto;width:auto}</style>' +
            '</head><body>' + svg.outerHTML + '</body></html>';
          const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
          window.open(url, '_blank');
        });
      };

      setTimeout(() => {
        document.querySelectorAll('.mermaid svg').forEach(svg => {
          svg.style.cursor = 'zoom-in';
          svg.setAttribute('title', '點擊放大');
          svg.addEventListener('click', () => openLightbox(svg));
        });
      }, 1500); // wait for mermaid SVG render
    });
  </script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif;
    }
    .prose { color: #1e293b; line-height: 1.75; }
    .prose h1 { font-size: 1.875rem; font-weight: 700; margin: 2rem 0 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid #e5e7eb; color: #0f172a; }
    .prose h1:first-child { margin-top: 0; }
    .prose h2 { font-size: 1.5rem; font-weight: 600; margin: 1.75rem 0 0.75rem; color: #4f46e5; }
    .prose h3 { font-size: 1.2rem; font-weight: 600; margin: 1.25rem 0 0.5rem; color: #0f172a; }
    .prose h4 { font-size: 1.05rem; font-weight: 600; margin: 1rem 0 0.5rem; color: #475569; }
    .prose p { margin: 0.75rem 0; }
    .prose ul, .prose ol { padding-left: 1.5rem; margin: 0.5rem 0; }
    .prose li { margin: 0.3rem 0; }
    .prose strong { font-weight: 600; color: #0f172a; }
    .prose blockquote { border-left: 4px solid #4f46e5; padding: 0.5rem 1rem; margin: 1rem 0; color: #475569; background: #f8fafc; border-radius: 0 4px 4px 0; }
    .prose code { background: #f1f5f9; padding: 0.125rem 0.4rem; border-radius: 0.25rem; font-size: 0.9em; font-family: "SF Mono", Consolas, monospace; color: #4f46e5; }
    .prose pre { background: #0f172a; color: #e2e8f0; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; margin: 1rem 0; }
    .prose pre code { background: transparent; padding: 0; color: inherit; }
    .prose table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.95em; }
    .prose th, .prose td { padding: 0.6rem 0.85rem; border: 1px solid #e5e7eb; text-align: left; }
    .prose th { background: #f8fafc; font-weight: 600; color: #334155; }
    .prose hr { margin: 2rem 0; border: 0; border-top: 1px solid #e5e7eb; }
    .meta-chip { display: inline-block; padding: 0.2rem 0.7rem; font-size: 0.75rem; font-weight: 500; border-radius: 9999px; background: #eef2ff; color: #4338ca; margin-right: 0.4rem; }
    @media print {
      body { background: white; }
      .no-print { display: none !important; }
      main { max-width: 100% !important; padding: 1rem 1.5rem !important; }
    }
  </style>
</head>
<body class="bg-stone-50 text-slate-900">
  <main class="max-w-5xl mx-auto px-6 sm:px-10 py-12 space-y-12">

    <header class="border-b border-slate-200 pb-6">
      <div class="text-xs uppercase tracking-widest text-indigo-600 font-semibold">業務流程報告</div>
      <h1 class="text-4xl font-bold mt-2 text-slate-900">${safeSystemName}</h1>
      <div class="mt-3 text-sm text-slate-500">
        <span class="meta-chip">${date}</span>
        <span class="meta-chip">${diagrams.length} 張流程圖</span>
        <span class="meta-chip">SA Interview Bot</span>
      </div>
    </header>

    <article class="prose max-w-none">
      ${docHtml}
    </article>

    ${diagrams.length > 0 ? `
    <section class="space-y-6">
      <div class="border-b border-slate-200 pb-3 mb-2">
        <div class="text-xs uppercase tracking-widest text-indigo-600 font-semibold">流程視覺化</div>
        <h2 class="text-2xl font-bold text-slate-900 mt-1">流程圖 ・ 決策圖</h2>
      </div>
      ${diagramsHtml}
    </section>
    ` : ''}

    <footer class="text-center text-xs text-slate-400 pt-8 border-t border-slate-200">
      Generated by SA Interview Bot · ${date}
    </footer>

  </main>
</body>
</html>`
}

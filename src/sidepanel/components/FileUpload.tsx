import { useRef } from 'react'
import * as XLSX from 'xlsx'
import type { UploadedFile } from '../../types/index'

interface Props {
  onUpload: (files: UploadedFile[]) => void
  disabled?: boolean
  variant?: 'default' | 'welcome'
}

async function processImageFile(file: File): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(',')[1]
      resolve({ type: 'image', name: file.name, content: base64, mimeType: file.type })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function processExcelFile(file: File): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const markdown = workbook.SheetNames.map(name => {
          const sheet = workbook.Sheets[name]
          const csv = XLSX.utils.sheet_to_csv(sheet)
          return `### Sheet: ${name}\n\n${csv}`
        }).join('\n\n')
        resolve({ type: 'excel', name: file.name, content: markdown, mimeType: file.type })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

const PaperclipIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
)

export default function FileUpload({ onUpload, disabled, variant = 'default' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = async (files: FileList) => {
    const processed: UploadedFile[] = []
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        processed.push(await processImageFile(file))
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        processed.push(await processExcelFile(file))
      }
    }
    if (processed.length > 0) onUpload(processed)
  }

  const isWelcome = variant === 'welcome'

  return (
    <div className={isWelcome ? 'file-upload-welcome' : 'file-upload'}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.xlsx,.xls"
        multiple
        style={{ display: 'none' }}
        onChange={e => e.target.files && handleFiles(e.target.files)}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className={isWelcome ? 'upload-btn upload-btn-welcome' : 'upload-btn'}
      >
        <PaperclipIcon />
        {isWelcome ? '上傳截圖 / Excel（可選）' : '附加檔案'}
      </button>
    </div>
  )
}

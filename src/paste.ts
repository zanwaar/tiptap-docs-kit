import type { Editor, JSONContent } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'

interface WordPagePasteOptions {
  enabled: boolean
  minLength: number
}

const tiptapClipboardMarkers = [
  'data-pm-slice',
  'data-type="page"',
  'data-type="page-break"',
]

const normalizePlainText = (text: string): string => text
  .replace(/\r\n?/g, '\n')
  .replace(/[\t ]+/g, ' ')

export const plainTextToParagraphs = (text: string): JSONContent[] => normalizePlainText(text)
  .split(/\n{2,}/)
  .map((paragraph) => paragraph.replace(/\n/g, ' ').trim())
  .filter(Boolean)
  .map((paragraph) => ({
    type: 'paragraph',
    content: [{ type: 'text', text: paragraph }],
  }))

export const insertPlainTextAsWordContent = (editor: Editor, text: string): boolean => {
  const normalizedText = normalizePlainText(text)
  const content = plainTextToParagraphs(normalizedText)
  if (content.length === 0) return false

  return editor.commands.insertContent(content)
}

const isFromTiptap = (html: string): boolean => tiptapClipboardMarkers.some((marker) => html.includes(marker))

const shouldCleanExternalPaste = (event: ClipboardEvent, options: WordPagePasteOptions): boolean => {
  if (!options.enabled) return false

  const html = event.clipboardData?.getData('text/html') ?? ''
  if (html && isFromTiptap(html)) return false

  const text = event.clipboardData?.getData('text/plain') ?? ''
  const normalizedText = normalizePlainText(text).trim()

  return normalizedText.length >= options.minLength || /\n{2,}/.test(normalizedText)
}

export const createWordPagePastePlugin = (editor: Editor, getPasteOptions: () => WordPagePasteOptions): Plugin => new Plugin({
  props: {
    handlePaste: (view, event) => {
      if (!shouldCleanExternalPaste(event, getPasteOptions())) return false

      const text = event.clipboardData?.getData('text/plain')
      if (!text) return false

      const inserted = insertPlainTextAsWordContent(editor, text)
      if (!inserted) return false

      view.focus()
      return true
    },
  },
})

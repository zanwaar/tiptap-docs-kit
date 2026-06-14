import type { Editor, JSONContent } from '@tiptap/core'
import { DOMParser as ProseMirrorDOMParser, Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin } from '@tiptap/pm/state'
import { findCurrentPage, isEmptyPage } from './page-model'

interface WordPagePasteOptions {
  enabled: boolean
  minLength: number
}

const tiptapClipboardMarkers = [
  'data-pm-slice',
  'data-type="page"',
  'class="a4-page',
  "class='a4-page",
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

const flattenPages = (pages: ProseMirrorNode[]): ProseMirrorNode[] => {
  const flattenedPages: ProseMirrorNode[] = []

  pages.forEach((page) => {
    const pageBlocks: ProseMirrorNode[] = []
    const nestedPages: ProseMirrorNode[] = []

    page.forEach((child) => {
      if (child.type.name === 'page') {
        nestedPages.push(child)
      } else {
        pageBlocks.push(child)
      }
    })

    if (pageBlocks.length > 0 || nestedPages.length === 0) {
      flattenedPages.push(page.copy(Fragment.fromArray(pageBlocks)))
    }

    if (nestedPages.length > 0) {
      flattenedPages.push(...flattenPages(nestedPages))
    }
  })

  return flattenedPages
}

const parseClipboardPages = (editor: Editor, html: string): ProseMirrorNode[] => {
  const container = document.createElement('div')
  container.innerHTML = html

  const parsedDocument = ProseMirrorDOMParser.fromSchema(editor.schema).parse(container)
  const pages: ProseMirrorNode[] = []

  parsedDocument.forEach((node) => {
    if (node.type.name === 'page') pages.push(node)
  })

  return flattenPages(pages)
}

const pastePagesAtDocumentLevel = (editor: Editor, pages: ProseMirrorNode[]): boolean => {
  if (pages.length === 0) return false

  const { doc } = editor.state
  const currentPage = findCurrentPage(editor)
  const isSingleEmptyPage = doc.childCount === 1 && doc.firstChild?.type.name === 'page' && isEmptyPage(doc.firstChild)
  const transaction = editor.state.tr

  if (isSingleEmptyPage) {
    transaction.replaceWith(0, doc.content.size, Fragment.fromArray(pages))
  } else if (currentPage) {
    transaction.insert(currentPage.start + currentPage.node.nodeSize, Fragment.fromArray(pages))
  } else {
    transaction.replaceSelectionWith(Fragment.fromArray(pages).firstChild as ProseMirrorNode)
    pages.slice(1).forEach((page) => transaction.insert(transaction.selection.to, page))
  }

  editor.view.dispatch(transaction.scrollIntoView())
  return true
}

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
      const html = event.clipboardData?.getData('text/html') ?? ''
      if (html && isFromTiptap(html) && (html.includes('data-type="page"') || html.includes('class="a4-page') || html.includes("class='a4-page"))) {
        const pasted = pastePagesAtDocumentLevel(editor, parseClipboardPages(editor, html))
        if (!pasted) {
          const text = event.clipboardData?.getData('text/plain')
          if (!text) return false
          if (!insertPlainTextAsWordContent(editor, text)) return false
        }

        view.focus()
        return true
      }

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

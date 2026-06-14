import { Extension, Node, mergeAttributes } from '@tiptap/core'
import '@tiptap/extension-blockquote'
import '@tiptap/extension-bold'
import '@tiptap/extension-bullet-list'
import '@tiptap/extension-code'
import '@tiptap/extension-heading'
import '@tiptap/extension-horizontal-rule'
import '@tiptap/extension-italic'
import '@tiptap/extension-ordered-list'
import '@tiptap/extension-paragraph'
import '@tiptap/extension-strike'
import '@tiptap/extension-underline'
import '@tiptap/extensions/undo-redo'
import { Table } from '@tiptap/extension-table'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableRow } from '@tiptap/extension-table-row'
import StarterKit from '@tiptap/starter-kit'
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin } from '@tiptap/pm/state'
import { createWordPagePastePlugin } from './paste'
import { handlePageBackspace } from './keyboard'
import { TextAlign } from './extensions/TextAlign'
import { TextColor } from './extensions/TextColor'
import { TextFont } from './extensions/TextFont'
import { TextSize } from './extensions/TextSize'
import { ParagraphSpacing } from './extensions/ParagraphSpacing'
import {
  createEmptyWordPageNode,
  createWordPage,
  createWordPageTemplate,
  defaultPageAttrs,
  pageClassNames,
} from './page-model'
import type { DocsKitOptions, InsertGridOptions, InsertPageOptions, PageAttrs, PageBreakOptions, PageOptions, WordPageTemplateName } from './types'

export type {
  InsertPageOptions,
  PageAttrs,
  PageBreakOptions,
  DocsKitOptions,
  InsertGridOptions,
  PageMargin,
  PageOptions,
  PageOrientation,
  PagePosition,
  PageType,
  PaperSize,
  TextDeleteRange,
  TextSplitRange,
  WordPagePaginationOptions,
  WordPagePaginationBindingOptions,
  WordPageStablePaginationOptions,
  WordPageTemplateName,
} from './types'

export {
  createBlankWordPageDocument,
  createEmptyWordPageNode,
  createOverflowPageAttrs,
  createWordPage,
  createWordPageDocument,
  createWordPageTemplate,
  defaultPageAttrs,
  findCurrentPage,
  getPagePositions,
  isEmptyPage,
  isEmptyTextblock,
  pageClassNames,
} from './page-model'
export { createWordPagePastePlugin, insertPlainTextAsWordContent, plainTextToParagraphs } from './paste'
export { handlePageBackspace } from './keyboard'
export {
  bindWordPagePagination,
  normalizeWordPages,
  paginateWordPages,
  paginateWordPagesUntilStable,
  removeEmptyTrailingWordPages,
} from './pagination'
export { TextAlign } from './extensions/TextAlign'
export { TextColor } from './extensions/TextColor'
export { TextFont } from './extensions/TextFont'
export { TextSize } from './extensions/TextSize'
export { ParagraphSpacing } from './extensions/ParagraphSpacing'
export { DocsTable as Table, DocsTableCell as TableCell, DocsTableHeader as TableHeader, DocsTableRow as TableRow }

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    docsGrid: {
      insertGrid: (options?: InsertGridOptions) => ReturnType
    }
  }
}

const createGridCell = () => ({
  type: 'tableCell',
  attrs: {
    docsCellKind: 'grid',
  },
  content: [{ type: 'paragraph' }],
})

const createGridRow = (cols: number) => ({
  type: 'tableRow',
  content: Array.from({ length: cols }, createGridCell),
})

const createGrid = ({ rows = 3, cols = 3 }: InsertGridOptions = {}) => ({
  type: 'table',
  attrs: {
    docsTableKind: 'grid',
  },
  content: Array.from({ length: rows }, () => createGridRow(cols)),
})

const DocsTable = Table.extend({
  addAttributes() {
    return {
      docsTableKind: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-docs-table-kind'),
        renderHTML: (attributes) => {
          if (!attributes.docsTableKind) return {}

          return {
            'data-docs-table-kind': attributes.docsTableKind,
          }
        },
      },
    }
  },

  addCommands() {
    return {
      ...this.parent?.(),
      insertGrid: (options = {}) => ({ commands }) => commands.insertContent(createGrid(options)),
    }
  },
})

const gridCellAttribute = {
  docsCellKind: {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute('data-docs-cell-kind'),
    renderHTML: (attributes: Record<string, unknown>) => {
      if (!attributes.docsCellKind) return {}

      return {
        'data-docs-cell-kind': attributes.docsCellKind,
      }
    },
  },
}

const DocsTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...gridCellAttribute,
    }
  },
})

const DocsTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...gridCellAttribute,
    }
  },
})

const DocsTableRow = TableRow.extend({
  addAttributes() {
    return {
      docsRepeatedHeader: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-docs-repeated-header'),
        renderHTML: (attributes) => {
          if (!attributes.docsRepeatedHeader) return {}

          return {
            'data-docs-repeated-header': attributes.docsRepeatedHeader,
          }
        },
      },
    }
  },
})

const normalizeNestedPages = (doc: ProseMirrorNode): ProseMirrorNode[] | null => {
  const normalizedPages: ProseMirrorNode[] = []
  let changed = false

  const collectPages = (page: ProseMirrorNode): ProseMirrorNode[] => {
    const pageBlocks: ProseMirrorNode[] = []
    const nestedPages: ProseMirrorNode[] = []

    page.forEach((child) => {
      if (child.type.name === 'page') {
        nestedPages.push(child)
        changed = true
      } else {
        pageBlocks.push(child)
      }
    })

    const pages = pageBlocks.length > 0 || nestedPages.length === 0
      ? [page.copy(Fragment.fromArray(pageBlocks))]
      : []

    nestedPages.forEach((nestedPage) => {
      pages.push(...collectPages(nestedPage))
    })

    return pages
  }

  doc.forEach((node) => {
    if (node.type.name !== 'page') {
      normalizedPages.push(node)
      return
    }

    normalizedPages.push(...collectPages(node))
  })

  return changed ? normalizedPages : null
}

export const DocsKit = Extension.create<DocsKitOptions>({
  name: 'docsKit',

  addOptions() {
    return {
      starterKit: {},
      textAlign: {},
      textColor: {},
      textFont: {},
      textSize: {},
      paragraphSpacing: {},
      table: {
        resizable: true,
      },
      tableCell: {},
      tableHeader: {},
      tableRow: {},
      page: {},
      pageBreak: {},
    }
  },

  addExtensions() {
    const extensions = []

    if (this.options.starterKit !== false) {
      extensions.push(StarterKit.configure(this.options.starterKit))
    }

    if (this.options.textAlign !== false) {
      extensions.push(TextAlign.configure(this.options.textAlign))
    }

    if (this.options.textColor !== false) {
      extensions.push(TextColor.configure(this.options.textColor))
    }

    if (this.options.textFont !== false) {
      extensions.push(TextFont.configure(this.options.textFont))
    }

    if (this.options.textSize !== false) {
      extensions.push(TextSize.configure(this.options.textSize))
    }

    if (this.options.paragraphSpacing !== false) {
      extensions.push(ParagraphSpacing.configure(this.options.paragraphSpacing))
    }

    if (this.options.table !== false) {
      extensions.push(DocsTable.configure(this.options.table))
    }

    if (this.options.tableRow !== false) {
      extensions.push(DocsTableRow.configure(this.options.tableRow))
    }

    if (this.options.tableHeader !== false) {
      extensions.push(DocsTableHeader.configure(this.options.tableHeader))
    }

    if (this.options.tableCell !== false) {
      extensions.push(DocsTableCell.configure(this.options.tableCell))
    }

    if (this.options.page !== false) {
      extensions.push(Page.configure(this.options.page))
    }

    if (this.options.pageBreak !== false) {
      extensions.push(PageBreak.configure(this.options.pageBreak))
    }

    return extensions
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    wordPage: {
      insertPage: (options?: InsertPageOptions) => ReturnType
      setPageAttrs: (attrs: PageAttrs) => ReturnType
      insertPageBreak: () => ReturnType
      insertWordPageTemplate: (templateName: WordPageTemplateName) => ReturnType
    }
  }
}

export const Page = Node.create<PageOptions>({
  name: 'page',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      pasteAsPlainText: true,
      pasteAsPlainTextMinLength: 120,
    }
  },

  addAttributes() {
    return {
      pageType: {
        default: defaultPageAttrs.pageType,
        parseHTML: (element) => element.getAttribute('data-page-type') ?? defaultPageAttrs.pageType,
        renderHTML: (attributes) => ({ 'data-page-type': attributes.pageType }),
      },
      paperSize: {
        default: defaultPageAttrs.paperSize,
        parseHTML: (element) => element.getAttribute('data-paper-size') ?? defaultPageAttrs.paperSize,
        renderHTML: (attributes) => ({ 'data-paper-size': attributes.paperSize }),
      },
      orientation: {
        default: defaultPageAttrs.orientation,
        parseHTML: (element) => element.getAttribute('data-orientation') ?? defaultPageAttrs.orientation,
        renderHTML: (attributes) => ({ 'data-orientation': attributes.orientation }),
      },
      margin: {
        default: defaultPageAttrs.margin,
        parseHTML: (element) => element.getAttribute('data-margin') ?? defaultPageAttrs.margin,
        renderHTML: (attributes) => ({ 'data-margin': attributes.margin }),
      },
      class: {
        default: defaultPageAttrs.class,
        parseHTML: () => defaultPageAttrs.class,
        renderHTML: () => ({}),
      },
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          wordPageSplit: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-word-page-split'),
            renderHTML: (attributes) => {
              if (!attributes.wordPageSplit) return {}

              return {
                'data-word-page-split': attributes.wordPageSplit,
              }
            },
          },
        },
      },
    ]
  },

  parseHTML() {
    return [{ tag: 'section[data-type="page"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'section',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'page',
        class: pageClassNames(HTMLAttributes as PageAttrs),
      }),
      0,
    ]
  },

  addCommands() {
    return {
      insertPage: (options = {}) => ({ commands }) => commands.insertContent(createWordPage({
        pageType: options.pageType,
        paperSize: options.paperSize,
        orientation: options.orientation,
        margin: options.margin,
        class: options.class,
        content: options.content,
      })),
      setPageAttrs: (attrs) => ({ commands }) => commands.updateAttributes(this.name, attrs),
      insertWordPageTemplate: (templateName) => ({ commands }) => commands.insertContent(createWordPageTemplate(templateName)),
    }
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () => handlePageBackspace(this.editor),
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null

          const normalizedPages = normalizeNestedPages(newState.doc)
          if (normalizedPages) {
            return newState.tr.replaceWith(0, newState.doc.content.size, Fragment.fromArray(normalizedPages))
          }

          let hasPage = false
          newState.doc.forEach((node) => {
            if (node.type.name === this.name) hasPage = true
          })

          if (hasPage) return null

          return newState.tr.insert(0, createEmptyWordPageNode(newState.schema))
        },
      }),
      createWordPagePastePlugin(this.editor, () => ({
        enabled: this.options.pasteAsPlainText,
        minLength: this.options.pasteAsPlainTextMinLength,
      })),
    ]
  },
})

export const PageBreak = Node.create<PageBreakOptions>({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="page-break"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'page-break',
        class: 'page-break',
      }),
    ]
  },

  addCommands() {
    return {
      insertPageBreak: () => ({ commands }) => commands.insertContent({ type: this.name }),
    }
  },
})

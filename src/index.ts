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
import { createWordPagePastePlugin } from './paste'
import { handlePageBackspace } from './keyboard'
import { TextAlign } from './extensions/TextAlign'
import { TextColor } from './extensions/TextColor'
import {
  createWordPage,
  createWordPageTemplate,
  defaultPageAttrs,
  pageClassNames,
} from './page-model'
import type { DocsKitOptions, InsertPageOptions, PageAttrs, PageBreakOptions, PageOptions, WordPageTemplateName } from './types'

export type {
  InsertPageOptions,
  PageAttrs,
  PageBreakOptions,
  DocsKitOptions,
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
export { Table, TableCell, TableHeader, TableRow }

export const DocsKit = Extension.create<DocsKitOptions>({
  name: 'docsKit',

  addOptions() {
    return {
      starterKit: {},
      textAlign: {},
      textColor: {},
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

    if (this.options.table !== false) {
      extensions.push(Table.configure(this.options.table))
    }

    if (this.options.tableRow !== false) {
      extensions.push(TableRow.configure(this.options.tableRow))
    }

    if (this.options.tableHeader !== false) {
      extensions.push(TableHeader.configure(this.options.tableHeader))
    }

    if (this.options.tableCell !== false) {
      extensions.push(TableCell.configure(this.options.tableCell))
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

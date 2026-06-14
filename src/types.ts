import type { JSONContent } from '@tiptap/core'
import type { TableCellOptions, TableHeaderOptions, TableOptions, TableRowOptions } from '@tiptap/extension-table'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export type PageType = 'cover' | 'body' | 'toc' | string
export type PaperSize = 'a4' | 'letter' | string
export type PageOrientation = 'portrait' | 'landscape'
export type PageMargin = 'normal' | 'narrow' | 'wide' | string

export interface PageAttrs {
  pageType?: PageType
  paperSize?: PaperSize
  orientation?: PageOrientation
  margin?: PageMargin
  class?: string | null
}

export interface PageOptions {
  HTMLAttributes: Record<string, unknown>
  pasteAsPlainText: boolean
  pasteAsPlainTextMinLength: number
}

export interface PageBreakOptions {
  HTMLAttributes: Record<string, unknown>
}

export interface InsertGridOptions {
  rows?: number
  cols?: number
}

export interface DocsKitOptions {
  starterKit: false | Record<string, unknown>
  textAlign: false | { types?: string[] }
  textColor: false | Record<string, unknown>
  textSize: false | Record<string, unknown>
  table: false | Partial<TableOptions>
  tableCell: false | Partial<TableCellOptions>
  tableHeader: false | Partial<TableHeaderOptions>
  tableRow: false | Partial<TableRowOptions>
  page: false | Partial<PageOptions>
  pageBreak: false | Partial<PageBreakOptions>
}

export interface InsertPageOptions extends PageAttrs {
  content?: JSONContent[]
}

export interface WordPagePaginationOptions {
  pageSelector?: string
  overflowTolerance?: number
  createPageAttrs?: PageAttrs
}

export interface WordPageStablePaginationOptions extends WordPagePaginationOptions {
  maxPasses?: number
}

export interface WordPagePaginationBindingOptions extends WordPageStablePaginationOptions {
  maxFramePasses?: number
  onPaginated?: (changed: boolean) => void
}

export interface PagePosition {
  index: number
  start: number
  node: ProseMirrorNode
}

export interface TextDeleteRange {
  from: number
  to: number
}

export interface TextSplitRange {
  deleteOffset: number
  cutOffset: number
}

export type WordPageTemplateName = 'cover' | 'preface' | 'contents' | 'starter'

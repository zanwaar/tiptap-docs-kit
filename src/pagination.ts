import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { createOverflowPageAttrs, createWordPage, findCurrentPage, getPagePositions, isEmptyPage } from './page-model'
import type {
  PageAttrs,
  TextSplitRange,
  WordPagePaginationBindingOptions,
  WordPagePaginationOptions,
  WordPageStablePaginationOptions,
} from './types'

const findNearestWordBoundary = (text: string, preferredOffset: number): number => {
  const safeOffset = Math.max(1, Math.min(preferredOffset, text.length - 1))
  const before = text.lastIndexOf(' ', safeOffset)

  if (before > 0) return before + 1

  const after = text.indexOf(' ', safeOffset)
  if (after > 0 && after < text.length - 1) return after + 1

  return safeOffset
}

const trimSplitWhitespace = (text: string, cutOffset: number): TextSplitRange => {
  let deleteOffset = cutOffset

  while (deleteOffset > 0 && /\s/u.test(text.charAt(deleteOffset - 1))) {
    deleteOffset -= 1
  }

  return { deleteOffset, cutOffset }
}

const findReadableSplitRange = (text: string, preferredOffset?: number | null): TextSplitRange | null => {
  const trimmedEnd = text.trimEnd().length
  if (trimmedEnd <= 1) return null

  const safePreferredOffset = Math.max(1, Math.min(preferredOffset ?? Math.floor(trimmedEnd * 0.9), trimmedEnd - 1))

  const wordOffset = text.lastIndexOf(' ', safePreferredOffset)
  if (wordOffset > 0 && wordOffset < trimmedEnd) {
    return trimSplitWhitespace(text, wordOffset + 1)
  }

  return null
}

const findTextNodeAtOffset = (element: Element, offset: number): { node: Text, offset: number } | null => {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let remainingOffset = offset
  let currentNode = walker.nextNode() as Text | null

  while (currentNode) {
    if (remainingOffset <= currentNode.data.length) {
      return { node: currentNode, offset: remainingOffset }
    }

    remainingOffset -= currentNode.data.length
    currentNode = walker.nextNode() as Text | null
  }

  return null
}

const findPageFitOffset = (pageElement: HTMLElement, blockElement: Element, text: string, overflowTolerance: number): number | null => {
  const trimmedEnd = text.trimEnd().length
  if (trimmedEnd <= 1) return null

  const pageStyles = window.getComputedStyle(pageElement)
  const pagePaddingBottom = Number.parseFloat(pageStyles.paddingBottom) || 0
  const contentBottom = pageElement.getBoundingClientRect().bottom - pagePaddingBottom - overflowTolerance
  let low = 1
  let high = trimmedEnd - 1
  let fitOffset = 0

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const textPosition = findTextNodeAtOffset(blockElement, mid)

    if (!textPosition) break

    const range = document.createRange()
    range.setStart(blockElement, 0)
    range.setEnd(textPosition.node, textPosition.offset)

    const rangeBottom = range.getBoundingClientRect().bottom
    range.detach()

    if (rangeBottom <= contentBottom) {
      fitOffset = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return fitOffset > 0 ? fitOffset : null
}

const splitTextblockTail = (
  block: ProseMirrorNode,
  preferredOffset?: number | null,
): { head: ProseMirrorNode, tail: ProseMirrorNode, range: TextSplitRange } | null => {
  if (!block.isTextblock || block.content.size <= 1) return null

  const splitRange = findReadableSplitRange(block.textContent, preferredOffset ?? undefined)
  if (!splitRange || splitRange.cutOffset >= block.content.size) return null

  const headAttrs = block.type.name === 'paragraph'
    ? { ...block.attrs, wordPageSplit: 'head' }
    : block.attrs
  const tailAttrs = block.type.name === 'paragraph'
    ? { ...block.attrs, wordPageSplit: 'tail' }
    : block.attrs

  return {
    head: block.type.create(headAttrs, block.content.cut(0, splitRange.deleteOffset), block.marks),
    tail: block.type.create(tailAttrs, block.content.cut(splitRange.cutOffset, block.content.size), block.marks),
    range: splitRange,
  }
}

export const normalizeWordPages = (editor: Editor): boolean => {
  const pagePositions = getPagePositions(editor)
  if (pagePositions.length <= 1) return false

  const currentPage = findCurrentPage(editor)
  const transaction = editor.state.tr
  let changed = false

  for (let index = pagePositions.length - 1; index > 0; index -= 1) {
    const page = pagePositions[index]
    if (page.index === currentPage?.index) continue

    const mappedStart = transaction.mapping.map(page.start)
    const mappedNode = transaction.doc.nodeAt(mappedStart)

    if (!mappedNode || mappedNode.type.name !== 'page' || !isEmptyPage(mappedNode)) continue

    transaction.delete(mappedStart, mappedStart + mappedNode.nodeSize)
    changed = true
  }

  if (!changed) return false

  editor.view.dispatch(transaction.scrollIntoView())
  return true
}

export const removeEmptyTrailingWordPages = normalizeWordPages

export const paginateWordPages = (
  editor: Editor,
  rootElement: ParentNode,
  options: WordPagePaginationOptions = {},
): boolean => {
  if (normalizeWordPages(editor)) return true

  const pageSelector = options.pageSelector ?? '.a4-page'
  const overflowTolerance = options.overflowTolerance ?? 8
  const pageElements = Array.from(rootElement.querySelectorAll<HTMLElement>(pageSelector))
  const overflowIndex = pageElements.findIndex((pageElement) => pageElement.scrollHeight > pageElement.clientHeight + overflowTolerance)

  if (overflowIndex === -1) return false

  const pageNode = editor.state.doc.child(overflowIndex)
  if (!pageNode || pageNode.type.name !== 'page') return false

  let pageStart = 0
  for (let index = 0; index < overflowIndex; index += 1) {
    pageStart += editor.state.doc.child(index).nodeSize
  }

  const lastBlock = pageNode.lastChild
  if (!lastBlock) return false

  let lastBlockStart = pageStart + 1
  for (let index = 0; index < pageNode.childCount - 1; index += 1) {
    lastBlockStart += pageNode.child(index).nodeSize
  }

  const lastBlockElement = pageElements[overflowIndex]?.children.item(pageNode.childCount - 1)
  const fitOffset = lastBlockElement
    ? findPageFitOffset(pageElements[overflowIndex], lastBlockElement, lastBlock.textContent, overflowTolerance)
    : null
  const splitTail = splitTextblockTail(lastBlock, fitOffset)
  if (splitTail) {
    const nextNode = editor.state.doc.child(overflowIndex + 1)
    const transaction = editor.state.tr.replaceWith(lastBlockStart, lastBlockStart + lastBlock.nodeSize, splitTail.head)
    const nextPageStart = transaction.mapping.map(pageStart + pageNode.nodeSize)
    const tailInsertPosition = nextPageStart + 1
    const shouldMoveSelectionToTail = editor.state.selection.from >= lastBlockStart + 1 + splitTail.range.cutOffset

    if (nextNode?.type.name === 'page') {
      transaction.insert(tailInsertPosition, splitTail.tail)
    } else {
      transaction.insert(nextPageStart, editor.schema.nodes.page.create(
        createOverflowPageAttrs(options.createPageAttrs),
        splitTail.tail,
      ))
    }

    if (shouldMoveSelectionToTail) {
      const tailEndPosition = tailInsertPosition + splitTail.tail.nodeSize - 1
      transaction.setSelection(TextSelection.near(transaction.doc.resolve(tailEndPosition), -1))
    }

    editor.view.dispatch(transaction.scrollIntoView())
    return true
  }

  // If the last block cannot be split, move it as a unit.
  if (pageNode.childCount > 1) {
    const nextNode = editor.state.doc.child(overflowIndex + 1)
    const transaction = editor.state.tr.delete(lastBlockStart, lastBlockStart + lastBlock.nodeSize)
    const nextPageStart = transaction.mapping.map(pageStart + pageNode.nodeSize)

    if (nextNode?.type.name === 'page') {
      transaction.insert(nextPageStart + 1, lastBlock)
    } else {
      transaction.insert(nextPageStart, editor.schema.nodes.page.create(
        createOverflowPageAttrs(options.createPageAttrs),
        lastBlock,
      ))
    }

    editor.view.dispatch(transaction.scrollIntoView())
    return true
  }

  // Cannot split — create a new page for overflow
  const insertPosition = pageStart + pageNode.nodeSize
  const nextNode = editor.state.doc.child(overflowIndex + 1)

  if (!nextNode || nextNode.type.name !== 'page') {
    editor.chain().insertContentAt(insertPosition, createWordPage({
      ...createOverflowPageAttrs(options.createPageAttrs as PageAttrs | undefined),
    })).run()
    return true
  }

  return false
}

export const paginateWordPagesUntilStable = (
  editor: Editor,
  rootElement: ParentNode,
  options: WordPageStablePaginationOptions = {},
): boolean => {
  const maxPasses = options.maxPasses ?? 1
  let changed = false

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const passChanged = paginateWordPages(editor, rootElement, options)
    changed = changed || passChanged

    if (!passChanged) break
  }

  return changed
}

export const bindWordPagePagination = (
  editor: Editor,
  rootElement: ParentNode,
  options: WordPagePaginationBindingOptions = {},
): (() => void) => {
  let isPaginating = false
  let isDestroyed = false
  let framePasses = 0
  let animationFrame: number | null = null
  const maxFramePasses = options.maxFramePasses ?? 80

  const runPagination = () => {
    animationFrame = null

    if (isDestroyed || isPaginating || editor.isDestroyed) return

    isPaginating = true
    const changed = paginateWordPagesUntilStable(editor, rootElement, options)

    requestAnimationFrame(() => {
      isPaginating = false
      options.onPaginated?.(changed)

      if (isDestroyed || editor.isDestroyed) return

      if (changed && framePasses < maxFramePasses) {
        framePasses += 1
        schedulePagination()
        return
      }

      framePasses = 0
    })
  }

  const schedulePagination = () => {
    if (isDestroyed || animationFrame !== null) return
    animationFrame = requestAnimationFrame(runPagination)
  }

  editor.on('update', schedulePagination)
  schedulePagination()

  return () => {
    isDestroyed = true
    editor.off('update', schedulePagination)

    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame)
    }
  }
}

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

const getPageContentBottom = (pageElement: HTMLElement, overflowTolerance: number): number => {
  const pageStyles = window.getComputedStyle(pageElement)
  const pagePaddingBottom = Number.parseFloat(pageStyles.paddingBottom) || 0

  return pageElement.getBoundingClientRect().bottom - pagePaddingBottom - overflowTolerance
}

const isHeaderTableRow = (row: ProseMirrorNode): boolean => (
  row.childCount > 0 && Array.from({ length: row.childCount }, (_, index) => row.child(index))
    .every((cell) => cell.type.name === 'tableHeader')
)

const findFittingTableRowCount = (pageElement: HTMLElement, tableElement: Element, overflowTolerance: number): number => {
  const rows = Array.from(tableElement.querySelectorAll<HTMLTableRowElement>('tr'))
  if (rows.length <= 1) return rows.length

  const contentBottom = getPageContentBottom(pageElement, overflowTolerance)
  let fittingRows = 0

  for (const row of rows) {
    if (row.getBoundingClientRect().bottom > contentBottom) break
    fittingRows += 1
  }

  return fittingRows
}

const splitTableTail = (
  table: ProseMirrorNode,
  pageElement: HTMLElement,
  tableBlockElement: Element,
  overflowTolerance: number,
): { head: ProseMirrorNode, tail: ProseMirrorNode } | null => {
  if (table.type.name !== 'table' || table.childCount <= 1) return null

  const tableElement = tableBlockElement.matches('table')
    ? tableBlockElement
    : tableBlockElement.querySelector('table')
  if (!tableElement) return null

  const headerRow = table.firstChild
  const shouldRepeatHeader = headerRow ? isHeaderTableRow(headerRow) && !headerRow.attrs.docsRepeatedHeader : false
  const minimumHeadRows = shouldRepeatHeader ? 2 : 1
  const fittingRows = findFittingTableRowCount(pageElement, tableElement, overflowTolerance)
  const splitIndex = Math.max(minimumHeadRows, fittingRows)

  if (splitIndex >= table.childCount) return null

  const headRows = Array.from({ length: splitIndex }, (_, index) => table.child(index))
  const tailRows = Array.from({ length: table.childCount - splitIndex }, (_, index) => table.child(splitIndex + index))
  const repeatedHeaderRow = shouldRepeatHeader && headerRow
    ? headerRow.type.create({ ...headerRow.attrs, docsRepeatedHeader: 'true' }, headerRow.content, headerRow.marks)
    : null
  const repeatedTailRows = repeatedHeaderRow
    ? [repeatedHeaderRow, ...tailRows]
    : tailRows

  return {
    head: table.type.create(table.attrs, headRows, table.marks),
    tail: table.type.create(table.attrs, repeatedTailRows, table.marks),
  }
}

const removeRepeatedHeaderRows = (table: ProseMirrorNode): ProseMirrorNode[] => (
  Array.from({ length: table.childCount }, (_, index) => table.child(index))
    .filter((row, index) => index === 0 || !row.attrs.docsRepeatedHeader)
)

const mergeContinuationTables = (tail: ProseMirrorNode, nextPage: ProseMirrorNode): ProseMirrorNode | null => {
  const nextTable = nextPage.firstChild
  if (!nextTable || nextTable.type.name !== 'table') return null

  const tailRows = removeRepeatedHeaderRows(tail)
  const nextRows = removeRepeatedHeaderRows(nextTable)
  const nextRowsWithoutHeader = nextRows[0]?.attrs.docsRepeatedHeader
    ? nextRows.slice(1)
    : nextRows

  return tail.type.create(tail.attrs, [...tailRows, ...nextRowsWithoutHeader], tail.marks)
}

const findTableBlockIndex = (page: ProseMirrorNode): number => {
  for (let index = page.childCount - 1; index >= 0; index -= 1) {
    if (page.child(index).type.name === 'table') return index
  }

  return -1
}

const createTableWithoutRepeatedHeader = (table: ProseMirrorNode): ProseMirrorNode => {
  const rows = removeRepeatedHeaderRows(table)
  return table.type.create(table.attrs, rows, table.marks)
}

const reflowTableRowsBackward = (
  editor: Editor,
  pageElements: HTMLElement[],
  options: WordPagePaginationOptions,
): boolean => {
  const overflowTolerance = options.overflowTolerance ?? 8
  const pagePositions = getPagePositions(editor)

  for (let pageIndex = 0; pageIndex < pagePositions.length - 1; pageIndex += 1) {
    const pageElement = pageElements[pageIndex]
    if (!pageElement || pageElement.scrollHeight > pageElement.clientHeight + overflowTolerance) continue

    const page = editor.state.doc.child(pageIndex)
    const nextPage = editor.state.doc.child(pageIndex + 1)
    if (page.type.name !== 'page' || nextPage?.type.name !== 'page') continue

    const tableIndex = findTableBlockIndex(page)
    const table = tableIndex >= 0 ? page.child(tableIndex) : null
    const nextTable = nextPage.firstChild
    if (!table || table.type.name !== 'table' || !nextTable || nextTable.type.name !== 'table') continue

    const nextRows = removeRepeatedHeaderRows(nextTable)
    const nextDataRows = nextRows[0]?.attrs.docsRepeatedHeader ? nextRows.slice(1) : nextRows
    if (nextDataRows.length === 0) continue

    const pageTableElement = pageElement.children.item(tableIndex)
    const nextPageElement = pageElements[pageIndex + 1]
    const nextTableElement = nextPageElement?.children.item(0)
    const nextTableRows = nextTableElement
      ? Array.from(nextTableElement.querySelectorAll<HTMLTableRowElement>('tr'))
      : []
    const nextRowElement = nextRows[0]?.attrs.docsRepeatedHeader ? nextTableRows[1] : nextTableRows[0]
    if (!pageTableElement || !nextRowElement) continue

    const availableHeight = getPageContentBottom(pageElement, overflowTolerance) - pageTableElement.getBoundingClientRect().bottom
    const nextRowHeight = nextRowElement.getBoundingClientRect().height
    if (nextRowHeight > availableHeight) continue

    const movedRow = nextDataRows[0]
    const candidateTable = table.type.create(table.attrs, [
      ...Array.from({ length: table.childCount }, (_, index) => table.child(index)),
      movedRow,
    ], table.marks)
    const remainingNextRows = nextDataRows.slice(1)
    const repeatedHeader = nextRows[0]?.attrs.docsRepeatedHeader ? nextRows[0] : null
    const nextReplacementRows = repeatedHeader && remainingNextRows.length > 0
      ? [repeatedHeader, ...remainingNextRows]
      : remainingNextRows
    const nextReplacementTable = nextReplacementRows.length > 0
      ? nextTable.type.create(nextTable.attrs, nextReplacementRows, nextTable.marks)
      : null

    const pageStart = pagePositions[pageIndex].start
    const nextPageStart = pagePositions[pageIndex + 1].start
    let tableStart = pageStart + 1
    for (let index = 0; index < tableIndex; index += 1) {
      tableStart += page.child(index).nodeSize
    }

    const transaction = editor.state.tr.replaceWith(tableStart, tableStart + table.nodeSize, candidateTable)
    const mappedNextPageStart = transaction.mapping.map(nextPageStart)
    const mappedNextTableStart = mappedNextPageStart + 1

    if (nextReplacementTable) {
      transaction.replaceWith(mappedNextTableStart, mappedNextTableStart + nextTable.nodeSize, nextReplacementTable)
    } else {
      transaction.delete(mappedNextTableStart, mappedNextTableStart + nextTable.nodeSize)
    }

    editor.view.dispatch(transaction.scrollIntoView())
    return true
  }

  return false
}

const reflowBlocksBackward = (
  editor: Editor,
  pageElements: HTMLElement[],
  options: WordPagePaginationOptions,
): boolean => {
  const overflowTolerance = options.overflowTolerance ?? 8
  const pagePositions = getPagePositions(editor)

  for (let pageIndex = 0; pageIndex < pagePositions.length - 1; pageIndex += 1) {
    const pageElement = pageElements[pageIndex]
    const nextPageElement = pageElements[pageIndex + 1]
    if (!pageElement || !nextPageElement) continue
    if (pageElement.scrollHeight > pageElement.clientHeight + overflowTolerance) continue

    const page = editor.state.doc.child(pageIndex)
    const nextPage = editor.state.doc.child(pageIndex + 1)
    if (page.type.name !== 'page' || nextPage?.type.name !== 'page' || nextPage.childCount === 0) continue

    const firstNextBlock = nextPage.firstChild
    const firstNextBlockElement = nextPageElement.children.item(0)
    if (!firstNextBlock || !firstNextBlockElement) continue

    const pageStyles = window.getComputedStyle(pageElement)
    const pagePaddingTop = Number.parseFloat(pageStyles.paddingTop) || 0
    const contentBottom = getPageContentBottom(pageElement, overflowTolerance)
    const lastBlockBottom = pageElement.lastElementChild
      ? pageElement.lastElementChild.getBoundingClientRect().bottom
      : pageElement.getBoundingClientRect().top + pagePaddingTop
    const availableHeight = contentBottom - lastBlockBottom
    const firstNextBlockHeight = firstNextBlockElement.getBoundingClientRect().height
    if (firstNextBlockHeight > availableHeight) continue

    const pageStart = pagePositions[pageIndex].start
    const nextPageStart = pagePositions[pageIndex + 1].start
    const insertPosition = pageStart + page.nodeSize - 1
    const firstNextBlockStart = nextPageStart + 1
    const transaction = editor.state.tr.delete(firstNextBlockStart, firstNextBlockStart + firstNextBlock.nodeSize)
    transaction.insert(transaction.mapping.map(insertPosition), firstNextBlock)

    editor.view.dispatch(transaction.scrollIntoView())
    return true
  }

  return false
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

  if (reflowTableRowsBackward(editor, pageElements, options)) return true
  if (reflowBlocksBackward(editor, pageElements, options)) return true

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
  const splitTable = lastBlockElement
    ? splitTableTail(lastBlock, pageElements[overflowIndex], lastBlockElement, overflowTolerance)
    : null

  if (splitTable) {
    const nextNode = editor.state.doc.child(overflowIndex + 1)
    const transaction = editor.state.tr.replaceWith(lastBlockStart, lastBlockStart + lastBlock.nodeSize, splitTable.head)
    const nextPageStart = transaction.mapping.map(pageStart + pageNode.nodeSize)

    if (nextNode?.type.name === 'page') {
      const mergedContinuation = mergeContinuationTables(splitTable.tail, nextNode)

      if (mergedContinuation && nextNode.firstChild) {
        transaction.replaceWith(
          nextPageStart + 1,
          nextPageStart + 1 + nextNode.firstChild.nodeSize,
          mergedContinuation,
        )
      } else {
        transaction.insert(nextPageStart + 1, splitTable.tail)
      }
    } else {
      transaction.insert(nextPageStart, editor.schema.nodes.page.create(
        createOverflowPageAttrs(options.createPageAttrs),
        splitTable.tail,
      ))
    }

    editor.view.dispatch(transaction.scrollIntoView())
    return true
  }

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

import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { findCurrentPage, getPagePositions, isEmptyPage } from './page-model'
import type { PagePosition, TextDeleteRange } from './types'

const findLastTextDeleteRange = (page: PagePosition): TextDeleteRange | null => {
  let deleteRange: TextDeleteRange | null = null

  page.node.descendants((node, position) => {
    if (!node.isText || !node.text || node.text.length === 0) return

    const lastCharacterPosition = page.start + 1 + position + node.text.length - 1
    deleteRange = {
      from: lastCharacterPosition,
      to: lastCharacterPosition + 1,
    }
  })

  return deleteRange
}

const isSelectionAtStartOfPageContent = (editor: Editor, page: PagePosition): boolean => {
  const { selection } = editor.state

  if (!selection.empty) return false
  if (selection.$from.parentOffset > 0) return false
  if (selection.$from.pos <= page.start + 1) return true
  if (selection.$from.before(selection.$from.depth) !== page.start + 1) return false

  let firstChildStart = page.start + 1
  for (let index = 0; index < page.node.childCount; index += 1) {
    const child = page.node.child(index)
    if (child.isTextblock) return selection.$from.pos === firstChildStart + 1
    firstChildStart += child.nodeSize
  }

  return false
}

export const handlePageBackspace = (editor: Editor): boolean => {
  const currentPage = findCurrentPage(editor)
  if (!currentPage || currentPage.index === 0) return false
  if (!isSelectionAtStartOfPageContent(editor, currentPage)) return false

  const previousPage = getPagePositions(editor)[currentPage.index - 1]
  if (!previousPage) return false

  const transaction = editor.state.tr

  if (isEmptyPage(currentPage.node)) {
    transaction.delete(currentPage.start, currentPage.start + currentPage.node.nodeSize)
    const previousSelectionPosition = Math.max(previousPage.start + 1, previousPage.start + previousPage.node.content.size)
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(transaction.mapping.map(previousSelectionPosition)), -1))
  } else {
    const deleteRange = findLastTextDeleteRange(previousPage)
    if (!deleteRange) return false

    const currentSelectionPosition = editor.state.selection.from

    transaction.delete(deleteRange.from, deleteRange.to)
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(transaction.mapping.map(currentSelectionPosition)), 1))
  }

  editor.view.dispatch(transaction.scrollIntoView())
  return true
}

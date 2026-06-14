import type { Editor, JSONContent } from '@tiptap/core'
import type { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model'
import type { InsertPageOptions, PageAttrs, PagePosition, WordPageTemplateName } from './types'

export const defaultPageAttrs: Required<Omit<PageAttrs, 'class' | 'marginValue'>> & Pick<PageAttrs, 'class' | 'marginValue'> = {
  pageType: 'body',
  paperSize: 'a4',
  orientation: 'portrait',
  margin: 'normal',
  marginValue: null,
  class: null,
}

export const pageClassNames = ({ pageType, paperSize, orientation, margin, class: className }: PageAttrs) => [
  'a4-page',
  pageType ? `a4-page--${pageType}` : '',
  paperSize ? `a4-page--${paperSize}` : '',
  orientation ? `a4-page--${orientation}` : '',
  margin ? `a4-page--margin-${margin}` : '',
  className ?? '',
].filter(Boolean).join(' ')

export const createWordPage = (options: InsertPageOptions = {}): JSONContent => ({
  type: 'page',
  attrs: {
    ...defaultPageAttrs,
    pageType: options.pageType ?? defaultPageAttrs.pageType,
    paperSize: options.paperSize ?? defaultPageAttrs.paperSize,
    orientation: options.orientation ?? defaultPageAttrs.orientation,
    margin: options.margin ?? defaultPageAttrs.margin,
    marginValue: options.marginValue ?? defaultPageAttrs.marginValue,
    class: options.class ?? defaultPageAttrs.class,
  },
  content: options.content ?? [{ type: 'paragraph' }],
})

export const createBlankWordPageDocument = (): JSONContent => ({
  type: 'doc',
  content: [createWordPage()],
})

export const createEmptyWordPageNode = (schema: Schema): ProseMirrorNode => schema.nodes.page.create(
  defaultPageAttrs,
  schema.nodes.paragraph.create(),
)

export const createWordPageTemplate = (templateName: WordPageTemplateName): JSONContent => {
  const templates: Record<WordPageTemplateName, JSONContent> = {
    cover: createWordPage({
      pageType: 'cover',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'LAPORAN PROYEK AKHIR' }] },
        { type: 'paragraph', attrs: { class: 'subtitle' }, content: [{ type: 'text', text: 'Pengembangan Sistem Dokumentasi Terpadu Berbasis Awan untuk Optimalisasi Kolaborasi Profesional' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Disusun oleh:' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Felix Arvidsson' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'NIM: 1202194012' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'FAKULTAS REKAYASA INDUSTRI' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'UNIVERSITAS TEKNOLOGI MODERN' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'BANDUNG' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '2024' }] },
      ],
    }),
    preface: createWordPage({
      content: [
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Kata Pengantar' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Puji syukur penulis panjatkan kepada Tuhan Yang Maha Esa atas segala rahmat dan hidayah-Nya sehingga Laporan Proyek Akhir ini dapat diselesaikan tepat pada waktunya.' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Laporan ini disusun sebagai salah satu syarat untuk menyelesaikan program studi di Fakultas Rekayasa Industri, Universitas Teknologi Modern. Penulis menyadari bahwa keberhasilan penyusunan laporan ini tidak lepas dari bantuan berbagai pihak.' }] },
      ],
    }),
    contents: createWordPage({
      pageType: 'toc',
      class: 'a4-page--last',
      content: [
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Daftar Isi' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'BAB I PENDAHULUAN ........................................................ 1' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'BAB II LANDASAN TEORI .................................................... 5' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'BAB III METODOLOGI PENELITIAN ...................................... 15' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'BAB IV ANALISIS DAN PEMBAHASAN .................................... 25' }] },
      ],
    }),
    starter: createBlankWordPageDocument(),
  }

  return templates[templateName]
}

export const createWordPageDocument = (): JSONContent => ({
  type: 'doc',
  content: [
    createWordPageTemplate('cover'),
    createWordPageTemplate('preface'),
    createWordPageTemplate('contents'),
  ],
})

export const isEmptyTextblock = (node: ProseMirrorNode): boolean => node.isTextblock && node.content.size === 0

export const isEmptyPage = (node: ProseMirrorNode): boolean => {
  if (node.type.name !== 'page') return false
  if (node.childCount === 0) return true
  if (node.childCount === 1) return isEmptyTextblock(node.firstChild as ProseMirrorNode)

  return node.content.size === 0 || node.textContent.trim().length === 0
}

export const getPagePositions = (editor: Editor): PagePosition[] => {
  const pagePositions: PagePosition[] = []

  editor.state.doc.forEach((node, offset, index) => {
    if (node.type.name === 'page') {
      pagePositions.push({ index, start: offset, node })
    }
  })

  return pagePositions
}

export const findCurrentPage = (editor: Editor): PagePosition | null => {
  const { $from } = editor.state.selection
  const pagePositions = getPagePositions(editor)

  return pagePositions.find(({ start, node }) => $from.pos > start && $from.pos < start + node.nodeSize) ?? null
}

export const createOverflowPageAttrs = (attrs: PageAttrs = {}): PageAttrs => ({
  ...defaultPageAttrs,
  ...attrs,
  pageType: 'body',
  class: null,
})

# tiptap-docs-kit

`tiptap-docs-kit` adalah extension kit untuk membangun editor dokumen berbasis Tiptap dengan pengalaman seperti word processor. Package ini menggabungkan extension umum, halaman A4, page break, pagination, text alignment, text color, dan style dokumen dalam satu tempat.

## Fitur

- `DocsKit` sebagai satu extension bundle untuk editor dokumen.
- Page model seperti Word/Docs dengan node `page`.
- Page break dengan node `pageBreak`.
- Pagination helper untuk menjaga konten antar halaman.
- Text alignment untuk paragraph dan heading.
- Text color mark dengan command `setTextColor` dan `unsetTextColor`.
- Table editing dengan insert, add/delete row/column, merge/split cell, dan resize column.
- CSS dokumen satu file lewat `tiptap-docs-kit/style.css`.
- Helper untuk membuat dokumen kosong dan template dokumen.

## Instalasi

Untuk local development di monorepo/playground:

```json
{
  "dependencies": {
    "tiptap-docs-kit": "file:../../packages/tiptap-docs-kit"
  }
}
```

Install dependency dari aplikasi consumer:

```bash
npm install
```

## Penggunaan React

```tsx
import { useEditor } from '@tiptap/react'
import { DocsKit, createBlankWordPageDocument } from 'tiptap-docs-kit'
import 'tiptap-docs-kit/style.css'

export function Editor() {
  const editor = useEditor({
    extensions: [DocsKit],
    content: createBlankWordPageDocument(),
    editorProps: {
      attributes: {
        class: 'word-editor-document',
      },
    },
  })

  return editor
}
```

## Pagination

Gunakan `bindWordPagePagination` pada container scroll editor.

```tsx
import { useEffect, useRef } from 'react'
import { EditorContent } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import { bindWordPagePagination } from 'tiptap-docs-kit'

export function Workspace({ editor }: { editor: Editor | null }) {
  const workspaceRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!editor || !workspaceRef.current) return undefined

    return bindWordPagePagination(editor, workspaceRef.current)
  }, [editor])

  return (
    <main className="workspace" ref={workspaceRef}>
      <EditorContent editor={editor} />
    </main>
  )
}
```

## Commands

Package ini menambahkan beberapa command ke Tiptap.

### Page

```ts
editor.chain().focus().insertPage({ pageType: 'body' }).run()
editor.chain().focus().setPageAttrs({ margin: 'narrow' }).run()
editor.chain().focus().insertPageBreak().run()
editor.chain().focus().insertWordPageTemplate('cover').run()
```

### Text Align

```ts
editor.chain().focus().setTextAlign('left').run()
editor.chain().focus().setTextAlign('center').run()
editor.chain().focus().setTextAlign('right').run()
editor.chain().focus().setTextAlign('justify').run()
```

### Text Color

```ts
editor.chain().focus().setTextColor('#063f81').run()
editor.chain().focus().unsetTextColor().run()
```

### Table

```ts
editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
editor.chain().focus().insertGrid({ rows: 4, cols: 4 }).run()
editor.chain().focus().addColumnAfter().run()
editor.chain().focus().addRowAfter().run()
editor.chain().focus().deleteColumn().run()
editor.chain().focus().deleteRow().run()
editor.chain().focus().deleteTable().run()
editor.chain().focus().mergeCells().run()
editor.chain().focus().splitCell().run()
```

## Konfigurasi DocsKit

`DocsKit` bisa dikonfigurasi per extension.

```ts
DocsKit.configure({
  starterKit: {},
  textAlign: {
    types: ['paragraph', 'heading'],
  },
  textColor: {},
  table: {
    resizable: true,
  },
  tableCell: {},
  tableHeader: {},
  tableRow: {},
  page: {
    pasteAsPlainText: true,
  },
  pageBreak: {},
})
```

Set salah satu opsi ke `false` untuk menonaktifkan extension tersebut.

```ts
DocsKit.configure({
  textColor: false,
})
```

## CSS

Import style sekali di aplikasi consumer:

```ts
import 'tiptap-docs-kit/style.css'
```

Style utama dikontrol melalui CSS variables:

```css
.word-editor-document {
  --word-page-width: 816px;
  --word-page-height: 1056px;
  --word-page-padding: 96px;
  --word-page-text-color: #49454f;
  --word-page-font-size: 16px;
  --word-page-line-height: 24px;
}
```

## Exports

```ts
import {
  DocsKit,
  Page,
  PageBreak,
  Table,
  TableCell,
  TableHeader,
  TableRow,
  TextAlign,
  TextColor,
  bindWordPagePagination,
  createBlankWordPageDocument,
  createWordPage,
  createWordPageDocument,
  createWordPageTemplate,
} from 'tiptap-docs-kit'
```

## Development

Jalankan dari folder package:

```bash
npm install
npm run build
npm run lint
```

Build akan menghasilkan output ke `dist/` dan menyalin `src/style.css` menjadi `dist/style.css`.

## Catatan Arsitektur

Package ini fokus pada logic Tiptap dan CSS dokumen. UI React seperti toolbar, status bar, sidebar, atau dialog color picker sebaiknya tetap berada di aplikasi consumer atau package React terpisah.

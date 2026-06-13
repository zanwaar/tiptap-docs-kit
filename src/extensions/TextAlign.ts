import { Extension } from '@tiptap/core'

type TextAlignment = 'left' | 'center' | 'right' | 'justify'

interface TextAlignOptions {
  types: string[]
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textAlign: {
      setTextAlign: (alignment: TextAlignment) => ReturnType
    }
  }
}

export const TextAlign = Extension.create<TextAlignOptions>({
  name: 'textAlign',

  addOptions() {
    return {
      types: ['paragraph', 'heading'],
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (element) => element.style.textAlign || null,
            renderHTML: (attributes) => {
              if (!attributes.textAlign) return {}

              return {
                style: `text-align: ${attributes.textAlign}`,
              }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setTextAlign: (alignment) => ({ commands }) => this.options.types
        .map((type) => commands.updateAttributes(type, { textAlign: alignment }))
        .some(Boolean),
    }
  },
})

import { Mark, mergeAttributes } from '@tiptap/core'

export interface TextFontOptions {
  HTMLAttributes: Record<string, unknown>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textFont: {
      setTextFont: (fontFamily: string) => ReturnType
      unsetTextFont: () => ReturnType
    }
  }
}

const normalizeTextFont = (fontFamily: string) => {
  const trimmedFontFamily = fontFamily.trim()

  return trimmedFontFamily || null
}

export const TextFont = Mark.create<TextFontOptions>({
  name: 'textFont',

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      fontFamily: {
        default: null,
        parseHTML: (element) => element.style.fontFamily || element.getAttribute('data-text-font'),
        renderHTML: (attributes) => {
          if (!attributes.fontFamily) return {}

          return {
            'data-text-font': attributes.fontFamily,
            style: `font-family: ${attributes.fontFamily}`,
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-text-font]',
      },
      {
        style: 'font-family',
        getAttrs: (fontFamily) => (typeof fontFamily === 'string' ? { fontFamily } : false),
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setTextFont: (fontFamily) => ({ commands }) => {
        const normalizedFontFamily = normalizeTextFont(fontFamily)

        if (!normalizedFontFamily) return false

        return commands.setMark(this.name, { fontFamily: normalizedFontFamily })
      },
      unsetTextFont: () => ({ commands }) => commands.unsetMark(this.name),
    }
  },
})

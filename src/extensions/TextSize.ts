import { Mark, mergeAttributes } from '@tiptap/core'

export interface TextSizeOptions {
  HTMLAttributes: Record<string, unknown>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textSize: {
      setTextSize: (size: string) => ReturnType
      unsetTextSize: () => ReturnType
    }
  }
}

const normalizeTextSize = (size: string) => {
  const trimmedSize = size.trim()

  if (!trimmedSize) return null

  return /^\d+(\.\d+)?$/.test(trimmedSize) ? `${trimmedSize}pt` : trimmedSize
}

export const TextSize = Mark.create<TextSizeOptions>({
  name: 'textSize',

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: (element) => element.style.fontSize || element.getAttribute('data-text-size'),
        renderHTML: (attributes) => {
          if (!attributes.size) return {}

          return {
            'data-text-size': attributes.size,
            style: `font-size: ${attributes.size}`,
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-text-size]',
      },
      {
        style: 'font-size',
        getAttrs: (size) => (typeof size === 'string' ? { size } : false),
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setTextSize: (size) => ({ commands }) => {
        const normalizedSize = normalizeTextSize(size)

        if (!normalizedSize) return false

        return commands.setMark(this.name, { size: normalizedSize })
      },
      unsetTextSize: () => ({ commands }) => commands.unsetMark(this.name),
    }
  },
})

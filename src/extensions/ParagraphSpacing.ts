import { Extension } from '@tiptap/core'

export interface ParagraphSpacingOptions {
  types: string[]
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphSpacing: {
      setLineSpacing: (lineHeight: string) => ReturnType
      unsetLineSpacing: () => ReturnType
      setParagraphSpaceBefore: (spaceBefore: string | null) => ReturnType
      setParagraphSpaceAfter: (spaceAfter: string | null) => ReturnType
    }
  }
}

const updateTextblockAttributes = (
  commands: { updateAttributes: (type: string, attributes: Record<string, string | null>) => boolean },
  types: string[],
  attributes: Record<string, string | null>,
) => types.some((type) => commands.updateAttributes(type, attributes))

export const ParagraphSpacing = Extension.create<ParagraphSpacingOptions>({
  name: 'paragraphSpacing',

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
          lineHeight: {
            default: null,
            parseHTML: (element) => element.style.lineHeight || element.getAttribute('data-line-height'),
            renderHTML: (attributes) => {
              if (!attributes.lineHeight) return {}

              return {
                'data-line-height': attributes.lineHeight,
                style: `line-height: ${attributes.lineHeight}`,
              }
            },
          },
          spaceBefore: {
            default: null,
            parseHTML: (element) => element.style.marginTop || element.getAttribute('data-space-before'),
            renderHTML: (attributes) => {
              if (!attributes.spaceBefore) return {}

              return {
                'data-space-before': attributes.spaceBefore,
                style: `margin-top: ${attributes.spaceBefore}`,
              }
            },
          },
          spaceAfter: {
            default: null,
            parseHTML: (element) => element.style.marginBottom || element.getAttribute('data-space-after'),
            renderHTML: (attributes) => {
              if (!attributes.spaceAfter) return {}

              return {
                'data-space-after': attributes.spaceAfter,
                style: `margin-bottom: ${attributes.spaceAfter}`,
              }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setLineSpacing: (lineHeight) => ({ commands }) => updateTextblockAttributes(commands, this.options.types, { lineHeight }),
      unsetLineSpacing: () => ({ commands }) => updateTextblockAttributes(commands, this.options.types, { lineHeight: null }),
      setParagraphSpaceBefore: (spaceBefore) => ({ commands }) => updateTextblockAttributes(commands, this.options.types, { spaceBefore }),
      setParagraphSpaceAfter: (spaceAfter) => ({ commands }) => updateTextblockAttributes(commands, this.options.types, { spaceAfter }),
    }
  },
})

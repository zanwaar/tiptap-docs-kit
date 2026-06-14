import Image from '@tiptap/extension-image'

export const ResizableImage = Image.extend({
  name: 'image',

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute('width') || element.style.width || null,
        renderHTML: (attributes) => {
          if (!attributes.width) return {}

          const width = typeof attributes.width === 'number' ? `${attributes.width}px` : attributes.width
          return { style: `width: ${width}` }
        },
      },
    }
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const container = document.createElement('div')
      container.className = 'word-page-image-wrapper'

      const image = document.createElement('img')
      image.src = node.attrs.src ?? ''
      if (node.attrs.alt) image.alt = node.attrs.alt
      if (node.attrs.title) image.title = node.attrs.title
      if (node.attrs.width) image.style.width = typeof node.attrs.width === 'number' ? `${node.attrs.width}px` : node.attrs.width
      image.className = 'word-page-image'

      const handle = document.createElement('span')
      handle.className = 'word-page-image-handle'
      handle.setAttribute('contenteditable', 'false')

      container.append(image, handle)

      const startResize = (event: MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()

        const startX = event.clientX
        const startWidth = image.getBoundingClientRect().width

        const onMouseMove = (moveEvent: MouseEvent) => {
          const nextWidth = Math.max(40, Math.round(startWidth + (moveEvent.clientX - startX)))
          image.style.width = `${nextWidth}px`
        }

        const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove)
          document.removeEventListener('mouseup', onMouseUp)

          if (typeof getPos !== 'function') return
          const position = getPos()
          if (typeof position !== 'number') return

          const finalWidth = Math.round(image.getBoundingClientRect().width)
          editor.view.dispatch(
            editor.view.state.tr.setNodeMarkup(position, undefined, {
              ...node.attrs,
              width: `${finalWidth}px`,
            }),
          )
        }

        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', onMouseUp)
      }

      handle.addEventListener('mousedown', startResize)

      return {
        dom: container,
        update: (updatedNode) => {
          if (updatedNode.type.name !== this.name) return false

          image.src = updatedNode.attrs.src ?? ''
          image.alt = updatedNode.attrs.alt ?? ''
          image.style.width = updatedNode.attrs.width
            ? (typeof updatedNode.attrs.width === 'number' ? `${updatedNode.attrs.width}px` : updatedNode.attrs.width)
            : ''
          return true
        },
        destroy: () => {
          handle.removeEventListener('mousedown', startResize)
        },
      }
    }
  },
})

/** Links a detached toolbar host to one document view without a global singleton. */
export function createDocEditorSession() {
  let toolbar: HTMLElement | null = null
  let content: object | null = null
  const listeners = new Set<() => void>()
  return {
    getToolbar: () => toolbar,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    attachToolbar(element: HTMLElement) {
      if (toolbar && toolbar !== element)
        throw new Error('A document session supports one toolbar host')
      toolbar = element
      for (const listener of listeners) listener()
      return () => {
        if (toolbar !== element)
          return
        toolbar = null
        for (const listener of listeners) listener()
      }
    },
    attachContent(owner: object) {
      if (content && content !== owner)
        throw new Error('A document session supports one editor view')
      content = owner
      return () => {
        if (content === owner)
          content = null
      }
    },
  }
}
export type DocEditorSession = ReturnType<typeof createDocEditorSession>

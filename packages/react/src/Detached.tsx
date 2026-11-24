import type { DocEditorProps, DocEditorRef } from './DocEditor.js'
import type { DocEditorSession } from './session.js'
import { forwardRef, useEffect, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { DocEditor } from './DocEditor.js'
import { EditorCanvas } from './EditorCanvas.js'
import { Toolbar } from './Toolbar.js'

export function ToolBar({ session, title }: { session?: DocEditorSession, title?: string }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => session?.attachToolbar(host.current!), [session])
  return session
    ? <div className="sword-editor" ref={host} />
    : <Toolbar title={title} />
}
export const DocEditorContent = forwardRef<DocEditorRef, DocEditorProps & { session?: DocEditorSession }>(({ session, ...props }, ref) => {
  const owner = useRef({})
  useEffect(() => session?.attachContent(owner.current), [session])
  const host = useSyncExternalStore(session?.subscribe ?? (() => () => {}), session?.getToolbar ?? (() => null), () => null)
  if (!session)
    return <EditorCanvas minHeight={props.minHeight} maxHeight={props.maxHeight} />
  return (
    <DocEditor {...props} ref={ref} toolbar={false}>
      {host && createPortal(<Toolbar title={props.title} />, host)}
      <EditorCanvas minHeight={props.minHeight} maxHeight={props.maxHeight} />
    </DocEditor>
  )
})

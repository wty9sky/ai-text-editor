import type { ImageDocument } from '@sword-editor/image-editor'
import { mountImageWorkbench } from '@sword-editor/image-editor'
import { useEffect, useRef } from 'react'

export function ImageEditor({ initialDocument }: { initialDocument?: ImageDocument }) {
  const host = useRef<HTMLDivElement>(null)
  const initial = useRef(initialDocument)
  useEffect(() => mountImageWorkbench(host.current!, initial.current).destroy, [])
  return <div ref={host} />
}

import type { Editor } from './editor.js'
import type { AiAction, AiActionContext, AiActionResult, UploadKind, UploadOptions, UploadResult } from './extensions.js'
import type { HookMeta } from './hooks.js'
import { abortable, immutableJson } from '@sword-editor/runtime'
import { errorCode, SdkError } from './hooks.js'
import { createBlock, textToBlocks } from './markdown.js'

export interface OperationTarget {
  generation: number
  blockId?: string
  fingerprint?: string
}
export function captureTarget(editor: Editor, blockId?: string): OperationTarget {
  editor.assertActive()
  const block = blockId
    ? editor.getBlock(blockId)
    : undefined
  if (blockId && !block)
    throw new Error('Target block no longer exists')
  return {
    generation: editor.generation,
    blockId,
    fingerprint: block
      ? JSON.stringify(block)
      : undefined,
  }
}
export function assertTarget(editor: Editor, target: OperationTarget): void {
  editor.assertActive()
  if (target.generation !== editor.generation)
    throw new Error('Document changed while operation was running')
  if (target.blockId && JSON.stringify(editor.getBlock(target.blockId)) !== target.fingerprint)
    throw new Error('Target block changed while operation was running')
}
/** Default behavior for legacy actions; new plugins may supply their own apply. */
export function applyAiResult(action: AiAction, ctx: AiActionContext, result: AiActionResult): void {
  const { editor, block, index } = ctx
  editor.transaction(() => {
    if (action.apply) {
      action.apply(ctx, result)
    }
    else if (action.kind === 'polish') {
      if (block && result.text !== undefined)
        editor.update(block.id, { text: result.text })
    }
    else if (action.kind === 'image') {
      if (result.image)
        editor.insert(index + 1, createBlock('image', result.image))
    }
    else if (result.text?.trim()) {
      const generated = textToBlocks(result.text, editor.plugins.blockTypes)
      // Insert first, so removing the empty target does not introduce an extra paragraph.
      editor.insert(Math.max(0, index), generated)
      if (block?.type === 'paragraph' && !block.text.trim())
        editor.remove([block.id])
    }
  })
}
export class AiSession {
  private controller = new AbortController()
  private result?: AiActionResult
  private action: AiAction
  private target: OperationTarget
  private instruction = ''
  private running = false
  private signal: AbortSignal
  private meta: HookMeta
  private preparedContext: Readonly<Record<string, unknown>> = Object.freeze({})
  constructor(private editor: Editor, actionId: string, blockId?: string, options: { signal?: AbortSignal, timeoutMs?: number } = {}) {
    options.signal?.throwIfAborted()
    if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 0))
      throw new TypeError('Invalid AI timeout')
    const action = editor.plugins.getAiAction(actionId)
    if (!action)
      throw new Error(`Unknown AI action: ${actionId}`)
    this.action = action
    this.meta = editor.createMeta('ai')
    try {
      editor.authorize('ai.invoke', editor.plugins.owner('ai', actionId))
      editor.authorize('document.read', editor.plugins.owner('ai', actionId))
      editor.hooks.dispatch('ai:beforePrepare', { meta: this.meta, actionId, blockId })
      this.target = captureTarget(editor, blockId)
    }
    catch (error) {
      editor.hooks.dispatch('ai:error', {
        meta: this.meta,
        actionId,
        blockId,
        code: errorCode(error),
      })
      throw error
    }
    this.signal = AbortSignal.any([
      editor.signal,
      this.controller.signal,
      ...(options.signal
        ? [options.signal]
        : []),
      ...(options.timeoutMs !== undefined
        ? [
            AbortSignal.timeout(options.timeoutMs),
          ]
        : []),
      ...[
        editor.plugins.signal('ai', actionId),
      ].filter((value): value is AbortSignal => !!value),
    ])
  }

  private context(instruction: string): AiActionContext {
    this.signal.throwIfAborted()
    assertTarget(this.editor, this.target)
    if (this.editor.plugins.getAiAction(this.action.id) !== this.action)
      throw new Error('AI plugin was removed or replaced')
    const block = this.target.blockId
      ? this.editor.getBlock(this.target.blockId)
      : undefined
    return {
      editor: this.editor,
      block,
      index: block
        ? this.editor.indexOf(block.id)
        : this.editor.blocks.length,
      instruction,
      context: this.preparedContext,
      onProgress: (progress) => {
        this.context(instruction)
        if (!Number.isFinite(progress) || progress < 0 || progress > 1)
          throw new SdkError('AI_INVALID_PROGRESS', 'Expected progress between 0 and 1', 'ai:progress')
        this.editor.hooks.dispatch('ai:progress', {
          ...this.info(),
          progress,
        })
      },
      signal: this.signal,
    }
  }

  private info() { return { meta: this.meta, actionId: this.action.id, blockId: this.target.blockId } }

  async run(instruction: string): Promise<AiActionResult> {
    if (this.running)
      throw new Error('AI session is already running')
    this.running = true
    this.result = undefined
    this.instruction = instruction
    try {
      this.context(instruction)
      this.editor.authorize('document.read', this.editor.plugins.owner('ai', this.action.id))
      this.editor.authorize('ai.invoke', this.editor.plugins.owner('ai', this.action.id))
      this.preparedContext = this.editor.hooks.has('ai:prepareContext')
        ? await this.editor.hooks.transform({
            ...this.info(),
            context: Object.freeze({}),
            signal: this.signal,
          })
        : Object.freeze({})
      const ctx = this.context(instruction)
      this.editor.hooks.dispatch('ai:beforeRun', this.info())
      const result = await abortable(this.action.run(ctx), this.signal)
      this.context(instruction)
      if (!result || typeof result !== 'object' || (result.text !== undefined && typeof result.text !== 'string') || (result.image !== undefined && typeof result.image !== 'string'))
        throw new SdkError('AI_INVALID_RESULT', 'AI provider returned invalid output', 'ai:afterRun')
      this.result = immutableJson(result)
      this.editor.hooks.dispatch('ai:afterRun', this.info())
      return this.result
    }
    catch (error) {
      if (this.signal.aborted) {
        this.editor.hooks.dispatch('ai:cancelled', this.info())
      }
      else {
        this.editor.hooks.dispatch('ai:error', {
          ...this.info(),
          code: errorCode(error),
        })
      }
      throw error
    }
    finally {
      this.running = false
    }
  }

  apply(): void {
    if (!this.result)
      throw new Error('Run the AI session before applying its result')
    try {
      const context = this.context(this.instruction)
      this.editor.authorize('document.write', this.editor.plugins.owner('ai', this.action.id))
      this.editor.hooks.dispatch('ai:beforeApply', this.info())
      this.editor.withOperation(this.meta, () => applyAiResult(this.action, context, this.result!), this.editor.plugins.owner('ai', this.action.id))
      this.editor.hooks.dispatch('ai:applied', this.info())
      this.dispose()
    }
    catch (error) {
      if (this.signal.aborted) {
        this.editor.hooks.dispatch('ai:cancelled', this.info())
      }
      else {
        this.editor.hooks.dispatch('ai:error', {
          ...this.info(),
          code: errorCode(error),
        })
      }
      throw error
    }
  }

  dispose(): void {
    this.result = undefined
    this.controller.abort()
  }
}
export function uploadKind(file: Pick<File, 'type'>): UploadKind {
  return file.type.startsWith('image/')
    ? 'image'
    : file.type.startsWith('video/')
      ? 'video'
      : 'attachment'
}
export async function uploadFile(editor: Editor, file: File, options: UploadOptions & {
  kind?: UploadKind
  target?: OperationTarget
} = {}): Promise<UploadResult> {
  const target = options.target ?? captureTarget(editor)
  assertTarget(editor, target)
  const kind = options.kind ?? uploadKind(file)
  const uploader = editor.plugins.listUploaders().find(item => item.kind === kind)
  if (!uploader)
    throw new Error(`No uploader for ${kind}`)
  const signal = AbortSignal.any([
    editor.signal,
    ...[
      editor.plugins.signal('uploader', uploader.id),
    ].filter((value): value is AbortSignal => !!value),
    ...(options.signal
      ? [options.signal]
      : []),
  ])
  signal.throwIfAborted()
  editor.authorize('asset.read', editor.plugins.owner('uploader', uploader.id))
  const result = await abortable(uploader.upload(file, { dir: options.dir, onProgress: options.onProgress, signal }), signal)
  signal.throwIfAborted()
  assertTarget(editor, target)
  if (editor.plugins.getUploader(uploader.id) !== uploader)
    throw new Error('Uploader was removed or replaced')
  const props = {
    ...result.props,
    ...(result.name
      ? { name: result.name }
      : {}),
    ...(result.mime
      ? { mime: result.mime }
      : {}),
    ...(result.size !== undefined
      ? { size: result.size }
      : {}),
  }
  if (target.blockId) {
    const block = editor.getBlock(target.blockId)!
    editor.update(block.id, {
      text: result.url,
      props: {
        ...block.props,
        ...props,
      },
    })
  }
  else {
    editor.insert(editor.blocks.length, createBlock(kind, result.url, { props }))
  }
  return result
}

/** Reject promptly on cancellation even when a provider ignores AbortSignal. Late settlement is observed and discarded. */
export function abortable<T>(task: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    Promise.resolve(task).catch(() => {})
    return Promise.reject(signal.reason)
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort)
      reject(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve(task).then(
      (value) => {
        signal.removeEventListener('abort', abort)
        if (!signal.aborted)
          resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      },
    )
  })
}

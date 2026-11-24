/** View coordinates stay local to this workbench and never enter document history. */
export function mountViewport(stage: HTMLElement, canvas: HTMLCanvasElement, controls: HTMLElement) {
  let scale = 1
  let autoFit = true
  let offsetX = 0
  let offsetY = 0
  let hand = false
  let pan: { id: number, x: number, y: number } | undefined
  function button(text: string, title: string, run: () => void) {
    const el = document.createElement('button')
    el.type = 'button'
    el.textContent = text
    el.title = title
    el.setAttribute('aria-label', title)
    el.onclick = run
    controls.append(el)
    return el
  }
  const handButton = button('平移', '平移画布', () => {
    hand = !hand
    stage.dataset.hand = String(hand)
    handButton.setAttribute('aria-pressed', String(hand))
  })
  handButton.setAttribute('aria-pressed', 'false')
  button('−', '缩小', () => zoom(scale / 1.25))
  const percent = document.createElement('span')
  controls.append(percent)
  button('+', '放大', () => zoom(scale * 1.25))
  button('适应窗口', '适应窗口', fit)
  function layout() {
    if (autoFit)
      scale = Math.max(0.001, Math.min((stage.clientWidth - 48) / canvas.width, (stage.clientHeight - 48) / canvas.height, 1))
    canvas.style.width = `${canvas.width * scale}px`
    canvas.style.height = `${canvas.height * scale}px`
    canvas.style.left = `calc(50% + ${offsetX}px)`
    canvas.style.top = `calc(50% + ${offsetY}px)`
    percent.textContent = `${Math.round(scale * 100)}%`
  }
  function zoom(value: number) {
    autoFit = false
    const next = Math.min(8, Math.max(0.001, value))
    offsetX *= next / scale
    offsetY *= next / scale
    scale = next
    layout()
  }
  function fit() {
    autoFit = true
    offsetX = offsetY = 0
    layout()
  }
  stage.addEventListener('pointerdown', (event) => {
    if (pan || !(event.button === 1 || (hand && event.button === 0)))
      return
    event.preventDefault()
    event.stopPropagation()
    pan = { id: event.pointerId, x: event.clientX - offsetX, y: event.clientY - offsetY }
    stage.setPointerCapture(event.pointerId)
  }, true)
  stage.onpointermove = (event) => {
    if (pan?.id !== event.pointerId) return
    offsetX = event.clientX - pan.x
    offsetY = event.clientY - pan.y
    layout()
  }
  stage.onlostpointercapture = () => { pan = undefined }
  const observer = new ResizeObserver(layout)
  observer.observe(stage)
  return { layout, destroy: () => observer.disconnect() }
}

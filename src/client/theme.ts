/**
 * The chat's theme, as a widget frame's variables.
 *
 * The frame cannot read the page's styles, so the page reads its own theme
 * tokens where the widget stands and sends their computed values under the short
 * names the frame's stylesheet and the model use. A change of theme on the page
 * is sent again.
 * @module dsh-intelligent-ui/client/theme
 */

/** Frame variable and the host token it takes its value from. */
const TOKENS: ReadonlyArray<readonly [string, string]> = [
  ['--text-primary', '--dsw-alias-label-primary'],
  ['--text-secondary', '--dsw-alias-label-secondary'],
  ['--text-muted', '--dsw-alias-label-tertiary'],
  ['--surface-0', '--dsw-alias-bg-base'],
  ['--surface-1', '--dsw-alias-markdown-code-block'],
  ['--surface-2', '--dsw-alias-bg-layer-1'],
  ['--border', '--dsw-alias-border-l2'],
  ['--border-strong', '--dsw-alias-border-l4'],
  ['--hover', '--dsw-alias-interactive-bg-hover'],
  ['--active', '--dsw-alias-interactive-bg-active'],
  ['--accent', '--dsw-alias-link'],
  ['--success', '--dsw-alias-state-success-primary'],
  ['--warning', '--dsw-alias-state-warn-primary'],
  ['--danger', '--dsw-alias-state-error-primary'],
  ['--text-warning', '--dsw-alias-state-warn-label'],
  ['--primary-fill', '--dsw-alias-button-primary-fill'],
  ['--on-primary', '--dsw-alias-label-primary-foreground'],
  ['--radius', '--dsw-radius-sm'],
  ['--radius-lg', '--dsw-radius-md'],
  ['--font-sans', '--dsw-font-family'],
]

/** The theme a frame is sent. */
export interface FrameTheme {
  vars: Record<string, string>
  dark: boolean
  lang: string
}

/**
 * Read the theme where a widget stands.
 * @param element - an element in the reply, which inherits the chat's tokens.
 * @returns the frame variables, whether the chat is dark, and the page's language.
 */
export function readTheme(element: Element): FrameTheme {
  const view = element.ownerDocument.defaultView
  const style = view?.getComputedStyle(element)
  const vars: Record<string, string> = {}
  for (const [name, token] of TOKENS) {
    const value = style?.getPropertyValue(token).trim() ?? ''
    if (value !== '') vars[name] = value
  }
  const fontSize = style?.fontSize ?? ''
  if (/^\d+(?:\.\d+)?px$/u.test(fontSize)) vars['--font-size'] = fontSize
  const body = element.ownerDocument.body
  const dark = body?.hasAttribute('data-ds-dark-theme') === true || (vars['--text-primary'] !== undefined && isLight(vars['--text-primary']))
  return { vars, dark, lang: element.ownerDocument.documentElement.lang }
}

/** Whether a colour is light, which a dark theme's text colour is. */
function isLight(colour: string): boolean {
  const match = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/u.exec(colour)
  if (match === null) return false
  const [red, green, blue] = [Number(match[1]), Number(match[2]), Number(match[3])]
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue > 140
}

/**
 * Watch the page for a change of theme.
 * @param element - an element in the reply.
 * @param changed - called with the new theme when it changes.
 * @returns the cleanup that stops watching.
 */
export function watchTheme(element: Element, changed: (theme: FrameTheme) => void): () => void {
  const doc = element.ownerDocument
  const view = doc.defaultView
  let last = JSON.stringify(readTheme(element))
  const check = (): void => {
    const theme = readTheme(element)
    const text = JSON.stringify(theme)
    if (text === last) return
    last = text
    changed(theme)
  }
  const cleanups: Array<() => void> = []
  if (view !== null && typeof view.MutationObserver === 'function') {
    const observer = new view.MutationObserver(check)
    for (const target of [doc.documentElement, doc.body]) {
      if (target !== null) observer.observe(target, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'class', 'style', 'lang'] })
    }
    cleanups.push(() => { observer.disconnect() })
  }
  const media = typeof view?.matchMedia === 'function' ? view.matchMedia('(prefers-color-scheme: dark)') : undefined
  if (media !== undefined && typeof media.addEventListener === 'function') {
    media.addEventListener('change', check)
    cleanups.push(() => { media.removeEventListener('change', check) })
  }
  return () => { for (const cleanup of cleanups) cleanup() }
}

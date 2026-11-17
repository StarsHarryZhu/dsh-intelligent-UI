/**
 * The page clipboard, where the page allows it.
 *
 * Where a widget's message goes when the composer cannot take it: the reader
 * then has it to paste.
 * @module dsh-intelligent-ui/client/clipboard
 */

/**
 * Put text on the clipboard where the page allows it.
 * @param text - the text to copy.
 * @returns whether the clipboard accepted it; false on a page without one.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    const clipboard = (globalThis as { navigator?: { clipboard?: { writeText?: (value: string) => Promise<void> } } }).navigator?.clipboard
    if (typeof clipboard?.writeText !== 'function') return false
    await clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

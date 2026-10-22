/**
 * The page clipboard, where the page allows it.
 *
 * Shared by the button fallback in the card and the code block's copy button;
 * a module of its own so neither imports the other.
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

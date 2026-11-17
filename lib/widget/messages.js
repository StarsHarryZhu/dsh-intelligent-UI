/**
 * The messages between a widget frame and the page that holds it.
 *
 * The page sends the theme, the widget's source as it streams, its saved
 * values, and the shipped libraries it names. The frame sends its height, what
 * the widget asks the page to do, and what went wrong. Every message carries
 * the {@link CHANNEL} mark, so neither side mistakes another script's message
 * for one of these. The page trusts nothing the frame sends: the widget's code
 * runs in the same frame and can post anything, so the page checks every
 * message against these shapes and its own limits.
 * @module dsh-intelligent-ui/widget/messages
 */
/** The mark every message of this protocol carries. */
export const CHANNEL = 'dsh-intelligent-ui';
/** The keys that scroll, as the chat counts them. */
export const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
/** Least time between two scroll inputs a frame reports, in milliseconds. */
export const SCROLL_INTERVAL_MS = 50;

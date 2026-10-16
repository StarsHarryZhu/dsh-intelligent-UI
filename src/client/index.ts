/**
 * Intelligent UI browser half.
 *
 * Contributes, all under this plugin's own names: the `ui_render` tool row, one
 * turn-tail entry that keeps finished cards under their reply, one data-only
 * Conversation Definition that collects a turn's cards, the card copy, and one
 * stylesheet. Every contribution is an effect of this plugin's context, so
 * unloading the plugin removes all of them and nothing else.
 *
 * `apply` takes the context only. Cordis passes the entry's config as a second
 * argument, which for a page entry is `undefined`; React comes from the module
 * table through `require('react')`, never from a parameter. A failure in one
 * contribution is logged and skipped, because a throw here would mark the whole
 * page's boot as failed.
 * @module dsh-intelligent-ui/client
 */

import { LOCALE_NS, PLUGIN_ID, TOOL_VIEW_SLOT, TURN_TAIL_SLOT, UI_TOOL_NAME } from '../lang/identity.ts'
import { createEditsStore } from './edits.ts'
import type { ClientContextLike, LocaleLike, SlotsLike, UiConversationLike } from './host.ts'
import { en, zh } from './locales.ts'
import css from './styles.css'
import { createTail } from './tail.tsx'
import { createToolView } from './toolview.tsx'
import { turnDataDefinition } from './turn-data.ts'

export const name = PLUGIN_ID

/** Required services. `uiConversation` is optional and waited for separately. */
export const inject = ['slots', 'locale']

/**
 * Position among the turn-tail features. Delivered files and plans use the
 * default 0 and scheduled tasks 20; a card is part of the answer itself, so it
 * comes first, directly under the reply.
 */
const TAIL_ORDER = -10

/**
 * Register the browser contributions.
 * @param ctx - the plugin's client context.
 */
export function apply(ctx: ClientContextLike): void {
  const slots = ctx.get?.('slots') as SlotsLike | undefined
  const locale = ctx.get?.('locale') as LocaleLike | undefined
  if (slots === undefined) {
    console.error(`${PLUGIN_ID}: the slots service is missing, so no card can render`)
    return
  }
  const store = createEditsStore()
  const ToolView = createToolView(store)
  const Tail = createTail(store)

  guard('dictionaries', () => {
    if (locale !== undefined) ctx.effect?.(() => locale.register(LOCALE_NS, { zh, en }), `${PLUGIN_ID}: dictionaries`)
  })
  guard('styles', () => {
    ctx.effect?.(() => mountStyles(css), `${PLUGIN_ID}: styles`)
  })
  guard('tool row', () => {
    slots.inject(TOOL_VIEW_SLOT, () => slots.register(
      { name: TOOL_VIEW_SLOT, key: UI_TOOL_NAME, locale: LOCALE_NS },
      ToolView,
    ))
  })
  guard('turn data', () => {
    ctx.inject?.(['uiConversation'], (scope) => {
      const conversation = scope.get?.('uiConversation') as UiConversationLike | undefined
      const scopedSlots = (scope.get?.('slots') as SlotsLike | undefined) ?? slots
      guard('turn data definition', () => {
        if (conversation !== undefined) scope.effect?.(() => conversation.events.register(turnDataDefinition), `${PLUGIN_ID}: turn data`)
      })
      guard('turn tail', () => {
        scopedSlots.inject(TURN_TAIL_SLOT, () => scopedSlots.register(
          { name: TURN_TAIL_SLOT, id: PLUGIN_ID, order: TAIL_ORDER, locale: LOCALE_NS },
          Tail,
        ))
      })
    })
  })
}

/** Run one contribution, logging instead of throwing. */
function guard(label: string, run: () => void): void {
  try {
    run()
  } catch (error) {
    console.error(`${PLUGIN_ID}: the ${label} could not be registered`, error)
  }
}

/**
 * Add the plugin's stylesheet, tagged with the plugin id.
 * @param text - the stylesheet.
 * @returns the cleanup that removes it.
 */
function mountStyles(text: string): () => void {
  if (typeof document === 'undefined') return () => undefined
  const style = document.createElement('style')
  style.setAttribute('data-plugin', PLUGIN_ID)
  style.setAttribute('data-plugin-css', `${PLUGIN_ID}/styles.css`)
  style.textContent = text
  document.head.appendChild(style)
  return () => { style.remove() }
}

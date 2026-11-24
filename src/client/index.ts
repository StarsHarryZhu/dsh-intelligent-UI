/**
 * Intelligent UI browser half.
 *
 * Contributes, all under this plugin's own names: the `ui_render` tool row; one
 * Chat node renderer and the Conversation Definition that builds its nodes, so
 * each widget stands in the reply where the model called the tool; one
 * data-only Conversation Definition that collects a turn's cards; the chrome
 * copy; and one stylesheet. Widgets themselves run in sandboxed frames, which
 * add nothing to the page. Every contribution is an effect of this plugin's context, so
 * unloading the plugin removes all of them and nothing else.
 *
 * `apply` takes the context only. Cordis passes the entry's config as a second
 * argument, which for a page entry is `undefined`; React comes from the module
 * table through `require('react')`, never from a parameter. A failure in one
 * contribution is logged and skipped, because a throw here would mark the whole
 * page's boot as failed.
 * @module dsh-intelligent-ui/client
 */

import frameCss from '../frame/base.css'
import frameRuntime from '../frame/main.runtime'
import { CARD_NODE_KIND, CHAT_NODE_SLOT, LOCALE_NS, PLUGIN_ID, TOOL_VIEW_SLOT, UI_TOOL_NAME } from '../widget/identity.ts'
import { framePolicy } from '../widget/policy.ts'
import { cardNodeDefinition } from './card-node.ts'
import { loadChunk } from './chunks.ts'
import { createEditsStore } from './edits.ts'
import type { ClientContextLike, ConversationSendLike, LocaleLike, SessionsLike, SlotsLike, UiConversationLike } from './host.ts'
import { createLibraryLoader } from './libraries.ts'
import { en, zh } from './locales.ts'
import { createCardNodeView } from './node-view.tsx'
import { createPresence } from './presence.ts'
import css from './styles.css'
import { createToolView } from './toolview.tsx'
import { turnDataDefinition } from './turn-data.ts'
import type { MessageSender, WidgetEnv } from './widget.tsx'

export const name = PLUGIN_ID

/**
 * Required services. `uiConversation` is optional and waited for separately;
 * `sessions` is read when a widget sends a message.
 */
export const inject = ['slots', 'locale']

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
  const env: WidgetEnv = {
    store: createEditsStore(),
    presence: createPresence(),
    parts: { runtime: frameRuntime, css: frameCss, policy: framePolicy() },
    loadLibraries: createLibraryLoader(loadChunk),
    sendMessage: sessionSender(ctx),
  }
  const ToolView = createToolView(env)
  const CardNodeView = createCardNodeView(env)

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
      guard('cards in the reply', () => {
        if (conversation === undefined) return
        // The renderer and the Definition come and go together: a node of a kind
        // nobody draws would show as the host's raw-data fallback.
        scopedSlots.inject(CHAT_NODE_SLOT, () => {
          const unregister = scopedSlots.register(
            { name: CHAT_NODE_SLOT, key: CARD_NODE_KIND, locale: LOCALE_NS },
            CardNodeView,
          )
          let undefine: () => void
          try {
            undefine = conversation.events.register(cardNodeDefinition)
          } catch (error) {
            unregister()
            throw error
          }
          return () => {
            undefine()
            unregister()
          }
        })
      })
    })
  })
}

/**
 * Send a widget's message through the session's own conversation service, the
 * way the host's panels prompt a session: one text message, queued behind a
 * running turn, with the composer and its draft left alone.
 * @param ctx - the plugin's client context.
 * @returns the sender every widget uses.
 */
function sessionSender(ctx: ClientContextLike): MessageSender {
  return (sessionId, text) => {
    if (sessionId === undefined || sessionId === '') return undefined
    const sessions = ctx.get?.('sessions') as SessionsLike | undefined
    const conversation = sessions?.scope(sessionId)?.get?.('conversation') as Partial<ConversationSendLike> | undefined
    if (typeof conversation?.send !== 'function') return undefined
    return conversation.send(text)
  }
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

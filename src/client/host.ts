/**
 * The slice of the host's slot props this plugin reads, as structural types.
 *
 * The browser half imports no harness package, not even for types: the published
 * plugin contract is the props a slot passes and the services a context holds.
 * Every field is optional because a persisted call, an older host, or a different
 * composition may leave any of them out, and the views must degrade, not throw.
 * @module dsh-intelligent-ui/client/host
 */

/** The lazy argument reader every tool-call stage carries (`PartialArguments`). */
export interface ArgsReaderLike {
  /** A string argument's decoded text so far, including a streaming prefix. */
  text?(key: string): string | undefined
}

/** One tool-call block at any stage: preparing, started, or settled. */
export interface ToolBlockLike {
  /** `tool-result` once settled. */
  kind?: string
  callId?: string
  /** Unix epoch ms of the stage's event. */
  time?: number
  args?: ArgsReaderLike
  /** Complete arguments of a started call. */
  argsRaw?: string
  /** Call head of a settled result; null when the call left the loaded window. */
  call?: { argsRaw?: string } | null
  content?: readonly unknown[]
  isError?: boolean
  error?: { name?: string; code?: string; reason?: string }
  meta?: unknown
}

/** The session input actions every session-scope slot component receives. */
export interface InputActionsLike {
  setDraft?(text: string): void
  submit?(): void
}

/** The fields of the session input state this plugin reads. */
export interface InputStateLike {
  draft?: string
  phase?: string
}

/** A selector hook over one snapshot. */
export type SelectorHook<T> = <S>(selector: (state: T) => S, equal?: (a: S, b: S) => boolean) => S

/** The host's per-row disclosure hook: collapsed by default, reset when its turn folds. */
export interface DisclosureLike {
  expanded: boolean
  setExpanded(open: boolean): void
  toggle(): void
}

/** The locale seat bound to this plugin's namespace. */
export type Translate = (key: string, params?: Record<string, unknown>) => string

/** Standard props every session-scope slot component receives. */
export interface SessionKit {
  sessionId?: string
  inputActions?: InputActionsLike
  useInput?: SelectorHook<InputStateLike | undefined>
  t?: Translate
}

/** Props of the keyed `tool.call.toolview` cell. */
export interface ToolViewProps extends SessionKit {
  phase?: 'preparing' | 'start' | 'result'
  block?: ToolBlockLike
  callId?: string
  useDisclosure?: () => DisclosureLike
  inspect?: () => void
}

/** An observable value source. */
export interface SourceLike<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

/** Props of one `conversation.chat.turnTail` entry. */
export interface TurnTailProps extends SessionKit {
  turn?: {
    turn?: number
    end?: { data?: { reason?: { kind?: string } } }
    data?: {
      get?(key: string): unknown
      source?(key: string): SourceLike<unknown>
    }
  }
  /** Sequence of the closing reply; cards recorded before it belong to this tail. */
  seq?: number
}

/** The context services the browser half uses. */
export interface ClientContextLike {
  get?(name: string): unknown
  effect?(execute: () => (() => void) | void, label?: string): unknown
  inject?(deps: string[], callback: (scope: ClientContextLike) => void): unknown
}

/** The slot registry service. */
export interface SlotsLike {
  inject(name: string, callback: () => (() => void) | void): unknown
  register(options: Record<string, unknown>, component: unknown): () => void
}

/** The locale service. */
export interface LocaleLike {
  register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void
}

/** The conversation assembly service, reduced to its Definition registry. */
export interface UiConversationLike {
  events: { register(definition: unknown): () => void }
}

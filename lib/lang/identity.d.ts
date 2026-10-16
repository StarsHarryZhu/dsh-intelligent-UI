/**
 * Wire identity shared by both halves.
 *
 * Every name the plugin registers under lives here, so the host, the browser, and
 * the isolation tests agree on one list. The file imports nothing at all, which is
 * what makes it safe on both sides of the boundary: the browser half cannot reach
 * a module that imports harness packages.
 * @module dsh-intelligent-ui/lang/identity
 */
/** Package name: the cordis row id, the client module id, and the `__ModuleLoader__` key. */
export declare const PLUGIN_ID = "dsh-intelligent-ui";
/** Wire tool name. Also the `tool.call.toolview` registration key. */
export declare const UI_TOOL_NAME = "ui_render";
/** Keyed slot that dispatches one atomic tool call to its registered view. */
export declare const TOOL_VIEW_SLOT = "tool.call.toolview";
/** List slot rendered under a finished turn's reply, before its action row. */
export declare const TURN_TAIL_SLOT = "conversation.chat.turnTail";
/** Conversation Definition kind and the Turn data key it publishes. */
export declare const TURN_DATA_KEY = "dsh-intelligent-ui";
/** Locale namespace of the card chrome. */
export declare const LOCALE_NS = "dsh-intelligent-ui";
/**
 * Version of the compiled program format, carried in the program's `version`
 * field. A client renders every version up to its own; a program records the
 * lowest version that can draw it.
 */
export declare const PROGRAM_VERSION = 1;
/** Version of the persisted `tool/result.meta` envelope, carried in its `version` field. */
export declare const UI_META_VERSION = 1;

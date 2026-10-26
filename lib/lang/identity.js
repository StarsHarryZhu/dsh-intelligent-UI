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
export const PLUGIN_ID = 'dsh-intelligent-ui';
/** Wire tool name. Also the `tool.call.toolview` registration key. */
export const UI_TOOL_NAME = 'ui_render';
/** Keyed slot that dispatches one atomic tool call to its registered view. */
export const TOOL_VIEW_SLOT = 'tool.call.toolview';
/** List slot rendered under a finished turn's reply, before its action row. */
export const TURN_TAIL_SLOT = 'conversation.chat.turnTail';
/** Conversation Definition kind and the Turn data key it publishes. */
export const TURN_DATA_KEY = PLUGIN_ID;
/** Locale namespace of the card chrome. */
export const LOCALE_NS = PLUGIN_ID;
/**
 * The API version: the `version` field of every compiled program and of the
 * persisted `tool/result.meta` envelope. A client draws what carries a version
 * it knows and shows the text of anything else. The plugin's release version is
 * the package's and the tag's, kept by the maintainer, and is independent of it.
 */
export const API_VERSION = 1;
/**
 * Shape of a card id: the host's call id of a `ui_render` result, which the
 * model passes back as `revises` to change that card. Checked on both halves,
 * because the browser also reads `revises` from a call's streaming arguments.
 */
export const CARD_ID_PATTERN = /^[\w:.-]{1,128}$/u;

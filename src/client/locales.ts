/**
 * Copy for the widget chrome. Model-authored content is shown as written; only
 * the status line and the notes around a widget come from here.
 * @module dsh-intelligent-ui/client/locales
 */

import type { Translate } from './host.ts'

/** Simplified Chinese, the key-set source of truth. */
export const zh = {
  'card.label': '交互界面',
  'card.revised': '这个界面已被后文的新版本替换。',
  'card.showOld': '显示旧版本',
  'card.hideOld': '收起旧版本',
  'card.legacy': '这张卡片来自旧版插件，现在只显示它的文字版本。',
  'row.preparing': '正在生成界面…',
  'row.ready': '已显示 · {lines} 行',
  'row.legacy': '旧版卡片 · 文字版本',
  'row.failed': '界面未通过检查',
  'row.error': '调用失败',
  'row.stopped': '已中止',
  'row.replaced': '已被新版本替换',
  'row.show': '展开界面',
  'row.hide': '收起界面',
  'row.inspect': '查看调用',
  'frame.title': '交互界面',
  'frame.left': '这个界面试图离开自己的框架，已停止显示。',
  'send.blocked': '界面在你没有点击时试图发送消息，已拦下。',
  'open.blocked': '界面在你没有点击时试图打开链接，已拦下。',
  'send.copied': '输入框里有未发送的内容，已改为复制到剪贴板',
  'send.unavailable': '当前无法发送，已复制到剪贴板',
  'send.copyFailed': '无法写入剪贴板，请手动复制：',
  'error.title': '这个界面运行时出错：',
  'error.fix': '让模型修复',
  'error.request': '刚才的界面（卡片 {card}）运行时出错：\n{errors}\n请用 revises={card} 修好它。',
} satisfies Record<string, string>

/** Every key the chrome uses. */
export type CopyKey = keyof typeof zh

/** English, checked complete against the Chinese key set. */
export const en = {
  'card.label': 'Interactive',
  'card.revised': 'A newer version below replaced this widget.',
  'card.showOld': 'Show the old version',
  'card.hideOld': 'Hide the old version',
  'card.legacy': 'This card comes from an earlier version of the plugin; only its text version is shown.',
  'row.preparing': 'Building the widget…',
  'row.ready': 'Shown · {lines} lines',
  'row.legacy': 'Earlier card · text version',
  'row.failed': 'The widget did not pass the check',
  'row.error': 'The call failed',
  'row.stopped': 'Stopped',
  'row.replaced': 'Replaced by a newer version',
  'row.show': 'Show widget',
  'row.hide': 'Hide widget',
  'row.inspect': 'Inspect call',
  'frame.title': 'Interactive widget',
  'frame.left': 'This widget tried to leave its frame, so it is no longer shown.',
  'send.blocked': 'The widget tried to send a message without your click, so it was stopped.',
  'open.blocked': 'The widget tried to open a link without your click, so it was stopped.',
  'send.copied': 'The composer has unsent text, so this was copied to the clipboard instead',
  'send.unavailable': 'Sending is unavailable here, so this was copied to the clipboard',
  'send.copyFailed': 'The clipboard is unavailable; copy this by hand:',
  'error.title': 'This widget hit errors:',
  'error.fix': 'Ask to fix',
  'error.request': 'The widget just shown (card {card}) hit errors:\n{errors}\nPlease fix it with revises={card}.',
} satisfies Record<CopyKey, string>

/**
 * Bind the host's translator, falling back to English when the namespace is not
 * registered (the host then echoes the key) or no locale seat exists.
 * @param t - the slot's `t` seat, when present.
 * @returns a translator that always produces copy.
 */
export function translator(t: Translate | undefined): (key: CopyKey, params?: Record<string, unknown>) => string {
  return (key, params) => {
    const hosted = t?.(key, params)
    if (typeof hosted === 'string' && hosted !== '' && hosted !== key) return hosted
    return fill(en[key], params)
  }
}

/** Replace `{name}` params in one template. */
function fill(template: string, params: Record<string, unknown> | undefined): string {
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/gu, (whole, name: string) => (Object.hasOwn(params, name) ? String(params[name]) : whole))
}

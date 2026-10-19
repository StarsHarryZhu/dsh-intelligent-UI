/**
 * Copy for the card chrome. Model-authored content is shown as written; only
 * the frame, the status line, and the notes come from here.
 * @module dsh-intelligent-ui/client/locales
 */

import type { Translate } from './host.ts'

/** Simplified Chinese, the key-set source of truth. */
export const zh = {
  'card.label': '交互界面',
  'card.local': '调整控件只在本地重算，不会发消息给模型。',
  'card.newer': '这个界面来自另一个版本的插件，下面是它的文字版本。',
  'card.crashed': '这个界面无法显示，下面是它的文字版本。',
  'card.partial': '有 {count} 个组件无法显示。',
  'row.preparing': '正在生成界面…',
  'row.ready': '{components} 个组件 · {controls} 个控件',
  'row.failed': '界面未能编译',
  'row.error': '调用失败',
  'row.stopped': '已中止',
  'row.show': '展开界面',
  'row.hide': '收起界面',
  'row.inspect': '查看调用',
  'button.sends': '点击后发送：{text}',
  'button.sent': '已发送',
  'button.copied': '输入框里有未发送的内容，已改为复制到剪贴板',
  'button.unavailable': '当前无法发送，已复制到剪贴板',
  'button.copyFailed': '无法写入剪贴板，请手动复制：',
  'player.play': '播放',
  'player.pause': '暂停',
  'player.prev': '上一步',
  'player.next': '下一步',
  'player.speed': '播放速度 {speed}×，点击切换',
  'checklist.done': '已完成 {done}/{total}',
  'table.sort': '按此列排序',
  'diagram.label': '流程图',
} satisfies Record<string, string>

/** Every key the chrome uses. */
export type CopyKey = keyof typeof zh

/** English, checked complete against the Chinese key set. */
export const en = {
  'card.label': 'Interactive',
  'card.local': 'Changing the controls recomputes here; nothing is sent to the model.',
  'card.newer': 'This interface comes from another version of the plugin; here is its text version.',
  'card.crashed': 'This interface could not be shown; here is its text version.',
  'card.partial': '{count} component(s) could not be shown.',
  'row.preparing': 'Building the interface…',
  'row.ready': '{components} components · {controls} controls',
  'row.failed': 'The interface did not compile',
  'row.error': 'The call failed',
  'row.stopped': 'Stopped',
  'row.show': 'Show interface',
  'row.hide': 'Hide interface',
  'row.inspect': 'Inspect call',
  'button.sends': 'Sends: {text}',
  'button.sent': 'Sent',
  'button.copied': 'The composer has unsent text, so this was copied to the clipboard instead',
  'button.unavailable': 'Sending is unavailable here, so this was copied to the clipboard',
  'button.copyFailed': 'The clipboard is unavailable; copy this by hand:',
  'player.play': 'Play',
  'player.pause': 'Pause',
  'player.prev': 'Step back',
  'player.next': 'Step forward',
  'player.speed': 'Speed {speed}×; click to change',
  'checklist.done': '{done} of {total} done',
  'table.sort': 'Sort by this column',
  'diagram.label': 'Diagram',
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

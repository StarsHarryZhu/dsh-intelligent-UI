/**
 * Copy for the card chrome. Model-authored content is shown as written; only
 * the frame, the status line, and the notes come from here.
 * @module dsh-intelligent-ui/client/locales
 */

import type { Translate } from './host.ts'

/** Simplified Chinese, the key-set source of truth. */
export const zh = {
  'card.label': '交互界面',
  'card.local': '调整控件只在本地重算，不会发消息给模型；改动保存在这个浏览器里。',
  'card.revised': '这张卡片已有新版本，见后文。',
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
  'table.filter': '筛选行',
  'table.count': '{shown} / {total} 行',
  'table.none': '没有匹配的行',
  'table.page': '第 {page} / {pages} 页',
  'table.prev': '上一页',
  'table.next': '下一页',
  'table.copyCsv': '复制 CSV',
  'table.copyMarkdown': '复制 Markdown',
  'table.copied': '已复制',
  'table.copyFailed': '无法复制',
  'chart.label': '图表',
  'chart.toggle': '显示或隐藏“{name}”',
  'diagram.label': '流程图',
  'code.label': '代码',
  'code.copy': '复制',
  'code.copied': '已复制',
  'code.copyFailed': '无法复制',
} satisfies Record<string, string>

/** Every key the chrome uses. */
export type CopyKey = keyof typeof zh

/** English, checked complete against the Chinese key set. */
export const en = {
  'card.label': 'Interactive',
  'card.local': 'Changing the controls recomputes here; nothing is sent to the model, and this browser keeps your changes.',
  'card.revised': 'A newer version of this card follows.',
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
  'table.filter': 'Filter rows',
  'table.count': '{shown} of {total} rows',
  'table.none': 'No rows match',
  'table.page': 'Page {page} of {pages}',
  'table.prev': 'Previous page',
  'table.next': 'Next page',
  'table.copyCsv': 'Copy CSV',
  'table.copyMarkdown': 'Copy Markdown',
  'table.copied': 'Copied',
  'table.copyFailed': 'Copy failed',
  'chart.label': 'Chart',
  'chart.toggle': 'Show or hide “{name}”',
  'diagram.label': 'Diagram',
  'code.label': 'Code',
  'code.copy': 'Copy',
  'code.copied': 'Copied',
  'code.copyFailed': 'Copy failed',
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

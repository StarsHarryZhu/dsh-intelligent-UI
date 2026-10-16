# The catalog, one sample per component

A live tour of all twenty-four components: one card each, drawn in a real chat, in the order of `src/lang/catalog.ts`.

Every block below is the exact `source` that was passed to `ui_render` and the exact result it reported, so this file doubles as a regression corpus — `tests/compile.test.ts` can compile any of them.

## Reading this file

The component count in a result includes the root `card`, so `4 component(s)` means the card plus three children.

A result that lists `Repaired or ignored` is a finding, not a typing mistake: the compiler dropped something and said so. Two such findings are recorded at the end.

## 1. `card`

The framed root. Usually the only root; `padding` and `gap` are 4px steps and an optional `title` heads the panel.

```dil
card "card · 唯一的根容器" padding=4 gap=3
  title "自带标题的框架面板"
  text "padding=4 → 16px，gap=3 → 12px，全部落在 4px 栅格上。"
  text "tone 可换 primary / secondary / muted / success / warn / error。" tone="muted"
```

4 components.

## 2. `col`

Vertical stack in reading order. Nestable, and the default parent when a card holds several things.

```dil
card "col · 垂直堆叠"
  col gap=3
    text "第一行：按阅读顺序自上而下。"
    text "第二行：gap 决定行距。"
    text "第三行：col 可以任意嵌套。" tone="muted"
```

5 components.

## 3. `row`

Side-by-side equal-width cells that wrap on a narrow screen. `align` is `start`, `center`, or `end`.

```dil
card "row · 等宽并排"
  row gap=2 align=center
    text "左" tone="primary"
    text "中" tone="muted"
    text "右" tone="primary"
  text "三格等宽，窄屏会自动折行；align 控制垂直对齐。" tone="muted" size="sm"
```

6 components.

## 4. `grid`

An even grid, `columns` from 1 to 4; the natural home for a row of metrics.

```dil
card "grid · 等宽网格"
  grid columns=3 gap=2
    metric "延迟" value=42 unit="ms"
    metric "吞吐" value=1800 unit="rps"
    metric "错误率" value=0 unit="%"
  text "columns 取 1–4，最适合摆一排指标。" tone="muted" size="sm"
```

6 components.

## 5. `title`

A headline line. `size` is `xs`, `sm`, `md`, `lg`, or `xl`.

```dil
card "title · 标题行"
  title "xl 号标题" size="xl"
  title "lg 号标题（默认）"
  text "size 取 xs · sm · md · lg · xl，共五档。" tone="muted" size="sm"
```

4 components.

## 6. `text`

A sentence or short paragraph; the only component whose primary prop is also interpolated freely.

```dil
card "text · 正文句子"
  text "默认字号的正文。"
  text "muted + sm 的次要说明。" tone="muted" size="sm"
  text "success 语气的正文。" tone="success"
  text "{8 * 29} 也可以直接算出来插进句子。"
```

5 components.

## 7. `metric`

One prominent number with its caption. `value` is a numeric expression, so it recomputes without a request.

```dil
@state seats = 8 min=1 max=50
@calc monthly = seats * 29
card "metric · 头条数字"
  metric "每月费用" value=monthly unit="USD" tone="success"
  slider "席位数" bind=seats
  text "value 收一个数字表达式，拖动时原地重算，不发请求。" tone="muted" size="sm"
```

4 components, 1 control.

## 8. `progress`

A proportion bar; `max` is an expression too and defaults to 100.

```dil
@state done = 7
card "progress · 占比条"
  progress "已完成" value=done max=10 tone="primary"
  progress "预算占用" value=68 max=100 tone="warn"
  slider "已完成项" bind=done min=0 max=10
  text "value 与 max 都是表达式，省略 max 时按 100 计。" tone="muted" size="sm"
```

5 components, 1 control.

## 9. `slider`

A range control bound to a declared number state. `min`, `max`, and `step` all have defaults.

```dil
@state mins = 45
card "slider · 范围滑块（修正版）"
  slider "时长" bind=mins min=1 max=120 step=1 unit="分钟"
  metric "折合小时" value="mins / 60" unit="h"
  text "value 带空格的表达式要写引号或括号，裸写会在空格处断开。" tone="muted" size="sm"
```

4 components, 1 control. The first attempt at this card wrote `value=mins / 60` unquoted and was repaired; see the defects at the end.

## 10. `numberInput`

Exact number entry, and the right control when precision matters.

```dil
@state qty = 3 min=1 max=99
card "numberInput · 精确数字输入"
  numberInput "数量" bind=qty min=1 max=99 unit="件"
  text "精确到个位时用它，不要用滑块；共 {qty} 件。"
  text "min / max / step 都可省略。" tone="muted" size="sm"
```

4 components, 1 control.

## 11. `textInput`

A single-line text field for a string state.

```dil
@state who = "Ada"
card "textInput · 短文本输入"
  textInput "称呼" bind=who placeholder="你的名字"
  text "你好，{who}。"
  text "只收单行短文本，maxLength 由 limits 兜底。" tone="muted" size="sm"
```

4 components, 1 control.

## 12. `select`

A dropdown for a state declared with `options=`; the value is also its label.

```dil
@state plan = "Pro" options=Basic|Pro|Team
card "select · 下拉选择"
  select "套餐" bind=plan
  text "当前选择：{plan}"
  text "选项来自状态自己的 options= 声明，值即标签。" tone="muted" size="sm"
```

4 components, 1 control.

## 13. `checkbox`

The only two-valued control, bound to a boolean state.

```dil
@state rush = true
card "checkbox · 开关"
  checkbox "加急处理" bind=rush
  text "当前值：{rush}"
  text "绑定 true/false 状态；这是唯一的二值控件。" tone="muted" size="sm"
```

4 components, 1 control.

## 14. `table`

A comparison table. Every row must have one cell per column; `caption` is optional.

```dil
card "table · 对比表"
  table columns=["方案","单价","席位","包含"] rows=[["Basic","12 USD","1","单工作区"],["Pro","29 USD","10","无限工作区"],["Team","22 USD","50","SSO + 审计"]] caption="价格按月计算，年付再打八折。"
  text "每行单元格数必须等于列数，caption 可省略。" tone="muted" size="sm"
```

3 components.

## 15. `keys`

Label/value pairs for exact figures, written `"Label: value"`.

```dil
card "keys · 标签值对照"
  keys items=["时长: 45 分钟","报价: 232 USD","交付周期: 3 个工作日","付款方式: 年付"]
  text "写 \"标签: 值\"，适合摆一串确定的数字。" tone="muted" size="sm"
```

3 components.

## 16. `list`

A bulleted list. Interpolation works in each item.

```dil
card "list · 无序列表"
  list items=["确认范围与约束","锁定价格与周期","排期并通知相关方"]
  divider
  text "和 steps 的区别只在于有没有序号。" tone="muted" size="sm"
```

4 components.

## 17. `steps`

A numbered procedure the reader performs in order.

```dil
card "steps · 有序步骤"
  steps items=["打开插件管理","选择 dsh-intelligent-ui","确认启用并刷新页面"]
  text "读者要照着做的流程用它，带序号。" tone="muted" size="sm"
```

3 components.

## 18. `chart`

A bar or line chart as inline SVG. `shape` selects the form; each value may be an expression.

```dil
card "chart · 图表"
  chart shape="bar" labels=["一","二","三","四","五"] values=[12,19,7,24,15] unit="次" caption="shape=bar 柱状图"
  chart shape="line" labels=["一","二","三","四","五"] values=[12,19,7,24,15] unit="次" caption="shape=line 折线图"
  text "纯内联 SVG，values 里每一项都可以是表达式。" tone="muted" size="sm"
```

4 components.

## 19. `badge`

A one-word status label, in any of the five tones.

```dil
card "badge · 状态词"
  row gap=2
    badge "进行中" tone="primary"
    badge "已通过" tone="success"
    badge "待确认" tone="warn"
    badge "已阻塞" tone="error"
    badge "已归档" tone="muted"
  text "一个词的状态标签，五种 tone。" tone="muted" size="sm"
```

8 components.

## 20. `callout`

One emphasized remark: an assumption, a caveat, or a next step. The default tone is `secondary`.

```dil
card "callout · 强调提示"
  callout "这里是一个需要读者留意的假设。" tone="warn"
  callout "这里是一条普通补充。" tone="secondary"
  text "用于假设、限制、下一步；默认 tone 是 secondary。" tone="muted" size="sm"
```

4 components.

## 21. `divider`

A hairline separator, with no props at all.

```dil
card "divider · 分隔线"
  text "上半部分的内容。"
  divider
  text "下半部分的内容。"
  text "没有属性，一条与主题一致的发丝线。" tone="muted" size="sm"
```

5 components.

## 22. `image`

An inline raster. Only a `data:image/png`, `jpeg`, `gif`, or `webp` URL is accepted; `alt` is required.

```dil
card "image · 内联位图"
  image src="data:image/png;base64,iVBORw0KGgo…" alt="32×32 渐变样张" caption="只接受 data:image/png · jpeg · gif · webp；远程 URL 会被拒绝。"
  text "alt 必填，caption 可选。" tone="muted" size="sm"
```

3 components. The base64 above is elided for readability; the sample that was drawn is a 32×32 diagonal gradient PNG, 374 bytes.

## 23. `link`

A citation link, opened only when the reader clicks it. Only http and https are accepted.

```dil
card "link · 引用链接"
  link "How ChatGPT Intelligent UI works（Thesys 逆向拆解原文）" url="https://www.openui.com/blog/how-chatgpt-intelligent-ui-works"
  text "只接受 http/https，且只有读者点它才会打开。" tone="muted" size="sm"
```

3 components.

## 24. `button`

Turns a choice into the next message. The press sends `prompt` through the session composer and then locks the card.

```dil
card "button · 把选择变成下一条消息"
  text "按下去，它的 prompt 会作为你的消息发出去；发过一次后卡片锁定。"
  button "列出我这边全部组件" prompt="把 dsh-intelligent-ui 的 24 个组件按类别列一遍" tone="primary"
  button "再画一张组合样张" prompt="用 metric + chart + table + slider 组合画一张完整看板卡片"
```

4 components, 2 controls.

## What this tour found

Both findings are recorded as known defects in the root `AGENTS.md` and in `src/lang/AGENTS.md`.

**A bare `expr` value ends at the first space.** Sample 9 first read `metric "折合小时" value=mins / 60 unit="h"`, and the compiler kept `value=mins` while reporting `"/" is not attached to a prop` and `"60" is not attached to a prop` — two diagnostics that name the symptom and not the cause. The card still drew, showing `24 h` instead of `0.75 h`. Written `value="mins / 60"` or `value=(mins / 60)` it is correct, which is how the sample above is written. The fix is for the DIL reader to consume an `expr` value to end of line.

**Expressions are unevenly accepted across prop kinds.** `metric.value`, `progress.value`, `progress.max`, and every `chart.values` entry take an expression, and `{…}` interpolates inside `text`, `list`, and `table` cells — but an item in `keys.items` or a cell in `table.rows` is read as plain text, so a bare expression there is silently literal. The samples above therefore use literals or interpolation in those two components. The fix is to route both prop kinds through the same text-with-interpolation reader the list items already use.

## Status

All twenty-four cards were drawn in one live session on 2026-10-15, in the `ui_render` tool row, with the compiler reporting zero repairs except the first attempt at sample 9. Nothing here has been checked in the turn tail or across a page reload; those remain `VERIFY.md` steps.

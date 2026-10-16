# The catalog, one sample per component

A live tour of the catalog: one card per component, drawn in a real chat. Samples 1 to 24 were drawn on 2026-10-15 in the order the catalog had then; samples 25 and 26, the math components, and sample 27, the animation player, were written by the model itself on 2026-10-16.

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

## 25. `plot`

Curves of y = f(x) over a range, with an optional marked point, its tangent, and a shaded area under the first curve. Written by the model, unprompted beyond the request, after it loaded the skill:

```dil
@state a = 2 min=0 max=3 step=0.1
@calc area = integral(x^2, x, 0, a)
@calc slope = deriv(x^2, x, a)
@calc fx = a^2
card "∫₀ᵃ x² dx — 面积与切线"
  slider "积分上限 a" bind=a min=0 max=3 step=0.1
  row gap=4
    metric "涂色面积" value=area digits=6
    metric "切线斜率 f′(a)" value=slope digits=4
  formula "integral(x^2, x, 0, a)" label="∫₀ᵃ x² dx" digits=6
  plot fn="x^2" from=-0.4 to=3.4 ymin=-1 ymax=10 mark=a tangent=true shadeFrom=0 shadeTo=a
  text "当 a = {a} 时：f(a) = a² = {fx}，切线斜率 f′(a) = 2a = {slope}。"
  callout "精确值 ∫₀ᵃ x² dx = a³/3；涂色区域就是该积分，切点与切线随 a 一起移动。"
```

9 components, 1 control, zero repairs. At a = 2 it reads area 2.66667 and slope 4; at a = 3, 9 and 6.

## 26. `formula`

A typeset expression followed by its live value. Here with two curves, a Taylor polynomial whose degree a slider controls, and a limit:

```dil
@state n = 3 min=1 max=15 step=1
@calc err = taylor(sin(t), t, 0, n, 2) - sin(2)
@calc lim = limit(sin(x)/x, x, 0)
card "sin x 的泰勒逼近与 lim sin x / x"
  slider "阶数 n" bind=n min=1 max=15 step=1
  plot fn=["sin(x)", "taylor(sin(t), t, 0, n, x)"] from=-6 to=6 ymin=-2.5 ymax=2.5 labels=["sin x", "n 阶泰勒多项式"]
  row gap=4
    metric "x = 2 处误差" value=err digits=4
    metric "极限值" value=lim digits=6
  formula "limit(sin(x)/x, x, 0)" label="lim(x→0) sin x / x" digits=6
  text "n = {n} 时，n 阶泰勒多项式在 x = 2 处与 sin 2 相差 {fmt(err, 4)}。"
  callout "阶数越高，逼近的有效范围越宽；注意奇偶阶给出同一条曲线，因为偶次项系数为 0。"
```

Zero repairs. The error reads -0.2426 at degree 3 and -3.642e-10 at degree 15 in the metric, while the sentence, which uses `fmt(err, 4)`, rounds the second to -0.0000 — the reason the skill now steers tiny values to plain `{err}`.

## 27. `player`

An animation control. The reader asked for bubble sort on [4, 2, 3, 1] traced line by line, with play and pause, single steps, the running line highlighted, and i, j, and the array at every step. The model loaded the skill, read `recipes.md`, and wrote one frame state with every column of its trace as a `pick`; it also bound a bar chart to the array, so the bars reorder as the run plays. `steps … current=line mono=true` is the code listing.

```dil
@state frame = 1 min=1 max=24 step=1
@calc line = pick(frame, 1, 2, 3, 4, 2, 3, 4, 2, 3, 4, 2, 1, 2, 3, 2, 3, 4, 2, 1, 2, 3, 4, 2, 0)
@calc i = pick(frame, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2)
@calc j = pick(frame, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0)
@calc a = pick(frame, "4 2 3 1", "4 2 3 1", "4 2 3 1", "2 4 3 1", "2 4 3 1", "2 4 3 1", "2 3 4 1", "2 3 4 1", "2 3 4 1", "2 3 1 4", "2 3 1 4", "2 3 1 4", "2 3 1 4", "2 3 1 4", "2 3 1 4", "2 3 1 4", "2 1 3 4", "2 1 3 4", "2 1 3 4", "2 1 3 4", "2 1 3 4", "1 2 3 4", "1 2 3 4", "1 2 3 4")
@calc v0 = pick(frame, 4, 4, 4, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1)
@calc v1 = pick(frame, 2, 2, 2, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1, 1, 1, 1, 1, 2, 2, 2)
@calc v2 = pick(frame, 3, 3, 3, 3, 3, 3, 4, 4, 4, 1, 1, 1, 1, 1, 1, 1, 3, 3, 3, 3, 3, 3, 3, 3)
@calc v3 = pick(frame, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4)
@calc note = pick(frame, "第 1 轮：i = 0，进入外层循环", "j = 0，0 < 3，进入内层循环", "比较 a[0] = 4 与 a[1] = 2：4 > 2 成立", "交换 a[0] 与 a[1]：4 和 2 互换位置", "j = 1，1 < 3，继续内层循环", "比较 a[1] = 4 与 a[2] = 3：4 > 3 成立", "交换 a[1] 与 a[2]：4 和 3 互换位置", "j = 2，2 < 3，继续内层循环", "比较 a[2] = 4 与 a[3] = 1：4 > 1 成立", "交换 a[2] 与 a[3]：4 和 1 互换位置", "内层结束：j 遍历 0、1、2，最大值 4 已归位", "第 2 轮：i = 1，只需比较前 3 个元素", "j = 0，0 < 2，进入内层循环", "比较 a[0] = 2 与 a[1] = 3：2 > 3 不成立，不交换", "j = 1，1 < 2，继续内层循环", "比较 a[1] = 3 与 a[2] = 1：3 > 1 成立", "交换 a[1] 与 a[2]：3 和 1 互换位置", "内层结束：j 遍历 0、1，3 已归位", "第 3 轮：i = 2，只需比较前 2 个元素", "j = 0，0 < 1，进入内层循环", "比较 a[0] = 2 与 a[1] = 1：2 > 1 成立", "交换 a[0] 与 a[1]：2 和 1 互换位置", "内层结束：j 只取 0，2 已归位", "排序完成：1 2 3 4，全程 6 次比较、5 次交换")
card "冒泡排序：[4, 2, 3, 1] 逐行执行"
  player "播放 / 暂停 / 单步" bind=frame unit="/ 24" duration=12
  chart shape=bar labels=["a[0]", "a[1]", "a[2]", "a[3]"] values=["v0", "v1", "v2", "v3"] caption="当前数组：柱高就是元素值"
  steps items=["for i in range(n - 1):", "  for j in range(n - 1 - i):", "    if a[j] > a[j + 1]:", "      a[j], a[j + 1] = a[j + 1], a[j]"] current=line mono=true
  keys items=["i: {i}", "j: {j}", "a: {a}"]
  callout "{note}"
```

Result:

```
The card is shown: 6 component(s), 1 control(s).
What a text-only reader sees:
## 冒泡排序：[4, 2, 3, 1] 逐行执行
  播放 / 暂停 / 单步: 1 / 24 (1–24)
  a[0]: 4 · a[1]: 2 · a[2]: 3 · a[3]: 1
  1. for i in range(n - 1):
  2.   for j in range(n - 1 - i):
  3.     if a[j] > a[j + 1]:
  4.       a[j], a[j + 1] = a[j + 1], a[j]
  i: 0 · j: 0 · a: 4 2 3 1
  Note: 第 1 轮：i = 0，进入外层循环
```

6 components, 1 control, zero repairs. Played in the web UI, the run went from frame 1 to frame 24 in its twelve seconds and stopped; stepping back, scrubbing to frame 5, and switching to 2× each did what they say, and the highlighted line, the bars, and the note followed every frame without a request.

## What this tour found

**A bare `expr` value ended at the first space (fixed).** Sample 9 first read `metric "折合小时" value=mins / 60 unit="h"`, and the compiler kept `value=mins` while reporting the `/` and the `60` as stray tokens; the card showed `24 h` instead of `0.75 h`. Bare values now keep spaces inside brackets and rejoin pieces that start or follow an operator, so that line reads as written; `tests/dil.test.ts` pins it. Quoting an expression with spaces remains the documented form.

**Expressions are unevenly accepted across prop kinds (open).** `metric.value`, `progress.value`, `progress.max`, and every `chart.values` entry take an expression, and `{…}` interpolates inside `text`, `list`, and `table` cells — but an item in `keys.items` or a cell in `table.rows` is read as plain text, so a bare expression there is silently literal. The samples above therefore use literals or interpolation in those two components. The fix is to route both prop kinds through the same text-with-interpolation reader the list items already use.

## Status

Samples 1 to 24 were drawn in one live session on 2026-10-15, in the `ui_render` tool row, with the compiler reporting zero repairs except the first attempt at sample 9. Samples 25 and 26 were drawn on 2026-10-16 in the tool row and then under the reply, and survived a page reload; that run is recorded in `VERIFY.md`. Sample 27 was drawn on 2026-10-16 after the program-version reset, and played as described above.

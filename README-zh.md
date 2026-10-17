# 渐进式交互（dsh-intelligent-ui）

在 DeepSeek Harness 的对话里显示可交互的卡片。模型写一段小的界面程序，对话把它画成原生卡片；调整控件时，所有数字都在浏览器里重算，不会再调用模型。按钮会把上面的文字作为你的下一条消息发出。

[English](README.md)

| | |
|---|---|
| 版本要求 | DeepSeek Harness **>= 0.2.1-alpha.1**（低于 0.3.0） |
| 平台 | 网页版、macOS 桌面版、Windows 桌面版——同一份构建，两个桌面版加载的就是同一个网页客户端 |
| 已验证 | 网页版 0.2.1-alpha.4；macOS 和 Windows 桌面版 0.2.1-rc.2 |
| 安装 | 设置 → 插件 → 添加插件 → `https://github.com/StarsHarryZhu/dsh-intelligent-UI`（需要 `PATH` 里有 `git`），然后重启 harness 并刷新页面 |

## 27 个组件

每个组件一张卡片，由本插件按宿主的浅色主题绘制。每张卡片的程序原文见 [`docs/SAMPLES.md`](docs/SAMPLES.md)。

| 组件 | 分组 | 作用 | 截图 |
|---|---|---|---|
| `card` | 布局 | 带边框的根容器，可设标题、内边距和间距。 | <img src="assets/catalog/card.png" alt="card" width="360"> |
| `col` | 布局 | 按阅读顺序垂直堆叠。 | <img src="assets/catalog/col.png" alt="col" width="360"> |
| `row` | 布局 | 等宽并排，窄屏自动换行。 | <img src="assets/catalog/row.png" alt="row" width="360"> |
| `grid` | 布局 | 1 到 4 列的等宽网格。 | <img src="assets/catalog/grid.png" alt="grid" width="360"> |
| `title` | 文本 | 标题行，五种字号。 | <img src="assets/catalog/title.png" alt="title" width="360"> |
| `text` | 文本 | 正文句子，可用 `{…}` 插入实时数值。 | <img src="assets/catalog/text.png" alt="text" width="360"> |
| `badge` | 文本 | 状态词，五种色调。 | <img src="assets/catalog/badge.png" alt="badge" width="360"> |
| `callout` | 文本 | 强调提示：假设、注意事项或下一步。 | <img src="assets/catalog/callout.png" alt="callout" width="360"> |
| `divider` | 文本 | 细分隔线。 | <img src="assets/catalog/divider.png" alt="divider" width="360"> |
| `link` | 文本 | 引用链接，读者点击才打开。 | <img src="assets/catalog/link.png" alt="link" width="360"> |
| `image` | 文本 | 内联图片（只接受 `data:` 地址），带替代文字和说明。 | <img src="assets/catalog/image.png" alt="image" width="360"> |
| `metric` | 数据 | 头条数字，控件一动就重算。 | <img src="assets/catalog/metric.png" alt="metric" width="360"> |
| `progress` | 数据 | 占比条。 | <img src="assets/catalog/progress.png" alt="progress" width="360"> |
| `table` | 数据 | 对比表；`current=` 高亮当前行。 | <img src="assets/catalog/table.png" alt="table" width="360"> |
| `keys` | 数据 | 标签与数值对照。 | <img src="assets/catalog/keys.png" alt="keys" width="360"> |
| `list` | 数据 | 无序列表；`current=` 高亮当前项。 | <img src="assets/catalog/list.png" alt="list" width="360"> |
| `steps` | 数据 | 有序步骤；加上 `mono=true` 和 `current=` 就是高亮当前执行行的代码清单。 | <img src="assets/catalog/steps.png" alt="steps" width="360"> |
| `chart` | 数据 | 柱状图或折线图。 | <img src="assets/catalog/chart.png" alt="chart" width="360"> |
| `plot` | 数学 | 函数图像：标点、切线和积分阴影。 | <img src="assets/catalog/plot.png" alt="plot" width="360"> |
| `formula` | 数学 | 排版好的公式，后面跟实时数值。 | <img src="assets/catalog/formula.png" alt="formula" width="360"> |
| `slider` | 控件 | 绑定数值的范围滑块。 | <img src="assets/catalog/slider.png" alt="slider" width="360"> |
| `numberInput` | 控件 | 精确数字输入。 | <img src="assets/catalog/numberInput.png" alt="numberInput" width="360"> |
| `textInput` | 控件 | 单行文本输入。 | <img src="assets/catalog/textInput.png" alt="textInput" width="360"> |
| `select` | 控件 | 下拉选择。 | <img src="assets/catalog/select.png" alt="select" width="360"> |
| `checkbox` | 控件 | 开关。 | <img src="assets/catalog/checkbox.png" alt="checkbox" width="360"> |
| `button` | 动作 | 把按钮文字作为你的下一条消息发出，随后锁定卡片。 | <img src="assets/catalog/button.png" alt="button" width="360"> |
| `player` | 动画 | 固定在卡片底部的播放条：让一个数值随时间播放、暂停、单步和拖动，倍速 0.5× 到 2×；引用它的内容逐帧更新。 | <img src="assets/catalog/player.png" alt="player" width="360"> |

## 工作方式

- 插件注册一个工具 `ui_render` 和一个技能 `dsh-intelligent-ui`，技能教模型什么时候用卡片比用文字好。模型不写 HTML 或 JavaScript：它写的程序按 27 个组件的目录校验，随工具结果一起保存。
- 回复生成时，卡片显示在工具行里；回复结束后，卡片显示在回复下方。调整控件时，所有数字都在本地重算。
- `player` 让卡片动起来：逐行演示代码执行、算法的每一轮、点沿曲线移动。播放在浏览器里进行，不会发消息给模型。
- 卡片能算定积分（含无穷积分限）、导数、极限、求和与连乘、方程求根和泰勒多项式。算不准的值显示“—”，不会给出猜测的数。
- 卸载后，所有会话照常打开，之前的调用显示为普通工具行。

## 开发

```sh
node scripts/link-dev.mjs   # 从同级 harness checkout 链接工具链
node build.js               # 类型检查、构建并自检 bundle
node node_modules/vitest/vitest.mjs run
```

目录规则见 `AGENTS.md`，线上验证清单见 `docs/VERIFY.md`。

## 许可证

[MIT License](LICENSE) © 2026 Starfield。

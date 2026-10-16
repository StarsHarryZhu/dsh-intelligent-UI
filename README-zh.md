# dsh-intelligent-ui

在 DeepSeek Harness 的对话里显示可交互的卡片。模型写一段小小的界面程序，对话把它画成原生卡片：滑块、输入框、下拉选择、指标、表格、图表、进度条和作答按钮。拖动任何控件，数字都在你的浏览器里即时重算，不会再调用模型。

[English](README.md)

## 功能

- 注册一个工具 `ui_render`。模型把程序放在 `source` 里；插件按固定的组件目录校验它，并把编译后的程序随工具结果一起保存。
- 回复生成期间，卡片显示在工具行里（程序流式写入时有实时预览）；回合结束后，卡片显示在回复下方。
- 调整控件时所有数字在本地重算；只有点击按钮时才会把按钮上的文字作为你的下一条消息发出。
- 沿用宿主的主题、字体和语言，浅色、深色模式都适配。
- 从不执行模型写的代码：程序只是数据，只由插件自己的组件绘制。

程序示例：

```
@state seats = 8 min=1 max=50
@calc monthly = seats * 29
card "团队套餐"
  slider "席位" bind=seats
  metric "每月费用" value=monthly unit=USD
  text "{seats} 个席位每月 {monthly} USD。"
```

## 安装

用插件管理器（设置 → 插件 → 从本地文件夹安装）把它装进一个 profile，或者让 DSH 智能体调用 `plugin_manager` 的 `install_bundle`。安装或重新构建后请重启 harness 并刷新页面。

然后提一个用卡片比文字更好回答的问题，例如：「按每席位 29 美元，算一下团队套餐每月多少钱，给我一个可以调席位数的滑块。」

## 卸载

在 设置 → 插件 里停用或移除这个 bundle。所有会话照常打开，之前的调用会显示为普通工具行。插件不新增任何会话事件类型。

## 兼容性

| 项目 | 状态 |
|---|---|
| Harness | DeepSeek Harness `0.2.x` 网页版 |
| Node | `^22.19.0 || >=24.0.0` |
| 平台 | 全平台（无原生代码、无网络访问） |

## 开发

```sh
node scripts/link-dev.mjs   # 从同级 harness checkout 链接工具链
node build.js               # 类型检查、构建并自检 bundle
node node_modules/vitest/vitest.mjs run
```

目录规则见 `AGENTS.md`，线上验证清单见 `docs/VERIFY.md`。

## 许可证

[MIT License](LICENSE) © 2026 Starfield.

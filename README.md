# dsh-pomodoro-dock 🍅

DSH 右侧栏的**番茄闹钟**：专注/休息循环计时，**计时在宿主侧**，切 tab、关面板都不中断。

> 这是给 [DSH（DeepSeek Harness）](https://github.com/deepseek-ai/deepseek-harness) 右侧栏做的一排日常插件之一。
> 右侧栏本来就是 DSH 的「apps 入口」—— 官方的文件/终端/浏览器和第三方插件走的是**完全同一套机制**。

## 效果

![面板](https://cdn.jsdelivr.net/gh/lemonhall/dsh-pomodoro-dock@main/docs/screenshot-panel.png)

（截图只裁了右侧栏面板。想换订阅源/分类/时长这些，改配置就行，不用碰代码。）

## 它能干什么

- **只存 `endsAt`（结束时刻），不跑定时器** —— 剩余时间 = endsAt − now，谁都能算
- 所以切 tab、关掉侧栏、甚至重启应用，剩余时间都是对的
- 25/5 分钟默认，第 4 个专注后自动转长休息（15 分钟），可配置
- 圆环倒计时 + 本轮四点进度 + 今日完成数 + 最近几条记录
- `pomodoro_panel` 工具：`status` / `start` / `pause` / `resume` / `skip` / `reset` / `config`

## 装

```
plugin_manager  install_bundle  target=link:E:\development\dsh-pomodoro-dock
```

或从 npm：

```
dsh plugin --profile <你的 profile> add dsh-pomodoro-dock
```

装好之后：右侧栏点「**+**」→ 选「**番茄闹钟**」。

⚠️ **客户端半边改动要重启一次应用**；宿主半边热生效 —— 但**新增宿主路由要重启**（实测，别指望热重载）。

## 它是怎么work的

```
lib/index.js    宿主半：路由 + pomodoro_panel 工具（Agent 侧读写同一份状态）
lib/state.js    本地状态（原子写：临时文件 + rename，读的人不会撞上写了一半的文件）
lib/client.js   右侧栏 tab（整个模块包在 IIFE 里 —— DSH 把所有客户端插件拼成一个脚本，
                顶层 const 会跨插件撞名，实测撞过一次直接把应用挡在启动之外）
```

**双向通道**：状态存在宿主，客户端 2 秒轮询。所以**你在面板里点一下，Agent 调工具就能读到**；
**Agent 写一次，面板自己会跟着变**。这不是"一个只读的看板"。

## 已知限制

- **不弹系统通知**（DSH 里没有这个口子），到点靠面板上看
- 不做任务关联（不统计"这件事花了几个番茄"）
- 计时精度取决于读取时刻，不是高精度计时器

## License

MIT

# 番茄钟的关键居然是别用定时器

🍅 **番茄闹钟** —— DSH 右侧栏的一个新 tab。

## 为什么做这个

我在 DSH 里切 tab、关侧栏、跑去干别的，然后回来 —— 计时器不能因此就废了。

## 长什么样

![番茄闹钟](https://cdn.jsdelivr.net/gh/lemonhall/dsh-pomodoro-dock@main/docs/screenshot-panel.png)

（图只截了右侧栏面板。我这台机器桌面左下角有真名，所以截图从来不整屏。）

## 它能干什么

- **只存 `endsAt`（结束时刻），不跑定时器** —— 剩余时间 = endsAt − now，谁都能算
- 所以切 tab、关掉侧栏、甚至重启应用，剩余时间都是对的
- 25/5 分钟默认，第 4 个专注后自动转长休息（15 分钟），可配置
- 圆环倒计时 + 本轮四点进度 + 今日完成数 + 最近几条记录
- `pomodoro_panel` 工具：`status` / `start` / `pause` / `resume` / `skip` / `reset` / `config`

## 一个值得说的设计决定

**只存 `endsAt`（结束时刻），不跑定时器。** 剩余时间 = endsAt − now，谁都能随时算。于是切 tab、关面板、刷新页面、甚至重启应用，剩余时间都是对的；宿主也不用养一个可能被挂起的 interval。暂停时把剩余毫秒存进 `remainingMs`，恢复时换算成新的 endsAt —— 整个状态机就三个字段。

## 双向的，不只看

这是这批插件的共同点：**状态在宿主、界面 2 秒轮询**。所以我在面板里点一下，Agent 调工具就能读到；Agent 写一次（比如「帮我记一笔午饭 12.5」），面板自己就变了。

装：

```
# 先装 DSH（桌面版从 https://harness.deepseek.com 下载安装包；只要 CLI 的话）：
npm i -g @deepseek-ai/dsh

# 再装这个插件（桌面版也可以走 GUI：右侧栏「插件 → 添加插件」）
dsh plugin --profile desktop add dsh-pomodoro-dock

# 如果你是开发者、想用本地目录直接挂：
plugin_manager install_bundle target=link:E:\development\dsh-pomodoro-dock
```

代码在 <https://github.com/lemonhall/dsh-pomodoro-dock>，npm 上是 `dsh-pomodoro-dock`。右侧栏点「**+**」→ 选「番茄闹钟」就能看到它。

## 已知限制

- **不弹系统通知**（DSH 里没有这个口子），到点靠面板上看
- 不做任务关联（不统计"这件事花了几个番茄"）
- 计时精度取决于读取时刻，不是高精度计时器

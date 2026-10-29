# 学堂在线自动播放助手

> 一个用于 [学堂在线](https://www.xuetangx.com/) 课程视频的 Tampermonkey 油猴脚本，提供自动播放、自动切换下一集、自定义倍速等功能。

## 功能特性

- **自动播放** — 视频暂停时自动恢复播放，支持浏览器后台/最小化运行
- **自动切换下一集** — 视频播放结束后自动跳转下一个视频，中间的作业题自动跳过
- **跳过已完成视频** — 初始化时自动定位到第一个未完成的视频，切换时也自动跳过已完成的
- **自定义倍速** — 突破原站 2x 上限，支持 0.5x ~ 16x 任意倍速
- **视频筛选** — 自动将章节列表切换为"仅视频"模式，过滤作业/考试
- **防后台暂停** — Web Audio API 保活 + 页面可见性监听，浏览器最小化也能持续运行
- **快捷键支持** — 键盘快捷调节倍速、暂停/播放、手动切换下一集
- **设置持久化** — 倍速、开关等配置自动保存，刷新不丢失

## 安装

### 1. 安装 Tampermonkey

在浏览器扩展商店安装 [Tampermonkey](https://www.tampermonkey.net/)（油猴）：

| 浏览器  | 安装地址                                                                                                       |
| ------- | -------------------------------------------------------------------------------------------------------------- |
| Chrome  | [Chrome 网上应用店](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)   |
| Edge    | [Edge 加载项](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaodbpmlbpkfflbboenilhkhn) |
| Firefox | [Firefox 附加组件](https://addons.mozilla.org/firefox/addon/tampermonkey/)                                     |

### 2. 安装脚本

**方式一：从 GitHub 安装**

点击 [`xuetangx-autoplay.user.js`](./xuetangx-autoplay.user.js) 文件，点击右上角 **Raw** 按钮，Tampermonkey 会自动识别并提示安装。

**方式二：手动安装**

1. 点击浏览器工具栏的 Tampermonkey 图标
2. 选择「添加新脚本」
3. 删除默认模板内容
4. 将 [`xuetangx-autoplay.user.js`](./xuetangx-autoplay.user.js) 的全部内容粘贴进去
5. 按 `Ctrl + S` 保存

### 3. 使用

1. 打开学堂在线任意课程的视频学习页面
2. 脚本自动运行，页面右上角出现悬浮控制面板
3. 视频自动开始播放（首次可能需要点击一次播放按钮，取决于浏览器自动播放策略）

## 控制面板

页面右上角的悬浮面板可拖拽移动，支持折叠：

```
┌─────────────────────────┐
│   学堂在线助手          -│
├─────────────────────────┤
│ 倍速          [ 2x  ▼]  │
│ 自定义倍速    [  2.0 ]  │
│ ☑ 自动播放              │
│ ☑ 自动下一集            │
│ ☑ 跳过已完成            │
├─────────────────────────┤
│ 快捷键说明:             │
│ ←/→ 倍速 -0.5/+0.5      │
│ 空格 暂停/播放           │
│ N 下一集                │
└─────────────────────────┘
```

## 快捷键

| 快捷键 | 功能           |
| ------ | -------------- |
| `←`    | 倍速 -0.5      |
| `→`    | 倍速 +0.5      |
| `空格` | 暂停 / 播放    |
| `N`    | 手动切换下一集 |

## 配置说明

所有配置通过 `GM_setValue` / `GM_getValue` 持久化存储，刷新页面后保持不变。

| 配置项              | 默认值 | 说明               |
| ------------------- | ------ | ------------------ |
| `xtx_speed`         | `2`    | 默认倍速           |
| `xtx_autoplay`      | `true` | 自动播放开关       |
| `xtx_autonext`      | `true` | 自动切换下一集开关 |
| `xtx_skipcompleted` | `true` | 跳过已完成视频开关 |

## 匹配规则

```text
@match https://www.xuetangx.com/learn/*
@match https://next.xuetangx.com/learn/*
```

## 已知限制

- 倍速过高（>4x）时视频缓冲可能跟不上，建议根据网络情况合理设置
- 浏览器严格节能模式下后台标签页可能仍受限制
- 学堂在线前端结构变更可能导致脚本失效，需更新选择器
- 页面提示"快进拖拽不计观看进度"——倍速播放正常计进度，手动拖拽进度条不计

## 兼容性

- 浏览器：Chrome / Edge / Firefox（需支持 Tampermonkey）
- 站点：`www.xuetangx.com` / `next.xuetangx.com`
- 播放器：学堂在线自研 xtVideo 播放器（基于 HTML5 `<video>` 标签）

## 免责声明

本脚本仅供学习交流使用。使用本脚本造成的任何后果由使用者自行承担。请遵守学堂在线平台的相关规定，合理使用自动化工具。

## License

MIT

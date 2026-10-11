# futurevideo

一个界面简洁、动效流畅的桌面视频播放器。

- 全称：**futurevideo**
- 简称：**fuvideo**

## 简介

fuvideo 把「简洁」和「动效」放在同等重要的位置：播放界面默认几乎隐形，只在需要时优雅浮现。播放内核基于 mpv/ffmpeg，因此对视频格式的兼容性接近本地播放器，而不是浏览器播放器。

## 基本功能

- **打开即播**：拖拽视频到窗口任意位置，或通过文件选择器打开；自动记住上次播放位置，重开续播
- **播放控制**：播放/暂停、快进快退、倍速调节、音量与静音、全屏、画中画
- **进度条交互**：悬停变粗、时间气泡跟随光标、拖拽定位、缓冲进度独立显示
- **键盘操作**：空格播放暂停，方向键快进与音量，J/K/L 控制，F 全屏，M 静音
- **自动隐藏**：鼠标静止后控制层淡出，任何操作立即唤回
- **字幕支持**：加载 srt / vtt 字幕，可调字号与位置
- **播放列表**：拖入多个文件自动生成列表，右侧抽屉展示，切换有过渡
- **多主题**：内置深色、灰阶、浅色三套主题，支持跟随系统明暗
- **格式兼容**：支持 mp4、mkv、mov、avi、webm 等常见容器，以及 HEVC、AV1 等编码，支持硬件解码

## 技术栈

| 层 | 选型 |
| --- | --- |
| 应用外壳 | Tauri 2 |
| 界面 | React + TypeScript + Vite |
| 动效 | Motion |
| 播放内核 | mpv（ffmpeg） |

## 状态

早期开发阶段，正在搭建 MVP。

## 运行与打包

### 前提

播放依赖 **mpv**，需要单独安装（安装包不包含它）：

```
winget install --id shinchiro.mpv -e
```

应用会依次在 PATH、`C:\Program Files\MPV Player\mpv.exe`、`C:\Program Files\mpv\mpv.exe`
等常见位置查找，也可以用环境变量 `FUVIDEO_MPV_PATH` 直接指定。
另外需要 Windows 10/11 自带的 WebView2 运行时。

### 开发

```
npm install
npm run tauri dev
```

### 打包

```
npm run tauri build
```

产物在 `src-tauri/target/release/` 下：`fuvideo.exe` 是主程序，
`bundle/msi/` 与 `bundle/nsis/` 分别是 MSI 与 NSIS 安装包。

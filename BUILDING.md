# 从源码构建

面向开发者。只想安装使用的话看 [README](README.md) 就够了。

## 前提

- Node.js 20 以上
- Rust 工具链（stable-msvc）与 Visual Studio 的 C++ 生成工具
- Windows 10/11 自带的 WebView2 运行时

播放依赖 **mpv**，发布版安装包已经内置，但从源码构建要自己准备一份：
把 `mpv.exe` 和 `d3dcompiler_43.dll` 放到 `src-tauri/binaries/mpv/`。
该目录体积过大（约 119MB）不进仓库，所以它是 `.gitignore` 的。用 winget 装一份再拷过去即可：

```
winget install --id shinchiro.mpv -e
```

运行时的查找顺序是：安装包自带的 > 环境变量 `FUVIDEO_MPV_PATH` > PATH >
`C:\Program Files\MPV Player\mpv.exe` 等常见位置。开发时想指定自己那份 mpv，
设 `FUVIDEO_MPV_PATH` 就行。

## 开发

```
npm install
npm run tauri dev
```

## 验证

```
npm run typecheck   # 类型检查
npm run lint        # 静态检查
npm run test:run    # 前端单测（Vitest）
npm run test:e2e    # 端到端（Playwright，首次需要 npx playwright install chromium）
cd src-tauri && cargo test   # Rust 单测，含真实启动 mpv 的集成用例
```

## 打包

```
npm run tauri build
```

产物在 `src-tauri/target/release/` 下：`fuvideo.exe` 是主程序，
`bundle/nsis/` 是 NSIS 安装包。

注意 MSI 目标不接受非数字的预发布版本号（Windows Installer 的限制），
所以版本号带 `-Alpha` 这类后缀时只能打 NSIS：

```
npm run tauri build -- --bundles nsis
```

## 技术栈

| 层 | 选型 |
| --- | --- |
| 应用外壳 | Tauri 2 |
| 界面 | React + TypeScript + Vite |
| 动效 | Web Animations API + CSS |
| 播放内核 | mpv（通过命名管道 IPC 控制，`--wid` 把画面嵌进主窗口） |

界面是 HTML 叠加层，视频由 mpv 作为子进程渲染到窗口底层，控制层透明浮在上面。
缩略图和画面预览由另一个无界面的 mpv 进程按需抓帧。
